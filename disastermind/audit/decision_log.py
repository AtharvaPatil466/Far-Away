"""Tamper-evident decision logging (PRD Step 9).

Every decision is logged with full reasoning chain, ISO-8601 timestamp,
sender/recipient, priority, message type and TTL. We also expose a hook for
per-prediction SHAP values (explainability requirement).

Backends:
  * Always: append-only JSONL on disk (the durable local trail).
  * Optional: Elasticsearch (full audit trail) when ``elasticsearch_url`` set.

Tamper-evidence: each record carries the SHA-256 of the previous record,
forming a hash chain. Any retroactive edit breaks the chain — detectable by
:meth:`verify_chain`.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import threading
from collections import deque
from typing import Any

from ..core.contracts import Message

log = logging.getLogger("disastermind.audit")

GENESIS = "0" * 64

#: Cap for the in-memory ring used by :meth:`DecisionLogger.null`. The null
#: logger is the DEFAULT logger of a bare dashboard server, so an unbounded
#: list here grew forever with every audited message (slow memory leak).
NULL_MEMORY_CAP = 10_000


class DecisionLogger:
    #: In-memory ring used ONLY by :meth:`null` (bounded; see NULL_MEMORY_CAP).
    memory: deque[dict[str, Any]] | None = None

    def __init__(self, path: str = "./audit.jsonl", elasticsearch_url: str = "") -> None:
        self.path = path
        self.elasticsearch_url = elasticsearch_url
        # One writer at a time: records are emitted from several threads (the
        # loop driver AND API workers), and unsynchronised read-modify-write of
        # ``_prev_hash`` let two records chain from the same predecessor,
        # permanently breaking :meth:`verify_chain` without any tampering.
        self._lock = threading.Lock()
        self._prev_hash = self._load_tip()
        self._es = self._connect_es() if elasticsearch_url else None

    # ---------------------------------------------------------------- factory
    @classmethod
    def null(cls) -> DecisionLogger:
        """A logger that records to an in-memory bounded ring only."""
        inst = cls.__new__(cls)
        inst.path = ""
        inst.elasticsearch_url = ""
        inst._lock = threading.Lock()
        inst._prev_hash = GENESIS
        inst._es = None
        inst.memory = deque(maxlen=NULL_MEMORY_CAP)
        return inst

    # ---------------------------------------------------------------- helpers
    def _load_tip(self) -> str:
        if not os.path.exists(self.path):
            return GENESIS
        tip = GENESIS
        try:
            with open(self.path, encoding="utf-8") as fh:
                for line in fh:
                    line = line.strip()
                    if line:
                        tip = json.loads(line).get("_hash", tip)
        except Exception:
            log.exception("could not read audit tip; starting fresh chain")
        return tip

    def _connect_es(self):  # pragma: no cover - optional dependency
        try:
            from elasticsearch import Elasticsearch  # type: ignore

            return Elasticsearch(self.elasticsearch_url)
        except Exception:
            log.warning("elasticsearch unavailable; JSONL-only audit trail")
            return None

    @staticmethod
    def _hash(prev: str, body: str) -> str:
        return hashlib.sha256((prev + body).encode("utf-8")).hexdigest()

    # ------------------------------------------------------------------ write
    def record(self, message: Message) -> dict[str, Any]:
        rec = self._chain(message.to_dict())
        return rec

    def log_prediction(
        self, model: str, inputs: dict, prediction: Any, shap: dict, incident_id: str | None = None
    ) -> dict[str, Any]:
        """SHAP-annotated model prediction log (PRD Step 9 explainability)."""
        rec = self._chain(
            {
                "kind": "prediction",
                "model": model,
                "inputs": inputs,
                "prediction": prediction,
                "shap": shap,
                "incident_id": incident_id,
            }
        )
        return rec

    def _chain(self, body_rec: dict[str, Any]) -> dict[str, Any]:
        """Hash ``body_rec`` onto the chain and persist it atomically.

        The tip advances ONLY after a successful durable write. Advancing it on a
        failed write made every subsequent record reference a hash absent from
        the file — an unverifiable (forked) chain — so the failure is logged and
        this single record is dropped instead of corrupting the whole trail.
        """
        with self._lock:
            body = json.dumps(body_rec, sort_keys=True, separators=(",", ":"))
            prev = self._prev_hash
            body_rec["_prev"] = prev
            body_rec["_hash"] = self._hash(prev, body)
            if self._persist(body_rec):
                self._prev_hash = body_rec["_hash"]
            else:
                # Remove chain fields so a caller reusing the dict isn't misled.
                body_rec.pop("_prev", None)
                body_rec.pop("_hash", None)
            return body_rec

    def _persist(self, rec: dict) -> bool:
        """Durable write; returns True only when the PRIMARY trail has it.

        The JSONL file is the primary tamper-evident trail (the hash chain lives
        there), so its success gates the tip. Elasticsearch is a secondary index:
        an ES hiccup is logged but must not fork the chain.
        """
        mem = self.memory
        if mem is not None and not self.path:
            mem.append(rec)
            return True
        ok = False
        try:
            with open(self.path, "a", encoding="utf-8") as fh:
                fh.write(json.dumps(rec, separators=(",", ":")) + "\n")
            ok = True
        except Exception:
            log.exception("failed to persist audit record to %s (record dropped)", self.path)
        if self._es is not None:  # pragma: no cover
            try:
                self._es.index(index="disastermind-audit", document=rec)
            except Exception:
                log.exception("elasticsearch index failed")
        return ok

    # ----------------------------------------------------------------- verify
    def verify_chain(self) -> bool:
        """Re-walk the JSONL chain; return True iff untampered."""
        if not self.path or not os.path.exists(self.path):
            return True
        prev = GENESIS
        with open(self.path, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                rec = json.loads(line)
                stored = rec.pop("_hash")
                rec_prev = rec.pop("_prev")
                body = json.dumps(rec, sort_keys=True, separators=(",", ":"))
                if rec_prev != prev or self._hash(prev, body) != stored:
                    return False
                prev = stored
        return True
