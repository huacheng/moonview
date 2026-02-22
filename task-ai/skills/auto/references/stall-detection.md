# Stall Detection & Recovery

Claude Code may stall mid-execution (e.g., context window overflow prompt, waiting for user input, or internal hang). The daemon MUST actively detect and recover from stalls.

## Heartbeat Polling

The daemon runs a periodic heartbeat (every 60 seconds) while an auto loop is active. Detection is based on the **stream-json output** from the `ClaudeProcess` (`claude -p --output-format stream-json`):

1. Track the timestamp of the last received stream-json message (any type: `assistant`, `tool_use`, `tool_result`, `result`, etc.)
2. Compute `idle_seconds = now - last_message_timestamp`
3. Track consecutive heartbeat polls where `idle_seconds >= 60` as `stall_count`

## Stall Determination

| `stall_count` | Stream Status | Verdict |
|---------------|--------------|---------|
| < 3 | — | Normal (Claude may be thinking/working) |
| >= 3 | No stream-json output for >= 3 polls (>= 3 minutes) | Stall suspected → run pattern match |

A stall is only suspected after **3 consecutive idle heartbeats** (>= 3 minutes at 60s interval). This avoids false positives from long-running steps.

## Pattern Matching Recovery

When stall is suspected, check the **last stream-json messages** for known stall patterns:

| Pattern | Detection | Recovery Action |
|---------|-----------|-----------------|
| Continuation prompt | Last `assistant` message contains `continue`, `Continue?`, `press enter` (case-insensitive) | Send `{"type":"human","message":"continue"}` via stream-json stdin |
| Yes/No prompt | Last `assistant` message contains `(y/n)`, `(Y/N)`, `[y/N]`, `[Y/n]` | Send `{"type":"human","message":"y"}` via stream-json stdin |
| Proceed prompt | Last `assistant` message contains `Do you want to proceed`, `Shall I continue` | Send `{"type":"human","message":"yes"}` via stream-json stdin |
| Process exited | `ClaudeProcess` emits `close` event or stream ends | Claude session ended unexpectedly → restart auto session (see Server Recovery in main SKILL.md) |
| **Quota exhausted** | Last `assistant` or `system` message contains `rate limit`, `quota exceeded`, `usage limit`, `token limit`, `try again later` (case-insensitive) | **NOT a stall** — reset `stall_count` to 0, enter quota-wait mode (see `references/context-quota.md`) |
| No recognizable pattern | — | Log warning, increment `stall_count`, continue polling |

## Recovery Limits

| Limit | Value | Action on Exceed |
|-------|-------|-----------------|
| Max recoveries per iteration | 3 | Write `.auto-stop` with reason `"stall_limit"` |
| Max total recoveries | 10 | Write `.auto-stop` with reason `"stall_limit"` |

Recovery counts are tracked in SQLite and reset on each new `.auto-signal` receipt.
