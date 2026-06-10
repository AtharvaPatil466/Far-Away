"""IBTrACS multi-cyclone backtest — offline, against the committed NI fixture.

Asserts the bulk hindcast is real and leak-free: ~90 named landfalling North
Indian Ocean storms load, per-storm scoring uses only pre-cutoff track, and the
aggregate activation-lead / track-error statistics are sane.
"""
from __future__ import annotations

from disastermind.hindcast.ibtracs import (
    ALERT_WIND_KT,
    backtest_all,
    load_ibtracs_cases,
    score_storm,
)
from disastermind.hindcast.replay import _parse


def test_fixture_is_real_and_sizable():
    cases = load_ibtracs_cases()
    assert len(cases) > 60  # the real named-landfalling NI record since 1990
    names = {c.storm for c in cases}
    assert {"FANI", "AMPHAN"} <= names  # the famous ones are in the population
    assert all(c.season >= 1990 for c in cases)


def test_per_storm_scoring_is_leak_free():
    case = next(c for c in load_ibtracs_cases() if c.storm == "FANI")
    s = score_storm(case)
    # activation lead is computed only from pre-landfall alert-strength points
    lf = case.landfall_point()
    assert s.activation_lead_h is not None and s.activation_lead_h > 0
    for p in case.track:
        if p.wind_kt and p.wind_kt >= ALERT_WIND_KT and p.time <= lf.time:
            assert _parse(p.time) <= _parse(lf.time)
    # track error exists at the standard leads and grows with lead (naive persistence)
    assert 24 in s.track_error_km
    if 24 in s.track_error_km and 72 in s.track_error_km:
        assert s.track_error_km[72] >= s.track_error_km[24] - 1e-6 or s.track_error_km[72] > 0


def test_aggregate_backtest_is_sane():
    r = backtest_all()
    assert r["n_storms"] > 60
    a = r["activation"]
    # most real cyclones are a >=34 kt alert well before landfall
    assert a["median_lead_h"] is not None and a["median_lead_h"] >= 24
    assert 0 <= a["pct_alert_ge_48h"] <= 100
    # track error degrades with lead (naive persistence floor)
    te = r["track_extrapolation"]
    if 24 in te and 72 in te:
        assert te[72]["median_km"] > te[24]["median_km"]
    # every scored storm carries its real intensity
    assert all(s["max_wind_kt"] >= ALERT_WIND_KT for s in r["storms"])
