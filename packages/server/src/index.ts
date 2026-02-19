import express, { type Request, type Response } from 'express';
import { WebSocketServer, type WebSocket } from 'ws';
import http from 'http';
import crypto from 'crypto';
import path from 'path';
import {
  WSClientMessageSchema,
  NotebookSchema,
  type Notebook,
  type NotebookListItem,
} from '@notebook-ai/shared';
import { SessionManager } from './session.js';
import { NotebookStore } from './notebook-store.js';
import { NotebookDb } from './db.js';
import {
  titleToSlug,
  uniqueSlug,
  ensureWorkspaceDir,
  getNotebookFilePath,
} from './workspace.js';
import { exportToHtml, exportToFolder } from './export.js';
import { generateSlice } from './slice-generator.js';
import { authMiddleware, authEnabled, handleLogin, handleAuthStatus } from './auth.js';
import { listWorkspaceFiles, validateWorkspacePath } from './workspace-files.js';
import multer from 'multer';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { rm, copyFile, unlink, stat, mkdir, readFile, writeFile } from 'fs/promises';
import { createReadStream } from 'fs';
import { spawn } from 'child_process';

const execAsync = promisify(exec);

// ── App setup ────────────────────────────────────────────────────────────────

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json());

// CORS middleware for development.
const ALLOWED_ORIGINS = new Set([
  'https://localhost:3000',
  'http://localhost:3000',
  'https://127.0.0.1:3000',
  'http://127.0.0.1:3000',
]);

