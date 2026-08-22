#!/usr/bin/env python3
"""Does the optional XGBoost backend actually beat the stdlib logistic baseline?

The headline validation numbers (``docs/validation_golden.json``, reproduced to
Δ = 0 by ``tools/reproduce.py``) are produced by the **deterministic stdlib
logistic fit** — zero optional dependencies, bit-reproducible on any machine.
That is the model whose skill the project publishes.

This tool answers the obvious follow-up a reviewer asks: *when the optional
``[ml]`` extra IS installed, does the gradient-boosted backend do any better?*
It is the evidence behind the "XGBoost" name in the architecture diagram — so the
name is earned by a reproducible measurement, not asserted.

What it does, per hazard, on the EXACT split the headline uses (every-5th-row
calibration stride, remainder for fit, 12 000-row cap):

  1. Fit the stdlib logistic baseline (epochs=150, balanced) — the headline model.
  2. Fit XGBoost on the *identical* fit rows.
  3. Calibrate BOTH with the same isotonic step (fit on the calibration split).
  4. Score BOTH with the same AUC / Brier / ECE on the untouched test split.

The logistic column re-derives the published headline (a sanity anchor); the
XGBoost column is the new evidence. Unlike ``make reproduce``, the XGBoost column
is **not bit-reproducible** — it depends on the xgboost build and threading — so
it is checked against ``docs/backend_comparison_golden.json`` within a tolerance,
and the comparison is honest about that.

Run:  ``python tools/compare_backends.py``         (table + PASS/FAIL vs golden)
      ``python tools/compare_backends.py --write``  (refresh the golden snapshot)

Requires the optional extra: ``pip install -e .[ml]`` (numpy + xgboost). If those
are absent the tool prints a clear skip notice and exits 0 — the headline does
not depend on it.

Exit code 0 == every backend metric reproduced within tolerance (or cleanly
skipped); 1 == drift beyond tolerance or an unexpected error.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))  # import the package from a clean checkout, uninstalled
GOLDEN_PATH = ROOT / "docs" / "backend_comparison_golden.json"
# XGBoost is not bit-reproducible across builds/threads; allow a small drift band.
TOLERANCE = {"auc": 0.02, "brier": 0.02, "ece": 0.03}
METRICS = ("auc", "brier", "ece")

# Headline split discipline — kept byte-identical to run.evaluate_hazard so the
# logistic column here re-derives docs/validation_golden.json exactly.
_FIT_CAP = 12_000
_EPOCHS = 150


def _have_ml() -> bool:
    try:
        import numpy  # noqa: F401
        import xgboost  # noqa: F401
    except Exception:
        return False
    return True


def _headline_split(spec):
    """Reproduce run.evaluate_hazard's fit/calibration split (the headline recipe)."""
    from disastermind.ml.validation.run import _cap

    cal_idx = set(range(0, len(spec.ytr), 5))
    fit_rows = [
        (x, y) for i, (x, y) in enumerate(zip(spec.Xtr, spec.ytr, strict=False)) if i not in cal_idx
    ]
    cal_rows = [
        (x, y) for i, (x, y) in enumerate(zip(spec.Xtr, spec.ytr, strict=False)) if i in cal_idx
    ]
    fit_rows = _cap(fit_rows, _FIT_CAP)
    X_fit, y_fit = [r[0] for r in fit_rows], [r[1] for r in fit_rows]
    X_cal, y_cal = [r[0] for r in cal_rows], [r[1] for r in cal_rows]
    return X_fit, y_fit, X_cal, y_cal


def _calibrated_metrics(y_cal, p_cal_raw, yte, p_te_raw):
    """Apply the headline isotonic calibration, then score AUC/Brier/ECE on test."""
    from disastermind.ml.validation.run import _metrics, fit_isotonic

    iso = fit_isotonic(y_cal, p_cal_raw)
    p_te = iso.transform(p_te_raw)
    m = _metrics(yte, p_te)
    return {k: m[k] for k in METRICS}


def _logistic_column(spec, X_fit, y_fit, X_cal, y_cal):
    from disastermind.ml.validation.run import fit_logistic, predict

    model = fit_logistic(X_fit, y_fit, name=spec.name, epochs=_EPOCHS, balanced=True)
    p_cal_raw = predict(model, X_cal)
    p_te_raw = predict(model, spec.Xte)
    return _calibrated_metrics(y_cal, p_cal_raw, spec.yte, p_te_raw)


