# Project Hierarchy Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restructure notebook-ai from flat notebook list to project-based hierarchy with multi-tab notebooks, git worktrees, and token-level streaming.

**Architecture:** Three-phase approach — data model first (types + DB), then backend (projects + worktrees + streaming), then frontend (store + components + layout). Each phase is independently testable and committable.

**Tech Stack:** TypeScript, Zod (schemas), Express, WebSocket, Zustand (state), React, better-sqlite3, simple-git

**Design doc:** `docs/plans/2026-02-22-project-hierarchy-redesign.md`

---

## Phase 1: Data Model & Types

### Task 1: Add Project schema to shared types

**Files:**
- Modify: `packages/shared/src/types.ts`

**Step 1: Add Project Zod schema after NotebookSchema (line ~193)**

```typescript
// --- Project ---

export const ProjectSchema = z.object({
  id: z.string(),
  title: z.string(),
  path: z.string(),
  status: z.enum(['active', 'archived']).default('active'),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const ProjectListItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum(['active', 'archived']),
  notebookCount: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
```

**Step 2: Add optional project fields to NotebookMetadataSchema (line ~176)**

Add these optional fields to the metadata object inside NotebookSchema:

```typescript
project_id: z.string().optional(),
worktree_path: z.string().optional(),
branch: z.string().optional(),
```

**Step 3: Export inferred types (append to existing exports ~line 527)**

```typescript
export type Project = z.infer<typeof ProjectSchema>;
export type ProjectListItem = z.infer<typeof ProjectListItemSchema>;
```

**Step 4: Commit**

```bash
git add packages/shared/src/types.ts
git commit -m "feat: add Project schema and notebook metadata fields"
```

---

### Task 2: Add CellStream WS message types

**Files:**
- Modify: `packages/shared/src/types.ts`

**Step 1: Add CellStreamMessage schema (after CellOutputMessageSchema, ~line 312)**

```typescript
export const CellStreamMessageSchema = z.object({
  type: z.literal('cell_stream'),
  session_id: z.string(),
  cell_id: z.string(),
  delta: z.string(),
  block_type: z.enum(['text', 'thinking']),
});
```

**Step 2: Add to WSServerMessageSchema union (~line 414)**

Add `CellStreamMessageSchema` to the discriminated union array.

**Step 3: Export type**

```typescript
export type CellStreamMessage = z.infer<typeof CellStreamMessageSchema>;
```

**Step 4: Commit**

```bash
git add packages/shared/src/types.ts
git commit -m "feat: add cell_stream WS message type for token-level streaming"
```

---

### Task 3: Add projects table to database

**Files:**
- Modify: `packages/server/src/db.ts`

**Step 1: Add ProjectRow interface (after SessionRow, ~line 30)**

```typescript
export interface ProjectRow {
  id: string;
  title: string;
  slug: string;
  path: string;
  status: 'active' | 'archived';
  notebook_count: number;
  created_at: string;
  updated_at: string;
}
```

**Step 2: Add projects table to migrate() (after file_annotations table, ~line 87)**

```sql
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE,
  status TEXT DEFAULT 'active',
  notebook_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_updated ON projects(updated_at DESC);
```

**Step 3: Add project_id column to notebooks table**

Add after the existing notebooks CREATE TABLE (as migration):

```typescript
// Migration: add project_id to notebooks
try {
  this.db.exec(`ALTER TABLE notebooks ADD COLUMN project_id TEXT REFERENCES projects(id)`);
} catch { /* column already exists */ }
```

**Step 4: Add CRUD methods for projects**

```typescript
createProject(project: Omit<ProjectRow, 'notebook_count'>): ProjectRow {
  this.db.prepare(`INSERT INTO projects (id, title, slug, path, status, notebook_count, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 0, ?, ?)`).run(
    project.id, project.title, project.slug, project.path,
    project.status, project.created_at, project.updated_at
  );
  return { ...project, notebook_count: 0 };
}

listProjects(): ProjectRow[] {
  return this.db.prepare(
    `SELECT * FROM projects WHERE status = 'active' ORDER BY updated_at DESC`
  ).all() as ProjectRow[];
}

getProject(id: string): ProjectRow | undefined {
  return this.db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id) as ProjectRow | undefined;
}

updateProject(id: string, updates: Partial<Pick<ProjectRow, 'title' | 'status' | 'notebook_count'>>): ProjectRow | undefined {
  const fields: string[] = [];
  const values: unknown[] = [];
  for (const [k, v] of Object.entries(updates)) {
    fields.push(`${k} = ?`);
    values.push(v);
  }
  fields.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);
  this.db.prepare(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return this.getProject(id);
}

deleteProject(id: string): void {
  this.db.prepare(`DELETE FROM projects WHERE id = ?`).run(id);
}
```

