"""Regenerate the evacuation sensitivity snapshot the console chart reads.

Run: python tools/export_sensitivity.py  (or `make sensitivity`)
"""
from __future__ import annotations

import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from disastermind.evacuation import Horizon, RiskTrajectory
from disastermind.evacuation.sensitivity import run_all

CAPACITY = os.path.join(ROOT, "disastermind", "hindcast", "fixtures", "puri_capacity.json")
OUT = os.path.join(ROOT, "clients", "web", "public", "data", "sensitivity.json")

# The Fani-shaped baseline: threshold crossed 72 h out, intensifying to landfall.
BASELINE_TRAJ = RiskTrajectory(
    "puri", "sensitivity-baseline",
    [Horizon(72, 0.8, far=0.5), Horizon(24, 0.95, far=0.4)],
    0.5,
)


def main() -> int:
    with open(CAPACITY, encoding="utf-8") as fh:
        population = int(json.load(fh)["population_tags"][0][1])

    report = run_all("Puri", population, 8000.0, 4000.0, BASELINE_TRAJ)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=2, sort_keys=True)
        fh.write("\n")

    print(f"wrote {OUT}")
    print(f"baseline: {report['baseline']['recommendation']}")
    for s in report["sweeps"]:
        verdict = "INSENSITIVE" if s["insensitive"] else f"flips at {s['flip_points']}"
        print(f"  {s['parameter']:<22} {verdict}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
