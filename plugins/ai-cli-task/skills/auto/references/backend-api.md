# Auto Mode — Backend API & Infrastructure

Backend implementation details for the auto mode daemon. This file is for server-side development reference — Claude's internal loop logic does not depend on these details.

## Backend REST API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/sessions/:id/task-auto` | Start auto mode for a task module |
| `DELETE` | `/api/sessions/:id/task-auto` | Stop auto mode (writes `.auto-stop`) |
| `GET` | `/api/sessions/:id/task-auto` | Get auto mode status |
| `GET` | `/api/task-auto/lookup?taskDir=<path>` | Look up which session is running auto for a given task directory. Returns `{ session_name, status }` or 404 if not found. Used by `cancel` to find the correct session to stop |

Request body for POST:
```json
{
  "taskDir": "/absolute/path/to/AiTasks/module-name",
  "maxIterations": 20,
  "timeoutMinutes": 30
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `taskDir` | string | (required) | Absolute path to task module in **main worktree** (e.g., `/project/AiTasks/auth-refactor`). In worktree mode, this is still the main worktree path — NOT the task worktree path. Daemon's `fs.watch` monitors this path for `.auto-signal` |
| `maxIterations` | number | 20 | Max plan/check/exec cycles before forced stop |
| `timeoutMinutes` | number | 30 | Total execution time limit (minutes). User sets based on task difficulty |

Frontend displays these as editable fields in the auto-start dialog, with sensible defaults.

## Daemon Startup Sequence

When `POST /api/sessions/:id/task-auto` is called:

1. **Validate**: check no active auto loop for this session or task_dir
2. **Insert** `task_auto` row into SQLite
3. **Send** `claude "/moonview:auto <taskDir>"` to the session's PTY
4. **Start** `fs.watch` on `taskDir` for `.auto-signal` changes
5. **Start** heartbeat polling timer (60s interval)

The daemon does NOT send any further commands after step 3. Claude's internal loop handles all subsequent orchestration.

## SQLite State

```sql
CREATE TABLE task_auto (
  session_name TEXT PRIMARY KEY,
  task_dir TEXT NOT NULL UNIQUE,
  status TEXT DEFAULT 'running',
  max_iterations INTEGER DEFAULT 20,
  timeout_minutes INTEGER DEFAULT 30,
  iteration_count INTEGER DEFAULT 0,
  recovery_count_step INTEGER DEFAULT 0,
  recovery_count_total INTEGER DEFAULT 0,
  last_capture_hash TEXT DEFAULT '',
  stall_count INTEGER DEFAULT 0,
  quota_wait_since TEXT DEFAULT '',
  started_at TEXT,
  last_signal_at TEXT
);
```

`session_name` as PRIMARY KEY enforces one auto loop per session. Starting a new auto task requires stopping the current one or creating a new session.

`status` column values: `running` (active loop) → row deleted on stop. The row only exists while the auto loop is active; cleanup removes it entirely. The `status` column exists for recovery: if the server crashes before cleanup, stale rows with `status = 'running'` are detected on restart (see Server Recovery).

## Frontend Integration

The frontend is a **pure observer** for auto mode, except for start/stop control:

- **Start dialog**: editable fields for `maxIterations` and `timeoutMinutes` with defaults
- **Status display**: polls `GET /api/sessions/:id/task-auto`, shows in Plan panel toolbar:
  - Current iteration / max iterations
  - Elapsed time / timeout
  - Current step (from latest `.auto-signal`)
  - Running / stopped status
- **Stop button**: sends `DELETE /api/sessions/:id/task-auto` (daemon writes `.auto-stop`)
- Does NOT drive the loop — Claude's internal loop handles all orchestration

## Cleanup

When auto mode stops (complete, blocked, cancelled, or manual stop), cleanup is split between Claude and the daemon:

**Claude-side** (inside the session, at loop exit):
1. Delete `.auto-signal` file if exists
2. Delete `.auto-stop` file if exists (consumed, no longer needed)

**Daemon-side** (backend, after detecting loop exit or stop):
1. Stop heartbeat polling timer
2. Stop `fs.watch` on task directory
3. **Delete stale files**: remove `.auto-signal`, `.auto-signal.tmp`, and `.auto-stop` from `task_dir` if they exist (Claude-side cleanup may have been skipped due to crash/kill)
4. Remove `task_auto` row from SQLite (clears all stall detection state)
5. Frontend status indicator clears on next poll

The daemon detects loop exit by: (a) receiving a `DELETE` API call (user stop), (b) heartbeat detecting shell prompt (Claude exited), or (c) `.auto-signal` with `next: "(stop)"` (natural completion). In all cases, daemon performs its cleanup steps above.

## Server Recovery

On backend server restart, auto state is recovered from SQLite:

1. **Read** all `task_auto` rows with `status = 'running'`
2. **For each active row**:
   a. **Delete stale `.auto-stop`** if exists in `task_dir` (prevents restarted Claude from immediately exiting due to leftover stop file from pre-crash state)
   b. Check terminal state via `tmux capture-pane`:
      - If Claude auto session still running → re-establish monitoring (fs.watch + heartbeat)
      - If shell prompt visible (Claude exited) → restart with backoff: send `claude "/moonview:auto <task_dir>"` to PTY (Claude's internal loop reads `.index.json` to determine resume point). **Restart limit**: max 3 restarts per `task_dir`. Track restart count in a new SQLite column `restart_count INTEGER DEFAULT 0`. If exceeded, set row status to `'failed'` and log error "auto loop exceeded restart limit — likely crash loop, manual intervention required". Do NOT delete the row — leave for admin inspection
   c. Reset `stall_count` to `0` and `last_capture_hash` to `""` (fresh monitoring baseline)
   d. Start heartbeat polling timer
   e. Re-establish `fs.watch` on `task_dir` for `.auto-signal`
3. **Resume** normal daemon operation (signal watching + heartbeat polling)

On restart, Claude's auto loop re-reads `.index.json` and `.summary.md` to reconstruct context. The conversation context from the previous session is lost, but `.summary.md` provides the condensed recovery information.
