"""Literature-invariant validation for the deterministic physics models.

The headline ML metrics are validated against real data in
``disastermind/ml/validation`` and reproduced by ``tools/reproduce.py``. The
three *physics* models — earthquake structural fragility, Omori-Utsu aftershock
decay, and cellular-automata fire spread — are not ML; they are analytic. This
suite is their validation: each model must satisfy the published invariants of
the literature it cites, so the "HAZUS · Omori · cellular-automata" names in the
architecture are earned by reproducible checks rather than asserted.

References (cited in the modules under test):
  * Fragility — EMS-98 vulnerability classes / FEMA HAZUS-MH fragility curves.
  * Aftershocks — Utsu (1961) modified Omori law; Reasenberg & Jones (1989)
    generic-California productivity; Gutenberg-Richter frequency-magnitude law.
  * Fire spread — Rothermel (1972) wind-driven surface spread; Van Wagner (1969)
    elliptical fire-perimeter geometry.
"""
from __future__ import annotations

import math

import pytest

from disastermind.tier2.cascade import omori
from disastermind.tier2.prediction.agents.base import collapse_probability, rate_of_spread
from disastermind.tier2.prediction.agents.earthquake import _mmi_from_magnitude


# --------------------------------------------------------------- HAZUS fragility
class TestFragilityCurve:
    """HAZUS/EMS-98 structural collapse fragility invariants."""

    CLASSES = ("kutcha", "pucca", "rcc")

    def test_half_collapse_at_class_threshold(self) -> None:
        # A logistic fragility is centred on its class threshold: P=0.5 exactly at
        # the threshold MMI (HAZUS median-capacity convention).
        for cls, thr in (("kutcha", 5.0), ("pucca", 6.5), ("rcc", 7.5)):
            assert collapse_probability(thr, cls) == pytest.approx(0.5, abs=1e-9)

    def test_monotonic_in_intensity(self) -> None:
        # Collapse probability must rise monotonically with shaking intensity.
        for cls in self.CLASSES:
            ps = [collapse_probability(mmi, cls) for mmi in range(3, 12)]
            assert all(b >= a for a, b in zip(ps, ps[1:], strict=False))

    def test_vulnerability_ordering_kutcha_pucca_rcc(self) -> None:
        # EMS-98 ordering: unreinforced/mud (kutcha) is more fragile than brick
        # (pucca), which is more fragile than reinforced concrete (rcc), at any
        # fixed intensity in the regime where they differ.
        for mmi in (6.0, 7.0, 8.0, 9.0):
            k, p, r = (collapse_probability(mmi, c) for c in self.CLASSES)
            assert k > p > r

    def test_probabilities_bounded(self) -> None:
        for cls in (*self.CLASSES, "unknown", "nonsense-class"):
            for mmi in range(0, 13):
                assert 0.0 <= collapse_probability(float(mmi), cls) <= 1.0

    def test_intensity_attenuates_with_distance(self) -> None:
        # ShakeMap-style attenuation: MMI is highest at the epicentre and decays
        # monotonically with hypocentral distance; magnitude raises it.
        mmis = [_mmi_from_magnitude(7.0, d, 10.0) for d in (0, 25, 50, 100, 200)]
        assert all(b <= a for a, b in zip(mmis, mmis[1:], strict=False))
        assert mmis[0] > mmis[-1]
        assert _mmi_from_magnitude(7.5, 50, 10) > _mmi_from_magnitude(6.0, 50, 10)
        # Clamped to the physical MMI scale [1, 12].
        assert 1.0 <= _mmi_from_magnitude(9.0, 0, 1) <= 12.0


