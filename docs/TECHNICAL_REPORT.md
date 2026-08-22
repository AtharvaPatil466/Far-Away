# DisasterMind: a leak-free, reproducible evaluation of multi-hazard early-warning models

**Technical report — v1.0**
Author: Atharva Patil · Generated against committed real-data fixtures · Reproduce with `make reproduce`

---

## Abstract

DisasterMind is a decision-support platform for multi-hazard disaster early
warning (cyclone/flood, earthquake, fire). This report evaluates its prediction
layer on **real historical data only**, under a strictly leak-free protocol:
temporal splits, operating thresholds and probability calibrators fit on a
calibration split and never on the test set, paired-bootstrap significance tests
against published *reference* baselines, blocked
cross-validation that reports the *worst* held-out block rather than the average,
and calibrated uncertainty with verified coverage. Every number below is
regenerated from committed fixtures by a single command and re-checked in CI.

The model under test is deliberately simple — one deterministic, standard-library
logistic regression per hazard, no gradient boosting, no network, no optional
dependencies. The claim is **not** state-of-the-art accuracy; it is that an honest,
reproducible pipeline already clears the **reference** baselines on three of four
hazards with statistical significance, while being transparent about where it does
not. These references are not the systems an agency operates today (see §1); no
claim is made here about clearing an operational forecast product. A dedicated failure-analysis section (§6) states the weaknesses plainly.

---

## 1. Problem and contribution

Disaster-warning systems are usually evaluated on average-case accuracy, on
random shuffles that leak future information into the past, or on synthetic data.
None of these earn the trust an evacuation decision requires. The contribution of
this work is **evaluation discipline as a first-class engineering artefact**:

1. A leak-free, temporal, blocked-spatial validation protocol applied uniformly
   across four hazard datasets.
