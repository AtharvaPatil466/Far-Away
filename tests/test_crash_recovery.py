"""Crash recovery for the append-only journals (on-site item 9).

A `kill -9` mid-append leaves a TORN final line: a partial JSON record. The
question item 9 asks is whether the durable record survives that, and whether a
restarted process picks up where it left off.

There is no replay engine in this codebase -- state is not rebuilt from the
journal -- so what is actually load-bearing is the journal's own integrity
across a hard kill. That is what these tests cover, and the file says so rather
than implying a recovery capability that does not exist.

Two failures were found here and are now pinned:

  1. verify_chain() RAISED JSONDecodeError on a torn tail instead of returning a
     verdict, so a power cut was indistinguishable from a crash bug and took the
     integrity check down with it.
  2. the tip lookup fell back to GENESIS on a torn tail, silently starting a NEW
     chain -- severing every subsequent record from the history before the
     crash, which is exactly the linkage the chain exists to prove.
"""
from __future__ import annotations

import contextlib
import io
import json
import os
import signal
import subprocess
import sys
import textwrap
import time

import pytest

from disastermind.audit.decision_log import DecisionLogger
from disastermind.ml.shadow import ShadowJournal


def _torn(path, drop=25):
    """Truncate the file mid-record, as an interrupted write would leave it."""
    raw = open(path, encoding="utf-8").read()
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(raw[: len(raw) - drop])


def _seeded(tmp_path, n=3):
    path = str(tmp_path / "season.jsonl")
    journal = ShadowJournal(path)
    for _ in range(n):
        journal.record_heartbeat()
    return path


# ------------------------------------------------------------- torn tail
def test_verify_reports_a_verdict_instead_of_raising(tmp_path):
    path = _seeded(tmp_path)
    _torn(path)

    assert ShadowJournal(path).verify_chain() is False


def test_torn_tail_is_counted_not_hidden(tmp_path):
    path = _seeded(tmp_path)
    _torn(path)

    assert ShadowJournal(path).torn_lines() == 1


def test_appending_after_a_crash_does_not_start_a_new_chain(tmp_path):
    """The severe one.

    If the tip reset to GENESIS, records written after a crash would not link to
    anything before it, and the break would be invisible: the file would verify
    clean while attesting to nothing.
    """
    path = _seeded(tmp_path)
    surviving = [r.hash for r in ShadowJournal(path).records()][:-1]
    _torn(path)  # destroys the final record

    recovered = ShadowJournal(path).chain_head()

    assert recovered != "shadow-genesis", "a crash silently restarted the chain"
    assert recovered == surviving[-1], "tip must be the last SURVIVING record"


def test_deliberate_repair_restores_verifiability(tmp_path):
    """Repair is explicit, never automatic.

    "The last write did not finish" and "someone edited this" must not look the
    same to an operator, so the torn line is only dropped when asked.
    """
    path = _seeded(tmp_path)
    _torn(path)
    journal = ShadowJournal(path)

    removed = journal.truncate_torn_tail()

    assert removed == 1
    assert journal.verify_chain() is True
    assert journal.torn_lines() == 0


def test_writing_continues_correctly_after_repair(tmp_path):
    path = _seeded(tmp_path)
    _torn(path)
    journal = ShadowJournal(path)
    journal.truncate_torn_tail()

    journal.record_heartbeat()

    assert journal.verify_chain() is True


# ------------------------------------------------------- real SIGKILL
def test_real_sigkill_leaves_a_readable_journal(tmp_path):
    """End-to-end: kill -9 a live writer, then read the journal back.

    The deterministic tests above simulate the torn write; this one produces a
    genuine one, so the recovery path is proven against the operating system
    rather than against our model of it.
    """
    path = tmp_path / "killed.jsonl"
    script = textwrap.dedent(f"""
        import sys, time
        sys.path.insert(0, {os.getcwd()!r})
        from disastermind.ml.shadow import ShadowJournal
        j = ShadowJournal({str(path)!r})
        while True:
            j.record_heartbeat(detail="x" * 200)
            time.sleep(0.001)
    """)
    proc = subprocess.Popen([sys.executable, "-c", script])
    time.sleep(2.0)
    os.kill(proc.pid, signal.SIGKILL)
    proc.wait(timeout=10)

    assert path.exists(), "writer produced no journal"
    journal = ShadowJournal(str(path))

    # Whatever the kill landed on, reading must produce a verdict, not a crash.
    verdict = journal.verify_chain()
    assert isinstance(verdict, bool)

    journal.truncate_torn_tail()
    assert journal.verify_chain() is True, "journal unrecoverable after SIGKILL"
    assert len(journal.records()) > 0, "no surviving records"

    journal.record_heartbeat()
    assert journal.verify_chain() is True, "could not resume writing after SIGKILL"


