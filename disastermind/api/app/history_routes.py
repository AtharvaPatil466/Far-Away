"""Provenance inspection endpoints.

Thin by design: every answer is COMPUTED from the observation store on each
request by :mod:`disastermind.models.reconcile`, never served from a cached
snapshot. If the policy changes, these responses change with it -- there is no
second copy of the truth to drift.

Framework-free. ``register`` is the only line ``factory.py`` needs to know
about, which keeps the API surface additive.
"""
from __future__ import annotations

import json
import os
from typing import Any

from ...models.observation import Observation, ObservationStore
from ...models.reconcile import build_history, counts, reconcile
from ...models.reconcile_policy import render

_FIXTURE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "models", "fixtures", "provenance_earthquake.json",
)

_STORES: dict[str, ObservationStore] = {}


def load_store(path: str = _FIXTURE) -> ObservationStore:
    """Build the demo incident's store from committed observations (offline)."""
    with open(path, encoding="utf-8") as fh:
        spec = json.load(fh)
    store = ObservationStore(spec["incident_id"])
    for index, record in enumerate(spec["observations"], start=1):
        store.append(Observation(
            source=record["source"], source_event_id=record["source_event_id"],
            observed_at=record["observed_at"], received_at=record["received_at"],
            payload=record["payload"], obs_id=f"obs-{index:03d}",
        ))
    return store


def store_for(incident_id: str) -> ObservationStore | None:
    if not _STORES:
        demo = load_store()
        _STORES[demo.incident_id] = demo
    return _STORES.get(incident_id)


def register_store(store: ObservationStore) -> None:
    """Attach a live incident's observations so the same views serve it."""
    _STORES[store.incident_id] = store


# ----------------------------------------------------------------- handlers
def incident_history(incident_id: str, meaningful_only: bool = False) -> dict[str, Any]:
    """GET /incidents/{id}/history — revisions, filterable, with the counts."""
    store = store_for(incident_id)
    if store is None:
        return {"error": "unknown incident", "incident_id": incident_id}
    revisions = build_history(incident_id, store.all())
    totals = counts(revisions, store)
    shown = [r for r in revisions if not meaningful_only or r.classification == "MEANINGFUL"]
    return {
        "incident_id": incident_id,
        "counts": totals,
        "meaningful_only": meaningful_only,
        # What the filter is hiding is stated, not merely omitted.
        "suppressed": totals["minor"] if meaningful_only else 0,
        "revisions": [r.to_dict() for r in shown],
    }


def incident_observations(incident_id: str) -> dict[str, Any]:
    """GET /incidents/{id}/observations — raw reports with provenance."""
    store = store_for(incident_id)
    if store is None:
        return {"error": "unknown incident", "incident_id": incident_id}
    return store.to_dict()


def incident_field(incident_id: str, name: str) -> dict[str, Any]:
    """GET /incidents/{id}/field/{name} — who said what, which won, why."""
    store = store_for(incident_id)
    if store is None:
        return {"error": "unknown incident", "incident_id": incident_id}
    state = reconcile(incident_id, store.all())
    selection = state.fields.get(name)
    if selection is None:
        return {"error": "no such field", "incident_id": incident_id, "field": name}
    return {
        "incident_id": incident_id,
        "recommendation": state.recommendation,
        **selection.to_dict(),
        "reported_by": [
            {"source": o.source, "value": o.payload.get(name), "obs_id": o.obs_id,
             "observed_at": o.observed_at, "received_at": o.received_at}
            for o in store.all() if name in o.payload
        ],
    }


def reconciliation_policy() -> dict[str, Any]:
    """GET /policy/reconciliation — the active policy, as printed text."""
    return {"policy": render()}


def register(app: Any, route: Any) -> None:
    """Wire the routes. ``route`` is factory.py's own path-registration helper."""
    route("/incidents/{incident_id}/history", incident_history, ["GET"])
    route("/incidents/{incident_id}/observations", incident_observations, ["GET"])
    route("/incidents/{incident_id}/field/{name}", incident_field, ["GET"])
    route("/policy/reconciliation", reconciliation_policy, ["GET"])
