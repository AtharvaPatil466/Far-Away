"""The console ledger snapshot (on-site item 13).

The audit footer states four independent things: how many outcomes settled, how
many are pending, whether the feed is alive, and whether the chain is intact and
externally anchored. Assembling them backend-side is deliberate -- a footer that
computes its own "verified" from whatever props it happens to hold is exactly
how a dashboard ends up disagreeing with the data underneath it.
"""
from __future__ import annotations

import json

from disastermind.ml.anchor import write_receipt
from disastermind.ml.shadow import ShadowJournal
from disastermind.ml.shadow_season import build_ledger

NOW = "2026-08-22T12:00:00+00:00"


def _season(tmp_path, n=5):
    j = ShadowJournal(str(tmp_path / "s.jsonl"), clock=lambda: NOW)
    for i in range(n):
        j.record_prediction(f"eq-{i}", hazard="earthquake", issued_at=NOW,
                            window_end=NOW, probability=0.2, threshold=0.5)
    j.attach_outcome("eq-0", occurred=False, observed_at=NOW)
    return j


def test_counters_are_reported_separately(tmp_path):
    """Settled and pending must never be collapsed into one number.

    A season with nothing settled is not a season that scored zero, and one
    figure cannot say both.
    """
    ledger = build_ledger(_season(tmp_path), anchor_receipt=str(tmp_path / "none.json"))

    assert ledger["settled"] == 1
    assert ledger["pending"] == 4
    assert ledger["predictions"] == 5


def test_unscoreable_season_says_so_and_publishes_no_metrics(tmp_path):
    ledger = build_ledger(_season(tmp_path), anchor_receipt=str(tmp_path / "none.json"))

    assert ledger["scoreable"] is False
    assert "scoring requires a season" in ledger["reason"]
    assert "auc" not in ledger


def test_missing_anchor_leaves_chain_integrity_intact(tmp_path):
    """A late anchoring job must not render as a broken chain."""
    ledger = build_ledger(_season(tmp_path), anchor_receipt=str(tmp_path / "none.json"))

    assert ledger["anchor"]["state"] == "absent"
    assert ledger["chain_intact"] is True
    assert ledger["monotonic"] is True


def test_anchor_verifies_against_the_current_head(tmp_path):
    journal = _season(tmp_path)
    receipt = str(tmp_path / "anchor.json")
    write_receipt(receipt, run_id="1", url="https://example/1",
                  server_time=NOW, chain_head=journal.chain_head())

    ledger = build_ledger(journal, anchor_receipt=receipt)

    assert ledger["anchor"]["state"] == "verified"
    assert ledger["anchor"]["head_matches"] is True


def test_shipped_snapshot_matches_the_shape_the_footer_reads(tmp_path):
    """Guards the contract between build_ledger and AuditFooter.tsx."""
    with open("clients/web/public/data/ledger.json", encoding="utf-8") as fh:
        shipped = json.load(fh)

    for key in ("settled", "pending", "predictions", "scoreable", "reason",
                "chain_intact", "monotonic", "freshness", "anchor"):
        assert key in shipped, f"AuditFooter reads {key!r}; ledger.json lacks it"
    assert shipped["freshness"]["state"] in {"stalled", "ingesting", "quiet"}
    assert shipped["anchor"]["state"] in {"verified", "stale", "drifted", "absent"}