# ------------------------------------------------- decision log (audit chain)
def _audit(tmp_path, n=3):
    path = str(tmp_path / "audit.jsonl")
    logger = DecisionLogger(path=path)
    for i in range(n):
        logger.log_prediction(model="m", inputs={"i": i}, prediction={"p": 0.1},
                              shap={}, incident_id=f"i{i}")
    return path


def test_audit_log_reports_a_verdict_on_a_torn_tail(tmp_path):
    path = _audit(tmp_path)
    _torn(path)

    assert DecisionLogger(path=path).verify_chain() is False


def test_audit_tip_recovers_the_last_complete_record_not_genesis(tmp_path):
    """The chain must not restart after a crash.

    Resuming from GENESIS would leave every later record unlinked to the
    history before the interruption — the exact linkage the chain exists for.
    """
    path = _audit(tmp_path)
    surviving = [json.loads(ln)["_hash"] for ln in open(path, encoding="utf-8") if ln.strip()][:-1]
    _torn(path)

    assert DecisionLogger(path=path)._prev_hash == surviving[-1]


def test_torn_audit_log_does_not_dump_a_traceback(tmp_path):
    """An interrupted write is survivable; it must not look like a crash bug."""
    path = _audit(tmp_path)
    _torn(path)
    captured = io.StringIO()

    with contextlib.redirect_stderr(captured):
        DecisionLogger(path=path)

    assert "Traceback" not in captured.getvalue()


def test_audit_torn_tail_is_counted_and_repairable(tmp_path):
    path = _audit(tmp_path)
    _torn(path)
    logger = DecisionLogger(path=path)

    assert logger.torn_lines() == 1
    assert logger.truncate_torn_tail() == 1
    assert DecisionLogger(path=path).verify_chain() is True

    logger.log_prediction(model="m", inputs={"after": 1}, prediction={},
                          shap={}, incident_id="after")
    assert DecisionLogger(path=path).verify_chain() is True


def test_concurrent_writers_cannot_fork_the_chain(tmp_path):
    """Appending is read-modify-write; unguarded it forks under real threads.

    The API runs a daemon loop-driver thread and the Kafka runtime runs a
    consumer thread, either of which can log while a request thread does. Two
    threads reading the same tip emit two records claiming the same ``_prev``,
    and no later verification can ever accept that file again.
    """
    import threading

    path = str(tmp_path / "audit.jsonl")
    logger = DecisionLogger(path=path)
    errors: list[BaseException] = []
    start = threading.Barrier(8)

    def hammer(worker: int) -> None:
        try:
            start.wait()
            for i in range(25):
                logger.log_prediction(model="m", inputs={"w": worker, "i": i},
                                      prediction={}, shap={}, incident_id=f"w{worker}")
        except BaseException as exc:  # noqa: BLE001 - surfaced via `errors`
            errors.append(exc)

    threads = [threading.Thread(target=hammer, args=(w,)) for w in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert not errors, f"writer raised: {errors[:1]}"
    written = [ln for ln in open(path, encoding="utf-8") if ln.strip()]
    assert len(written) == 200, f"lost or duplicated records: {len(written)}"
    assert DecisionLogger(path=path).verify_chain() is True, "the chain forked"


def test_a_failed_write_does_not_advance_the_tip(tmp_path, monkeypatch):
    """A write that fails must leave the tip where it was.

    Advancing first would strand the chain on a hash no file contains, so every
    later record would link to nothing and verification would fail forever.
    """
    path = str(tmp_path / "audit.jsonl")
    logger = DecisionLogger(path=path)
    logger.log_prediction(model="m", inputs={"ok": 1}, prediction={}, shap={}, incident_id="ok")
    tip_before = logger._prev_hash

    def boom(_rec):
        raise OSError("disk full")

    monkeypatch.setattr(logger, "_persist", boom)
    with pytest.raises(OSError):
        logger.log_prediction(model="m", inputs={"bad": 1}, prediction={}, shap={}, incident_id="bad")

    assert logger._prev_hash == tip_before, "tip advanced despite a failed write"
    monkeypatch.undo()
    logger.log_prediction(model="m", inputs={"after": 1}, prediction={}, shap={}, incident_id="after")
    assert DecisionLogger(path=path).verify_chain() is True
