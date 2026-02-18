---
name: auto
description: Autonomous execution loop — single Claude session orchestrates plan/check/exec cycle internally
model_tier: heavy
auto_delegatable: false
arguments:
  - name: task_module
    description: "Path to the task module directory (e.g., AiTasks/auth-refactor)"
    required: true
  - name: action
    description: "Action: start, stop, or status"
    required: false
    default: start
---

# /moonview:auto — Autonomous Execution Loop

Coordinate the full task lifecycle autonomously: plan → verify → check → exec → verify → check(mid) → exec → verify → check(post) → merge → report, with self-correction on failures. Runs as a **single Claude session** that internally dispatches sub-commands, preserving context across all steps.

## Usage

```
/moonview:auto <task_module_path> [--start|--stop|--status]
```

## Architecture

Auto mode runs as a **single long-lived Claude session** started by the daemon via `claude "/moonview:auto <module>"`. The daemon starts the session and monitors it externally; it does NOT dispatch individual commands.

### Components

```
┌─────────────────────────────────────────────────┐
│  Claude (single session)                         │
│                                                  │
│  /moonview:auto <module>                      │
│    ├→ execute plan logic    ─┐                   │
│    ├→ execute check logic    │  internal loop    │
│    ├→ execute exec logic     │  (shared context) │
│    ├→ execute check logic    │                   │
│    ├→ execute merge logic   ─┘                   │
│    └→ execute report logic                       │
│                                                  │
│  writes .auto-signal ──→ (progress report)       │
│  reads  .auto-stop   ──→ (stop request)          │
└─────────────────────────────────────────────────┘
         │                          ▲
         ▼                          │
┌─────────────────┐     ┌──────────┴──────────┐
│  .auto-signal   │     │  Backend Daemon      │
│  (progress)     │────▶│  - monitors progress │
│                 │     │  - enforces timeout   │
│  .auto-stop     │◀────│  - writes stop file   │
│  (stop request) │     │  - stall detection    │
└─────────────────┘     └─────────────────────┘
```

### Why Single Session

| Aspect | Multi-session (old) | Single session (current) |
|--------|-------------------|--------------------------|
| Context | Lost between steps, rebuilt from `.summary.md` | Naturally shared across all steps |
| Token cost | Re-read files each step, duplicate context loading | Read once, incrementally update |
| Coherence | Each step is blind to implicit decisions | Claude remembers why it made choices |
| Latency | Shell prompt wait + Claude startup per step | Zero inter-step overhead |
| Daemon complexity | Command construction + dispatch + readiness check | Just monitoring + stop signal |

### Signal File (`.auto-signal`)

After each sub-command step completes, Claude writes a progress signal to the task module. This is a **monitoring report** for the daemon, NOT a dispatch trigger:

```json
{
  "step": "check",
  "result": "PASS",
  "next": "exec",
  "checkpoint": "",
  "iteration": 3,
  "timestamp": "2024-01-01T00:00:00Z"
}
```

Fields:
- `step`: the sub-command that just completed
- `result`: outcome of the step
- `next`: what Claude will execute next (or `"(stop)"`)
- `checkpoint`: context hint (e.g., `"post-plan"`, `"mid-exec"`, `"post-exec"`). Empty when not applicable
- `iteration`: current iteration count (for daemon progress tracking). **Auto-mode only** — absent when sub-commands write `.auto-signal` in manual execution
- `compaction_count`: number of `/compact` invocations within the current iteration. **Auto-mode only** — absent in manual execution. Reset to `0` at the start of each iteration. If `>= 3` within one iteration, auto loop stops with warning (see Compaction frequency limit below)
- `timestamp`: ISO 8601

The daemon reads this via `fs.watch` to:
1. Update progress display (iteration count, current step, elapsed time)
2. Check iteration limit (`iteration >= maxIterations` → write `.auto-stop`)
3. Check timeout (`elapsed >= timeoutMinutes` → write `.auto-stop`)
4. Update `last_signal_at` in SQLite for stall detection baseline

The daemon does **NOT** construct or send commands based on the signal.

### Stop File (`.auto-stop`)

The daemon writes `.auto-stop` to the task module directory to request graceful termination. Claude checks for this file before each iteration:

```json
{
  "reason": "timeout",
  "timestamp": "2024-01-01T00:30:00Z"
}
```

Reasons: `"timeout"`, `"max_iterations"`, `"user_stop"`, `"stall_limit"`

