"""Sensitivity of the evacuation recommendation to its uncalibrated assumptions.

The evacuation layer's clearance, compliance and casualty rates are planning
assumptions, not agency-calibrated numbers (TECHNICAL_REPORT.md section 6.8).
That is the honest disclosure, and it invites the obvious question: *if the
assumptions are made up, is the recommendation made up too?*

This module answers it quantitatively. It sweeps each assumption across a plausible
range, re-runs the REAL decision function at every point, and reports where -- if
anywhere -- the recommendation flips. An assumption the decision is insensitive to
does not need calibrating. One that flips inside its plausible range is a number
the operator must own, and the flip point tells them exactly how much slack they have.

Nothing here is hardcoded: every row is produced by calling
:func:`~disastermind.evacuation.decision.decide_zone_evacuation`, so the analysis
cannot drift away from the behaviour it claims to describe.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any

from .decision import decide_zone_evacuation
from .risk_trajectory import RiskTrajectory


@dataclass(frozen=True)
class SweepPoint:
    value: float
    recommendation: str
    p_event: float
    break_even_p: float
    expected_moved: int
    net_lives_saved: float
    equity_ok: bool


@dataclass
class Sweep:
    """One assumption swept across its plausible range."""

    parameter: str
    label: str
    unit: str
    baseline: float
    points: list[SweepPoint]
    #: Values where the recommendation changes from the preceding point.
    flip_points: list[float] = field(default_factory=list)
    #: True when the recommendation never changes across the whole range.
    insensitive: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "parameter": self.parameter,
            "label": self.label,
            "unit": self.unit,
            "baseline": self.baseline,
            "flip_points": self.flip_points,
            "insensitive": self.insensitive,
            "points": [asdict(p) for p in self.points],
        }


def _sweep(zone, population, road, assisted, traj, *, parameter, label, unit,
           baseline, values, build_kwargs) -> Sweep:
    points: list[SweepPoint] = []
    flips: list[float] = []
    previous: str | None = None
    for v in values:
        d = decide_zone_evacuation(zone, population, **build_kwargs(v, road, assisted), traj=traj)
        points.append(SweepPoint(
            value=v,
            recommendation=d.recommendation,
            p_event=round(d.p_event, 4),
            break_even_p=round(d.break_even_p, 4),
            expected_moved=d.expected_moved,
            net_lives_saved=round(d.net_lives_saved, 1),
            equity_ok=d.equity_ok,
        ))
        if previous is not None and d.recommendation != previous:
            flips.append(v)
        previous = d.recommendation
    return Sweep(parameter=parameter, label=label, unit=unit, baseline=baseline,
                 points=points, flip_points=flips, insensitive=not flips)


def _frange(lo: float, hi: float, step: float) -> list[float]:
    out, v = [], lo
    while v <= hi + 1e-9:
        out.append(round(v, 6))
        v += step
    return out


def sweep_stay_fatality_rate(zone, population, road, assisted, traj,
                             *, baseline: float = 0.02) -> Sweep:
    """How deadly is staying? Drives the break-even probability directly."""
    return _sweep(
        zone, population, road, assisted, traj,
        parameter="stay_fatality_rate",
        label="Fatality rate if the zone stays",
        unit="fraction of population",
        baseline=baseline,
        values=[0.001, 0.002, 0.003, 0.005, 0.0075, 0.01, 0.015, 0.02, 0.03, 0.05],
        build_kwargs=lambda v, r, a: {
            "road_egress_pph": r, "assisted_egress_pph": a, "stay_fatality_rate": v,
        },
    )


def sweep_prior_false_alarms(zone, population, road, assisted, traj) -> Sweep:
    """Cry-wolf: each prior false alarm suppresses compliance on the next order."""
    return _sweep(
        zone, population, road, assisted, traj,
        parameter="prior_false_alarms",
        label="Prior false alarms (cry-wolf)",
        unit="count",
        baseline=0,
        values=[0, 1, 2, 3, 4, 5, 6, 8, 10],
        build_kwargs=lambda v, r, a: {
            "road_egress_pph": r, "assisted_egress_pph": a, "prior_false_alarms": int(v),
        },
    )


def sweep_road_egress(zone, population, road, assisted, traj) -> Sweep:
    """Clearance capacity: how fast the road network can actually move people."""
    return _sweep(
        zone, population, road, assisted, traj,
        parameter="road_egress_pph",
        label="Road egress capacity",
        unit="people/hour",
        baseline=road,
        values=_frange(1000.0, 12000.0, 1000.0),
        build_kwargs=lambda v, r, a: {
            "road_egress_pph": v, "assisted_egress_pph": a,
        },
    )


def run_all(zone: str, population: int, road_egress_pph: float,
            assisted_egress_pph: float, traj: RiskTrajectory) -> dict[str, Any]:
    """Every sweep, plus the baseline decision they are all measured against."""
    base = decide_zone_evacuation(zone, population, road_egress_pph,
                                  assisted_egress_pph, traj)
    sweeps = [
        sweep_stay_fatality_rate(zone, population, road_egress_pph, assisted_egress_pph, traj),
        sweep_prior_false_alarms(zone, population, road_egress_pph, assisted_egress_pph, traj),
        sweep_road_egress(zone, population, road_egress_pph, assisted_egress_pph, traj),
    ]
    return {
        "zone": zone,
        "population": population,
        "baseline": {
            "recommendation": base.recommendation,
            "p_event": round(base.p_event, 4),
            "break_even_p": round(base.break_even_p, 4),
            "actionable_lead_hours": base.actionable_lead_hours,
        },
        "sweeps": [s.to_dict() for s in sweeps],
    }
