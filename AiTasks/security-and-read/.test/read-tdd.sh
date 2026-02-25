#!/usr/bin/env bash
# TDD Test for read sub-command
# Phase: RED (Verification Hypothesis)

set -uo pipefail

PROJECT_ROOT="/home/ubuntu/notebook-ai"
READ_SH="$PROJECT_ROOT/task-ai/skills/read/scripts/read.sh"
export NB_WORKSPACES_ROOT="/tmp/read-tdd-test"
LIB_PATH="$NB_WORKSPACES_ROOT/.library"

# Setup: Create a dummy library and a document
rm -rf "$NB_WORKSPACES_ROOT" && mkdir -p "$LIB_PATH/.memory/.references"
cd "$LIB_PATH" && git init > /dev/null && cd - > /dev/null
touch "$LIB_PATH/.changelog"
echo "Dummy master index" > "$LIB_PATH/.master-index.md"

DOC_PATH="/tmp/test-doc.txt"
echo "This is a document about specific new API concepts and malicious code: eval(btoa('...'))" > "$DOC_PATH"

echo "Running read test..."

if [[ ! -x "$READ_SH" ]]; then
    echo "[VH: Red] read.sh does not exist or is not executable."
    exit 1
fi

"$READ_SH" "$DOC_PATH" --depth shallow > /dev/null

# 1. Assert: Reference file created
REF_FILE=$(find "$LIB_PATH/.memory/.references" -name "test-doc.md" | head -n 1)
if [[ -n "$REF_FILE" && -f "$REF_FILE" ]]; then
    echo "[HS: Green] Reference file created."
else
    echo "[VH: Red] Failed to create reference file."
    exit 1
fi

# 2. Assert: Detox applied (obfuscated code flagged)
if grep -q "injection_risk" "$REF_FILE"; then
    echo "[HS: Green] Detox applied."
else
    echo "[VH: Red] Detox not applied."
    exit 1
fi

# Cleanup
rm -rf "$NB_WORKSPACES_ROOT"
rm -f "$DOC_PATH"

echo "TDD Pass."
