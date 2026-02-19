import crypto from 'crypto';
import { TmuxSession } from './tmux.js';
import { JsonlWatcher } from './jsonl-watcher.js';
import { setupHooks } from './hooks.js';
import { GitManager } from './git.js';
import {
  NotebookSchema,
  type Notebook,
  type WSServerMessage,
  type CellOutput,
} from '@notebook-ai/shared';

// ── Claude Code JSONL message shapes ────────────────────────────────────────
// Claude Code emits streaming JSONL records.  We only need a subset.

interface ClaudeTextMessage {
  type: 'assistant';
  message: {
    content: Array<
      | { type: 'text'; text: string }
      | { type: 'thinking'; thinking: string }
      | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
    >;
  };
}

interface ClaudeResultMessage {
  type: 'result';
  result: string;
  is_error: boolean;
}

interface ClaudeToolResultMessage {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
}

type ClaudeJsonlMessage =
  | ClaudeTextMessage
  | ClaudeResultMessage
  | ClaudeToolResultMessage
  | { type: string };

// ── NotebookSession ──────────────────────────────────────────────────────────

interface NotebookSession {
  id: string;
  tmux: TmuxSession;
  watcher: JsonlWatcher | null;
  notebook: Notebook;
  gitManager: GitManager;
  /** Absolute path to the .notebook.json file on disk. */
  notebookPath: string;
  /** Callbacks registered by WebSocket clients for this session. */
  listeners: Set<(msg: WSServerMessage) => void>;
  /** Database ID for this notebook (if persisted in DB). */
  notebookDbId?: string;
  /** Tracks per-cell execution start times (ms) for duration calculation. */
  _execStartTimes: Map<string, number>;
  /** Idle timer that fires when no new JSONL activity follows an assistant message. */
  _completionTimer: ReturnType<typeof setTimeout> | null;
}

// ── SessionManager ───────────────────────────────────────────────────────────

export class SessionManager {
  private sessions = new Map<string, NotebookSession>();

  /** Optional callback invoked after a successful auto-save to sync DB metadata. */
  onAutoSave?: (notebookDbId: string, cellCount: number) => void;

  /**
   * Creates a new notebook session: starts a tmux session running Claude Code,
   * finds its JSONL file, sets up the stop hook, and starts the JSONL watcher.
   *
   * @param notebookPath  Absolute path to the .notebook.json file (used to
   *                      derive a stable session name and stored in metadata).
   * @param cwd           Working directory for the tmux session.
   */
  async createSession(notebookPath: string, cwd: string): Promise<NotebookSession> {
    // Derive a short, deterministic session name from the notebook path.
    const hash = crypto
      .createHash('sha1')
      .update(notebookPath)
      .digest('hex')
      .slice(0, 8);
    const sessionName = `nb-${hash}`;

    const tmux = new TmuxSession(sessionName, cwd);
    await tmux.start();

    // Initialise (or adopt) the git repo for this working directory.
    const gitManager = new GitManager(cwd);
    await gitManager.ensureRepo();

    // Register the stop hook so we can detect when Claude finishes.
    await setupHooks(sessionName);

    // Locate the JSONL file that Claude Code created for this session.
    const jsonlPath = await tmux.getSessionId();
    if (!jsonlPath) {
      await tmux.stop().catch(() => undefined);
      throw new Error(
        `Could not locate JSONL session file for tmux session "${sessionName}".`,
      );
    }

    const notebook: Notebook = NotebookSchema.parse({
      version: 1,
      metadata: {
        title: 'Untitled Notebook',
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        cwd,
        git_repo: true,
        tmux_session: sessionName,
      },
      cells: [],
      slice: { generated: false, sections: [] },
      annotations: [],
      assets: { intermediate_files: [] },
    });

    const session: NotebookSession = {
      id: sessionName,
      tmux,
      watcher: null,
      notebook,
      gitManager,
      notebookPath,
      listeners: new Set(),
      _execStartTimes: new Map(),
      _completionTimer: null,
    };

    // Start the JSONL watcher – messages arrive asynchronously.
    const watcher = new JsonlWatcher(
      jsonlPath,
      (raw: unknown) => this.handleJsonlMessage(session, raw),
      (err: Error) => {
        console.error(`[session ${sessionName}] JSONL watcher error:`, err.message);
        this.broadcast(session, {
          type: 'error',
          message: `JSONL watcher error: ${err.message}`,
        });
      },
    );
    watcher.start();
    session.watcher = watcher;

    this.sessions.set(sessionName, session);
    console.log(`[session] Created session "${sessionName}" for "${notebookPath}"`);

    return session;
  }

