# Beyond the Game

Lightweight, web-based team culture experience for athletes. The whole team joins **Beyond the Game** by scanning a QR code and answers anonymously on their own phones. Some questions ask *how you'd respond*; some ask *what usually happens on your team*. Everything rolls up into one shared team result across six values (Courage, Excellence, Respect, Trust, Care, Accountability) — including where people agree, where they're split, and where to grow.

> The repo also contains two solo modes (a quick self-check and a road-trip simulation) that are no longer surfaced in the UI but remain in the codebase.

## Architecture

```
packages/sim-engine   Pure TypeScript scoring + simulation (no UI)
packages/content      Quiz + road-trip content (JSON)
apps/server           Express API: team sessions, submissions, aggregate results
apps/web              React + Vite client
```

The UI never mutates state directly — it sends **player actions** / quiz answers to the engine, which returns scored results. Team scoring and solo scoring share the same ledger logic (`levelsFromLedger`), so they always agree.

## Quick start

```bash
npm install
npm run dev
```

`npm run dev` builds the engine, then runs the API (`:8787`) and web app (`:5173`) together.

- Open http://localhost:5173 to host a session.
- The QR code points at your machine on the LAN, so phones on the same Wi-Fi can join. (The Vite dev server binds all interfaces; set `VITE_HOST=false` to bind localhost only.)

## How team mode works

1. A coach/host creates a session and gets a 4-character code + QR code.
2. Teammates scan the QR (or visit `/?s=CODE`) and complete the quiz anonymously.
3. The host screen shows a live count and reveals the pooled team result on demand.

Submissions are stored server-side (in memory, persisted to `apps/server/data/sessions.json`).

## Scripts

- `npm run dev` — run API + web app together
- `npm run dev:web` / `npm run dev:server` — run one side only
- `npm run test` — run sim-engine unit tests
- `npm run build` — build engine + web app
- `npm run typecheck` — typecheck all packages

## Configuration

- `PORT` (server) — API port, default `8787`
- `API_TARGET` (web dev) — proxy target for `/api`, default `http://localhost:8787`
- `VITE_HOST` (web dev) — set to `false` to bind localhost only
