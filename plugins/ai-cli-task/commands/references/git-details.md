# Git Integration — Extended Details

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
git worktree add .worktrees/task-<module> -b task/<module>
```

- Each task runs in an isolated directory with full project copy
- Multiple tasks can `exec` simultaneously without conflict
- `auto` daemon operates in the task's worktree directory
- On completion, merge back: `git merge task/<module>` from main branch

## Rollback

To revert a task to a previous checkpoint:
```bash
git log --oneline task/<module>    # find checkpoint commit
git reset --hard <commit>          # in the task's worktree
```

**Warning**: `git reset --hard` is irreversible — all uncommitted changes are lost. Only use in the task's dedicated worktree, never in the main worktree (which may contain other work). Consider `git stash` first if unsure.
