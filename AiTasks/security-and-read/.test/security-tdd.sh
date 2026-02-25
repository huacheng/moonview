#!/usr/bin/env bash
# TDD Test for security sub-command
# Phase: RED (Verification Hypothesis)

set -uo pipefail

PROJECT_ROOT="/home/ubuntu/notebook-ai"
SECURITY_SH="$PROJECT_ROOT/task-ai/skills/security/scripts/security.sh"
export NB_WORKSPACES_ROOT="/tmp/security-tdd-test"
TEST_NB="security-test-nb"

rm -rf "$NB_WORKSPACES_ROOT" && mkdir -p "$NB_WORKSPACES_ROOT/$TEST_NB/.working"
INDEX_JSON="$NB_WORKSPACES_ROOT/$TEST_NB/.working/.index.json"
echo '{"status": "executing"}' > "$INDEX_JSON"

echo "Running security test..."

if [[ ! -x "$SECURITY_SH" ]]; then
    echo "[VH: Red] security.sh does not exist or is not executable."
    exit 1
fi

# 1. Assert: Safe command passes
OUTPUT_SAFE=$("$SECURITY_SH" "$TEST_NB" verify-cmd "ls -la" 2>&1)
if echo "$OUTPUT_SAFE" | grep -q "PASS"; then
    echo "[HS: Green] Safe command passed."
else
    echo "[VH: Red] Safe command was incorrectly blocked or failed."
    exit 1
fi

# 2. Assert: Malicious command is blocked
OUTPUT_MALICIOUS=$("$SECURITY_SH" "$TEST_NB" verify-cmd "rm -rf /etc" 2>&1)
if echo "$OUTPUT_MALICIOUS" | grep -q "REJECT"; then
    echo "[HS: Green] Malicious command correctly blocked."
else
    echo "[VH: Red] Malicious command bypassed security."
    exit 1
fi

# 3. Assert: Malicious VFP injection is blocked
OUTPUT_VFP=$("$SECURITY_SH" "$TEST_NB" verify-cmd "npm test -- --eval 'require("fs")'" 2>&1)
if echo "$OUTPUT_VFP" | grep -q "REJECT"; then
    echo "[HS: Green] VFP injection command correctly blocked."
else
    echo "[VH: Red] VFP injection command bypassed security."
    exit 1
fi

# Cleanup
rm -rf "$NB_WORKSPACES_ROOT"

echo "TDD Pass."
