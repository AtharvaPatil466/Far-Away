"""Regression tests for the production-hardening audit fixes.

Covers the highest-severity defects found in the 2026-08 production audit:

* CommanderAgent approve/reject vs timeout-sweep TOCTOU double-dispatch.
* DashboardService idempotency: same-key concurrent requests execute once.
* DecisionLogger: a failed durable write must not fork the hash chain, and
  the null logger's memory ring must be bounded.
* Message.from_dict round-trip (the Kafka consumer path was silently dropping
  every consumed record because from_dict did not exist).
* /report/generate + /llm/generate must never present an echoed prompt as
  provider output (provider failures degrade by echoing their prompt).
* Per-IP rate limiting is enforced even on a default-open (auth-off) server.

All tests are offline: no network, no broker, no LLM calls.
"""
from __future__ import annotations

import threading
from unittest.mock import MagicMock, patch

import pytest

from disastermind.api.service import DashboardService
from disastermind.audit.decision_log import GENESIS, NULL_MEMORY_CAP, DecisionLogger
from disastermind.core.bus import InMemoryBus
from disastermind.core.contracts import (
    EscalationTrigger,
    Message,
    MessageType,
    Module,
    Priority,
    Topic,
)
from disastermind.llm.client import OpenRouterClient, _ssl_context
from disastermind.tier1.commander.agent import CommanderAgent

pytest.importorskip("fastapi")


# --------------------------------------------------------------------- helpers
def _escalating_order_message() -> Message:
    """A FIELD_ORDER that the autonomy matrix escalates to a human."""
    return Message(
        sender="field_coordinator",
        recipient="commander",
        type=MessageType.INSTRUCTION,
        priority=Priority.CRITICAL,
        topic=Topic.FIELD_ORDER,
        incident_id="usgs:eq-race",
        module=Module.EARTHQUAKE,
        escalation_trigger=EscalationTrigger.CROSS_STATE_RESOURCE,
        payload={
            "kind": "field_order",
            "incident_id": "usgs:eq-race",
            "orders": [
                {
                    "team_id": "NDRF-99",
                    "site": "cross-border-zone",
                    "priority": 1,
                    "reason": "cross-state mutual aid required",
                }
            ],
            "escalation": {
                "trigger": EscalationTrigger.CROSS_STATE_RESOURCE.value,
                "summary": "needs a neighbouring state's NDRF battalion",
                "scale": 1,
            },
        },
    )


def _commander_with_pending() -> tuple[CommanderAgent, InMemoryBus, str]:
    """A real commander holding one pending escalation; returns (agent, bus, id)."""
    bus = InMemoryBus()
    agent = CommanderAgent(bus=bus)
    agent.handle(_escalating_order_message())
    pending = list(agent.pending.values())
    assert len(pending) == 1
    return agent, bus, pending[0].report_id


def _dispatch_count(bus: InMemoryBus) -> int:
    return sum(1 for m in bus.history if m.topic == Topic.DISPATCH)


# ------------------------------------------------------- commander race (P0/P1)
def test_approve_after_timeout_claim_does_not_double_dispatch():
    """A deadline sweep that already claimed the escalation beats a late approve."""
    agent, bus, report_id = _commander_with_pending()
    pending = agent.pending[report_id]

    # The sweep claims (pops) first but its emit parks until we allow it —
    # simulating a slow dispatch while an operator's approve lands concurrently.
    reached = threading.Event()  # set once the sweep is inside its blocked emit
    release = threading.Event()  # main -> sweep: unblock
    original_emit = agent.emit

    def _slow_emit(msg: Message) -> None:
        if (
            msg.topic == Topic.DISPATCH
            and msg.payload.get("via") == "auto_execute_on_timeout"
        ):
            reached.set()
            release.wait(timeout=5)
        original_emit(msg)

    def _sweep() -> None:
        agent.emit = _slow_emit
        agent.resolve_pending()

    # Ensure the escalation is due so resolve_pending actually claims it.
    pending.deadline_epoch = 0.0
    sweeper = threading.Thread(target=_sweep)
    sweeper.start()
    try:
        assert reached.wait(timeout=5), "sweep never reached its blocked emit"
        result = agent.approve(report_id)
        release.set()
        sweeper.join(timeout=5)

        assert result == [], "approve after a timeout claim must be a no-op"
        assert _dispatch_count(bus) == 1, f"double dispatch! {_dispatch_count(bus)}"
    finally:
        release.set()
        sweeper.join(timeout=5)