**Step 5: Commit**

```bash
git add packages/server/src/db.ts
git commit -m "feat: add projects table and CRUD methods to database"
```

---

## Phase 2: Backend — Project & Worktree Management

### Task 4: Add worktree methods to GitManager

**Files:**
- Modify: `packages/server/src/git.ts`

**Step 1: Add worktree management methods**

```typescript
async createBranch(branchName: string): Promise<void> {
  await this.git.branch([branchName]);
}

async addWorktree(path: string, branch: string): Promise<void> {
  await this.git.raw(['worktree', 'add', path, branch]);
}

async removeWorktree(path: string): Promise<void> {
  await this.git.raw(['worktree', 'remove', path, '--force']);
}

async listWorktrees(): Promise<Array<{ path: string; branch: string }>> {
  const output = await this.git.raw(['worktree', 'list', '--porcelain']);
  const worktrees: Array<{ path: string; branch: string }> = [];
  let current: { path?: string; branch?: string } = {};
  for (const line of output.split('\n')) {
    if (line.startsWith('worktree ')) current.path = line.slice(9);
    else if (line.startsWith('branch ')) current.branch = line.slice(7).replace('refs/heads/', '');
    else if (line === '') {
      if (current.path && current.branch) worktrees.push({ path: current.path, branch: current.branch });
      current = {};
    }
  }
  return worktrees;
}
```

**Step 2: Commit**

```bash
git add packages/server/src/git.ts
git commit -m "feat: add worktree management methods to GitManager"
```

---

### Task 5: Create projects router

**Files:**
- Create: `packages/server/src/routes/projects.ts`

**Step 1: Create the router with project CRUD + notebook creation**

```typescript
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

      const nbSlug = titleToSlug(title);
      const branchName = `task/${nbSlug}`;
      const worktreePath = path.join(project.path, '.worktrees', `task-${nbSlug}`);
      const workingDir = path.join(project.path, '.working', nbSlug);

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

  // Delete project
  router.delete('/:projectId', (req, res) => {
    db.deleteProject(req.params.projectId);
    res.json({ ok: true });
  });

  return router;
}
```

**Step 2: Register in server entry point**

Find the main server file (index.ts or app.ts), add:

```typescript
import { createProjectsRouter } from './routes/projects.js';

// After existing router registrations:
app.use('/api/projects', createProjectsRouter(db, sessionManager, notebookStore, workspacesRoot));
```

**Step 3: Commit**

```bash
git add packages/server/src/routes/projects.ts packages/server/src/index.ts
git commit -m "feat: add projects router with CRUD and notebook creation"
```

---

## Phase 3: Backend — Token Streaming

### Task 6: Modify ClaudeProcess for delta forwarding

**Files:**
- Modify: `packages/server/src/claude-process.ts`

**Step 1: Change message handler to forward raw JSONL events**

Current logic (line ~70-88): readline parses each JSON line and calls `onMessage` with parsed object.

The key insight: Claude's `--output-format stream-json` already outputs per-token events. The current code passes them through. The issue is that `SessionManager.handleJsonlMessage` aggregates them before broadcasting.

Keep ClaudeProcess unchanged — the fix is in SessionManager.

**Step 2: No changes needed to ClaudeProcess**

The `--output-format stream-json` flag already produces individual JSONL events including `content_block_delta`. The aggregation happens in `SessionManager.handleJsonlMessage`.

---

### Task 7: Add delta streaming to SessionManager

**Files:**
- Modify: `packages/server/src/session.ts`

**Step 1: Modify handleJsonlMessage to forward text deltas**

In `handleJsonlMessage` (line ~366), add handling for `content_block_delta` events before the existing `assistant` handling:

