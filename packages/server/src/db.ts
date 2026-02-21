import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import { mkdirSync } from 'fs';

// ── Types ────────────────────────────────────────────────────────────────────

export interface NotebookRow {
  id: string;
  user_id: string | null;
  title: string;
  slug: string;
  workspace_dir: string;
  notebook_path: string;
  status: 'active' | 'archived';
  cell_count: number;
  created_at: string;
  updated_at: string;
}

export interface SessionRow {
  id: string;
  notebook_id: string;
  tmux_session: string;
  jsonl_path: string | null;
  cwd: string;
  status: 'active' | 'closed';
  created_at: string;
  closed_at: string | null;
}

// ── Database ─────────────────────────────────────────────────────────────────

const DB_DIR = path.join(os.homedir(), '.notebook-ai');
const DB_PATH = path.join(DB_DIR, 'notebook.db');

export class NotebookDb {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const resolvedPath = dbPath ?? DB_PATH;
    mkdirSync(path.dirname(resolvedPath), { recursive: true });
    this.db = new Database(resolvedPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.migrate();
  }

  // ── Migrations ───────────────────────────────────────────────────────────

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS notebooks (
        id            TEXT PRIMARY KEY,
        user_id       TEXT,
        title         TEXT NOT NULL,
        slug          TEXT NOT NULL,
        workspace_dir TEXT NOT NULL,
        notebook_path TEXT NOT NULL,
        status        TEXT DEFAULT 'active',
        cell_count    INTEGER DEFAULT 0,
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id              TEXT PRIMARY KEY,
        notebook_id     TEXT NOT NULL REFERENCES notebooks(id),
        tmux_session    TEXT NOT NULL,
        jsonl_path      TEXT,
        cwd             TEXT NOT NULL,
        status          TEXT DEFAULT 'active',
        created_at      TEXT NOT NULL,
        closed_at       TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_notebooks_user_status
        ON notebooks(user_id, status);
      CREATE INDEX IF NOT EXISTS idx_notebooks_updated
        ON notebooks(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_sessions_notebook
        ON sessions(notebook_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_status
        ON sessions(status);

      CREATE TABLE IF NOT EXISTS file_annotations (
        session_id  TEXT NOT NULL,
        file_path   TEXT NOT NULL,
        content     TEXT NOT NULL DEFAULT '{}',
        updated_at  INTEGER NOT NULL,
        PRIMARY KEY (session_id, file_path)
      );
      CREATE INDEX IF NOT EXISTS idx_fa_updated_at ON file_annotations(updated_at);
    `);
  }

  // ── Notebook CRUD ────────────────────────────────────────────────────────

  createNotebook(notebook: Omit<NotebookRow, 'cell_count'>): NotebookRow {
    const stmt = this.db.prepare(`
      INSERT INTO notebooks (id, user_id, title, slug, workspace_dir, notebook_path, status, cell_count, created_at, updated_at)
      VALUES (@id, @user_id, @title, @slug, @workspace_dir, @notebook_path, @status, 0, @created_at, @updated_at)
    `);
    stmt.run(notebook);
    return this.getNotebook(notebook.id)!;
  }

  getNotebook(id: string): NotebookRow | undefined {
    return this.db.prepare('SELECT * FROM notebooks WHERE id = ?').get(id) as NotebookRow | undefined;
  }

  listNotebooks(userId?: string | null): NotebookRow[] {
    if (userId) {
      return this.db.prepare(
        'SELECT * FROM notebooks WHERE user_id = ? AND status = ? ORDER BY created_at DESC'
      ).all(userId, 'active') as NotebookRow[];
    }
    return this.db.prepare(
      'SELECT * FROM notebooks WHERE status = ? ORDER BY created_at DESC'
    ).all('active') as NotebookRow[];
  }

  updateNotebook(id: string, updates: Partial<Pick<NotebookRow, 'title' | 'slug' | 'notebook_path' | 'status' | 'cell_count' | 'updated_at'>>): NotebookRow | undefined {
    const fields: string[] = [];
    const values: Record<string, unknown> = { id };

    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        fields.push(`${key} = @${key}`);
        values[key] = value;
      }
    }
    if (fields.length === 0) return this.getNotebook(id);

    // Always update updated_at
    if (!updates.updated_at) {
      fields.push('updated_at = @updated_at');
      values['updated_at'] = new Date().toISOString();
    }

    this.db.prepare(`UPDATE notebooks SET ${fields.join(', ')} WHERE id = @id`).run(values);
    return this.getNotebook(id);
  }

  deleteNotebook(id: string): void {
    // Hard-delete: remove sessions first (no ON DELETE CASCADE), then the notebook.
    this.db.prepare('DELETE FROM sessions WHERE notebook_id = ?').run(id);
    this.db.prepare('DELETE FROM notebooks WHERE id = ?').run(id);
  }

  // ── Session CRUD ─────────────────────────────────────────────────────────

  createSessionRecord(session: Omit<SessionRow, 'closed_at'>): SessionRow {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO sessions (id, notebook_id, tmux_session, jsonl_path, cwd, status, created_at)
      VALUES (@id, @notebook_id, @tmux_session, @jsonl_path, @cwd, @status, @created_at)
    `);
    stmt.run(session);
    return this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(session.id) as SessionRow;
  }

  getActiveSession(notebookId: string): SessionRow | undefined {
    return this.db.prepare(
      'SELECT * FROM sessions WHERE notebook_id = ? AND status = ? ORDER BY created_at DESC LIMIT 1'
    ).get(notebookId, 'active') as SessionRow | undefined;
  }

  closeSessionRecord(id: string): void {
    this.db.prepare(
      'UPDATE sessions SET status = ?, closed_at = ? WHERE id = ?'
    ).run('closed', new Date().toISOString(), id);
  }

  // ── File Annotations ─────────────────────────────────────────────────────

  upsertFileAnnotations(sessionId: string, filePath: string, content: string, updatedAt: number): void {
    this.db.prepare(`
      INSERT INTO file_annotations (session_id, file_path, content, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(session_id, file_path) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at
    `).run(sessionId, filePath, content, updatedAt);
  }

  getFileAnnotations(sessionId: string, filePath: string): { content: string; updated_at: number } | null {
    const row = this.db.prepare(
      'SELECT content, updated_at FROM file_annotations WHERE session_id = ? AND file_path = ?'
    ).get(sessionId, filePath) as { content: string; updated_at: number } | undefined;
    return row ?? null;
  }

  cleanupOldFileAnnotations(maxAgeDays = 7): void {
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    this.db.prepare('DELETE FROM file_annotations WHERE updated_at < ?').run(cutoff);
  }

  // ── Utility ──────────────────────────────────────────────────────────────

  close(): void {
    this.db.close();
  }
}
