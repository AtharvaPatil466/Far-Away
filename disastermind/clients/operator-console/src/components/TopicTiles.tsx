// Per-topic message-volume tiles (GET /topics). CRITICAL-priority traffic on
// the escalation topic is highlighted to mirror the reference dashboard.
import type { TopicCounts } from "../api/types";

export function TopicTiles({ counts }: { counts: TopicCounts }) {
  const keys = Object.keys(counts).sort();
  const total = keys.reduce((sum, k) => sum + counts[k], 0);
  return (
    <section className="panel">
      <h2>
        Topic volume <span className="count">{total}</span>
      </h2>
      {keys.length === 0 ? (
        <span className="empty">no traffic yet</span>
      ) : (
        <div className="tiles">
          {keys.map((k) => (
            <div key={k} className={`tile${k.includes("escalation") ? " crit" : ""}`}>
              <div className="k">{k}</div>
              <div className="v">{counts[k]}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
