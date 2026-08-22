"""Sensitivity of the evacuation recommendation to its uncalibrated inputs.

TECHNICAL_REPORT.md section 6.8 concedes the clearance/compliance/casualty rates
are planning assumptions, not agency-calibrated numbers. The obvious follow-up
is whether the RECOMMENDATION is therefore arbitrary. These tests pin the answer:
it is not, and they pin how much slack each assumption actually has, so a
regression that narrows that margin fails here rather than on stage.
"""
from __future__ import annotations

import json
import os

from disastermind.evacuation import Horizon, RiskTrajectory
from disastermind.evacuation.sensitivity import (
    run_all,
    sweep_prior_false_alarms,
    sweep_road_egress,
    sweep_stay_fatality_rate,
)

_HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_CAP = os.path.join(_HERE, "disastermind", "hindcast", "fixtures", "puri_capacity.json")

TRAJ = RiskTrajectory("puri", "t", [Horizon(72, 0.8, far=0.5), Horizon(24, 0.95, far=0.4)], 0.5)


def _pop() -> int:
    with open(_CAP, encoding="utf-8") as fh:
        return int(json.load(fh)["population_tags"][0][1])


def _args():
    return ("Puri", _pop(), 8000.0, 4000.0, TRAJ)


def test_recommendation_survives_a_2x_error_in_the_fatality_rate():
    """Baseline 0.02 flips at 0.0075 — roughly 2.7x of slack.

    This is the number to quote when asked "what if your casualty rate is wrong?"
    """
    sweep = sweep_stay_fatality_rate(*_args())

    assert sweep.flip_points == [0.0075]
    assert not sweep.insensitive
    below = [p for p in sweep.points if p.value < 0.0075]
    above = [p for p in sweep.points if p.value >= 0.0075]
    assert all(p.recommendation == "BELOW_BREAKEVEN_HOLD" for p in below)
    assert all(p.recommendation == "ORDER_BY_DEADLINE" for p in above)


def test_recommendation_survives_a_4x_error_in_road_capacity():
    """Baseline 8000 people/hour; the order only fails below 2000."""
    sweep = sweep_road_egress(*_args())

    assert sweep.flip_points == [2000.0]
    assert not sweep.insensitive


def test_cry_wolf_does_not_flip_the_order_but_guts_the_outcome():
    """The decision is insensitive to compliance; the RESULT is not.

    Ten prior false alarms leave the recommendation unchanged while roughly
    three quarters of the population stops moving. Anyone reading only the
    recommendation would miss that entirely, which is why expected_moved is
    reported alongside it.
    """
    sweep = sweep_prior_false_alarms(*_args())

    assert sweep.insensitive, "recommendation should hold across the cry-wolf range"
    first, last = sweep.points[0], sweep.points[-1]
    assert first.recommendation == last.recommendation
    assert last.expected_moved < first.expected_moved * 0.35


def test_every_point_comes_from_the_real_decision_function():
    """Guards against the sweep drifting into a hardcoded illustration."""
    report = run_all(*_args())

    assert report["baseline"]["recommendation"] == "ORDER_BY_DEADLINE"
    assert len(report["sweeps"]) == 3
    for sweep in report["sweeps"]:
        assert sweep["points"], f"{sweep['parameter']} produced no points"
        for point in sweep["points"]:
            assert 0.0 <= point["p_event"] <= 1.0
            assert point["recommendation"]


def test_shipped_snapshot_matches_the_shape_the_chart_reads():
    with open("clients/web/public/data/sensitivity.json", encoding="utf-8") as fh:
        shipped = json.load(fh)

    assert shipped["baseline"]["recommendation"]
    for sweep in shipped["sweeps"]:
        for key in ("parameter", "label", "unit", "baseline", "flip_points",
                    "insensitive", "points"):
            assert key in sweep, f"chart reads {key!r}; snapshot lacks it"