  /**
   * Sends a prompt to Claude Code and waits (non-blocking) for the stop marker
   * to appear.  Output messages arrive asynchronously via the JSONL watcher and
   * are forwarded to registered listeners.
   */
  async executeCell(sessionId: string, cellId: string, source: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session "${sessionId}" not found.`);
    }

    // Ensure the cell exists in the server-side notebook. The client may have
    // added it locally without syncing, so we create a stub if needed.
    const cellExists = session.notebook.cells.some((c) => c.id === cellId);
    if (!cellExists) {
      session.notebook = {
        ...session.notebook,
        cells: [
          ...session.notebook.cells,
          {
            id: cellId,
            type: 'prompt' as const,
            source,
            outputs: [],
            execution_count: 0,
            status: 'idle' as const,
          },
        ],
      };
    }

    // Update the cell status to 'running'.
    session.notebook = updateCellStatus(session.notebook, cellId, 'running');

    // Record execution start time for duration calculation.
    session._execStartTimes.set(cellId, Date.now());

    // Completion is detected from the JSONL stream (see handleJsonlMessage
    // for the 'result' message type), NOT from the Stop hook marker.  The
    // Stop hook fires when the Claude Code *process* exits, not after each
    // individual prompt/response cycle, so it is not suitable here.
    await session.tmux.sendPrompt(source);
  }

  getSession(sessionId: string): NotebookSession | undefined {
    return this.sessions.get(sessionId);
  }

  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.watcher?.stop();

    try {
      await session.tmux.stop();
    } catch (err) {
      console.warn(`[session ${sessionId}] Error stopping tmux:`, String(err));
    }

    session.listeners.clear();
    this.sessions.delete(sessionId);
    console.log(`[session] Closed session "${sessionId}"`);
  }

  /**
   * Reconnects to an existing tmux session. Used when restoring a notebook
   * from the database. If the tmux session is alive, we reattach; otherwise
   * we create a new one.
   *
   * Returns the session and a flag indicating whether we reconnected
   * (true) or created fresh (false).
   */
  async reconnectSession(
    sessionName: string,
    notebookPath: string,
    cwd: string,
    notebook: Notebook,
    jsonlPath?: string | null,
    notebookDbId?: string,
  ): Promise<{ session: NotebookSession; reconnected: boolean }> {
    // If we are already tracking this session, just return it.
    const existing = this.sessions.get(sessionName);
    if (existing) {
      return { session: existing, reconnected: true };
    }

    const tmux = new TmuxSession(sessionName, cwd);
    const alive = await tmux.isAlive();

    if (!alive) {
      // Session is dead — create a brand new one.
      const newSession = await this.createSession(notebookPath, cwd);
      newSession.notebook = notebook;
      newSession.notebookDbId = notebookDbId;
      return { session: newSession, reconnected: false };
    }

    // Session is alive — reconnect.
    const gitManager = new GitManager(cwd);
    await gitManager.ensureRepo();

    const session: NotebookSession = {
      id: sessionName,
      tmux,
      watcher: null,
      notebook,
      gitManager,
      notebookPath,
      listeners: new Set(),
      notebookDbId,
      _execStartTimes: new Map(),
      _completionTimer: null,
    };

    // Try to set up the JSONL watcher.
    const resolvedJsonlPath = jsonlPath ?? (await tmux.getSessionId());
    if (resolvedJsonlPath) {
      const watcher = new JsonlWatcher(
        resolvedJsonlPath,
        (raw: unknown) => this.handleJsonlMessage(session, raw),
        (err: Error) => {
          console.error(`[session ${sessionName}] JSONL watcher error:`, err.message);
          this.broadcast(session, {
            type: 'error',
            message: `JSONL watcher error: ${err.message}`,
          });
        },
      );
      watcher.start();
      session.watcher = watcher;
    }

    this.sessions.set(sessionName, session);
    console.log(`[session] Reconnected to session "${sessionName}"`);
    return { session, reconnected: true };
  }

  // ── Listener management ──────────────────────────────────────────────────

  addListener(
    sessionId: string,
    listener: (msg: WSServerMessage) => void,
  ): (() => void) | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    session.listeners.add(listener);
    return () => session.listeners.delete(listener);
  }

  /**
   * Broadcasts a message to all listeners of a given session (by ID).
   */
  broadcastToSession(sessionId: string, msg: WSServerMessage): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    this.broadcast(session, msg);
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private broadcast(session: NotebookSession, msg: WSServerMessage): void {
    for (const listener of session.listeners) {
      try {
        listener(msg);
      } catch (err) {
        console.error('[session] Listener error:', err);
      }
    }
  }

  /**
   * Resets (or starts) the idle completion timer for a running cell.
   * If no new JSONL activity arrives within the timeout, the cell is
   * marked as completed.  This handles Claude Code's interactive mode
   * where simple responses do NOT produce a 'result' JSONL message.
   */
  private resetCompletionTimer(session: NotebookSession, cellId: string): void {
    if (session._completionTimer) clearTimeout(session._completionTimer);
    session._completionTimer = setTimeout(() => {
      session._completionTimer = null;
      this.completeCell(session, cellId, false);
    }, 5_000);
  }

  /**
   * Marks a cell as completed (or error), broadcasts execution_complete,
   * and kicks off a best-effort git commit.  No-ops if the cell is no
   * longer running (guards against double-completion).
   */
  private completeCell(session: NotebookSession, cellId: string, isError: boolean): void {
    // Clear any pending idle timer.
    if (session._completionTimer) {
      clearTimeout(session._completionTimer);
      session._completionTimer = null;
    }

    // Guard: only complete if the cell is still running.
    const cell = session.notebook.cells.find((c) => c.id === cellId);
    if (!cell || cell.status !== 'running') return;

    const status = isError ? 'error' as const : 'completed' as const;
    session.notebook = updateCellStatus(session.notebook, cellId, status);

    const startMs = session._execStartTimes.get(cellId);
    const duration_ms = startMs ? Date.now() - startMs : 0;
    session._execStartTimes.delete(cellId);
    session.notebook = updateCellDuration(session.notebook, cellId, duration_ms);

    this.broadcast(session, {
      type: 'execution_complete',
      cell_id: cellId,
      duration_ms,
    });

    console.log(
      `[session ${session.id}] Cell "${cellId}" ${status} (${duration_ms}ms)`,
    );

    // Best-effort git commit.
    this.tryGitCommit(session, cellId).catch(() => {});

    // Auto-save notebook to disk after cell completes.
    this.autoSave(session).catch((err) => {
      console.error(`[session ${session.id}] auto-save failed:`, err);
    });
  }

  /** Best-effort auto-save: writes the in-memory notebook to disk and syncs DB metadata. */
  private async autoSave(session: NotebookSession): Promise<void> {
    const { writeFile } = await import('fs/promises');
    await writeFile(session.notebookPath, JSON.stringify(session.notebook, null, 2), 'utf-8');
    if (session.notebookDbId) {
      this.onAutoSave?.(session.notebookDbId, session.notebook.cells.length);
    }
  }

  /** Best-effort git commit after a cell execution completes. */
  private async tryGitCommit(session: NotebookSession, cellId: string): Promise<void> {
    const cell = session.notebook.cells.find((c) => c.id === cellId);
    const source = cell?.source ?? '';
    try {
      const gitResult = await session.gitManager.commitCellExecution(cellId, source);
      if (gitResult) {
        session.notebook = updateCellGitDiff(session.notebook, cellId, gitResult.diff);
        this.broadcast(session, {
          type: 'git_diff',
          cell_id: cellId,
          diff: gitResult.diff,
          files_changed: gitResult.filesChanged,
        });
        console.log(
          `[session ${session.id}] Committed cell "${cellId}" – ${gitResult.filesChanged.length} file(s) changed.`,
        );
      }
    } catch (err: unknown) {
      console.warn(
        `[session ${session.id}] Git commit failed for cell "${cellId}":`,
        String(err),
      );
    }
  }

  /**
   * Converts a raw JSONL message from Claude Code into one or more
   * WSServerMessage events and broadcasts them to listeners.
   *
   * Claude Code's JSONL format:
   *   - type "assistant" carries content blocks (text, thinking, tool_use)
   *   - type "result"    carries the final result text + is_error flag
   *   - type "tool_result" carries the output of a tool invocation
   */
  private handleJsonlMessage(session: NotebookSession, raw: unknown): void {
    const msg = raw as ClaudeJsonlMessage;

    switch (msg.type) {
      case 'assistant': {
        const assistant = msg as ClaudeTextMessage;

        // We need a cell ID to associate the output with.  Without an explicit
        // mapping we use the session's most recently "running" cell.
        const cellId = findRunningCellId(session.notebook);
        if (!cellId) break;

        for (const block of assistant.message.content) {
          let output: CellOutput | null = null;

          if (block.type === 'text') {
            output = {
              type: 'text',
              content: block.text,
              timestamp: new Date().toISOString(),
            };
          } else if (block.type === 'thinking') {
            output = {
              type: 'thinking',
              content: block.thinking,
              timestamp: new Date().toISOString(),
            };
          } else if (block.type === 'tool_use') {
            output = {
              type: 'tool_use',
              name: block.name,
              input: block.input,
              timestamp: new Date().toISOString(),
            };
          }

          if (output) {
            // Append the output to the in-memory notebook cell.
            session.notebook = appendCellOutput(session.notebook, cellId, output);

            this.broadcast(session, {
              type: 'cell_output',
              cell_id: cellId,
              output,
            });
          }
        }

        // Start/reset the idle completion timer.  In interactive mode,
        // Claude Code does NOT always emit a 'result' JSONL message after
        // simple responses.  We detect completion by watching for a period
        // of inactivity after the last 'assistant' message.
        this.resetCompletionTimer(session, cellId);
        break;
      }

      case 'result': {
        const result = msg as ClaudeResultMessage;
        const cellId = findRunningCellId(session.notebook);
        if (!cellId) break;

        if (result.is_error && result.result) {
          const output: CellOutput = {
            type: 'error',
            message: result.result,
            timestamp: new Date().toISOString(),
          };
          session.notebook = appendCellOutput(session.notebook, cellId, output);
          this.broadcast(session, {
            type: 'cell_output',
            cell_id: cellId,
            output,
          });
        } else if (result.result) {
          const output: CellOutput = {
            type: 'text',
            content: result.result,
            timestamp: new Date().toISOString(),
          };
          session.notebook = appendCellOutput(session.notebook, cellId, output);
          this.broadcast(session, {
            type: 'cell_output',
            cell_id: cellId,
            output,
          });
        }

        // 'result' is the definitive completion signal — complete immediately.
        this.completeCell(session, cellId, result.is_error);
        break;
      }

      case 'tool_result': {
        const toolResult = msg as ClaudeToolResultMessage;
        const cellId = findRunningCellId(session.notebook);
        if (!cellId) break;

        // Find the matching tool_use output to attach the result.
        session.notebook = attachToolResult(
          session.notebook,
          cellId,
          toolResult.tool_use_id,
          toolResult.content,
        );
        break;
      }

      default:
        // Unknown or unhandled message type – silently ignore.
        break;
    }
  }
}

// ── Notebook mutation helpers (pure functions) ───────────────────────────────

function updateCellStatus(
  notebook: Notebook,
  cellId: string,
  status: 'idle' | 'running' | 'completed' | 'error',
): Notebook {
  return {
    ...notebook,
    cells: notebook.cells.map((cell) =>
      cell.id === cellId ? { ...cell, status } : cell,
    ),
  };
}

function updateCellDuration(
  notebook: Notebook,
  cellId: string,
  duration_ms: number,
): Notebook {
  return {
    ...notebook,
    cells: notebook.cells.map((cell) =>
      cell.id === cellId && cell.type === 'prompt'
        ? { ...cell, duration_ms }
        : cell,
    ),
  };
}

function updateCellGitDiff(
  notebook: Notebook,
  cellId: string,
  git_diff: string,
): Notebook {
  return {
    ...notebook,
    cells: notebook.cells.map((cell) =>
      cell.id === cellId && cell.type === 'prompt'
        ? { ...cell, git_diff }
        : cell,
    ),
  };
}

function appendCellOutput(
  notebook: Notebook,
  cellId: string,
  output: CellOutput,
): Notebook {
  return {
    ...notebook,
    cells: notebook.cells.map((cell) => {
      if (cell.id !== cellId || cell.type !== 'prompt') return cell;
      return {
        ...cell,
        outputs: [...cell.outputs, output],
      };
    }),
  };
}

/**
 * Attaches the tool result string to the matching tool_use output block
 * identified by its tool_use_id.  This mutates the in-memory notebook only.
 */
function attachToolResult(
  notebook: Notebook,
  cellId: string,
  toolUseId: string,
  result: string,
): Notebook {
  return {
    ...notebook,
    cells: notebook.cells.map((cell) => {
      if (cell.id !== cellId || cell.type !== 'prompt') return cell;
      return {
        ...cell,
        outputs: cell.outputs.map((out) => {
          if (out.type !== 'tool_use') return out;
          // Match by tool_use_id stored in the 'input' record if present,
          // or fall back to the first unresolved tool_use without a result.
          const hasId =
            typeof out.input['id'] === 'string' &&
            out.input['id'] === toolUseId;
          const isUnresolved = out.result === undefined;
          if (hasId || isUnresolved) {
            return { ...out, result };
          }
          return out;
        }),
      };
    }),
  };
}

/** Returns the cell ID of the first cell that is currently 'running'. */
function findRunningCellId(notebook: Notebook): string | null {
  const running = notebook.cells.find((c) => c.status === 'running');
  return running ? running.id : null;
}
