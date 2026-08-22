"""HttpFieldClient — closed loop over HTTP + durable offline outbox."""
from __future__ import annotations

from disastermind.fieldapp import HttpFieldClient
from disastermind.models.domain import AssetType


def _fake_transport(orders):
    """A scripted transport: serves ``orders`` on GET, records POSTs."""
    posts: list[dict] = []

    def transport(method, path, json):
        if method == "GET" and path.endswith("/orders"):
            return {"orders": orders}
        if method == "POST":
            posts.append({"path": path, "payload": json})
            return {}  # 2xx, empty body
        return {}

    transport.posts = posts  # type: ignore[attr-defined]
    return transport


ORDER = {"order_id": "o-1", "team_id": "ndrf-7", "site": "Zone-3",
         "waypoints": [{"lat": 19.8, "lon": 85.8}], "incident_id": "inc-1"}


class TestClosedLoop:
    def test_poll_returns_only_matching_team(self) -> None:
        other = {"order_id": "o-2", "team_id": "sdrf-1", "site": "Zone-9"}
        c = HttpFieldClient("ndrf-7", "http://gw", transport=_fake_transport([ORDER, other]))
        orders = c.poll_orders()
        assert [o.order_id for o in orders] == ["o-1"]

    def test_service_next_acks_and_beacons(self) -> None:
        t = _fake_transport([ORDER])
        c = HttpFieldClient("ndrf-7", "http://gw", transport=t)
        summary = c.service_next()
        assert summary["order_id"] == "o-1"
        assert summary["status"] == "enroute"      # idle -> enroute on first order
        assert summary["acked"] and summary["beaconed"]
        paths = [p["path"] for p in t.posts]  # type: ignore[attr-defined]
        assert "/field/ndrf-7/ack" in paths and "/field/ndrf-7/beacon" in paths

    def test_service_is_idempotent(self) -> None:
        c = HttpFieldClient("ndrf-7", "http://gw", transport=_fake_transport([ORDER]))
        assert c.service_next() is not None
        assert c.service_next() is None            # same order not serviced twice

    def test_second_order_advances_to_onsite_and_snaps_location(self) -> None:
        c = HttpFieldClient("ndrf-7", "http://gw", transport=_fake_transport([ORDER]))
        c.service_next()                            # enroute
        c._serviced.clear()                         # simulate a re-issued order
        summary = c.service_next()
        assert summary["status"] == "onsite"
        assert (round(c.location.lat, 1), round(c.location.lon, 1)) == (19.8, 85.8)

    def test_nothing_to_do_returns_none(self) -> None:
        c = HttpFieldClient("ndrf-7", "http://gw", transport=_fake_transport([]))
        assert c.service_next() is None


class TestOfflineOutbox:
    def test_offline_post_is_queued_not_lost(self) -> None:
        # Transport returns None for POSTs => offline; GET still serves the order.
        def offline(method, path, json):
            return {"orders": [ORDER]} if method == "GET" else None

        c = HttpFieldClient("ndrf-7", "http://gw", transport=offline)
        summary = c.service_next()
        assert summary["acked"] is False and summary["beaconed"] is False
        assert len(c.outbox) == 2                   # ack + beacon both queued
        assert summary["queued"] == 2

    def test_flush_outbox_resends_on_reconnect(self) -> None:
        delivered: list[dict] = []
        online = {"flag": False}

        def flaky(method, path, json):
            if method == "GET":
                return {"orders": [ORDER]}
            if not online["flag"]:
                return None                          # still offline
            delivered.append({"path": path})
            return {}

        c = HttpFieldClient("ndrf-7", "http://gw", transport=flaky)
        c.service_next()                             # queues ack + beacon
        assert len(c.outbox) == 2
        online["flag"] = True                        # reconnect
        sent = c.flush_outbox()
        assert sent == 2 and c.outbox == []
        assert len(delivered) == 2

    def test_real_path_offline_when_httpx_absent(self) -> None:
        # No transport injected and (in the test env) a real request can't be made
        # to a bogus host — must degrade to the outbox, never raise.
        c = HttpFieldClient("ndrf-7", "http://127.0.0.1:0", timeout=0.05)
        ok = c.send_beacon()
        assert ok is False and len(c.outbox) == 1    # queued, not crashed


def test_snapshot_shape() -> None:
    c = HttpFieldClient("ndrf-7", "http://gw", asset_type=AssetType.NDRF_TEAM,
                        transport=_fake_transport([ORDER]))
    c.service_next()
    snap = c.snapshot()
    assert snap["team_id"] == "ndrf-7"
    assert snap["status"] == "enroute"
    assert "outbox" in snap
