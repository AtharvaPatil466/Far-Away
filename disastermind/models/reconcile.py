"""Derive one canonical incident from many conflicting reports — and say why.

Canonical state is a PURE FOLD over the observation set. It is never edited in
place and never depends on arrival order: :func:`reconcile` sorts candidates by
``(authority, observed_at, corroboration)`` across the whole set every time it
runs. Convergence under permuted arrival is therefore structural, not something
the tests have to get lucky about.

History is the derivative. :func:`build_history` re-folds after each arrival and
diffs consecutive states, so every revision is attributable to exactly one
causing observation and the timeline reflects what a commander would have seen.

Conflicts are never silently resolved. A selected field carries its losing
candidates as ``alternatives``, each flagged when it sits beyond tolerance, so
"USGS says 6.1, NCS says 6.4" stays on screen instead of collapsing into a
single confident number.

Stdlib only. Deterministic. No clock reads, no network.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any

from ..evacuation import Horizon, RiskTrajectory
from ..evacuation.decision import decide_zone_evacuation
from .observation import Observation
from .reconcile_policy import (
    CAPSTONE_RECOMMENDATIONS,
    DEMO_ZONE,
    FAIL_TOWARD_CAUTION_FIELDS,
    authority_of,
    crossed_threshold,
    DEMO_TRAJECTORY_THRESHOLD,
    p_event_for_magnitude,
    tolerance_of,
)

MEANINGFUL = "MEANINGFUL"
MINOR = "MINOR"

RULE_AUTHORITY = "authority"
RULE_RECENCY = "recency"
RULE_CORROBORATION = "corroboration"
RULE_RETRACTED = "retracted"
RULE_UNRESOLVED = "unresolved"

KIND_UPDATE = "UPDATE"
KIND_LATE_CORRECTION = "LATE_CORRECTION"
KIND_RETRACTION = "RETRACTION"
KIND_CONFLICT = "CONFLICT"


# --------------------------------------------------------------- structures
@dataclass
class Alternative:
    """A candidate that did not win, kept visible rather than discarded."""

    value: Any
    source: str
    obs_id: str
    observed_at: str
    delta: float | None
    beyond_tolerance: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class FieldSelection:
    """The winning value for one field, plus the full reasoning behind it."""

    field_name: str
    value: Any
    source: str
    obs_id: str
    observed_at: str
    rule: str
    reason: str
    corroboration: int
    alternatives: list[Alternative] = field(default_factory=list)

    @property
    def contested(self) -> bool:
        """True when a losing candidate disagreed beyond tolerance."""
        return any(a.beyond_tolerance for a in self.alternatives)

    def to_dict(self) -> dict[str, Any]:
        return {
            "field": self.field_name,
            "value": self.value,
            "source": self.source,
            "obs_id": self.obs_id,
            "observed_at": self.observed_at,
            "rule": self.rule,
            "reason": self.reason,
            "corroboration": self.corroboration,
            "contested": self.contested,
            "unresolved": self.rule == RULE_UNRESOLVED,
            "alternatives": [a.to_dict() for a in self.alternatives],
        }


@dataclass
class CanonicalState:
    """The incident as currently understood, derived from the whole store."""

    incident_id: str
    fields: dict[str, FieldSelection] = field(default_factory=dict)
    recommendation: str = "NO_ACTIONABLE_WARNING"
    p_event: float = 0.0

    def value(self, name: str) -> Any:
        sel = self.fields.get(name)
        return sel.value if sel else None

    def to_dict(self) -> dict[str, Any]:
        return {
            "incident_id": self.incident_id,
            "recommendation": self.recommendation,
            "p_event": round(self.p_event, 4),
            "fields": {k: v.to_dict() for k, v in self.fields.items()},
            "contested_fields": sorted(k for k, v in self.fields.items() if v.contested),
            "unresolved_fields": sorted(
                k for k, v in self.fields.items() if v.rule == RULE_UNRESOLVED
            ),
        }


@dataclass
class Revision:
    """One meaningful-or-not change, attributable to one observation."""

    seq: int
    at: str
    causing_obs_id: str
    source: str
    kind: str
    changes: list[dict[str, Any]]
    classification: str
    reason: str
    recommendation_before: str
    recommendation_after: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


# ------------------------------------------------------------------- fold
def _numeric_delta(a: Any, b: Any) -> float | None:
    try:
        return abs(float(a) - float(b))
    except (TypeError, ValueError):
        return None


def _candidates(observations: list[Observation], name: str) -> list[Observation]:
    return [o for o in observations if not o.is_retraction and name in o.payload]


def _withdrawn_sources(observations: list[Observation], name: str) -> set[str]:
    """Sources that have withdrawn their own report of ``name``.

    A retraction is SOURCE-SCOPED: USGS withdrawing its magnitude says nothing
    about what NCS reported. Treating one agency's withdrawal as deleting the
    field outright would let any source veto every other, which is not what a
    retraction means. A source that reports again after withdrawing is reinstated.
    """
    withdrawn = set()
    for obs in observations:
        if not obs.is_retraction or name not in obs.retracted_fields():
            continue
        later_report = any(
            o.source == obs.source and name in o.payload and o.observed_at > obs.observed_at
            for o in observations if not o.is_retraction
        )
        if not later_report:
            withdrawn.add(obs.source)
    return withdrawn


def _select(observations: list[Observation], name: str) -> FieldSelection | None:
    """Apply authority -> recency -> corroboration to one field."""
    withdrawn = _withdrawn_sources(observations, name)
    reports = [o for o in _candidates(observations, name) if o.source not in withdrawn]
    if not reports:
        if withdrawn:
            retraction = max(
                (o for o in observations
                 if o.is_retraction and name in o.retracted_fields()),
                key=lambda o: o.observed_at,
            )
            return FieldSelection(
                field_name=name, value=None, source=retraction.source,
                obs_id=retraction.obs_id, observed_at=retraction.observed_at,
                rule=RULE_RETRACTED,
                reason=f"{retraction.source} withdrew this value and no other source stands behind one",
                corroboration=0, alternatives=[],
            )
        return None

    tolerance = tolerance_of(name)

    def corroboration_for(obs: Observation) -> int:
        """How many sources agree with this value inside tolerance."""
        agreeing = set()
        for other in reports:
            delta = _numeric_delta(obs.payload[name], other.payload[name])
            same = other.payload[name] == obs.payload[name] if delta is None else delta <= tolerance
            if same:
                agreeing.add(other.source)
        return len(agreeing)

    ranked = sorted(
        reports,
        key=lambda o: (authority_of(o.source, name), o.observed_at, corroboration_for(o)),
        reverse=True,
    )
    winner = ranked[0]

    # Deadlock on a consequence-bearing field: carry the higher candidate so the
    # recommendation errs toward caution. The field is still flagged UNRESOLVED
    # below -- this decides what the decision layer sees, not whether the
    # disagreement is disclosed.
    if len(ranked) > 1 and name in FAIL_TOWARD_CAUTION_FIELDS:
        top = ranked[0]
        tied = [
            o for o in ranked
            if (authority_of(o.source, name), o.observed_at, corroboration_for(o))
            == (authority_of(top.source, name), top.observed_at, corroboration_for(top))
        ]
        if len(tied) > 1:
            try:
                winner = max(tied, key=lambda o: float(o.payload[name]))
            except (TypeError, ValueError):
                winner = tied[0]
            ranked = [winner] + [o for o in ranked if o is not winner]

    # Which rule actually decided it — reported, not guessed.
    rule, reason = RULE_AUTHORITY, ""
    if len(ranked) > 1:
        runner = ranked[1]
        w_auth, r_auth = authority_of(winner.source, name), authority_of(runner.source, name)
        if w_auth != r_auth:
            rule = RULE_AUTHORITY
            reason = (f"{winner.source} outranks {runner.source} on {name} "
                      f"(authority {w_auth} > {r_auth})")
        elif winner.observed_at != runner.observed_at:
            rule = RULE_RECENCY
            reason = (f"equal authority; {winner.source} observed later "
                      f"({winner.observed_at} > {runner.observed_at})")
        elif corroboration_for(winner) != corroboration_for(runner):
            rule = RULE_CORROBORATION
            reason = (f"equal authority and time; {corroboration_for(winner)} sources "
                      f"corroborate {winner.payload[name]} vs "
                      f"{corroboration_for(runner)} for {runner.payload[name]}")
        elif winner.payload[name] == runner.payload[name]:
            rule = RULE_CORROBORATION
            reason = (f"{corroboration_for(winner)} independent sources report "
                      f"{winner.payload[name]}; agreement, not a tie to break")
        else:
            rule = RULE_UNRESOLVED
            reason = (f"authority, recency and corroboration all tie between "
                      f"{winner.source}={winner.payload[name]} and "
                      f"{runner.source}={runner.payload[name]} — no consensus. The "
                      f"higher-consequence value is carried forward so the "
                      f"recommendation errs toward caution; a human must resolve it")
    else:
        reason = f"only {winner.source} reported {name}"

    alternatives = []
    for other in ranked[1:]:
        delta = _numeric_delta(winner.payload[name], other.payload[name])
        beyond = delta is not None and delta > tolerance
        if delta is None:
            beyond = other.payload[name] != winner.payload[name]
        alternatives.append(Alternative(
            value=other.payload[name], source=other.source, obs_id=other.obs_id,
            observed_at=other.observed_at,
            delta=round(delta, 4) if delta is not None else None,
            beyond_tolerance=beyond,
        ))

    return FieldSelection(
        field_name=name, value=winner.payload[name], source=winner.source,
        obs_id=winner.obs_id, observed_at=winner.observed_at,
        rule=rule, reason=reason, corroboration=corroboration_for(winner),
        alternatives=alternatives,
    )


def _recommendation_for(magnitude: Any) -> tuple[str, float]:
    """Run the EXISTING capstone so a magnitude revision moves a real decision."""
    p = p_event_for_magnitude(magnitude)
    if p <= 0.0:
        return "NO_ACTIONABLE_WARNING", 0.0
    traj = RiskTrajectory(
        "puri", "provenance",
        [Horizon(72, p, far=0.5), Horizon(24, min(1.0, p * 1.15), far=0.4)],
        DEMO_TRAJECTORY_THRESHOLD,
    )
    decision = decide_zone_evacuation(
        DEMO_ZONE["zone_id"], DEMO_ZONE["population"],
        DEMO_ZONE["road_egress_pph"], DEMO_ZONE["assisted_egress_pph"], traj,
    )
    return decision.recommendation, p


def reconcile(incident_id: str, observations: list[Observation]) -> CanonicalState:
    """Derive canonical state from the whole observation set. Order-independent."""
    names: list[str] = []
    for obs in observations:
        for key in list(obs.payload) + list(obs.retracted_fields()):
            if key != "retracted" and key not in names:
                names.append(key)

    state = CanonicalState(incident_id=incident_id)
    for name in sorted(names):
        selection = _select(observations, name)
        if selection is not None:
            state.fields[name] = selection
    state.recommendation, state.p_event = _recommendation_for(state.value("magnitude"))
    return state


# ---------------------------------------------------------------- classify
def classify(changes: list[dict[str, Any]], rec_before: str, rec_after: str) -> tuple[str, str]:
    """MEANINGFUL or MINOR, with the human-readable reason that decided it."""
    if any(c.get("rule") == RULE_UNRESOLVED for c in changes):
        return MEANINGFUL, (
            "reconciliation deadlocked — sources tie on authority, recency and "
            "corroboration, so no value is asserted and a human must decide"
        )

    established = [c["field"] for c in changes if c["before"] is None and c["after"] is not None]
    if established and len(established) == len(changes):
        return MEANINGFUL, (
            f"first report established {', '.join(established)} — there was no "
            f"prior value to compare against"
        )

    if rec_before != rec_after and rec_after in CAPSTONE_RECOMMENDATIONS:
        return MEANINGFUL, f"changed the recommendation: {rec_before} → {rec_after}"

    for change in changes:
        name, before, after = change["field"], change["before"], change["after"]
        if change.get("kind") == RULE_RETRACTED:
            return MEANINGFUL, f"{name} was withdrawn by its source — value no longer stands"
        threshold = crossed_threshold(name, before, after)
        if threshold is not None:
            return MEANINGFUL, f"crossed the {name} {threshold} dispatch threshold ({before} → {after})"

    for change in changes:
        name, before, after = change["field"], change["before"], change["after"]
        delta = _numeric_delta(before, after)
        tol = tolerance_of(name)
        if delta is not None and delta > tol:
            return MEANINGFUL, f"{name} moved {delta:.3g}, beyond its {tol:g} tolerance"

    rule_only = [c for c in changes if c["before"] == c["after"]]
    if rule_only and len(rule_only) == len(changes):
        first = rule_only[0]
        return MINOR, (
            f"{first['field']} value unchanged ({first['after']}); only the "
            f"selecting rule moved to '{first['rule']}' — provenance changed, "
            f"the number did not"
        )

    deltas = []
    for change in changes:
        delta = _numeric_delta(change["before"], change["after"])
        if delta is not None:
            deltas.append(f"{change['field']} {delta:.3g} < {tolerance_of(change['field']):g}")
    detail = "; ".join(deltas) if deltas else "no field moved beyond tolerance"
    return MINOR, f"sub-tolerance jitter, {detail}"


def _diff(before: CanonicalState, after: CanonicalState) -> list[dict[str, Any]]:
    changes = []
    for name in sorted(set(before.fields) | set(after.fields)):
        b, a = before.fields.get(name), after.fields.get(name)
        b_val = b.value if b else None
        a_val = a.value if a else None
        if b_val == a_val and (a.rule if a else None) == (b.rule if b else None):
            continue
        changes.append({
            "field": name,
            "before": b_val,
            "after": a_val,
            "rule": a.rule if a else RULE_RETRACTED,
            "rule_reason": a.reason if a else "field no longer present",
            "kind": RULE_RETRACTED if (a and a.rule == RULE_RETRACTED) else "value",
            "contested": bool(a and a.contested),
        })
    return changes


def build_history(incident_id: str, observations: list[Observation]) -> list[Revision]:
    """Re-fold after each arrival; every revision names its causing observation."""
    revisions: list[Revision] = []
    previous = CanonicalState(incident_id=incident_id)
    newest_seen = ""
    for index, obs in enumerate(observations, start=1):
        # Out-of-order means "observed BEFORE something already delivered" --
        # a property of arrival, not of the observed/received gap, since every
        # observation is trivially received after it was observed.
        arrived_out_of_order = bool(newest_seen) and obs.observed_at < newest_seen
        newest_seen = max(newest_seen, obs.observed_at)

        current = reconcile(incident_id, observations[:index])
        changes = _diff(previous, current)
        if not changes:
            # A late correction that loses to a newer observation changes nothing,
            # but staying silent would hide it. Record the non-event explicitly.
            if arrived_out_of_order:
                revisions.append(Revision(
                    seq=len(revisions) + 1, at=obs.received_at,
                    causing_obs_id=obs.obs_id, source=obs.source,
                    kind=KIND_LATE_CORRECTION, changes=[],
                    classification=MINOR,
                    reason=(f"observed {obs.observed_at} but delivered after a newer "
                            f"report; canonical state unchanged — recorded, not applied"),
                    recommendation_before=previous.recommendation,
                    recommendation_after=current.recommendation,
                ))
            previous = current
            continue

        classification, reason = classify(
            changes, previous.recommendation, current.recommendation
        )
        if obs.is_retraction:
            kind = KIND_RETRACTION
        elif arrived_out_of_order:
            kind = KIND_LATE_CORRECTION
        elif any(c["contested"] for c in changes):
            kind = KIND_CONFLICT
        else:
            kind = KIND_UPDATE

        # A late correction that loses to newer data must SAY it was not applied.
        # Falling back to the generic rule-change wording would let a reader
        # think the stale value had taken effect.
        if kind == KIND_LATE_CORRECTION and all(c["before"] == c["after"] for c in changes):
            reason = (
                f"observed {obs.observed_at} but delivered after a newer report; "
                f"canonical value unchanged — recorded, not applied"
            )

        revisions.append(Revision(
            seq=len(revisions) + 1,
            at=obs.received_at,
            causing_obs_id=obs.obs_id,
            source=obs.source,
            kind=kind,
            changes=changes,
            classification=classification,
            reason=reason,
            recommendation_before=previous.recommendation,
            recommendation_after=current.recommendation,
        ))
        previous = current
    return revisions


# ------------------------------------------------------------- audit chain
def append_revisions_to_chain(logger, incident_id: str, revisions: list[Revision]) -> int:
    """Append each revision to the EXISTING hash chain. Returns the count.

    Uses ``DecisionLogger.record`` -- the same public entry every agent already
    uses -- so change history lands in the one chain ``verify-audit`` already
    walks. No second chain, no second store, and no edit to the audit module:
    tampering with a revision entry breaks the same verification that protects
    every other decision.
    """
    from ..core.contracts import Message, MessageType, Module, Priority, Topic

    written = 0
    for revision in revisions:
        logger.record(Message(
            sender="models.reconcile",
            recipient="audit",
            type=MessageType.ALERT if revision.classification == MEANINGFUL else MessageType.QUERY,
            priority=Priority.HIGH if revision.classification == MEANINGFUL else Priority.INFO,
            payload={"kind": "incident_revision", **revision.to_dict()},
            reasoning=[revision.reason],
            topic=Topic.RAW_FEED,
            module=Module.EARTHQUAKE,
            incident_id=incident_id,
        ))
        written += 1
    return written


def counts(revisions: list[Revision]) -> dict[str, Any]:
    """Totals the inspector displays, so 'suppressed' is a number, not a vibe."""
    meaningful = [r for r in revisions if r.classification == MEANINGFUL]
    minor = [r for r in revisions if r.classification == MINOR]
    by_kind: dict[str, int] = {}
    for revision in revisions:
        by_kind[revision.kind] = by_kind.get(revision.kind, 0) + 1
    return {
        "total": len(revisions),
        "meaningful": len(meaningful),
        "minor": len(minor),
        "suppressed_by_toggle": len(minor),
        "by_kind": by_kind,
    }
