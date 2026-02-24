#!/usr/bin/env bash
# /moonview:research implementation
# Usage: research.sh <notebook> [--caller target|plan|test|verify|check|exec] [--phase objective|requirements] [--scope full|gap]

set -uo pipefail

NOTEBOOK="${1:-}"
CALLER="target"
PHASE="objective"
SCOPE="full"

if [[ -z "$NOTEBOOK" ]]; then
    echo "[ERROR] Notebook name is required." >&2
    exit 1
fi

shift || true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --caller) CALLER="$2"; shift 2 ;;
    --phase)  PHASE="$2"; shift 2 ;;
    --scope)  SCOPE="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

NB_ROOT="${NB_WORKSPACES_ROOT:-$(pwd)}"
# 更鲁棒的目录查找逻辑
WORK_DIR=$(find "$NB_ROOT" -name "$NOTEBOOK" -type d | head -n 1)/.working
TARGET_MD="$WORK_DIR/.target.md"

if [[ ! -f "$TARGET_MD" ]]; then
    echo "[ERROR] .target.md not found at $TARGET_MD" >&2
    exit 1
fi

detect_stage() {
    python3 -c "
import re, os
with open('$TARGET_MD', 'r') as f:
    t = f.read()
has_ri = '## Research Insights' in t
has_o1 = '### O1:' in t
has_o2 = '### O2:' in t
has_o3 = '### O3:' in t

def get_proposed_in_section(text, start_marker, next_marker=None):
    if start_marker not in text: return False
    section = text.split(start_marker)[1]
    if next_marker and next_marker in section:
        section = section.split(next_marker)[0]
    return '[PROPOSED]' in section

if not has_ri or not has_o1:
    print('O1')
elif get_proposed_in_section(t, '### O1:', '### O2:' if has_o2 else None):
    print('PENDING')
elif not has_o2:
    print('O2')
elif get_proposed_in_section(t, '### O2:', '### O3:' if has_o3 else None):
    print('PENDING')
elif not has_o3:
    print('O3')
elif get_proposed_in_section(t, '### O3:'):
    print('PENDING')
else:
    print('COMPLETE')
"
}

if [[ "$CALLER" == "target" && "$PHASE" == "objective" ]]; then
    STAGE=$(detect_stage)
    echo "Detected stage: $STAGE"
    
    if [[ "$STAGE" == "PENDING" ]]; then
        echo "[ABORT] Pending [PROPOSED] items found. Please review and remove markers before advancing."
        exit 0
    elif [[ "$STAGE" == "COMPLETE" ]]; then
        echo "All objective stages complete. Run with --phase requirements to continue."
        exit 0
    fi
    
    # 模拟写入
    DATE=$(date +%Y-%m-%d)
    if ! grep -q "## Research Insights" "$TARGET_MD"; then
        echo -e "\n## Research Insights" >> "$TARGET_MD"
    fi
    echo -e "\n### $STAGE: Insights · $DATE\n\n#### [PROPOSED] Refinement\n- Data for $STAGE..." >> "$TARGET_MD"
    echo "Updated .target.md with $STAGE insights."
else
    echo "Executing research for caller: $CALLER, scope: $SCOPE"
fi
