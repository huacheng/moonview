import { Router, type IRouter, type Request, type Response } from 'express';
import type { SessionManager } from '../session.js';
import type { NotebookDb } from '../db.js';

export function createSessionsRouter(sessionManager: SessionManager, db: NotebookDb): IRouter {
  const router = Router();

  /**
   * POST /api/sessions
   * Body: { notebookPath: string; cwd: string }
   * Creates a new Claude session.
   */
  router.post('/', async (req: Request, res: Response) => {
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
   * Terminates the session and cleans up resources.
   */
  router.delete('/:id', async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };

    try {
      await sessionManager.closeSession(id);
      try { db.closeSessionRecord(id); } catch { /* best effort */ }
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  return router;
}
