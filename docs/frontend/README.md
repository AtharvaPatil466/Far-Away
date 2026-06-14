# DisasterMind — Frontend Architecture

Architecture documentation for `clients/web`, the DisasterMind Human Command &
Control interface. These documents are decision records and audits, not tutorials
— each states the current reality, the recommendation, and the trade-offs.

## Documents

| # | Document | Type | Status |
|---|----------|------|--------|
| 01 | [Routing & Code-Splitting](./01-routing-and-code-splitting-rfc.md) | RFC | Proposed |
| 02 | [Design System Specification](./02-design-system-spec.md) | Spec | Living |
| 03 | [State Management](./03-state-management-rfc.md) | RFC | Proposed |
| 04 | [Performance Audit](./04-performance-audit.md) | Audit | 2026-06-14 |

## Current state snapshot

A one-screen picture of the frontend as of this writing. Each row links to the
document that covers it in depth.

| Dimension | Today |
|-----------|-------|
| Framework | React 19 + TypeScript (strict), Vite 8 (rolldown) |
| Rendering | 100% client-side (CSR). No SSR/SSG — a deliberate fit for an auth-gated, real-time console |
| Routing | **None.** Module switching is `useState<UnifiedModuleKey>` in `App.tsx` |
| Code-splitting | Vendor split only (react, recharts). All 5 modules eagerly bundled; MapLibre in the main chunk |
| Bundle (main JS) | **1,164 kB / 317 kB gzip** — over Vite's 800 kB warning |
| Styling | Tailwind v4 (`@tailwindcss/vite`) + hand-built shadcn primitives + a Material-3 token theme |
| Design systems | **Two coexisting** — light "tactical sand" (new) and legacy dark "Aeronautic" (cascade-layered) |
| State | Local `useState` + 5 bespoke hooks; raw WebSocket for live data. No server-state lib, no global store |
| Testing | Vitest unit (17 tests / 4 files) + CI. No E2E |
| Error handling | Top-level `ErrorBoundary` in `main.tsx` |

## Module inventory

Five feature modules under `src/modules/`, switched by `activeModule` in
[`App.tsx`](../../clients/web/src/App.tsx):

- **dashboard** — commander view: live MapLibre map, KPIs, escalation queue, deployments
- **escalation** — scenario → LLM-generated memo → commander decision flow
- **report** — post-incident report generator (incident config → LLM report + Recharts)
- **evidence** — validation surface: cyclone backtest map, feed provenance, shadow journal
- **field** — full-screen mobile responder app (separate render branch)

Shared layers: `components/ui/` (5 primitives), `components/` (13 shared),
`hooks/` (5), `lib/` and `services/` (API/WS/LLM clients).

## Reading order

1. **[Performance Audit](./04-performance-audit.md)** — what hurts today, measured.
2. **[Routing & Code-Splitting RFC](./01-routing-and-code-splitting-rfc.md)** — the
   single highest-leverage change; fixes most of the audit's findings.
3. **[State Management RFC](./03-state-management-rfc.md)** — when (and whether) to
   formalize live/server state.
4. **[Design System Spec](./02-design-system-spec.md)** — the token system and the
   plan to retire the second (dark) design language.

## Guiding principles

- **Right-size the architecture.** This is a focused 5-module console, not a 200-route
  product. We add routers, stores, and abstractions when a concrete problem demands
  them, and we say so in an RFC. We do not adopt patterns speculatively.
- **CSR is a feature, not a gap.** No SEO surface, auth-gated, real-time, map-heavy —
  SSR would add infrastructure and hydration cost for no user benefit. See ADR-01.
- **One design system.** Two coexisting token systems is migration debt to be paid
  down, not a permanent state.
- **The build budget is a contract.** Bundle size is tracked and gated, not discovered.
