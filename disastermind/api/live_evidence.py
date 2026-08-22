"""Read-only adapter from the real USGS shadow journal to the dashboard.

This module deliberately does not fetch USGS or create predictions.  The scheduled
shadow-season worker owns those concerns; this adapter only exposes the append-only
journal, its existing scorecard, and enough raw material for an independent client
to recompute every SHA-256 link.
"""
from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from ..live.usgs_shadow import DEFAULT_FEED
from ..ml.shadow import ShadowJournal, score_season

_PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SHADOW_JOURNAL = _PROJECT_ROOT / "shadow" / "usgs_season.jsonl"
SHADOW_GENESIS = "shadow-genesis"


def _iso_utc(timestamp: float) -> str:
    return datetime.fromtimestamp(timestamp, tz=UTC).isoformat()


def build_live_evidence_snapshot(path: Path = DEFAULT_SHADOW_JOURNAL) -> dict[str, Any]:
    """Return the complete real shadow snapshot, or raise if none exists.

    Returning the raw ordered records is intentional: the browser can verify the
    same canonical payload chain as :class:`ShadowJournal` instead of trusting a
    decorative backend boolean.  No fixture/demo substitution occurs here.
    """
    if not path.is_file():
        raise FileNotFoundError(f"shadow journal not found: {path.name}")

    journal = ShadowJournal(str(path))
    records = journal.records()
    chain_verified = journal.verify_chain()
    predictions = [record for record in records if record.kind == "prediction"]
    outcomes = [record for record in records if record.kind == "outcome"]

    issued = [
        str(record.payload.get("issued_at"))
        for record in predictions
        if record.payload.get("issued_at")
    ]
    observed = [
        str(record.payload.get("observed_at"))
        for record in outcomes
        if record.payload.get("observed_at")
    ]

    scorecard: dict[str, Any] | None = None
    if chain_verified:
        scorecard = score_season(journal)

    raw_records: list[dict[str, Any]] = []
    previous_hash = SHADOW_GENESIS
    for record in records:
        raw_records.append(
            {
                "kind": record.kind,
                "payload": record.payload,
                "canonical_payload": json.dumps(
                    record.payload, sort_keys=True, separators=(",", ":")
                ),
                "hash": record.hash,
                "previous_hash": previous_hash,
            }
        )
        previous_hash = record.hash

    return {
        "schema_version": 1,
        "served_at": datetime.now(tz=UTC).isoformat(),
        "journal_file_modified_at": _iso_utc(path.stat().st_mtime),
        "journal_last_activity_at": max(issued + observed) if issued or observed else None,
        "classification": "LIVE",
        "source": {
            "name": "USGS Earthquake Hazards Program",
            "feed": DEFAULT_FEED,
            "journal": "shadow/usgs_season.jsonl",
            "model_input": "USGS M4.5+ live GeoJSON",
        },
        "timestamp_basis": (
            "Prediction issued_at is the USGS event timestamp captured by the shadow worker; "
            "this journal does not retain a separate append wall-clock timestamp."
        ),
        "signals_ingested": None,
        "chain_verified": chain_verified,
        "genesis": SHADOW_GENESIS,
        "counts": {
            "records": len(records),
            "predictions": len(predictions),
            "outcomes": len(outcomes),
            "unresolved": scorecard.get("n_unresolved") if scorecard else None,
            "settled": scorecard.get("n_resolved") if scorecard else None,
        },
        "scorecard": scorecard,
        "records": raw_records,
    }
