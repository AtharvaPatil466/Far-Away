"""Reconciliation policy — the single source of truth, written to be READ.

Every tolerance, ranking and threshold used to turn many conflicting reports
into one canonical incident lives in this module and nowhere else. That is
deliberate: a policy a reviewer can read in ninety seconds is worth more than a
cleverer one buried across five files. :func:`render` prints it verbatim
(``make policy``), so what the system does and what the document claims cannot
drift apart.

THE THREE RULES, IN ORDER
=========================
For each field independently:

  1. AUTHORITY   -- the source ranked highest for THAT field wins.
  2. RECENCY     -- among equally authoritative sources, the latest
                    ``observed_at`` wins (never ``received_at``; see below).
  3. CORROBORATION -- if authority and recency both tie, the value reported by
                    the most independent sources wins.

If all three tie, the field is **UNRESOLVED**. The system does not invent a
winner; it says so, keeps every candidate visible, and lets a human decide.
That outcome is a feature, not a gap -- an arbitrary pick that looks confident
is the more dangerous failure.

WHY observed_at AND received_at ARE DIFFERENT FIELDS
====================================================
``observed_at`` is when the source says the world was that way. ``received_at``
is when the message reached us. Ranking on ``received_at`` would let a slow
network rewrite history. Because selection uses only ``observed_at``, canonical
state is a pure function of the observation SET -- so replaying the same
observations in any arrival order converges to the same answer, by construction
rather than by testing luck.

MEANINGFUL vs MINOR
===================
A revision is MEANINGFUL when it (a) crosses a dispatch/escalation threshold,
(b) changes the capstone recommendation, or (c) exceeds the field's tolerance.
Everything else is MINOR. Nothing is ever discarded -- MINOR revisions are
recorded, stored and inspectable; they are merely not promoted.
"""
from __future__ import annotations

from typing import Any

# --------------------------------------------------------------- authority
#: Per-field source authority. Higher wins. Sources absent from a field's map
#: fall back to ``DEFAULT_AUTHORITY``.
#:
#: The magnitude ranking encodes real agency practice: for events inside India,
#: the India National Center for Seismology operates the dense regional network
#: and revises local magnitudes that USGS computes teleseismically. For depth
#: and location, USGS's global inversion is the stronger estimate. Neither
#: agency is "better" -- authority is per FIELD, which is the whole point of
#: field-level precedence.
SOURCE_AUTHORITY: dict[str, dict[str, int]] = {
    # No agency outranks another on magnitude -- they compute different
    # scales from different networks, so precedence falls through to
    # recency and then corroboration. Depth and location DO have a
    # ranking: USGS's global inversion is the stronger estimate.
    "magnitude": {"india_ncs": 2, "usgs": 2, "emsc": 2},
    "depth_km": {"usgs": 3, "emsc": 2, "india_ncs": 1},
    "lat": {"usgs": 3, "emsc": 2, "india_ncs": 1},
    "lon": {"usgs": 3, "emsc": 2, "india_ncs": 1},
    "place": {"india_ncs": 3, "usgs": 2, "emsc": 1},
}
DEFAULT_AUTHORITY = 1

# --------------------------------------------------------------- tolerances
#: A difference at or below tolerance is NOT a disagreement -- it is measurement
#: noise between instruments, and treating it as news is how a console turns
#: into a slot machine. Values are in each field's own unit.
FIELD_TOLERANCE: dict[str, float] = {
    "magnitude": 0.10,   # Mw; routine inter-agency spread is 0.1-0.3
    "depth_km": 5.0,     # km; shallow-event depth is poorly constrained
    "lat": 0.10,         # degrees, ~11 km
    "lon": 0.10,
}
DEFAULT_TOLERANCE = 0.0

# ------------------------------------------------------- duplicate matching
#: Two reports without a shared ``source_event_id`` are still the same event if
#: they land inside ALL of these windows.
DUPLICATE_TIME_WINDOW_S = 120.0
DUPLICATE_DISTANCE_DEG = 0.50
DUPLICATE_MAGNITUDE_DELTA = 0.50

# ------------------------------------------------------------- meaningful
#: Crossing one of these promotes a revision to MEANINGFUL regardless of how
#: small the numeric step was. A 0.02 step from 5.99 to 6.01 matters; the same
#: step from 5.50 to 5.52 does not.
DISPATCH_THRESHOLDS: dict[str, tuple[float, ...]] = {
    "magnitude": (4.5, 5.5, 6.0, 6.5, 7.0),
    "depth_km": (70.0,),
}

#: Recommendations whose change is ALWAYS meaningful, no exceptions.
CAPSTONE_RECOMMENDATIONS = (
    "NO_ACTIONABLE_WARNING",
    "BELOW_BREAKEVEN_HOLD",
    "NOT_CLEARABLE_VERTICAL",
    "ORDER_BY_DEADLINE",
)

# ------------------------------------------------------------- retraction
#: Payload marker by which a source withdraws a prior report. A retraction is an
#: EXISTENTIAL change, not a value change: the field leaves canonical state
#: entirely rather than reverting to a previous number.
RETRACTION_KEY = "retracted"


