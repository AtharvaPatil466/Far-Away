"""Shadow mode — run the model live, score it later, trust it only after.

The final validation gate is institutional, not statistical: before any model
output influences a real dispatch, it must run through at least one full season
*predicting live but acting on nothing*, and its forecasts must then be scored
against what actually happened and shown to independent reviewers. This module
is that harness:

  * :class:`ShadowJournal` — an append-only JSONL log of timestamped live
    predictions. Each record is written BEFORE the outcome exists, so the
    journal is tamper-evident by construction: a record's ``issued_at`` precedes
    its event window, and each line carries a hash chained to the previous line
    (any post-hoc edit breaks the chain).
  * :func:`attach_outcome` — append an outcome record (what actually happened)
    that references the prediction by id. Predictions are never mutated.
  * :func:`score_season` — join predictions to outcomes and emit the season
    scorecard: POD/FAR at the declared operating threshold, AUC, Brier, the
    reliability table, counts of unresolved predictions — the artefact one hands
    to an external review panel.
  * :func:`export_for_review` — the scorecard + full per-event journal in one
    JSON document for independent peer review (no cherry-picking possible: the
    export carries every prediction, including the unresolved and the wrong).

Stdlib only. The journal forces honesty mechanically: predictions are committed
before outcomes are knowable, the chain hash freezes the record order, and
scoring excludes nothing.
"""
from __future__ import annotations

import hashlib
import json
import os
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from .eval.decision import confusion_at
from .eval.metrics import brier_score, calibration_bins, expected_calibration_error, roc_auc

_GENESIS = "shadow-genesis"

#: The shadow worker runs daily (``.github/workflows/shadow-season.yml``, 06:17
#: UTC). Every freshness threshold is derived from that cadence HERE, so
#: changing the cron cannot leave the console asserting staleness against a
#: schedule nobody updated.
POLL_CADENCE_HOURS = 24
#: One missed poll is a flaky runner; two is a broken pipeline.
STALE_AFTER_HOURS = POLL_CADENCE_HOURS * 2


def _utc_now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _chain_hash(prev_hash: str, payload: dict[str, Any]) -> str:
    """SHA-256 over the previous hash + canonical payload JSON."""
    body = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(f"{prev_hash}|{body}".encode()).hexdigest()


@dataclass(frozen=True)
class ShadowRecord:
    """One journal line (a prediction or an outcome) with its chain hash."""

    kind: str  # "prediction" | "outcome"
    payload: dict[str, Any]
    hash: str


