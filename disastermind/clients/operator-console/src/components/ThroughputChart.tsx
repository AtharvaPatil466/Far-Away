// Live topic-throughput chart.
//
// Samples the cumulative /topics counts every 3s and plots the per-interval
// delta (messages/interval) so the operator sees the coordination loop's
// activity over time. A flat line during quiet periods is meaningful signal.
import { useEffect, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { TopicCounts } from "../api/types";

interface Sample {
  time: string;
  throughput: number;
  total: number;
}

const MAX_SAMPLES = 40;
const SAMPLE_MS = 3000;

export function ThroughputChart({ counts }: { counts: TopicCounts }) {
  const countsRef = useRef(counts);
  countsRef.current = counts;
  const prevTotal = useRef<number | null>(null);
  const [samples, setSamples] = useState<Sample[]>([]);

  useEffect(() => {
    const tick = () => {
      const total = Object.values(countsRef.current).reduce((a, b) => a + b, 0);
      const delta = prevTotal.current === null ? 0 : Math.max(0, total - prevTotal.current);
      prevTotal.current = total;
      const time = new Date().toLocaleTimeString([], { hour12: false });
      setSamples((s) => [...s, { time, throughput: delta, total }].slice(-MAX_SAMPLES));
    };
    tick();
    const id = setInterval(tick, SAMPLE_MS);
    return () => clearInterval(id);
  }, []);

  const peak = samples.reduce((m, s) => Math.max(m, s.throughput), 0);

  return (
    <section className="panel">
      <h2>
        Throughput (msgs / 3s) <span className="count">peak {peak}</span>
      </h2>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={samples} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="tp" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#58a6ff" stopOpacity={0.6} />
              <stop offset="100%" stopColor="#58a6ff" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#30363d" strokeDasharray="3 3" />
          <XAxis dataKey="time" stroke="#8b949e" fontSize={10} minTickGap={40} />
          <YAxis stroke="#8b949e" fontSize={10} allowDecimals={false} width={32} />
          <Tooltip
            contentStyle={{ background: "#161b22", border: "1px solid #30363d" }}
            labelStyle={{ color: "#8b949e" }}
          />
          <Area
            type="monotone"
            dataKey="throughput"
            stroke="#58a6ff"
            fill="url(#tp)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </section>
  );
}