```typescript
// At the start of handleJsonlMessage, before existing logic:
const msg = raw as any;

// Forward text/thinking deltas immediately for streaming
if (msg.type === 'content_block_delta') {
  const cellId = findRunningCellId(session.notebook);
  if (cellId && msg.delta?.type === 'text_delta') {
    this.broadcast(session, {
      type: 'cell_stream',
      session_id: session.id,
      cell_id: cellId,
      delta: msg.delta.text,
      block_type: 'text',
    });
  } else if (cellId && msg.delta?.type === 'thinking_delta') {
    this.broadcast(session, {
      type: 'cell_stream',
      session_id: session.id,
      cell_id: cellId,
      delta: msg.delta.thinking,
      block_type: 'thinking',
    });
  }
  return; // Don't process further — the complete block will arrive via content_block_stop
}
```

**Important:** Check if Claude CLI's `stream-json` format actually outputs `content_block_delta` events or already batches them. If it batches into complete `assistant` messages, we need to check the actual JSONL output format. The existing code handles `assistant` type messages with `content` array. If those arrive as complete blocks, the delta approach needs adjusting — we would split the text content and send as synthetic deltas.

**Step 2: Alternative approach if blocks arrive complete**

If the JSONL outputs complete `assistant` messages (not deltas), modify the text/thinking handling in the existing assistant block processor to emit synthetic deltas:

```typescript
// Inside the existing 'assistant' handling (around line 400):
case 'text': {
  const cellId = findRunningCellId(session.notebook);
  if (cellId) {
    // Forward as stream delta for real-time rendering
    this.broadcast(session, {
      type: 'cell_stream',
      session_id: session.id,
      cell_id: cellId,
      delta: block.text,
      block_type: 'text',
    });
  }
  // Still append the complete output for final consistency
  appendCellOutput(session.notebook, cellId!, {
    type: 'text', content: block.text, timestamp: new Date().toISOString()
  });
  break;
}
```

Apply same pattern for `thinking` blocks.

**Step 3: Commit**

```bash
git add packages/server/src/session.ts
git commit -m "feat: add cell_stream delta broadcasting for streaming rendering"
```

---

### Task 8: Add cell_stream handler to frontend wsSlice

**Files:**
- Modify: `packages/web/src/store/wsSlice.ts`

**Step 1: Add cell_stream to message handler switch (line ~92)**

```typescript
case 'cell_stream': {
  const { cell_id, delta, block_type } = data;
  get().appendStreamDelta(cell_id, delta, block_type);
  break;
}
```

**Step 2: This depends on notebookSlice having `appendStreamDelta` — see Task 12.**

**Step 3: Commit (deferred to Task 12)**

---

## Phase 4: Frontend — Store Refactoring

### Task 9: Create projectSlice

**Files:**
- Create: `packages/web/src/store/projectSlice.ts`
- Modify: `packages/web/src/store.ts`

**Step 1: Create projectSlice**

```typescript
import { StateCreator } from 'zustand';
import type { NotebookStore } from './index';

export interface ProjectListItem {
  id: string;
  title: string;
  status: 'active' | 'archived';
  notebook_count: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectSlice {
  // State
  projects: ProjectListItem[];
  projectsLoading: boolean;
  activeProjectId: string | null;
  activeProjectPath: string | null;
  sidebarLevel: 'L1' | 'L2';
  fileBrowserPath: string; // Current path within .working/

  // Actions
  fetchProjects: () => Promise<void>;
  createProject: (title: string) => Promise<void>;
  setActiveProject: (id: string, path: string) => void;
  goBackToProjectList: () => void;
  navigateFileBrowser: (subPath: string) => void;
  createNotebook: (projectId: string, title: string) => Promise<{ sessionId: string; notebookPath: string }>;
}

export const createProjectSlice: StateCreator<NotebookStore, [], [], ProjectSlice> = (set, get) => ({
  projects: [],
  projectsLoading: false,
  activeProjectId: null,
  activeProjectPath: null,
  sidebarLevel: 'L1',
  fileBrowserPath: '',

  fetchProjects: async () => {
    set({ projectsLoading: true });
    try {
      const token = get().authToken;
      const res = await fetch('/api/projects', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const projects = await res.json();
      set({ projects, projectsLoading: false });
    } catch {
      set({ projectsLoading: false });
    }
  },

  createProject: async (title: string) => {
    const token = get().authToken;
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ title }),
    });
    if (res.ok) {
      await get().fetchProjects();
    }
  },

  setActiveProject: (id: string, path: string) => {
    set({
      activeProjectId: id,
      activeProjectPath: path,
      sidebarLevel: 'L2',
      fileBrowserPath: '',
    });
  },

  goBackToProjectList: () => {
    set({
      activeProjectId: null,
      activeProjectPath: null,
      sidebarLevel: 'L1',
      fileBrowserPath: '',
    });
  },

  navigateFileBrowser: (subPath: string) => {
    set({ fileBrowserPath: subPath });
  },

  createNotebook: async (projectId: string, title: string) => {
    const token = get().authToken;
    const res = await fetch(`/api/projects/${projectId}/notebooks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ title }),
    });
    const data = await res.json();
    return { sessionId: data.sessionId, notebookPath: data.notebookPath };
  },
});
```

**Step 2: Register in store.ts**

Add import and include in store creation:

```typescript
import { createProjectSlice, type ProjectSlice } from './store/projectSlice';

