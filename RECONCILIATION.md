# Conflicting information, and what we do about it

Sources disagree. USGS and India's National Center for Seismology routinely
publish different magnitudes for the same earthquake — different networks,
different scales, neither one wrong. A warning system that picks one silently is
lying by omission; one that shows both without deciding is useless to a
commander. This is how DisasterMind does both: decide, and show the disagreement.

**One command shows you the whole policy:** `make policy`.
**One command replays the demo incident:** `make provenance`.

---

## The store: nothing is ever edited

Every inbound report becomes an **Observation** — `source`, `source_event_id`,
`observed_at`, `received_at`, `payload`, `content_hash` — and is appended, never
modified. The canonical incident is *derived* from the observation set, not
edited in place. Replaying the observations from scratch rebuilds the identical
incident, and a test asserts exactly that.

Two timestamps are kept apart on purpose:

| | meaning |
|---|---|
| `observed_at` | when the **source** says the world was that way |
| `received_at` | when the message reached **us** |

Selection uses only `observed_at`. A slow network therefore cannot rewrite
history, and canonical state is a pure function of the observation *set* — so
**arrival order cannot change the answer**. Convergence isn't something we hope
the tests catch; it's structural.

---

## The policy: three rules, in order

Applied **per field**, independently:

1. **Authority** — the source ranked highest *for that field* wins.
2. **Recency** — among equal authority, the latest `observed_at` wins.
3. **Corroboration** — if authority and recency tie, the value more sources
   report wins.

Authority is per field because expertise is per field: NCS runs the dense
regional network, USGS runs the better global depth inversion. Neither agency
outranks the other on magnitude, so magnitude falls through to recency and
corroboration.

**If all three tie, the field is UNRESOLVED.** We do not invent a winner. The
disagreement is displayed, and — on fields where a higher value means higher
consequence — the more cautious candidate is carried forward so the
recommendation errs toward safety while a human resolves it. Withholding the
value entirely would silently *downgrade* the warning, which is the more
dangerous failure.

Conflicts are never collapsed. A selected field carries its losing candidates as
flagged alternatives, so "USGS 6.2 / NCS 5.8" stays on screen.

---

## What counts as MEANINGFUL

A revision is **MEANINGFUL** if it:

- **(a)** crosses a dispatch or escalation threshold, **or**
- **(b)** changes the capstone recommendation
  (`ORDER_BY_DEADLINE` / `NOT_CLEARABLE_VERTICAL` / `BELOW_BREAKEVEN_HOLD` /
  `NO_ACTIONABLE_WARNING`), **or**
- **(c)** exceeds that field's tolerance.

Everything else is **MINOR**. Nothing is ever discarded — minor revisions are
stored, chained and inspectable; they are simply not promoted.

Every revision carries the sentence that classified it:

> *"crossed the magnitude 5.5 dispatch threshold (5.4 → 5.6)"*
> *"sub-tolerance jitter, depth_km 3 < 5"*
> *"magnitude value unchanged (5.6); only the selecting rule moved to
> 'corroboration' — provenance changed, the number did not"*

That string is shown in the UI. It is the evidence that "meaningful" is a rule,
not a mood.

---

## The seven cases

| # | Case | How it is handled |
|---|---|---|
| 1 | **Duplicate** | Same `source_event_id`, identical content hash, or a spatiotemporal match inside tolerance. Produces **no revision**. |
| 2 | **Conflict** | Policy selects a winner; every loser is retained and **flagged** when beyond tolerance. Both values stay on screen. |
| 3 | **Partial match** | Only the reported fields change; untouched fields carry forward untouched. |
| 4 | **Out-of-order** | An earlier `observed_at` arriving later **does not rewrite** newer state. It is stored, it participates in every future fold, and it appears in the timeline as a `LATE_CORRECTION` marked *recorded, not applied*. |
| 5 | **Retraction** | Existential, not a value change: the source's value leaves canonical state rather than reverting. The observation is retained. A source may retract **only its own** report — one agency cannot veto another. |
| 6 | **Three-way** | Two agree, one dissents: corroboration breaks the tie and the count is recorded as the reason. |
| 7 | **Oscillation** | Values flipping either side of a tolerance boundary classify as MINOR every time. The churn is suppressed from the promoted view; the underlying observations are all still there. |

Plus the case that has no happy answer:

| # | Case | How it is handled |
|---|---|---|
| 8 | **Deadlock** | Authority, recency and corroboration all tie on different values. Reported as **UNRESOLVED** with both candidates visible. No consensus is claimed. |

---

## Inspecting it

**Console → PROVENANCE** (a primary view, not a debug panel):

- **Timeline** — timestamp, source, what changed, why it mattered. Meaningful
  rows are visually dominant; minor rows are present but recessive.
- **MEANINGFUL-ONLY toggle** — switching it reports *how many* revisions were
  suppressed and *on what grounds*, rather than quietly shortening the list.
- **Revision detail** — click any row for the before/after diff, the causing
  observation and its payload, the rule that fired, and the classification reason.
- **WHY panel, per field** — every source's value, which won, under which rule,
  corroboration count, and the flagged alternatives that remain.
- Retractions and late corrections are visually distinct from ordinary updates.

**API:** `GET /incidents/{id}/history` (filterable, returns the counts),
`GET /incidents/{id}/observations`, `GET /incidents/{id}/field/{name}`,
`GET /policy/reconciliation`.

---

## It is part of the audit trail, not beside it

Every revision is appended to the **existing** hash chain via the same
`DecisionLogger` every agent already uses. There is no second chain and no
second store. `make verify-audit` covers change history automatically, and
tampering with a revision entry fails the same verification that protects every
other decision. A test proves it.

---

## The demo incident

One earthquake, three real agencies, computed live from committed observations
(`make provenance` — no network, fixed values):

| | | outcome |
|---|---|---|
| t0 | USGS initial M5.4 | `BELOW_BREAKEVEN_HOLD` |
| t1 | USGS redelivers the same report | **no revision** |
| t2 | NCS reads M5.6 | conflict flagged, both shown, crosses M5.5 threshold |
| t3 | USGS refines depth 10 → 13 km | recorded, **MINOR** |
| t4 | EMSC corroborates NCS | corroboration becomes the selecting rule |
| **t5** | **USGS revises to M6.2** | **→ `ORDER_BY_DEADLINE` (MEANINGFUL)** |
| t6 | EMSC report observed earlier, delivered now | recorded, **not applied** |
| t7 | USGS retracts its magnitude | recommendation falls back — existential change |
| t8 | EMSC 6.4 vs NCS 5.8, everything ties | **UNRESOLVED** — no winner invented |

t5 is the centrepiece: a single upward revision moves the system from *hold* to
*order the evacuation*, through the real decision layer, with the reason printed
next to it.
