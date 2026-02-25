---
name: light
description: "Shadow task execution for lightweight fixes and adjustments. No physical directory creation, single commit delivery, and automatic branch cleanup."
model_tier: light
auto_delegatable: true
arguments:
  - name: objective
    description: "The task objective or action to perform"
    required: true
---

# /moonview:light — Lightweight Shadow Task

A "fast-track" mode for small, self-contained tasks (e.g., typos, simple CSS tweaks, minor logs). This mode avoids the overhead of directory creation and heavy lifecycle tracking while maintaining project-level audit trails.

## Usage

- **Start**: `/moonview:light "Objective content..."` — Creates a shadow branch and records the task.
- **Finish**: `/moonview:light --finish` — Squash merges changes to master, deletes the branch, and clears the record.
- **Promote**: `/moonview:light --promote` — Converts the shadow task into a standard heavy-duty notebook (creates directory, etc.).

## Execution Steps

1. **Context discovery**:
   - Locate the project root (where `.git/` exists).
2. **Start shadow session** (if `objective` provided):
   - **Registry**: Record the task goal in `$PROJECT_ROOT/.light-tasks.jsonl`.
   - **Branch**: `git checkout -b light/<slug>-<timestamp>`.
   - **Verify**: Output a confirmation message. A minimalist notebook directory is created under the project to maintain the notebook-bound architecture.
3. **Execute change**:
   - The agent modifies files directly in the codebase.
   - **No intermediate commits**: All changes stay in the working tree/index of the shadow branch.
4. **Quick Verification**:
   - Run lightweight checks (e.g., `npm run lint`, `tsc`, or basic build).
5. **Atomic Finish** (if `--finish` provided):
   - **Merge**: `git checkout master && git merge --squash <shadow-branch>`.
   - **Commit**: `git commit -m "task-ai(light): <objective>"`.
   - **Cleanup**: Delete the shadow branch and remove the entry from `.light-tasks.jsonl`.
6. **Promotion** (if `--promote` provided):
   - Call `/moonview:init` with the current objective.
   - Migrate changes from the shadow branch to the new notebook branch.

## State Transitions

| Current Status | Result | Next Status | Checkpoint | Rationale |
| :--- | :--- | :--- | :--- | :--- |
| (none) | (started) | `light-exec` | `start` | Shadow task initiated. |
| `light-exec` | (success) | `complete` | `finish` | Changes merged and cleaned up. |
| `light-exec` | (complex) | `planning` | `promote` | Promoted to standard task. |

## Git

| Command | Type | Scope | Subject |
| :--- | :--- | :--- | :--- |
| `light --finish` | `light` | `feat/fix` | `<objective>` (Squash commit on master) |

## Notes

- **Complexity Limit**: If more than 3 files are modified or 3 verification attempts fail, the agent should proactively suggest `/moonview:light --promote`.
- **Registry Privacy**: `.light-tasks.jsonl` should be added to the project's `.gitignore` if permanence is not desired, though keeping it allows for simple project history.
