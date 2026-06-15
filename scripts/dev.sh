#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

free_port() {
  local port=$1
  local tries=0
  while lsof -ti :"$port" >/dev/null 2>&1 && [ "$tries" -lt 3 ]; do
    echo "Freeing port $port (stale dev server)..."
    lsof -ti :"$port" | xargs kill -9 2>/dev/null || true
    sleep 1
    tries=$((tries + 1))
  done
  if lsof -ti :"$port" >/dev/null 2>&1; then
    echo ""
    echo "Error: port $port is still in use."
    echo "Run this in Terminal, then try again:"
    echo "  lsof -ti :$port | xargs kill -9"
    echo ""
    lsof -i :"$port" 2>/dev/null | head -5 || true
    exit 1
  fi
}

free_port 5173
free_port 8787

export VITE_HOST="${VITE_HOST:-false}"
export API_TARGET="${API_TARGET:-http://localhost:8787}"
export PORT="${PORT:-8787}"

echo ""
echo "Beyond the Game — local dev"
echo "  App:  http://localhost:5173"
echo "  API:  http://localhost:8787"
echo ""
echo "Edit files and save — the page updates automatically (or refresh once)."
echo "Ctrl+C to stop."
echo ""

npm run build -w @team-culture-sim/sim-engine
exec npx concurrently -n server,web -c blue,green "npm:dev:server" "npm:dev:web"
