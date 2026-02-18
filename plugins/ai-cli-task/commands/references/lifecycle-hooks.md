# Lifecycle Hooks (Extension Point)

Status transitions can optionally trigger external notifications. If `AiTasks/.hooks.md` exists, sub-commands read it for hook configuration:

```markdown
# Lifecycle Hooks

## on_complete
<!-- Shell command or URL to call when any task reaches `complete` -->
<!-- e.g., curl -X POST https://slack.webhook/... -d '{"text":"Task ${MODULE} completed"}' -->

## on_blocked
<!-- Notification when a task becomes blocked -->
```

Hooks are **best-effort** — failures are logged but do not block the status transition. This is an optional extension; the system works without `AiTasks/.hooks.md`.

**Implementation**: Sub-commands that change task status (`plan`, `check`, `exec`, `merge`, `cancel`, `annotate`) SHOULD check for `AiTasks/.hooks.md` after updating `.index.json`. If the file exists, read it, find the matching `## on_<new_status>` section, and execute the shell command (with 10s timeout). Pass `MODULE`, `STATUS`, `TITLE` as environment variables. Hook execution happens AFTER the git commit step — a hook failure does not roll back the status change.
