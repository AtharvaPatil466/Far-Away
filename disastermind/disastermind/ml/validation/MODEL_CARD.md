# DisasterMind — Real-Data Validation (all hazards)

_real data only; leak-free features; temporal + blocked-spatial validation; thresholds and calibrators fitted on calibration splits, never on test_

## Earthquake

- **Source:** USGS FDSN historical catalog 2013-2017 (real earthquakes, M4.5+)
- **Label:** damage-grade outcome: ShakeMap MMI>=VI or PAGER alert>=yellow
- **Split:** temporal: train 2013-2015, test 2016-2017 (out-of-sample)
- **Train:** 22697 rows (base rate 1.37%) · **Test:** 13812 rows (base rate 1.41%)

**Headline (calibrated, out-of-sample):** AUC 0.9372 · Brier 0.0107 · ECE 0.002

### vs operational baselines (paired bootstrap on AUC)
| Baseline | Baseline AUC | Model AUC | dAUC [95% CI] | p | significant |
|---|---|---|---|---|---|
| gmpe_attenuation | 0.9587 | 0.9574 | -0.0012 [-0.0086, +0.0061] | 0.6414 | no |

### At the operating point (threshold chosen on calibration split)
- Target POD 90% -> threshold 0.030
- On test: POD 86.15%, FAR 86.53%, CSI 0.132, bias 6.39 (tp=168, fp=1079, fn=27)
- Cost model (miss:false-alarm = 100:1): test cost 3779 at the cost-optimal threshold

### Calibration + conformal coverage
- ECE raw 0.2102 -> calibrated 0.0020 (isotonic, fit on calibration split)
- Conformal: target coverage 90%, empirical 88.39%, singleton rate 98.49%

### Blocked generalisation
- Leave-one-region-out: worst AUC 0.8271, mean 0.9338 over 4 regions
- Rolling origin: worst AUC 0.946, mean 0.9541 over 3 years

### Fairness audit (shared threshold)
- **region**: FLAGGED (under-protected: europe-africa)
- **magnitude_band**: FLAGGED (under-protected: mag:4.5-5.5)
- **depth_band**: PASS (under-protected: none)

### Rare-severe tail
- M6.0+: 90 events, POD 100.00% [100.00%, 100.00%]
- M6.5+: 46 events, POD 100.00% [100.00%, 100.00%]
- M7.0+: 17 events, POD 100.00% [100.00%, 100.00%]

### Drift + retraining
- Retrain now: **False** (no drift signal fired)
- _Note: PAGER is excluded as a baseline on this label because the label partially derives from PAGER; see felt_vs_pager for that comparison._

### Incumbent check: felt label vs USGS PAGER
- Model AUC 0.7299 vs PAGER 0.5094 (delta +0.2206, p=0.0040)

## Flood

- **Source:** GloFAS-ERA5 river-discharge reanalysis + ERA5 precipitation, 12 Indian river-basin sites, 2010-2023 daily (real outcomes)
- **Label:** discharge reaches the site's train-climatology q95 flood threshold within the next 1-3 days
- **Split:** temporal: train 2010-2018, test 2019-2023 (five held-out monsoons)
- **Train:** 39084 rows (base rate 7.09%) · **Test:** 21876 rows (base rate 5.93%)

**Headline (calibrated, out-of-sample):** AUC 0.9438 · Brier 0.0277 · ECE 0.0037

### vs operational baselines (paired bootstrap on AUC)
| Baseline | Baseline AUC | Model AUC | dAUC [95% CI] | p | significant |
|---|---|---|---|---|---|
| persistence | 0.9339 | 0.9452 | +0.0112 [+0.0083, +0.0143] | 0.0040 | YES |
| seasonal_climatology | 0.8553 | 0.9452 | +0.0899 [+0.0821, +0.0975] | 0.0040 | YES |

### At the operating point (threshold chosen on calibration split)
- Target POD 90% -> threshold 0.063
- On test: POD 88.83%, FAR 75.36%, CSI 0.239, bias 3.60 (tp=1153, fp=3526, fn=145)
- Cost model (miss:false-alarm = 100:1): test cost 11662 at the cost-optimal threshold

### Calibration + conformal coverage
- ECE raw 0.1757 -> calibrated 0.0037 (isotonic, fit on calibration split)
- Conformal: target coverage 90%, empirical 91.47%, singleton rate 87.58%

### Blocked generalisation
- Leave-one-region-out: worst AUC 0.8849, mean 0.9436 over 5 regions
- Rolling origin: worst AUC 0.916, mean 0.9438 over 12 years

### Fairness audit (shared threshold)
- **setting**: PASS (under-protected: none)
- **region**: FLAGGED (under-protected: region:north, region:northeast)
- **basin**: FLAGGED (under-protected: basin:brahmaputra, basin:yamuna)

### Rare-severe tail
- peak >=1.2x flood threshold: 806 events, POD 88.83% [86.48%, 90.82%]
- severe (train q99): 430 events, POD 90.23% [86.51%, 93.26%]

### Drift + retraining
- Retrain now: **False** (no drift signal fired)
- _Note: Flood threshold (q95) and severe threshold (q99) derive from TRAIN years only — the test period cannot define its own events._
- _Note: Persistence (today's discharge vs threshold) is the standard operational no-model forecast; beating it is the real bar._

## Fire

- **Source:** USDA FPA-FOD wildfire occurrences + ERA5 fire weather, 12 Pacific-Northwest cells, 2012-2018 daily (real outcomes)
- **Label:** >=1 agency-reported wildfire discovered in the cell on day t+1
- **Split:** temporal: train 2012-2016, test 2017-2018 (incl. the record 2017 season)
- **Train:** 21564 rows (base rate 18.75%) · **Test:** 8748 rows (base rate 19.12%)

**Headline (calibrated, out-of-sample):** AUC 0.838 · Brier 0.1201 · ECE 0.0226

### vs operational baselines (paired bootstrap on AUC)
| Baseline | Baseline AUC | Model AUC | dAUC [95% CI] | p | significant |
|---|---|---|---|---|---|
| angstrom_index | 0.8226 | 0.8388 | +0.0160 [+0.0124, +0.0200] | 0.0040 | YES |

### At the operating point (threshold chosen on calibration split)
- Target POD 90% -> threshold 0.117
- On test: POD 89.18%, FAR 63.01%, CSI 0.354, bias 2.41 (tp=1492, fp=2542, fn=181)
- Cost model (miss:false-alarm = 100:1): test cost 6615 at the cost-optimal threshold

### Calibration + conformal coverage
- ECE raw 0.1987 -> calibrated 0.0226 (isotonic, fit on calibration split)
- Conformal: target coverage 90%, empirical 89.28%, singleton rate 65.51%

### Blocked generalisation
- Leave-one-region-out: worst AUC 0.8164, mean 0.8432 over 4 regions
- Rolling origin: worst AUC 0.8018, mean 0.8362 over 5 years

### Fairness audit (shared threshold)
- **region**: PASS (under-protected: none)
- **state**: PASS (under-protected: none)

### Rare-severe tail
- fire >=100 acres next day: 83 events, POD 96.39% [91.57%, 100.00%]
- fire >=1000 acres next day: 37 events, POD 97.30% [91.89%, 100.00%]

### Drift + retraining
- Retrain now: **False** (no drift signal fired)
- _Note: Study region is OR+WA because that is the public FPA-FOD layer's verified 2012-2018 coverage; provenance is recorded in the fixture._
- _Note: The Angström index baseline is the operational fire-weather formula, computed from the same day's weather as the model's features._
