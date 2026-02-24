#!/usr/bin/env bash
# task-ai framework contract validator
# Usage: validate.sh [--level 1|2|3|all] [--json] [--regression <file>] [--snapshot <file>] [--self-check] [--check-phase <N>]
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONTRACTS="$SCRIPT_DIR/contracts"

# --- Level-to-script mapping (flat filenames, hardcoded arrays) ---

L1_SCRIPTS=(
  step-numbering.sh
  cross-refs.sh
  signal-whitelist.sh
  naming-conventions.sh
  state-matrix.py
  frontmatter-validation.sh
  git-commit-conventions.sh
)

L2_SCRIPTS=(
  terminology.sh
  data-flow.py
  seed-completeness.sh
  lock-coverage.sh
  phase-state-machine.py
  index-completeness.sh
  library-index-completeness.sh
  library-health-audit.sh
  library-regression-fixes.sh
  init-functional.sh
  signal-field-names.py
  injection-category-count.sh
  plugin-slot-consistency.py
)

L3_SCRIPTS=(
  state-machine-graph.py
  protocol-compliance.py
  library-relation-routing.py
  signal-routing.py
)

META_SCRIPTS=(
  self-check.sh
)

# --- Argument parsing ---

LEVEL="all"
JSON_MODE=0
REGRESSION_FILE=""
SNAPSHOT_FILE=""
SELF_CHECK=0
CHECK_PHASE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --level)    LEVEL="$2"; shift 2 ;;
    --json)     JSON_MODE=1; shift ;;
    --regression) REGRESSION_FILE="$2"; shift 2 ;;
    --snapshot) SNAPSHOT_FILE="$2"; JSON_MODE=1; shift 2 ;;
    --self-check) SELF_CHECK=1; shift ;;
    --check-phase) CHECK_PHASE="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

# --- Build script list based on level ---

declare -a SCRIPTS_TO_RUN=()

add_level() {
  local level_name="$1"
  shift
  local scripts=("$@")
  for s in "${scripts[@]}"; do
    SCRIPTS_TO_RUN+=("$level_name:$s")
  done
}

case "$LEVEL" in
  1)   add_level "L1" "${L1_SCRIPTS[@]}" ;;
  2)   add_level "L2" "${L2_SCRIPTS[@]}" ;;
  3)   add_level "L3" "${L3_SCRIPTS[@]}" ;;
  all)
    add_level "L1" "${L1_SCRIPTS[@]}"
    add_level "L2" "${L2_SCRIPTS[@]}"
    add_level "L3" "${L3_SCRIPTS[@]}"
    ;;
  *) echo "Invalid level: $LEVEL (use 1, 2, 3, or all)" >&2; exit 1 ;;
esac

if [[ $SELF_CHECK -eq 1 ]]; then
  add_level "Meta" "${META_SCRIPTS[@]}"
fi

# --- Execution ---

TOTAL_PASS=0
TOTAL_FAIL=0
TOTAL_WARN=0
FAILED_SCRIPTS=0
ALL_OUTPUT=""

run_script() {
  local label="$1"   # e.g., "L1:step-numbering.sh"
  local script="${label#*:}"  # e.g., "step-numbering.sh"
  local level="${label%%:*}"  # e.g., "L1"
  local script_path="$CONTRACTS/$script"

  if [[ ! -f "$script_path" ]]; then
    echo "[ERROR] Script not found: $script_path" >&2
    FAILED_SCRIPTS=$((FAILED_SCRIPTS + 1))
    return
  fi

  local output
  local exit_code=0

  # Choose interpreter based on extension
  if [[ "$script" == *.py ]]; then
    output=$(python3 "$script_path" 2>&1) || exit_code=$?
  else
    output=$(bash "$script_path" 2>&1) || exit_code=$?
  fi

  # Count results from output
  local pass_count fail_count warn_count
  pass_count=$(echo "$output" | grep -c '^\[PASS\]' || true)
  fail_count=$(echo "$output" | grep -c '^\[FAIL\]' || true)
  warn_count=$(echo "$output" | grep -c '^\[WARN\]' || true)

  TOTAL_PASS=$((TOTAL_PASS + pass_count))
  TOTAL_FAIL=$((TOTAL_FAIL + fail_count))
  TOTAL_WARN=$((TOTAL_WARN + warn_count))

  if [[ $exit_code -ne 0 ]]; then
    FAILED_SCRIPTS=$((FAILED_SCRIPTS + 1))
  fi

  # Print output (with level prefix for clarity)
  if [[ $JSON_MODE -eq 1 ]]; then
    # In JSON mode, extract JSONL lines or convert text lines to JSONL
    while IFS= read -r line; do
      if [[ "$line" == "{"* ]]; then
        # Already JSON, add level prefix to test field
        echo "$line"
      elif [[ "$line" == "["* ]]; then
        local status msg
        status=$(echo "$line" | sed 's/^\[\([A-Z]*\)\].*/\1/')
        msg=$(echo "$line" | sed 's/^\[[A-Z]*\] //')
        local test_id="${level}-${script%.sh}"
        test_id="${test_id%.py}"
        echo "{\"test\":\"${test_id}:${msg%%:*}\",\"status\":\"${status}\",\"detail\":\"${msg}\"}"
      fi
    done <<< "$output"
  else
    echo "=== $level: $script ==="
    echo "$output"
    echo ""
  fi
}

