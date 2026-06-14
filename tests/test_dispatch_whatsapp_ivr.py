"""WhatsApp + IVR dispatch channels — build shape, offline fallback, live seam."""
from __future__ import annotations

from disastermind.core.config import Settings
from disastermind.tier3.dispatch import (
    DispatchRouter,
    IvrChannel,
    WhatsAppChannel,
    build_channels,
)


# ------------------------------------------------------------------- WhatsApp
class TestWhatsAppChannel:
    def test_build_prefixes_whatsapp_address(self) -> None:
        ch = WhatsAppChannel()
        wire = ch.build({"recipients": ["+919812345678"], "from": "+14155551234", "body": "Evacuate now"})
        assert wire["transport"] == "whatsapp"
        assert wire["to"] == ["whatsapp:+919812345678"]
        assert wire["from"] == "whatsapp:+14155551234"
        assert wire["text"] == "Evacuate now"

    def test_already_prefixed_address_not_doubled(self) -> None:
        ch = WhatsAppChannel()
        wire = ch.build({"recipients": ["whatsapp:+919812345678"], "from": "whatsapp:+14155551234"})
        assert wire["to"] == ["whatsapp:+919812345678"]
        assert wire["from"] == "whatsapp:+14155551234"

    def test_offline_records_without_credentials(self) -> None:
        # dry_run default => record-only, no network.
        ch = WhatsAppChannel(settings=Settings())
        receipt = ch.send({"recipients": ["+919812345678"], "body": "hi"})
        assert receipt["channel"] == "whatsapp"
        assert receipt["status"] == "recorded"
        assert receipt["dry_run"] is True

    def test_live_uses_injected_transport_seam(self) -> None:
        seen: list[dict] = []

        def fake_transport(wire: dict) -> dict:
            seen.append(wire)
            return {"kind": "dispatch_receipt", "channel": "whatsapp", "status": "sent",
                    "recipients": wire["to"], "provider": "twilio-whatsapp", "dry_run": False,
                    "detail": "stub", "message_id": "wa-1", "sent_at": "t"}

        ch = WhatsAppChannel(dry_run=False, live=True, transport=fake_transport)
        receipt = ch.send({"recipients": ["+91981"], "from": "+1415", "body": "go"})
        assert receipt["status"] == "sent"
        assert len(seen) == 1 and seen[0]["transport"] == "whatsapp"


# ----------------------------------------------------------------- IVR / voice
class TestIvrChannel:
    def test_build_wraps_body_in_twiml_say(self) -> None:
        ch = IvrChannel()
        wire = ch.build({"recipients": ["+91981"], "from": "+1415",
                         "body": "Cyclone landfall in 12 hours", "language": "or-IN"})
        assert wire["transport"] == "voice"
        assert wire["language"] == "or-IN"
        assert "<Say language=\"or-IN\">Cyclone landfall in 12 hours</Say>" in wire["twiml"]
        assert wire["twiml"].startswith("<?xml")

    def test_twiml_escapes_xml_special_chars(self) -> None:
        ch = IvrChannel()
        wire = ch.build({"recipients": ["+91981"], "body": "rescue <units> & boats"})
        assert "&lt;units&gt; &amp; boats" in wire["twiml"]
        assert "<units>" not in wire["twiml"]

    def test_default_language_is_en_in(self) -> None:
        ch = IvrChannel()
        wire = ch.build({"recipients": ["+91981"], "body": "x"})
        assert wire["language"] == "en-IN"

    def test_offline_records_without_credentials(self) -> None:
        ch = IvrChannel(settings=Settings())
        receipt = ch.send({"recipients": ["+91981"], "body": "alert"})
        assert receipt["channel"] == "ivr"
        assert receipt["status"] == "recorded"

    def test_live_uses_injected_transport_seam(self) -> None:
        calls: list[dict] = []

        def fake_transport(wire: dict) -> dict:
            calls.append(wire)
            return {"kind": "dispatch_receipt", "channel": "ivr", "status": "sent",
                    "recipients": wire["to"], "provider": "twilio-voice", "dry_run": False,
                    "detail": "stub", "message_id": "call-1", "sent_at": "t"}

        ch = IvrChannel(dry_run=False, live=True, transport=fake_transport)
        receipt = ch.send({"recipients": ["+91981"], "from": "+1415", "body": "go"})
        assert receipt["status"] == "sent"
        assert calls[0]["transport"] == "voice"


# --------------------------------------------------------------------- wiring
def test_new_channels_registered_in_factory_and_router() -> None:
    channels = build_channels(Settings(), dry_run=True)
    names = {c.name for c in channels}
    assert {"whatsapp", "ivr"} <= names

    router = DispatchRouter.__new__(DispatchRouter)  # avoid bus wiring; just test resolution
    router.channels = {c.name: c for c in channels}
    # Exact names and friendly aliases both resolve.
    assert router._select("whatsapp")[0].name == "whatsapp"
    assert router._select("wa")[0].name == "whatsapp"
    assert router._select("ivr")[0].name == "ivr"
    assert router._select("voice")[0].name == "ivr"
    assert router._select("call")[0].name == "ivr"
