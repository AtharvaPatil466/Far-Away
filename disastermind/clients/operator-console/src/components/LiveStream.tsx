// Live message stream (WebSocket /ws) — newest at the bottom, auto-scrolled.
// CRITICAL-priority rows are highlighted (.row.p-1), mirroring the reference UI.
import { useEffect, useRef } from "react";

import type { Message } from "../api/types";
import { clock } from "../lib/format";

const MAX_ROWS = 200;

export function LiveStream({ messages }: { messages: Message[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const rows = messages.slice(-MAX_ROWS);

  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  return (
    <section className="panel full">
      <h2>
        Live message stream <span className="count">{messages.length}</span>
      </h2>
      <div className="stream" ref={ref}>
        {rows.length === 0 ? (
          <span className="empty">waiting for messages on /ws…</span>
        ) : (
          rows.map((m) => (
            <div key={m.id} className={`row p-${m.priority}`}>
              <span className="time">{clock(m.timestamp)}</span>
              <span className="topic">{m.topic}</span>
              <span className="type">{m.type}</span>
              <span className="inc">{m.incident_id ?? ""}</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
