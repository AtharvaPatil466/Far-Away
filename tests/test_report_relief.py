"""IncidentReport surfaces the Sphere-standard relief forecast from population at risk."""
from __future__ import annotations

from disastermind.reporting.reporter import IncidentReporter, ResourceUtilisation
from disastermind.tier2.resource import demand as dm


def test_relief_built_from_population_at_risk() -> None:
    r = IncidentReporter()
    relief = r._build_relief(ResourceUtilisation(population_at_risk=100_000), horizon_days=7)
    assert relief["population_at_risk"] == 100_000
    assert relief["horizon_days"] == 7
    # displaced = pop * default displacement fraction
    assert relief["displaced"] == int(round(100_000 * dm.DEFAULT_DISPLACEMENT_FRACTION))
    d = relief["demand"]
    # Sphere water rate: 15 L/person/day over the horizon.
    assert d["water_litres"] == relief["displaced"] * 15.0 * 7
    assert d["medical_beds"] > 0 and d["latrines"] > 0


def test_relief_empty_when_no_population() -> None:
    r = IncidentReporter()
    assert r._build_relief(ResourceUtilisation(population_at_risk=0)) == {}


def test_report_dict_and_markdown_include_relief() -> None:
    rep = IncidentReporter().generate()  # empty bus -> no population -> empty relief
    assert "relief" in rep.to_dict()
    # With population, the markdown carries the relief section.
    rep.relief = IncidentReporter()._build_relief(ResourceUtilisation(population_at_risk=50_000))
    md = rep.to_markdown()
    assert "Relief Demand (Sphere standard)" in md
    assert "Water:" in md and "Medical beds:" in md
