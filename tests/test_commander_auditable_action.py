"""Focused integration coverage for Commander approval -> dispatch -> audit."""
from __future__ import annotations

import json

import pytest

from disastermind.api.app.factory import create_app
from disastermind.api.service import DashboardService
from disastermind.audit.decision_log import AuditWriteError, DecisionLogger
from disastermind.core.bus import InMemoryBus
from disastermind.core.config import Settings
from disastermind.core.contracts import (
    EscalationTrigger,
    Message,
    MessageType,
    Module,
    Priority,
    Topic,
)
from disastermind.tier1.commander.agent import CommanderAgent


def _order() -> Message:
    return Message(
        sender="field", recipient="commander", type=MessageType.INSTRUCTION,
        priority=Priority.CRITICAL, topic=Topic.FIELD_ORDER,
        incident_id="INC-AUDIT-1", module=Module.CYCLONE_FLOOD,
        payload={
            "orders": [{
                "team_id": "NDRF-7", "site": "Zone 7", "priority": 1,
                "reason": "cross-state rescue capacity required",
            }],
            "escalation": {"trigger": EscalationTrigger.CROSS_STATE_RESOURCE.value},
        },
    )


def _pending_commander(logger: DecisionLogger):
    bus = InMemoryBus()
    commander = CommanderAgent(bus=bus, logger=logger, settings=Settings())
    escalation_messages = commander.handle(_order())
    assert len(escalation_messages) == 1
    report_id = commander.pending_reports()[0]["report_id"]
    return bus, commander, DashboardService(bus=bus, commander=commander), report_id


def test_approval_authorizes_dispatch_surfaces_audit_and_verifies_chain(tmp_path):
    logger = DecisionLogger(path=str(tmp_path / "audit.jsonl"))
    bus, commander, service, report_id = _pending_commander(logger)

    result = service.approve(report_id, approver="commander_test")

    assert result["ok"] is True
    assert result["dispatched"][0]["topic"] == Topic.DISPATCH
    assert result["dispatched"][0]["payload"]["via"] == "human_approved:commander_test"
    assert result["audit_record"]["id"] == result["dispatched"][0]["id"]
    assert result["audit_record"]["_hash"]
    assert result["audit_record"]["_prev"]
    assert commander.pending_reports() == []
    assert bus.last_on(Topic.DISPATCH) is not None

    verification = service.verify_audit()
    assert verification == {
        "valid": True,
        "entries_checked": 1,
        "head_hash": result["audit_record"]["_hash"],
        "failure_index": None,
        "available": True,
    }


def test_read_only_verifier_reports_first_broken_event(tmp_path):
    path = tmp_path / "audit.jsonl"
    logger = DecisionLogger(path=str(path))
    _, _, service, report_id = _pending_commander(logger)
    service.approve(report_id, approver="commander_test")

    record = json.loads(path.read_text(encoding="utf-8"))
    record["payload"]["body"] = "retroactively changed"
    path.write_text(json.dumps(record) + "\n", encoding="utf-8")

    result = service.verify_audit()
    assert result["valid"] is False
    assert result["failure_index"] == 1


def test_audit_failure_keeps_review_pending_and_prevents_dispatch():
    good_logger = DecisionLogger.null()
    bus, commander, service, report_id = _pending_commander(good_logger)

    class FailingLogger(DecisionLogger):
        def record(self, message):
            raise AuditWriteError("disk unavailable")

    commander.logger = FailingLogger.null()

    with pytest.raises(AuditWriteError):
        service.approve(report_id, approver="commander_test")

    assert [row["report_id"] for row in service.list_escalations()] == [report_id]
    assert bus.last_on(Topic.DISPATCH) is None
    assert commander.stats["approved"] == 0


def test_audit_verify_route_wraps_existing_verifier(tmp_path):
    fastapi = pytest.importorskip("fastapi")
    del fastapi
    testclient = pytest.importorskip("fastapi.testclient")
    logger = DecisionLogger(path=str(tmp_path / "audit.jsonl"))
    _, _, service, _ = _pending_commander(logger)
    client = testclient.TestClient(create_app(service))

    response = client.get("/audit/verify")
    assert response.status_code == 200
    assert response.json()["valid"] is True
    assert response.json()["entries_checked"] == 0
