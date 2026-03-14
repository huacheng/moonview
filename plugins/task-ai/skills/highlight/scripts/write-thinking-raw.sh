#!/usr/bin/env bash
# write-thinking-raw.sh — Append a thinking entry to .thinking/raw/
#
# Usage:
#   write-thinking-raw.sh --notebook <name> --caller <caller> --content-file <file>
#   echo "content" | write-thinking-raw.sh --notebook <name> --caller <caller>
#
# Creates/appends to: $NB_WORKSPACES_LIBRARY/.memory/.thinking/raw/<notebook>-<caller>-<YYYY-MM-DD>.md
# Updates index:      $NB_WORKSPACES_LIBRARY/.memory/.thinking/raw/.index.md (only on new file creation)
#
# No lock needed — filenames are naturally unique (notebook+caller+date), uses O_APPEND.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORE_DIR="$SCRIPT_DIR/../../../core"

# Load core library for ensure_library
if [[ -f "$CORE_DIR/lib.sh" ]]; then
    source "$CORE_DIR/lib.sh"
    ensure_library
else
    # Fallback: resolve library path from env
    export NB_WORKSPACES_LIBRARY="${NB_WORKSPACES_LIBRARY:-${NB_WORKSPACES_ROOT:-.}/.library}"
fi

# --- Parse arguments ---
NOTEBOOK=""
CALLER=""
CONTENT_FILE=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --notebook)
            if [[ $# -lt 2 ]]; then echo "[ERROR] --notebook requires a value" >&2; exit 1; fi
            NOTEBOOK="$2"; shift 2 ;;
        --caller)
            if [[ $# -lt 2 ]]; then echo "[ERROR] --caller requires a value" >&2; exit 1; fi
            CALLER="$2"; shift 2 ;;
        --content-file)
            if [[ $# -lt 2 ]]; then echo "[ERROR] --content-file requires a value" >&2; exit 1; fi
            CONTENT_FILE="$2"; shift 2 ;;
        -*)
            echo "[ERROR] Unknown option: $1" >&2; exit 1 ;;
        *)
            echo "[ERROR] Unexpected argument: $1" >&2; exit 1 ;;
    esac
done

# --- Validate required args ---
if [[ -z "$NOTEBOOK" ]]; then
    echo "[ERROR] --notebook is required" >&2
    exit 1
fi

if [[ -z "$CALLER" ]]; then
    echo "[ERROR] --caller is required" >&2
    exit 1
fi

# --- D2 Security: sanitize notebook and caller names ---
# Must match [a-zA-Z0-9_-]+, no dots, no slashes, no spaces (same as task-ai global convention)
VALID_NAME_RE='^[a-zA-Z0-9_-]+$'
if [[ ! "$NOTEBOOK" =~ $VALID_NAME_RE ]]; then
    echo "[ERROR] Invalid --notebook name: '$NOTEBOOK' (must match [a-zA-Z0-9_-]+, no dots/slashes/spaces)" >&2
    exit 1
fi
if [[ ! "$CALLER" =~ $VALID_NAME_RE ]]; then
    echo "[ERROR] Invalid --caller name: '$CALLER' (must match [a-zA-Z0-9_-]+)" >&2
    exit 1
fi

# --- Resolve paths ---
LIB_PATH="${NB_WORKSPACES_LIBRARY}"
RAW_DIR="$LIB_PATH/.memory/.thinking/raw"
TODAY=$(date +%Y-%m-%d)
FILENAME="${NOTEBOOK}-${CALLER}-${TODAY}.md"
TARGET_FILE="$RAW_DIR/$FILENAME"
INDEX_FILE="$RAW_DIR/.index.md"

# Ensure raw directory exists
mkdir -p "$RAW_DIR"

# --- Read content ---
CONTENT=""
if [[ -n "$CONTENT_FILE" ]]; then
    if [[ ! -f "$CONTENT_FILE" ]]; then
        echo "[ERROR] Content file not found: $CONTENT_FILE" >&2
        exit 1
    fi
    CONTENT=$(cat "$CONTENT_FILE")
else
    # Read from stdin
    if [[ -t 0 ]]; then
        echo "[ERROR] No content: provide --content-file or pipe content via stdin" >&2
        exit 1
    fi
    CONTENT=$(cat)
fi

if [[ -z "$CONTENT" ]]; then
    echo "[ERROR] Content is empty" >&2
    exit 1
fi

# --- Determine if file is new (for index update) ---
IS_NEW=false
if [[ ! -f "$TARGET_FILE" ]]; then
    IS_NEW=true
fi

# --- Append content to target file (O_APPEND) ---
# Add separator if file already has content
if [[ -f "$TARGET_FILE" ]] && [[ -s "$TARGET_FILE" ]]; then
    printf '\n\n' >> "$TARGET_FILE"
fi
printf '%s\n' "$CONTENT" >> "$TARGET_FILE"

# --- Update index (only on new file creation) ---
if [[ "$IS_NEW" == "true" ]]; then
    # Extract quality grade from content frontmatter
    QUALITY=$(echo "$CONTENT" | grep '^ *thinking:' | head -1 | sed 's/.*: *\(.\).*/\1/' || true)
    QUALITY="${QUALITY:-?}"

    # Extract first line after "### Problem" for summary
    SUMMARY=$(echo "$CONTENT" | grep -A1 "^### Problem" | tail -1 | head -c 80 || true)
    SUMMARY="${SUMMARY:-<no summary>}"

    # Ensure index file exists with header
    if [[ ! -f "$INDEX_FILE" ]] || [[ ! -s "$INDEX_FILE" ]]; then
        printf '| file | caller | quality | summary |\n|------|--------|---------|--------|\n' > "$INDEX_FILE"
    fi

    # Append index row (O_APPEND)
    printf '| %s | %s | %s | %s |\n' "$FILENAME" "$CALLER" "$QUALITY" "$SUMMARY" >> "$INDEX_FILE"
fi

echo "[OK] thinking-raw: $TARGET_FILE ($(wc -l < "$TARGET_FILE") lines)"