export type NotebookStore = AuthSlice & SidebarSlice & NotebookSlice & UiSlice & WsSlice & ProjectSlice;

// In create(): add ...createProjectSlice(...a),
```

**Step 3: Commit**

```bash
git add packages/web/src/store/projectSlice.ts packages/web/src/store.ts
git commit -m "feat: add projectSlice for project management state"
```

---

### Task 10: Refactor notebookSlice for multi-notebook

**Files:**
- Modify: `packages/web/src/store/notebookSlice.ts`

**Step 1: Change from single notebook to notebook map**

Replace single `notebook` with multi-notebook state:

```typescript
// New state shape:
openNotebooks: Map<string, { notebook: Notebook; sessionId: string; scrollY: number }>;
activeNotebookId: string | null; // which tab is active
streamBuffer: Map<string, { text: string; thinking: string }>; // delta buffer per cell

// New actions:
openNotebookTab: (notebookId: string, notebook: Notebook, sessionId: string) => void;
closeNotebookTab: (notebookId: string) => void;
setActiveNotebookTab: (notebookId: string) => void;
appendStreamDelta: (cellId: string, delta: string, blockType: 'text' | 'thinking') => void;
flushStreamBuffer: (cellId: string) => string; // returns accumulated text
```

**Key:** Since Zustand doesn't natively serialize Map, use a plain object `Record<string, ...>` instead:

```typescript
openNotebooks: Record<string, { notebook: Notebook; sessionId: string; scrollY: number }>;
```

**Step 2: Add stream delta accumulation**

```typescript
appendStreamDelta: (cellId, delta, blockType) => {
  set(state => {
    const buf = { ...state.streamBuffer };
    if (!buf[cellId]) buf[cellId] = { text: '', thinking: '' };
    buf[cellId][blockType] += delta;
    return { streamBuffer: buf };
  });
},

flushStreamBuffer: (cellId) => {
  const buf = get().streamBuffer[cellId];
  if (!buf) return '';
  const text = buf.text;
  set(state => {
    const newBuf = { ...state.streamBuffer };
    delete newBuf[cellId];
    return { streamBuffer: newBuf };
  });
  return text;
},
```

**Step 3: Maintain backward compatibility**

Keep the existing `notebook` getter that returns `openNotebooks[activeNotebookId]?.notebook ?? null` so existing components still work during migration.

**Step 4: Commit**

```bash
git add packages/web/src/store/notebookSlice.ts
git commit -m "refactor: multi-notebook state with stream buffer in notebookSlice"
```

---

### Task 11: Update uiSlice for right panel

**Files:**
- Modify: `packages/web/src/store/uiSlice.ts`

**Step 1: Add right panel state**

```typescript
// New state:
rightPanelOpen: boolean;         // default true
rightPanelSplitRatio: number;    // 0-1, default 0.5
deliverablesViewingFile: string | null;  // if set, FileViewer is showing this file
libraryViewingFile: string | null;