def _xgboost_column(spec, X_fit, y_fit, X_cal, y_cal):
    import numpy as np
    from xgboost import XGBClassifier

    # Modest, fixed-seed, single-thread config: the point is a fair comparison on
    # the same data, not a tuned bake-off. n_jobs=1 + random_state=0 keeps it as
    # reproducible as XGBoost allows (still build-dependent — hence the tolerance).
    clf = XGBClassifier(
        n_estimators=200,
        max_depth=4,
        learning_rate=0.1,
        subsample=0.9,
        colsample_bytree=0.9,
        reg_lambda=1.0,
        objective="binary:logistic",
        eval_metric="logloss",
        random_state=0,
        n_jobs=1,
    )
    clf.fit(np.asarray(X_fit, dtype=float), np.asarray(y_fit, dtype=int))

    def _proba(X):
        return [float(p) for p in clf.predict_proba(np.asarray(X, dtype=float))[:, 1]]

    p_cal_raw = _proba(X_cal)
    p_te_raw = _proba(spec.Xte)
    return _calibrated_metrics(y_cal, p_cal_raw, spec.yte, p_te_raw)


def compute() -> dict:
    from disastermind.ml.validation.run import HAZARDS

    hazards = ["earthquake", "flood", "fire"]
    import os

    from disastermind.ml.validation import fire as fire_ds

    if os.path.exists(fire_ds.INDIA_FIXTURE):
        hazards.append("fire-india")

    out: dict = {}
    for name in hazards:
        spec = HAZARDS[name]()
        X_fit, y_fit, X_cal, y_cal = _headline_split(spec)
        out[name] = {
            "logistic": _logistic_column(spec, X_fit, y_fit, X_cal, y_cal),
            "xgboost": _xgboost_column(spec, X_fit, y_fit, X_cal, y_cal),
        }
    return out


def _verdict(name: str, backend: str, metric: str, got: float, golden: dict) -> tuple[str, float]:
    want = golden.get(name, {}).get(backend, {}).get(metric)
    if want is None:
        return "NEW", 0.0
    delta = abs(got - want)
    return ("PASS" if delta <= TOLERANCE[metric] else "FAIL"), delta


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    write = "--write" in argv

    if not _have_ml():
        print(
            "compare_backends: optional [ml] extra (numpy + xgboost) not installed — "
            "skipping the backend bake-off.\n"
            "The published headline metrics do NOT depend on this; install with "
            "`pip install -e .[ml]` to run the comparison."
        )
        return 0

    results = compute()

    if write:
        GOLDEN_PATH.write_text(json.dumps(results, indent=2) + "\n")
        print(f"wrote {GOLDEN_PATH.relative_to(ROOT)}")
        return 0

    golden = json.loads(GOLDEN_PATH.read_text()) if GOLDEN_PATH.exists() else {}

    print("=" * 78)
    print("Backend bake-off — identical split + isotonic calibration, real fixtures.")
    print("logistic = stdlib headline (bit-reproducible); xgboost = optional [ml] extra.")
    print("=" * 78)
    header = f"{'hazard':<12}{'metric':<8}{'logistic':>10}{'xgboost':>10}{'Δ(xgb-log)':>12}  winner"
    print(header)
    print("-" * 78)
    failures = 0
    for name, cols in results.items():
        for metric in METRICS:
            lg = cols["logistic"][metric]
            xg = cols["xgboost"][metric]
            d = xg - lg
            # AUC: higher is better; Brier/ECE: lower is better.
            better = "xgboost" if (d > 0 if metric == "auc" else d < 0) else "logistic"
            if abs(d) < 5e-4:
                better = "tie"
            verdict, _ = _verdict(name, "xgboost", metric, xg, golden)
            if verdict == "FAIL":
                failures += 1
            flag = "" if verdict in ("PASS", "NEW") else "  <-- DRIFT"
            print(f"{name:<12}{metric:<8}{lg:>10.4f}{xg:>10.4f}{d:>+12.4f}  {better}{flag}")
        print("-" * 78)

    if not golden:
        print("\nNo golden snapshot yet — run with --write to record one.")
        return 0
    if failures:
        print(f"\nFAIL — {failures} XGBoost metric(s) drifted beyond tolerance {TOLERANCE}.")
        return 1
    print("\nPASS — every XGBoost metric reproduced within tolerance of the golden snapshot.")
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
