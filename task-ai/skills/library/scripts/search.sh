#!/usr/bin/env bash
# Library Search Script
# Usage: search.sh "<query>" [--type <type>] [--limit 10]

set -uo pipefail

QUERY="${1:-}"
TYPE_FILTER=""
LIMIT=10

shift || true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --type)  TYPE_FILTER="$2"; shift 2 ;;
    --limit) LIMIT="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

LIB_PATH="${NB_WORKSPACES_LIBRARY:-${NB_WORKSPACES_ROOT}/.library}"
MASTER_INDEX="$LIB_PATH/.master-index.md"
RELATIONS_JSONL="$LIB_PATH/.relations.jsonl"

START_TIME=$(date +%s%3N)

echo "--- Layer 1: Keyword Match ---"
# 提取 master index 命中行
MATCHES=$(grep -i "$QUERY" "$MASTER_INDEX" | head -n "$LIMIT")

if [[ -z "$MATCHES" ]]; then
    echo "No direct matches found."
else
    echo "$MATCHES"
    
    # 修正路径提取：.master-index.md 格式为 | Topic | Type | Keywords | File Path | Source |
    # 在 awk -F '|' 中，$5 是 File Path
    HIT_PATHS=$(echo "$MATCHES" | awk -F '|' '{print $5}' | sed 's/ //g')
    
    if [[ -f "$RELATIONS_JSONL" ]] && [[ -n "$HIT_PATHS" ]]; then
        echo -e "\n--- Layer 1.5: Relational Association ---"
        while read -r path; do
            [[ -z "$path" ]] && continue
            # 精确匹配 JSONL 中的 "s" 字段
            ASSOCIATIONS=$(grep "\"s\": \"$path\"" "$RELATIONS_JSONL" | head -n 5)
            if [[ -n "$ASSOCIATIONS" ]]; then
                echo "Associations for $path:"
                echo "$ASSOCIATIONS"
            fi
        done <<< "$HIT_PATHS"
    fi
fi

END_TIME=$(date +%s%3N)
ELAPSED=$((END_TIME - START_TIME))
echo -e "\n[PERF] search took ${ELAPSED}ms"
