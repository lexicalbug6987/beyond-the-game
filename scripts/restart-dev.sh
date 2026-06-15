#!/usr/bin/env bash
# Stop stuck dev servers and start fresh on http://localhost:5173
set -euo pipefail

echo "Stopping anything on ports 5173 and 8787..."
for port in 5173 8787; do
  if lsof -ti :"$port" >/dev/null 2>&1; then
    lsof -ti :"$port" | xargs kill -9
    echo "  Freed port $port"
  fi
done

sleep 1
cd "$(dirname "$0")/.."
echo ""
echo "Starting Beyond the Game at http://localhost:5173"
echo ""
npm run dev
