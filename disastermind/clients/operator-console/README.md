# DisasterMind — Operator Console (React / Vite)

A real React dashboard for the human Commander — beyond the single-file reference
UI in [`disastermind/api/static/index.html`](../../disastermind/api/static/index.html).
It consumes the dashboard API **as-is** (no backend changes).

## Panels ↔ API

| Panel | Source |
|-------|--------|
| **Topic volume tiles** | `GET /topics` (3s poll); CRITICAL/escalation topics highlighted |
| **Open escalations** | `GET /escalations` (3s poll + `/ws` bump) with live deadline countdown, human-only badge, **Approve** → `POST /escalations/{id}/approve`, **Reject** → `POST /escalations/{id}/reject` |
| **Throughput chart** | samples cumulative `GET /topics` every 3s → msgs/interval (recharts) |
| **Dispatch map** | `/ws` + `GET /incidents` messages on dispatch/field/routing topics, geo-extracted to CircleMarkers + route Polylines (react-leaflet, India-centred) |
| **Live message stream** | `WS /ws` ring buffer (newest at bottom, CRITICAL rows highlighted) |

The map uses **vector** markers (no image assets), so it still renders on its dark
canvas when OpenStreetMap tiles can't load (offline).

## Run

**1. Start the backend** (from the repo root):

```bash
pip install -e '.[all]'                 # FastAPI + uvicorn live in this extra set
uvicorn disastermind.api.app:create_app --factory --port 8000
```

`create_app` wires a full DisasterMind system + `DashboardService`. Drive some
traffic so the panels populate, e.g. `python -m disastermind simulate B --escalate`
in another shell (see the runbook in `docs/runbook.md`).

**2. Start the console:**

```bash
cd clients/operator-console
npm install
npm run dev        # http://localhost:5173 (Vite dev server)
npm run build      # tsc -b && vite build -> dist/
npm run typecheck
```

By default the app uses **relative** URLs and the Vite dev-server proxies
`/health /topics /incidents /escalations /ws` to `http://localhost:8000`
(override the target with `VITE_PROXY_TARGET`). To point a built app at a remote
backend, set `VITE_API_BASE` / `VITE_WS_BASE` at build time — these take
precedence over the relative URLs.

## Layout

```
clients/operator-console/
  index.html               Vite entry -> src/main.tsx
  vite.config.ts           dev proxy to uvicorn :8000
  src/
    api/                   typed client (client.ts) + wire types (types.ts)
    hooks/                 usePolling (3s) · useWebSocket (auto-reconnect)
    lib/                   geo extraction (map) · format (countdown/clock)
    components/            TopicTiles · EscalationQueue · ThroughputChart · DispatchMap · LiveStream
    App.tsx · main.tsx · styles.css
```

> Node artifacts (`node_modules/`, `dist/`) are git-ignored locally.
