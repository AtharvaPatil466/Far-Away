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

DATA = os.path.join(ROOT, "clients", "web", "public", "data")
FIXTURES = os.path.join(ROOT, "disastermind", "models", "fixtures")
#: (fixture, output, label shown in the console switcher)
SCENARIOS = (
    ("provenance_earthquake.json", "provenance.json", "Conflicting magnitudes"),
    ("provenance_vindication.json", "provenance_vindication.json", "Overruled — and wrong"),
)


def main() -> int:
    for fixture, out_name, label in SCENARIOS:
        store = load_store(os.path.join(FIXTURES, fixture))
        incident_id = store.incident_id
        observations = store.all()

        revisions = build_history(incident_id, observations)
        state = reconcile(incident_id, observations)
        totals = counts(revisions, store)

        document = {
            "incident_id": incident_id,
            "label": label,
            "counts": totals,
            "canonical": state.to_dict(),
            "revisions": [r.to_dict() for r in revisions],
            "observations": [o.to_dict() for o in observations],
            "policy": render(),
        }
        os.makedirs(DATA, exist_ok=True)
        with open(os.path.join(DATA, out_name), "w", encoding="utf-8") as fh:
            json.dump(document, fh, indent=2, sort_keys=True)
            fh.write("\n")

        print(f"{out_name}  [{label}]")
        print(f"  {totals['reports_received']} reports received"
              f"  - {totals['duplicates_suppressed']} duplicate"
              f"  = {totals['observations']} observations"
              f"  -> {totals['total']} revisions ({totals['no_op']} no-op)"
              f"  -> {totals['meaningful']} meaningful / {totals['minor']} minor")
        print(f"  final recommendation: {state.recommendation}")
        unresolved = state.to_dict()["unresolved_fields"]
        if unresolved:
            print(f"  UNRESOLVED fields: {unresolved}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