### Signal Validation

The daemon validates `.auto-signal` fields for monitoring integrity:

| Field | Validation | Allowed Values |
|-------|-----------|----------------|
| `step` | Whitelist | `plan`, `check`, `exec`, `merge`, `report`, `research`, `verify`, `annotate` |
| `result` | Whitelist | `PASS`, `NEEDS_REVISION`, `ACCEPT`, `NEEDS_FIX`, `REPLAN`, `BLOCKED`, `CONTINUE`, `(generated)`, `(done)`, `(mid-exec)`, `(step-N)` (where N is integer), `(blocked)`, `(collected)`, `(sufficient)`, `(pass)`, `(fail)`, `(partial)`, `(processed)`, `success`, `conflict` |
| `next` | Whitelist | `plan`, `check`, `exec`, `merge`, `report`, `research`, `verify`, `annotate`, `(stop)` |
| `checkpoint` | Whitelist | `""`, `post-plan`, `post-research`, `mid-exec`, `post-exec`, `quick`, `full`, `step-N` |
| `iteration` | Integer | ≥ 0 |
| `compaction_count` | Integer | ≥ 0 |
| `timestamp` | Format check | ISO 8601 |

Invalid signals are logged but do not affect Claude's internal loop (daemon is observer, not dispatcher).

### Stall Detection & Recovery

Claude Code may stall mid-execution. The daemon detects stalls via heartbeat polling (60s interval, 3 consecutive unchanged captures = suspected stall) and recovers via pattern matching (continuation prompts, y/n prompts, shell prompt restart). Recovery limits: 3 per iteration, 10 total.

> **See `references/stall-detection.md`** for the full heartbeat polling logic, stall determination rules, pattern matching recovery table, and recovery limits.

### Context Window Management & Quota Handling

Proactive `/compact` at >= 70% context usage prevents overflow. `.summary.md` files provide compaction recovery context. Quota exhaustion is NOT a stall — daemon enters quota-wait mode with timeout clock paused.

**Compaction frequency limit**: If 3 or more compactions occur within the same iteration (indicating the task generates more context per sub-command than compaction can reclaim), the auto loop should stop with a warning: "context budget insufficient for this task — consider breaking into smaller sub-tasks or increasing context window". Claude tracks compaction count in memory and persists it to `.auto-signal` via the `compaction_count` field (step 2e). On compaction recovery, the count is restored from the signal file (see Compaction recovery below). The daemon can also monitor `compaction_count` in the signal for observability.

> **See `references/context-quota.md`** for the full context management strategy, quota exhaustion handling (daemon + Claude behavior), and SQLite `quota_wait_since` extension.

## State Machine

```
AUTO LOOP (4 phases — all within single Claude session)

Phase 1: Planning
  plan ──→ verify ──→ check(post-plan) ─── PASS ──────────→ [Phase 2]
                            │
                            NEEDS_REVISION ──→ plan (retry)

  Re-entry: if phase == "needs-plan" → plan; if phase == "needs-check" → verify → check

Phase 2: Execution
  exec ─┬─ (mid-exec) ──→ verify ──→ check(mid-exec) ─── CONTINUE ──→ exec (resume)
        │                                    │
        │                               NEEDS_FIX ──→ exec (fix then resume)
        │                                    │
        │                               REPLAN ──→ [Phase 1]
        │
        └─ (done) ──→ [Phase 3]

Phase 3: Post-Exec Verification
  verify ──→ check(post-exec) ─── ACCEPT ──→ [Phase 4]
                    │                │
                 NEEDS_FIX        REPLAN ──→ [Phase 1]
                    │
                    └──→ exec (re-exec) → [Phase 3]

Phase 4: Merge & Report
  merge ─── success ──→ report → (stop)
    │
    └── conflict unresolvable (after 3 retries, stays executing) → (stop)

Terminal: BLOCKED at any check → (stop, status → blocked)
Terminal: merge conflict → (stop, status stays executing — retryable)
```

## Internal Loop Logic

The auto skill runs this loop within a single Claude session:

```
1. Read .index.json → determine entry point (status-based routing)
2. LOOP:
   a. Check for .auto-stop file → if exists, break loop
   b. Context check: if context window usage ≥ 70%, run /compact to compress context
   c. Execute current step — read target SKILL.md metadata (`model_tier`, `auto_delegatable`):
      - **If `auto_delegatable: true`**: Invoke via Task subagent with `model = tier_to_model(model_tier)` (heavy→opus, medium→sonnet, light→haiku). Subagent receives SKILL.md + `.summary.md` + `.index.json` + input files. On subagent completion, read output files (`.auto-signal`, `.summary.md`, result files) to restore context. On subagent failure/timeout → fallback to inline execution below
      - **If `auto_delegatable: false`**: Execute inline (Read SKILL.md steps, execute in main session)
      — In both paths, SKIP the sub-command's own .auto-signal write step (auto loop handles it at step 2e)
   d. Evaluate result → determine next step (result-based routing)
   e. Write .auto-signal (progress report for daemon, WITH iteration and compaction_count fields)
   f. Increment iteration counter
   g. If next == "(stop)" → break loop
   h. Set current step = next step → continue loop
3. Cleanup: delete .auto-signal, report final status
```

**Signal ownership in auto mode**: Each sub-command's SKILL.md includes a "write `.auto-signal`" step. In auto mode, the auto loop **subsumes** that step — Claude writes the signal once at step 2e (with the `iteration` field included). The sub-command's own signal-write instruction is skipped to avoid double-writing. In manual (non-auto) execution, sub-commands write `.auto-signal` themselves (without `iteration` field).

**How to detect auto mode** (for inline execution): When executing a sub-command's steps inline within the auto loop, skip any step that says "Write `.auto-signal`". The auto loop's step 2e handles it. This is implicit — the auto loop code simply does not execute the signal-write step from each SKILL.md. No environment variable or flag is needed because auto mode always uses inline execution (Read + execute steps), never Skill tool invocation.

### Entry Point (Status-Based Routing)

| Current Status | First Step |
|----------------|-----------|
| `draft` | Validate `.target.md` has substantive content (not just template placeholders) → if empty, stop and report "fill `.target.md` first". Otherwise execute plan (generate mode) |
| `planning` | Execute verify → check (post-plan) |
| `review` | Execute exec |
| `executing` | Execute verify → check (post-exec). **Note**: even if `completed_steps` < total, auto enters via post-exec verification first — check detects incomplete work and routes back to exec via NEEDS_FIX, adding one extra iteration. This avoids re-parsing `.plan.md` to count total steps at entry |
| `re-planning` | Read `phase` field: if `needs-plan` → execute plan (generate); if `needs-check` → execute verify → check (post-plan); if empty → default to plan (generate, safe fallback) |
| `complete` | Execute report, then stop |
| `blocked` | Stop loop, report blocking reason |
| `cancelled` | Stop loop |

### Result-Based Routing

After each step, Claude evaluates the result and determines the next step internally:

| step | result | next | checkpoint | Rationale |
|------|--------|------|------------|-----------|
| check | PASS | exec | — | Plan approved, proceed to execution |
| check | NEEDS_REVISION | plan | — | Plan needs revision, re-generate first |
| check | ACCEPT | merge | — | Task verified, merge to main |
| check | NEEDS_FIX | exec | mid-exec / post-exec | Minor issues, re-execute to fix first |
| check | REPLAN | plan | — | Fundamental issues, revise plan |
| check | BLOCKED | (stop) | — | Cannot continue |
| check (mid-exec) | CONTINUE | exec | — | Progress OK, resume execution |
| check (mid-exec) | NEEDS_FIX | exec | mid-exec | Fixable issues, exec addresses then continues |
| check (mid-exec) | REPLAN | plan | — | Fundamental issues, revise plan |
| check (mid-exec) | BLOCKED | (stop) | — | Cannot continue |
| plan | (any) | verify | post-plan | Plan ready, run verification before assessment |
| exec | (done) | verify | post-exec | All steps completed, run verification before assessment |
| exec | (mid-exec) | verify | mid-exec | Significant issue encountered, run verification before checkpoint |
| exec | (step-N) | verify | mid-exec | Single step completed (manual `--step N` only) |
| exec | (blocked) | (stop) | — | Cannot continue |
| merge | success | report | — | Merge complete, generate report |
| merge | conflict | (stop) | — | Merge conflict unresolvable |
| research | (collected)/(sufficient) | `<caller>` (plan/verify/check/exec) | post-research | References collected, resume calling phase |
| verify | (pass/fail/partial) | check | (from trigger context) | Verification done, check renders verdict. Auto loop uses the **triggering context** to determine check checkpoint: plan→post-plan, exec(done)→post-exec, exec(mid-exec)→mid-exec |
| annotate | (processed) | verify | post-plan | Annotations processed, verify then assess |
| report | (any) | (stop) | — | Loop complete |

