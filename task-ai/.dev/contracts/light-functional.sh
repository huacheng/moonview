#!/usr/bin/env bash
# L2: Functional test for light sub-command
# Verifies shadow task lifecycle (registry, branch, squash merge).

source "$(dirname "$0")/lib.sh"

LIGHT_SH="$TASK_AI_ROOT/skills/light/scripts/light.sh"
TEST_PROJECT="test-project"
TEST_OBJ="Fix spelling in README"
export NB_WORKSPACES_ROOT="/tmp/task-ai-test"

# Setup: Create a project
rm -rf "$NB_WORKSPACES_ROOT"
mkdir -p "$NB_WORKSPACES_ROOT/$TEST_PROJECT"
cd "$NB_WORKSPACES_ROOT/$TEST_PROJECT" || exit 1
git init > /dev/null
git config user.email "test@example.com"
git config user.name "Test User"
git commit --allow-empty -m "Initial commit" > /dev/null

# --- Test 1: Start Mode (Shadow Start) ---
if [[ ! -f "$LIGHT_SH" ]]; then
    emit_fail "light: light.sh script missing (Expected Red)"
else
    "$LIGHT_SH" "$TEST_OBJ" > /dev/null

    # 1. Check registry entry
    if grep -q "$TEST_OBJ" ".light-tasks.jsonl"; then
        emit_pass "light: created project registry entry"
    else
        emit_fail "light: failed to create registry entry"
    fi

    # 2. Check for shadow branch
    CURRENT_BRANCH=$(git branch --show-current)
    if [[ "$CURRENT_BRANCH" =~ ^light/ ]]; then
        emit_pass "light: successfully switched to shadow branch"
    else
        emit_fail "light: failed to switch branch"
    fi

    # 3. Check for no physical task directory
    if [[ ! -d "fix-spelling-in-readme" ]]; then
        emit_pass "light: successfully verified no physical directory created"
    else
        emit_fail "light: created physical directory (Unexpected for light task)"
    fi
fi

# --- Test 2: Finish Mode (Squash Merge) ---
if [[ -f "$LIGHT_SH" ]]; then
    echo "Fixed typo" > README.md
    git add README.md
    # Simulation: Normally light tasks don't commit until finish
    "$LIGHT_SH" --finish > /dev/null

    # 1. Check if on master branch
    CURRENT_BRANCH=$(git branch --show-current)
    if [[ "$CURRENT_BRANCH" == "master" ]]; then
        emit_pass "light: successfully returned to master"
    else
        emit_fail "light: failed to return to master"
    fi

    # 2. Check for squash commit
    if git log -n 1 --oneline | grep -q "task-ai(light): $TEST_OBJ"; then
        emit_pass "light: successfully squash-merged changes"
    else
        emit_fail "light: missing squash commit on master"
        echo "Actual git log:"
        git log -n 5 --oneline
    fi

    # 3. Check if shadow branch is deleted
    if [[ -z $(git branch --list "light/*") ]]; then
        emit_pass "light: successfully deleted shadow branch"
    else
        emit_fail "light: failed to delete shadow branch"
    fi

    # 4. Check if registry is cleared
    if [[ ! -f ".light-tasks.jsonl" ]] || [[ -z $(cat ".light-tasks.jsonl") ]]; then
        emit_pass "light: successfully cleared registry entry"
    else
        emit_fail "light: failed to clear registry entry"
    fi
fi

# Cleanup
rm -rf "$NB_WORKSPACES_ROOT"

summary
