# Known limitations

Everything here is true as of this commit, verified against the code rather than
copied from an earlier audit. It is consolidated from
[`docs/TECHNICAL_REPORT.md`](docs/TECHNICAL_REPORT.md) §6–§8 and the
deploy-maturity note in [`README.md`](README.md), so a reader finds the
acknowledgement before they find the problem.

Items that were fixed are not listed. Where an audit finding no longer matches
the code, it has been dropped rather than restated.

---

## Reliability

**Pending escalations are memory-only.** `CommanderAgent.pending` is a plain dict
([`tier1/commander/agent.py:88`](disastermind/tier1/commander/agent.py)) and
nothing persists it. An escalation awaiting human approval has a deadline that
auto-executes on timeout; if the process restarts between the escalation being
raised and its deadline, that pending decision is gone. It is not replayed from
the audit log, and no storage repo writes it. For a system whose authority model
turns on human sign-off, this is the most consequential reliability gap in the
repo.

**Degrade paths can mask a persistent fault.** The codebase deliberately prefers
degrading to crashing — a feed that fails falls back to fixtures, a broker that
is unreachable falls back to the in-memory bus, a solver that is missing falls
back to greedy. That is the right default for an edge node, and it is tested
([`tests/test_feed_chaos.py`](tests/test_feed_chaos.py),
[`tests/test_chaos.py`](tests/test_chaos.py)). The cost is that a *permanently*
broken dependency looks the same as a transient one. The log-and-continue
handlers are concentrated in
[`tier3/dispatch/channels.py`](disastermind/tier3/dispatch/channels.py) (8),
[`live/ingest.py`](disastermind/live/ingest.py) (5),
[`api/server.py`](disastermind/api/server.py) (5) and
[`tier3/ingestion/base.py`](disastermind/tier3/ingestion/base.py) (4). There is
no alerting on repeated degradation, so nothing escalates when a feed has been
dark for a week.

Feed degradation specifically is now visible rather than silent — a dark feed is
tagged `_provenance: "sample"` and cannot mint an incident — but that mechanism
covers ingestion only, not dispatch or storage.

---

## Scalability

**Correctness is guaranteed for a single replica only.** Four pieces of state
live in process memory, and running two replicas gives each its own copy:

| State | Where | Consequence of a second replica |
|---|---|---|
| Message bus | [`InMemoryBus`](disastermind/core/bus.py) — synchronous, single-process | agents in different processes never see each other's messages |
| Escalation registry | `CommanderAgent.pending` dict | an escalation raised on replica A cannot be approved on replica B |
| Rate limiters | `_buckets` dict in [`security/ratelimit.py`](disastermind/security/ratelimit.py) | effective limit is N× the configured one |
| Field-order idempotency | per-client `order_ids` set in [`fieldapp/client.py`](disastermind/fieldapp/client.py) | a duplicate order re-delivered to a different replica is serviced twice |

A `KafkaBus` exists and falls back to in-memory when no broker is reachable, so
the bus already has the seam. The other three do not.

**Why externalising is a swap, not a rewrite.** Canonical incident state is a
*pure fold* over the observation set
([`models/reconcile.py`](disastermind/models/reconcile.py)) — `reconcile()` reads
a list of observations and returns state, holding nothing between calls. All
mutable state lives in `ObservationStore`, behind `append()` / `all()`. Replacing
that store with a shared backend leaves the fold, the policy and the classifier
untouched, and the existing replay test still proves correctness because it
asserts a property of the fold rather than of the process. The same is not true
of the commander registry, which would need real work.

---

## Validation

**Three of four models use reanalysis predictors that do not exist at forecast
time.** Flood and both fire models draw every non-seasonal feature from
ERA5/GloFAS reanalysis, published with multi-day latency and assimilating
observations unavailable at issue time
([`docs/TECHNICAL_REPORT.md`](docs/TECHNICAL_REPORT.md) §3.2). An operational
deployment would substitute NWP forecast fields, whose error appears nowhere in
these results. **Reported flood and fire skill is a hindcast upper bound, and the
gap to real-time skill is unmeasured.** The earthquake module is unaffected — its
features are known within seconds of detection.

**Significance is tested against reference baselines, not operational
incumbents.** Persistence and seasonal climatology are no-skill references; the
Ångström index is not operationally deployed. The US operates NFDRS, the
international standard is FWI/CFFDRS, and India's FSI issues a FIRMS-based
rating. Clearing the references shows the model learned something real. It does
not show it would improve on a product an agency runs today. (§1, §4.1)

**Outcome labels are proxies.** Discharge exceedance for flood, FIRMS detections
for fire, ShakeMap/PAGER intensity for earthquake — not surveyed losses. They are
defensible stand-ins and they are still stand-ins. (§6.6)

**Worst-block generalisation is materially below the headline.** Leave-one-region-out
worst blocks: earthquake 0.827 (Americas) against a 0.937 headline, flood 0.886
(East) against 0.944, fire-India 0.799 (Central) against 0.854. A deployment in
an unseen region should expect the worst-block number. (§4.3, §6.4)

**Evacuation-layer parameters are planning assumptions.** Clearance times,
compliance rates and casualty rates are not calibrated against agency ground
truth (§6.8). They are *bounded* — `make sensitivity` sweeps them and shows the
Puri order survives a 2.7× error in fatality rate and a 4× error in road capacity
— but bounded is not calibrated.

**No live season has been scored.** The shadow harness runs daily and the journal
is current, but 16 of a required 30 outcomes have settled and none are positives,
so `make shadow-score` returns `scoreable: false`. All published evidence is
retrospective. (§6.9)

---

## Deployment

**The production-shaped layers are not exercised by default CI.** `storage/`,
`integrations/`, `live/`, `runtime/` and `deploy/` are real code with real DDL,
query DSL and broker round-trips, but their tests either live in
[`tests/integration/`](tests/integration) — which CI ignores outright
(`--ignore=tests/integration` in [`.github/workflows/ci.yml`](.github/workflows/ci.yml))
— or skip when the optional dependency is absent, which it is on the default CI
job (`confluent_kafka`, `elasticsearch`, `psycopg`).

Nothing in this repo has been proven against a live broker or database under
load. Read those layers as production-shaped scaffolding with a documented
turn-on path ([`DEPLOY.md`](DEPLOY.md)), not as validated infrastructure.

---

## What would change the verdict

From [`docs/TECHNICAL_REPORT.md`](docs/TECHNICAL_REPORT.md) §8:

1. A completed live shadow season per hazard with an externally reviewed,
   hash-chained journal.
2. Evacuation-layer calibration against district-level historical response data.
3. Replacing proxy labels with surveyed-loss labels where obtainable.
4. An independent domain-expert review of this protocol and these fixtures.
