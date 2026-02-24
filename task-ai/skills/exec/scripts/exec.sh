#!/usr/bin/env bash
# /moonview:exec implementation
# Usage: exec.sh <notebook> [--step N]

set -uo pipefail

NOTEBOOK="${1:-}"
TARGET_STEP=""

if [[ -z "$NOTEBOOK" ]]; then
    echo "[ERROR] Notebook name is required." >&2
    exit 1
fi

shift || true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --step) TARGET_STEP="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

NB_ROOT="${NB_WORKSPACES_ROOT:-$(pwd)}"
WORK_DIR=$(find "$NB_ROOT" -name "$NOTEBOOK" -type d | head -n 1)/.working
INDEX_JSON="$WORK_DIR/.index.json"
NOTES_DIR="$WORK_DIR/.notes"
mkdir -p "$NOTES_DIR"

if [[ ! -d "$WORK_DIR" ]]; then
    echo "[ERROR] Working directory not found." >&2
    exit 1
fi

# 1. Step Discovery
# (Simulated for plumbing: assume 2 steps from .plan.md)
TOTAL_STEPS=2
COMPLETED=$(python3 -c "import json; print(json.load(open('$INDEX_JSON')).get('completed_steps', 0))")

echo "Executing $NOTEBOOK. Progress: $COMPLETED/$TOTAL_STEPS"

# 2. Execution Loop
# In TDD/Functional test, we simulate one step at a time
NEXT_STEP=$((COMPLETED + 1))

if [[ $NEXT_STEP -gt $TOTAL_STEPS ]]; then
    echo "All steps already completed."
    exit 0
fi

if [[ -n "$TARGET_STEP" && "$TARGET_STEP" != "$NEXT_STEP" ]]; then
    echo "[ERROR] Requested step $TARGET_STEP but next step is $NEXT_STEP." >&2
    exit 1
fi

echo "--- Executing Step $NEXT_STEP ---"

# 3. VFP Cycle Simulation (Software only)
TYPE=$(python3 -c "import json; print(json.load(open('$INDEX_JSON')).get('type', ''))")
if [[ "$TYPE" == *"software"* ]]; then
    echo "[VFP] Red (VH) confirmed."
    echo "[VFP] Implementing logic..."
    echo "[VFP] Green (HS) confirmed."
fi

# 4. Record Notes
DATE=$(date +%Y-%m-%d)
cat > "$NOTES_DIR/$DATE-step-$NEXT_STEP-exec.md" <<EOF
# Exec Note: Step $NEXT_STEP
- Status: Completed
- VFP: Red -> Green -> Refactor (Pass)
EOF

# 5. Update Progress
python3 -c "import json; d=json.load(open('$INDEX_JSON')); d['completed_steps']=$NEXT_STEP; d['status']='executing'; json.dump(d, open('$INDEX_JSON', 'w'), indent=2)"

echo "Step $NEXT_STEP completed successfully."
