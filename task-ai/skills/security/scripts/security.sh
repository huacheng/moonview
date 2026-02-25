#!/usr/bin/env bash
# /moonview:security implementation
# Usage: security.sh <notebook> <action> [payload]

set -uo pipefail

NOTEBOOK="${1:-}"
ACTION="${2:-}"
PAYLOAD="${3:-}"

if [[ -z "$NOTEBOOK" || -z "$ACTION" ]]; then
    echo "[ERROR] Notebook and Action are required." >&2
    exit 1
fi

NB_ROOT="${NB_WORKSPACES_ROOT:-$(pwd)}"
# Locate working dir securely
WORK_DIR=$(find "$NB_ROOT" -maxdepth 2 -name "$NOTEBOOK" -type d | head -n 1)/.working

if [[ ! -d "$WORK_DIR" ]]; then
    # Fallback for simple tests
    WORK_DIR="$NB_ROOT/$NOTEBOOK/.working"
fi

if [[ ! -d "$WORK_DIR" ]]; then
    echo "[ERROR] Working directory not found for $NOTEBOOK." >&2
    exit 1
fi

verify_cmd() {
    local cmd="$1"
    local risk="low"
    local reason=""

    # 1. Fatal Pattern Blocking (Destructive commands)
    if echo "$cmd" | grep -qE "rm\s+-rf\s+(/|/etc|~|/var)"; then
        risk="high"
        reason="Destructive path deletion"
    fi

    # 2. VFP Injection (Command Semantics)
    if echo "$cmd" | grep -qE -e "--eval|--conftest|--require|--include|--import"; then
        risk="high"
        reason="VFP semantics injection"
    fi

    # 3. Two-stage loading
    if echo "$cmd" | grep -qE "curl.*\|\s*bash|wget.*\|\s*sh"; then
        risk="high"
        reason="Two-stage payload execution"
    fi

    # 4. Environment manipulation (high risk if overriding critical libs)
    if echo "$cmd" | grep -qE "LD_PRELOAD=|PYTHONPATH="; then
        risk="high"
        reason="Environment manipulation"
    fi

    if [[ "$risk" == "high" ]]; then
        echo "[SECURITY] REJECT: $reason"
        return 1
    else
        echo "[SECURITY] PASS: Command looks safe"
        return 0
    fi
}

audit_plan() {
    local plan_md="$WORK_DIR/.plan.md"
    if [[ ! -f "$plan_md" ]]; then
        echo "[SECURITY] PASS: No plan.md to audit"
        return 0
    fi

    local content=$(cat "$plan_md")
    
    # Semantic deviation audit (simulated)
    # E.g., a plan claiming to fix CSS shouldn't have 'rm -rf'
    if echo "$content" | grep -qE "rm -rf|curl | bash|wget"; then
        echo "[SECURITY] BLOCKED: High risk operations detected in plan"
        return 1
    fi
    echo "[SECURITY] PASS: Plan looks safe"
    return 0
}

case "$ACTION" in
    verify-cmd)
        verify_cmd "$PAYLOAD"
        ;;
    audit-plan)
        audit_plan
        ;;
    *)
        echo "[ERROR] Unknown action: $ACTION" >&2
        exit 1
        ;;
esac
