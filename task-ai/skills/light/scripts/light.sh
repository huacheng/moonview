#!/usr/bin/env bash
# /moonview:light implementation
# Usage: light.sh <project> <objective> | --finish | --promote

set -uo pipefail

ARG1="${1:-}"
ARG2="${2:-}"

# Load context discovery from lib.sh
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../../../.dev/contracts/lib.sh"

# 1. Finish Mode
if [[ "$ARG1" == "--finish" ]]; then
    if ! find_nb_context; then
        echo "[ERROR] Not in a notebook context." >&2
        exit 1
    fi

    INDEX_JSON="$NB_WORKING/.index.json"
    STATE_PY="$SCRIPT_DIR/../../../core/state.py"
    
    # Extract objective from index
    OBJECTIVE=$(python3 "$STATE_PY" get "$INDEX_JSON" title)
    
    # Resolve project name (parent of notebook directory)
    NB_DIR=$(dirname "$NB_WORKING")
    PROJECT_DIR=$(dirname "$NB_DIR")
    PROJECT_NAME=$(basename "$PROJECT_DIR")

    echo "Finishing shadow task: $OBJECTIVE"
    
    # Ensure all changes are committed to the shadow branch first
    git add .
    if ! git diff --cached --quiet; then
        git commit -m "task-ai(light): intermediate work" > /dev/null
    fi

    # Record current branch
    CURRENT_BRANCH=$(git branch --show-current)
    
    # Squash Merge
    git checkout master > /dev/null
    git merge --squash "$CURRENT_BRANCH" > /dev/null
    git commit -m "task-ai($PROJECT_NAME):light $OBJECTIVE" > /dev/null
    
    # Cleanup: Delete branch AND the notebook directory (transient)
    git branch -D "$CURRENT_BRANCH" > /dev/null
    
    # Resolve the notebook root (one level up from .working)
    NB_DIR=$(dirname "$NB_WORKING")
    rm -rf "$NB_DIR"
    
    echo "Task merged, shadow branch and transient notebook directory cleaned up."
    exit 0
fi

# 2. Start Mode
if [[ -n "$ARG1" && -n "$ARG2" ]]; then
    PROJECT_NAME="$ARG1"
    OBJECTIVE="$ARG2"
    
    # Create a transient notebook name
    SLUG=$(echo "$OBJECTIVE" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g' | sed -E 's/^-+|-+$//g' | cut -c 1-20)
    TIMESTAMP=$(date +%s)
    NOTEBOOK_NAME="light-${SLUG}-${TIMESTAMP}"
    
    echo "Starting light task notebook: $NOTEBOOK_NAME"
    
    # 1. Initialize as a standard notebook (maintains architecture)
    INIT_SH="$SCRIPT_DIR/../../init/scripts/init.sh"
    "$INIT_SH" "$PROJECT_NAME" "$NOTEBOOK_NAME" --title "$OBJECTIVE" > /dev/null
    
    # 2. Enter the context
    NB_ROOT="${NB_WORKSPACES_ROOT:-$(pwd)}"
    WORK_DIR="$NB_ROOT/$PROJECT_NAME/$NOTEBOOK_NAME/.working"
    INDEX_JSON="$WORK_DIR/.index.json"
    STATE_PY="$SCRIPT_DIR/../../../core/state.py"
    
    # 3. Mark as light mode
    python3 "$STATE_PY" set "$INDEX_JSON" mode "light"
    
    # 4. Create Shadow Branch
    # (Init already created a task/ branch, we'll use a shadow branch for light work)
    SHADOW_BRANCH="light/${NOTEBOOK_NAME}"
    git checkout -b "$SHADOW_BRANCH" > /dev/null
    
    echo "Light task initialized. Shadow branch: $SHADOW_BRANCH"
    exit 0
fi

echo "[ERROR] Invalid arguments. Usage: light <project> <objective> | --finish" >&2
exit 1
