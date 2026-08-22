"""Published claims must match what the code actually measures.

The README badge claimed 86% coverage while CI measured 82% for two months,
because the badge was set from a developer environment and nothing ever
re-checked it. A number in a document is a claim, and an unchecked claim drifts.

These tests are deliberately loose on formatting and strict on substance: they
assert the DOCUMENTED values are consistent with the code's own constants and
outputs, so a doc that goes stale fails here instead of in front of a reviewer.
"""
from __future__ import annotations

import json
import re

OVERVIEW = open("PROJECT_OVERVIEW.md", encoding="utf-8").read()


def test_sensitivity_table_matches_the_computed_sweep():
    """The margins quoted in section 5 come from the real sweep, not memory."""
    with open("clients/web/public/data/sensitivity.json", encoding="utf-8") as fh:
        report = json.load(fh)
    flips = {s["parameter"]: s["flip_points"] for s in report["sweeps"]}

    assert flips["stay_fatality_rate"] == [0.0075], "doc quotes a 2.7x margin off 0.0075"
    assert flips["road_egress_pph"] == [2000.0], "doc quotes a 4x margin off 2000/h"
    assert flips["prior_false_alarms"] == [], "doc says cry-wolf never flips"


def test_overview_does_not_sell_on_lines_of_code():
    """Codebase size is an anti-signal; it was cut from the summary deliberately."""
    summary = OVERVIEW.split("## 2. The problem")[0]

    assert "lines of Python" not in summary
    assert "LOC" not in summary


def test_limitations_appear_before_the_capability_tour():
    """Limits are stated in the summary, not buried past the feature list."""
    limits = OVERVIEW.index("Known limits")
    capabilities = OVERVIEW.index("## 4. Capabilities in detail")

    assert limits < capabilities


def test_metrics_are_defined_before_the_results_table():
    results = OVERVIEW.index("## 5. Validation results")
    definition = OVERVIEW.index("*AUC* —")
    table = OVERVIEW.index("| Hazard | Data source |")

    assert results < definition < table


def test_lead_time_is_labelled_hindcast_not_actionable():
    """No live season has scored yet, so the lead figure is hindcast-derived."""
    assert "Hindcast lead" in OVERVIEW
    assert "Actionable lead" not in OVERVIEW


def test_no_p_value_is_published_as_an_equality_at_the_bootstrap_floor():
    """1/251 = 0.003984 is a bound set by the resample count, not a measurement."""
    assert not re.search(r"p ≈ 0\.004\b", OVERVIEW)
    assert not re.search(r"p = 0\.0040\b", OVERVIEW)


def test_published_throughput_is_structurally_reproducible():
    """Pins the STRUCTURE behind the published figures, never the wall-clock.

    The quoted incidents/s and p99 are machine-dependent, so asserting them
    would produce a test that fails on a slow CI runner for reasons unrelated to
    the code. What must stay true is the workload those numbers describe: if the
    DAG stops producing 305 messages and 105 dispatches per 10 incidents, the
    published figures describe a workload that no longer exists.
    """
    from disastermind.benchmarks.harness import drive_n_incidents

    result = drive_n_incidents(10, cycles=1)

    # Dispatches are stable across run order and are the load-bearing count.
    assert result.dispatches == 105
    # messages_processed drifts by +/-1 depending on what ran before it (305 in
    # isolation, 306 after the full suite), so some module-level state leaks
    # between tests. One stray message does not move a published throughput
    # figure, so it is bounded rather than chased -- but it is bounded
    # DELIBERATELY and noted here, not papered over with a loose assert.
    assert abs(result.messages_processed - 305) <= 2


def test_performance_claim_names_its_reproduction_command():
    """A number without a way to regenerate it is a claim, not evidence."""
    summary = OVERVIEW.split("## 2. The problem")[0]

    assert "make benchmark" in summary
    assert "machine-dependent" in summary
