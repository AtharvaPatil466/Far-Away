"""Property tests for the safety-critical maths (on-site item 15).

Example-based tests pin the cases someone thought of. These pin the RELATIONSHIPS
that must hold for every input -- monotonicity, bounds, ordering -- which is where
a plausible-looking refactor does its damage: the examples still pass while the
shape of the function quietly changes.

Deliberately plain loops over a deterministic grid rather than Hypothesis. The
runtime is stdlib-only by design and the properties here are over smooth
one- and two-dimensional ranges, where a dense sweep covers the space as well as
random search would -- without a new test dependency to justify.
"""
from __future__ import annotations

import math

import pytest

from disastermind.evacuation.clearance import estimate_clearance
from disastermind.evacuation.tradeoff import break_even_probability
from disastermind.ml.eval.conformal import fit_isotonic
from disastermind.tier2.cascade.omori import OmoriParams, expected_count


def _frange(lo, hi, n):
    step = (hi - lo) / (n - 1)
    return [lo + i * step for i in range(n)]


# ------------------------------------------------------------------ clearance
@pytest.mark.parametrize("capacity", [1000.0, 4000.0, 8000.0, 20000.0])
def test_clearance_is_monotonic_in_population(capacity):
    """More people can never clear FASTER at fixed capacity."""
    previous = 0.0
    for population in range(1000, 500_001, 25_000):
        hours = estimate_clearance(population, capacity).clearance_hours
        assert hours >= previous - 1e-9, f"clearance fell at population={population}"
        previous = hours


@pytest.mark.parametrize("population", [10_000, 200_500, 900_000])
def test_clearance_is_monotonic_decreasing_in_capacity(population):
    """More egress capacity can never make clearance take longer."""
    previous = math.inf
    for capacity in _frange(500.0, 30_000.0, 40):
        hours = estimate_clearance(population, capacity).clearance_hours
        assert hours <= previous + 1e-9, f"clearance rose at capacity={capacity}"
        previous = hours


def test_clearance_is_never_below_its_fixed_overheads():
    """Mobilisation and last-mile are additive floors, not averages."""
    for population in (1, 1000, 100_000):
        for capacity in (1000.0, 50_000.0):
            est = estimate_clearance(population, capacity,
                                     mobilization_hours=4.0, last_mile_hours=0.75)
            assert est.clearance_hours >= 4.75 - 1e-9


def test_zero_capacity_is_infinite_not_a_crash_or_zero():
    """A zone with no egress must read as unclearable, never as instantly clear."""
    assert estimate_clearance(50_000, 0.0).clearance_hours == math.inf


# --------------------------------------------------------------------- Omori
def test_aftershock_rate_is_non_increasing_in_time():
    """Omori-Utsu decays. A window later in the sequence cannot expect MORE."""
    params = OmoriParams(k=100.0, c=0.05, p=1.1, a=-1.6, b=1.0, mc=3.0, mainshock_magnitude=6.2)
    previous = math.inf
    for start in _frange(0.0, 30.0, 60):
        count = expected_count(params, start, start + 1.0)
        assert count <= previous + 1e-9, f"aftershock rate rose at t={start}"
        previous = count


def test_aftershock_counts_are_additive_over_adjacent_windows():
    """[0,a] + [a,b] must equal [0,b] -- the integral cannot double-count."""
    params = OmoriParams(k=80.0, c=0.1, p=1.2, a=-1.6, b=1.0, mc=3.0, mainshock_magnitude=6.0)
    for split in _frange(0.5, 20.0, 25):
        whole = expected_count(params, 0.0, 30.0)
        parts = expected_count(params, 0.0, split) + expected_count(params, split, 30.0)
        assert whole == pytest.approx(parts, rel=1e-9)


def test_aftershock_count_is_never_negative():
    for p in (0.8, 1.0, 1.1, 1.5):
        params = OmoriParams(k=50.0, c=0.05, p=p, a=-1.6, b=1.0, mc=3.0, mainshock_magnitude=6.0)
        for start in _frange(0.0, 40.0, 30):
            assert expected_count(params, start, start + 2.0) >= 0.0


def test_inverted_window_yields_zero_not_a_negative_count():
    params = OmoriParams(k=50.0, c=0.05, p=1.1, a=-1.6, b=1.0, mc=3.0, mainshock_magnitude=6.0)
    assert expected_count(params, 10.0, 5.0) == 0.0