def test_stress_approve_versus_sweep_emits_at_most_one_dispatch():
    """Hammer approve() against resolve_pending(); exactly one dispatch survives."""
    for _ in range(25):
        agent, bus, report_id = _commander_with_pending()
        agent.pending[report_id].deadline_epoch = 0.0  # due now
        barrier = threading.Barrier(2, timeout=5)

        def _sweep() -> None:
            barrier.wait()
            agent.resolve_pending()

        def _approve() -> None:
            barrier.wait()
            agent.approve(report_id)

        t1 = threading.Thread(target=_sweep)
        t2 = threading.Thread(target=_approve)
        t1.start()
        t2.start()
        t1.join(timeout=5)
        t2.join(timeout=5)

        assert _dispatch_count(bus) == 1, "concurrent approve/sweep double-dispatched"


# ------------------------------------------------------------ idempotency (P1)
class _CountingCommander:
    """Minimal commander stand-in that counts approve invocations."""

    def __init__(self) -> None:
        self.calls = 0
        self.name = "counting"
        self._lock = threading.Lock()

    def approve(self, report_id: str, approver: str = "human"):
        with self._lock:
            self.calls += 1
        return [
            Message(
                sender="counting",
                recipient="dispatch",
                type=MessageType.INSTRUCTION,
                priority=Priority.HIGH,
                topic=Topic.DISPATCH,
                payload={"report_id": report_id},
            )
        ]

    def reject(self, report_id: str, approver: str = "human", note: str = ""):
        return []

    def pending_reports(self):
        return []


def test_same_idempotency_key_concurrent_requests_execute_once():
    svc = DashboardService(bus=InMemoryBus(), commander=_CountingCommander())
    results: list[dict] = []
    barrier = threading.Barrier(4, timeout=5)

    def _call() -> None:
        barrier.wait()
        results.append(
            svc.approve_idempotent("esc-1", approver="op", key="retry-safe-key")
        )

    threads = [threading.Thread(target=_call) for _ in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=5)

    assert svc.commander.calls == 1, "same key executed the action more than once"
    replays = [r for r in results if r.get("idempotent_replay")]
    assert len(replays) == 3


# --------------------------------------------------------- audit chain (P0/P1)
def test_failed_audit_write_does_not_fork_the_chain(tmp_path, monkeypatch):
    """A dropped record must leave the chain verifiable, not permanently broken."""
    path = tmp_path / "audit.jsonl"
    logger = DecisionLogger(path=str(path))
    msg = Message(
        sender="a", recipient="b", type=MessageType.ACK, priority=Priority.INFO
    )

    ok_rec = logger.record(msg)
    assert ok_rec["_prev"] == GENESIS

    # Next write fails (e.g. disk full / permission lost at runtime).
    def _boom(*a, **k):
        raise OSError("no space left on device")

    monkeypatch.setattr("builtins.open", _boom)
    dropped = logger.record(msg)
    assert "_hash" not in dropped, "failed record must not claim a chain position"
    monkeypatch.undo()

    # The chain resumes from the last SUCCESSFULLY persisted tip.
    good_again = logger.record(msg)
    assert good_again["_prev"] == ok_rec["_hash"]
    assert logger.verify_chain(), "chain forked after a failed write"


def test_null_logger_memory_is_bounded():
    logger = DecisionLogger.null()
    msg = Message(
        sender="a", recipient="b", type=MessageType.ACK, priority=Priority.INFO
    )
    for _ in range(NULL_MEMORY_CAP + 500):
        logger.record(msg)
    assert len(logger.memory) == NULL_MEMORY_CAP


