#!/usr/bin/env bash
# L2: Functional test for light sub-command (Notebook-bound)
# Verifies shadow task lifecycle with transient notebook directory.

source "$(dirname "$0")/lib.sh"

LIGHT_SH="$TASK_AI_ROOT/skills/light/scripts/light.sh"
TEST_PROJECT="test-project"
TEST_OBJ="Fix spelling"
export NB_WORKSPACES_ROOT="/tmp/task-ai-test"

# Setup: Create a project
rm -rf "$NB_WORKSPACES_ROOT"
mkdir -p "$NB_WORKSPACES_ROOT/$TEST_PROJECT"
cd "$NB_WORKSPACES_ROOT/$TEST_PROJECT" || exit 1
git init > /dev/null
git config user.email "test@example.com"
git config user.name "Test User"
git commit --allow-empty -m "Initial commit" > /dev/null

# --- Test 1: Start Mode (Notebook-bound Start) ---
"$LIGHT_SH" "$TEST_PROJECT" "$TEST_OBJ" > /dev/null

# 1. Check if notebook directory exists
NB_DIR=$(find . -name "light-fix-spelling-*" -type d)
if [[ -d "$NB_DIR/.working" ]]; then
    emit_pass "light: created notebook directory"
else
    emit_fail "light: failed to create notebook directory"
fi

# 2. Check for shadow branch
CURRENT_BRANCH=$(git branch --show-current)
if [[ "$CURRENT_BRANCH" =~ ^light/light-fix-spelling- ]]; then
    emit_pass "light: successfully switched to shadow branch"
else
    emit_fail "light: failed to switch branch (Current: $CURRENT_BRANCH)"
fi

# Move to the notebook directory for context before finishing
cd "$NB_DIR" || exit 1

# --- Test 2: Finish Mode ---
echo "Fixed typo" > README.md
git add README.md

# Move back to project root before finishing because the notebook dir will be deleted
cd ..
"$LIGHT_SH" --finish > /dev/null

# 1. Check if on master branch
CURRENT_BRANCH=$(git branch --show-current)
if [[ "$CURRENT_BRANCH" == "master" ]]; then
    emit_pass "light: successfully returned to master"
else
    emit_fail "light: failed to return to master"
fi

# 2. Check for squash commit
if git log -n 1 --oneline | grep -q "task-ai($TEST_PROJECT):light $TEST_OBJ"; then
    emit_pass "light: successfully squash-merged changes"
else
    emit_fail "light: missing squash commit on master"
    echo "Actual git log (last 2):"
    git log -n 2 --oneline
fi

# 3. Check if notebook directory is deleted
if [[ -z $(find . -name "light-fix-spelling-*" -type d) ]]; then
    emit_pass "light: successfully deleted transient notebook directory"
else
    emit_fail "light: failed to delete notebook directory after finish"
fi

# Cleanup
rm -rf "$NB_WORKSPACES_ROOT"

summary
