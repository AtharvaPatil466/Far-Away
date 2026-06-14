# RFC 03 — State Management

- **Status:** Proposed
- **Scope:** `clients/web`
- **Decision driver:** Live/server state is handled ad hoc per component; decide
  whether to formalize before it sprawls.

## 1. Context

State today is **all local React state plus bespoke hooks**. No global store, no
server-state library.

| Concern | Where it lives |
|---------|----------------|
| Backend health / WS status | [`useApiStatus`](../../clients/web/src/hooks/useApiStatus.ts) (polls every 30s) |
| Live backend stream | [`useBackendWS`](../../clients/web/src/hooks/useBackendWS.ts) + `connectWebSocket` in `lib/disasterApi` |
| Escalation queue | [`useEscalations`](../../clients/web/src/hooks/useEscalations.ts) (mock seed + countdown auto-execute) |
| Commander overrides | `useOverrides` |
| Viewport / device | [`useIsMobile`](../../clients/web/src/hooks/useIsMobile.ts) |
| Map state, memo/report generation | `useState` inside the module components |

### What works
- It's simple, dependency-free, and readable. Each hook owns one concern.
- At 5 modules with mostly module-local data, prop-drilling is shallow.

### Where the cracks are
1. **Duplicated subscriptions.** The Dashboard opens a WebSocket via `connectWebSocket`
   *and* consumes `useBackendWS` (another socket consumer). Each component that needs
   live data wires its own subscription/teardown; nothing dedupes connections or
   shares the last message.
2. **No request/response model for the LLM calls.** Memo and report generation are
   one-off `useEffect` + `useState({data, loading, error})` blocks, re-implemented per
   component. No caching, retry, cancellation, or dedup — regenerating the same report
   refetches from scratch.
3. **Server state treated as local state.** Health, escalations, and generated content
   are *server* state (owned remotely, async, cacheable) but live in `useState`, so
   they reset on unmount and can't be shared or invalidated.
4. **No cross-module shared state.** The escalation count shown in the dashboard KPI and
   the escalation module's own queue are independent copies of the same domain data.

## 2. Decision

Split the problem into **three kinds of state** and right-size each. **Do not adopt
Redux or a heavy store** — the app doesn't have the global client-state complexity
that justifies it.

### 2a. Server state → adopt **TanStack Query** (React Query)

For anything fetched from the backend (health, escalations once the API is live,
generated reports/memos), use TanStack Query. It directly removes the hand-rolled
`{data, loading, error}` boilerplate and adds caching, dedup, retry, cancellation, and
`staleTime`-based polling (replacing the manual 30s `setInterval` in `useApiStatus`).

```ts
// useApiStatus, rewritten
const { data: health } = useQuery({
  queryKey: ['health'],
  queryFn: () => disasterApi.health(),
  refetchInterval: 30_000,
  staleTime: 25_000,
})

// report generation, rewritten — cached by inputs, cancellable
const report = useMutation({ mutationFn: generateReport })
```

Cost: ~12 kB gz, one `QueryClientProvider`. Benefit: deletes the most-duplicated
pattern in the codebase and makes the LLM flows resilient.

### 2b. Real-time stream → a **single WebSocket provider** + Context

The WebSocket is *not* request/response, so it's not Query's job. Centralize it:

- One provider owns the connection lifecycle (connect, reconnect/backoff, teardown).
- It exposes connection status and the latest typed frames via Context (or a tiny
  external store — see 2c).
- Consumers subscribe by topic instead of each opening a socket.

This removes the double-subscription in the Dashboard and gives one place to handle
reconnection and staleness. Optionally, the provider *writes* incoming frames into the
Query cache (`queryClient.setQueryData`) so live data and fetched data share one model.

### 2c. Shared client state → **Zustand** *only if* Context churns

For genuinely shared, frequently-updated client state (e.g. live map state, the active
unit selection, override log) that would otherwise re-render large subtrees through
Context, introduce **Zustand** (~1 kB) with selector subscriptions. Until a profiler
shows Context re-render cost, **a Context provider is sufficient** — adopt Zustand
reactively, not speculatively.

## 3. What we explicitly reject

- **Redux / Redux Toolkit.** The boilerplate and conceptual overhead aren't warranted;
  there is little complex, interdependent global client state. Server state (the real
  need) is better served by Query.
- **Putting WebSocket frames in Query as the primary model.** Query is pull-based;
  forcing a push stream into it inverts the model. Use the provider (2b), optionally
  syncing into the cache.
- **A global store for everything.** Module-local `useState` stays for module-local UI.

## 4. Migration plan

| Phase | Change | Unlocks | Risk |
|-------|--------|---------|------|
| 1 | Add `QueryClientProvider`; port `useApiStatus` to `useQuery` | removes manual polling; proves the pattern | low |
| 2 | Port LLM memo/report flows to `useMutation` | caching, cancel, retry, no dup boilerplate | low |
| 3 | Extract a `BackendSocketProvider`; consumers subscribe by topic | one connection, shared status | medium |
| 4 | (If needed) sync socket frames → Query cache | unify live + fetched data | medium |
| 5 | (If profiler demands) Zustand for hot shared client state | fewer re-renders | medium |

Phases 1–2 are self-contained and high-value; start there. Phases 3–5 are gated on the
backend going live and on measured need.

## 5. Decision summary

| State kind | Tool | Rationale |
|------------|------|-----------|
| Server (fetch/poll/mutate) | **TanStack Query** | caching, dedup, retry, cancellation |
| Real-time stream | **WebSocket provider + Context** | push model; single connection |
| Shared hot client state | **Zustand (reactively)** | selector subscriptions if Context churns |
| Module-local UI | **`useState`** | already correct; leave it |

The throughline: **adopt the smallest tool that solves a problem we actually have.**
Query earns its place today (the boilerplate is real and duplicated). A global store
does not — yet.