### Context Advantage

Because all steps run in one session, Claude naturally retains:
- Plan decisions and trade-offs from the planning phase
- Check feedback and evaluation rationale
- Implementation details and workarounds from execution
- Error context from previous fix attempts

The `.summary.md` file is still written by each sub-command as a **compaction safety net** — if the context window overflows and compaction occurs, `.summary.md` provides the condensed recovery context. But during normal auto execution, live conversation context is the primary source of truth.

**Compaction recovery**: If context compaction occurs mid-loop, Claude loses the iteration counter, compaction counter, and current step position. To recover:
1. Read `.auto-signal` — the `iteration` field gives the last completed iteration count; `compaction_count` gives the compaction counter for the current iteration; `step` and `next` give the position in the loop. **If `.auto-signal` doesn't exist** (cleaned up or never written): fall back to step 2 — use `.index.json` status for position recovery, start iteration from 0 and compaction_count from 0
2. Read `.index.json` — status confirms the current lifecycle phase
3. Read `.summary.md` — condensed task context from the last sub-command
4. Resume the loop from `next` step at `iteration + 1`, reset `compaction_count` to `0` for the new iteration (or from status-based entry point if `.auto-signal` was missing). **Increment** `compaction_count` by 1 (the compaction that just occurred counts toward the new iteration's budget)

## Backend Infrastructure

> **See `references/backend-api.md`** for REST API endpoints, SQLite schema, daemon startup sequence, frontend integration, cleanup protocol, and server recovery.

## Safety

- **Max iterations**: user-configurable (default 20), daemon writes `.auto-stop` when reached
- **Timeout**: user-configurable (default 30 min), daemon writes `.auto-stop` when elapsed
- **Stall detection**: heartbeat polling (60s) + pattern matching recovery, with per-iteration (3) and total (10) recovery limits
- **Context management**: proactive `/compact` at ≥ 70% context window usage, with `.summary.md` as compaction safety net
- **Quota exhaustion**: detected and handled as wait (not stall), timeout clock paused during quota-wait
- **Pause on blocked**: Auto stops immediately on `blocked` status (Claude's internal loop exits)
- **Manual override**: User can `/moonview:auto --stop` at any time, or daemon writes `.auto-stop` via `DELETE` API
- **Graceful stop**: Claude checks for `.auto-stop` before each iteration, ensuring clean exit between steps (not mid-step)
- **Single instance per session/task**: enforced by SQLite constraints (see `references/backend-api.md`)

## Cleanup (Claude-side)

At loop exit, Claude performs:
1. Delete `.auto-signal` file if exists
2. Delete `.auto-stop` file if exists (consumed, no longer needed)

Daemon-side cleanup details are in `references/backend-api.md`.

## Git

Auto mode inherits git behavior from each sub-command it invokes. No additional git commits are made by auto itself — each plan, check, exec, merge, and report step handles its own state commits on the task branch.

## Notes

- Auto mode starts with a single `claude "/moonview:auto <module>"` CLI invocation; all subsequent steps execute within that same session
- The daemon's only active intervention is writing `.auto-stop`; all other daemon activity is passive monitoring
- `.auto-signal` and `.auto-stop` are transient files — should be in `.gitignore`
- The daemon logs all signal events and stall detections to server console for debugging
- **Known trade-off**: First entry on `executing` status always runs `check --checkpoint post-exec`. If execution was incomplete (`completed_steps` < total), check will detect this and route back to exec via NEEDS_FIX, adding one extra iteration. This is acceptable because the auto skill does not re-parse `.plan.md` to count total steps at entry
- **Context window overflow**: If Claude's context compacts during a long auto run, `.summary.md` (written by each sub-command) provides recovery context. The auto loop continues normally after compaction — each sub-command re-reads relevant files as specified in its SKILL.md
- **Plugin delegation in auto mode**: External plugin delegation (see `auto/references/plugin-delegation.md`) works naturally in auto mode. Each skill's delegation steps invoke plugins via the Task tool, creating isolated subagents that prevent external plugin output from inflating the auto session context. Trust `/compact` to handle context pressure; all delegation slots are always attempted when their trigger conditions are met
