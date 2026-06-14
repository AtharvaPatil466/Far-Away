# DisasterMind — Multi-Agent Disaster Coordination (Group A)

[![CI](https://github.com/AtharvaPatil466/Far-Away/actions/workflows/ci.yml/badge.svg)](https://github.com/AtharvaPatil466/Far-Away/actions/workflows/ci.yml)
[![shadow season](https://github.com/AtharvaPatil466/Far-Away/actions/workflows/shadow-season.yml/badge.svg)](https://github.com/AtharvaPatil466/Far-Away/actions/workflows/shadow-season.yml)
![Tests](https://img.shields.io/badge/tests-1109%20py%20%2B%2017%20web-brightgreen)
![Coverage](https://img.shields.io/badge/coverage-86%25-brightgreen)
![Typecheck](https://img.shields.io/badge/mypy-core%20gated-blue)
![Python](https://img.shields.io/badge/python-3.11%20%7C%203.12%20%7C%203.13-blue)
![Core deps](https://img.shields.io/badge/runtime-stdlib--only-success)

A multi-agent system that detects a disaster, predicts its evolution, optimises
the response, and drives a **bounded-authority** command pipeline to dispatch.
India-focused (IMD / CWC / NCS / ISRO Bhuvan feeds) across three hazard modules:

> **Authority model (read this first).** DisasterMind is *decision-support*: a
> human commander holds authority over every consequential action. Only routine
> field tasking dispatches without sign-off. Any order crossing a defined
> authority threshold — **mass evacuations (> 10,000 people)**, cross-jurisdiction
> resources, military assets, or media broadcast — **requires human approval**
> (auto-executing only on timeout), and a set of high-consequence actions
> (declaring a state of emergency, deploying armed forces, international aid,
> critical-infrastructure requisition) are **human-only and never act without a
> commander**. The system *recommends*; a human *acts* on the decisions that
> matter. See [`disastermind/tier1/commander/matrix.py`](disastermind/tier1/commander/matrix.py).

| Module | Hazard | Activates |
|--------|--------|-----------|
| **A** | Cyclone / Flood | 72 h before projected landfall (IMD alert, gauge ≥ 75% danger, dam discharge, or waterlogging in 3+ zones) |
| **B** | Earthquake | within 90 s of an M4.5+ detection (USGS / NCS) |
| **C** | Urban Fire / Collapse | immediately on threshold breach (3+ brigade calls/zone/10 min, IoT smoke-heat cluster, FIRMS anomaly, or social-NLP collapse cluster) |

## Architecture — three tiers, one message bus

```
                         ┌──────────────────────────────────────────────┐
 TIER 3 (edge,           │  ingestion   IMD·CWC·USGS·FIRMS·ISRO·          │
 no decision authority)  │  agents      Open-Meteo·OWM·NCS                │
                         │  iot         smoke/heat · waterlogging ·        │
                         │  gateways    structural · GPS beacons           │
                         └───────┬───────────────────────┬────────────────┘
                       RAW_FEED  │                        │ IOT_TELEMETRY
                                 ▼                        ▼
                         ┌──────────────────────────────────────────────┐
 TIER 2 (specialist,     │  prediction  A cyclone/flood  gradient-boosted │
 autonomous decisions)   │              B quake impact   HAZUS + Poisson  │
                         │              C fire spread    cellular automata│
                         │                  │ PREDICTION                   │
                         │                  ▼                              │
                         │  cascade     flood-cascade · Omori-Utsu         │
                         │              aftershock · hazmat                 │
                         │                  │ CASCADE                      │
                         │                  ▼                              │
                         │  resource    LP allocation + equity constraint  │
                         │                  │ RESOURCE_PLAN                │
                         │                  ▼                              │
                         │  routing     multi-depot VRP, priority order    │
                         │                  │ ROUTING_PLAN                 │
                         │                  ▼                              │
                         │  field       team tracking + reassignment       │
                         └──────────────────┬───────────────────────────┘
                                            │ FIELD_ORDER
                                            ▼
                         ┌──────────────────────────────────────────────┐
 TIER 1 (commander)      │  commander   authority-matrix review           │
                         │              ├─ autonomous → DISPATCH           │
                         │              └─ escalate   → ESCALATION         │
                         │                 (5-min timeout auto-exec        │
                         │                  unless human-only)             │
                         └───────┬──────────────────────┬─────────────────┘
                        DISPATCH │                       │ ESCALATION
                                 ▼                       ▼
                         ┌───────────────────┐   ┌──────────────────┐
 TIER 3 (edge)           │ dispatch router   │   │ human commander  │
                         │ SMS·FCM·Iridium·  │   │ dashboard        │
                         │ CAP·radio         │   └──────────────────┘
                         └───────────────────┘
```

Agents never call each other directly — they communicate only via **topics** on a
`MessageBus` (see `core/contracts.py::Topic`). This is what makes the system
degrade gracefully and lets any agent be swapped or scaled independently.

### What each model claim is backed by

Every method named in the diagram carries its **evidence tier** — so nothing is
asserted that isn't reproducibly checked. Read this before the metrics table.

| Method (module) | Tier | What backs the claim |
|---|---|---|
| **Logistic risk baseline** (A/B/C) | ✅ **Validated** | The published headline AUC/Brier/ECE. Deterministic, stdlib-only, fixed-seed; `make reproduce` regenerates every number to **Δ = 0** from real fixtures. This is the model the metrics describe. |
| **Gradient-boosted** (XGBoost, A/B) | ✅ **Validated, optional** | `make compare-backends` fits XGBoost on the *identical* splits and scores it against the baseline ([`docs/backend_comparison_golden.json`](docs/backend_comparison_golden.json), tolerance-gated in CI). A real lift on earthquakes (+0.013 AUC), a wash on flood, *no gain* on fire — so the baseline ships as default. Needs `pip install -e .[ml]`. |
| **HAZUS + Poisson** (quake impact) | 🔬 **Implemented physics** | Analytic fragility + casualty model, checked against EMS-98 / HAZUS invariants (collapse = 0.5 at class threshold, vulnerability ordering, intensity attenuation) in [`tests/test_physics_validation.py`](tests/test_physics_validation.py). |
| **Omori-Utsu + G-R** (aftershocks) | 🔬 **Implemented physics** | Modified Omori law, checked against Utsu / Reasenberg-Jones productivity and the Gutenberg-Richter decade-per-magnitude law (same suite). |
| **Cellular automata** (fire spread) | 🔬 **Implemented physics** | Rothermel wind-driven spread + Van Wagner elliptical perimeter, checked for wind/intensity monotonicity and downwind elongation (same suite). |

There is **no deep-CNN flood model** — flood risk is the gradient-boosted/logistic
model on tabular GloFAS-ERA5 features. (An earlier draft of this diagram named a
"U-Net"; it was never implemented, and the claim has been removed.) Each optional
backend lazily imports its library inside a `try/except` and falls back to the
validated baseline when absent, so a clean checkout reproduces the published
metrics exactly with zero optional dependencies.

## Quickstart

```bash
# stdlib-only: no broker, solver, ML lib or network required
python -m pytest -q                      # 1109 tests, all offline (stdlib only)

python - <<'PY'                          # drive a synthetic disaster
from disastermind.orchestration.build import build_system, should_activate, Signals
print(should_activate(Signals(max_seismic_magnitude=6.2)))   # -> Module.EARTHQUAKE
loop = build_system()                    # wires all 19 agents on one in-memory bus
loop.run_once()                          # one 30s-equivalent cycle (no sleep)
print({t: sum(m.topic==t for m in loop.bus.history) for t in {m.topic for m in loop.bus.history}})
PY
```

Run the real wall-clock loop: `loop.run(max_cycles=N)` ticks every
`DM_LOOP_INTERVAL` (default 30 s) while `disaster_active`.

## See it work — the narrated hero demo

```bash
make demo                  # Cyclone Fani (2019); or: make demo STORM=amphan
```

A guided, leak-free command walkthrough of a real cyclone, told as a timeline of
decisions a commander actually faces — *what we know*, *what the system
recommends* (and what stays a human's call), and *the cost of waiting* — at each
forecast cutoff from T−72 h to T−12 h, then scored against the documented outcome
with an explicit honesty boundary.

## A live shadow season is running

The model isn't just validated on history — it's **predicting live**. A scheduled
job pulls the public USGS M4.5+ feed, journals a leak-free impact prediction for
each new earthquake (using the *same* validated model behind the published 0.937
AUC), and settles the real outcome days later — into an append-only, hash-chained
journal at [`shadow/usgs_season.jsonl`](shadow/usgs_season.jsonl) that no one can
curate after the fact.

```bash
make shadow-tick      # pull the live feed, journal new predictions + settle outcomes
make shadow-score     # running scorecard (POD/FAR/AUC/Brier; honest n_unresolved)
make shadow-verify    # prove the hash-chain is intact
```

This is the decisive validation step — predicting on data the model has never
seen — in motion. See [`docs/SHADOW_SEASON.md`](docs/SHADOW_SEASON.md).

## Reproduce the validation numbers (one command)

Every headline metric in [`PROJECT_OVERVIEW.md`](PROJECT_OVERVIEW.md) §5 is
regenerable from the committed real-data fixtures — offline, deterministically,
with no optional dependencies:

```bash
make reproduce        # re-runs the full validation suite and diffs vs docs/validation_golden.json
```

It rebuilds each hazard's out-of-sample **AUC / Brier / ECE** from raw fixtures
(USGS quakes, GloFAS/ERA5 floods, FPA-FOD/FIRMS fires), prints a claimed-vs-
reproduced table, and **exits non-zero on any drift**. A clean checkout
reproduces all 12 metrics exactly (Δ = 0.0000); the same check runs in CI on
every push, so the published table is a continuously-verified artefact rather
than a static claim.

### Optional capabilities (graceful upgrades)

The core runs on the Python standard library with deterministic heuristic
fallbacks. Install extras to swap in the real engines — code auto-detects them:

```bash
pip install -e '.[ml]'        # xgboost, sklearn, shap   (prediction)
pip install -e '.[optimise]'  # pulp, ortools            (resource LP, routing VRP)
pip install -e '.[bus]'       # confluent-kafka          (KafkaBus)
pip install -e '.[storage]'   # psycopg, elasticsearch, minio
pip install -e '.[all]'       # everything
```

## Autonomy & escalation model (Step 7)

The Commander classifies every field order against an authority matrix:

* **Autonomous** → dispatched immediately (deploy within 50 km, reroute teams,
  request mutual aid, requisition fuel, pre-stage medical/boats).
* **Escalation triggers** (human approval, 5-min timeout then auto-execute):
  cross-state resource, military asset, mandatory evacuation > 10 000,
  requisition private infrastructure, media broadcast.
* **Human-only** (agent *never* auto-acts, even on timeout): international aid,
  declaring a state of emergency, armed forces in civil situations, critical
  national infrastructure.

## Equity & priority (Steps 4–5)

Resource allocation weights elderly density, hospital proximity, road
accessibility and informal-settlement density **equally** with urban centres
(`VulnerabilityProfile.weight()`). Evacuation routing serves, in order:
mobility-impaired → elderly → children → hospitalised → general.

## Audit & explainability (Step 9)

Every message is logged through a **tamper-evident SHA-256 hash chain**
(`audit/decision_log.py`); `verify_chain()` detects any retroactive edit. Each ML
prediction logs SHAP-style feature attributions. Durable JSONL locally; optional
Elasticsearch / TimescaleDB / PostGIS / MinIO via `docker-compose.yml`.

## Graceful degradation (Step 10)

* Kafka down → `KafkaBus` fails over to backup brokers, then to in-memory.
* A module that won't import is skipped at boot (`build_system` reports
  `degraded_modules`); the rest run on.
* Heavy libs absent → deterministic stdlib heuristics keep every agent live.

## CLI

```bash
python -m disastermind run --max-cycles 10           # drive the live loop
python -m disastermind simulate A|B|C [--escalate]   # inject a synthetic scenario
python -m disastermind train --out models/           # train per-module ML artifacts
python -m disastermind eval                          # backtest models (AUC/Brier/ECE) + model cards
python -m disastermind doctor                         # system self-check (DAG balance, config, audit)
python -m disastermind serve                          # run the dashboard API (uvicorn)
python -m disastermind verify-audit audit.jsonl      # check the hash-chain
python -m disastermind.demo B                         # narrated end-to-end demo
```

## Extended surface

Built on top of the Group A core (all optional/heavy deps lazy with fallbacks):

* **`llm/`** — Group B escalation layer: `EscalationNarrator` consumes `ESCALATION`
  and emits a human-readable brief on `tier1.escalation_narrative`. Uses Claude
  (`claude-sonnet-4-6`) when an API key is set, else a deterministic template — wired
  into `build_system`.
* **`storage/`** — `PostgisResourceRepo`, `TimescaleTelemetryRepo`,
  `ElasticsearchAuditRepo`, `MinioArtifactStore` + a `Storage` facade (offline by
  default; `Storage.from_settings(live=True)` for real backends).
* **`api/`** — commander dashboard: framework-free `DashboardService` (topic counts,
  incidents, escalation approve/reject) + a thin FastAPI/WebSocket transport.
* **`runtime/`** — `KafkaConsumerRuntime` + `ProcessRunner` (SIGINT graceful stop).
* **`observability/`** — all-topic `MetricsCollector` + Prometheus exposition +
  `health(loop)` — wired into `build_system`.
* **`scenarios/`** — synthetic A/B/C generators behind the CLI `simulate`.

## Layout

```
disastermind/
  core/        contracts (Message/Topic/enums), bus, BaseAgent, config
  models/      geo primitives + domain dataclasses
  audit/       hash-chained DecisionLogger
  tier3/       ingestion (+ live fetch) · iot · dispatch   (no decision authority)
  tier2/       prediction (+ ml seam) · cascade · resource · routing · field
  tier1/       commander  (authority matrix + escalation)
  orchestration/ triggers (Step 1) + coordination loop (Step 10)
  llm/         Group B escalation narrator + decision-support advisor
  storage/     PostGIS · TimescaleDB · Elasticsearch · MinIO repos + facade
  integrations/ real Kafka round-trip, PostGIS/Timescale SQL + DDL, ES query DSL, health
  api/         DashboardService + FastAPI/WebSocket dashboard + uvicorn server
  runtime/     Kafka consumer + process runner
  live/        LiveSystem (real backends) + live feed ingest + resilient polling
  observability/ metrics collector + Prometheus exposition + health
  tracing/     span recorder + all-topic trace collector (per-incident latency)
  security/    opt-in API auth + rate limiting + payload validation
  ml/          XGBoost/sklearn risk models + SHAP; training on REAL fixtures; eval/
               (POD/FAR, significance, blocked CV, conformal, fairness, drift);
               validation/ (real-data multi-hazard validation; docs/validation.md);
               shadow.py (shadow-mode season journal + external-review export)
  multi_incident/ IncidentManager — concurrent incidents, one DAG per disaster
  ops/         health/readiness, retry, circuit breaker, graceful shutdown, config check
  alerting/    CAP 1.2 emergency-broadcast XML
  fieldapp/    device contracts + MockFieldClient (closes dispatch→ACK→GPS loop)
  benchmarks/  load/throughput harness — python -m disastermind.benchmarks
  diagnostics/ system "doctor" — python -m disastermind.diagnostics
  demo/        narrated end-to-end runner — python -m disastermind.demo
  scenarios/   synthetic A/B/C scenario generators
  cli.py       python -m disastermind {run,simulate,train,eval,doctor,serve,verify-audit}
clients/web/   unified web console (Vite + React): Commander Dashboard, Escalation,
               Field Ops, Post-Incident Report — talks to the dashboard API
deploy/        k8s manifests + sql/schema.sql; Dockerfile, Makefile, CI
tests/         unit + e2e + scenario + perf + integration (integration gated by DM_INTEGRATION)
```

> **Deploy maturity — wired, not yet load-proven.** The `storage/`,
> `integrations/`, `live/`, `runtime/`, and `deploy/` layers (PostGIS · TimescaleDB
> · Elasticsearch · MinIO · Kafka, plus the Dockerfile / k8s / Railway configs)
> are real code with contract-level tests, but those tests are **gated out of the
> default CI** (`DM_INTEGRATION`) and run against ephemeral fixtures — **not** a
> live broker or database under production load. Everything CI proves on every
> push is the offline, stdlib-first core. Read these layers as *production-shaped
> scaffolding with a documented turn-on path* ([`DEPLOY.md`](DEPLOY.md)), not as a
> system already validated at runtime scale.
