#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export API_TARGET="${API_TARGET:-http://localhost:8787}"
export PORT="${PORT:-8787}"
export VITE_PORT="${VITE_PORT:-5000}"

echo "Beyond the Game — Replit dev"
echo "  App: port 5000"
echo "  API: port 8787"
echo ""

# Build sim-engine package first
npm run build -w @team-culture-sim/sim-engine

# Build server and start it in background
npm run build -w @team-culture-sim/server
node apps/server/dist/index.js &
SERVER_PID=$!

# Start Vite dev server (foreground)
npm run dev -w @team-culture-sim/web

# Cleanup on exit
kill $SERVER_PID 2>/dev/null || true
