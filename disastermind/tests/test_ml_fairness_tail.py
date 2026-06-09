"""Fairness subgroup audit + rare-severe tail evaluation."""
from __future__ import annotations

from disastermind.ml.eval.fairness import audit_subgroups
from disastermind.ml.eval.tail import SeveritySlice, tail_report


# ------------------------------------------------------------------- fairness
def _two_group_data():
    """Group 'b' systematically scored lower on its real events than group 'a'."""
    y, p, g = [], [], []
    for _ in range(60):
        y += [1, 0]
        p += [0.9, 0.1]
        g += ["a", "a"]
    for _ in range(60):
        y += [1, 0]
        p += [0.3, 0.1]  # real events score under the shared threshold
        g += ["b", "b"]
    return y, p, g


def test_under_protected_group_is_flagged():
    y, p, g = _two_group_data()
    audit = audit_subgroups(y, p, g, threshold=0.5)
    assert audit["under_protected_groups"] == ["b"]
    assert not audit["passed"]
    rows = {r["group"]: r for r in audit["groups"]}
    assert rows["a"]["pod"] == 1.0
    assert rows["b"]["pod"] == 0.0 and rows["b"]["under_protected"]


def test_equal_groups_pass():
    y = [1, 0, 1, 0] * 30
    p = [0.9, 0.1, 0.9, 0.1] * 30
    g = ["a", "a", "b", "b"] * 30
    audit = audit_subgroups(y, p, g, threshold=0.5)
    assert audit["passed"] and audit["under_protected_groups"] == []


def test_tiny_groups_do_not_noise_flag():
    y, p, g = _two_group_data()
    # one stray bad row in a 2-member group must not trigger a flag (min_n)
    y += [1, 0]
    p += [0.1, 0.1]
    g += ["tiny", "tiny"]
    audit = audit_subgroups(y, p, g, threshold=0.5, min_n=30)
    assert "tiny" not in audit["under_protected_groups"]


def test_eventless_group_reports_null_pod_not_a_flag():
    y = [1, 0] * 40 + [0] * 40
    p = [0.9, 0.1] * 40 + [0.1] * 40
    g = ["a", "a"] * 40 + ["quiet"] * 40
    audit = audit_subgroups(y, p, g, threshold=0.5)
    quiet = next(r for r in audit["groups"] if r["group"] == "quiet")
    assert quiet["pod"] is None and not quiet["under_protected"]


# ----------------------------------------------------------------------- tail
def test_tail_slices_report_pod_with_intervals():
    y = [1] * 40 + [0] * 160
    p = [0.9] * 30 + [0.2] * 10 + [0.1] * 160  # 30/40 events detected at 0.5
    sev = [{"mag": 7.5}] * 20 + [{"mag": 5.0}] * 20 + [{"mag": 4.0}] * 160
    rep = tail_report(
        y, p, sev,
        [SeveritySlice("M7+", lambda s: s["mag"] >= 7.0)],
        threshold=0.5, n_boot=100, seed=0,
    )
    s = rep["slices"][0]
    assert s["events"] == 20
    assert s["pod"] == 1.0  # all M7+ events were in the well-scored block
    assert s["pod_ci95"][0] <= s["pod"] <= s["pod_ci95"][1]
    assert s["auc_severe_vs_rest"] > 0.9


def test_empty_slice_is_reported_not_hidden():
    y, p = [1, 0, 1, 0], [0.9, 0.1, 0.8, 0.2]
    sev = [{"mag": 5.0}] * 4
    rep = tail_report(
        y, p, sev,
        [SeveritySlice("M8+", lambda s: s["mag"] >= 8.0)],
        threshold=0.5, n_boot=50, seed=0,
    )
    s = rep["slices"][0]
    assert s["events"] == 0 and s["pod"] is None and s["auc_severe_vs_rest"] is None