// New actions:
toggleRightPanel: () => void;
setRightPanelSplitRatio: (ratio: number) => void;
openFileInDeliverables: (path: string) => void;
openFileInLibrary: (path: string) => void;
closeDeliverablesViewer: () => void;
closeLibraryViewer: () => void;
```

**Step 2: Commit**

```bash
git add packages/web/src/store/uiSlice.ts
git commit -m "feat: add right panel state to uiSlice"
```

---

### Task 12: Update wsSlice for cell_stream + multi-session

**Files:**
- Modify: `packages/web/src/store/wsSlice.ts`

**Step 1: Add cell_stream handler to onmessage switch (~line 92)**

```typescript
case 'cell_stream': {
  get().appendStreamDelta(data.cell_id, data.delta, data.block_type);
  break;
}
```

**Step 2: Support multiple session subscriptions**

Change `subscribeToSession` to not unsubscribe from previous session (allow multiple). Track subscribed sessions:

```typescript
// Add to state:
subscribedSessions: Set<string>;

// Modify subscribeToSession:
subscribeToSession: (sessionId: string) => {
  const { ws, subscribedSessions } = get();
  if (!ws || subscribedSessions.has(sessionId)) return;
  ws.send(JSON.stringify({ type: 'subscribe', session_id: sessionId }));
  set({ subscribedSessions: new Set([...subscribedSessions, sessionId]) });
},
```

**Step 3: Commit**

```bash
git add packages/web/src/store/wsSlice.ts
git commit -m "feat: add cell_stream handler and multi-session support to wsSlice"
```

---

## Phase 5: Frontend — UI Components

### Task 13: Create ProjectSidebar component (L1 + L2)

**Files:**
- Create: `packages/web/src/components/ProjectSidebar.tsx`

**Step 1: Build L1 (project list) view**

```typescript
import { useEffect, useState } from 'react';
import { useStore } from '../store';

export function ProjectSidebar() {
  const {
    sidebarLevel, projects, projectsLoading,
    fetchProjects, setActiveProject, goBackToProjectList,
    createProject, activeProjectPath, fileBrowserPath, navigateFileBrowser,
  } = useStore();

  useEffect(() => { fetchProjects(); }, []);

  if (sidebarLevel === 'L1') return <ProjectList />;
  return <FileBrowser />;
}
```

**Step 2: Build L2 (file browser) view**

L2 reuses `FileSection` from FilesPanel.tsx — extract it as a shared component or pass props. The file browser reads from `/api/projects/:id/files?path=.working/<subPath>`.

Click handling:
- `.notebook.json` files → call `openNotebookTab`
- Other files → call `openFileInDeliverables`

**Step 3: Commit**

```bash
git add packages/web/src/components/ProjectSidebar.tsx
git commit -m "feat: add ProjectSidebar with L1 project list and L2 file browser"
```

---

### Task 14: Create NotebookTabs component

**Files:**
- Create: `packages/web/src/components/NotebookTabs.tsx`

**Step 1: Build tab bar component**

```typescript
import { useStore } from '../store';

