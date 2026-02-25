#!/usr/bin/env bash
# /moonview:light implementation
# Usage: light.sh <objective> | --finish | --promote

set -uo pipefail

ARG="${1:-}"

# Load context discovery from lib.sh
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../../../.dev/contracts/lib.sh"

# Project root discovery (where .git is)
PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo ".")
REGISTRY="$PROJECT_ROOT/.light-tasks.jsonl"

# 1. Finish Mode
if [[ "$ARG" == "--finish" ]]; then
    CURRENT_BRANCH=$(git branch --show-current)
    if [[ ! "$CURRENT_BRANCH" =~ ^light/ ]]; then
        echo "[ERROR] Not in a shadow task branch." >&2
        exit 1
    fi

    # Extract objective from registry
    # Use escaped quotes for grep to match JSON keys
    OBJECTIVE=$(grep "\"branch\": \"$CURRENT_BRANCH\"" "$REGISTRY" | sed -E 's/.*"objective": "([^"]*)".*/\1/')
    if [[ -z "$OBJECTIVE" ]]; then OBJECTIVE="lightweight adjustment"; fi

    echo "Finishing shadow task: $OBJECTIVE"
    
    # Ensure all changes are committed to the shadow branch first so merge --squash works
    git add .
    if ! git diff --cached --quiet; then
        git commit -m "task-ai(light): intermediate work" > /dev/null
    fi

    # Squash Merge
    git checkout master > /dev/null
    git merge --squash "$CURRENT_BRANCH" > /dev/null
    # The squash merge stages the changes, now we commit them on master
    git commit -m "task-ai(light): $OBJECTIVE" > /dev/null
    
    # Cleanup
    git branch -D "$CURRENT_BRANCH" > /dev/null
    # Remove entry from registry
    if [[ -f "$REGISTRY" ]]; then
        grep -v "\"branch\": \"$CURRENT_BRANCH\"" "$REGISTRY" > "${REGISTRY}.tmp" || true
        mv "${REGISTRY}.tmp" "$REGISTRY"
        [[ ! -s "$REGISTRY" ]] && rm "$REGISTRY"
    fi
    
    echo "Task merged and shadow branch cleaned up."
    exit 0
fi

# 2. Promote Mode
if [[ "$ARG" == "--promote" ]]; then
    # TODO: Implement promotion logic (call init and migrate)
    echo "[STUB] Promotion logic not yet implemented."
    exit 0
fi

# 3. Start Mode (Objective provided)
if [[ -z "$ARG" ]]; then
    echo "[ERROR] Objective or flag required." >&2
    exit 1
fi

OBJECTIVE="$ARG"
# Create slug from objective
SLUG=$(echo "$OBJECTIVE" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g' | sed -E 's/^-+|-+$//g' | cut -c 1-30)
TIMESTAMP=$(date +%s)
BRANCH_NAME="light/${SLUG}-${TIMESTAMP}"

echo "Starting shadow task: $OBJECTIVE"

# Record in registry
cat >> "$REGISTRY" <<EOF
{"id": "$TIMESTAMP", "objective": "$OBJECTIVE", "branch": "$BRANCH_NAME", "started": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"}
EOF

# Switch Branch
git checkout -b "$BRANCH_NAME" > /dev/null

echo "Switched to shadow branch $BRANCH_NAME. No physical directory created."