# ------------------------------------------------------ Message.from_dict (P1)
def test_message_from_dict_round_trips_every_field():
    m = Message(
        sender="cmd",
        recipient="dispatch",
        type=MessageType.ESCALATION,
        priority=Priority.CRITICAL,
        payload={"kind": "escalation", "n": 1},
        reasoning=["why"],
        ttl_seconds=42,
        topic=Topic.ESCALATION,
        incident_id="inc-7",
        module=Module.EARTHQUAKE,
        escalation_trigger=EscalationTrigger.MASS_EVACUATION,
    )
    clone = Message.from_dict(m.to_dict())
    assert clone.to_dict() == m.to_dict()


def test_message_from_dict_is_defensive_on_garbage():
    m = Message.from_dict({"type": "bogus", "priority": "nine", "module": "ZZ"})
    assert m.type is MessageType.ALERT
    assert m.priority is Priority.INFO
    assert m.module is Module.ALL
    assert m.payload == {}
    fallback = Message.from_dict(None)
    assert fallback.topic == "default" and fallback.sender == "unknown"


# --------------------------------------------- LLM echo handling at routes (P0)
class _EchoClient:
    """Mimics a failing real client: degrades by returning the prompt."""

    name = "openrouter"

    def generate(self, prompt: str) -> str:
        return prompt


@pytest.fixture()
def _echo_provider(monkeypatch):
    monkeypatch.setenv("DM_LLM_PROVIDER", "openrouter")
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-unittest")
    with patch("disastermind.llm.client.make_client", return_value=_EchoClient()):
        yield


def _report_client():
    from fastapi.testclient import TestClient

    from disastermind.api.server import create_server

    return TestClient(create_server(start_streaming=False).app)


def test_report_generate_echo_failure_falls_back_to_deterministic(_echo_provider):
    c = _report_client()
    d = c.post("/report/generate").json()
    assert d["narrative_source"] == "template"
    assert not d["narrative"].lower().startswith("write a concise")


def test_llm_generate_echo_failure_returns_502_not_instructions(_echo_provider):
    c = _report_client()
    r = c.post("/llm/generate", json={"messages": [{"role": "user", "content": "hi"}]})
    assert r.status_code == 502
    assert r.json()["source"] == "openrouter"


# ------------------------------------------- OpenRouter TLS context (live bug)
def test_ssl_context_prefers_certifi_bundle_when_available():
    ctx = _ssl_context()
    pytest.importorskip("certifi")
    import ssl

    assert ctx is not None
    assert ctx.verify_mode == ssl.CERT_REQUIRED
    # The context must carry a real CA set (certifi bundle), not be empty.
    assert ctx.get_ca_certs(), "empty CA set"


def test_openrouter_generate_passes_verified_tls_context_and_timeout():
    pytest.importorskip("certifi")
    client = OpenRouterClient(api_key="sk-or-test", model="stealth/ox-alpha", timeout=9.5)
    mock_resp = MagicMock()
    mock_resp.read.return_value = b'{"choices":[{"message":{"content":"ok"}}]}'
    mock_resp.__enter__.return_value = mock_resp
    mock_resp.__exit__.return_value = False
    with patch("urllib.request.urlopen", return_value=mock_resp) as mock_open:
        assert client.generate("p") == "ok"
        kwargs = mock_open.call_args.kwargs
        assert kwargs.get("timeout") == 9.5
        assert kwargs.get("context") is client._ssl_context


# ------------------------------------ per-IP flood bound with auth OFF (P0/P1)
def test_anonymous_flood_is_rate_limited_even_without_auth(monkeypatch):
    from fastapi.testclient import TestClient

    from disastermind.api.server import create_server

    monkeypatch.delenv("DM_API_KEYS", raising=False)
    monkeypatch.delenv("DM_API_KEYS_MAP", raising=False)
    monkeypatch.setenv("DM_RATE_IP_CAPACITY", "3")
    monkeypatch.setenv("DM_RATE_IP_REFILL_PER_SEC", "0")
    client = TestClient(create_server(start_streaming=False).app)

    codes = [client.get("/topics").status_code for _ in range(6)]
    assert codes[:3] == [200, 200, 200], "legitimate traffic must pass"
    assert set(codes[3:]) == {429}, f"flood not bounded: {codes}"
    body = client.get("/topics").json()
    assert body["error"]["type"] == "rate_limited"
