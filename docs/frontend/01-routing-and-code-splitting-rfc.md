# RFC 01 — Routing & Code-Splitting

- **Status:** Proposed
- **Scope:** `clients/web`
- **Decision driver:** A 1.16 MB main JS chunk and no URL state.

## 1. Context

Module navigation today lives entirely in React state. From
[`App.tsx`](../../clients/web/src/App.tsx):

```tsx
const [activeModule, setActiveModule] = useState<UnifiedModuleKey>(
  isMobile ? 'field' : 'dashboard',
)
// ...
{activeModule === 'dashboard' && <Dashboard />}
{activeModule === 'escalation' && <Escalation />}
{activeModule === 'report'     && <Report />}
{activeModule === 'evidence'   && <Evidence />}
{activeModule === 'field'      && <Field />}
```

Every module is imported at the top of `App.tsx`, so **all five modules — and their
transitive dependencies (MapLibre, Recharts, the LLM clients) — are in the initial
bundle**, whether or not the user ever opens them.

### Consequences

1. **Bundle bloat.** The main chunk is **1,164 kB (317 kB gzip)**, past Vite's 800 kB
   warning. A commander who only ever looks at the dashboard still downloads the
   report generator's Recharts code and the evidence module's backtest map.
2. **No URL state.** You cannot link to `/escalation`, deep-link an incident, bookmark
   a view, or use browser back/forward. Refresh always returns to the default module.
3. **No route-level boundaries.** Error and loading states can't be scoped per route;
   the single top-level `ErrorBoundary` is all-or-nothing.
4. **Analytics & auth blind spots.** No route changes to instrument; no natural place
   to gate a module behind a permission.

## 2. Goals / Non-goals

**Goals**
- Cut initial JS to **< 500 kB gzip** (target: dashboard-only first load).
- Real URLs per module with deep-linking and back/forward support.
- Per-route lazy loading with scoped loading + error boundaries.

**Non-goals**
- SSR/SSG. Out of scope and not wanted — see §6.
- A nested/complex route tree. We have 5 modules; keep it flat.
- Rewriting module internals.

## 3. Decision

Adopt routing in **two independently shippable phases.** Phase 1 captures ~90% of the
benefit with a tiny diff; Phase 2 adds real URLs.

### Phase 1 — Lazy-load modules (no router) ✅ ship first

Replace the static imports with `React.lazy` + `Suspense`. This is a ~15-line change
to `App.tsx` and immediately splits each module into its own chunk.

```tsx
import { lazy, Suspense } from 'react'

const Dashboard = lazy(() => import('./modules/dashboard/Dashboard'))
const Escalation = lazy(() => import('./modules/escalation/Escalation'))
const Report    = lazy(() => import('./modules/report/Report'))
const Evidence  = lazy(() => import('./modules/evidence/Evidence'))
const Field     = lazy(() => import('./modules/field/Field'))

// inside CommandShell:
<Suspense fallback={<ModuleSkeleton />}>
  {activeModule === 'dashboard' && <Dashboard />}
  {/* ... */}
</Suspense>
```

> Note: modules currently use **named** exports (`export function Dashboard`). Either
> add `export default` or use `lazy(() => import('...').then(m => ({ default: m.Dashboard })))`.

**Effect:** Recharts (report) and the backtest map (evidence) leave the initial
bundle. Dashboard-first load drops to roughly the dashboard + MapLibre + shell.

### Phase 2 — Introduce a router

Add `react-router-dom` (already the ecosystem default; ~12 kB gzip) and map each
module to a path. Keep it flat:

```
/                 → redirect to /dashboard
/dashboard
/escalation
/incidents        (report module)
/evidence
/field            (or device-routed)
```

`CommandShell` becomes the layout route; `activeModule` state is replaced by the
active path, and `useIsMobile` decides whether `/` redirects to `/field`. The sidebar
swaps `onClick` handlers for `<NavLink>` (free active styling).

**Why a router and not hand-rolled `history.pushState`?** We'd reinvent param parsing,
active-link state, and back/forward handling. At 5 routes the library cost (~12 kB) is
less than the bespoke code it removes, and it unlocks deep-linking (incident IDs,
evidence tabs) cleanly.

### Also: split MapLibre out of the main chunk

Independent of routing, extend `manualChunks` in
[`vite.config.ts`](../../clients/web/vite.config.ts) so MapLibre (44 MB on disk; the
single largest runtime dep) becomes its own cacheable vendor chunk, loaded only with
the dashboard/evidence maps:

```ts
if (id.includes('node_modules/maplibre-gl')) return 'maplibre-vendor'
```

Combined with Phase 1, MapLibre then loads only when a map-bearing module mounts.

## 4. Migration plan

| Step | Change | Risk | Reversible |
|------|--------|------|-----------|
| 1 | `manualChunks` → split `maplibre-vendor` | trivial | yes |
| 2 | `React.lazy` the 5 modules + `<Suspense>` skeleton | low | yes |
| 3 | Add per-module error boundary inside `Suspense` | low | yes |
| 4 | Add `react-router-dom`, layout route, path↔module map | medium | yes |
| 5 | Replace sidebar handlers with `<NavLink>`; redirect `/`→default | low | yes |

Steps 1–3 are one PR (no new deps, pure win). Steps 4–5 are a second PR.

## 5. Expected impact

| Metric | Now | After P1 | After P1+P2 |
|--------|-----|----------|-------------|
| Initial JS (gzip) | ~478 kB | ~280–320 kB | ~290–330 kB |
| Deep-linkable | no | no | **yes** |
| Per-route boundaries | no | **yes** | yes |
| New deps | — | none | `react-router-dom` (~12 kB gz) |

(Initial-JS estimates assume dashboard-first; report/evidence chunks load on demand.)

## 6. Rejected alternative: SSR/Next.js

Considered and rejected. DisasterMind is auth-gated (no SEO/share surface), renders
real-time WebSocket data, and is dominated by a client-only map. SSR would add a
Node render tier, hydration cost, and "window is not defined" hazards (MapLibre,
`useIsMobile`) for **zero user-facing benefit**. CSR is the correct rendering model;
this RFC optimizes within it.

## 7. Open questions

- Path naming: expose `report` as `/incidents` (matches the sidebar label) or
  `/report`? Recommend `/incidents` for user-facing consistency.
- Should `/field` be a route or stay device-gated? Recommend device-gated redirect so
  desktop users can't land on the phone UI by URL.
