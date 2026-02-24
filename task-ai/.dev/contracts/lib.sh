#!/usr/bin/env bash
# task-ai contract testing shared library
# shellcheck disable=SC2034

TASK_AI_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DEV_ROOT="$TASK_AI_ROOT/.dev"
FIXTURES="$DEV_ROOT/fixtures"
PASS=0; FAIL=0; WARN=0

# --- Output helpers ---

emit_pass() { echo "[PASS] $1"; ((PASS++)); }
emit_fail() { echo "[FAIL] $1"; ((FAIL++)); }
emit_warn() { echo "[WARN] $1"; ((WARN++)); }

emit_json() {
  local test="$1" status="$2" detail="$3"
  # Escape double quotes in detail
  detail="${detail//\"/\\\"}"
  echo "{\"test\":\"$test\",\"status\":\"$status\",\"detail\":\"$detail\"}"
}

# --- File reading helpers ---

safe_read() {
  while IFS= read -r line; do
    echo "$line"
  done < "$1"
}

# Strip markdown fenced code blocks, preserving line alignment (empty lines where code was)
strip_code_blocks() {
  local in_fence=0
  while IFS= read -r line; do
    if [[ "$line" =~ ^\`\`\` ]]; then
      in_fence=$((1 - in_fence))
      echo ""
    elif [[ $in_fence -eq 0 ]]; then
      echo "$line"
    else
      echo ""
    fi
  done
}

# Extract content under ## Execution Steps (stops at next ##, excluding ###)
extract_steps() {
  local file="$1" in_section=0
  strip_code_blocks < "$file" | while IFS= read -r line; do
    if [[ "$line" =~ ^##[[:space:]]+Execution[[:space:]]+Steps ]]; then
      in_section=1; continue
    fi
    if [[ "$in_section" -eq 1 && "$line" =~ ^##[[:space:]] && ! "$line" =~ ^### ]]; then
      break
    fi
    [[ "$in_section" -eq 1 ]] && echo "$line"
  done
}

# Extract YAML frontmatter (between --- delimiters)
extract_frontmatter() {
  local file="$1" in_fm=0 started=0
  while IFS= read -r line; do
    if [[ "$line" == "---" ]]; then
      if [[ $started -eq 0 ]]; then
        started=1; in_fm=1; continue
      elif [[ $in_fm -eq 1 ]]; then
        break
      fi
    fi
    [[ $in_fm -eq 1 ]] && echo "$line"
  done < "$file"
}

# Extract a markdown section by heading (level-aware, stops at same or higher level)
extract_section() {
  local file="$1" heading="$2" in_section=0
  local level
  level=$(echo "$heading" | grep -o '^#*' | wc -c)
  ((level--))
  while IFS= read -r line; do
    if [[ "$line" =~ ^${heading}[[:space:]]*$ ]]; then
      in_section=1; continue
    fi
    if [[ $in_section -eq 1 ]]; then
      # Check for heading at same or higher level
      local line_hashes
      line_hashes=$(echo "$line" | grep -o '^#*' | wc -c)
      ((line_hashes--))
      if [[ $line_hashes -ge 1 && $line_hashes -le $level ]]; then
        break
      fi
      echo "$line"
    fi
  done < "$file"
}

# --- File discovery helpers ---

find_skills() {
  find "$TASK_AI_ROOT/skills" -name "SKILL.md" -type f | sort
}

find_references() {
  find "$TASK_AI_ROOT/commands/references" -name "*.md" -type f 2>/dev/null | sort
}

find_all_md() {
  find "$TASK_AI_ROOT" -name "*.md" -type f \
    -not -path "*/.dev/*" \
    -not -path "*/node_modules/*" \
    -not -path "*/.git/*" | sort
}

find_skill_references() {
  find "$TASK_AI_ROOT/skills" -path "*/references/*.md" -type f | sort
}

# --- Summary ---

summary() {
  echo "---"
  echo "Summary: $PASS passed, $FAIL failed, $WARN warnings"
  local exit_code=$FAIL
  [[ $exit_code -gt 255 ]] && exit_code=255
  return $exit_code
}
