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

This always runs on the same URLs:

- **App:** http://localhost:5173
- **API:** http://localhost:8787
- **Question bank (admin):** http://localhost:5173/admin.html

`npm run dev` stops any stale servers on those ports first, then starts fresh. Save a file and the browser updates automatically (Vite hot reload); a manual refresh works too.

For QR codes on phones over Wi‑Fi, run with LAN access:

```bash
VITE_HOST=true npm run dev
```

## How team mode works

1. A coach/host creates a session and gets a 4-character code + QR code.
2. Teammates scan the QR (or visit `/?s=CODE`) and complete the quiz anonymously.
3. The host screen shows a live count and reveals the pooled team result on demand.

Submissions are stored server-side in `apps/server/data/` locally, or in PostgreSQL when `DATABASE_URL` is set.

### Replit / production persistence

**Deployed apps on Replit reset their filesystem on every redeploy.** Admin edits will not survive unless PostgreSQL is connected:

1. In Replit, open **Database** (or **Storage & databases**) and create a **PostgreSQL** database.
2. Open your **Deployment** settings and ensure the database is **linked** to the deployment (so `DATABASE_URL` is injected).
3. Redeploy the app.
4. Open admin and confirm the yellow storage warning is gone.
5. Visit `/api/health` — it should return `"storage": "postgres"` and `"persistent": true`.

**Editing the host landing page:** use admin → **Page content** → **Host · Start screen** → **Save changes** → go back to the host page.

## Scripts

- `npm run dev` — run API + web app together
- `npm run dev:web` / `npm run dev:server` — run one side only
- `npm run test` — run sim-engine unit tests
- `npm run build` — build engine + web app
- `npm run typecheck` — typecheck all packages

## Configuration

- `PORT` (server) — API port, default `8787`
- `DATABASE_URL` (server) — PostgreSQL connection string for persistent admin content and sessions (required on Replit deploy)
- `DATA_DIR` (server) — local file storage directory, default `apps/server/data`
- `API_TARGET` (web dev) — proxy target for `/api`, default `http://localhost:8787`
- `VITE_HOST` (web dev) — set to `false` to bind localhost only
