"""Measure and print coordination throughput + latency percentiles.

Deliberately a REPORTING script, not a test. ``benchmarks/harness.py`` reports
counts rather than elapsed seconds precisely so its assertions never flake, and
that decision is right -- wall-clock numbers on a shared CI runner would produce
a test that fails for reasons unrelated to the code. So the timing lives here,
where a human runs it and reads the result.

Run: python tools/benchmark_report.py   (or `make benchmark`)
"""
from __future__ import annotations

import os
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from disastermind.benchmarks.harness import drive_n_incidents

RUNS = 30
INCIDENTS_PER_RUN = 10


def main() -> int:
    drive_n_incidents(5, cycles=1)  # warm import/JIT paths before timing

    latencies_ms: list[float] = []
    started = time.perf_counter()
    result = None
    for _ in range(RUNS):
        run_start = time.perf_counter()
        result = drive_n_incidents(INCIDENTS_PER_RUN, cycles=1)
        latencies_ms.append((time.perf_counter() - run_start) * 1000)
    elapsed = time.perf_counter() - started

    latencies_ms.sort()

    def pct(q: float) -> float:
        return latencies_ms[min(len(latencies_ms) - 1, int(q * len(latencies_ms)))]

    incidents = RUNS * INCIDENTS_PER_RUN
    print("DisasterMind coordination throughput")
    print("=" * 52)
    print(f"  workload           {RUNS} runs x {INCIDENTS_PER_RUN} incidents, full DAG")
    print(f"  messages per run   {result.messages_processed}")
    print(f"  dispatches per run {result.dispatches}")
    print(f"  throughput         {incidents / elapsed:,.0f} incidents/s")
    print(f"                     {result.messages_processed * RUNS / elapsed:,.0f} messages/s")
    print(f"  latency per run    p50 {pct(0.50):.1f} ms  "
          f"p95 {pct(0.95):.1f} ms  p99 {pct(0.99):.1f} ms")
    print()
    print("  Single-process, stdlib-only, no broker. Numbers are machine-dependent;")
    print("  regenerate locally rather than quoting these verbatim.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
