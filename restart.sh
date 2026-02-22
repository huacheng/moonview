#!/usr/bin/env bash
# restart.sh — Restart notebook-ai dev server (ports 3000 + 3002)
set -euo pipefail

PORTS="3000 3002"

echo "==> Stopping notebook-ai processes..."
for port in $PORTS; do
  pids=$(lsof -ti :"$port" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "    Killing PIDs on port $port: $pids"
    echo "$pids" | xargs kill 2>/dev/null || true
  fi
done

sleep 2

# Force-kill anything still lingering
for port in $PORTS; do
  pids=$(lsof -ti :"$port" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "    Force-killing PIDs on port $port: $pids"
    echo "$pids" | xargs kill -9 2>/dev/null || true
  fi
done

sleep 1

# Verify ports are free
for port in $PORTS; do
  if lsof -ti :"$port" >/dev/null 2>&1; then
    echo "ERROR: port $port still occupied!"
    lsof -i :"$port"
    exit 1
  fi
done
echo "==> Ports $PORTS are free."

echo "==> Starting notebook-ai dev server..."
cd "$(dirname "$0")"
# Load .env if present
if [ -f .env ]; then
  set -a; source .env; set +a
fi
PORT=3002 NB_AUTH_TOKEN="${NB_AUTH_TOKEN:-test123}" nohup pnpm dev > /tmp/notebook-dev.log 2>&1 &

# Wait for backend to be ready (up to 15s)
echo -n "==> Waiting for backend on :3002"
for i in $(seq 1 30); do
  if curl -sk --max-time 1 https://localhost:3000/api/auth/status >/dev/null 2>&1; then
    echo " OK"
    echo "==> notebook-ai is running.  Vite: https://localhost:3000  Backend: :3002"
    exit 0
  fi
  echo -n "."
  sleep 0.5
done

echo " TIMEOUT"
echo "==> Startup logs:"
tail -20 /tmp/notebook-dev.log
exit 1
