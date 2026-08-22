"""Feed-adapter chaos: every live source, every way it can fail (item 10).

``test_chaos.py`` proves the DAG survives a broken agent. This proves the EDGE
survives a broken feed, which is the failure that actually happens: upstream
returns 500, or an empty body, or HTML where JSON was promised, or simply never
answers.

Four faults per adapter, and three properties asserted for each:

  1. the poll does not raise -- one dead feed must never take down the node;
  2. whatever comes back is tagged ``_provenance == "sample"``, because a
     degraded feed serving its fixture is NOT live data and nothing downstream
     may treat it as such;
  3. the agent still works afterwards -- a fault degrades one poll, not the
     adapter.

Plus the property that makes the tagging worth having: on a node that believes
it is live, a chaos-degraded feed mints NO event. Without that, every one of
these faults would surface as a real detection built from fixture data.

Fully offline -- the transport seam is injected, no socket is opened.
"""
from __future__ import annotations

from types import SimpleNamespace

import pytest

from disastermind.core.bus import InMemoryBus
from disastermind.tier3.ingestion.openmeteo import OpenMeteoFeedAgent
from disastermind.tier3.ingestion.seismic import NCSFeedAgent, USGSFeedAgent
from disastermind.tier3.ingestion.wildfire import FIRMSFeedAgent, OpenWeatherMapFeedAgent


# ----------------------------------------------------------------- the faults
def transport_500(url, timeout):
    return 500, ""


def transport_empty(url, timeout):
    return 200, ""


def transport_malformed(url, timeout):
    return 200, "<!doctype html><html>upstream error page</html>"


def transport_hang(url, timeout):
    raise TimeoutError(f"no response from {url} within {timeout}s")


FAULTS = [
    pytest.param(transport_500, id="http-500"),
    pytest.param(transport_empty, id="empty-body"),
    pytest.param(transport_malformed, id="malformed-body"),
    pytest.param(transport_hang, id="hang"),
]

#: Keys are set for every adapter so a key-gated feed exercises its NETWORK
#: path here rather than short-circuiting to sample() before the fault lands.
SETTINGS = SimpleNamespace(
    firms_api_key="test-map-key",
    firms_map_key="test-map-key",
    owm_api_key="test-owm-key",
    openweathermap_api_key="test-owm-key",
)

ADAPTERS = [
    pytest.param(USGSFeedAgent, id="usgs"),
    pytest.param(OpenMeteoFeedAgent, id="open_meteo"),
    pytest.param(FIRMSFeedAgent, id="firms"),
    pytest.param(NCSFeedAgent, id="ncs"),
    pytest.param(OpenWeatherMapFeedAgent, id="owm"),
]


def _agent(cls, live=True):
    return cls(bus=InMemoryBus(), settings=SETTINGS, live=live)


@pytest.mark.parametrize("cls", ADAPTERS)
@pytest.mark.parametrize("fault", FAULTS)
def test_poll_survives_the_fault(cls, fault):
    """A broken upstream degrades the poll; it must not raise."""
    rows = _agent(cls).poll_once(live=True, transport=fault)

    assert isinstance(rows, list)


@pytest.mark.parametrize("cls", ADAPTERS)
@pytest.mark.parametrize("fault", FAULTS)
def test_degraded_rows_are_never_labelled_live(cls, fault):
    """The load-bearing assertion.

    A feed that fell back to its fixture is dark. If these rows were tagged
    "live", every fault below would render downstream as a genuine detection.
    """
    rows = _agent(cls).poll_once(live=True, transport=fault)

    assert all(r["_provenance"] == "sample" for r in rows), (
        f"{cls.feed_name} served fixture data without saying so"
    )


@pytest.mark.parametrize("cls", ADAPTERS)
@pytest.mark.parametrize("fault", FAULTS)
def test_adapter_recovers_on_the_next_poll(cls, fault):
    """A fault degrades one poll, not the adapter.

    Anything that latched a failure state would turn a transient 500 into a
    permanently dark feed.
    """
    agent = _agent(cls)
    agent.poll_once(live=True, transport=fault)

    recovered = agent.poll_once(live=False)

    assert recovered, f"{cls.feed_name} did not recover after {fault.__name__}"


@pytest.mark.parametrize("cls", ADAPTERS)
@pytest.mark.parametrize("fault", FAULTS)
def test_broken_feed_mints_no_incident_on_a_live_node(cls, fault, monkeypatch):
    """No fault may manufacture an incident out of fixture data."""
    agent = _agent(cls)
    monkeypatch.setattr(agent, "fetch", lambda transport=None: agent.sample())

    messages = agent.tick()

    for msg in messages:
        assert msg.payload["event"] is None, (
            f"{cls.feed_name} minted an incident from a dark feed"
        )
        assert msg.payload["provenance"] == "sample"


@pytest.mark.parametrize("fault", FAULTS)
def test_one_dead_feed_does_not_stop_its_siblings(fault):
    """The edge as a whole keeps reporting when a single source dies."""
    dead = _agent(USGSFeedAgent)
    healthy = _agent(OpenMeteoFeedAgent, live=False)

    dead.poll_once(live=True, transport=fault)
    rows = healthy.poll_once(live=False)

    assert rows, "a sibling feed stopped producing after a neighbour failed"