2. Significance testing against a published **reference baseline** per hazard:
   GMPE ground-motion attenuation for earthquakes, persistence and seasonal
   climatology for floods, the Ångström fire-danger index for fire.

   These are references, **not operational incumbents**, and the distinction is
   load-bearing. Persistence and seasonal climatology are explicitly *no-skill*
   references — beating them establishes that the model has learned something,
   not that it would displace a forecaster's tool. The Ångström index is not in
   operational use: the US operates NFDRS, the international standard is
   FWI/CFFDRS, and India's FSI issues a FIRMS-based fire-danger rating. An
   earlier draft of this report described these as the incumbents a forecaster
   uses today; that was wrong and is corrected here. **No result changes** — only
   the claim attached to it. Comparison against an operational product (NFDRS,
   FWI, GloFAS's own reforecast skill) remains future work, and is listed in §8.
3. **One-command reproducibility** (`make reproduce`): every headline metric
   regenerates from raw fixtures, offline and deterministically, and the same
   check runs in CI on every push.
4. An honest accounting of failure modes (§6) and threats to validity (§7).

---

## 2. Methodology

**Splits.** Every hazard uses a temporal train/test split — the test set is
strictly later in time than the training set. There is no random shuffle. Spatial
generalisation is measured separately by leave-one-region-out CV.

**No test-set leakage.** The operating threshold (chosen for a target
Probability-of-Detection of 0.9) and the isotonic calibrator are both fit on a
**calibration split** carved from training data. The test set is touched once, for
reporting only.

**Significance.** Model-minus-baseline skill is tested with a paired bootstrap
(resampling test instances), reporting Δ, a 95% CI, and a p-value. "Better on
average" is not claimed; statistical significance at the 5% level is.

**Calibration & uncertainty.** Probabilities are recalibrated with isotonic
regression (fit on calibration, measured on test via Expected Calibration Error),
and split-conformal prediction sets are produced with their empirical coverage
verified against the 90% target.

**Generalisation.** Leave-one-region-out and rolling-origin CV are run per hazard;
the **worst** block is reported next to the mean, because "works on average" is not
"works in the held-out basin."

---

## 3. Data

| Hazard | Source | Coverage | Split |
|---|---|---|---|
| Earthquake | USGS FDSN catalog (M4.5+) | ~36,500 events, 2013–2017 | train 2013–15 / test 2016–17 |
| Flood | GloFAS-ERA5 discharge + ERA5 rain | 12 Indian basins, 2010–2023 | train 2010–18 / test 2019–23 (5 monsoons) |
| Fire (PNW) | USDA FPA-FOD + ERA5 | 12 Pacific-NW cells, 2012–2018 | train 2012–16 / test 2017–18 |
| Fire (India) | NASA FIRMS VIIRS + ERA5 | 10 Indian fire-belt cells, 2015–2024 | train 2015–21 / test 2022–24 (3 seasons) |

### 3.1 Unit of analysis and base rate

FAR, CSI, bias and Brier cannot be read without these. A 0.87 false-alarm ratio
at a 1.4% base rate and at a 42.6% base rate describe completely different
systems, and the same Brier score means opposite things at each.

| Hazard | Unit of analysis (one row =) | Train rows | Test rows | Train base rate | **Test base rate** |
|---|---|---:|---:|---:|---:|
| Earthquake | one M4.5+ catalogued event | 22,697 | 13,812 | 1.37% | **1.41%** |
| Flood | one gauge-site day | 39,084 | 21,828 | 7.09% | **5.95%** |
| Fire (PNW) | one grid-cell day | 21,564 | 8,724 | 18.75% | **19.18%** |
| Fire (India) | one grid-cell day | 25,270 | 10,930 | 40.68% | **42.56%** |

Two consequences worth stating rather than leaving to the reader. The earthquake
task is a **rare-event** problem (1.41% positives), which is why its Brier score
is small in absolute terms and why FAR is high at any useful POD. The India fire
task is near-**balanced** (42.56%), so its comparatively strong CSI (0.60) is not
evidence that the model is better there — an easier base rate flatters it.

All fixtures are committed, citable, and carry provenance. The suite runs fully
offline against them; a separate fetch utility rebuilds them from the free public
APIs.

### 3.2 Real-time feature availability

Every model is evaluated on features drawn from **reanalysis**, not from what a
forecaster would hold at decision time. Stated plainly, per hazard:

| Hazard | Features | Available at forecast time? |
|---|---|---|
| Earthquake | `magnitude`, `depth_km`, `abs_latitude`, `ocean_proxy`, `gmpe_attenuation` | **Yes.** All derive from the catalogued event itself and are known within seconds of detection. This module is rapid impact assessment, so "forecast time" is post-detection. |
| Flood | `precip_1d/3d/7d/30d`, `discharge_pctl`, `discharge_ratio`, `discharge_trend_3d`, `doy_sin/cos` | **No — ERA5/GloFAS reanalysis.** Precipitation and discharge come from reanalysis, published with a multi-day latency and assimilating observations unavailable at issue time. Operationally these would have to be replaced by NWP *forecast* fields (or GloFAS forecast products), which carry their own error. |
| Fire (PNW) | `tmax_c`, `rh_min_pct`, `wind_max_kmh`, `days_since_rain`, `precip_30d`, `dry_streak_30d_cap`, `doy_sin/cos` | **No — ERA5 reanalysis.** Same substitution required: a next-day ignition forecast would need forecast weather, not analysed weather. |
| Fire (India) | as PNW | **No — ERA5 reanalysis.** |

The `doy_sin`/`doy_cos` seasonality terms are the only flood/fire features
available exactly as evaluated.

**What this does and does not invalidate.** The evaluation remains leak-free in
the temporal sense: no feature uses information from after the label window, and
the splits are strictly chronological. What it means is that the reported skill
is an **upper bound** on real-time skill for flood and fire — the operational
version would substitute forecast fields for analysed ones and should be expected
to score lower. The size of that gap has not been measured here. See §7.

> **Note on the India fire model.** This report supersedes earlier material that
> described the India fire model as single-year (2019). It is now trained on
> 2015–2021 and tested out-of-sample on three held-out seasons (2022–2024).

---

## 4. Headline results (out-of-sample, leak-free)

| Hazard | AUC | Brier | ECE (raw → calibrated) | Conformal coverage (target 0.90) |
|---|---:|---:|---:|---:|
| Earthquake | **0.937** | 0.011 | 0.210 → **0.002** | 0.884 |
| Flood | **0.944** | 0.028 | 0.176 → **0.004** | 0.915 |
| Fire (PNW) | **0.837** | 0.121 | 0.199 → 0.023 | 0.892 |
| Fire (India) | **0.855** | 0.153 | 0.058 → 0.015 | 0.901 |

Isotonic recalibration repairs badly miscalibrated raw outputs (earthquake ECE
0.21 → 0.002) without touching the test set.

### 4.1 Versus reference baselines (paired bootstrap)

> **Which model vector this table scores.** The comparisons below are computed on
> the model's **raw (uncalibrated)** probabilities, because the baselines are also
> uncalibrated scores and a paired test must compare like with like. The headline
> table in §3 reports the **calibrated** model, which is what the system ships and
> what `make reproduce` checks. Isotonic calibration is monotone but introduces
> ties, so it moves AUC slightly — which is why flood reads 0.945 here and 0.944
> there, and fire (PNW) 0.838 here and 0.837 there. Both are correct; they are
> different vectors, not a discrepancy. The earthquake gap is larger (raw 0.957,
> calibrated 0.937) and is discussed in §6.

| Hazard | Reference baseline | Model AUC (raw) | Baseline AUC | Δ | p-value | Significant? |
|---|---|---:|---:|---:|---:|:--:|
| Flood | persistence | 0.945 | 0.934 | +0.011 | < 0.004 | **yes** |
| Fire (PNW) | Ångström index | 0.838 | 0.822 | +0.016 | < 0.004 | **yes** |
| Fire (India) | Ångström index | 0.855 | 0.796 | +0.059 | < 0.004 | **yes** |
| Earthquake (damage label) | GMPE attenuation | 0.957 | 0.959 | −0.001 | 0.64 | **no — statistical tie** |

> **On the p-values.** The paired bootstrap draws B = 250 resamples and reports
> `p = (worse + 1) / (B + 1)`, so its smallest attainable value is 1/251 = 0.003984.
> Every `< 0.004` above sits exactly on that floor: not one resample favoured the
> baseline. It is a bound set by the resample count, not a measured quantity, and is
> written as an inequality for that reason. Raising B lowers the bound.

The earthquake module **does not beat** the GMPE reference on the damage label —
it ties it (p = 0.64). This is stated as a tie, not dressed as a win (see §6).

A comparison against USGS PAGER on a *felt-report* label appeared in an earlier
draft of this table and has been removed. It carried no model AUC, no baseline
AUC and no p-value, so it did not belong in a table about significance testing;
and it was a category error — PAGER estimates fatalities and economic loss, not
felt-report propensity, so the two were never measuring the same quantity.

> _The **Model AUC** column is the deterministic, stdlib-only baseline (the
> fixed-seed logistic fit with calibration, per the abstract) — exactly what
> `make reproduce` regenerates. The optional **XGBoost** backend did not produce
> these numbers, but its skill on the identical splits **is** measured by
> `make compare-backends` (earthquake AUC 0.937 → 0.950; flood a wash; fire no
> gain — see [`backend_comparison_golden.json`](backend_comparison_golden.json)),
> so the baseline ships as the default. The physics models (HAZUS+Poisson,
> Omori-Utsu, cellular automata) are validated against literature invariants in
> `tests/test_physics_validation.py`. There is no U-Net / spatial-CNN flood
> model; flood risk is tabular only._

### 4.2 Decision quality at the dispatch threshold (target POD = 0.90)

| Hazard | POD | FAR | CSI | Bias |
|---|---:|---:|---:|---:|
| Earthquake | 0.86 | 0.87 | 0.13 | 6.4 |
| Flood | 0.89 | 0.75 | 0.24 | 3.6 |
| Fire (PNW) | 0.89 | 0.63 | 0.35 | 2.4 |
| Fire (India) | 0.92 | 0.37 | 0.60 | 1.5 |

High POD is bought with high false-alarm ratios. This is an honest operational
cost, not a footnote — see §6.2.

### 4.3 Generalisation — worst held-out block

| Hazard | LORO mean AUC | LORO **worst** AUC (block) | Rolling-origin worst AUC |
|---|---:|---:|---:|
| Earthquake | 0.934 | 0.827 (Americas) | 0.946 |
| Flood | 0.944 | 0.886 (East) | 0.916 |
| Fire (PNW) | 0.843 | 0.815 | 0.800 |
| Fire (India) | 0.859 | 0.799 (Central) | 0.806 |

The worst region is materially weaker than the headline everywhere; the fire
models in particular drop to ~0.80 on their hardest block.

### 4.4 Flood lead-time vs skill

Actionable warning time is reported as a curve, not a single number. Detection
holds (POD ≈ 0.89) out to 7 days, but discrimination and precision decay:

| Lead | POD | FAR | AUC |
|---:|---:|---:|---:|
| 24 h | 0.90 | 0.40 | 0.98 |
| 48 h | 0.88 | 0.75 | 0.96 |
| 72 h | 0.89 | 0.82 | 0.94 |
| 120 h | 0.89 | 0.85 | 0.92 |
| 168 h | 0.89 | 0.86 | 0.90 |

The "168 h actionable" claim is true for POD but comes with an 86% false-alarm
ratio: at long lead the system detects nearly every flood while crying wolf often.

---

## 5. Reproducibility

```bash
make reproduce
```

re-runs the full validation suite offline against the committed fixtures and
diffs every headline AUC/Brier/ECE against `docs/validation_golden.json`, exiting
non-zero on any drift. On a clean checkout all 12 metrics reproduce to Δ = 0.0000.
CI runs the same check on every push. The full test suite (**1,349** offline,
deterministic tests; 1,355 collected, 6 skipped for absent optional dependencies)
and an 83% enforced coverage floor back the surrounding code.

---

## 6. Failure analysis (read this section)

A report that only lists wins is marketing. These are the real weaknesses.

**6.1 Earthquakes are not forecast.** The earthquake module performs *rapid impact
assessment* given a detected event — it does not predict that an earthquake will
occur. On its damage label it statistically ties the GMPE baseline (p = 0.64), and
on the felt-report label its raw calibration is poor (ECE 0.26). The "evacuation
lead time" framing does not apply to earthquakes and is not claimed for them.

**6.2 The cry-wolf cost is real.** To reach 90% detection, the operating points
accept high false-alarm ratios — 0.87 (earthquake), 0.75 (flood), 0.63 (fire PNW).
Over-warning erodes compliance (the platform models this cry-wolf effect
explicitly), so these operating points are not free. India fire is the exception
(FAR 0.37, CSI 0.60).

**6.3 Long-lead flood warnings are imprecise.** Seven-day flood detection is real
but pairs with an 86% false-alarm ratio (§4.4). The honest statement is "detects
almost every flood a week out, at the cost of frequent false alarms," not "accurate
7 days out."

**6.4 Regional generalisation is weaker than the headline.** Worst-block AUC falls
to ~0.80 for both fire models and 0.827 for earthquakes (Americas). A model
deployed in an unseen region should expect the worst-block number, not the mean.

**6.5 Uncertainty sets are imperfect.** Conformal coverage undershoots the 90%
target for earthquake (0.884) and fire PNW (0.892), and the fire models abstain on
~34% of cells (the prediction set is uninformative there).

**6.6 Labels are proxies.** Outcomes are discharge exceedance (flood), FIRMS
detections (fire), and instrumental intensity / PAGER alerts (earthquake) — not
surveyed losses. They are well-justified proxies, but they are proxies.

**6.7 The model is intentionally simple.** A single stdlib logistic per hazard is
not state of the art. A tuned gradient-boosted model would likely score higher;
the deliberate trade is reproducibility and zero dependencies over peak accuracy.

**6.8 The evacuation layer is uncalibrated.** Clearance times, compliance rates,
and casualty rates are explicit planning assumptions, not yet calibrated against
agency ground truth.

**6.9 No live shadow season has been completed.** The shadow-mode harness and
runner exist and are tested (`docs/SHADOW_SEASON.md`), but no live season has yet
been collected and scored. Until one is, all evidence here is retrospective.

---

## 7. Threats to validity

- **Proxy labels** (§6.6) may diverge from real impact.
- **Fixture selection**: the 12 flood basins / fire cells are a sample; a different
  sample could shift results. LORO is the partial mitigation.
- **Single model family**: conclusions are about this logistic pipeline, not the
  best achievable model.
- **Retrospective evaluation**: the decisive test (live shadow, §6.9) is future
  work.
- **Reanalysis features (flood and both fire models)**: every non-seasonal
  predictor is drawn from ERA5/GloFAS reanalysis (§3.2), which is not available at
  forecast time. Real-time deployment would substitute NWP forecast fields, whose
  own error is not represented anywhere in these results. **The reported flood and
  fire skill is therefore an upper bound on operational skill, and the gap is
  unquantified.** This is the single largest threat on this list. The earthquake
  module is unaffected — its features are known at detection.
- **Reference, not operational, baselines**: persistence and seasonal climatology
  are no-skill references, and the Ångström index is not an operationally deployed
  index (§1). Clearing them does not establish that the model would improve on
  NFDRS, FWI/CFFDRS, or an agency's own forecast product.

---

## 8. What would change the verdict

1. A completed live shadow season per hazard with an externally reviewed,
   hash-chained journal.
2. Evacuation-layer calibration against district-level historical response data.
3. Replacing proxy labels with surveyed-loss labels where obtainable.
4. An independent domain-expert review of this protocol and these fixtures.

---

## 9. Provenance

All sources are public and citable: USGS FDSN, Copernicus/ECMWF ERA5 and GloFAS
(via Open-Meteo), USDA FPA-FOD, NASA FIRMS (VIIRS-SNPP), NOAA IBTrACS. Every
fixture records its origin; `python -m disastermind.ml.validation --json` emits the
full machine-readable report behind every figure in this document.
