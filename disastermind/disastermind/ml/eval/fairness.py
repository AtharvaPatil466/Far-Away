"""Fairness audit — does the model systematically under-protect anyone?

The PRD's equity premise makes this a validation REQUIREMENT, not a nicety: a
model that is accurate on average but blind to rural floodplain villages (or to
moderate quakes in poorly-instrumented regions) fails the mission even with a
beautiful AUC. This module measures, per declared subgroup,

  * **POD at the shared operating threshold** — the life-safety number. The
    threshold is GLOBAL (one dispatch policy), so a subgroup whose events score
    systematically lower than others' shows up as a POD gap here.
  * FAR, AUC, base rate and n — context for interpreting the gap.

and flags any subgroup whose POD falls more than ``tolerance`` below the overall
POD (with an ``n`` floor so tiny groups don't produce noise-flags). The output is
a publishable audit table: groups, numbers, flags — no averaging anything away.

Group keys are caller-supplied strings (e.g. ``"setting:rural"``,
``"region:northeast"``, ``"mag:6-7"``), so each hazard dataset decides its own
equity axes and the audit machinery stays generic. Stdlib only, deterministic.
"""
from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from .decision import confusion_at
from .metrics import roc_auc


@dataclass(frozen=True)
class GroupReport:
    """Audit row for one subgroup at the shared operating threshold."""

    group: str
    n: int
    positives: int
    pod: float | None  # None when the group has no positive events to detect
    far: float
    auc: float | None  # None when single-class (undefined)
    base_rate: float
    under_protected: bool

    def to_dict(self) -> dict[str, Any]:
        return {
            "group": self.group,
            "n": self.n,
            "positives": self.positives,
            "pod": self.pod,
            "far": self.far,
            "auc": self.auc,
            "base_rate": self.base_rate,
            "under_protected": self.under_protected,
        }


def audit_subgroups(
    y_true: Sequence[int],
    y_prob: Sequence[float],
    groups: Sequence[str],
    *,
    threshold: float,
    tolerance: float = 0.05,
    min_n: int = 30,
) -> dict[str, Any]:
    """Per-subgroup performance at the SHARED ``threshold``, with gap flags.

    A group is flagged ``under_protected`` when it has at least ``min_n`` rows,
    at least one real event, and its POD is more than ``tolerance`` below the
    overall POD. Returns the overall row, every group row, and the flagged list
    — i.e. the audit is published in full, including the uncomfortable rows.
    """
    if not (len(y_true) == len(y_prob) == len(groups)):
        raise ValueError("y_true / y_prob / groups length mismatch")
    overall = confusion_at(y_true, y_prob, threshold)
    overall_pod = overall.pod

    rows: list[GroupReport] = []
    for g in sorted(set(groups)):
        idx = [i for i, gg in enumerate(groups) if gg == g]
        yt = [y_true[i] for i in idx]
        yp = [y_prob[i] for i in idx]
        c = confusion_at(yt, yp, threshold)
        n_pos = sum(1 for v in yt if v)
        pod = c.pod if n_pos else None
        flagged = (
            len(idx) >= min_n
            and n_pos > 0
            and pod is not None
            and pod < overall_pod - tolerance
        )
        rows.append(
            GroupReport(
                group=g,
                n=len(idx),
                positives=n_pos,
                pod=pod,
                far=c.far,
                auc=roc_auc(yt, yp) if 0 < n_pos < len(idx) else None,
                base_rate=n_pos / len(idx) if idx else 0.0,
                under_protected=flagged,
            )
        )

    flagged = [r.group for r in rows if r.under_protected]
    return {
        "threshold": threshold,
        "tolerance": tolerance,
        "min_n": min_n,
        "overall": {"n": overall.n, "pod": overall_pod, "far": overall.far},
        "groups": [r.to_dict() for r in rows],
        "under_protected_groups": flagged,
        "passed": not flagged,
    }
