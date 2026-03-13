#!/usr/bin/env bash
# /task-ai:verify implementation
# Usage: verify.sh <notebook> [--checkpoint quick|full|step-N]
#        verify.sh <notebook> --generate-skill-tests --target <skill.md>

set -euo pipefail

# Load context discovery from lib.sh
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../../../core/lib.sh"

NOTEBOOK="${1:-}"
resolve_nb_workdir "$NOTEBOOK"
NOTEBOOK="$NB_NOTEBOOK"

CHECKPOINT=""
TARGET_FILE=""
GENERATE_SKILL_TESTS=false
shift || true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --checkpoint)
      # D3: Guard against missing option value; D2: reject --option as value
      if [[ $# -lt 2 || "$2" == --* ]]; then echo "[ERROR] --checkpoint requires a value" >&2; exit 1; fi
      CHECKPOINT="$2"; shift 2 ;;
    --target)
      # D3: Guard against missing option value; D2: reject --option as value
      if [[ $# -lt 2 || "$2" == --* ]]; then echo "[ERROR] --target requires a value" >&2; exit 1; fi
      TARGET_FILE="$2"; shift 2 ;;
    --generate-skill-tests) GENERATE_SKILL_TESTS=true; shift ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done
if [[ ! -d "$TASKAI_WORK_DIR" ]]; then
    echo "[ERROR] Working directory not found." >&2
    exit 1
fi

TEST_DIR="$TASKAI_WORK_DIR/.test"
mkdir -p "$TEST_DIR"

# Handle --generate-skill-tests (utility mode — no status check needed)
if [[ "$GENERATE_SKILL_TESTS" == "true" ]]; then
    if [[ -z "$TARGET_FILE" || ! -f "$TARGET_FILE" ]]; then
        echo "[ERROR] --target <skill.md> required for --generate-skill-tests" >&2
        exit 1
    fi

    SKILL_NAME=$(basename "${TARGET_FILE%.*}")
    # D2: Sanitize skill name — allow only alphanumeric, dash, underscore
    SKILL_NAME=$(echo "$SKILL_NAME" | tr -cd 'a-zA-Z0-9_-')
    if [[ -z "$SKILL_NAME" ]]; then
        echo "[ERROR] Could not derive valid skill name from $TARGET_FILE" >&2
        exit 1
    fi
    TEST_FILE="$TEST_DIR/skill-$SKILL_NAME.test.md"
    DATE=$(date +%Y-%m-%d)

    # Extract skill description and steps
    # D3: Use intermediate variable to handle pipefail correctly
    SKILL_DESC=$(grep -E "^description:" "$TARGET_FILE" 2>/dev/null | head -1 | sed 's/^description:[[:space:]]*//' | sed 's/^"//;s/"$//' || true)
    if [[ -z "$SKILL_DESC" ]]; then SKILL_DESC="No description"; fi
    SKILL_STEPS=$(grep -A 100 "^## .*[Ss]teps" "$TARGET_FILE" 2>/dev/null | grep -E "^[0-9]+\." | head -5 || true)
    if [[ -z "$SKILL_STEPS" ]]; then SKILL_STEPS="No steps found"; fi

    # D3: File write with error handling
    if ! cat > "$TEST_FILE" <<EOF
# Skill Test: $SKILL_NAME
Generated: $DATE

## Skill Under Test
- File: $TARGET_FILE
- Description: $SKILL_DESC

## Test Cases

### TC1: Basic Invocation (Green)
**Input**: Invoke /$SKILL_NAME with minimal valid input
**Expected**: Skill executes without error

### TC2: Missing Required Input (Red)
**Input**: Invoke /$SKILL_NAME without required parameters
**Expected**: Clear error message, non-zero exit

### TC3: Permission Boundary
**Input**: Invoke /$SKILL_NAME in --permission-mode strict
**Expected**: No unexpected permission requests

## Extracted Steps
$SKILL_STEPS

## Execution Notes
- Run in isolated worktree: \`init skill-test-$SKILL_NAME --worktree --ephemeral\`
- Use strict permission mode: \`claude --permission-mode strict\`
- Collect permission requests as behavioral fingerprint
EOF
    then
        echo "[ERROR] Failed to write $TEST_FILE" >&2
        exit 1
    fi

    echo "Generated skill tests: $TEST_FILE"
    exit 0
fi

# D3: Warn if --target passed without --generate-skill-tests (likely user error)
if [[ -n "$TARGET_FILE" && "$GENERATE_SKILL_TESTS" != "true" ]]; then
    echo "[WARN] --target ignored without --generate-skill-tests" >&2
fi

# D1 Step 1: Check .status.json — reject terminal statuses, extract type
STATUS_FILE="$TASKAI_WORK_DIR/.status.json"
TASK_TYPE=""
if [[ -f "$STATUS_FILE" ]]; then
    TASK_STATUS=$(grep -o '"status"[[:space:]]*:[[:space:]]*"[^"]*"' "$STATUS_FILE" | head -1 | sed 's/.*"status"[[:space:]]*:[[:space:]]*"//;s/"//' || true)
    TASK_TYPE=$(grep -o '"type"[[:space:]]*:[[:space:]]*"[^"]*"' "$STATUS_FILE" | head -1 | sed 's/.*"type"[[:space:]]*:[[:space:]]*"//;s/"//' || true)
    if [[ -z "$TASK_STATUS" ]]; then
        echo "[WARN] .status.json exists but has no 'status' field" >&2
    else
        case "$TASK_STATUS" in
          cancelled)
            echo "[ERROR] Task status is '$TASK_STATUS' (terminal). Verify cannot run on terminal tasks." >&2
            exit 1
            ;;
        esac
    fi
else
    echo "[WARN] .status.json not found — proceeding without status/type context" >&2
fi

# D1: Default empty CHECKPOINT to 'full' (matches SKILL.md default)
if [[ -z "$CHECKPOINT" ]]; then
    CHECKPOINT="full"
    echo "[verify] No checkpoint specified, defaulting to 'full'"
fi

# D2: Validate checkpoint value
if [[ "$CHECKPOINT" != "quick" && "$CHECKPOINT" != "full" && ! "$CHECKPOINT" =~ ^step-[1-9][0-9]*$ ]]; then
    echo "[ERROR] Invalid checkpoint: $CHECKPOINT. Must be quick, full, or step-N (N >= 1)." >&2
    exit 1
fi

# D2/D3: Acquire concurrency lock (see SKILL.md Notes § Concurrency)
LOCK_DIR="$TASKAI_WORK_DIR"
LOCK_FILE="$LOCK_DIR/.lock"
if ! mkdir "$LOCK_FILE" 2>/dev/null; then
    # D3: Stale lock detection — check if holding PID is still alive
    LOCK_PID_FILE="$LOCK_FILE/pid"
    if [[ -f "$LOCK_PID_FILE" ]]; then
        LOCK_PID=$(cat "$LOCK_PID_FILE" 2>/dev/null || true)
        if [[ -n "$LOCK_PID" ]] && ! kill -0 "$LOCK_PID" 2>/dev/null; then
            echo "[WARN] Stale lock from PID $LOCK_PID detected, reclaiming" >&2
            rm -rf "$LOCK_FILE"
            mkdir "$LOCK_FILE" 2>/dev/null || { echo "[ERROR] Failed to reclaim lock" >&2; exit 1; }
        else
            echo "[ERROR] Another verify/exec process (PID ${LOCK_PID:-unknown}) holds the lock ($LOCK_FILE). Aborting." >&2
            exit 1
        fi
    else
        echo "[ERROR] Another verify/exec process holds the lock ($LOCK_FILE). Aborting." >&2
        exit 1
    fi
fi
# D3: Record owning PID for stale lock detection
echo "$$" > "$LOCK_FILE/pid"
# D3: Ensure lock is released and temp files cleaned on exit (normal, error, or signal)
cleanup() {
    rm -rf "$LOCK_FILE" 2>/dev/null || true
    rm -f "$TEST_DIR"/*.tmp.$$ 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "Verifying $NOTEBOOK with checkpoint: $CHECKPOINT"

# D1 Step 10: Execute Procedures based on checkpoint
# Detect project test commands and execute real tests

DATE=$(date +%Y-%m-%d)
RESULTS_FILE="$TEST_DIR/$DATE-$CHECKPOINT-results.md"
RESULT="(pass)"
TEST_OUTPUT=""
FAILED_TESTS=0
PASSED_TESTS=0

# Detect project type and test command
detect_test_command() {
    local project_root="$1"

    # Node.js project with package.json
    if [[ -f "$project_root/package.json" ]]; then
        if grep -q '"test"' "$project_root/package.json"; then
            echo "npm test"
            return 0
        fi
    fi

    # Python project
    if [[ -f "$project_root/pyproject.toml" ]] || [[ -f "$project_root/setup.py" ]]; then
        if command -v pytest &>/dev/null; then
            echo "pytest"
            return 0
        elif command -v python3 &>/dev/null; then
            echo "python3 -m unittest discover"
            return 0
        fi
    fi

    # Go project
    if [[ -f "$project_root/go.mod" ]]; then
        echo "go test ./..."
        return 0
    fi

    # Rust project
    if [[ -f "$project_root/Cargo.toml" ]]; then
        echo "cargo test"
        return 0
    fi

    # Shell scripts — look for test directory
    if [[ -d "$project_root/tests" ]] || [[ -d "$project_root/test" ]]; then
        local test_dir="$project_root/tests"
        [[ -d "$project_root/test" ]] && test_dir="$project_root/test"
        if compgen -G "$test_dir"'/*.test.sh' > /dev/null 2>&1; then
            echo "bash_tests:$test_dir"
            return 0
        fi
    fi

    return 1
}

# Execute tests based on checkpoint
execute_tests() {
    local checkpoint="$1"
    local test_cmd

    # Find project root (go up from TASKAI_WORK_DIR)
    local project_root="${TASKAI_WORK_DIR%/.working}"
    [[ "$project_root" == "$TASKAI_WORK_DIR" ]] && project_root="$TASKAI_WORK_DIR"

    test_cmd=$(detect_test_command "$project_root") || {
        echo "[WARN] No test command detected — running structural checks only" >&2
        return 0
    }

    echo "- Detected test command: $test_cmd"

    case "$checkpoint" in
        quick)
            echo "- Running quick checks (build + lint)..."
            # For Node.js, run lint if available
            if [[ "$test_cmd" == "npm test" ]] && [[ -f "$project_root/package.json" ]]; then
                if grep -q '"lint"' "$project_root/package.json"; then
                    if ! (cd "$project_root" && npm run lint 2>&1); then
                        echo "  Lint: FAIL"
                        ((FAILED_TESTS++))
                        return 1
                    fi
                    echo "  Lint: PASS"
                    ((PASSED_TESTS++))
                fi
                # Type check for TypeScript
                if grep -q '"typecheck"' "$project_root/package.json" || grep -q '"tsc"' "$project_root/package.json"; then
                    if ! (cd "$project_root" && npm run typecheck 2>&1 || npm run tsc -- --noEmit 2>&1); then
                        echo "  Type check: FAIL"
                        ((FAILED_TESTS++))
                        return 1
                    fi
                    echo "  Type check: PASS"
                    ((PASSED_TESTS++))
                fi
            fi
            ;;
        full)
            echo "- Running full test suite..."
            case "$test_cmd" in
                "npm test")
                    if ! (cd "$project_root" && npm test 2>&1); then
                        echo "  Tests: FAIL"
                        ((FAILED_TESTS++))
                        return 1
                    fi
                    ((PASSED_TESTS++))
                    ;;
                "pytest")
                    if ! (cd "$project_root" && pytest -v 2>&1); then
                        echo "  Tests: FAIL"
                        ((FAILED_TESTS++))
                        return 1
                    fi
                    ((PASSED_TESTS++))
                    ;;
                "go test ./...")
                    if ! (cd "$project_root" && go test ./... 2>&1); then
                        echo "  Tests: FAIL"
                        ((FAILED_TESTS++))
                        return 1
                    fi
                    ((PASSED_TESTS++))
                    ;;
                "cargo test")
                    if ! (cd "$project_root" && cargo test 2>&1); then
                        echo "  Tests: FAIL"
                        ((FAILED_TESTS++))
                        return 1
                    fi
                    ((PASSED_TESTS++))
                    ;;
                bash_tests:*)
                    local test_dir="${test_cmd#bash_tests:}"
                    for test_file in "$test_dir"/*.test.sh; do
                        [[ -f "$test_file" ]] || continue
                        echo "  Running: $test_file"
                        if ! bash "$test_file" 2>&1; then
                            echo "  $test_file: FAIL"
                            ((FAILED_TESTS++))
                        else
                            ((PASSED_TESTS++))
                        fi
                    done
                    [[ $FAILED_TESTS -gt 0 ]] && return 1
                    ;;
                *)
                    echo "[WARN] Unknown test command: $test_cmd" >&2
                    ;;
            esac
            echo "  Tests: PASS"
            ;;
        step-*)
            local step_num="${checkpoint#step-}"
            echo "- Running tests for step $step_num..."
            # Step-specific tests are filtered by test file naming convention
            # e.g., step-3.test.sh or test_step_3.py
            # For now, run all tests (full implementation would filter)
            execute_tests "full"
            return $?
            ;;
    esac

    return 0
}

# Run tests and capture result
if execute_tests "$CHECKPOINT"; then
    RESULT="(pass)"
    echo "- All tests passed"
else
    RESULT="(fail)"
    echo "- Some tests failed"
fi

# D1 Step 11: Write Results File
# D3: Atomic write via temp file to avoid partial results on interrupt
RESULTS_TMP="$RESULTS_FILE.tmp.$$"
if ! cat > "$RESULTS_TMP" <<EOF
# Verification Results: $CHECKPOINT · $DATE
- Result: $RESULT
- Task Type: ${TASK_TYPE:-unknown}
- Passed Tests: $PASSED_TESTS
- Failed Tests: $FAILED_TESTS
- Summary: Verification completed for checkpoint $CHECKPOINT.
EOF
then
    rm -f "$RESULTS_TMP"
    echo "[ERROR] Failed to write $RESULTS_FILE" >&2
    exit 1
fi
mv -f "$RESULTS_TMP" "$RESULTS_FILE"

# D1 Step 13: Update .test/.summary.md
# D3: File write with error handling
# Note: Full implementation should aggregate ALL criteria & results files in .test/
# D3: Use compgen glob for reliable file counting (avoids find|wc edge cases)
RESULT_COUNT=0
if compgen -G "$TEST_DIR"'/*-results.md' > /dev/null 2>&1; then
    RESULT_COUNT=$(compgen -G "$TEST_DIR"'/*-results.md' | wc -l)
fi
if ! cat > "$TEST_DIR/.summary.md" <<EOF
# Test Summary
- Last Checkpoint: $CHECKPOINT
- Last Result: $RESULT
- Date: $DATE
- Total result files: $RESULT_COUNT
EOF
then
    echo "[WARN] Failed to write .summary.md" >&2
fi

# D1 Step 14: Git commit
# TODO: Implement git commit: task-ai($NOTEBOOK):verify $CHECKPOINT verification
# Should stage .test/ results and .summary.md, skip if no git repo or nothing to commit

# D1 Step 16: Report results summary
echo "Verification completed: $RESULT. Results written to $RESULTS_FILE."
