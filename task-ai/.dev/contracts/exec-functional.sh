#!/usr/bin/env bash
# L2: Functional test for exec sub-command
# Verifies step-by-step progress tracking.

source "$(dirname "$0")/lib.sh"

EXEC_SH="$TASK_AI_ROOT/skills/exec/scripts/exec.sh"
TEST_NB="exec-tdd-$(date +%s)"
export NB_WORKSPACES_ROOT="/tmp/exec-functional-test"

# Setup
rm -rf "$NB_WORKSPACES_ROOT"
mkdir -p "$NB_WORKSPACES_ROOT/proj/$TEST_NB/.working"
INDEX_JSON="$NB_WORKSPACES_ROOT/proj/$TEST_NB/.working/.index.json"
echo '{"completed_steps":0, "type":"software"}' > "$INDEX_JSON"

# Act: Run Step 1
"$EXEC_SH" "$TEST_NB" > /dev/null

# 1. Assert: Progress is 1
CUR_PROG=$(python3 -c "import json; print(json.load(open('$INDEX_JSON'))['completed_steps'])")
if [[ "$CUR_PROG" == "1" ]]; then
    emit_pass "exec: incremented progress to 1"
else
    emit_fail "exec: failed to increment progress (prog: $CUR_PROG)"
fi

# 2. Assert: Exec note created
DATE=$(date +%Y-%m-%d)
if [[ -f "$NB_WORKSPACES_ROOT/proj/$TEST_NB/.working/.notes/$DATE-step-1-exec.md" ]]; then
    emit_pass "exec: created step note"
else
    emit_fail "exec: failed to create note"
fi

# Act: Run Step 2
"$EXEC_SH" "$TEST_NB" > /dev/null

# 3. Assert: Progress is 2
CUR_PROG=$(python3 -c "import json; print(json.load(open('$INDEX_JSON'))['completed_steps'])")
if [[ "$CUR_PROG" == "2" ]]; then
    emit_pass "exec: incremented progress to 2"
else
    emit_fail "exec: failed to increment progress"
fi

# Cleanup
rm -rf "$NB_WORKSPACES_ROOT"

summary
