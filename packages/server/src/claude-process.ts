import { spawn, type ChildProcess } from 'child_process';
import * as readline from 'readline';

/**
 * Wraps a persistent `claude -p --input-format stream-json` subprocess.
 *
 * One ClaudeProcess instance lives for the lifetime of a notebook session.
 * Prompts are delivered by writing JSON lines to stdin; responses arrive as
 * JSON lines on stdout and are forwarded to the provided onMessage callback.
 *
 * Completion is detected from a `{"type":"result"}` message — no idle timer
 * or tmux prompt-polling is required.
 *
 * Startup sequence observed with --input-format stream-json:
 *   1. Process starts → hooks fire → system.hook_started + system.hook_response
 *   2. Process waits for first stdin message
 *   3. First message sent → system.init emitted → assistant → result
 * We wait for the first output line (hook_started) as the "ready" signal.
 */
export class ClaudeProcess {
  private proc: ChildProcess | null = null;
  private rl: readline.Interface | null = null;

  constructor(
  private readonly cwd: string,
  private readonly systemPrompt?: string,
) {}

  /**
   * Spawns the Claude process, sets up the stdout message handler, and waits
   * for the process to confirm it is running (first output received).
   * After resolution, all stdout messages are forwarded to `onMessage`.
   * If the process exits unexpectedly, `onExit` is called with the exit code.
   */
  async start(
    onMessage: (msg: unknown) => void,
    onExit?: (code: number | null) => void,
  ): Promise<void> {
    // Unset CLAUDECODE so nested invocations are allowed.
    // Claude Code sets this variable to prevent accidental nesting, but our
    // server intentionally spawns a child claude process as a backend.
    const env = { ...process.env };
    delete env['CLAUDECODE'];

    this.proc = spawn(
      'claude',
      [
        '-p',
        '--input-format', 'stream-json',
        '--output-format', 'stream-json',
        '--verbose',
        '--dangerously-skip-permissions',
        ...(this.systemPrompt ? ['--append-system-prompt', this.systemPrompt] : []),
      ],
      {
        cwd: this.cwd,
        env,
        stdio: ['pipe', 'pipe', 'inherit'], // inherit stderr for visibility
      },
    );

    this.proc.on('error', (err) => {
      console.error('[claude-process] spawn error:', err.message);
    });

    if (onExit) {
      this.proc.on('exit', (code) => onExit(code));
    }

    this.rl = readline.createInterface({
      input: this.proc.stdout!,
      crlfDelay: Infinity,
    });

    // Forward all stdout messages to the session handler.
    // Note: system.init appears per-prompt (not at startup), so system.*
    // messages are passed through and silently ignored by the default case.
    this.rl.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      let msg: unknown;
      try {
        msg = JSON.parse(trimmed);
      } catch {
        return;
      }
      onMessage(msg);
    });

    // Wait for the first output line to confirm the process is alive.
    // (hook_started appears within ~1 second of startup)
    await this._waitForFirstOutput();
  }

  /**
   * Sends a prompt to the running Claude process by writing a JSON user
   * message to stdin.
   */
  sendPrompt(prompt: string): void {
    if (!this.proc?.stdin) throw new Error('Claude process is not running.');
    const line = JSON.stringify({
      type: 'user',
      message: { role: 'user', content: prompt },
    });
    this.proc.stdin.write(line + '\n');
  }

  /** Returns true when the subprocess is still alive. */
  isAlive(): boolean {
    return this.proc !== null && this.proc.exitCode === null && !this.proc.killed;
  }

  /** Terminates the Claude subprocess. */
  stop(): void {
    this.rl?.close();
    this.rl = null;
    if (this.proc) {
      try { this.proc.stdin?.end(); } catch { /* ignore */ }
      try { this.proc.kill('SIGTERM'); } catch { /* ignore */ }
      this.proc = null;
    }
  }

  // ── Private ───────────────────────────────────────────────────────────────

  /**
   * Waits until the process emits at least one output line, confirming it
   * started successfully.  Rejects if no output arrives within the timeout
   * or if the process exits before emitting any output.
   */
  private _waitForFirstOutput(timeoutMs = 15_000): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;

      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        fn();
      };

      const timer = setTimeout(() => {
        settle(() => reject(new Error('Timed out waiting for Claude process to start.')));
      }, timeoutMs);

      // Resolve on first output line.
      const onLine = () => {
        this.rl!.off('line', onLine);
        clearTimeout(timer);
        settle(resolve);
      };
      this.rl!.once('line', onLine);

      // Reject if the process exits before producing any output.
      this.proc!.once('exit', (code) => {
        clearTimeout(timer);
        settle(() =>
          reject(new Error(`Claude process exited early (code ${String(code)}).`)),
        );
      });

      this.proc!.once('error', (err) => {
        clearTimeout(timer);
        settle(() => reject(err));
      });
    });
  }
}
