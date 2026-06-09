// Live escalation queue (GET /escalations) with approve/reject.
//
// Polls every 3s and also refreshes immediately when an escalation-ish bus
// message streams in (driven by the `bumpKey` prop from App's /ws handler).
// Approve -> POST /escalations/{id}/approve (commander dispatches); Reject ->
// POST .../reject (rejection ACK). Mirrors the reference dashboard, adding a
// human-only badge, a live deadline countdown, and the dispatched/ack result.
import { useEffect, useState } from "react";

import { api } from "../api/client";
import type { ApproveResult, RejectResult } from "../api/types";
import { usePolling } from "../hooks/usePolling";
import { clock, countdown, isOverdue, triggerLabel } from "../lib/format";

type Decision =
  | { kind: "ok"; text: string }
  | { kind: "err"; text: string }
  | null;

export function EscalationQueue({
  bumpKey,
  approver,
}: {
  bumpKey: number;
  approver: string;
}) {
  const { data, error, refresh } = usePolling((signal) => api.escalations(signal));
  const escalations = data ?? [];

  // Refresh out-of-band when a streamed escalation/dispatch likely changed state.
  useEffect(() => {
    if (bumpKey > 0) refresh();
  }, [bumpKey, refresh]);

  // 1s tick so the deadline countdowns stay live between 3s polls.
  const [, setNow] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNow((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, Decision>>({});

  const decide = async (id: string, action: "approve" | "reject") => {
    setBusy(id);
    try {
      const res: ApproveResult | RejectResult =
        action === "approve"
          ? await api.approve(id, approver || "commander")
          : await api.reject(id, approver || "commander", "rejected from console");
      const count =
        "dispatched" in res ? res.dispatched.length : res.acks.length;
      setResults((r) => ({
        ...r,
        [id]: {
          kind: "ok",
          text:
            action === "approve"
              ? `approved — ${count} order(s) dispatched`
              : `rejected — ${count} ack(s) emitted`,
        },
      }));
      refresh();
    } catch (e) {
      setResults((r) => ({
        ...r,
        [id]: { kind: "err", text: e instanceof Error ? e.message : String(e) },
      }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="panel">
      <h2>
        Open escalations <span className="count">{escalations.length}</span>
      </h2>
      {error && escalations.length === 0 ? (
        <span className="empty">escalations endpoint unreachable</span>
      ) : escalations.length === 0 ? (
        <span className="empty">no pending escalations</span>
      ) : (
        escalations.map((e) => {
          const overdue = isOverdue(e.deadline_epoch);
          const result = results[e.report_id];
          return (
            <div
              key={e.report_id}
              className={`esc${e.human_only ? " human-only" : ""}`}
            >
              <div className="trigger">
                {triggerLabel(e.trigger)}
                {e.human_only ? <span className="badge human">human-only</span> : null}
                <span className="badge status">{e.status}</span>
              </div>
              <div className="meta">
                id: {e.report_id}
                {e.incident_id ? ` · ${e.incident_id}` : ""} · deadline{" "}
                <span className={`deadline${overdue ? " overdue" : ""}`}>
                  {countdown(e.deadline_epoch)}
                </span>{" "}
                ({clock(new Date(e.deadline_epoch * 1000).toISOString())})
              </div>
              <div className="actions">
                <button
                  className="approve"
                  disabled={busy === e.report_id}
                  onClick={() => void decide(e.report_id, "approve")}
                >
                  Approve
                </button>
                <button
                  className="reject"
                  disabled={busy === e.report_id}
                  onClick={() => void decide(e.report_id, "reject")}
                >
                  Reject
                </button>
                {e.human_only ? (
                  <span className="badge">no auto-exec on timeout</span>
                ) : null}
              </div>
              {result ? (
                <div className={`result ${result.kind}`}>{result.text}</div>
              ) : null}
            </div>
          );
        })
      )}
    </section>
  );
}
