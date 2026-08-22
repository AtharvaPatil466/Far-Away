"""Truthfulness and transport tests for the live shadow evidence adapter."""
from __future__ import annotations

import json

import pytest

from disastermind.api.live_evidence import SHADOW_GENESIS, build_live_evidence_snapshot
from disastermind.ml.shadow import ShadowJournal


def _journal(tmp_path):
    path = tmp_path / "live.jsonl"
    journal = ShadowJournal(str(path))
    journal.record_prediction(
        "eq-live-1",
        hazard="earthquake",
        issued_at="2026-08-21T10:00:00+00:00",
        window_end="2026-08-21T10:00:00+00:00",
        probability=0.2,
        threshold=0.3,
        features={"magnitude": 4.8, "depth_km": 10.0},
        model_version="quake/v1",
    )
    return path, journal


def test_snapshot_exposes_real_ordered_chain_without_inventing_signal_count(tmp_path):
    path, journal = _journal(tmp_path)
    journal.attach_outcome(
        "eq-live-1", occurred=False, observed_at="2026-08-23T10:00:00+00:00"
    )

    snapshot = build_live_evidence_snapshot(path)

    assert snapshot["classification"] == "LIVE"
    assert snapshot["signals_ingested"] is None
    assert snapshot["counts"] == {
        "records": 2, "predictions": 1, "outcomes": 1, "unresolved": 0, "settled": 1
    }
    assert snapshot["records"][0]["previous_hash"] == SHADOW_GENESIS
    assert snapshot["records"][1]["previous_hash"] == snapshot["records"][0]["hash"]
    assert snapshot["scorecard"]["n_resolved"] == 1


def test_broken_chain_is_visible_and_never_scored(tmp_path):
    path, _ = _journal(tmp_path)
    line = json.loads(path.read_text().strip())
    line["payload"]["probability"] = 0.99
    path.write_text(json.dumps(line) + "\n")

    snapshot = build_live_evidence_snapshot(path)

    assert snapshot["chain_verified"] is False
    assert snapshot["scorecard"] is None
    assert snapshot["counts"]["settled"] is None


def test_missing_journal_is_unavailable(tmp_path):
    with pytest.raises(FileNotFoundError):
        build_live_evidence_snapshot(tmp_path / "missing.jsonl")


def test_live_evidence_route_serves_repository_journal():
    pytest.importorskip("fastapi")
    from fastapi.testclient import TestClient

    from disastermind.api.server import create_server

    client = TestClient(create_server(start_streaming=False).app)
    response = client.get("/evidence/live")
    assert response.status_code == 200
    body = response.json()
    assert body["classification"] == "LIVE"
    assert body["counts"]["predictions"] > 0
    assert client.get("/v1/evidence/live").json()["counts"] == body["counts"]
