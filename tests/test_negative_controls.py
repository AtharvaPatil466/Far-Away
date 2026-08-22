"""Negative controls for the earthquake model (on-site item 11).

The leakage question is: does the reported skill come from the feature->label
association, or from some artefact of the pipeline? A leaking pipeline keeps
scoring well after you destroy that association. This one collapses to chance,
which is what these tests pin.

NOTE ON CONTROL DESIGN — read before "fixing" this file.

The obvious control (shuffle the TRAINING labels, expect AUC ~ 0.5) is INVALID
for this model and is deliberately absent. AUC is rank-based and
scale-invariant, and ``gmpe_attenuation`` is both a model input and a near-
oracle predictor on its own (AUC 0.9587 unaided). A noise-trained fit still
carries small residual weights; any positive residual weight on that one
feature reproduces most of its ranking. Measured, that control yields AUC
0.83-0.91 -- arithmetic, not leakage. Adding it would produce a red test that
tempts someone to loosen the threshold until it passes, which is worse than
having no control at all.

The valid controls destroy the association on the TEST side, where no ranking
can survive it. Both are here, and both land on 0.5.

Stdlib-only, no network, deterministic (fixed seeds).
"""
from __future__ import annotations

import random

import pytest

from disastermind.ml.eval.metrics import roc_auc
from disastermind.ml.validation.run import fit_logistic, predict, quake_spec

#: Per-seed tolerance around chance. Observed spread over the seeds below is
#: <= 0.036; 0.06 leaves headroom without making the assertion vacuous.
CHANCE_TOL = 0.06
#: The mean over all seeds concentrates much harder than any single draw.
CHANCE_TOL_MEAN = 0.03
SEEDS = (0, 1, 2, 3, 4)


@pytest.fixture(scope="module")
def fitted():
    """Fit the real model once (~2 s) and reuse it across every control."""
    spec = quake_spec()
    fit = fit_logistic(spec.Xtr, spec.ytr, name="quake-negative-control",
                       epochs=150, balanced=True)
    return spec, predict(fit, spec.Xte)


def test_real_model_beats_chance(fitted):
    """Positive anchor.

    Without this, a predictor that returned a constant would satisfy every
    control below and the file would prove nothing.
    """
    spec, probs = fitted
    assert roc_auc(spec.yte, probs) > 0.85


def test_shuffled_test_labels_collapse_to_chance(fitted):
    """Break the label->row pairing: skill must vanish."""
    spec, probs = fitted
    aucs = []
    for seed in SEEDS:
        shuffled = spec.yte[:]
        random.Random(seed).shuffle(shuffled)
        auc = roc_auc(shuffled, probs)
        assert abs(auc - 0.5) < CHANCE_TOL, f"seed {seed}: AUC {auc:.4f}"
        aucs.append(auc)
    assert abs(sum(aucs) / len(aucs) - 0.5) < CHANCE_TOL_MEAN


def test_permuted_features_collapse_to_chance(fitted):
    """Break the feature->row pairing: same model, scrambled inputs."""
    spec, _ = fitted
    fit = fit_logistic(spec.Xtr, spec.ytr, name="quake-permuted",
                       epochs=150, balanced=True)
    aucs = []
    for seed in SEEDS:
        idx = list(range(len(spec.Xte)))
        random.Random(seed).shuffle(idx)
        auc = roc_auc(spec.yte, predict(fit, [spec.Xte[i] for i in idx]))
        assert abs(auc - 0.5) < CHANCE_TOL, f"seed {seed}: AUC {auc:.4f}"
        aucs.append(auc)
    assert abs(sum(aucs) / len(aucs) - 0.5) < CHANCE_TOL_MEAN
