# DisasterMind
### Autonomous AI Command & Control for Disaster Response

India loses ₹14,000 crore annually to delayed disaster response.
DisasterMind is a full-stack autonomous disaster management system that makes
847 decisions per hour — and puts human commanders in control of every one
that matters.

---

## Repository Structure

```
Far-Away/
  group-a/                  # Autonomous agent backend (Python/FastAPI)
  group-b/                  # Human command interface (React/TypeScript)
```

## Group A — The Brain
Autonomous AI agents, FastAPI backend, WebSocket streams, cryptographic
audit chain, ML prediction models.

## Group B — The Face
Commander dashboard, escalation system, field team mobile app,
post-incident report generator.

---

## Quick Start

### Group B (Frontend)
```bash
cd group-b/disastermind-unified
npm install
cp .env.example .env
npm run dev
```
Open http://localhost:5173

### Group A (Backend)
```bash
cd group-a
# see group-a/README.md
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite |
| Styling | CSS Variables, custom design system |
| LLM (local) | Ollama (llama3.2) |
| LLM (production) | Claude API / Gemini |
| Backend | FastAPI, WebSockets |
| Database | PostgreSQL + PostGIS (Phase 1) |
| ML | XGBoost, SHAP |
| Deployment | Vercel (frontend), Railway (backend) |

---

## Roadmap

- **Phase 0** (Month 1-2): Foundation — real DB, deployed, team onboarded
- **Phase 1** (Month 3-6): Real data — IMD integration, live map, SHAP UI
- **Phase 2** (Month 7-12): Field ops — React Native app, offline-first
- **Phase 3** (Month 13-18): Security — RBAC, encryption, VAPT certification
- **Phase 4** (Month 19-30): Shadow mode — one state SDMA running in parallel
- **Phase 5** (Month 31-42): Active deployment — NDRF teams, 36 states
- **Phase 6** (Month 43-48): Scale — international, academic programme

---

## Team

| Group | Role |
|-------|------|
| Group A | Backend, AI agents, ML, infrastructure |
| Group B | Frontend, mobile app, UX, LLM integration |
