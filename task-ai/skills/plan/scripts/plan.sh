#!/usr/bin/env bash
# /moonview:plan implementation
# Usage: plan.sh <notebook> [--generate]

set -uo pipefail

# Load context discovery from lib.sh
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../../../.dev/contracts/lib.sh"

NOTEBOOK="${1:-}"
GENERATE=1

# 1. Identify Context
if [[ -z "$NOTEBOOK" ]]; then
    if ! find_nb_context; then
        echo "[ERROR] No active task context detected. Enter a notebook directory or specify a name." >&2
        exit 1
    fi
    NOTEBOOK="$NB_NOTEBOOK"
    WORK_DIR="$NB_WORKING"
else
    # Explicit notebook name provided
    if [[ ! "$NOTEBOOK" =~ ^[a-zA-Z0-9_-]+$ ]]; then
        echo "[ERROR] Invalid notebook name." >&2
        exit 1
    fi
    NB_ROOT="${NB_WORKSPACES_ROOT:-$(pwd)}"
    WORK_DIR=$(find "$NB_ROOT" -name "$NOTEBOOK" -type d | head -n 1)/.working
fi

INDEX_JSON="$WORK_DIR/.index.json"

if [[ ! -d "$WORK_DIR" ]]; then
    echo "[ERROR] Working directory not found." >&2
    exit 1
fi

STATE_PY="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)/core/state.py"

# 1. Invoke Research for Type Discovery (Simulated)
# In real execution, this would call research.sh. For plumbing:
TYPE=$(python3 "$STATE_PY" get "$INDEX_JSON" type)
if [[ -z "$TYPE" ]]; then
    TYPE="software" # Default for plan testing
    python3 "$STATE_PY" set "$INDEX_JSON" type "$TYPE"
fi

echo "Planning for task type: $TYPE"

# 2. Generate .plan.md (Scaffold)
cat > "$WORK_DIR/.plan.md" <<EOF
# Implementation Plan: $NOTEBOOK

## Step 1: Initialize Project
- Setup basic structure
[VH: test-init]

## Step 2: Implement Core Logic
- Write main functions
[VH: test-core]
EOF

# 3. Generate VH Stubs (for software types)
if [[ "$TYPE" == *"software"* ]]; then
    TEST_DIR="$WORK_DIR/../.test"
    mkdir -p "$TEST_DIR"
    DATE=$(date +%Y-%m-%d)
    STUB_FILE="$TEST_DIR/$DATE-vh-stubs.test.js"
    
    cat > "$STUB_FILE" <<EOF
// VH: auto-generated stubs for $NOTEBOOK
test('test-init', () => {
  // VH: not implemented
  throw new Error('VH: not implemented');
});

test('test-core', () => {
  // VH: not implemented
  throw new Error('VH: not implemented');
});
EOF
    
    # Create VH Baseline
    cat > "$TEST_DIR/$DATE-vh-baseline.md" <<EOF
# VH Baseline: $NOTEBOOK
- Total stubs: 2
- Status: All failing (Red)
EOF
    echo "Generated VH stubs and baseline."
fi

# 4. Update Index Status
python3 "$STATE_PY" transition "$INDEX_JSON" --status planning

echo "Plan generated successfully."