# Run all scripts
for label in "${SCRIPTS_TO_RUN[@]}"; do
  run_script "$label"
done

# --- Regression check ---

if [[ -n "$REGRESSION_FILE" && -f "$REGRESSION_FILE" ]]; then
  echo ""
  echo "=== Regression Check (vs $REGRESSION_FILE) ==="
  REGRESSION_COUNT=0

  while IFS= read -r baseline_line; do
    [[ "$baseline_line" == "{"* ]] || continue
    local_test=$(echo "$baseline_line" | python3 -c "import sys,json; print(json.load(sys.stdin)['test'])" 2>/dev/null || true)
    local_status=$(echo "$baseline_line" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])" 2>/dev/null || true)

    if [[ "$local_status" == "PASS" ]]; then
      # Check if current run has this test as FAIL
      if [[ -n "$SNAPSHOT_FILE" && -f "$SNAPSHOT_FILE" ]]; then
        current_status=$(grep "\"test\":\"$local_test\"" "$SNAPSHOT_FILE" 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])" 2>/dev/null || echo "MISSING")
        if [[ "$current_status" == "FAIL" ]]; then
          echo "[REGRESSION] $local_test: was PASS, now FAIL"
          REGRESSION_COUNT=$((REGRESSION_COUNT + 1))
        fi
      fi
    fi
  done < "$REGRESSION_FILE"

  if [[ $REGRESSION_COUNT -gt 0 ]]; then
    echo "REGRESSIONS DETECTED: $REGRESSION_COUNT"
    FAILED_SCRIPTS=$((FAILED_SCRIPTS + REGRESSION_COUNT))
  else
    echo "No regressions detected."
  fi
fi

# --- Phase check ---

if [[ -n "$CHECK_PHASE" ]]; then
  echo ""
  echo "=== Phase Check: phase-$CHECK_PHASE ==="
  python3 -c "
import json, sys
expectations = json.load(open('$SCRIPT_DIR/fixtures/phase-expectations.json'))
phase_key = 'phase-$CHECK_PHASE'
if phase_key not in expectations:
    print(f'[WARN] No expectations defined for {phase_key}')
    sys.exit(0)
phase = expectations[phase_key]
print(f'Description: {phase.get(\"description\", \"\")}')
print(f'Expected newly green: {phase.get(\"newly_green\", [])}')
print(f'Expected still red: {phase.get(\"still_red\", [])}')
"
fi

# --- Snapshot ---

save_snapshot() {
  local dest="$1"
  for label in "${SCRIPTS_TO_RUN[@]}"; do
    local script="${label#*:}"
    local level="${label%%:*}"
    local script_path="$CONTRACTS/$script"
    [[ -f "$script_path" ]] || continue

    local snap_output
    if [[ "$script" == *.py ]]; then
      snap_output=$(python3 "$script_path" 2>&1) || true
    else
      snap_output=$(bash "$script_path" 2>&1) || true
    fi

    while IFS= read -r line; do
      if [[ "$line" == "{"* ]]; then
        echo "$line"
      elif [[ "$line" == "["* ]]; then
        local snap_status snap_msg snap_test_id
        snap_status=$(echo "$line" | sed 's/^\[\([A-Z]*\)\].*/\1/')
        snap_msg=$(echo "$line" | sed 's/^\[[A-Z]*\] //')
        snap_test_id="${level}-${script%.sh}"
        snap_test_id="${snap_test_id%.py}"
        echo "{\"test\":\"${snap_test_id}:${snap_msg%%:*}\",\"status\":\"${snap_status}\",\"detail\":\"${snap_msg}\"}"
      fi
    done <<< "$snap_output"
  done
}

if [[ -n "$SNAPSHOT_FILE" ]]; then
  echo ""
  echo "Saving snapshot to: $SNAPSHOT_FILE"
  save_snapshot "$SNAPSHOT_FILE" > "$SNAPSHOT_FILE"
  echo "Snapshot saved ($(wc -l < "$SNAPSHOT_FILE") entries)."
fi

# --- Final summary ---

echo ""
echo "======================================="
echo "  TOTAL: $TOTAL_PASS passed, $TOTAL_FAIL failed, $TOTAL_WARN warnings"
echo "  Failed scripts: $FAILED_SCRIPTS"
echo "======================================="

exit_code=$FAILED_SCRIPTS
[[ $exit_code -gt 255 ]] && exit_code=255
exit $exit_code
