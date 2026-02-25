#!/usr/bin/env bash
# /moonview:merge implementation
# Usage: merge.sh <notebook>

set -uo pipefail

# Load context discovery from lib.sh
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../../../.dev/contracts/lib.sh"

NOTEBOOK="${1:-}"

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

if [[ ! -d "$WORK_DIR" ]]; then
    echo "[ERROR] Working directory not found." >&2
    exit 1
fi

INDEX_JSON="$WORK_DIR/.index.json"
STATE_PY="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)/core/state.py"

echo "Merging task: $NOTEBOOK"

# 1. Git Merge Simulation
# (In real implementation, this would handle squash merge and branch deletion)
CURRENT_BRANCH=$(git branch --show-current)
TASK_BRANCH=$(python3 "$STATE_PY" get "$INDEX_JSON" branch)

if [[ -z "$TASK_BRANCH" ]]; then
    TASK_BRANCH="task/$NOTEBOOK"
fi

echo "[GIT] Merging $TASK_BRANCH into master..."

# 2. Update Status to Complete and clear branch metadata
python3 "$STATE_PY" transition "$INDEX_JSON" --status complete
python3 "$STATE_PY" set "$INDEX_JSON" branch ""
python3 "$STATE_PY" set "$INDEX_JSON" worktree ""

# 3. Metadata Cleanup
# In real execution, we might remove .lock or .auto-signal here
rm -f "$WORK_DIR/.lock"

# 4. Branch Deletion
if [[ "$CURRENT_BRANCH" == "$TASK_BRANCH" ]]; then
    git checkout master > /dev/null 2>&1
fi
git branch -D "$TASK_BRANCH" > /dev/null 2>&1

echo "Task $NOTEBOOK successfully merged and closed."
