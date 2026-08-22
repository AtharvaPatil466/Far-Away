"""Adversarial hash-chain tests (on-site item 12).

The suite already asserts ``DecisionLogger.verify_chain()`` returns True for an
*untampered* log in nine places. Nothing asserted it returns **False** for a
tampered one, so the chain's entire security property went unexercised. These
are the missing half: every test here tampers first, then demands detection.

Scope boundary, pinned deliberately by the last test: the chain is
tamper-*evident*, not tamper-*proof*. An attacker who rewrites the whole file
recomputes every hash and passes. Only the HMAC signing layer
(``audit.signing``, covered in ``test_audit_integrity.py``) defeats that,
because it keys the attestation with a secret the attacker lacks.

Stdlib-only, no network, deterministic.
"""
from __future__ import annotations

import json

from disastermind.audit.decision_log import DecisionLogger


def _chain(path, n=5):
    """Write an ``n``-record hash-chained log and return its path."""
    logger = DecisionLogger(path=str(path))
    for i in range(n):
        logger.log_prediction(
            model="quake-v1",
            inputs={"magnitude": 5.0 + i},
            prediction={"damage_prob": 0.1 * i},
            shap={"magnitude": 0.4},
            incident_id=f"inc-{i}",
        )
    return str(path)


def _lines(path):
    with open(path, encoding="utf-8") as fh:
        return [ln for ln in fh.read().splitlines() if ln.strip()]


def _rewrite(path, lines):
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")


def test_untampered_chain_verifies(tmp_path):
    """Anchor: without this, a always-False verifier would pass every test below."""
    p = _chain(tmp_path / "audit.jsonl")
    assert DecisionLogger(path=p).verify_chain() is True


def test_edited_payload_is_caught(tmp_path):
    """The attack that matters: silently change a recorded decision."""
    p = _chain(tmp_path / "audit.jsonl")
    lines = _lines(p)
    rec = json.loads(lines[2])
    rec["prediction"] = {"damage_prob": 0.99}  # falsify a logged prediction
    lines[2] = json.dumps(rec, separators=(",", ":"))
    _rewrite(p, lines)

    assert DecisionLogger(path=p).verify_chain() is False


def test_forged_hash_is_caught(tmp_path):
    """Editing the payload AND its own ``_hash`` still breaks the successor link."""
    p = _chain(tmp_path / "audit.jsonl")
    lines = _lines(p)
    rec = json.loads(lines[2])
    rec["prediction"] = {"damage_prob": 0.99}
    body = json.dumps(
        {k: v for k, v in rec.items() if k not in ("_hash", "_prev")},
        sort_keys=True,
        separators=(",", ":"),
    )
    rec["_hash"] = DecisionLogger._hash(rec["_prev"], body)  # locally consistent
    lines[2] = json.dumps(rec, separators=(",", ":"))
    _rewrite(p, lines)

    assert DecisionLogger(path=p).verify_chain() is False


def test_deleted_record_is_caught(tmp_path):
    """Excising an inconvenient decision breaks the prev-hash linkage."""
    p = _chain(tmp_path / "audit.jsonl")
    lines = _lines(p)
    del lines[2]
    _rewrite(p, lines)

    assert DecisionLogger(path=p).verify_chain() is False


def test_appended_forged_record_is_caught(tmp_path):
    """Back-dating an entry onto the tail without the chain state."""
    p = _chain(tmp_path / "audit.jsonl")
    lines = _lines(p)
    forged = json.loads(lines[1])
    forged["incident_id"] = "inc-forged"
    lines.append(json.dumps(forged, separators=(",", ":")))
    _rewrite(p, lines)

    assert DecisionLogger(path=p).verify_chain() is False


def test_reordered_records_are_caught(tmp_path):
    """Resequencing decisions rewrites history without editing any payload."""
    p = _chain(tmp_path / "audit.jsonl")
    lines = _lines(p)
    lines[1], lines[3] = lines[3], lines[1]
    _rewrite(p, lines)

    assert DecisionLogger(path=p).verify_chain() is False


def test_full_rewrite_is_not_caught_by_the_chain_alone(tmp_path):
    """The chain's honest limit — recomputing the whole file passes.

    This is not a bug; it is why ``audit.signing`` exists. Pinning it here stops
    anyone claiming the chain is tamper-PROOF on the strength of the tests above.
    """
    p = _chain(tmp_path / "audit.jsonl")
    originals = [json.loads(ln) for ln in _lines(p)]
    originals[2]["prediction"] = {"damage_prob": 0.99}

    forger = DecisionLogger(path=str(tmp_path / "forged.jsonl"))
    for rec in originals:
        forger.log_prediction(
            model=rec["model"],
            inputs=rec["inputs"],
            prediction=rec["prediction"],
            shap=rec["shap"],
            incident_id=rec["incident_id"],
        )

    assert DecisionLogger(path=str(tmp_path / "forged.jsonl")).verify_chain() is True
