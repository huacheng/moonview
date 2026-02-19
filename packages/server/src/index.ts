import express, { type Request, type Response } from 'express';
import { WebSocketServer, type WebSocket } from 'ws';
import http from 'http';
import crypto from 'crypto';
import path from 'path';
import {
  WSClientMessageSchema,
  type WSServerMessage,
  type Notebook,
} from '@notebook-ai/shared';
import { SessionManager } from './session.js';
import { NotebookStore } from './notebook-store.js';
import { exportToHtml, exportToFolder } from './export.js';
import { generateSlice } from './slice-generator.js';
import { authMiddleware, authEnabled, handleLogin, handleAuthStatus } from './auth.js';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { rm } from 'fs/promises';

const execAsync = promisify(exec);

// ── App setup ────────────────────────────────────────────────────────────────

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json());

// CORS middleware for development.
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  next();
});

// Handle pre-flight OPTIONS requests.
app.options('/{*path}', (_req, res) => {
  res.sendStatus(204);
});

// ── Auth ──────────────────────────────────────────────────────────────────────

app.post('/api/auth/login', handleLogin);
app.get('/api/auth/status', handleAuthStatus);

// Auth middleware — protects all routes below this point.
app.use(authMiddleware);

// ── Singletons ───────────────────────────────────────────────────────────────

const sessionManager = new SessionManager();
const notebookStore = new NotebookStore();

// ── REST: Health ─────────────────────────────────────────────────────────────

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// ── REST: Notebooks ──────────────────────────────────────────────────────────

/**
 * GET /api/notebooks?dir=<directory>
 * Lists all .notebook.json files in the given directory.
 */
