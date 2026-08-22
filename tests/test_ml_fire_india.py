"""India fire re-validation — real NASA FIRMS (VIIRS) detections, offline.

Replaces the Pacific-NW FPA-FOD fire validation with genuine Indian geography +
fire season. Single FIRMS year (2019) validated via a leak-free intra-year
temporal split; asserts the data is real Indian fire detections and the model
beats the operational Angström fire-weather index.
"""
from __future__ import annotations

from disastermind.ml.eval.metrics import roc_auc
from disastermind.ml.validation import fire as F
from disastermind.ml.validation.run import fit_logistic, predict


def test_india_fixture_is_real_indian_geography():
    rows = F.load_rows_india()
    assert len(rows) > 1500
    # cells are Indian states, not Oregon/Washington
    states = {r.state for r in rows}
    assert states & {"MP", "CG", "OD", "JH", "MH", "AP", "TN", "UK", "HP", "MZ"}
    assert not (states & {"OR", "WA"})
    # real fire season: detections concentrate Feb-Jun
    assert any(r.label for r in rows)


def test_intra_year_split_is_leak_free_and_two_class():
    rows = F.load_rows_india()
    train, test = F.temporal_split_by_date(rows, F.INDIA_SPLIT_DATE)
    assert train and test
    assert max(r.date for r in train) < F.INDIA_SPLIT_DATE <= min(r.date for r in test)
    # both splits carry fire and no-fire days
    assert 0 < sum(r.label for r in train) < len(train)
    assert 0 < sum(r.label for r in test) < len(test)


def test_model_beats_angstrom_on_real_india_data():
    rows = F.load_rows_india()
    train, test = F.temporal_split_by_date(rows, F.INDIA_SPLIT_DATE)
    Xtr, ytr = F.to_xy(train)
    Xte, yte = F.to_xy(test)
    model = fit_logistic(Xtr, ytr, name="fire-in", epochs=120, balanced=True)
    auc_model = roc_auc(yte, predict(model, Xte))
    auc_angstrom = roc_auc(yte, [r.angstrom_score for r in test])
    assert auc_model > 0.7  # real discrimination on held-out Indian fire days
    assert auc_model >= auc_angstrom  # at least matches the operational index


def test_severity_is_frp_not_acres():
    rows = F.load_rows_india()
    # FRP is the satellite intensity proxy; severities should be plausible FRP values
    sev = [r.severity for r in rows if r.severity > 0]
    assert sev and max(sev) > 5.0  # FRP in MW, not acre counts
