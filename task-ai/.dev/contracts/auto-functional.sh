#!/usr/bin/env bash
# L2: Functional test for auto sub-command
# Verifies entry-point routing and signal generation.

source "$(dirname "$0")/lib.sh"

AUTO_SH="$TASK_AI_ROOT/skills/auto/scripts/auto.sh"
TEST_NB="auto-tdd-$(date +%s)"
export NB_WORKSPACES_ROOT="/tmp/auto-functional-test"

# Setup
rm -rf "$NB_WORKSPACES_ROOT"
mkdir -p "$NB_WORKSPACES_ROOT/proj/$TEST_NB/.working"
INDEX_JSON="$NB_WORKSPACES_ROOT/proj/$TEST_NB/.working/.index.json"

# --- Test 1: Draft Entry ---
echo '{"status":"draft"}' > "$INDEX_JSON"
"$AUTO_SH" "$TEST_NB" > /dev/null
NEXT=$(python3 -c "import json; print(json.load(open('$NB_WORKSPACES_ROOT/proj/$TEST_NB/.working/.auto-signal'))['next'])")
if [[ "$NEXT" == "plan" ]]; then
    emit_pass "auto: correctly routed draft to plan"
else
    emit_fail "auto: wrong routing for draft (next: $NEXT)"
fi

# --- Test 2: Planning Entry ---
echo '{"status":"planning"}' > "$INDEX_JSON"
"$AUTO_SH" "$TEST_NB" > /dev/null
NEXT=$(python3 -c "import json; print(json.load(open('$NB_WORKSPACES_ROOT/proj/$TEST_NB/.working/.auto-signal'))['next'])")
if [[ "$NEXT" == "check" ]]; then
    emit_pass "auto: correctly routed planning to check"
else
    emit_fail "auto: wrong routing for planning"
fi

# Cleanup
rm -rf "$NB_WORKSPACES_ROOT"

summary
