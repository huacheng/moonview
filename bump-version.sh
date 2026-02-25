#!/usr/bin/env bash
# Usage: bash bump-version.sh <new-version>
# Syncs version across all 4 declaration files in one shot.

set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: bash bump-version.sh <new-version>"
  echo "Example: bash bump-version.sh 0.3.0"
  exit 1
fi

NEW_VERSION="$1"
REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"

FILES=(
  "$REPO_ROOT/.claude-plugin/marketplace.json"
  "$REPO_ROOT/.claude-plugin/plugin.json"
  "$REPO_ROOT/plugins/task-ai/plugin.json"
  "$REPO_ROOT/plugins/task-ai/.claude-plugin/plugin.json"
)

for f in "${FILES[@]}"; do
  if [ ! -f "$f" ]; then
    echo "WARN: $f not found, skipping"
    continue
  fi
  # Replace the first "version": "..." occurrence
  sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$NEW_VERSION\"/" "$f"
  echo "  OK: $(realpath --relative-to="$REPO_ROOT" "$f") -> $NEW_VERSION"
done

echo ""
echo "All version files updated to $NEW_VERSION"
echo "Next: git add -A && git commit -m 'chore: bump version to $NEW_VERSION' && git push"
