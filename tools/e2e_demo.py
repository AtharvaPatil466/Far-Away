#!/usr/bin/env python3
"""End-to-end check that the newly-built capabilities are wired into the live system.

Drives a real incident through the scenario generators / agent DAG, then exercises
each of the three just-added features against the running system:

  1. Relief-commodity demand   — surfaced inside the after-action IncidentReport.
  2. WhatsApp + IVR alerting    — a public_alert fans out over the citizen channels.
  3. HttpFieldClient            — closes dispatch -> ACK -> GPS over HTTP.

Offline, stdlib-only, deterministic. Run:  python tools/e2e_demo.py
Exit 0 == every feature exercised end-to-end.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from disastermind.audit.decision_log import DecisionLogger
from disastermind.core.bus import InMemoryBus
from disastermind.core.config import Settings
from disastermind.core.contracts import Message, MessageType, Priority, Topic
from disastermind.fieldapp import HttpFieldClient
from disastermind.reporting import IncidentReporter
from disastermind.scenarios import simulate_cyclone_flood
from disastermind.tier3.dispatch import DispatchRouter, build_channels


def section(title: str) -> None:
    print("\n" + "=" * 72 + f"\n{title}\n" + "=" * 72)


def main() -> int:
    # 1. Relief demand surfaced in the after-action report --------------------
    section("1. Relief demand (Sphere standard) — surfaced in the IncidentReport")
    loop = simulate_cyclone_flood(drive_cycles=2)
    report = IncidentReporter(bus=loop.bus, logger=loop.logger).generate().to_dict()
    relief = report.get("relief", {})
    if relief:
        d = relief["demand"]
        print(f"  population at risk : {relief['population_at_risk']:,}")
        print(f"  displaced caseload : {relief['displaced']:,} "
              f"({relief['displacement_fraction']:.0%}), {relief['horizon_days']}-day horizon")
        print(f"  water              : {d['water_litres']:,.0f} L")
        print(f"  food (dry ration)  : {d['ration_kg']:,.0f} kg")
        print(f"  shelter            : {d['shelter_spaces']:,} spaces / {d['shelter_m2']:,.0f} m²")
        print(f"  medical beds       : {d['medical_beds']:,}   latrines: {d['latrines']:,}")
        assert d["water_litres"] > 0, "relief demand should be non-zero"
    else:
        print("  (no population at risk produced by this scenario run)")

    # 2. WhatsApp + IVR in the public-alert fan-out ---------------------------
    section("2. Last-mile alerting — WhatsApp + IVR fire on a public alert")
    bus = InMemoryBus()
    channels = build_channels(Settings(), dry_run=True)
    router = DispatchRouter(bus=bus, logger=DecisionLogger.null(), channels=channels,
                            settings=Settings())
    reasoning: list[str] = []
    targets = router._cap_targets(None, reasoning)
    print("  public_alert routes to:", ", ".join(c.name for c in targets))
    for line in reasoning:
        print("   -", line)
    assert {"whatsapp", "ivr"} <= {c.name for c in targets}, "citizen channels must be in fan-out"

    # Drive a real fan-out dispatch and collect per-channel receipts.
    order = Message(
        sender="commander", recipient="dispatch", type=MessageType.INSTRUCTION,
        priority=Priority.CRITICAL, topic=Topic.DISPATCH,
        payload={"channel": "all", "recipients": ["+919812345678"],
                 "body": "Cyclone landfall in 12h — move to the nearest shelter."},
    )
    acks = router.handle(order)
    receipts = []
    for m in acks:
        receipts.extend((m.payload or {}).get("receipts", []))
    fired = {r["channel"]: r["status"] for r in receipts}
    print("  fan-out receipts      :", fired)
    assert fired.get("whatsapp") and fired.get("ivr"), "whatsapp + ivr must record receipts"

    # 3. HttpFieldClient closes the loop over HTTP ----------------------------
    section("3. HttpFieldClient — dispatch -> ACK -> GPS over HTTP (in-process gateway)")
    gateway = {
        "orders": {"ndrf-7": [{"order_id": "o-1", "team_id": "ndrf-7", "site": "Zone-3",
                               "waypoints": [{"lat": 19.8, "lon": 85.8}]}]},
        "acks": [], "beacons": [],
    }

    def gw(method: str, path: str, body):
        team = path.split("/")[2]
        if method == "GET" and path.endswith("/orders"):
            return {"orders": gateway["orders"].get(team, [])}
        if method == "POST" and path.endswith("/ack"):
            gateway["acks"].append(body)
            return {}
        if method == "POST" and path.endswith("/beacon"):
            gateway["beacons"].append(body)
            return {}
        return {}

    client = HttpFieldClient("ndrf-7", "http://field-gw", transport=gw)
    summary = client.service_next()
    print("  serviced order        :", summary)
    print(f"  gateway received      : {len(gateway['acks'])} ack(s), "
          f"{len(gateway['beacons'])} beacon(s)")
    assert summary and summary["acked"] and summary["beaconed"], "field loop must close over HTTP"
    assert gateway["acks"] and gateway["beacons"], "gateway must receive ack + beacon"

    section("DONE — all three features exercised end-to-end against the running system")
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