# ------------------------------------------------- magnitude -> risk hook
#: How canonical magnitude becomes the event probability the EXISTING capstone
#: (``evacuation.decide_zone_evacuation``) consumes. Piecewise-linear and
#: monotone, so a magnitude revision moves the recommendation through the real
#: decision layer rather than through a lookup table invented for the demo.
#: Anchors are the same magnitude bands used by DISPATCH_THRESHOLDS.
MAGNITUDE_P_EVENT_ANCHORS: tuple[tuple[float, float], ...] = (
    (4.5, 0.05),
    (5.5, 0.15),
    (6.0, 0.40),
    (6.5, 0.75),
    (7.0, 0.90),
)

#: Alert threshold of the synthetic trajectory handed to the capstone. Low
#: enough that a moderate quake still produces an actionable lead, so the
#: BELOW_BREAKEVEN_HOLD branch (lead exists, cost does not justify moving) is
#: reachable rather than collapsing into NO_ACTIONABLE_WARNING.
DEMO_TRAJECTORY_THRESHOLD = 0.05

#: The zone the capstone is evaluated against in the provenance demo. Real Puri
#: figures, matching the evacuation fixtures already in the repo.
DEMO_ZONE = {
    "zone_id": "Puri",
    "population": 200_500,
    "road_egress_pph": 8_000.0,
    "assisted_egress_pph": 4_000.0,
}


def p_event_for_magnitude(magnitude: float | None) -> float:
    """Monotone magnitude -> P(event) used to drive the existing capstone."""
    if magnitude is None:
        return 0.0
    m = float(magnitude)
    anchors = MAGNITUDE_P_EVENT_ANCHORS
    if m <= anchors[0][0]:
        return anchors[0][1]
    if m >= anchors[-1][0]:
        return anchors[-1][1]
    for (m0, p0), (m1, p1) in zip(anchors, anchors[1:]):
        if m0 <= m <= m1:
            span = m1 - m0
            return p0 + (p1 - p0) * ((m - m0) / span if span else 0.0)
    return anchors[-1][1]


#: Fields where a HIGHER value means higher consequence. When reconciliation
#: deadlocks on one of these, the higher candidate is carried forward so the
#: recommendation errs toward caution while the field is flagged UNRESOLVED for
#: a human. Withholding the value entirely would silently downgrade the
#: recommendation, which is the more dangerous failure in a warning system.
FAIL_TOWARD_CAUTION_FIELDS = ("magnitude",)


def authority_of(source: str, field: str) -> int:
    """Authority of ``source`` for ``field``. Higher wins."""
    return SOURCE_AUTHORITY.get(field, {}).get(source, DEFAULT_AUTHORITY)


def tolerance_of(field: str) -> float:
    """Largest difference in ``field`` still considered agreement."""
    return FIELD_TOLERANCE.get(field, DEFAULT_TOLERANCE)


def crossed_threshold(field: str, before: Any, after: Any) -> float | None:
    """The threshold crossed between ``before`` and ``after``, if any."""
    if before is None or after is None:
        return None
    try:
        lo, hi = sorted((float(before), float(after)))
    except (TypeError, ValueError):
        return None
    for threshold in DISPATCH_THRESHOLDS.get(field, ()):
        if lo < threshold <= hi:
            return threshold
    return None


def render() -> str:
    """The active policy as printable text. Kept honest by a test."""
    lines = [
        "DisasterMind — reconciliation policy (active values)",
        "=" * 62,
        "",
        "PRECEDENCE, applied per field, in order:",
        "  1. authority      highest-ranked source for that field wins",
        "  2. recency        latest observed_at (never received_at)",
        "  3. corroboration  most independent sources reporting the value",
        "  ~. UNRESOLVED     all three tie -> no winner is invented",
        "",
        "SOURCE AUTHORITY (higher wins)",
    ]
    for field, ranking in SOURCE_AUTHORITY.items():
        ordered = ", ".join(
            f"{s}={a}" for s, a in sorted(ranking.items(), key=lambda kv: -kv[1])
        )
        lines.append(f"  {field:<12} {ordered}")
    lines += ["", "FIELD TOLERANCE (at or below = agreement, not news)"]
    for field, tol in FIELD_TOLERANCE.items():
        lines.append(f"  {field:<12} +/- {tol}")
    lines += [
        "",
        "DUPLICATE MATCH (all must hold, absent a shared source_event_id)",
        f"  time window      {DUPLICATE_TIME_WINDOW_S} s",
        f"  distance         {DUPLICATE_DISTANCE_DEG} deg",
        f"  magnitude delta  {DUPLICATE_MAGNITUDE_DELTA}",
        "",
        "MEANINGFUL if ANY holds (else MINOR — recorded, never discarded)",
        "  (a) crosses a dispatch threshold:",
    ]
    for field, thresholds in DISPATCH_THRESHOLDS.items():
        lines.append(f"        {field:<10} {list(thresholds)}")
    lines += [
        "  (b) changes the capstone recommendation:",
        f"        {' -> '.join(CAPSTONE_RECOMMENDATIONS)}",
        "  (c) exceeds the field tolerance listed above",
        "",
        "RETRACTION",
        f"  marker '{RETRACTION_KEY}' removes the field from canonical state;",
        "  the observation itself is retained and stays inspectable.",
    ]
    return "\n".join(lines)
