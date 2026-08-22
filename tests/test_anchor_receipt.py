"""Cached external-anchor receipts (on-site items 2 and 13).

The hash chain proves nobody edited the journal. It cannot prove WHEN the chain
existed -- a whole-file rewrite recomputes every hash -- so the season needs a
third party attesting to a chain head at a moment. That third party is GitHub
Actions, and the attestation is cached on disk.

Everything here is offline by construction. A demo on conference wifi must never
show a red integrity badge because an API call timed out: an unreachable network
says nothing about whether the anchor exists.
"""
from __future__ import annotations

from disastermind.ml.anchor import (
    ANCHOR_STALE_AFTER_HOURS,
    anchor_status,
    read_receipt,
    write_receipt,
)

NOW = "2026-08-22T12:00:00+00:00"
RECENT = "2026-08-22T06:00:00+00:00"
ANCIENT = "2026-06-14T06:00:00+00:00"
HEAD = "a" * 64
OTHER = "b" * 64


def _receipt(tmp_path, *, server_time=RECENT, chain_head=HEAD):
    path = str(tmp_path / "anchor.json")
    write_receipt(path, run_id="123", url="https://example/runs/123",
                  server_time=server_time, chain_head=chain_head)
    return path


def test_absent_receipt_is_a_state_not_an_error(tmp_path):
    status = anchor_status(HEAD, path=str(tmp_path / "nope.json"), now=NOW)

    assert status["state"] == "absent"
    assert status["receipt"] is None


def test_fresh_matching_receipt_verifies(tmp_path):
    status = anchor_status(HEAD, path=_receipt(tmp_path), now=NOW)

    assert status["state"] == "verified"
    assert status["head_matches"] is True
    assert status["run_id"] == "123"


def test_old_receipt_is_stale(tmp_path):
    status = anchor_status(HEAD, path=_receipt(tmp_path, server_time=ANCIENT), now=NOW)

    assert status["state"] == "stale"


def test_grown_journal_is_drifted_not_broken(tmp_path):
    """The normal state between runs: new entries, not yet anchored.

    Reporting this as a failure would show red on almost every live demo, since
    the worker anchors daily and the journal moves in between.
    """
    status = anchor_status(OTHER, path=_receipt(tmp_path), now=NOW)

    assert status["state"] == "drifted"
    assert status["head_matches"] is False


def test_corrupt_receipt_reads_as_absent(tmp_path):
    """A truncated file must not take down the dashboard."""
    path = tmp_path / "anchor.json"
    path.write_text('{"run_id": "123", "url": ')

    assert read_receipt(str(path)) is None
    assert anchor_status(HEAD, path=str(path), now=NOW)["state"] == "absent"


def test_incomplete_receipt_reads_as_absent(tmp_path):
    """Half a receipt attests to nothing; fail closed rather than half-claim."""
    path = tmp_path / "anchor.json"
    path.write_text('{"run_id": "123"}')

    assert read_receipt(str(path)) is None


def test_round_trip(tmp_path):
    path = _receipt(tmp_path)
    got = read_receipt(path)

    assert got["chain_head"] == HEAD
    assert got["server_time"] == RECENT


def test_threshold_is_declared_once(tmp_path):
    status = anchor_status(HEAD, path=_receipt(tmp_path), now=NOW)

    assert status["stale_after_hours"] == ANCHOR_STALE_AFTER_HOURS


def test_missing_anchor_does_not_fail_the_integrity_check(tmp_path):
    """Anchor state must NOT gate the exit code.

    Chain integrity and external attestation are separate claims. An unanchored
    season is less well evidenced; it is not corrupt. Wiring the anchor into the
    exit status would let a missed cron -- or offline wifi -- report the journal
    as tampered.
    """
    import subprocess
    import sys

    from disastermind.ml.shadow import ShadowJournal

    journal = str(tmp_path / "s.jsonl")
    ShadowJournal(journal).record_heartbeat()

    proc = subprocess.run(
        [sys.executable, "-m", "disastermind.ml.shadow_season", "--journal", journal,
         "verify", "--anchor-receipt", str(tmp_path / "absent.json")],
        capture_output=True, text=True,
    )

    assert proc.returncode == 0, "a missing anchor must not report the chain as broken"
    assert '"state": "absent"' in proc.stdout
