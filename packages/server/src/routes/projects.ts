import { Router, type IRouter } from 'express';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import type { NotebookDb } from '../db.js';
import type { SessionManager } from '../session.js';
import type { NotebookStore } from '../notebook-store.js';
import { GitManager } from '../git.js';

function titleToSlug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'project';
}

export function createProjectsRouter(
  db: NotebookDb,
  sessionManager: SessionManager,
  notebookStore: NotebookStore,
  workspacesRoot: string
): IRouter {
  const router = Router();

  // List projects
  router.get('/', (_req, res) => {
    const projects = db.listProjects();
    res.json(projects);
  });

  // Create project
  router.post('/', async (req, res) => {
    try {
      const { title } = req.body;
      if (!title) return res.status(400).json({ error: 'title required' });

      const slug = titleToSlug(title);
      const projectPath = path.join(workspacesRoot, slug);
      const id = randomUUID();
      const now = new Date().toISOString();

      // Create directory structure
      await mkdir(path.join(projectPath, '.working'), { recursive: true });
      await mkdir(path.join(projectPath, '.deliverables'), { recursive: true });

      // Write project .index.json
      await writeFile(path.join(projectPath, '.index.json'), JSON.stringify({
        id, title, status: 'active', created_at: now, updated_at: now,
      }, null, 2));

      // Initialize git repo
      const git = new GitManager(projectPath);
      await git.ensureRepo();

      // Save to DB
      const project = db.createProject({
        id, title, slug, path: projectPath,
        status: 'active', created_at: now, updated_at: now,
      });

      res.json(project);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get project
  router.get('/:projectId', (req, res) => {
    const project = db.getProject(req.params.projectId);
    if (!project) return res.status(404).json({ error: 'not found' });
    res.json(project);
  });

  // Create notebook within project
  router.post('/:projectId/notebooks', async (req, res) => {
    try {
      const project = db.getProject(req.params.projectId);
      if (!project) return res.status(404).json({ error: 'project not found' });

      const { title } = req.body;
      if (!title) return res.status(400).json({ error: 'title required' });

      let nbSlug = titleToSlug(title);

      // Avoid slug collisions by appending a short suffix
      const { existsSync } = await import('fs');
      let workingDir = path.join(project.path, '.working', nbSlug);
      if (existsSync(workingDir)) {
        nbSlug = `${nbSlug}-${randomUUID().slice(0, 6)}`;
        workingDir = path.join(project.path, '.working', nbSlug);
      }

      const branchName = `task/${nbSlug}`;
      const worktreePath = path.join(project.path, '.worktrees', `task-${nbSlug}`);

      // Create branch + worktree
      const git = new GitManager(project.path);
      await git.createBranch(branchName);
      await git.addWorktree(worktreePath, branchName);

      // Create notebook working directory
      await mkdir(workingDir, { recursive: true });

      // Create notebook file
      const notebook = notebookStore.createNew(title, worktreePath);
      notebook.metadata.project_id = project.id;
      notebook.metadata.worktree_path = worktreePath;
      notebook.metadata.branch = branchName;

      const notebookPath = path.join(workingDir, `${nbSlug}.notebook.json`);
      await notebookStore.save(notebookPath, notebook);

      // Create session with worktree as cwd
      const session = await sessionManager.createSession(notebookPath, worktreePath);

      // Save to DB
      const now = new Date().toISOString();
      const nbId = randomUUID();
      db.createNotebook({
        id: nbId, user_id: null, title, slug: nbSlug,
        workspace_dir: worktreePath, notebook_path: notebookPath,
        status: 'active', created_at: now, updated_at: now,
      });

      // Update project notebook count
      db.updateProject(project.id, {
        notebook_count: (project.notebook_count || 0) + 1,
      });

      res.json({
        notebookId: nbId,
        sessionId: session.id,
        notebookPath,
        worktreePath,
        branch: branchName,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // List files within project directory
  router.get('/:projectId/files', async (req, res) => {
    try {
      const project = db.getProject(req.params.projectId);
      if (!project) return res.status(404).json({ error: 'not found' });

      const subPath = (req.query.path as string) || '';
      const fullPath = path.join(project.path, subPath);

      // Validate path is within project (append separator to prevent prefix-match bypass)
      const resolved = path.resolve(fullPath);
      const projectRoot = path.resolve(project.path);
      if (resolved !== projectRoot && !resolved.startsWith(projectRoot + path.sep)) {
        return res.status(403).json({ error: 'path traversal' });
      }

      const { readdir, stat } = await import('fs/promises');
      let entries;
      try {
        entries = await readdir(fullPath, { withFileTypes: true });
      } catch {
        return res.json({ dirPath: fullPath, files: [], truncated: false });
      }

      const files = await Promise.all(
        entries
          .filter(e => !e.name.startsWith('.') || e.name.endsWith('.notebook.json') || e.name === '.index.json')
          .map(async (e) => {
            const entryPath = path.join(fullPath, e.name);
            let size = 0;
            let modifiedAt = new Date().toISOString();
            try {
              const s = await stat(entryPath);
              size = s.size;
              modifiedAt = s.mtime.toISOString();
            } catch { /* ignore */ }
            return {
              name: e.name,
              type: e.isDirectory() ? 'directory' as const : 'file' as const,
              size,
              modifiedAt,
            };
          })
      );

      // Sort: directories first, then alphabetically
      files.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      res.json({ dirPath: fullPath, files, truncated: false });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Delete project (cascades: close sessions, remove worktrees, delete from disk + DB)
  router.delete('/:projectId', async (req, res) => {
    try {
      const project = db.getProject(req.params.projectId);
      if (!project) return res.status(404).json({ error: 'not found' });

      // Close active sessions for all notebooks in this project
      const notebooks = db.listProjectNotebooks(project.id);
      for (const nb of notebooks) {
        const activeSession = db.getActiveSession(nb.id);
        if (activeSession) {
          await sessionManager.closeSession(activeSession.tmux_session);
        }
      }

      // Remove worktrees (best-effort)
      try {
        const git = new GitManager(project.path);
        const worktrees = await git.listWorktrees();
        for (const wt of worktrees) {
          if (wt.path !== project.path) {
            await git.removeWorktree(wt.path).catch(() => {});
          }
        }
      } catch { /* git repo may not exist */ }

      // Delete DB records (cascades notebooks → sessions)
      db.deleteProject(project.id);

      // Remove project directory from disk
      const { rm } = await import('fs/promises');
      await rm(project.path, { recursive: true, force: true }).catch(() => {});

      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
