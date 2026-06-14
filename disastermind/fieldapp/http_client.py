"""HttpFieldClient — the real over-the-network field device client (PRD Step 8).

:class:`~.client.MockFieldClient` is the in-memory bus stand-in used by the test
harness; this is the device-side client a *deployed* field app actually uses — it
speaks the field contract over **HTTP** to the backbone's field gateway, closing
the same dispatch -> acknowledge -> GPS-beacon loop without sharing a process with
the server.

HTTP contract (the field gateway exposes these; ``base_url`` points at it):

  * ``GET  {base}/field/{team_id}/orders``  -> ``{"orders": [<order>, ...]}``
  * ``POST {base}/field/{team_id}/ack``     <- an :class:`~.contracts.OrderAck` dict
  * ``POST {base}/field/{team_id}/beacon``  <- ``{"kind":"gps_beacon","readings":[...]}``

Design, matching the rest of the platform:
  * ``httpx`` is imported **lazily** and wrapped in ``try/except`` — the client
    degrades, never crashes, when the network or the SDK is absent.
  * Connectivity-denied operation is first-class: a post that can't reach the
    gateway is appended to a **durable outbox** and re-sent by :meth:`flush_outbox`
    on reconnect (the "terrestrial-first, offline-queue" behaviour the field app
    promises).
  * A ``transport`` seam ``(method, path, json) -> dict | None`` lets tests drive
    every path with no socket; ``None`` from it (or from the real send) means
    "offline" and triggers the outbox.
"""
from __future__ import annotations

from collections.abc import Callable
from typing import Any

from ..models.domain import AssetType
from ..models.geo import LatLon
from .client import _as_latlon
from .contracts import STATUS_FLOW, DeploymentOrderMsg, OrderAck, TeamStatusUpdate


class HttpFieldClient:
    """A field device bound to one team, talking to the backbone over HTTP.

    Tier 3 / edge: no decision authority — it executes orders and reports state.
    """

    def __init__(
        self,
        team_id: str,
        base_url: str,
        *,
        asset_type: AssetType | str = AssetType.NDRF_TEAM,
        location: LatLon | tuple[float, float] | None = None,
        transport: Callable[[str, str, dict[str, Any] | None], dict[str, Any] | None] | None = None,
        timeout: float = 10.0,
    ) -> None:
        self.team_id = str(team_id)
        self.base_url = base_url.rstrip("/")
        self.asset_type = asset_type if isinstance(asset_type, AssetType) else _coerce_asset(asset_type)
        self.location = _as_latlon(location) or LatLon(0.0, 0.0)
        self.transport = transport
        self.timeout = timeout
        self.status = "idle"
        self.assignment: str | None = None
        self._serviced: set[str] = set()
        #: posts that could not be delivered, kept for re-send on reconnect.
        self.outbox: list[dict[str, Any]] = []

    # ----------------------------------------------------------------- transport
    def _request(
        self, method: str, path: str, json: dict[str, Any] | None = None
    ) -> dict[str, Any] | None:
        """One HTTP round-trip; returns the JSON body, or ``None`` when offline."""
        if self.transport is not None:
            return self.transport(method, path, json)
        try:
            import httpx  # type: ignore  # lazy — optional dependency
        except Exception:
            return None
        try:
            resp = httpx.request(method, f"{self.base_url}{path}", json=json, timeout=self.timeout)
        except Exception:
            return None  # network error -> treat as offline (queue/no-op)
        if resp.status_code >= 400:
            return None
        try:
            return resp.json() if resp.content else {}
        except Exception:
            return {}

    def _post_or_queue(self, path: str, payload: dict[str, Any]) -> bool:
        """POST ``payload``; on offline, append to the outbox and report False."""
        if self._request("POST", path, payload) is not None:
            return True
        self.outbox.append({"path": path, "payload": payload})
        return False

    def flush_outbox(self) -> int:
        """Re-send every queued post; return how many were delivered this pass."""
        sent = 0
        remaining: list[dict[str, Any]] = []
        for item in self.outbox:
            if self._request("POST", item["path"], item["payload"]) is not None:
                sent += 1
            else:
                remaining.append(item)
        self.outbox = remaining
        return sent

    # -------------------------------------------------------------------- inbound
    def poll_orders(self) -> list[DeploymentOrderMsg]:
        """Fetch this team's pending deployment orders from the gateway."""
        data = self._request("GET", f"/field/{self.team_id}/orders")
        if not data:
            return []
        out: list[DeploymentOrderMsg] = []
        for raw in data.get("orders", []):
            if isinstance(raw, dict) and str(raw.get("team_id") or "") == self.team_id:
                out.append(DeploymentOrderMsg.from_payload(raw))
        return out

    # -------------------------------------------------------------------- egress
    def acknowledge(self, order: DeploymentOrderMsg, status: str = "accepted") -> bool:
        """POST an :class:`OrderAck` for ``order`` (queued if offline)."""
        ack = OrderAck(
            order_id=order.order_id, team_id=self.team_id, status=status,
            note=f"team {self.team_id} {status} order for {order.site}",
            incident_id=order.incident_id,
        )
        return self._post_or_queue(f"/field/{self.team_id}/ack", {
            "kind": "order_ack", "order_id": ack.order_id, "team_id": ack.team_id,
            "status": ack.status, "note": ack.note, "incident_id": ack.incident_id,
        })

    def send_beacon(self) -> bool:
        """POST the current GPS/status beacon (queued if offline)."""
        update = TeamStatusUpdate(
            team_id=self.team_id, asset_type=self.asset_type,
            location=self.location, status=self.status, assignment=self.assignment,
        )
        return self._post_or_queue(f"/field/{self.team_id}/beacon", {
            "kind": "gps_beacon", "readings": [update.to_reading()],
        })

    # ----------------------------------------------------------- the closed loop
    def service_next(self) -> dict[str, Any] | None:
        """Poll, service the first un-serviced order, ACK + beacon. Idempotent.

        Returns a summary of what was done, or ``None`` when there's nothing new.
        Mirrors :class:`MockFieldClient` over the wire: advance one step along
        ``idle -> enroute -> onsite``, snap to the destination on arrival, then
        acknowledge and report position.
        """
        for order in self.poll_orders():
            if order.order_id in self._serviced:
                continue
            self._serviced.add(order.order_id)
            self.assignment = order.site
            self._advance_toward_site(order)
            acked = self.acknowledge(order)
            beaconed = self.send_beacon()
            return {
                "order_id": order.order_id, "site": order.site, "status": self.status,
                "acked": acked, "beaconed": beaconed, "queued": len(self.outbox),
            }
        return None

    def _advance_toward_site(self, order: DeploymentOrderMsg) -> None:
        idx = STATUS_FLOW.index(self.status) if self.status in STATUS_FLOW else 0
        self.status = STATUS_FLOW[min(idx + 1, STATUS_FLOW.index("onsite"))]
        if self.status == "onsite" and order.waypoints:
            ll = _as_latlon(order.waypoints[-1])
            if ll is not None:
                self.location = ll

    def snapshot(self) -> dict[str, Any]:
        """Serialisable live device state (debug / tests)."""
        return {
            "team_id": self.team_id,
            "asset_type": self.asset_type.value,
            "status": self.status,
            "assignment": self.assignment,
            "location": {"lat": self.location.lat, "lon": self.location.lon},
            "serviced": sorted(self._serviced),
            "outbox": len(self.outbox),
        }


def _coerce_asset(value: str) -> AssetType:
    try:
        return AssetType(value)
    except ValueError:
        return AssetType.NDRF_TEAM