class ShadowJournal:
    """Append-only, hash-chained JSONL journal of live shadow predictions.

    ``issued_at`` (ISO timestamp) and ``window_end`` are REQUIRED on every
    prediction: a forecast must say what period it covers, and scoring will
    treat predictions whose window has not closed as unresolved rather than
    silently dropping them.
    """

    def __init__(self, path: str, *, clock: Callable[[], str] | None = None) -> None:
        self.path = path
        #: Injectable so tests are deterministic; production uses wall-clock UTC.
        self._clock = clock or _utc_now_iso
        os.makedirs(os.path.dirname(os.path.abspath(path)) or ".", exist_ok=True)

    # ------------------------------------------------------------------ writing
    def _last_hash(self) -> str:
        last = _GENESIS
        for rec in self._iter_raw():
            last = rec.get("hash", last)
        return last

    def record_prediction(
        self,
        prediction_id: str,
        *,
        hazard: str,
        issued_at: str,
        window_end: str,
        probability: float,
        threshold: float,
        features: dict[str, float] | None = None,
        model_version: str = "unversioned",
    ) -> ShadowRecord:
        """Append one live prediction (before its outcome can be known)."""
        payload = {
            "id": str(prediction_id),
            "hazard": hazard,
            "issued_at": issued_at,
            "window_end": window_end,
            "probability": float(probability),
            "threshold": float(threshold),
            "would_alert": float(probability) >= float(threshold),
            "features": features or {},
            "model_version": model_version,
        }
        return self._append("prediction", payload)

    def attach_outcome(
        self, prediction_id: str, *, occurred: bool, observed_at: str, detail: str = ""
    ) -> ShadowRecord:
        """Append the real outcome for a previously-journalled prediction."""
        payload = {
            "id": str(prediction_id),
            "occurred": bool(occurred),
            "observed_at": observed_at,
            "detail": detail,
        }
        return self._append("outcome", payload)

    def record_heartbeat(self, *, polled_at: str | None = None, detail: str = "") -> ShadowRecord:
        """Journal that the worker RAN, whether or not it found anything.

        Without this, a healthy quiet stretch -- worker polling, no qualifying
        events -- is byte-for-byte indistinguishable from a dead pipeline: both
        leave the journal unchanged. The heartbeat is what separates them, and
        it rides in the chain so it cannot be fabricated after the fact.
        """
        return self._append("heartbeat", {"polled_at": polled_at or self._clock(), "detail": detail})

    def _append(self, kind: str, payload: dict[str, Any]) -> ShadowRecord:
        # Stamped HERE and only here, so it lands on new entries and is never
        # backfilled onto existing ones. It is inside the payload, hence inside
        # the hash, hence not forgeable after the fact.
        payload = {**payload, "committed_at": self._clock()}
        h = _chain_hash(self._last_hash(), payload)
        rec = {"kind": kind, "payload": payload, "hash": h}
        with open(self.path, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(rec, sort_keys=True, separators=(",", ":")) + "\n")
        return ShadowRecord(kind=kind, payload=payload, hash=h)

    # ------------------------------------------------------------------ reading
    def _iter_raw(self) -> Iterable[dict[str, Any]]:
        if not os.path.exists(self.path):
            return
        with open(self.path, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if line:
                    yield json.loads(line)

    def verify_chain(self) -> bool:
        """True iff every line's hash matches the recomputed chain (no edits)."""
        prev = _GENESIS
        for rec in self._iter_raw():
            if rec.get("hash") != _chain_hash(prev, rec.get("payload", {})):
                return False
            prev = rec["hash"]
        return True

    def chain_head(self) -> str:
        """The current tip hash -- what an external anchor attests to."""
        return self._last_hash()

    def verify_monotonic(self) -> bool:
        """True iff ``committed_at`` never goes backwards.

        Deliberately separate from :meth:`verify_chain`: a re-hashed forgery and
        a clock that jumped are different failures with different remedies, and
        collapsing them into one red light tells an operator nothing about which
        one happened. Entries predating the field are skipped, not failed.
        """
        prev = ""
        for rec in self._iter_raw():
            stamp = rec.get("payload", {}).get("committed_at")
            if stamp is None:
                continue
            if prev and stamp < prev:
                return False
            prev = stamp
        return True

    def records(self) -> list[ShadowRecord]:
        return [
            ShadowRecord(kind=r["kind"], payload=r["payload"], hash=r["hash"])
            for r in self._iter_raw()
        ]


# ------------------------------------------------------------------------- scoring
#: A season needs BOTH a floor of settled outcomes AND at least one positive
#: before any skill metric means anything. Below either bar the undefined values
#: are indistinguishable from measured catastrophe -- ``roc_auc`` returns a 0.5
#: sentinel with no positives, and ``confusion_at`` yields POD 0.0 / FAR 1.0 --
#: so the scorecard reports WHY it cannot score instead of emitting them.
MIN_SETTLED_N = 30


def score_season(
    journal: ShadowJournal, *, min_settled_n: int = MIN_SETTLED_N
) -> dict[str, Any]:
    """Join predictions to outcomes and emit the shadow-season scorecard.

    Every prediction appears in exactly one bucket: resolved (scored) or
    unresolved (counted, listed). The scorecard refuses to exist on a corrupted
    journal — ``verify_chain`` failure raises rather than silently scoring.
    """
    if not journal.verify_chain():
        raise ValueError("shadow journal hash chain is broken — refusing to score")
    predictions: dict[str, dict[str, Any]] = {}
    outcomes: dict[str, dict[str, Any]] = {}
    for rec in journal.records():
        if rec.kind == "prediction":
            predictions[rec.payload["id"]] = rec.payload
        elif rec.kind == "outcome":
            outcomes[rec.payload["id"]] = rec.payload

    resolved = [(p, outcomes[pid]) for pid, p in predictions.items() if pid in outcomes]
    unresolved = [pid for pid in predictions if pid not in outcomes]

    scorecard: dict[str, Any] = {
        "n_predictions": len(predictions),
        "n_resolved": len(resolved),
        "n_unresolved": len(unresolved),
        "unresolved_ids": sorted(unresolved),
        "chain_verified": True,
    }
    if not resolved:
        scorecard.update({"scoreable": False, "reason": "no settled outcomes yet"})
        return scorecard

    y = [1 if o["occurred"] else 0 for _, o in resolved]
    p = [pr["probability"] for pr, _ in resolved]
    n_positive = sum(y)
    if len(resolved) < min_settled_n or n_positive == 0:
        scorecard.update(
            {
                "scoreable": False,
                "reason": (
                    f"scoring requires a season: {len(resolved)} settled "
                    f"(need {min_settled_n}), {n_positive} positive (need 1)"
                ),
                "n_positive": n_positive,
                "min_settled_n": min_settled_n,
            }
        )
        return scorecard

    # The operating threshold was declared per prediction, live; the season
    # is scored at the median declared threshold (and it is reported).
    thresholds = sorted(pr["threshold"] for pr, _ in resolved)
    threshold = thresholds[len(thresholds) // 2]
    bins = calibration_bins(y, p, n_bins=10)
    scorecard.update(
        {
            "threshold": threshold,
            "confusion": confusion_at(y, p, threshold).to_dict(),
            "auc": roc_auc(y, p),
            "brier": brier_score(y, p),
            "ece": expected_calibration_error(bins),
            "reliability": [b.to_dict() for b in bins if b.count],
            "base_rate": sum(y) / len(y),
            "n_positive": n_positive,
            "scoreable": True,
        }
    )
    return scorecard


def freshness(journal: ShadowJournal, *, now: str | None = None) -> dict[str, Any]:
    """Liveness of the season, from two INDEPENDENTLY tracked facts.

    ``last_poll_at`` (the worker ran) and ``last_commit_at`` (an entry was
    written) are different things. Conflating them is the classic dashboard lie:
    a healthy quiet stretch -- worker polling on schedule, no qualifying
    earthquakes -- produces exactly the same unchanged journal as a pipeline
    that died last week. One deserves a green light and the other a red one.

    Hence three states, never two:

    * ``stalled``   -- no poll within :data:`STALE_AFTER_HOURS`. The pipeline is
      broken. This is the only state that should show red.
    * ``ingesting`` -- polled recently AND committed recently. Events arriving.
    * ``quiet``     -- polled recently, nothing committed. Working as intended;
      the world simply did not produce a qualifying event. NOT an error.
    """
    now = now or _utc_now_iso()
    last_poll = last_commit = None
    for rec in journal._iter_raw():
        payload = rec.get("payload", {})
        stamp = payload.get("committed_at")
        if rec.get("kind") == "heartbeat":
            # A heartbeat proves the POLL, never the ingestion. Counting its own
            # commit stamp as a commit would make every quiet season report
            # "ingesting" -- the exact conflation this function exists to avoid.
            last_poll = max(last_poll or "", payload.get("polled_at", "") or stamp or "")
            continue
        if stamp:
            last_commit = max(last_commit or "", stamp)
            # A substantive commit also proves the worker ran, so older journals
            # written before heartbeats existed do not read as stalled.
            last_poll = max(last_poll or "", stamp)

    stale_before = (
        datetime.fromisoformat(now) - timedelta(hours=STALE_AFTER_HOURS)
    ).isoformat()

    if last_poll is None or last_poll < stale_before:
        state = "stalled"
    elif last_commit is not None and last_commit >= stale_before:
        state = "ingesting"
    else:
        state = "quiet"

    return {
        "state": state,
        "last_poll_at": last_poll,
        "last_commit_at": last_commit,
        "stale_after_hours": STALE_AFTER_HOURS,
        "poll_cadence_hours": POLL_CADENCE_HOURS,
    }


def export_for_review(journal: ShadowJournal) -> dict[str, Any]:
    """Scorecard + the COMPLETE journal, for independent external review.

    The export is everything: every prediction (right, wrong, unresolved), every
    outcome, every hash. A reviewer can recompute the chain and every metric
    from this single document.
    """
    return {
        "scorecard": score_season(journal),
        "journal": [
            {"kind": r.kind, "payload": r.payload, "hash": r.hash}
            for r in journal.records()
        ],
    }
