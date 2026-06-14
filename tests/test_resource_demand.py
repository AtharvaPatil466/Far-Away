"""Relief-commodity demand forecasting — Sphere-standard invariants + gap analysis."""
from __future__ import annotations

import math

from disastermind.models.domain import RiskCell, VulnerabilityProfile
from disastermind.models.geo import LatLon
from disastermind.tier2.resource import demand as dm


class TestForecastDemand:
    def test_water_food_scale_linearly(self) -> None:
        d1 = dm.forecast_demand(1000, 1)
        d2 = dm.forecast_demand(2000, 3)
        # 2x people * 3x days = 6x the consumable demand
        assert d2.water_litres == d1.water_litres * 6
        assert d2.ration_kg == d1.ration_kg * 6
        assert d2.food_kcal == d1.food_kcal * 6

    def test_sphere_per_capita_rates(self) -> None:
        d = dm.forecast_demand(1000, 2)
        assert d.water_litres == 1000 * 15.0 * 2          # 15 L/person/day
        assert d.drinking_water_litres == 1000 * 3.0 * 2  # 3 L drinking subset
        assert d.food_kcal == 1000 * 2100.0 * 2           # 2,100 kcal/person/day
        assert d.shelter_m2 == 1000 * 3.5                 # 3.5 m²/person (standing)
        assert d.water_litres_per_day == 1000 * 15.0

    def test_sphere_facility_ratios(self) -> None:
        d = dm.forecast_demand(1000, 5)
        assert d.latrines == math.ceil(1000 / 20)      # 1 per 20
        assert d.water_points == math.ceil(1000 / 250)  # 1 per 250
        assert d.shelter_spaces == 1000                 # one space per displaced person

    def test_facility_ratios_round_up(self) -> None:
        # 21 people still need 2 latrines, not 1.05.
        d = dm.forecast_demand(21, 1)
        assert d.latrines == 2

    def test_medical_beds_baseline_plus_known_caseload(self) -> None:
        baseline = dm.forecast_demand(10_000, 3)
        # 2 per 1,000 -> 20 baseline beds.
        assert baseline.medical_beds == 20
        # Injured + hospitalised are additive on top of the baseline.
        vuln = VulnerabilityProfile(hospitalised=15)
        loaded = dm.forecast_demand(10_000, 3, injured=30, vulnerability=vuln)
        assert loaded.medical_beds == 20 + 30 + 15

    def test_zero_population_is_safe(self) -> None:
        d = dm.forecast_demand(0, 7)
        assert d.water_litres == 0
        assert d.latrines == 0 and d.water_points == 0 and d.medical_beds == 0

    def test_duration_floored_at_one_day(self) -> None:
        d = dm.forecast_demand(100, 0)
        assert d.duration_days == 1  # never divide-by-zero on per-day props

    def test_coefficients_overridable(self) -> None:
        coeffs = dm.Coeffs(water_l=20.0)  # a stricter water standard
        d = dm.forecast_demand(100, 1, coeffs=coeffs)
        assert d.water_litres == 100 * 20.0


class TestDisplacedFromRiskCells:
    def _cell(self, pop: int, prob: float) -> RiskCell:
        return RiskCell(cell_id="c", centroid=LatLon(20.0, 85.0),
                        probability=prob, horizon_minutes=360, population_at_risk=pop)

    def test_default_displacement_fraction(self) -> None:
        cells = [self._cell(1000, 0.9), self._cell(2000, 0.8)]
        # 60% of 3,000 at risk -> 1,800 displaced.
        assert dm.displaced_from_risk_cells(cells) == 1800

    def test_probability_threshold_excludes_marginal_cells(self) -> None:
        cells = [self._cell(1000, 0.9), self._cell(5000, 0.1)]
        got = dm.displaced_from_risk_cells(cells, probability_threshold=0.5)
        assert got == int(round(1000 * dm.DEFAULT_DISPLACEMENT_FRACTION))


class TestAssessSupply:
    def test_met_shortfall_and_critical_verdicts(self) -> None:
        d = dm.forecast_demand(1000, 2)  # water_litres = 30,000
        gaps = {g.commodity: g for g in dm.assess_supply(
            d,
            {
                "water_litres": 30_000,   # exactly met
                "ration_kg": 600,         # ~50% (need 1,200) -> boundary
                "medical_beds": 0,        # 0% -> critical
            },
        )}
        assert gaps["water"].verdict == "MET"
        assert gaps["water"].pct_met == 1.0 and gaps["water"].shortfall == 0
        assert gaps["medical beds"].verdict == "CRITICAL"

    def test_days_of_cover_for_consumables(self) -> None:
        d = dm.forecast_demand(1000, 10)  # 15,000 L/day
        gaps = {g.commodity: g for g in dm.assess_supply(d, {"water_litres": 30_000})}
        # 30,000 L at 15,000 L/day = 2 days of cover.
        assert gaps["water"].days_of_cover == 2.0
        assert gaps["water"].verdict in {"SHORTFALL", "CRITICAL"}
        # Non-consumables carry no days_of_cover.
        assert gaps["medical beds"].days_of_cover is None

    def test_missing_supply_treated_as_zero(self) -> None:
        d = dm.forecast_demand(500, 1)
        gaps = dm.assess_supply(d, {})  # nothing declared
        assert all(g.available == 0 for g in gaps)
        assert all(g.verdict == "CRITICAL" for g in gaps if g.required > 0)


def test_to_markdown_renders_demand_and_gaps() -> None:
    d = dm.forecast_demand(1000, 3, injured=10)
    md = dm.to_markdown(d, dm.assess_supply(d, {"water_litres": 10_000}))
    assert "Relief demand" in md
    assert "Sphere" in md           # cites the standard
    assert "Supply gap" in md
    assert "CRITICAL" in md or "SHORTFALL" in md
