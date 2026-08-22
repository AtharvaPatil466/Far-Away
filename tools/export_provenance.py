"""Compute the provenance view the console reads. Offline, deterministic.

COMPUTES, never replays: the reconciler runs over the committed observations
every time this is invoked, so the console cannot show a stale narrative that
the policy would no longer produce.

Run: python tools/export_provenance.py   (or `make provenance`)
"""
from __future__ import annotations

import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from disastermind.api.app.history_routes import load_store
from disastermind.models.reconcile import build_history, counts, reconcile
from disastermind.models.reconcile_policy import render

OUT = os.path.join(ROOT, "clients", "web", "public", "data", "provenance.json")


def main() -> int:
    store = load_store()
    incident_id = store.incident_id
    observations = store.all()

    revisions = build_history(incident_id, observations)
    state = reconcile(incident_id, observations)
    totals = counts(revisions)

    document = {
        "incident_id": incident_id,
        "counts": totals,
        "canonical": state.to_dict(),
        "revisions": [r.to_dict() for r in revisions],
        "observations": [o.to_dict() for o in observations],
        "policy": render(),
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(document, fh, indent=2, sort_keys=True)
        fh.write("\n")

    print(f"wrote {OUT}")
    print(f"  observations {len(observations)}   revisions {totals['total']}"
          f"   meaningful {totals['meaningful']}   minor {totals['minor']}")
    print(f"  final recommendation: {state.recommendation}")
    unresolved = state.to_dict()["unresolved_fields"]
    if unresolved:
        print(f"  UNRESOLVED fields: {unresolved}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