# ---------------------------------------------------------------- break-even
def test_break_even_falls_as_staying_gets_deadlier():
    """The deadlier it is to stay, the lower the probability justifying evacuation."""
    previous = math.inf
    for stay_rate in _frange(0.001, 0.2, 60):
        p = break_even_probability(0.0005, stay_rate)
        assert p <= previous + 1e-9, f"break-even rose at stay_rate={stay_rate}"
        previous = p


def test_break_even_rises_as_evacuation_gets_deadlier():
    previous = -math.inf
    for evac_rate in _frange(0.0, 0.05, 60):
        p = break_even_probability(evac_rate, 0.02)
        assert p >= previous - 1e-9, f"break-even fell at evac_rate={evac_rate}"
        previous = p


def test_break_even_is_always_a_probability():
    """It is compared against p_event, so it must live in [0, 1] for all inputs."""
    for evac_rate in _frange(0.0, 0.5, 25):
        for stay_rate in _frange(0.0, 0.5, 25):
            assert 0.0 <= break_even_probability(evac_rate, stay_rate) <= 1.0


def test_harmless_evacuation_never_requires_certainty():
    """A zero-casualty evacuation breaks even immediately -- there is nothing to trade."""
    assert break_even_probability(0.0, 0.02) == 0.0


# ----------------------------------------------------------------- isotonic
def test_isotonic_calibration_preserves_ranking():
    """Calibration may move probabilities; it must never REORDER them.

    Ranking is what AUC scores and what the dispatch threshold cuts on, so an
    order-breaking calibrator would silently invalidate both.
    """
    y = [0, 0, 1, 0, 1, 1, 0, 1, 1, 1] * 5
    p = [(i % 10) / 10.0 for i in range(len(y))]
    calibrator = fit_isotonic(y, p)

    raw = _frange(0.0, 1.0, 50)
    calibrated = [calibrator.transform_one(v) for v in raw]
    for earlier, later in zip(calibrated, calibrated[1:]):
        assert later >= earlier - 1e-9, "isotonic calibration inverted an ordering"


def test_isotonic_output_stays_a_probability():
    y = [0, 1] * 25
    p = [(i % 50) / 50.0 for i in range(50)]
    calibrator = fit_isotonic(y, p)

    for v in _frange(-0.5, 1.5, 40):
        assert 0.0 <= calibrator.transform_one(v) <= 1.0, f"calibrated {v} out of [0,1]"


# ------------------------------------------------- boundary guards (item 20)
def test_negative_casualty_rate_cannot_disable_the_over_evacuation_guard():
    """The bug this test exists for.

    break_even is compared as ``p_event < break_even`` to decide HOLD. A negative
    value is below every probability, so the guard would never fire and every
    zone would ORDER -- an over-evacuation failure produced by a sign, with
    nothing in the output looking wrong.
    """
    assert break_even_probability(-0.1, 0.02) == 0.0
    assert 0.0 <= break_even_probability(-99.0, 0.02) <= 1.0


def test_non_finite_costs_require_certainty_rather_than_comparing_false():
    """NaN makes every comparison False, which fails OPEN. Fail closed instead."""
    nan, inf = float("nan"), float("inf")

    assert break_even_probability(nan, 0.02) == 1.0
    assert break_even_probability(0.0005, nan) == 1.0
    assert break_even_probability(inf, 0.02) == 1.0


def test_break_even_stays_a_probability_for_hostile_input():
    """Extends the earlier property below zero and past one."""
    for evac in (-5.0, -0.1, 0.0, 0.5, 5.0):
        for stay in (-5.0, -0.1, 0.0, 0.02, 5.0):
            assert 0.0 <= break_even_probability(evac, stay) <= 1.0


@pytest.mark.parametrize("bad", [-5, -1, float("nan"), float("inf")])
def test_impossible_population_is_rejected_not_quietly_costed(bad):
    """A negative population used to return the fixed overheads (4.75 h).

    Downstream that reads as "this zone clears in under five hours", which is a
    far more dangerous output than an exception.
    """
    with pytest.raises(ValueError):
        estimate_clearance(bad, 8000.0)


def test_non_finite_capacity_is_rejected():
    with pytest.raises(ValueError):
        estimate_clearance(1000, float("nan"))
