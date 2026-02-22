# Concurrency Protection

## Task Module Lock Protocol

Without worktree mode, only one task should be actively operated at a time. Sub-commands that modify task module files (`plan`, `exec`, `check`, `merge`, `research`, `annotate`, `cancel`) MUST check for an active lockfile (`$NB_WORKSPACES_ROOT/<project>/<notebook>/.working/.lock`) before proceeding:

1. **Acquire**: Attempt to create `$NB_WORKSPACES_ROOT/<project>/<notebook>/.working/.lock` with `O_CREAT | O_EXCL` (atomic create-if-not-exists). Write `{ session, pid, timestamp }` to identify the holder
2. **If lock exists**: Read lock content, check if holding process is still alive (kill -0). If dead → remove stale lock and retry. If alive → REJECT with error identifying the holding session. No retry — the caller (user or auto) decides whether to retry
3. **Release**: Delete `.lock` on sub-command completion (including error paths)
4. **Worktree mode**: Lock not required — each worktree has its own copy of $NB_WORKSPACES_ROOT/ files
5. **Stale lock recovery**: Use rename-based recovery instead of delete+create. When detecting a stale lock (holder dead): `rename` the stale `.lock` to `.lock.stale.<pid>`, then acquire normally with `O_CREAT | O_EXCL`. If the rename fails (another process already recovered), retry from step 1. Clean up ALL `.lock.stale.*` files in the same directory immediately after successful lock acquisition

## Shared Directory Write Protection

Three shared directories require locks before writing (all use the same lock protocol as module locks above):

| Directory | Lock File | Writers | Scope |
|-----------|-----------|---------|-------|
| `$NB_WORKSPACES_LIBRARY/.memory/.experiences/<type>/` | `$NB_WORKSPACES_LIBRARY/.memory/.experiences/.lock` | `report`, `exec`, `verify`, `check` | Create type dir, write `<notebook>-{complete\|impl\|verify\|eval}.md`, update per-type `.index.md`. For hybrid types (`A\|B`), covers all segments |
| `$NB_WORKSPACES_LIBRARY/.memory/.references/` | `$NB_WORKSPACES_LIBRARY/.memory/.references/.lock` | `research`, `exec`, `check` | Write `<topic>.md`, update `.index.md` and `.summary.md`; `check` updates `failure_count` on REPLAN |
| `$NB_WORKSPACES_LIBRARY/.memory/.type-profiles/` | `$NB_WORKSPACES_LIBRARY/.memory/.type-profiles/.lock` | `research`, `report` | Write `<type>.md` shared profiles |

Additionally, `$NB_WORKSPACES_LIBRARY/.changelog.lock` is held briefly by any library writer during the write protocol (step 4 — single-line append). See Lock Ordering Convention below for the full lock list and acquisition order.

## Lock Ordering Convention

When a sub-command acquires multiple locks within a single operation, it MUST acquire them in the following order to prevent deadlocks:

| Priority | Lock | Typical Holders |
|----------|------|-----------------|
| 1 (first) | `.working/.lock` (task module) | plan, exec, check, merge, research, annotate, cancel |
| 2 | `$NB_WORKSPACES_LIBRARY/.memory/.type-profiles/.lock` | research, report |
| 3 | `$NB_WORKSPACES_LIBRARY/.memory/.experiences/.lock` | report, exec, verify, check |
| 4 | `$NB_WORKSPACES_LIBRARY/.memory/.references/.lock` | research, exec, check |
| 5 | `$NB_WORKSPACES_LIBRARY/.memory/.thinking/patterns/.lock` | report |
| 6 (last) | `$NB_WORKSPACES_LIBRARY/.changelog.lock` | Any library writer (brief hold) |

**Rules:**
- Always acquire in ascending priority order (lower number first)
- Always release in reverse order (higher number first)
- Never hold a lower-priority lock while attempting to acquire a higher-priority one
- `.changelog.lock` is always the innermost lock (acquired last, released first) — its hold duration is a single-line append

**Example**: `report` needs `.working/.lock` (1), `.type-profiles/.lock` (2), and `.experiences/.lock` (3). Preferred order: acquire 1 → 2 → 3, release 3 → 2 → 1 (strictly monotonic). If report must process experiences before type profiles, it may acquire 1 → 3, release 3, then acquire 2 — valid because 3 is fully released before 2 is acquired. Always prefer the strictly monotonic order when the processing sequence allows it.
