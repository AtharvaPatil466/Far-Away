"""Feed provenance: a dark feed must not masquerade as a live one.

Every ingestion adapter degrades to its committed fixture when the live source
is unavailable -- a missing API key, a 404, a timeout. The fixtures are
structurally identical to live rows, so nothing downstream could tell them
apart, and they trip the same activation thresholds real data would. An unkeyed
FIRMS adapter therefore minted a phantom fire (sample pixel: 364.5 K, "high"
confidence, Delhi) on every tick, forever, rendering as a real detection.

``poll_once`` now stamps ``_provenance`` at the single seam every adapter routes
through, and ``tick`` refuses to build an event from fixture rows on a live node.
"""
from __future__ import annotations

from disastermind.core.bus import InMemoryBus
from disastermind.core.contracts import MessageType, Priority
from disastermind.tier3.ingestion.wildfire import FIRMSFeedAgent


def _firms(live):
    return FIRMSFeedAgent(bus=InMemoryBus(), live=live)


def test_offline_poll_is_tagged_sample():
    rows = _firms(live=False).poll_once(live=False)
    assert rows and all(r["_provenance"] == "sample" for r in rows)


def test_live_poll_without_key_is_tagged_sample():
    """No MAP_KEY configured -> the adapter degrades internally and must say so."""
    rows = _firms(live=True).poll_once(live=True)
    assert rows and all(r["_provenance"] == "sample" for r in rows)


def test_live_node_on_dark_feed_mints_no_event():
    """The phantom-fire regression.

    The FIRMS fixture breaches activation. On a node that believes it is live,
    that must surface as a dark feed, never as a fire.
    """
    msgs = _firms(live=True).tick()

    assert len(msgs) == 1
    msg = msgs[0]
    assert msg.payload["event"] is None, "a fixture must not mint an incident"
    assert msg.payload["provenance"] == "sample"
    assert msg.type is MessageType.QUERY, "a dark feed must not raise an ALERT"
    assert msg.priority is Priority.INFO
    assert any("DARK" in r for r in msg.reasoning)


def test_offline_node_keeps_demonstrating_the_breach():
    """Degraded/demo mode is unaffected — the fixture still drives the walkthrough."""
    msgs = _firms(live=False).tick()

    assert len(msgs) == 1
    assert msgs[0].payload["event"] is not None
    assert msgs[0].type is MessageType.ALERT
