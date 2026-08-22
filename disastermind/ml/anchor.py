"""External anchor receipts for the shadow-season journal.

The journal's hash chain proves internal consistency: nobody edited line 40
without rewriting every line after it. It cannot prove *when* the chain existed,
because a whole-file rewrite recomputes every hash. That is what an external
anchor is for -- a third party attesting "this chain head existed at this time".

Here the third party is GitHub Actions: the scheduled worker commits the journal
from a bot account, and the run's server-recorded timestamp is the attestation.

The receipt is CACHED ON DISK and every function here is OFFLINE. A demo on
conference wifi must never show a red integrity badge because an API call timed
out -- an unreachable network says nothing about whether the anchor exists, and
a check that conflates the two is worse than no check.

Anchor state is reported SEPARATELY from chain integrity. A stale anchor and a
broken chain are different failures: one means the cron stopped, the other means
someone tampered. Collapsing them into one light loses the distinction that
matters.
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timedelta
from typing import Any

#: Default location, committed alongside the journal it attests to.
DEFAULT_RECEIPT = "shadow/anchor_receipt.json"

#: The anchoring worker runs daily. Two missed days before the anchor is called
#: stale, matching the journal's own freshness policy.
ANCHOR_STALE_AFTER_HOURS = 48

_REQUIRED = ("run_id", "url", "server_time", "chain_head")


def write_receipt(
    path: str,
    *,
    run_id: str,
    url: str,
    server_time: str,
    chain_head: str,
    repo: str = "",
) -> dict[str, Any]:
    """Record one external attestation of the current chain head."""
    receipt = {
        "run_id": str(run_id),
        "url": url,
        "server_time": server_time,
        "chain_head": chain_head,
        "repo": repo,
    }
    os.makedirs(os.path.dirname(os.path.abspath(path)) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(receipt, fh, indent=2, sort_keys=True)
        fh.write("\n")
    return receipt


def read_receipt(path: str = DEFAULT_RECEIPT) -> dict[str, Any] | None:
    """Load the cached receipt. Returns None if absent or unreadable.

    Never raises and never touches the network: a missing or corrupt receipt is
    an ANSWER ("not anchored"), not an error that should take down a dashboard.
    """
    if not os.path.exists(path):
        return None
    try:
        with open(path, encoding="utf-8") as fh:
            receipt = json.load(fh)
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(receipt, dict) or not all(k in receipt for k in _REQUIRED):
        return None
    return receipt


def anchor_status(
    chain_head: str, *, path: str = DEFAULT_RECEIPT, now: str | None = None
) -> dict[str, Any]:
    """Report the anchor as its own check, offline.

    States:

    * ``absent``  -- no receipt. The season has never been anchored.
    * ``stale``   -- anchored, but not within :data:`ANCHOR_STALE_AFTER_HOURS`.
    * ``drifted`` -- the journal has grown since the last anchor. NOT a failure:
      it is the normal state between runs, and ``pending`` says how to read it.
    * ``verified`` -- anchored recently, and the attested head is the current one.
    """
    receipt = read_receipt(path)
    if receipt is None:
        return {"state": "absent", "receipt": None,
                "detail": "no anchor receipt — season has never been externally attested"}

    now = now or datetime.now().astimezone().isoformat()
    fresh_since = (datetime.fromisoformat(now) - timedelta(hours=ANCHOR_STALE_AFTER_HOURS)).isoformat()
    matches_head = receipt["chain_head"] == chain_head

    if receipt["server_time"] < fresh_since:
        state = "stale"
        detail = f"last anchored {receipt['server_time']} — worker may have stopped"
    elif matches_head:
        state = "verified"
        detail = f"chain head attested by {receipt['url']}"
    else:
        state = "drifted"
        detail = "journal has grown since the last anchor — normal between runs"

    return {
        "state": state,
        "detail": detail,
        "attested_head": receipt["chain_head"],
        "current_head": chain_head,
        "head_matches": matches_head,
        "server_time": receipt["server_time"],
        "url": receipt["url"],
        "run_id": receipt["run_id"],
        "stale_after_hours": ANCHOR_STALE_AFTER_HOURS,
        "receipt": receipt,
    }