app.use((req, res, next) => {
  const origin = req.headers['origin'] ?? '';
  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
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
const db = new NotebookDb();

// Wire auto-save: when a cell completes, sync cell_count + updated_at to DB.
sessionManager.onAutoSave = (notebookDbId, cellCount) => {
  db.updateNotebook(notebookDbId, {
    cell_count: cellCount,
    updated_at: new Date().toISOString(),
  });
};

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

// ── REST: Notebook History (DB-backed) ───────────────────────────────────

/**
 * GET /api/notebooks/list
 * Returns all notebooks from the DB, ordered by updated_at DESC.
 */
app.get('/api/notebooks/list', (_req: Request, res: Response) => {
  try {
    const rows = db.listNotebooks();
    const items: NotebookListItem[] = rows.map((row) => ({
      id: row.id,
      title: row.title,
      slug: row.slug,
      status: row.status,
      cellCount: row.cell_count,
      hasActiveSession: !!db.getActiveSession(row.id),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
    res.json({ notebooks: items });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/**
 * POST /api/notebooks/create
 * Creates a new notebook with an isolated workspace directory and tmux session.
 * Body: { title: string; userId?: string }
 */
app.post('/api/notebooks/create', async (req: Request, res: Response) => {
  const { title, userId } = req.body as { title?: string; userId?: string };

  if (!title || typeof title !== 'string' || !title.trim()) {
    res.status(400).json({ error: '"title" must be a non-empty string.' });
    return;
  }

  try {
    const baseSlug = titleToSlug(title.trim());
    const slug = uniqueSlug(baseSlug, userId);
    const workspaceDir = ensureWorkspaceDir(slug, userId);
    const notebookPath = getNotebookFilePath(workspaceDir, slug);
    const notebookId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Create the notebook in the DB.
    db.createNotebook({
      id: notebookId,
      user_id: userId ?? null,
      title: title.trim(),
      slug,
      workspace_dir: workspaceDir,
      notebook_path: notebookPath,
      status: 'active',
      created_at: now,
      updated_at: now,
    });

    // Create a blank notebook and persist it to disk.
    const notebook = notebookStore.createNew(title.trim(), workspaceDir);
    await notebookStore.save(notebookPath, notebook);

    // Create a tmux session.
    const session = await sessionManager.createSession(notebookPath, workspaceDir);
    session.notebook = notebook;
    session.notebookDbId = notebookId;

    // Record the session in the DB.
    db.createSessionRecord({
      id: session.id,
      notebook_id: notebookId,
      tmux_session: session.id,
      jsonl_path: null,
      cwd: workspaceDir,
      status: 'active',
      created_at: now,
    });

    res.status(201).json({
      notebook,
      notebookId,
      sessionId: session.id,
      slug,
      workspaceDir,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/**
 * POST /api/notebooks/:notebookId/restore
 * Restores a notebook from the DB: loads .notebook.json, reconnects or creates a Claude session.
 */
app.post('/api/notebooks/:notebookId/restore', async (req: Request, res: Response) => {
  const { notebookId } = req.params as { notebookId: string };

  try {
    const row = db.getNotebook(notebookId);
    if (!row) {
      res.status(404).json({ error: `Notebook "${notebookId}" not found.` });
      return;
    }

    // Load the notebook from disk.
    let notebook: Notebook;
    try {
      notebook = await notebookStore.load(row.notebook_path);
    } catch {
      // If file is missing, create a fresh one.
      notebook = notebookStore.createNew(row.title, row.workspace_dir);
      await notebookStore.save(row.notebook_path, notebook);
    }

    // Check for an active session in the DB.
    const activeSessionRow = db.getActiveSession(notebookId);
    const sessionName = activeSessionRow?.tmux_session;

    let sessionId: string;
    let reconnected = false;

    if (sessionName) {
      // Try to reconnect to the existing tmux session.
      const result = await sessionManager.reconnectSession(
        sessionName,
        row.notebook_path,
        row.workspace_dir,
        notebook,
        activeSessionRow?.jsonl_path,
        notebookId,
      );
      sessionId = result.session.id;
      reconnected = result.reconnected;

      if (!reconnected) {
        // Old session died; close it in DB and record the new one.
        db.closeSessionRecord(activeSessionRow!.id);
        db.createSessionRecord({
          id: result.session.id,
          notebook_id: notebookId,
          tmux_session: result.session.id,
          jsonl_path: null,
          cwd: row.workspace_dir,
          status: 'active',
          created_at: new Date().toISOString(),
        });
      }
    } else {
      // No active session — create one.
      const session = await sessionManager.createSession(row.notebook_path, row.workspace_dir);
      session.notebook = notebook;
      session.notebookDbId = notebookId;
      sessionId = session.id;

      db.createSessionRecord({
        id: session.id,
        notebook_id: notebookId,
        tmux_session: session.id,
        jsonl_path: null,
        cwd: row.workspace_dir,
        status: 'active',
        created_at: new Date().toISOString(),
      });
    }

    // Update the notebook's updated_at.
    db.updateNotebook(notebookId, { updated_at: new Date().toISOString() });

    res.json({
      notebook,
      sessionId,
      reconnected,
      notebookId,
      workspaceDir: row.workspace_dir,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/**
 * PATCH /api/notebooks/:notebookId
 * Updates notebook metadata (title, etc.). When title changes, renames the
 * .notebook.json file on disk to match the new slug.
 */
app.patch('/api/notebooks/:notebookId', async (req: Request, res: Response) => {
  const { notebookId } = req.params as { notebookId: string };
  const { title } = req.body as { title?: string };

  try {
    const row = db.getNotebook(notebookId);
    if (!row) {
      res.status(404).json({ error: `Notebook "${notebookId}" not found.` });
      return;
    }

    const updates: Partial<{ title: string; notebook_path: string }> = {};

    if (typeof title === 'string' && title.trim()) {
      updates.title = title.trim();

      // Rename the .notebook.json file to match the new title slug.
      const newSlug = titleToSlug(title.trim());
      const newNotebookPath = path.join(row.workspace_dir, `${newSlug}.notebook.json`);

      if (newNotebookPath !== row.notebook_path) {
        try {
          const { rename } = await import('fs/promises');
          await rename(row.notebook_path, newNotebookPath);
          updates.notebook_path = newNotebookPath;

          // Keep any active in-memory session in sync.
          const activeSessionRow = db.getActiveSession(notebookId);
          if (activeSessionRow) {
            const session = sessionManager.getSession(activeSessionRow.tmux_session);
            if (session) session.notebookPath = newNotebookPath;
          }
        } catch (err) {
          // File may already exist at the new path or source missing — skip rename.
          console.warn('[PATCH] Could not rename notebook file:', err);
        }
      }
    }

    const updated = db.updateNotebook(notebookId, updates);
    res.json({ notebook: updated });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/**
 * DELETE /api/notebooks/:notebookId
 * Closes the active session, deletes the workspace directory, and removes the
 * notebook + its session records from the DB.
 */
app.delete('/api/notebooks/:notebookId', async (req: Request, res: Response) => {
  const { notebookId } = req.params as { notebookId: string };

  try {
    const row = db.getNotebook(notebookId);
    if (!row) {
      res.status(404).json({ error: `Notebook "${notebookId}" not found.` });
      return;
    }

    // Close any in-memory Claude session.
    const activeSession = db.getActiveSession(notebookId);
    if (activeSession) {
      await sessionManager.closeSession(activeSession.tmux_session);
    }

    // Delete the workspace directory from disk.
    await rm(row.workspace_dir, { recursive: true, force: true });

    // Hard-delete notebook + sessions from DB.
    db.deleteNotebook(notebookId);

    res.status(204).send();
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
    // Close matching DB session record.
    try { db.closeSessionRecord(id); } catch { /* best effort */ }
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/**
 * POST /api/notebooks/:notebookId/import-content
 * Replaces the session's in-memory notebook with the supplied JSON body and
 * persists it to disk.  Used by the "Import .notebook.json" flow in the UI.
 */
app.post('/api/notebooks/:notebookId/import-content', async (req: Request, res: Response) => {
  const { notebookId } = req.params as { notebookId: string };
  const parseResult = NotebookSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'Invalid notebook format.' });
    return;
  }
  const notebook = parseResult.data;

  try {
    const row = db.getNotebook(notebookId);
    if (!row) {
      res.status(404).json({ error: `Notebook "${notebookId}" not found.` });
      return;
    }

    // Save imported notebook to disk.
    await notebookStore.save(row.notebook_path, notebook);

    // Update the active in-memory session so subsequent auto-saves use the imported content.
    const activeSessionRow = db.getActiveSession(notebookId);
    if (activeSessionRow) {
      const session = sessionManager.getSession(activeSessionRow.tmux_session);
      if (session) session.notebook = notebook;
    }

    db.updateNotebook(notebookId, {
      cell_count: notebook.cells.length,
      updated_at: new Date().toISOString(),
    });

    res.json({ ok: true });
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

// ── REST: Workspace file management ──────────────────────────────────────────

const upload = multer({
  dest: path.join(os.tmpdir(), 'nb-uploads'),
  limits: { fileSize: 100 * 1024 * 1024, files: 20 },
});

/**
 * POST /api/notebooks/extract-zip
 * Accepts an exported .zip bundle, extracts data/notebook.json from it,
 * and returns the notebook JSON.  Used by the Import flow to support
 * importing the zip produced by the Export button.
 */
app.post('/api/notebooks/extract-zip', upload.single('file'), async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: 'No file uploaded.' });
    return;
  }

  const tmpDir = path.join(os.tmpdir(), `nb-extract-${Date.now()}`);
  try {
    await mkdir(tmpDir, { recursive: true });
    await execAsync(`unzip -q "${file.path}" -d "${tmpDir}"`);

    // The zip contains <slug>/data/notebook.json — find it regardless of slug.
    const { stdout } = await execAsync(
      `find "${tmpDir}" -name "notebook.json" -path "*/data/notebook.json"`,
    );
    const jsonPath = stdout.trim();
    if (!jsonPath) {
      res.status(422).json({ error: 'No data/notebook.json found in the zip.' });
      return;
    }

    const content = await readFile(jsonPath, 'utf-8');
    const notebook = JSON.parse(content) as Notebook;
    res.json(notebook);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    await rm(file.path, { force: true }).catch(() => {});
  }
});

/**
 * GET /api/notebooks/:sessionId/files?path=<subpath>
 * Lists files in the workspace directory (or a subdirectory).
 */
app.get('/api/notebooks/:sessionId/files', async (req: Request, res: Response) => {
  const { sessionId } = req.params as { sessionId: string };
  const subPath = typeof req.query['path'] === 'string' ? req.query['path'] : '.';

  const session = sessionManager.getSession(sessionId);
  if (!session) {
    res.status(404).json({ error: `Session "${sessionId}" not found.` });
    return;
  }

  try {
    const result = await listWorkspaceFiles(session.cwd, subPath);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

/**
 * POST /api/notebooks/:sessionId/files
 * Uploads one or more files into the workspace (multipart/form-data, field "files").
 */
app.post(
  '/api/notebooks/:sessionId/files',
  upload.array('files', 20),
  async (req: Request, res: Response) => {
    const { sessionId } = req.params as { sessionId: string };
    const subPath = typeof req.query['path'] === 'string' ? req.query['path'] : '.';

    const session = sessionManager.getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: `Session "${sessionId}" not found.` });
      return;
    }

    const uploaded = req.files as Express.Multer.File[] | undefined;
    if (!uploaded || uploaded.length === 0) {
      res.status(400).json({ error: 'No files provided.' });
      return;
    }

    const results: string[] = [];
    try {
      for (const file of uploaded) {
        const destPath = await validateWorkspacePath(
          path.join(subPath, path.basename(file.originalname)),
          session.cwd,
        );
        await copyFile(file.path, destPath);
        await unlink(file.path).catch(() => {});
        results.push(path.basename(file.originalname));
      }
      res.json({ uploaded: results });
    } catch (err) {
      // Clean up any remaining temp files
      for (const file of uploaded) {
        await unlink(file.path).catch(() => {});
      }
      res.status(400).json({ error: String(err) });
    }
  },
);

/**
 * GET /api/notebooks/:sessionId/files/download?path=<relative-path>
 * Streams a single file from the workspace as a download.
 */
app.get('/api/notebooks/:sessionId/files/download', async (req: Request, res: Response) => {
  const { sessionId } = req.params as { sessionId: string };
  const filePath = typeof req.query['path'] === 'string' ? req.query['path'] : '';

  const session = sessionManager.getSession(sessionId);
  if (!session) {
    res.status(404).json({ error: `Session "${sessionId}" not found.` });
    return;
  }

  try {
    const resolved = await validateWorkspacePath(filePath, session.cwd);
    const fileStat = await stat(resolved);
    if (fileStat.isDirectory()) {
      res.status(400).json({ error: 'Cannot download a directory. Use workspace-zip instead.' });
      return;
    }
    const filename = path.basename(resolved);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('Content-Length', fileStat.size);
    createReadStream(resolved).pipe(res);
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

/**
 * GET /api/notebooks/:sessionId/files/zip
 * Streams the entire workspace as a tar.gz archive.
 */
app.get('/api/notebooks/:sessionId/files/zip', (req: Request, res: Response) => {
  const { sessionId } = req.params as { sessionId: string };

  const session = sessionManager.getSession(sessionId);
  if (!session) {
    res.status(404).json({ error: `Session "${sessionId}" not found.` });
    return;
  }

  const slug = path.basename(session.cwd);
  res.setHeader('Content-Type', 'application/gzip');
  res.setHeader('Content-Disposition', `attachment; filename="${slug}.tar.gz"`);

  const tar = spawn('tar', ['czf', '-', '-C', session.cwd, '.']);
  tar.stdout.pipe(res);
  tar.stderr.on('data', (d: Buffer) => console.error('[tar]', d.toString()));
  tar.on('error', (err) => {
    if (!res.headersSent) res.status(500).json({ error: String(err) });
  });
});

/**
 * POST /api/notebooks/:sessionId/files/new-file?path=<subpath>&name=<filename>
 * Creates an empty file in the workspace.
 */
app.post('/api/notebooks/:sessionId/files/new-file', async (req: Request, res: Response) => {
  const { sessionId } = req.params as { sessionId: string };
  const subPath = typeof req.query['path'] === 'string' ? req.query['path'] : '.';
  const name = (typeof req.query['name'] === 'string' ? req.query['name'] : '').trim();

  if (!name || name.includes('/') || name === '.' || name === '..') {
    res.status(400).json({ error: 'Invalid file name.' });
    return;
  }

  const session = sessionManager.getSession(sessionId);
  if (!session) { res.status(404).json({ error: `Session "${sessionId}" not found.` }); return; }

  try {
    const targetPath = await validateWorkspacePath(path.join(subPath, name), session.cwd);
    await writeFile(targetPath, '', { flag: 'wx' });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

/**
 * POST /api/notebooks/:sessionId/files/mkdir?path=<subpath>&name=<dirname>
 * Creates a new directory in the workspace.
 */
app.post('/api/notebooks/:sessionId/files/mkdir', async (req: Request, res: Response) => {
  const { sessionId } = req.params as { sessionId: string };
  const subPath = typeof req.query['path'] === 'string' ? req.query['path'] : '.';
  const name = (typeof req.query['name'] === 'string' ? req.query['name'] : '').trim();

  if (!name || name.includes('/') || name === '.' || name === '..') {
    res.status(400).json({ error: 'Invalid directory name.' });
    return;
  }

  const session = sessionManager.getSession(sessionId);
  if (!session) { res.status(404).json({ error: `Session "${sessionId}" not found.` }); return; }

  try {
    const targetPath = await validateWorkspacePath(path.join(subPath, name), session.cwd);
    await mkdir(targetPath);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

/**
 * DELETE /api/notebooks/:sessionId/files?path=<relative-path>
 * Deletes a file or directory (recursively) from the workspace.
 */
app.delete('/api/notebooks/:sessionId/files', async (req: Request, res: Response) => {
  const { sessionId } = req.params as { sessionId: string };
  const filePath = typeof req.query['path'] === 'string' ? req.query['path'] : '';

  if (!filePath || filePath === '.') {
    res.status(400).json({ error: 'Cannot delete workspace root.' });
    return;
  }

  const session = sessionManager.getSession(sessionId);
  if (!session) { res.status(404).json({ error: `Session "${sessionId}" not found.` }); return; }

  try {
    const resolved = await validateWorkspacePath(filePath, session.cwd);
    await rm(resolved, { recursive: true, force: false });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

// ── WebSocket routing ────────────────────────────────────────────────────────

// Global: session_id → the one WS connection allowed to subscribe to it.
// Enforces "one Tab per notebook" — different WS connections cannot subscribe
// to the same session. The same WS connection can subscribe to multiple sessions
// (split-screen within a single Tab).
const sessionOwners = new Map<string, WebSocket>();

wss.on('connection', (ws: WebSocket, req) => {
  // Only token for auth — no sessionId in URL (clients subscribe via messages)
  const url = new URL(req.url ?? '/', `http://localhost`);
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
  console.log(`[ws] Client ${clientId} connected`);

  // Per-connection subscription map: sessionId → removeListener
  const subscriptions = new Map<string, () => void>();

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
      case 'subscribe': {
        const { session_id } = msg;
        if (subscriptions.has(session_id)) break; // This connection already subscribed

        // Reject if a *different* WS connection already owns this session.
        const owner = sessionOwners.get(session_id);
        if (owner && owner !== ws) {
          sendToClient(ws, { type: 'session_already_open', session_id });
          break;
        }

        const session = sessionManager.getSession(session_id);
        if (!session) {
          sendToClient(ws, {
            type: 'error',
            session_id,
            message: `Session "${session_id}" not found.`,
          });
          break;
        }
        const remove = sessionManager.addListener(session_id, (event) => {
          sendToClient(ws, event);
        });
        if (remove) {
          subscriptions.set(session_id, remove);
          sessionOwners.set(session_id, ws);
          console.log(`[ws] Client ${clientId} subscribed to session ${session_id}`);
        }
        break;
      }

      case 'unsubscribe': {
        const { session_id } = msg;
        const remove = subscriptions.get(session_id);
        if (remove) {
          remove();
          subscriptions.delete(session_id);
          if (sessionOwners.get(session_id) === ws) sessionOwners.delete(session_id);
          console.log(`[ws] Client ${clientId} unsubscribed from session ${session_id}`);
        }
        break;
      }

      case 'execute_request': {
        const { session_id, cell_id, source } = msg;
        try {
          await sessionManager.executeCell(session_id, cell_id, source);
        } catch (err) {
          sendToClient(ws, {
            type: 'error',
            session_id,
            message: String(err),
            cell_id,
          });
        }
        break;
      }

      case 'save_notebook': {
        const { session_id } = msg;
        const session = sessionManager.getSession(session_id);
        if (!session) {
          sendToClient(ws, { type: 'error', session_id, message: `Session "${session_id}" not found.` });
          break;
        }
        try {
          // Validate path is within the session workspace to prevent arbitrary file writes.
          const safePath = await validateWorkspacePath(msg.path, session.cwd).catch(() => null);
          if (!safePath) {
            sendToClient(ws, { type: 'error', session_id, message: 'Save path is outside the workspace.' });
            break;
          }
          await notebookStore.save(safePath, session.notebook);
          console.log(`[ws] Notebook saved to "${safePath}"`);
          if (session.notebookDbId) {
            db.updateNotebook(session.notebookDbId, {
              cell_count: session.notebook.cells.length,
              updated_at: new Date().toISOString(),
            });
          }
        } catch (err) {
          sendToClient(ws, { type: 'error', session_id, message: String(err) });
        }
        break;
      }

      case 'load_notebook': {
        const { session_id } = msg;
        let notebook: Notebook;
        try {
          notebook = await notebookStore.load(msg.path);
        } catch (err) {
          sendToClient(ws, { type: 'error', session_id, message: String(err) });
          break;
        }
        const loadSession = sessionManager.getSession(session_id);
        if (loadSession) loadSession.notebook = notebook;
        console.log(`[ws] Notebook loaded from "${msg.path}"`);
        break;
      }

      case 'export_html': {
        const { session_id } = msg;
        const session = sessionManager.getSession(session_id);
        if (!session) {
          sendToClient(ws, {
            type: 'error',
            session_id,
            message: 'No notebook found for this session.',
          });
          break;
        }
        try {
          const html = await exportToHtml(session.notebook, { ...msg.options, minify: false });
          sendToClient(ws, { type: 'export_complete', session_id, html });
        } catch (err) {
          sendToClient(ws, { type: 'error', session_id, message: String(err) });
        }
        break;
      }

      case 'slice_update': {
        const { session_id } = msg;
        const session = sessionManager.getSession(session_id);
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
        break;
      }

      case 'ping': {
        sendToClient(ws, { type: 'pong' });
        break;
      }

      case 'update_cell_source': {
        const { session_id, cell_id, source } = msg;
        const session = sessionManager.getSession(session_id);
        if (session) {
          session.notebook = {
            ...session.notebook,
            cells: session.notebook.cells.map((c) =>
              c.id === cell_id ? { ...c, source } : c,
            ),
          };
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

  function cleanup() {
    for (const [session_id, remove] of subscriptions.entries()) {
      remove();
      if (sessionOwners.get(session_id) === ws) sessionOwners.delete(session_id);
    }
    subscriptions.clear();
  }

  ws.on('close', () => {
    console.log(`[ws] Client ${clientId} disconnected`);
    cleanup();
  });

  ws.on('error', (err) => {
    console.error(`[ws] Client ${clientId} error:`, err.message);
    cleanup();
  });
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function sendToClient(ws: WebSocket, msg: object): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

// ── Startup: import notebooks from disk that have no DB record ────────────────

async function importExistingNotebooks(): Promise<void> {
  const { readdir, readFile } = await import('fs/promises');
  const workspaceRoot = process.env['NB_WORKSPACE_DIR'] ?? path.join(os.homedir(), 'nb-workspaces');

  let slugs: string[];
  try {
    slugs = await readdir(workspaceRoot);
  } catch {
    return; // workspace root doesn't exist yet — nothing to import
  }

  // Build a set of workspace dirs already tracked in the DB.
  const existingDirs = new Set(
    db.listNotebooks().map((r) => r.workspace_dir),
  );

  let imported = 0;
  for (const slug of slugs) {
    const workspaceDir = path.join(workspaceRoot, slug);
    if (existingDirs.has(workspaceDir)) continue;

    const notebookPath = path.join(workspaceDir, `${slug}.notebook.json`);
    let raw: string;
    try {
      raw = await readFile(notebookPath, 'utf-8');
    } catch {
      continue; // not a notebook directory
    }

    try {
      const nb = JSON.parse(raw) as { metadata?: { title?: string; created?: string; updated?: string } };
      const title = nb.metadata?.title ?? 'Untitled Notebook';
      const created = nb.metadata?.created ?? new Date().toISOString();
      const updated = nb.metadata?.updated ?? created;
      const cells: unknown[] = (nb as Record<string, unknown>)['cells'] as unknown[] ?? [];

      const notebookId = crypto.randomUUID();
      db.createNotebook({
        id: notebookId,
        user_id: null,
        title,
        slug,
        workspace_dir: workspaceDir,
        notebook_path: notebookPath,
        status: 'active',
        created_at: created,
        updated_at: updated,
      });
      if (cells.length > 0) {
        db.updateNotebook(notebookId, { cell_count: cells.length });
      }
      imported++;
    } catch (err) {
      console.warn(`[import] Failed to import "${slug}":`, err);
    }
  }

  if (imported > 0) {
    console.log(`[import] Imported ${imported} notebook(s) from disk.`);
  }
}

// ── Start ────────────────────────────────────────────────────────────────────

const PORT = process.env['PORT'] ?? 3002;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  importExistingNotebooks().catch((err) => console.error('[import] Error:', err));
});
