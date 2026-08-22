"""Journal liveness: three states, two independently-tracked counters (item 13).

A quiet season and a dead pipeline both leave the journal unchanged. Telling
them apart is the entire point of the heartbeat: ``last_poll_at`` says the
worker RAN, ``last_commit_at`` says it FOUND something. Conflating them makes a
healthy stretch with no qualifying earthquakes indistinguishable from a cron
that died last week -- and pages someone for the wrong one.
"""
from __future__ import annotations

from disastermind.ml.shadow import STALE_AFTER_HOURS, ShadowJournal, freshness

NOW = "2026-08-22T12:00:00+00:00"
RECENT = "2026-08-22T06:00:00+00:00"
ANCIENT = "2026-06-14T06:00:00+00:00"


def _journal(tmp_path, stamp):
    return ShadowJournal(str(tmp_path / "s.jsonl"), clock=lambda: stamp)


def test_empty_journal_is_stalled(tmp_path):
    assert freshness(_journal(tmp_path, NOW), now=NOW)["state"] == "stalled"


def test_recent_poll_with_no_events_is_quiet_not_stalled(tmp_path):
    """The state that must NOT be red: worker healthy, world simply quiet."""
    j = _journal(tmp_path, RECENT)
    j.record_heartbeat()

    f = freshness(j, now=NOW)
    assert f["state"] == "quiet"
    assert f["last_poll_at"] is not None, "the worker ran"
    assert f["last_commit_at"] is None, "but committed nothing — a heartbeat is not an event"


def test_recent_prediction_is_ingesting(tmp_path):
    j = _journal(tmp_path, RECENT)
    j.record_prediction("eq-1", hazard="earthquake", issued_at=RECENT,
                        window_end=NOW, probability=0.3, threshold=0.5)

    assert freshness(j, now=NOW)["state"] == "ingesting"


def test_old_poll_is_stalled(tmp_path):
    j = _journal(tmp_path, ANCIENT)
    j.record_heartbeat()

    assert freshness(j, now=NOW)["state"] == "stalled"


def test_threshold_derives_from_the_worker_cadence(tmp_path):
    """One constant, so changing the cron cannot desync the console."""
    assert freshness(_journal(tmp_path, NOW), now=NOW)["stale_after_hours"] == STALE_AFTER_HOURS


# ------------------------------------------------------------- committed_at
def test_committed_at_is_stamped_on_new_entries(tmp_path):
    j = _journal(tmp_path, RECENT)
    rec = j.record_prediction("eq-1", hazard="earthquake", issued_at=RECENT,
                              window_end=NOW, probability=0.3, threshold=0.5)

    assert rec.payload["committed_at"] == RECENT


def test_committed_at_is_never_backfilled(tmp_path):
    """Pre-existing entries must stay exactly as written -- no retro-stamping."""
    path = tmp_path / "s.jsonl"
    path.write_text('{"kind":"heartbeat","payload":{"polled_at":"x"},"hash":"h"}\n')
    before = path.read_text()

    ShadowJournal(str(path), clock=lambda: NOW).verify_monotonic()

    assert path.read_text() == before


def test_monotonicity_is_independent_of_chain_integrity(tmp_path):
    """Two different failures, two different lights.

    A backwards clock leaves the hash chain perfectly intact, so a single
    combined boolean would call this healthy.
    """
    path = tmp_path / "s.jsonl"
    j = ShadowJournal(str(path), clock=lambda: NOW)
    j.record_heartbeat()
    ShadowJournal(str(path), clock=lambda: ANCIENT).record_heartbeat()  # clock jumps back

    assert ShadowJournal(str(path)).verify_chain() is True
    assert ShadowJournal(str(path)).verify_monotonic() is False


def test_entries_predating_the_field_are_skipped_not_failed(tmp_path):
    """The live journal's first 62 rows have no committed_at; that is not tampering."""
    path = tmp_path / "s.jsonl"
    legacy = ShadowJournal(str(path))
    legacy._append("heartbeat", {"polled_at": RECENT})
    path.write_text(path.read_text().replace(f',"committed_at":"{NOW}"', ""))

    assert ShadowJournal(str(path)).verify_monotonic() is True
