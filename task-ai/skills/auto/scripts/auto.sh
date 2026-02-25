#!/usr/bin/env bash
# /moonview:auto implementation
# Usage: auto.sh <notebook> [--start|--stop|--status]

set -uo pipefail

NOTEBOOK="${1:-}"
ACTION="start"

if [[ -z "$NOTEBOOK" ]]; then
    echo "[ERROR] Notebook name is required." >&2
    exit 1
fi

if [[ ! "$NOTEBOOK" =~ ^[a-zA-Z0-9_-]+$ ]]; then
    echo "[ERROR] Invalid notebook name." >&2
    exit 1
fi

shift || true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --start)  ACTION="start"; shift ;;
    --stop)   ACTION="stop"; shift ;;
    --status) ACTION="status"; shift ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

NB_ROOT="${NB_WORKSPACES_ROOT:-$(pwd)}"
WORK_DIR=$(find "$NB_ROOT" -name "$NOTEBOOK" -type d | head -n 1)/.working
INDEX_JSON="$WORK_DIR/.index.json"
SIGNAL_FILE="$WORK_DIR/.auto-signal"
STATE_PY="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)/core/state.py"

if [[ ! -d "$WORK_DIR" ]]; then
    echo "[ERROR] Working directory not found." >&2
    exit 1
fi

# 1. Entry Point Routing (Simulated)
STATUS=$(python3 "$STATE_PY" get "$INDEX_JSON" status)
echo "Auto-mode: Starting loop from status: $STATUS"

# 2. Simulated Loop (Executing one step for plumbing)
ITERATION=1
COMPACTION=0

case "$STATUS" in
  draft)
    NEXT_STEP="plan"
    ;;
  planning)
    NEXT_STEP="check"
    ;;
  executing)
    NEXT_STEP="verify"
    ;;
  *)
    NEXT_STEP="(stop)"
    ;;
esac

# 3. Write Progress Signal
cat > "$SIGNAL_FILE" <<EOF
{
  "step": "auto",
  "result": "CONTINUE",
  "next": "$NEXT_STEP",
  "iteration": $ITERATION,
  "compaction_count": $COMPACTION,
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF

echo "Auto loop initialized. Next step: $NEXT_STEP."
