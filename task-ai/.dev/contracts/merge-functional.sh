#!/usr/bin/env bash
# L2: Functional test for merge sub-command
# Verifies successful merge, status update, and cleanup.

source "$(dirname "$0")/lib.sh"

MERGE_SH="$TASK_AI_ROOT/skills/merge/scripts/merge.sh"
TEST_NB="merge-tdd-$(date +%s)"
export NB_WORKSPACES_ROOT="/tmp/merge-functional-test"

# Setup: Create a real git branch to merge
rm -rf "$NB_WORKSPACES_ROOT" && mkdir -p "$NB_WORKSPACES_ROOT/proj/$TEST_NB/.working"
INDEX_JSON="$NB_WORKSPACES_ROOT/proj/$TEST_NB/.working/.index.json"

# Create branch
BRANCH="task/$TEST_NB"
git branch "$BRANCH" > /dev/null 2>&1
echo "{"status":"executing", "branch":"$BRANCH", "worktree":""}" > "$INDEX_JSON"

# Act
"$MERGE_SH" "$TEST_NB" > /dev/null

# 1. Assert: Status is complete
STATUS=$(python3 -c "import json; print(json.load(open('$INDEX_JSON'))['status'])")
if [[ "$STATUS" == "complete" ]]; then
    emit_pass "merge: updated status to complete"
else
    emit_fail "merge: failed status update (status: $STATUS)"
fi

# 2. Assert: Branch metadata cleared
BRANCH_META=$(python3 -c "import json; print(json.load(open('$INDEX_JSON'))['branch'])")
if [[ -z "$BRANCH_META" ]]; then
    emit_pass "merge: cleared branch metadata"
else
    emit_fail "merge: failed to clear metadata"
fi

# 3. Assert: Branch deleted
if ! git branch --list "$BRANCH" | grep -q "$TEST_NB"; then
    emit_pass "merge: successfully deleted task branch"
else
    emit_fail "merge: failed to delete branch"
fi

# Cleanup
git branch -D "$BRANCH" > /dev/null 2>&1
rm -rf "$NB_WORKSPACES_ROOT"

summary
