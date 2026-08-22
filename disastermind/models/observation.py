"""Append-only observation store — what sources actually said, kept forever.

The store never mutates and never deletes. A retraction is a new observation
saying "withdrawn", not an erasure; a correction is a new observation, not an
edit. Canonical incident state is DERIVED from the set by
:mod:`disastermind.models.reconcile` and can always be rebuilt from scratch,
which is what makes the audit trail meaningful: the history is the data, not a
log written alongside it.

Two timestamps, never conflated:

* ``observed_at`` -- when the SOURCE says the world was that way.
* ``received_at`` -- when the message reached us.

Selection uses only ``observed_at``, so a slow network cannot rewrite history
and arrival order cannot change the answer. ``received_at`` is kept because the
gap between the two is exactly what makes a late correction visible.

Stdlib only, deterministic, no clock reads inside the store itself.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from typing import Any

from .reconcile_policy import (
    DUPLICATE_DISTANCE_DEG,
    DUPLICATE_MAGNITUDE_DELTA,
    DUPLICATE_TIME_WINDOW_S,
    RETRACTION_KEY,
)

#: Fields compared when deciding whether two reports describe one event.
_MATCH_FIELDS = ("lat", "lon", "magnitude")


def content_hash(source: str, source_event_id: str, observed_at: str,
                 payload: dict[str, Any]) -> str:
    """Stable identity of an observation's CONTENT.

    Excludes ``received_at`` deliberately: the same report arriving twice is the
    same report, whenever it turns up. This is what makes replay idempotent.
    """
    body = json.dumps(
        {"source": source, "source_event_id": source_event_id,
         "observed_at": observed_at, "payload": payload},
        sort_keys=True, separators=(",", ":"),
    )
    return hashlib.sha256(body.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class Observation:
    """One immutable report from one source at one time."""

    source: str
    source_event_id: str
    observed_at: str
    received_at: str
    payload: dict[str, Any] = field(default_factory=dict)
    obs_id: str = ""

    @property
    def content_hash(self) -> str:
        return content_hash(self.source, self.source_event_id,
                            self.observed_at, self.payload)

    @property
    def is_retraction(self) -> bool:
        """A withdrawal of a prior report — existential, not a value change."""
        return bool(self.payload.get(RETRACTION_KEY))

    def retracted_fields(self) -> tuple[str, ...]:
        """Which fields this observation withdraws.

        ``{"retracted": true}`` withdraws the source's whole prior report;
        ``{"retracted": ["magnitude"]}`` withdraws only the named fields. A
        withdrawal removes the value from canonical state rather than reverting
        it -- "we no longer stand behind this" is not "the old number is back".
        """
        marker = self.payload.get(RETRACTION_KEY)
        if marker is True:
            return tuple(k for k in self.payload if k != RETRACTION_KEY)
        if isinstance(marker, (list, tuple)):
            return tuple(str(f) for f in marker)
        return ()

    @property
    def is_late(self) -> bool:
        """Observed before it was received by more than the duplicate window.

        Every observation is 'late' in the trivial sense; this flags the ones
        late enough to be a correction arriving after the fact.
        """
        return _seconds_between(self.observed_at, self.received_at) > DUPLICATE_TIME_WINDOW_S

    def to_dict(self) -> dict[str, Any]:
        return {
            "obs_id": self.obs_id,
            "source": self.source,
            "source_event_id": self.source_event_id,
            "observed_at": self.observed_at,
            "received_at": self.received_at,
            "payload": dict(self.payload),
            "content_hash": self.content_hash,
            "is_retraction": self.is_retraction,
            "is_late": self.is_late,
        }


def _seconds_between(a: str, b: str) -> float:
    from datetime import datetime
    try:
        return abs((datetime.fromisoformat(b) - datetime.fromisoformat(a)).total_seconds())
    except (TypeError, ValueError):
        return 0.0


def is_duplicate(a: Observation, b: Observation) -> tuple[bool, str]:
    """Do ``a`` and ``b`` describe the same event? Returns (verdict, reason).

    Exact identity first (same source + source_event_id, or identical content),
    then spatiotemporal proximity inside the configured tolerances -- which is
    how two AGENCIES reporting one earthquake are recognised as one event
    despite never sharing an id.
    """
    if a.content_hash == b.content_hash:
        return True, "identical content hash — same report replayed"
    if a.source == b.source and a.source_event_id == b.source_event_id:
        return True, f"same source_event_id ({a.source}:{a.source_event_id})"

    gap_s = _seconds_between(a.observed_at, b.observed_at)
    if gap_s > DUPLICATE_TIME_WINDOW_S:
        return False, f"observed {gap_s:.0f}s apart (> {DUPLICATE_TIME_WINDOW_S:.0f}s)"

    for axis in ("lat", "lon"):
        av, bv = a.payload.get(axis), b.payload.get(axis)
        if av is None or bv is None:
            continue
        if abs(float(av) - float(bv)) > DUPLICATE_DISTANCE_DEG:
            return False, f"{axis} differs by more than {DUPLICATE_DISTANCE_DEG} deg"

    am, bm = a.payload.get("magnitude"), b.payload.get("magnitude")
    if am is not None and bm is not None:
        if abs(float(am) - float(bm)) > DUPLICATE_MAGNITUDE_DELTA:
            return False, f"magnitude differs by more than {DUPLICATE_MAGNITUDE_DELTA}"

    return True, (
        f"spatiotemporal match: within {DUPLICATE_TIME_WINDOW_S:.0f}s, "
        f"{DUPLICATE_DISTANCE_DEG} deg, {DUPLICATE_MAGNITUDE_DELTA} magnitude"
    )


class ObservationStore:
    """Append-only set of observations for one incident.

    :meth:`append` is idempotent on content hash, so re-ingesting a feed cannot
    manufacture history. Nothing here derives canonical state -- that is
    :mod:`reconcile`'s job, and keeping them apart is what lets canonical state
    be rebuilt from the store at any time.
    """

    def __init__(self, incident_id: str) -> None:
        self.incident_id = incident_id
        self._observations: list[Observation] = []
        self._hashes: set[str] = set()

    def __len__(self) -> int:
        return len(self._observations)

    def append(self, obs: Observation) -> tuple[Observation | None, str]:
        """Store ``obs``. Returns (stored_or_None, reason).

        Returns ``(None, reason)`` when the observation is an exact replay --
        the caller can then record 'no revision' honestly rather than silently
        doing nothing.
        """
        if obs.content_hash in self._hashes:
            return None, "duplicate: identical content already stored"
        stored = Observation(
            source=obs.source,
            source_event_id=obs.source_event_id,
            observed_at=obs.observed_at,
            received_at=obs.received_at,
            payload=dict(obs.payload),
            obs_id=obs.obs_id or f"obs-{len(self._observations) + 1:03d}",
        )
        self._observations.append(stored)
        self._hashes.add(stored.content_hash)
        return stored, "stored"

    def all(self) -> list[Observation]:
        """Every observation, in arrival order. Never filtered."""
        return list(self._observations)

    def by_id(self, obs_id: str) -> Observation | None:
        return next((o for o in self._observations if o.obs_id == obs_id), None)

    def reporting(self, field_name: str) -> list[Observation]:
        """Observations carrying ``field_name`` (retractions included)."""
        return [
            o for o in self._observations
            if field_name in o.payload or (o.is_retraction and field_name in o.retracted_fields())
        ]

    def to_dict(self) -> dict[str, Any]:
        return {
            "incident_id": self.incident_id,
            "count": len(self._observations),
            "observations": [o.to_dict() for o in self._observations],
        }
