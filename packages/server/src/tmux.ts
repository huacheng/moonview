import { exec } from 'child_process';
import { promisify } from 'util';
import { utimes } from 'fs/promises';
import { closeSync, openSync } from 'fs';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

/**
 * Escapes a string so it can be safely passed to `tmux send-keys -l`.
 * The -l flag sends literal text, but the argument still passes through
 * the shell, so we single-quote the entire string and escape any
 * single-quotes inside it.
 */
function shellEscape(text: string): string {
  // Replace each single quote with: '  ->  '\''
  return `'${text.replace(/'/g, `'\\''`)}'`;
}

export class TmuxSession {
  constructor(private sessionName: string, private cwd: string) {}

  /**
   * Creates a detached tmux session running Claude Code, then waits for
   * Claude to initialise by polling for the JSONL session file.
   */
  async start(): Promise<void> {
    // Ensure any stale session with the same name is gone first.
    const alive = await this.isAlive();
    if (alive) {
      throw new Error(
        `tmux session "${this.sessionName}" already exists. Stop it first.`,
      );
    }

    const command =
      `tmux new-session -d -s ${shellEscape(this.sessionName)} ` +
      `-c ${shellEscape(this.cwd)} ` +
      `"claude --dangerously-skip-permissions"`;

    try {
      await execAsync(command);
    } catch (err) {
      throw new Error(
        `Failed to create tmux session "${this.sessionName}": ${String(err)}`,
      );
    }

    await this.waitForReady();
  }

  /**
   * Sends a prompt to the Claude Code session via tmux send-keys.
   * Uses -l (literal) flag so special characters are not interpreted by
   * tmux or the shell inside the session.
   */
  async sendPrompt(prompt: string): Promise<void> {
    const escaped = shellEscape(prompt);
    try {
      await execAsync(
        `tmux send-keys -t ${shellEscape(this.sessionName)} -l ${escaped}`,
      );
      // Press Enter to submit the prompt.
      await execAsync(
        `tmux send-keys -t ${shellEscape(this.sessionName)} Enter`,
      );
    } catch (err) {
      throw new Error(
        `Failed to send prompt to tmux session "${this.sessionName}": ${String(err)}`,
      );
    }
  }

  /** Returns true when the tmux session is running. */
  async isAlive(): Promise<boolean> {
    try {
      await execAsync(`tmux has-session -t ${shellEscape(this.sessionName)}`);
      return true;
    } catch {
      return false;
    }
  }

  /** Kills the tmux session. */
  async stop(): Promise<void> {
    try {
      await execAsync(`tmux kill-session -t ${shellEscape(this.sessionName)}`);
    } catch (err) {
      throw new Error(
        `Failed to kill tmux session "${this.sessionName}": ${String(err)}`,
      );
    }
  }

  /**
   * Finds the JSONL file that Claude Code created for this session.
   * Returns the absolute path, or null if none is found.
   */
  async getSessionId(): Promise<string | null> {
    const claudeProjectsDir = path.join(
      os.homedir(),
      '.claude',
      'projects',
    );

    try {
      const { stdout } = await execAsync(
        `find ${shellEscape(claudeProjectsDir)} -name "*.jsonl" -newer ${shellEscape(this.markerPath())} 2>/dev/null`,
      );
      const lines = stdout.trim().split('\n').filter(Boolean);
      if (lines.length === 0) return null;
      // Return the most-recently modified file when multiple are found.
      if (lines.length === 1) return lines[0]!;
      const { stdout: newestRaw } = await execAsync(
        `ls -t ${lines.map(shellEscape).join(' ')} | head -1`,
      );
      const newest = newestRaw.trim();
      return newest || null;
    } catch {
      return null;
    }
  }

  getSessionName(): string {
    return this.sessionName;
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /** Path to the marker file created just before the tmux session starts. */
  private markerPath(): string {
    return path.join(
      os.tmpdir(),
      `claude-notebook-${this.sessionName}-start`,
    );
  }

  /**
   * Creates (or touches) the marker file so we have a reference mtime for
   * locating the JSONL file with `find -newer`.
   */
  private async touchMarker(): Promise<void> {
    const mp = this.markerPath();
    try {
      // Try to update the mtime of an existing file first.
      const now = new Date();
      await utimes(mp, now, now);
    } catch {
      // File does not exist – create it.
      const fd = openSync(mp, 'w');
      closeSync(fd);
    }
  }

  /**
   * Polls for the JSONL session file until it appears or the timeout
   * expires. Throws if Claude Code does not initialise in time.
   */
  private async waitForReady(
    timeoutMs = 30_000,
    pollIntervalMs = 500,
  ): Promise<void> {
    await this.touchMarker();

    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const jsonlPath = await this.getSessionId();
      if (jsonlPath) return;

      await new Promise<void>((resolve) =>
        setTimeout(resolve, pollIntervalMs),
      );
    }

    throw new Error(
      `Timed out waiting for Claude Code to initialise in session "${this.sessionName}" ` +
        `(no JSONL file appeared within ${timeoutMs / 1000}s).`,
    );
  }
}
