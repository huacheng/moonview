import crypto from 'crypto';
import { TmuxSession } from './tmux.js';
import { JsonlWatcher } from './jsonl-watcher.js';
import { setupHooks, waitForStopMarker } from './hooks.js';
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
  /** Callbacks registered by WebSocket clients for this session. */
  listeners: Set<(msg: WSServerMessage) => void>;
}

// ── SessionManager ───────────────────────────────────────────────────────────

export class SessionManager {
  private sessions = new Map<string, NotebookSession>();

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
        git_repo: false,
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
      listeners: new Set(),
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

    // Update the cell status to 'running'.
    session.notebook = updateCellStatus(session.notebook, cellId, 'running');

    const startMs = Date.now();

    await session.tmux.sendPrompt(source);

    // Wait for the stop marker in the background; emit execution_complete when done.
    waitForStopMarker(session.id)
      .then((completed) => {
        const duration_ms = Date.now() - startMs;

        if (!completed) {
          console.warn(
            `[session ${session.id}] Stop marker timed out for cell "${cellId}".`,
          );
        }

        session.notebook = updateCellStatus(
          session.notebook,
          cellId,
          completed ? 'completed' : 'error',
        );
        session.notebook = updateCellDuration(session.notebook, cellId, duration_ms);

        const completeMsg: WSServerMessage = {
          type: 'execution_complete',
          cell_id: cellId,
          duration_ms,
        };
        this.broadcast(session, completeMsg);
      })
      .catch((err: unknown) => {
        console.error(
          `[session ${session.id}] Error waiting for stop marker:`,
          err,
        );
        this.broadcast(session, {
          type: 'error',
          message: `Execution monitoring error: ${String(err)}`,
          cell_id: cellId,
        });
      });
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
