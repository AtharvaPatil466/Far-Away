// DisasterMind Operator Console (PRD Step 7 dashboard + Step 10 refresh).
//
// Composes the dashboard from the typed API client + hooks:
//   * /topics  (3s poll) -> TopicTiles + ThroughputChart
//   * /health  (3s poll) -> header snapshot
//   * /escalations (3s poll + ws bump) -> EscalationQueue (approve/reject)
//   * /ws (live) -> message ring buffer -> DispatchMap + LiveStream
import { useCallback, useEffect, useState } from "react";

import { api } from "./api/client";
import type { Message, TopicCounts } from "./api/types";
import { isEscalationish } from "./api/types";
import { usePolling } from "./hooks/usePolling";
import { useWebSocket, type WsStatus } from "./hooks/useWebSocket";
import { MapboxDispatchMap } from "./components/MapboxDispatchMap";
import { EscalationQueue } from "./components/EscalationQueue";
import { LiveStream } from "./components/LiveStream";
import { ThroughputChart } from "./components/ThroughputChart";
import { TopicTiles } from "./components/TopicTiles";

const MAX_MESSAGES = 500;

function wsLabel(s: WsStatus): string {
  if (s === "live") return "live";
  if (s === "reconnecting") return "reconnecting…";
  return "connecting…";
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [snapshotCounts, setSnapshotCounts] = useState<TopicCounts>({});
  const [escalationBump, setEscalationBump] = useState(0);
  const [approver, setApprover] = useState("commander");

  const topics = usePolling((s) => api.topics(s));
  const health = usePolling((s) => api.health(s));

  // Seed the stream/map with recent history once, before live frames arrive.
  useEffect(() => {
    let cancelled = false;
    api
      .incidents(300)
      .then((ms) => {
        if (!cancelled) setMessages(ms);
      })
      .catch(() => {
        /* transient; /ws will populate */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onMessage = useCallback((msg: Message) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev;
      const next = [...prev, msg];
      return next.length > MAX_MESSAGES ? next.slice(-MAX_MESSAGES) : next;
    });
    if (isEscalationish(msg.topic)) setEscalationBump((n) => n + 1);
  }, []);

  const onSnapshot = useCallback((t: TopicCounts) => setSnapshotCounts(t), []);
  const wsStatus = useWebSocket({ onMessage, onSnapshot });

  // Prefer freshly polled counts; fall back to the initial ws snapshot.
  const counts = topics.data ?? snapshotCounts;
  const h = health.data;

  return (
    <>
      <header className="app">
        <h1>DisasterMind — Operator Console</h1>
        <div className="status">
          <span>
            {h
              ? `health: ${h.status} · seen ${h.messages_seen} · pending ${h.pending_escalations}${
                  h.commander ? ` · ${h.commander}` : ""
                }`
              : "health: …"}
          </span>
          <span>
            <span className={`dot ${wsStatus}`} /> /ws {wsLabel(wsStatus)}
          </span>
        </div>
      </header>

      <main className="grid">
        <TopicTiles counts={counts} />
        <EscalationQueue bumpKey={escalationBump} approver={approver} />
        <ThroughputChart counts={counts} />
        <section className="panel">
          <h2>Console settings</h2>
          <label className="k" style={{ color: "var(--muted)", fontSize: 12 }}>
            Approver name (sent with approve/reject)
          </label>
          <div style={{ marginTop: 8 }}>
            <input
              className="approver"
              value={approver}
              onChange={(e) => setApprover(e.target.value)}
              placeholder="commander"
            />
          </div>
          <div className="result">
            API base: relative (Vite proxy → :8000). Override with VITE_API_BASE.
          </div>
        </section>
        <MapboxDispatchMap messages={messages} />
        <LiveStream messages={messages} />
      </main>
    </>
  );
}
