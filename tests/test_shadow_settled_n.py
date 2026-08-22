"""Scoring floor for the live shadow season (on-site item 13).

With no settled positives, ``roc_auc`` returns a 0.5 sentinel and
``confusion_at`` yields POD 0.0 / FAR 1.0. Those are the UNDEFINED values, but
they render identically to measured catastrophe -- a live season that had
settled only negatives published "AUC 0.5, POD 0%, FAR 100%" about itself.

``score_season`` now refuses to score below the floor and says why instead.
"""
from __future__ import annotations

from disastermind.ml.shadow import MIN_SETTLED_N, ShadowJournal, score_season

UNDEFINED_KEYS = ("auc", "brier", "ece", "confusion", "reliability", "base_rate")


def _season(path, n_settled, n_positive):
    """Journal with ``n_settled`` outcomes, ``n_positive`` of them positive."""
    j = ShadowJournal(str(path))
    for i in range(n_settled):
        j.record_prediction(
            f"eq-{i}",
            hazard="earthquake",
            issued_at="2026-08-22T00:00:00Z",
            window_end="2026-08-22T06:00:00Z",
            # Positives get the higher score so a scoreable season is coherent.
            probability=0.9 if i < n_positive else 0.1,
            threshold=0.5,
            model_version="m1",
        )
        j.attach_outcome(
            f"eq-{i}", occurred=i < n_positive, observed_at="2026-08-22T06:00:00Z"
        )
    return j


def test_no_settled_outcomes_is_not_scoreable(tmp_path):
    j = ShadowJournal(str(tmp_path / "s.jsonl"))
    j.record_prediction(
        "eq-0",
        hazard="earthquake",
        issued_at="2026-08-22T00:00:00Z",
        window_end="2026-08-22T06:00:00Z",
        probability=0.2,
        threshold=0.5,
        model_version="m1",
    )
    card = score_season(j)

    assert card["scoreable"] is False
    assert "no settled outcomes" in card["reason"]
    assert not any(k in card for k in UNDEFINED_KEYS)


def test_all_negative_season_is_not_scoreable(tmp_path):
    """The live case: plenty settled, none positive. AUC would be a 0.5 sentinel."""
    card = score_season(_season(tmp_path / "s.jsonl", MIN_SETTLED_N + 5, 0))

    assert card["scoreable"] is False
    assert card["n_positive"] == 0
    assert not any(k in card for k in UNDEFINED_KEYS), (
        "an all-negative season must publish no skill metric — "
        "POD 0.0 / FAR 1.0 / AUC 0.5 here are undefined, not measured"
    )


def test_too_few_settled_is_not_scoreable(tmp_path):
    card = score_season(_season(tmp_path / "s.jsonl", MIN_SETTLED_N - 1, 3))

    assert card["scoreable"] is False
    assert card["min_settled_n"] == MIN_SETTLED_N
    assert not any(k in card for k in UNDEFINED_KEYS)


def test_real_season_scores(tmp_path):
    """Anchor: past both bars, the metrics come back."""
    card = score_season(_season(tmp_path / "s.jsonl", MIN_SETTLED_N + 5, 6))

    assert card["scoreable"] is True
    assert card["n_positive"] == 6
    assert all(k in card for k in UNDEFINED_KEYS)