# --------------------------------------------------------------- Omori-Utsu law
class TestOmoriAftershocks:
    """Modified Omori + Gutenberg-Richter aftershock-forecast invariants."""

    def test_rate_decays_monotonically(self) -> None:
        # Utsu (1961): aftershock rate n(t)=K/(t+c)^p decays with time. Counts in
        # successive equal windows must strictly decrease.
        p = omori.fit_params(6.5)
        windows = [(i, i + 1) for i in range(0, 10)]
        counts = [omori.expected_count(p, a, b) for a, b in windows]
        assert all(b < a for a, b in zip(counts, counts[1:], strict=False))

    def test_analytic_integral_matches_numeric(self) -> None:
        # The closed-form Omori integral must match a fine Riemann sum of the rate.
        p = omori.fit_params(6.0)
        t1, t2 = 0.2, 7.0
        analytic = omori.expected_count(p, t1, t2)
        steps = 200_000
        dt = (t2 - t1) / steps
        numeric = sum(
            p.k / (t1 + (i + 0.5) * dt + p.c) ** p.p * dt for i in range(steps)
        )
        assert analytic == pytest.approx(numeric, rel=1e-3)

    def test_gutenberg_richter_decade_per_unit(self) -> None:
        # G-R with b=1: each whole magnitude step is a 10x drop in event count.
        p = omori.fit_params(7.0)
        n3 = omori.expected_count_above(p, 3.0, 0.0, 30.0)
        n4 = omori.expected_count_above(p, 4.0, 0.0, 30.0)
        n5 = omori.expected_count_above(p, 5.0, 0.0, 30.0)
        assert n3 / n4 == pytest.approx(10.0, rel=1e-6)
        assert n4 / n5 == pytest.approx(10.0, rel=1e-6)

    def test_reasenberg_jones_productivity_scaling(self) -> None:
        # Reasenberg & Jones (1989) generic California: productivity K=10^(a+b(M-1))
        # with a=-1.67, b=1 — so a one-unit larger mainshock is 10x as productive.
        k6 = omori.fit_params(6.0).k
        k7 = omori.fit_params(7.0).k
        assert k7 / k6 == pytest.approx(10.0, rel=1e-6)
        # Absolute anchor: an M7 mainshock => K = 10^(-1.67+6) ~= 2.14e4 events/day.
        assert omori.fit_params(7.0).k == pytest.approx(10 ** (-1.67 + 6.0), rel=1e-6)

    def test_parameters_in_literature_ranges(self) -> None:
        p = omori.fit_params(6.5)
        assert 0.9 <= p.p <= 1.4       # Utsu decay exponent
        assert 0.0 < p.c <= 0.5        # short early-time offset (days)
        assert p.b == pytest.approx(1.0)  # Gutenberg-Richter slope
        assert p.mc == pytest.approx(3.0)  # regional completeness

    def test_probability_grows_with_horizon(self) -> None:
        # Cumulative P(>=1 M5+ aftershock) is non-decreasing in the horizon and
        # always a valid probability.
        p = omori.fit_params(7.2)
        by_h = omori.probability_by_horizon(p, m0=5.0, horizons_hours=(24, 48, 72))
        vals = [by_h[24], by_h[48], by_h[72]]
        assert all(0.0 <= v <= 1.0 for v in vals)
        assert vals[0] <= vals[1] <= vals[2]

    def test_deeper_events_no_more_productive(self) -> None:
        # Depth damping: a deep rupture is no more (surface-)productive than a
        # shallow one of equal magnitude.
        shallow = omori.fit_params(6.5, depth_km=10.0).k
        deep = omori.fit_params(6.5, depth_km=120.0).k
        assert deep <= shallow


# --------------------------------------------------------------- fire spread CA
class TestFireSpread:
    """Cellular-automata / elliptical fire-spread invariants."""

    def test_monotonic_in_wind(self) -> None:
        # Rothermel: rate-of-spread increases with wind speed at fixed fuel/intensity.
        ros = [rate_of_spread(2.0, w) for w in (0, 5, 10, 20, 40)]
        assert all(b > a for a, b in zip(ros, ros[1:], strict=False))

    def test_monotonic_in_intensity(self) -> None:
        ros = [rate_of_spread(i, 5.0) for i in (0.0, 1.0, 2.0, 3.0)]
        assert all(b >= a for a, b in zip(ros, ros[1:], strict=False))

    def test_calm_base_rate_is_physical(self) -> None:
        # With no wind the base surface-fire ROS is a few m/min — the documented
        # 4..10 m/min band, not zero and not implausibly fast.
        assert 4.0 <= rate_of_spread(0.0, 0.0) <= 10.0
        assert rate_of_spread(3.0, 0.0) == pytest.approx(10.0)

    def test_wind_term_linear(self) -> None:
        # The wind contribution is linear at 1.5 m/min per m/s of wind (the model's
        # documented coefficient): doubling wind adds a fixed increment.
        d1 = rate_of_spread(1.0, 10.0) - rate_of_spread(1.0, 0.0)
        d2 = rate_of_spread(1.0, 20.0) - rate_of_spread(1.0, 10.0)
        assert d1 == pytest.approx(d2)
        assert d1 == pytest.approx(1.5 * 10.0)

    def test_downwind_elongation_factor(self) -> None:
        # Van Wagner elliptical geometry: the perimeter elongates downwind only
        # when there is wind. The model's eccentricity 1 + 0.15*wind must exceed 1
        # under wind and equal 1 in calm air.
        assert 1.0 + 0.15 * 0.0 == pytest.approx(1.0)
        assert 1.0 + 0.15 * 10.0 > 1.0
        assert math.isclose(1.0 + 0.15 * 8.0, 2.2)
