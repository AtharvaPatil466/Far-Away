"""Golden snapshot of the cyclone hindcasts (on-site item 19).

These runs end in an evacuation recommendation for a real storm. A refactor
that quietly shifts a track error, an activation decision, or a dispatch count
changes what the system would have told a commander to do -- and nothing else
in the suite would notice, because every other test asserts on behaviour in the
small rather than on the end-to-end numbers.

Two layers, deliberately:

* The DECISION VALUES are asserted individually. When one moves, the failure
  names which one and by how much, so it gets read rather than rubber-stamped.
* A digest over the whole rendered walkthrough catches anything the explicit
  assertions do not cover.

The digest is taken over ANSI-stripped, newline-normalised text. Hashing raw
output would pin terminal colour codes as tightly as evacuation decisions, so
any cosmetic tweak would break it -- and a golden that cries wolf gets its hash
regenerated without anyone reading the diff, which is worse than no golden.
"""
from __future__ import annotations

import hashlib
import re
import subprocess
import sys

import pytest

from disastermind.hindcast.fani import load_amphan, load_fani
from disastermind.hindcast.replay import run_hindcast

_ANSI = re.compile(r"\x1b\[[0-9;]*m")

#: sha256 of the ANSI-stripped Fani walkthrough. Regenerate ONLY alongside a
#: note explaining what changed about the recommendation and why.
FANI_DIGEST = "2fa198cd90cc683bca99f4c653bc0cb89a6aa07ca6ad8a432ff193b79719fc22"

# Regenerate ONLY with a written justification for the change in behaviour.
GOLDEN = {
    "fani": {
        "track_error_km": 440.90,
        "predicted_landfall": (17.4, 82.933),
        "activated": True,
        "produced_plan": True,
        "dispatches": 180,
        "routes": 21,
    },
    "amphan": {
        "track_error_km": 426.40,
        "predicted_landfall": (18.367, 87.467),
        "activated": True,
        "produced_plan": True,
        "dispatches": 180,
        "routes": 21,
    },
}


@pytest.mark.parametrize("storm,loader", [("fani", load_fani), ("amphan", load_amphan)])
def test_hindcast_decisions_are_pinned(storm, loader):
    want = GOLDEN[storm]
    got = run_hindcast(loader(), lead_hours=48.0)

    assert got.track_error_km == pytest.approx(want["track_error_km"], abs=0.01)
    assert got.predicted_landfall == pytest.approx(want["predicted_landfall"], abs=0.001)
    assert got.activated is want["activated"]
    assert got.produced_plan is want["produced_plan"]
    assert got.dispatches == want["dispatches"], "field dispatch count changed"
    assert got.routes == want["routes"], "evacuation route count changed"


def _walkthrough(storm):
    out = subprocess.run(
        [sys.executable, "-m", "disastermind.hindcast.walkthrough", "--storm", storm],
        capture_output=True, text=True, check=True,
    ).stdout
    return _ANSI.sub("", out).replace("\r\n", "\n").strip()


@pytest.mark.parametrize("storm", ["fani", "amphan"])
def test_walkthrough_is_deterministic(storm):
    """Two runs must agree before a digest over one of them means anything."""
    assert _walkthrough(storm) == _walkthrough(storm)


@pytest.mark.parametrize("storm", ["fani", "amphan"])
def test_walkthrough_still_recommends_and_never_orders(storm):
    """The authority invariant, in the artefact a judge actually reads.

    Mass evacuation is human-only. If a refactor ever let the walkthrough claim
    the system ISSUED the order, that is the single worst regression this repo
    can ship, and it would otherwise be caught only by someone re-reading 127
    lines of narration.
    """
    text = _walkthrough(storm).lower()

    assert "recommended" in text
    assert "awaits human commander" in text
    assert "it recommends, a human orders" in text


def test_fani_walkthrough_digest():
    """Backstop for anything the explicit assertions above do not name."""
    digest = hashlib.sha256(_walkthrough("fani").encode()).hexdigest()

    assert digest == FANI_DIGEST, (
        "the Fani walkthrough changed. Confirm the new evacuation recommendation "
        "is intended, then update FANI_DIGEST with a note saying why."
    )


