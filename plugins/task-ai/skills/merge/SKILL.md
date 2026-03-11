---
name: merge
description: "Copy deliverables from task branch to main — selective copy of <notebook>/.deliverables/ only. Pure file operation, no status changes."
model_tier: medium
auto_delegatable: false
triggers:
  keywords:
    zh: [合并, 合入, merge, 入主分支, 提交合并]
    en: [merge, integrate, merge to main, land, ship it]
  phrases:
    zh: [合并到主分支, 合入master, 可以合了吗, 提交合并, 合并代码]
    en: [merge to main, merge the branch, ready to merge, land the changes, integrate into master]
  disambiguate: >
    Core intent: copy deliverables from a completed task branch to main.
    User says "merge" or "land it" → merge.
    User says "is it done?" → check post-exec. User says "commit" → git commit (not this skill).
arguments: []
---

# /task-ai:merge — Copy Deliverables to Main

Copy `<notebook>/.deliverables/` from task branch to `<project>/.deliverables/<notebook>/` on main. **Pure file operation** — no status changes, no stage updates.

## Usage

```
/task-ai:merge
```

**Notebook auto-detection:** The notebook is automatically resolved from CWD (`.working/.status.json`) or the current git branch (`task/<notebook>`). No manual notebook parameter needed.

## Prerequisites

- Latest `.analysis/` file must contain an ACCEPT verdict (from `check --checkpoint post-exec`)
- **Dependency gate**: All `depends_on` modules must meet their required status — simple string entries require `satisfied`, extended `{ module, min_status }` entries require at-or-past `min_status`. If any dependency is not met, merge REJECTS with error listing blocking dependencies

## What Merge Does

1. Save `<notebook>/.deliverables/` content from task branch to temp (before branch switch)
2. Checkout main
3. Copy temp content to `<project>/.deliverables/<notebook>/` on main
4. Commit on main
5. Checkout back to task branch

```
Source: <project>/<notebook>/.deliverables/*  (task branch)
Target: <project>/.deliverables/<notebook>/*  (main branch)
```

If the task branch has no `<notebook>/.deliverables/` directory, the copy is silently skipped.

## What Merge Does NOT Do

- **No status changes** — `.status.json` is not modified (auto handles `evolving` transition)
- **No stage.history updates** — auto handles this
- **No .target.md updates** — auto handles Stage `[ACTIVE]` → `[COMPLETE]`
- **No branch/worktree deletion** — user controls cleanup timing

> **Why not full git merge?** Task branches contain system files (`.working/`, `.status.json`, `.plan.md`, etc.) that should NOT pollute the main branch. Only `.deliverables/` content is copied.

## Execution Steps

1. **Read** `.status.json` — get task branch name
2. **Validate dependencies**: check each dependency module's status. If not met → REJECT
3. **Verify** ACCEPT verdict: check latest `.analysis/` file for `post-exec-accept`
4. **Save** `<notebook>/.deliverables/` to temp directory
5. **Checkout main**
6. **Copy** temp → `<project>/.deliverables/<notebook>/`
7. **Commit** on main: `task-ai(<notebook>):merge copy deliverables`
8. **Checkout back** to task branch
9. **Report**: "Deliverables copied to main."

## State Transitions

None. Merge does not change `.status.json` status.

## Git

| Action | Commit Message |
|--------|---------------|
| Copy deliverables (on main) | `task-ai(<notebook>):merge copy deliverables` |

## Notes

- Merge is a **pure file copy operation** — all lifecycle state changes are handled by auto
- If no `.deliverables/` exists, merge succeeds silently (nothing to copy)
- **Concurrency**: Lock acquisition/release handled by caller. `merge.sh` assumes `.working/.lock` is held
