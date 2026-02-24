#!/usr/bin/env bash
# L2: Check that VFP file patterns are covered by concurrency.md lock protocol
source "$(dirname "$0")/lib.sh"

CONCURRENCY="$TASK_AI_ROOT/commands/references/concurrency.md"

if [[ ! -f "$CONCURRENCY" ]]; then
  emit_fail "concurrency.md not found"
  summary; exit $?
fi

content=$(strip_code_blocks < "$CONCURRENCY")

# VFP file patterns that need lock coverage
VFP_PATTERNS=(
  "vh-stubs"
  "vh-baseline"
  "cumulative-green"
  "hil-snapshots"
  "vfp_cycles_completed"
)

for pattern in "${VFP_PATTERNS[@]}"; do
  if echo "$content" | grep -qi "$pattern"; then
    emit_pass "concurrency: covers VFP pattern '$pattern'"
  else
    emit_fail "concurrency: MISSING coverage for VFP pattern '$pattern'"
  fi
done

# Also check that existing lock ordering table is present
if echo "$content" | grep -qi "lock.*order\|priority.*lock\|lock.*priority"; then
  emit_pass "concurrency: has lock ordering table"
else
  emit_warn "concurrency: no explicit lock ordering table found"
fi

# Check .working lock is documented
if echo "$content" | grep -qF ".working"; then
  emit_pass "concurrency: documents .working lock"
else
  emit_warn "concurrency: .working lock not documented"
fi

summary
