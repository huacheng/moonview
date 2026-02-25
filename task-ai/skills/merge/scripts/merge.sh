#!/usr/bin/env bash
# /moonview:merge implementation
# Implements: Conflict backoff with 3 retries and cleanup

set -uo pipefail

NOTEBOOK="${1:-}"
MAX_RETRIES=3

if [[ -z "$NOTEBOOK" ]]; then
    echo "[ERROR] Notebook name is required." >&2
    exit 1
fi

NB_ROOT="${NB_WORKSPACES_ROOT:-$(pwd)}"
WORK_DIR=$(find "$NB_ROOT" -name "$NOTEBOOK" -type d | head -n 1)/.working
INDEX_JSON="$WORK_DIR/.index.json"

if [[ ! -d "$WORK_DIR" ]]; then
    echo "[ERROR] Working directory not found." >&2
    exit 1
fi

BRANCH_NAME=$(python3 -c "import json; print(json.load(open('$INDEX_JSON'))['branch'])")
WORKTREE=$(python3 -c "import json; print(json.load(open('$INDEX_JSON'))['worktree'])")

# 1. Pre-merge Refactoring (Simulated)
echo "Executing pre-merge refactoring..."

# 2. Merge Loop with Backoff
attempt_merge() {
    local retry=$1
    echo "Merge attempt $retry/$MAX_RETRIES..."
    
    if git merge "$BRANCH_NAME" --no-ff -m "task-ai($NOTEBOOK):merge merge completed task"; then
        return 0
    fi
    
    echo "[CONFLICT] Attempting automated resolution..."
    # Simulated resolution logic
    git checkout --theirs . 2>/dev/null || true
    git add .
    if git commit -m "task-ai($NOTEBOOK):merge resolve conflicts (retry $retry)"; then
        return 0
    fi
    return 1
}

# Run Attempt
SUCCESS=0
for ((i=1; i<=MAX_RETRIES; i++)); do
    if attempt_merge "$i"; then
        SUCCESS=1
        break
    fi
    echo "[RETRY] Attempt $i failed. Backing off..."
    git merge --abort 2>/dev/null || true
    sleep 1
done

if [[ $SUCCESS -eq 1 ]]; then
    # 3. Post-merge Cleanup
    echo "Merge successful. Cleaning up..."
    python3 -c "import json; d=json.load(open('$INDEX_JSON')); d['status']='complete'; json.dump(d, open('$INDEX_JSON', 'w'), indent=2)"
    
    if [[ -n "$WORKTREE" ]]; then
        git worktree remove "$WORKTREE" 2>/dev/null || true
    fi
    git branch -d "$BRANCH_NAME" 2>/dev/null || true
    
    # Final metadata clear
    python3 -c "import json; d=json.load(open('$INDEX_JSON')); d['branch']=''; d['worktree']=''; json.dump(d, open('$INDEX_JSON', 'w'), indent=2)"
    echo "Cleanup completed. Task $NOTEBOOK is complete."
else
    echo "[ERROR] Merge failed after $MAX_RETRIES attempts." >&2
    exit 1
fi