export function NotebookTabs() {
  const { openNotebooks, activeNotebookId, setActiveNotebookTab, closeNotebookTab } = useStore();
  const tabs = Object.entries(openNotebooks);

  if (tabs.length === 0) return null;

  return (
    <div className="notebook-tabs">
      {tabs.map(([id, { notebook }]) => (
        <div
          key={id}
          className={`notebook-tab ${id === activeNotebookId ? 'notebook-tab--active' : ''}`}
          onClick={() => setActiveNotebookTab(id)}
        >
          <span className="notebook-tab-title">{notebook.metadata.title}</span>
          <button
            className="notebook-tab-close"
            onClick={e => { e.stopPropagation(); closeNotebookTab(id); }}
          >
            &times;
          </button>
        </div>
      ))}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add packages/web/src/components/NotebookTabs.tsx
git commit -m "feat: add NotebookTabs component for multi-tab switching"
```

---

### Task 15: Create RightPanel component

**Files:**
- Create: `packages/web/src/components/RightPanel.tsx`

**Step 1: Build split panel with deliverables + library**

The component renders two `FileSection` instances (extracted from FilesPanel.tsx):
- Top: deliverables (`/api/projects/:id/files?path=.deliverables/`)
- Bottom: library (`/api/library/files`)

Each section can switch to FileViewer in-place when a file is clicked. Track which section is in "viewing" mode via `deliverablesViewingFile` / `libraryViewingFile` in uiSlice.

Include:
- Collapse button for entire panel
- Draggable divider between sections
- Back button when viewing a file

**Step 2: Commit**

```bash
git add packages/web/src/components/RightPanel.tsx
git commit -m "feat: add RightPanel with deliverables and library file browsers"
```

---

### Task 16: Create StreamingCellOutput component

**Files:**
- Create: `packages/web/src/components/StreamingCellOutput.tsx`

**Step 1: Build streaming renderer with 20ms batch updates**

```typescript
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';

export function StreamingText({ cellId }: { cellId: string }) {
  const streamBuffer = useStore(s => s.streamBuffer[cellId]);
  const containerRef = useRef<HTMLPreElement>(null);
  const [rendered, setRendered] = useState('');

  useEffect(() => {
    const interval = setInterval(() => {
      if (!streamBuffer) return;
      const newText = streamBuffer.text;
      if (newText !== rendered) {
        setRendered(newText);
        if (containerRef.current) {
          containerRef.current.textContent = newText;
        }
      }
    }, 20);
    return () => clearInterval(interval);
  }, [streamBuffer, rendered]);

  return <pre ref={containerRef} className="output-text streaming" />;
}
```

**Step 2: Integrate into CellOutput.tsx**

When a cell has status 'running', render `StreamingText` for the active text/thinking blocks instead of the static text output. When execution completes, switch to the static output (final consistency).

**Step 3: Commit**

```bash
git add packages/web/src/components/StreamingCellOutput.tsx
git commit -m "feat: add StreamingCellOutput with 20ms batch rendering"
```

---

### Task 17: Redesign App.tsx layout

**Files:**
- Modify: `packages/web/src/App.tsx`

**Step 1: Replace current two-column layout with three-column**

Current layout (~line 189-211):
```
sidebar | content-split (notebook + file-viewer)
```

New layout:
```
ProjectSidebar | notebook-area (tabs + notebook + input) | RightPanel
```

Replace the `AuthenticatedApp` render to use new components:

```tsx
<div className="app-body">
  <ProjectSidebar />
  <div className="app-content">
    <NotebookTabs />
    <div className="notebook-area">
      {activeNotebook ? <Notebook /> : <WelcomeScreen />}
    </div>
  </div>
  <RightPanel />
</div>
```

**Step 2: Remove old FilesPanel/FileViewer split logic**

Remove:
- `splitRatio` state and drag handler (lines 105-139)
- `content-split` div and split-divider (lines 189-211)
- Old FilesPanel overlay toggle

**Step 3: Commit**

```bash
git add packages/web/src/App.tsx
git commit -m "refactor: three-column layout with ProjectSidebar, NotebookTabs, RightPanel"
```

---

### Task 18: Update CSS for new layout

**Files:**
- Modify: `packages/web/src/styles.css`

**Step 1: Add three-column grid layout**

```css
.app-body {
  display: flex;
  height: calc(100vh - var(--toolbar-height));
}

.app-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}
```

**Step 2: Add notebook tabs styles**

```css
.notebook-tabs {
  display: flex;
  background: var(--sidebar-bg);
  border-bottom: 1px solid var(--border-default);
  overflow-x: auto;
  flex-shrink: 0;
}

.notebook-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  cursor: pointer;
  border-right: 1px solid var(--border-default);
  font-size: 13px;
  white-space: nowrap;
}

.notebook-tab--active {
  background: var(--bg-page);
  border-bottom: 2px solid var(--color-primary);
}

.notebook-tab-close {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 14px;
  padding: 0 2px;
}
```

**Step 3: Add right panel styles**

```css
.right-panel {
  width: 300px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--border-default);
  background: var(--bg-page);
}

.right-panel--collapsed {
  display: none;
}

.right-panel-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.right-panel-divider {
  height: 4px;
  cursor: row-resize;
  background: var(--border-default);
  flex-shrink: 0;
}
```

**Step 4: Add streaming output styles**

```css
.output-text.streaming {
  border-left: 2px solid var(--color-running);
  animation: pulse-border 1s ease-in-out infinite;
}