app.get('/api/notebooks', async (req: Request, res: Response) => {
  const dir = typeof req.query['dir'] === 'string' ? req.query['dir'] : undefined;
  if (!dir) {
    res.status(400).json({ error: 'Query parameter "dir" is required.' });
    return;
  }

  try {
    const notebooks = await notebookStore.list(dir);
    res.json({ notebooks });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/**
 * POST /api/notebooks
 * Body: { title: string; cwd: string; filePath?: string }
 * Creates a new notebook and optionally persists it to disk.
 */
app.post('/api/notebooks', async (req: Request, res: Response) => {
  const { title, cwd, filePath } = req.body as {
    title?: unknown;
    cwd?: unknown;
    filePath?: unknown;
  };

  if (typeof title !== 'string' || !title.trim()) {
    res.status(400).json({ error: '"title" must be a non-empty string.' });
    return;
  }
  if (typeof cwd !== 'string' || !cwd.trim()) {
    res.status(400).json({ error: '"cwd" must be a non-empty string.' });
    return;
  }

  try {
    const notebook = notebookStore.createNew(title.trim(), cwd.trim());

    let savedPath: string | undefined;
    if (typeof filePath === 'string' && filePath.trim()) {
      savedPath = filePath.trim();
    } else {
      savedPath = path.join(cwd.trim(), NotebookStore.titleToFilename(title.trim()));
    }

    await notebookStore.save(savedPath, notebook);
    res.status(201).json({ notebook, path: savedPath });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── REST: Sessions ───────────────────────────────────────────────────────────

/**
 * POST /api/sessions
 * Body: { notebookPath: string; cwd: string }
 * Creates a new tmux session running Claude Code.
 */
app.post('/api/sessions', async (req: Request, res: Response) => {
  const { notebookPath, cwd } = req.body as {
    notebookPath?: unknown;
    cwd?: unknown;
  };

  if (typeof notebookPath !== 'string' || !notebookPath.trim()) {
    res.status(400).json({ error: '"notebookPath" must be a non-empty string.' });
    return;
  }
  if (typeof cwd !== 'string' || !cwd.trim()) {
    res.status(400).json({ error: '"cwd" must be a non-empty string.' });
    return;
  }

  try {
    const session = await sessionManager.createSession(
      notebookPath.trim(),
      cwd.trim(),
    );
    res.status(201).json({ sessionId: session.id });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/**
 * DELETE /api/sessions/:id
 * Terminates the tmux session and cleans up resources.
 */
app.delete('/api/sessions/:id', async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };

  try {
    await sessionManager.closeSession(id);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── REST: Slice generation ────────────────────────────────────────────────────

/**
 * POST /api/notebooks/:sessionId/generate-slice
 * Generates slice sections from the session's notebook, updates the notebook's
 * slice field, broadcasts the update to WebSocket listeners, and returns the
 * generated sections.
 */
app.post('/api/notebooks/:sessionId/generate-slice', (_req: Request, res: Response) => {
  const { sessionId } = _req.params as { sessionId: string };

  const session = sessionManager.getSession(sessionId);
  if (!session) {
    res.status(404).json({ error: `Session "${sessionId}" not found.` });
    return;
  }

  try {
    const sections = generateSlice(session.notebook);

    // Update the in-memory notebook's slice field
    session.notebook = {
      ...session.notebook,
      slice: {
        generated: true,
        sections,
        updated_at: new Date().toISOString(),
      },
    };

    // Broadcast slice_update to all WebSocket listeners for this session
    sessionManager.broadcastToSession(sessionId, {
      type: 'slice_update',
      sections,
    });

    res.json({ sections });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── REST: Export as folder (zip download) ────────────────────────────────────

/**
 * GET /api/notebooks/:sessionId/export-zip
 * Exports the notebook as a folder bundle, zips it, and streams the zip.
 */
app.get('/api/notebooks/:sessionId/export-zip', async (req: Request, res: Response) => {
  const { sessionId } = req.params as { sessionId: string };

  const session = sessionManager.getSession(sessionId);
  if (!session) {
    res.status(404).json({ error: `Session "${sessionId}" not found.` });
    return;
  }

  const tmpBase = path.join(os.tmpdir(), `notebook-export-${Date.now()}`);

  try {
    const bundle = await exportToFolder(session.notebook, tmpBase);
    const zipPath = `${bundle.dir}.zip`;

    // Create zip (-r recursive, -j junk paths → NO, we want the folder structure)
    await execAsync(`cd "${tmpBase}" && zip -r "${zipPath}" "${path.basename(bundle.dir)}"`);

    const zipFilename = `${path.basename(bundle.dir)}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);
    res.sendFile(zipPath, async () => {
      // Cleanup temp files
      await rm(tmpBase, { recursive: true, force: true }).catch(() => {});
      await rm(zipPath, { force: true }).catch(() => {});
    });
  } catch (err) {
    await rm(tmpBase, { recursive: true, force: true }).catch(() => {});
    res.status(500).json({ error: String(err) });
  }
});

// ── WebSocket routing ────────────────────────────────────────────────────────

wss.on('connection', (ws: WebSocket, req) => {
  // Extract session ID and auth token from the URL query string
  const url = new URL(req.url ?? '/', `http://localhost`);
  const sessionId = url.searchParams.get('sessionId') ?? undefined;
  const token = url.searchParams.get('token') ?? undefined;

  // Validate auth token for WebSocket connections
  if (authEnabled) {
    const NB_AUTH_TOKEN = process.env['NB_AUTH_TOKEN'] ?? '';
    if (!token || token !== NB_AUTH_TOKEN) {
      sendToClient(ws, { type: 'error', message: 'Unauthorized.' });
      ws.close(4001, 'Unauthorized');
      return;
    }
  }

  const clientId = crypto.randomUUID();
  console.log(`[ws] Client ${clientId} connected${sessionId ? ` (session: ${sessionId})` : ''}`);

  // Notify client if the requested session is unknown.
  if (sessionId) {
    const session = sessionManager.getSession(sessionId);
    if (!session) {
      sendToClient(ws, {
        type: 'error',
        message: `Session "${sessionId}" not found.`,
      });
    }
  }

  // Register a listener that forwards session events to this WebSocket client.
  let removeListener: (() => void) | null = null;
  if (sessionId) {
    removeListener = sessionManager.addListener(sessionId, (msg) => {
      sendToClient(ws, msg);
    });
  }

  ws.on('message', async (data) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(data.toString());
    } catch {
      sendToClient(ws, { type: 'error', message: 'Invalid JSON.' });
      return;
    }

    const result = WSClientMessageSchema.safeParse(parsed);
    if (!result.success) {
      sendToClient(ws, {
        type: 'error',
        message: `Invalid message: ${result.error.message}`,
      });
      return;
    }

    const msg = result.data;

    switch (msg.type) {
      case 'execute_request': {
        if (!sessionId) {
          sendToClient(ws, {
            type: 'error',
            message: 'No sessionId provided in WebSocket URL.',
          });
          break;
        }
        try {
          await sessionManager.executeCell(sessionId, msg.cell_id, msg.source);
        } catch (err) {
          sendToClient(ws, {
            type: 'error',
            message: String(err),
            cell_id: msg.cell_id,
          });
        }
        break;
      }

      case 'save_notebook': {
        // The client sends the path; the current notebook state lives in the session.
        if (!sessionId) {
          sendToClient(ws, { type: 'error', message: 'No sessionId provided.' });
          break;
        }
        const session = sessionManager.getSession(sessionId);
        if (!session) {
          sendToClient(ws, { type: 'error', message: `Session "${sessionId}" not found.` });
          break;
        }
        try {
          await notebookStore.save(msg.path, session.notebook);
          console.log(`[ws] Notebook saved to "${msg.path}"`);
        } catch (err) {
          sendToClient(ws, { type: 'error', message: String(err) });
        }
        break;
      }

      case 'load_notebook': {
        let notebook: Notebook;
        try {
          notebook = await notebookStore.load(msg.path);
        } catch (err) {
          sendToClient(ws, { type: 'error', message: String(err) });
          break;
        }

        // If there is an active session, update its in-memory notebook.
        if (sessionId) {
          const session = sessionManager.getSession(sessionId);
          if (session) {
            session.notebook = notebook;
          }
        }

        console.log(`[ws] Notebook loaded from "${msg.path}"`);
        // Echo the notebook back as a git_diff message (reusing the channel
        // for structural data) is out of scope here; the client can re-fetch
        // via REST.  We simply ack success silently.
        break;
      }

      case 'export_html': {
        let notebook: Notebook | undefined;
        if (sessionId) {
          const session = sessionManager.getSession(sessionId);
          if (session) {
            notebook = session.notebook;
          }
        }
        if (!notebook) {
          sendToClient(ws, {
            type: 'error',
            message: 'No notebook found for this session.',
          });
          break;
        }
        try {
          const html = await exportToHtml(notebook, { ...msg.options, minify: false });
          sendToClient(ws, { type: 'export_complete', html });
        } catch (err) {
          sendToClient(ws, { type: 'error', message: String(err) });
        }
        break;
      }

      case 'slice_update': {
        // Update the slice on the in-memory notebook for the session.
        if (sessionId) {
          const session = sessionManager.getSession(sessionId);
          if (session) {
            session.notebook = {
              ...session.notebook,
              slice: {
                ...session.notebook.slice,
                sections: msg.sections,
                updated_at: new Date().toISOString(),
              },
            };
          }
        }
        break;
      }

      default: {
        // TypeScript exhaustiveness guard.
        msg satisfies never;
        sendToClient(ws, { type: 'error', message: 'Unknown message type.' });
        break;
      }
    }
  });

  ws.on('close', () => {
    console.log(`[ws] Client ${clientId} disconnected`);
    removeListener?.();
  });

  ws.on('error', (err) => {
    console.error(`[ws] Client ${clientId} error:`, err.message);
    removeListener?.();
  });
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function sendToClient(ws: WebSocket, msg: WSServerMessage): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

// ── Start ────────────────────────────────────────────────────────────────────

const PORT = process.env['PORT'] ?? 3002;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
