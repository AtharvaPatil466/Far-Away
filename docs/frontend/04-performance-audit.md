# Performance Audit

- **Date:** 2026-06-14
- **Scope:** `clients/web`
- **Build:** Vite 8 (rolldown), production `npm run build`

## 1. Bundle analysis (measured)

Production build output:

| Asset | Raw | Gzip |
|-------|-----|------|
| `index.css` | 89.0 kB | 16.7 kB |
| `react-vendor.js` | 189.6 kB | 59.7 kB |
| `recharts-vendor.js` | 342.7 kB | 101.6 kB |
| **`index.js` (app + MapLibre + everything else)** | **1,164.7 kB** | **317.1 kB** |
| **Total JS** | **~1.70 MB** | **~478 kB** |

> ⚠️ `index.js` exceeds Vite's 800 kB warning threshold.

### Findings

**P0 — Everything ships up front.** All 5 modules are statically imported in
`App.tsx`, so the initial download includes the report generator and evidence module
even for a dashboard-only session. This is the dominant problem and is fully addressed
by [RFC 01](./01-routing-and-code-splitting-rfc.md) (lazy modules).

**P0 — MapLibre is unsplit.** `maplibre-gl` is the largest runtime dependency (44 MB on
disk; a large share of the 1.16 MB main chunk) and is bundled into `index.js` rather
than a vendor chunk. It's only needed by the dashboard + evidence maps. Splitting it
(one line in `manualChunks`) makes it cacheable and deferrable.

**P1 — Recharts loads eagerly.** Already a separate 342 kB / 101 kB gz chunk, but it's
only used by the **report** module. Once modules are lazy-loaded (RFC 01), this chunk
naturally defers to report open.

**P2 — CSS is 89 kB raw.** Acceptable (16.7 kB gz), but it carries *two* design systems
(light `app.css` + dark legacy `index.css`). Retiring the legacy layer
([design system spec §6](./02-design-system-spec.md)) will trim it.

## 2. Loading & rendering strategy

### Fonts
`index.html` loads Source Sans 3, Material Symbols, **and** the legacy Aeronautic
family (Anybody / Hanken Grotesk / JetBrains Mono) — three Google Font requests.
Material Symbols in particular is large. Recommendations:
- Use `display=swap` (already present) — good.
- Drop the Aeronautic fonts once the legacy system is retired (one fewer request).
- Consider subsetting Material Symbols to the icons actually used.

### MapLibre
Heaviest single feature. Beyond chunk-splitting:
- Mount the map only when its module is active (free with RFC 01 lazy loading).
- The dashboard already correctly uses a `ResizeObserver` + `map.resize()` to avoid a
  mis-sized canvas — keep that.

### Real-time re-render hotspots
Several always-on intervals drive re-renders. None are pathological today, but they're
worth knowing as the app grows:
- `useApiStatus` polls every **30 s** (move to TanStack Query `refetchInterval` —
  [RFC 03](./03-state-management-rfc.md)).
- Dashboard runs a **1 s** `useNow()` tick (escalation countdowns) and an **8 s** GPS
  drift simulation that calls `setMapState`. The 1 s tick re-renders the whole
  Dashboard subtree; if countdowns multiply, isolate the ticking value into a small
  leaf component so only the timer re-renders.
- The shell clock ticks every **1 s** — already isolated to the header.

## 3. Web Vitals (reasoned, pending field data)

No RUM/Lighthouse run is wired yet; these are reasoned expectations from the bundle and
render model.

| Metric | Expected | Why / lever |
|--------|----------|-------------|
| **LCP** | At risk on cold load | 478 kB gz JS + MapLibre must parse before first meaningful paint. RFC 01 is the fix. |
| **CLS** | Low | Fixed shell grid; map has a sized container. Watch async-loaded cards. |
| **INP** | Good | CSR, light interactions; motion is GPU-friendly transforms, `prefers-reduced-motion` honored. |
| **TTFB** | Static host | Pure static assets (Vite). Cache-control on hashed chunks. |

**Action:** wire a measurement before/after RFC 01 so the win is quantified, not
assumed (see §5).

## 4. Prioritized recommendations

| # | Action | Effort | Impact | Owner doc |
|---|--------|--------|--------|-----------|
| 1 | `manualChunks` → split `maplibre-vendor` | XS | High | RFC 01 |
| 2 | `React.lazy` the 5 modules + `<Suspense>` | S | High | RFC 01 |
| 3 | Wire bundle-size + a Lighthouse/Vitals check into CI | S | Med (prevents regressions) | this doc |
| 4 | Port `useApiStatus` polling → TanStack Query | S | Low–Med | RFC 03 |
| 5 | Isolate the 1 s countdown tick into a leaf component | S | Low | this doc |
| 6 | Retire legacy CSS/fonts (one design system) | M | Low–Med | Design spec §6 |

Items 1–2 deliver the great majority of the win and are a single PR.

## 5. Make performance a contract, not a discovery

- **Bundle budget in CI.** Fail the build if the initial JS chunk exceeds a budget
  (e.g. 350 kB gz). Today the 800 kB Vite warning is advisory and ignorable; a real
  gate prevents silent regressions.
- **Lighthouse CI** on a representative route (dashboard) for LCP/CLS/INP trend lines.
- **Track the numbers in this doc** on each material change, so the audit stays live
  rather than a one-time snapshot.

## 6. Baseline to beat

Initial JS **~478 kB gz**, main chunk **1,164 kB raw / over budget**. After RFC 01
(items 1–2), expect dashboard-first initial JS in the **~280–320 kB gz** range with
report/evidence/MapLibre deferred. Re-measure and record here.
