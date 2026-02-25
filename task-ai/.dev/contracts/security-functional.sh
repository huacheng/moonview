#!/usr/bin/env bash
# L2: Functional test for security sub-command
# Verifies runtime interception of safe and dangerous commands.

source "$(dirname "$0")/lib.sh"

SECURITY_SH="$TASK_AI_ROOT/skills/security/scripts/security.sh"
export NB_WORKSPACES_ROOT="/tmp/security-functional-test"
TEST_NB="security-test-nb"

rm -rf "$NB_WORKSPACES_ROOT" && mkdir -p "$NB_WORKSPACES_ROOT/$TEST_NB/.working"
INDEX_JSON="$NB_WORKSPACES_ROOT/$TEST_NB/.working/.index.json"
echo '{"status": "executing"}' > "$INDEX_JSON"

# Assert: Safe command passes
OUTPUT_SAFE=$("$SECURITY_SH" "$TEST_NB" verify-cmd "ls -la" 2>&1)
if echo "$OUTPUT_SAFE" | grep -q "PASS"; then
    emit_pass "security: allowed safe command"
else
    emit_fail "security: blocked safe command"
fi

# Assert: Malicious command is blocked
OUTPUT_MALICIOUS=$("$SECURITY_SH" "$TEST_NB" verify-cmd "rm -rf /etc" 2>&1)
if echo "$OUTPUT_MALICIOUS" | grep -q "REJECT"; then
    emit_pass "security: blocked destructive command"
else
    emit_fail "security: failed to block destructive command"
fi

# Assert: Malicious VFP injection is blocked
OUTPUT_VFP=$("$SECURITY_SH" "$TEST_NB" verify-cmd "npm test -- --eval 'require("fs")'" 2>&1)
if echo "$OUTPUT_VFP" | grep -q "REJECT"; then
    emit_pass "security: blocked VFP semantic injection"
else
    emit_fail "security: failed to block VFP injection"
fi

# Cleanup
rm -rf "$NB_WORKSPACES_ROOT"

summary