@keyframes pulse-border {
  0%, 100% { border-left-color: var(--color-running); }
  50% { border-left-color: transparent; }
}
```

**Step 5: Commit**

```bash
git add packages/web/src/styles.css
git commit -m "feat: add CSS for three-column layout, tabs, right panel, streaming"
```

---

## Phase 6: Integration & Cleanup

### Task 19: Wire up file browser click routing

**Files:**
- Modify: `packages/web/src/components/ProjectSidebar.tsx`

**Step 1: Add file click routing logic**

When a file is clicked in L2 file browser:
```typescript
const handleFileClick = (filePath: string, fileName: string) => {
  if (fileName.endsWith('.notebook.json')) {
    // Load notebook and open as tab
    openNotebookFromFile(filePath);
  } else {
    // Open in right panel FileViewer
    openFileInDeliverables(filePath);
  }
};
```

**Step 2: Commit**

```bash
git add packages/web/src/components/ProjectSidebar.tsx
git commit -m "feat: wire up file click routing for notebook vs file viewer"
```

---

### Task 20: Add backend file browsing for projects

**Files:**
- Modify: `packages/server/src/routes/projects.ts`

**Step 1: Add file listing endpoint for project directories**

```typescript
// List files within project directory
router.get('/:projectId/files', async (req, res) => {
  const project = db.getProject(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'not found' });

  const subPath = (req.query.path as string) || '';
  const fullPath = path.join(project.path, subPath);

  // Validate path is within project
  const resolved = path.resolve(fullPath);
  if (!resolved.startsWith(path.resolve(project.path))) {
    return res.status(403).json({ error: 'path traversal' });
  }

  // Reuse workspace file listing logic
  const { listWorkspaceFiles } = await import('../workspace-files.js');
  const files = await listWorkspaceFiles(fullPath);
  res.json(files);
});
```

**Step 2: Commit**

```bash
git add packages/server/src/routes/projects.ts
git commit -m "feat: add project file browsing endpoint"
```

---

### Task 21: Update Notebook component for active tab binding

**Files:**
- Modify: `packages/web/src/components/Notebook.tsx`

**Step 1: Modify to read from active tab's notebook**

Change from `useStore(s => s.notebook)` to:

```typescript
const activeNotebookId = useStore(s => s.activeNotebookId);
const notebook = useStore(s =>
  activeNotebookId ? s.openNotebooks[activeNotebookId]?.notebook : null
);
```

Apply same pattern to NotebookInputBar's `submitPrompt` — use the active tab's sessionId.

**Step 2: Commit**

```bash
git add packages/web/src/components/Notebook.tsx
git commit -m "refactor: bind Notebook component to active tab's notebook"
```

---

### Task 22: Integrate StreamingCellOutput into Cell rendering

**Files:**
- Modify: `packages/web/src/components/CellOutput.tsx`

**Step 1: Add streaming detection**

```typescript
// In CellOutput component (line ~164):
const { streamBuffer } = useStore();

// For cells with status 'running', check if there's streaming data:
if (isActiveCell && streamBuffer[cellId]) {
  // Render StreamingText for text/thinking
  return <StreamingText cellId={cellId} />;
}
// Otherwise render static outputs as before
```

**Step 2: Commit**

```bash
git add packages/web/src/components/CellOutput.tsx
git commit -m "feat: integrate streaming renderer into active cell output"
```

---

## Dependency Graph

```
Task 1 (Project types)
  └─► Task 3 (DB schema) ──► Task 5 (Projects router) ──► Task 20 (File browsing API)
  └─► Task 4 (GitManager) ──► Task 5

Task 2 (CellStream types)
  └─► Task 7 (SessionManager streaming) ──► Task 8 (wsSlice handler) ──► Task 16 (StreamingCellOutput)

Task 9 (projectSlice) ──► Task 13 (ProjectSidebar) ──► Task 19 (Click routing)
Task 10 (notebookSlice refactor) ──► Task 14 (NotebookTabs) ──► Task 21 (Notebook binding)
Task 11 (uiSlice) ──► Task 15 (RightPanel)

Task 17 (App.tsx layout) depends on: Task 13, 14, 15
Task 18 (CSS) depends on: Task 17
Task 22 (CellOutput streaming) depends on: Task 16, Task 10
```

## Implementation Order (Linear)

1. Task 1 → Task 2 → Task 3 → Task 4 (data model foundation)
2. Task 5 → Task 20 (backend project management)
3. Task 6 → Task 7 (backend streaming — Task 6 is no-op)
4. Task 9 → Task 10 → Task 11 → Task 12 (frontend store)
5. Task 13 → Task 14 → Task 15 → Task 16 (frontend components)
6. Task 17 → Task 18 (layout assembly)
7. Task 19 → Task 21 → Task 22 (integration wiring)
