# Git Integration — Extended Details

## Branch Convention

| Item | Format | Example |
|------|--------|---------|
| Branch name | `task/<notebook-name>` | `task/notebook-1` |
| Worktree path | `.worktrees/task-<notebook-name>` | `.worktrees/task-notebook-1` |

## Commit Message Convention

All ai-cli-task triggered commits use `--` prefix to distinguish from user manual commits:

```
ai-cli-task(<module>):<type> <description>
```

| type | Scenario | Commit Scope |
|------|----------|-------------|
| `init` | Task initialization | $NB_WORKSPACES_ROOT/ directory files |
| `plan` | Plan generation | $NB_WORKSPACES_ROOT/ directory files |
| `check` | Check evaluation results | $NB_WORKSPACES_ROOT/ directory files |
| `research` | Reference collection | $NB_WORKSPACES_LIBRARY/.memory/.references/ files |
| `verify` | Test execution and verification | $NB_WORKSPACES_ROOT/ directory files |
| `annotate` | Annotation processing | $NB_WORKSPACES_ROOT/ directory files |
| `summarize` | Context summary regeneration | $NB_WORKSPACES_ROOT/ directory files |
| `exec` | Execution state changes | $NB_WORKSPACES_ROOT/ directory files |
| `feat` | New feature code during exec | Project files |
| `fix` | Bugfix code during exec | Project files |
| `refactor` | Code cleanup before merge | Project files |
| `merge` | Merge to main + conflict resolution | — (merge commit) |
| `report` | Report generation | $NB_WORKSPACES_ROOT/ directory files |
| `cancel` | Task cancellation | $NB_WORKSPACES_ROOT/ directory files |

Commit scope: $NB_WORKSPACES_ROOT/ directory files (state/plan) or project files (feat/fix).

## Commit Message Examples

```
ai-cli-task(auth-refactor):init initialize task module
ai-cli-task(auth-refactor):plan generate implementation plan
ai-cli-task(auth-refactor):research collect references
ai-cli-task(auth-refactor):check post-plan PASS → review
ai-cli-task(auth-refactor):feat add user auth middleware
ai-cli-task(auth-refactor):fix fix token expiration check
ai-cli-task(auth-refactor):exec step 2/5 done
ai-cli-task(auth-refactor):check post-exec ACCEPT
ai-cli-task(auth-refactor):refactor cleanup before merge
ai-cli-task(auth-refactor):merge merge completed task
ai-cli-task(auth-refactor):merge resolve merge conflict
ai-cli-task(auth-refactor):merge task completed
ai-cli-task(auth-refactor):report generate completion report
ai-cli-task(auth-refactor):verify full verification
ai-cli-task(auth-refactor):annotate annotations processed
ai-cli-task(auth-refactor):summarize regenerate context summary
ai-cli-task(auth-refactor):cancel user cancelled
```

## Refactoring & Merge

After task completion confirmed (`check --checkpoint post-exec` ACCEPT), the `merge` sub-command handles the full merge lifecycle:

1. **Task-level refactoring** (on task branch, before merge)
2. **Merge to main** (with conflict resolution — up to 3 attempts with verification)
3. **Cleanup** (worktree removal, branch deletion)

See `skills/merge/SKILL.md` for detailed merge strategy and conflict resolution flow.

**Recommended:** After all related tasks merge to main, do a project-level refactoring pass on main (cross-task cleanup, shared utilities, API consistency). This is a manual activity, not part of auto mode.

## Worktree Parallel Execution

Without `--worktree`: all work happens on the task branch in the main worktree. Only one task can execute at a time (branch switching required).

With `--worktree` (passed to `init`):
```bash
git worktree add .worktrees/task-<module> -b task/<notebook>
```

- Each task runs in an isolated directory with full project copy
- Multiple tasks can `exec` simultaneously without conflict
- `auto` daemon operates in the task's worktree directory
- On completion, merge back: `git merge task/<notebook>` from main branch

## Rollback

To revert a task to a previous checkpoint:
```bash
git log --oneline task/<notebook>    # find checkpoint commit
git reset --hard <commit>          # in the task's worktree
```

**Warning**: `git reset --hard` is irreversible — all uncommitted changes are lost. Only use in the task's dedicated worktree, never in the main worktree (which may contain other work). Consider `git stash` first if unsure.

## .gitignore

Add to project `.gitignore`:
```
.worktrees/
**/.working/.tmp-annotations.json
**/.working/.auto-signal
**/.working/.auto-signal.tmp
**/.working/.auto-stop
**/.working/.lock
.library/.changelog
.library/.changelog-archive/.lock
.library/.memory/.thinking/raw/
.library/.memory/.thinking/patterns/.lock
.library/.inconsistency.log
.library/.ioc.md
**/.library-state.json
**/.lock
**/.lock.stale.*
```
