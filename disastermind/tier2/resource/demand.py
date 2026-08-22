"""Relief-commodity demand forecasting (PRD Step 4/5 — sustainment planning).

Asset allocation (:mod:`.optimizer`) answers *who responds*; this module answers
*what the response must sustain*. Given the population a hazard puts at risk, it
projects how much **water, food, shelter, medical capacity, and sanitation** the
relief effort needs over a planning horizon, then compares that demand to declared
supply and reports the shortfall.

Pure and stdlib-only. Every per-capita coefficient is anchored to a **published
humanitarian minimum standard** and exposed as a named, overridable constant, so
the numbers are defensible rather than invented — the same "validated, citable"
bar the rest of the platform holds itself to:

  * Water       — 15 L / person / day (3 L drinking)     — Sphere Handbook, WASH
  * Food        — 2,100 kcal / person / day              — Sphere, Food Security & Nutrition
  * Dry ration  — ~0.6 kg / person / day                 — NDMA gratuitous-relief norm (cereal+pulse+oil)
  * Shelter     — 3.5 m² covered area / displaced person — Sphere, Shelter & Settlement
  * Latrines    — 1 per 20 people                         — Sphere, Excreta Management
  * Water points— 1 tap per 250 people                    — Sphere, Water Supply
  * Medical beds— ~2 / 1,000 displaced + known caseload   — Sphere, Health Systems (camp clinic planning)

References: *The Sphere Handbook* (2018 ed.); NDMA/SDRF relief norms (India).
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Iterable

from ...models.domain import RiskCell, VulnerabilityProfile

# --------------------------------------------------------------------- standards
# All rates are per displaced person per day unless noted. Override via ``Coeffs``.
WATER_L_PER_PERSON_DAY = 15.0          # Sphere WASH planning figure
DRINKING_WATER_L_PER_PERSON_DAY = 3.0  # survival subset of the above
FOOD_KCAL_PER_PERSON_DAY = 2100.0      # Sphere minimum dietary energy
DRY_RATION_KG_PER_PERSON_DAY = 0.6     # NDMA-style cereal+pulse+oil ration (approx.)
SHELTER_M2_PER_PERSON = 3.5            # Sphere minimum covered floor area
PEOPLE_PER_LATRINE = 20               # Sphere excreta-management ratio
PEOPLE_PER_WATER_POINT = 250          # Sphere water-supply ratio
MEDICAL_BEDS_PER_1000 = 2.0           # baseline camp-clinic bed planning (Sphere health)

# Fraction of the at-risk population that is actually displaced into relief care.
# A planning assumption (varies by hazard severity); overridable per call.
DEFAULT_DISPLACEMENT_FRACTION = 0.6


@dataclass(frozen=True)
class Coeffs:
    """Per-capita planning coefficients (defaults cite their source above)."""

    water_l: float = WATER_L_PER_PERSON_DAY
    drinking_water_l: float = DRINKING_WATER_L_PER_PERSON_DAY
    food_kcal: float = FOOD_KCAL_PER_PERSON_DAY
    ration_kg: float = DRY_RATION_KG_PER_PERSON_DAY
    shelter_m2: float = SHELTER_M2_PER_PERSON
    people_per_latrine: int = PEOPLE_PER_LATRINE
    people_per_water_point: int = PEOPLE_PER_WATER_POINT
    medical_beds_per_1000: float = MEDICAL_BEDS_PER_1000


DEFAULT_COEFFS = Coeffs()


# ------------------------------------------------------------------------ outputs
@dataclass
class ReliefDemand:
    """Projected relief-commodity demand for a displaced caseload over a horizon."""

    displaced: int
    duration_days: int
    # Cumulative over the horizon
    water_litres: float
    drinking_water_litres: float
    food_kcal: float
    ration_kg: float
    # Standing capacity (sized once, not per-day)
    shelter_spaces: int          # covered sleeping spaces (1 per displaced person)
    shelter_m2: float
    medical_beds: int
    latrines: int
    water_points: int

    @property
    def water_litres_per_day(self) -> float:
        return self.water_litres / max(1, self.duration_days)

    @property
    def ration_kg_per_day(self) -> float:
        return self.ration_kg / max(1, self.duration_days)

    def to_dict(self) -> dict:
        return {
            "displaced": self.displaced,
            "duration_days": self.duration_days,
            "water_litres": round(self.water_litres, 1),
            "drinking_water_litres": round(self.drinking_water_litres, 1),
            "food_kcal": round(self.food_kcal, 1),
            "ration_kg": round(self.ration_kg, 1),
            "shelter_spaces": self.shelter_spaces,
            "shelter_m2": round(self.shelter_m2, 1),
            "medical_beds": self.medical_beds,
            "latrines": self.latrines,
            "water_points": self.water_points,
        }


@dataclass
class CommodityGap:
    """Supply shortfall for one commodity against the projected demand."""

    commodity: str
    unit: str
    required: float
    available: float
    shortfall: float            # max(0, required - available)
    pct_met: float              # 0..1 (capped at 1.0)
    days_of_cover: float | None  # for consumables: how many days supply lasts
    verdict: str                # "MET" | "SHORTFALL" | "CRITICAL"

    def to_dict(self) -> dict:
        return {
            "commodity": self.commodity,
            "unit": self.unit,
            "required": round(self.required, 1),
            "available": round(self.available, 1),
            "shortfall": round(self.shortfall, 1),
            "pct_met": round(self.pct_met, 3),
            "days_of_cover": (round(self.days_of_cover, 1) if self.days_of_cover is not None else None),
            "verdict": self.verdict,
        }


# ----------------------------------------------------------------------- forecast
def displaced_from_risk_cells(
    cells: Iterable[RiskCell],
    *,
    displacement_fraction: float = DEFAULT_DISPLACEMENT_FRACTION,
    probability_threshold: float = 0.0,
) -> int:
    """Sum displaced people from PREDICTION risk cells.

    A cell contributes ``population_at_risk * displacement_fraction`` when its
    probability clears ``probability_threshold`` — so a marginal cell isn't
    sized into the relief plan at full weight.
    """
    total = 0.0
    for c in cells:
        if c.probability >= probability_threshold:
            total += c.population_at_risk * displacement_fraction
    return int(round(total))


def forecast_demand(
    displaced: int,
    duration_days: int,
    *,
    injured: int = 0,
    vulnerability: VulnerabilityProfile | None = None,
    coeffs: Coeffs = DEFAULT_COEFFS,
) -> ReliefDemand:
    """Project relief demand for ``displaced`` people over ``duration_days``.

    ``injured`` and a ``vulnerability`` profile (its ``hospitalised`` count) raise
    the medical-bed requirement above the baseline camp-clinic planning rate; both
    are additive so a known caseload is never under-counted.
    """
    displaced = max(0, int(displaced))
    duration_days = max(1, int(duration_days))

    baseline_med = displaced * coeffs.medical_beds_per_1000 / 1000.0
    known_caseload = int(injured) + (vulnerability.hospitalised if vulnerability else 0)
    medical_beds = int(math.ceil(baseline_med + known_caseload))

    return ReliefDemand(
        displaced=displaced,
        duration_days=duration_days,
        water_litres=displaced * coeffs.water_l * duration_days,
        drinking_water_litres=displaced * coeffs.drinking_water_l * duration_days,
        food_kcal=displaced * coeffs.food_kcal * duration_days,
        ration_kg=displaced * coeffs.ration_kg * duration_days,
        shelter_spaces=displaced,
        shelter_m2=displaced * coeffs.shelter_m2,
        medical_beds=medical_beds,
        latrines=int(math.ceil(displaced / coeffs.people_per_latrine)) if displaced else 0,
        water_points=int(math.ceil(displaced / coeffs.people_per_water_point)) if displaced else 0,
    )


# --------------------------------------------------------------------- supply gap
#: How each demand field maps to a (label, unit, consumable?) for gap analysis.
_COMMODITY_SPEC: dict[str, tuple[str, str, bool]] = {
    "water_litres": ("water", "litres", True),
    "ration_kg": ("food (dry ration)", "kg", True),
    "shelter_spaces": ("shelter spaces", "spaces", False),
    "medical_beds": ("medical beds", "beds", False),
    "latrines": ("latrines", "units", False),
    "water_points": ("water points", "taps", False),
}


def assess_supply(
    demand: ReliefDemand,
    available: dict[str, float],
    *,
    critical_pct: float = 0.5,
) -> list[CommodityGap]:
    """Compare declared ``available`` supply to ``demand`` per commodity.

    ``available`` is keyed by the :class:`ReliefDemand` field name (e.g.
    ``{"water_litres": 1_000_000, "medical_beds": 40}``); omitted commodities are
    treated as zero available. A consumable's ``days_of_cover`` is how long its
    stock lasts at the per-day burn rate. Verdict is ``CRITICAL`` below
    ``critical_pct`` of demand, ``SHORTFALL`` below 100%, else ``MET``.
    """
    gaps: list[CommodityGap] = []
    for field_name, (label, unit, consumable) in _COMMODITY_SPEC.items():
        required = float(getattr(demand, field_name))
        have = float(available.get(field_name, 0.0))
        shortfall = max(0.0, required - have)
        pct = 1.0 if required <= 0 else min(1.0, have / required)
        days_cover: float | None = None
        if consumable and required > 0:
            per_day = required / demand.duration_days
            days_cover = have / per_day if per_day > 0 else None
        if pct >= 1.0:
            verdict = "MET"
        elif pct < critical_pct:
            verdict = "CRITICAL"
        else:
            verdict = "SHORTFALL"
        gaps.append(CommodityGap(label, unit, required, have, shortfall, pct, days_cover, verdict))
    return gaps


# ------------------------------------------------------------------ markdown view
def to_markdown(demand: ReliefDemand, gaps: list[CommodityGap] | None = None) -> str:
    """Render a relief-demand (and optional supply-gap) summary as Markdown."""
    lines = [
        f"### Relief demand — {demand.displaced:,} displaced, {demand.duration_days}-day horizon",
        "",
        "| Commodity | Requirement | Basis |",
        "|---|---:|---|",
        f"| Water | {demand.water_litres:,.0f} L ({demand.water_litres_per_day:,.0f} L/day) | 15 L/person/day (Sphere) |",
        f"| Food | {demand.ration_kg:,.0f} kg ({demand.food_kcal:,.0f} kcal) | 2,100 kcal/person/day (Sphere) |",
        f"| Shelter | {demand.shelter_spaces:,} spaces / {demand.shelter_m2:,.0f} m² | 3.5 m²/person (Sphere) |",
        f"| Medical beds | {demand.medical_beds:,} | 2/1,000 + known caseload |",
        f"| Latrines | {demand.latrines:,} | 1 per 20 (Sphere) |",
        f"| Water points | {demand.water_points:,} | 1 per 250 (Sphere) |",
    ]
    if gaps:
        lines += [
            "",
            "**Supply gap vs. declared stock:**",
            "",
            "| Commodity | Required | Available | Shortfall | % met | Cover | Verdict |",
            "|---|---:|---:|---:|---:|---:|---|",
        ]
        for g in gaps:
            cover = f"{g.days_of_cover:.1f}d" if g.days_of_cover is not None else "—"
            lines.append(
                f"| {g.commodity} | {g.required:,.0f} {g.unit} | {g.available:,.0f} | "
                f"{g.shortfall:,.0f} | {g.pct_met:.0%} | {cover} | **{g.verdict}** |"
            )
    return "\n".join(lines)
