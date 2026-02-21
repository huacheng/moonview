# File Viewer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a split-panel file viewer that opens when a file is clicked in the Files panel, with streaming file load, 4-mode annotation system (insert/delete/replace/comment), and TipTap rich-text edit mode.

**Architecture:** Clicking a file sets `openFile` in `uiSlice`, which triggers a layout split in `App.tsx`. All file I/O (load, save, annotations) flows through the existing WebSocket. Annotations are persisted server-side in a new `file_annotations` SQLite table with dual-layer caching (localStorage L1 + WebSocket L2). Notebook-level annotation system is removed entirely.

**Tech Stack:** React, Zustand, WebSocket, better-sqlite3, TipTap (`@tiptap/react` + `@tiptap/starter-kit`), `react-pdf`, `dompurify`, `react-markdown` (already installed)

**Reference implementation:** `/home/ubuntu/cli-online/web/src/` — annotation hooks, SelectionFloat, AnnotationCard, AnnotationDropdown, useFileStream

---

### Task 1: Install frontend npm packages

**Files:**
- Modify: `packages/web/package.json` (via npm install)

**Step 1: Install packages**

```bash
cd /home/ubuntu/notebook-ai/packages/web && npm install react-pdf @tiptap/react @tiptap/starter-kit dompurify @types/dompurify
```

Expected: packages installed, no peer dependency errors.

**Step 2: Verify**

```bash
ls /home/ubuntu/notebook-ai/packages/web/node_modules/dompurify && echo "OK"
ls /home/ubuntu/notebook-ai/packages/web/node_modules/react-pdf && echo "OK"
ls /home/ubuntu/notebook-ai/packages/web/node_modules/@tiptap/react && echo "OK"
```

Expected: OK for each.

**Step 3: Commit**

```bash
cd /home/ubuntu/notebook-ai
git add packages/web/package.json packages/web/package-lock.json
git commit -m "chore: install react-pdf, tiptap, dompurify"
```

---

### Task 2: Add file_annotations table to db.ts

**Files:**
- Modify: `packages/server/src/db.ts`
- Create: `packages/server/src/__tests__/db-file-annotations.test.ts`

The table stores annotation JSON strings keyed by `(session_id, file_path)`. Stale entries (> 7 days) are purged on server start.

**Step 1: Write the failing test**

Create `packages/server/src/__tests__/db-file-annotations.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { NotebookDb } from '../db.js';

describe('file_annotations table', () => {
  let db: NotebookDb;

  beforeEach(() => {
    db = new NotebookDb(':memory:');
  });

  it('upserts and retrieves annotations', () => {
    db.upsertFileAnnotations('sess-1', 'README.md', '{"items":[]}', 1000);
    const row = db.getFileAnnotations('sess-1', 'README.md');
    expect(row).not.toBeNull();
    expect(row!.content).toBe('{"items":[]}');
    expect(row!.updated_at).toBe(1000);
  });

  it('updates existing row on re-upsert', () => {
    db.upsertFileAnnotations('sess-1', 'README.md', 'v1', 100);
    db.upsertFileAnnotations('sess-1', 'README.md', 'v2', 200);
    const row = db.getFileAnnotations('sess-1', 'README.md');
    expect(row!.content).toBe('v2');
    expect(row!.updated_at).toBe(200);
  });

  it('returns null for missing entry', () => {
    expect(db.getFileAnnotations('sess-1', 'missing.md')).toBeNull();
  });

  it('cleanupOldFileAnnotations removes stale entries', () => {
    const nowMs = Date.now();
    db.upsertFileAnnotations('sess-1', 'old.md', '{}', nowMs - 8 * 24 * 60 * 60 * 1000);
    db.upsertFileAnnotations('sess-1', 'new.md', '{}', nowMs);
    db.cleanupOldFileAnnotations(7);
    expect(db.getFileAnnotations('sess-1', 'old.md')).toBeNull();
    expect(db.getFileAnnotations('sess-1', 'new.md')).not.toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd /home/ubuntu/notebook-ai && npx vitest run packages/server/src/__tests__/db-file-annotations.test.ts 2>&1 | tail -10
```

Expected: FAIL — `db.upsertFileAnnotations is not a function`

**Step 3: Implement in db.ts**

a) Add to the `migrate()` SQL string in `NotebookDb`:

```sql
CREATE TABLE IF NOT EXISTS file_annotations (
  session_id  TEXT NOT NULL,
  file_path   TEXT NOT NULL,
  content     TEXT NOT NULL DEFAULT '{}',
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (session_id, file_path)
);
CREATE INDEX IF NOT EXISTS idx_fa_updated_at ON file_annotations(updated_at);
```

b) Add three methods to `NotebookDb` class (after `closeSessionRecord`):

```ts
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
```

**Step 4: Run test to verify it passes**

```bash
cd /home/ubuntu/notebook-ai && npx vitest run packages/server/src/__tests__/db-file-annotations.test.ts 2>&1 | tail -10
```

Expected: 4 tests PASS

**Step 5: Run all server tests to check no regressions**

```bash
cd /home/ubuntu/notebook-ai && npx vitest run packages/server 2>&1 | tail -15
```

**Step 6: Commit**

```bash
git add packages/server/src/db.ts packages/server/src/__tests__/db-file-annotations.test.ts
git commit -m "feat: add file_annotations table to db.ts"
```

---

### Task 3: Add WS message schemas to shared/types.ts

**Files:**
- Modify: `packages/shared/src/types.ts`

New client→server schemas: `file-open`, `file-save`, `annotation-load`, `annotation-sync`.
New server→client schemas: `file-open-meta`, `file-chunk`, `file-open-end`, `file-open-error`, `file-save-ok`, `file-save-error`, `annotation-data`, `annotation-sync-ok`.

Both `WSClientMessageSchema` and `WSServerMessageSchema` discriminated union arrays must be updated.

**Step 1: Add client→server schemas** (after `UpdateCellSourceSchema`, before `WSClientMessageSchema`):

```ts
// ── File Viewer messages ────────────────────────────────────────────────────

export const FileOpenSchema = z.object({
  type: z.literal('file-open'),
  session_id: z.string(),
  path: z.string(),
  source: z.enum(['workspace', 'library']),
});

export const FileSaveSchema = z.object({
  type: z.literal('file-save'),
  session_id: z.string(),
  path: z.string(),
  source: z.enum(['workspace', 'library']),
  content: z.string(),
  format: z.enum(['text', 'html']),
});

export const AnnotationLoadSchema = z.object({
  type: z.literal('annotation-load'),
  session_id: z.string(),
  path: z.string(),
});

export const AnnotationSyncSchema = z.object({
  type: z.literal('annotation-sync'),
  session_id: z.string(),
  path: z.string(),
  content: z.string(),
  updated_at: z.number(),
});
```

**Step 2: Update `WSClientMessageSchema` union** — add the four new schemas:

```ts
export const WSClientMessageSchema = z.discriminatedUnion('type', [
  SubscribeSchema,
  UnsubscribeSchema,
  ExecuteRequestSchema,
  SaveNotebookSchema,
  LoadNotebookSchema,
  ExportHtmlSchema,
  SliceUpdateSchema,
  PingSchema,
  UpdateCellSourceSchema,
  FileOpenSchema,       // NEW
  FileSaveSchema,       // NEW
  AnnotationLoadSchema, // NEW
  AnnotationSyncSchema, // NEW
]);
```

**Step 3: Add server→client schemas** (after `SessionAlreadyOpenSchema`, before `WSServerMessageSchema`):

```ts
export const FileOpenMetaSchema = z.object({
  type: z.literal('file-open-meta'),
  session_id: z.string(),
  size: z.number(),
  mtime: z.number(),
  format: z.enum(['text', 'html', 'pdf-binary', 'unsupported']),
});

export const FileChunkSchema = z.object({
  type: z.literal('file-chunk'),
  session_id: z.string(),
  data: z.string(),
  encoding: z.enum(['utf8', 'base64']),
});

export const FileOpenEndSchema = z.object({
  type: z.literal('file-open-end'),
  session_id: z.string(),
  mtime: z.number(),
});

export const FileOpenErrorSchema = z.object({
  type: z.literal('file-open-error'),
  session_id: z.string(),
  error: z.string(),
});

export const FileSaveOkSchema = z.object({
  type: z.literal('file-save-ok'),
  session_id: z.string(),
  mtime: z.number(),
});

export const FileSaveErrorSchema = z.object({
  type: z.literal('file-save-error'),
  session_id: z.string(),
  error: z.string(),
});

export const AnnotationDataSchema = z.object({
  type: z.literal('annotation-data'),
  session_id: z.string(),
  path: z.string(),
  content: z.string(),
  updated_at: z.number(),
});

export const AnnotationSyncOkSchema = z.object({
  type: z.literal('annotation-sync-ok'),
  session_id: z.string(),
  path: z.string(),
  updated_at: z.number(),
});
```

**Step 4: Update `WSServerMessageSchema` union** — add the eight new schemas:

```ts
export const WSServerMessageSchema = z.discriminatedUnion('type', [
  CellOutputMessageSchema,
  ExecutionCompleteSchema,
  GitDiffMessageSchema,
  ExportCompleteSchema,
  ErrorMessageSchema,
  SliceUpdateSchema,
  ToolResultMessageSchema,
  SessionAlreadyOpenSchema,
  PongSchema,
  FileOpenMetaSchema,    // NEW
  FileChunkSchema,       // NEW
  FileOpenEndSchema,     // NEW
  FileOpenErrorSchema,   // NEW
  FileSaveOkSchema,      // NEW
  FileSaveErrorSchema,   // NEW
  AnnotationDataSchema,  // NEW
  AnnotationSyncOkSchema,// NEW
]);
```

**Step 5: Add inferred TypeScript types** (at the bottom of types.ts):

```ts
export type FileOpen = z.infer<typeof FileOpenSchema>;
export type FileSave = z.infer<typeof FileSaveSchema>;
export type AnnotationLoad = z.infer<typeof AnnotationLoadSchema>;
export type AnnotationSync = z.infer<typeof AnnotationSyncSchema>;
export type FileOpenMeta = z.infer<typeof FileOpenMetaSchema>;
export type FileChunk = z.infer<typeof FileChunkSchema>;
export type FileOpenEnd = z.infer<typeof FileOpenEndSchema>;
export type FileOpenError = z.infer<typeof FileOpenErrorSchema>;
export type FileSaveOk = z.infer<typeof FileSaveOkSchema>;
export type FileSaveError = z.infer<typeof FileSaveErrorSchema>;
export type AnnotationData = z.infer<typeof AnnotationDataSchema>;
export type AnnotationSyncOk = z.infer<typeof AnnotationSyncOkSchema>;
```

**Step 6: Verify TypeScript compiles**

```bash
cd /home/ubuntu/notebook-ai && npx tsc --project packages/shared/tsconfig.json --noEmit 2>&1 | head -20
```

Expected: no errors

**Step 7: Commit**

```bash
git add packages/shared/src/types.ts
git commit -m "feat: add file viewer WS message schemas to shared types"
```

---

### Task 4: Add file/annotation WS handlers to ws-handler.ts

**Files:**
- Modify: `packages/server/src/ws-handler.ts`

**Step 1: Add imports** at the top of `ws-handler.ts` (after existing imports):

```ts
import fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { getLibraryDir } from './workspace.js';

const execAsync = promisify(exec);
```

**Step 2: Call cleanup on server start** — in `setupWebSocket`, add this line right after the function signature opens:

```ts
// Purge stale file annotations on startup
db.cleanupOldFileAnnotations(7);
```

**Step 3: Add 4 case blocks** to the `switch (msg.type)` statement (before the `default` case).

**file-open handler:**

```ts
case 'file-open': {
  const { session_id, path: filePath, source } = msg;
  const session = sessionManager.getSession(session_id);
  if (!session) {
    sendToClient(ws, { type: 'file-open-error', session_id, error: 'Session not found' });
    break;
  }
  try {
    const basedir = source === 'workspace' ? session.cwd : getLibraryDir();
    const safePath = await validateWorkspacePath(filePath, basedir);
    const stat = await fs.stat(safePath);
    const ext = safePath.split('.').pop()?.toLowerCase() ?? '';

    const TEXT_EXTS = new Set(['md', 'txt', 'json', 'yaml', 'yml', 'sh', 'py', 'js', 'ts',
      'tsx', 'jsx', 'css', 'htm', 'html', 'csv', 'xml', 'toml', 'ini', 'env', 'log']);

    let format: 'text' | 'html' | 'pdf-binary' | 'unsupported';
    let contentPath = safePath;

    if (TEXT_EXTS.has(ext)) {
      format = 'text';
    } else if (ext === 'pdf') {
      format = 'pdf-binary';
    } else if (ext === 'docx' || ext === 'pptx') {
      const outDir = `/tmp/nb-render-${session_id}`;
      await fs.mkdir(outDir, { recursive: true });
      await execAsync(`libreoffice --headless --convert-to html --outdir "${outDir}" "${safePath}"`);
      const basename = path.basename(safePath).replace(/\.[^.]+$/, '.html');
      contentPath = path.join(outDir, basename);
      format = 'html';
    } else {
      format = 'unsupported';
    }

    sendToClient(ws, { type: 'file-open-meta', session_id, size: stat.size, mtime: stat.mtimeMs, format });

    if (format === 'unsupported') {
      sendToClient(ws, { type: 'file-open-end', session_id, mtime: stat.mtimeMs });
      break;
    }

    const fileContent = await fs.readFile(contentPath);
    const CHUNK_SIZE = 16384;

    if (format === 'pdf-binary') {
      const b64 = fileContent.toString('base64');
      for (let i = 0; i < b64.length; i += CHUNK_SIZE) {
        sendToClient(ws, { type: 'file-chunk', session_id, data: b64.slice(i, i + CHUNK_SIZE), encoding: 'base64' });
      }
    } else {
      const text = fileContent.toString('utf-8');
      for (let i = 0; i < text.length; i += CHUNK_SIZE) {
        sendToClient(ws, { type: 'file-chunk', session_id, data: text.slice(i, i + CHUNK_SIZE), encoding: 'utf8' });
      }
    }

    sendToClient(ws, { type: 'file-open-end', session_id, mtime: stat.mtimeMs });
  } catch (err) {
    sendToClient(ws, { type: 'file-open-error', session_id, error: String(err) });
  }
  break;
}
```

**file-save handler:**

```ts
case 'file-save': {
  const { session_id, path: filePath, source, content, format } = msg;
  const session = sessionManager.getSession(session_id);
  if (!session) {
    sendToClient(ws, { type: 'file-save-error', session_id, error: 'Session not found' });
    break;
  }
  try {
    const basedir = source === 'workspace' ? session.cwd : getLibraryDir();
    const safePath = await validateWorkspacePath(filePath, basedir);
    const ext = safePath.split('.').pop()?.toLowerCase() ?? '';

    if ((ext === 'docx' || ext === 'pptx') && format === 'html') {
      const tmpHtml = `/tmp/nb-save-${session_id}-${Date.now()}.html`;
      await fs.writeFile(tmpHtml, content, 'utf-8');
      await execAsync(`libreoffice --headless --convert-to ${ext} --outdir "${path.dirname(safePath)}" "${tmpHtml}"`);
      await fs.unlink(tmpHtml).catch(() => {});
    } else {
      await fs.writeFile(safePath, content, 'utf-8');
    }

    const stat = await fs.stat(safePath);
    sendToClient(ws, { type: 'file-save-ok', session_id, mtime: stat.mtimeMs });
  } catch (err) {
    sendToClient(ws, { type: 'file-save-error', session_id, error: String(err) });
  }
  break;
}
```

**annotation-load handler:**

```ts
case 'annotation-load': {
  const { session_id, path: filePath } = msg;
  const row = db.getFileAnnotations(session_id, filePath);
  sendToClient(ws, {
    type: 'annotation-data',
    session_id,
    path: filePath,
    content: row?.content ?? '{"items":[],"updatedAt":0}',
    updated_at: row?.updated_at ?? 0,
  });
  break;
}
```

**annotation-sync handler:**

```ts
case 'annotation-sync': {
  const { session_id, path: filePath, content, updated_at } = msg;
  db.upsertFileAnnotations(session_id, filePath, content, updated_at);
  sendToClient(ws, { type: 'annotation-sync-ok', session_id, path: filePath, updated_at });
  break;
}
```

**Step 4: Verify TypeScript compiles**

```bash
cd /home/ubuntu/notebook-ai && npx tsc --project packages/server/tsconfig.json --noEmit 2>&1 | head -20
```

Expected: no errors

**Step 5: Commit**

```bash
git add packages/server/src/ws-handler.ts
git commit -m "feat: add file open/save/annotation WS handlers"
```

---

### Task 5: Add openFile state to uiSlice and store types

**Files:**
- Modify: `packages/web/src/store/types.ts`
- Modify: `packages/web/src/store/uiSlice.ts`

**Step 1: Update `packages/web/src/store/types.ts`**

In the `// ── UI state` section, add:

```ts
openFile: { path: string; source: 'workspace' | 'library'; sessionId: string } | null;
fileViewerMaximized: boolean;
```

In the `// ── UI actions` section, add:

```ts
setOpenFile(file: { path: string; source: 'workspace' | 'library'; sessionId: string } | null): void;
toggleFileViewerMaximized(): void;
```

**Step 2: Update `packages/web/src/store/uiSlice.ts`**

Add `openFile` and `fileViewerMaximized` to the `StateCreator` type params list (first `Pick<NotebookStore, ...>` argument).

Add initial values:

```ts
openFile: null,
fileViewerMaximized: false,
```

Add action implementations:

```ts
setOpenFile(file) {
  set({ openFile: file });
},
toggleFileViewerMaximized() {
  set((s) => ({ fileViewerMaximized: !s.fileViewerMaximized }));
},
```

**Step 3: Verify TypeScript compiles**

```bash
cd /home/ubuntu/notebook-ai && npx tsc --project packages/web/tsconfig.json --noEmit 2>&1 | head -20
```

Expected: no errors

**Step 4: Commit**

```bash
git add packages/web/src/store/types.ts packages/web/src/store/uiSlice.ts
git commit -m "feat: add openFile/fileViewerMaximized to ui store"
```

---

### Task 6: Create FileAnnotation types file

**Files:**
- Create: `packages/web/src/types/fileAnnotations.ts`

**Step 1: Create the file**

```ts
// FileAnnotation types — 4-mode annotation for file viewer

export interface FileAnnotation {
  id: string;                   // uid()
  type: 'insert' | 'delete' | 'replace' | 'comment';
  file_path: string;            // relative path within workspace/library
  selected_text: string;        // anchor snapshot (max 80 chars)
  content?: string;             // insert/replace/comment text
  author: string;
  timestamp: string;            // ISO
  updatedAt: number;            // ms epoch
}

export interface FileAnnotations {
  items: FileAnnotation[];
  updatedAt: number;
}

export const EMPTY_FILE_ANNOTATIONS: FileAnnotations = {
  items: [],
  updatedAt: 0,
};

let _idCounter = 0;
export function uid(): string {
  return `ann_${++_idCounter}_${Date.now()}`;
}

export function storageKey(notebookId: string, filePath: string): string {
  return `file-annotations-${notebookId}-${filePath}`;
}

export function buildAnnotationText(annotations: FileAnnotations): string {
  const { items } = annotations;
  if (items.length === 0) return '';

  const lines: string[] = ['## File Annotations'];
  const byType = {
    insert: items.filter((a) => a.type === 'insert'),
    delete: items.filter((a) => a.type === 'delete'),
    replace: items.filter((a) => a.type === 'replace'),
    comment: items.filter((a) => a.type === 'comment'),
  };

  if (byType.insert.length > 0) {
    lines.push('\n### Insert');
    byType.insert.forEach((a) => lines.push(`- After "${a.selected_text}": ${a.content ?? ''}`));
  }
  if (byType.delete.length > 0) {
    lines.push('\n### Delete');
    byType.delete.forEach((a) => lines.push(`- "${a.selected_text}"`));
  }
  if (byType.replace.length > 0) {
    lines.push('\n### Replace');
    byType.replace.forEach((a) => lines.push(`- "${a.selected_text}" → ${a.content ?? ''}`));
  }
  if (byType.comment.length > 0) {
    lines.push('\n### Comment');
    byType.comment.forEach((a) => lines.push(`- "${a.selected_text}": ${a.content ?? ''}`));
  }

  return lines.join('\n');
}
```

**Step 2: Verify TypeScript compiles**

```bash
cd /home/ubuntu/notebook-ai && npx tsc --project packages/web/tsconfig.json --noEmit 2>&1 | head -10
```

**Step 3: Commit**

```bash
git add packages/web/src/types/fileAnnotations.ts
git commit -m "feat: add FileAnnotation types and helpers"
```

---

### Task 7: Create useFileStream hook

**Files:**
- Create: `packages/web/src/hooks/useFileStream.ts`

This hook watches the WebSocket for `file-open-meta` / `file-chunk` / `file-open-end` / `file-open-error` messages and assembles file content. It checks localStorage before loading to serve cached content instantly.

**Step 1: Create `packages/web/src/hooks/useFileStream.ts`**

```ts
import { useEffect, useRef, useState, useCallback } from 'react';
import { useStore } from '../store';

export type FileFormat = 'text' | 'html' | 'pdf-binary' | 'unsupported';

export interface FileStreamState {
  status: 'idle' | 'loading' | 'complete' | 'error';
  format: FileFormat | null;
  content: string;
  pdfBuffer: Uint8Array | null;
  mtime: number;
  error: string | null;
}

const INITIAL_STATE: FileStreamState = {
  status: 'idle',
  format: null,
  content: '',
  pdfBuffer: null,
  mtime: 0,
  error: null,
};

const THROTTLE_MS = 200;

export function useFileStream(
  sessionId: string | null,
  notebookId: string | null,
  filePath: string | null,
  source: 'workspace' | 'library',
) {
  const ws = useStore((s) => s.ws);
  const [state, setState] = useState<FileStreamState>(INITIAL_STATE);

  const contentRef = useRef('');
  const b64Ref = useRef('');
  const formatRef = useRef<FileFormat | null>(null);
  const throttleRef = useRef<number | null>(null);
  const skipStreamRef = useRef(false);

  const flushState = useCallback(() => {
    setState((prev) => ({
      ...prev,
      content: formatRef.current !== 'pdf-binary' ? contentRef.current : prev.content,
    }));
  }, []);

  const scheduleFlush = useCallback(() => {
    if (throttleRef.current !== null) return;
    throttleRef.current = window.setTimeout(() => {
      throttleRef.current = null;
      flushState();
    }, THROTTLE_MS);
  }, [flushState]);

  useEffect(() => {
    if (!sessionId || !notebookId || !filePath || !ws) return;

    contentRef.current = '';
    b64Ref.current = '';
    formatRef.current = null;
    skipStreamRef.current = false;
    setState({ ...INITIAL_STATE, status: 'loading' });

    // Check localStorage cache
    const cacheKey = `file-content-${notebookId}-${filePath}`;
    let cachedMtime = 0;
    let cachedContent = '';
    let cachedFormat: FileFormat | null = null;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as { content: string; mtime: number; format: FileFormat };
        cachedMtime = parsed.mtime;
        cachedContent = parsed.content;
        cachedFormat = parsed.format;
        formatRef.current = parsed.format;
        contentRef.current = parsed.content;
        // Render cached content immediately while waiting for server
        setState({
          status: 'loading',
          format: parsed.format,
          content: parsed.content,
          pdfBuffer: null,
          mtime: parsed.mtime,
          error: null,
        });
      }
    } catch { /* cache miss */ }

    function handleMessage(event: MessageEvent) {
      let msg: { type: string; session_id?: string; [key: string]: unknown };
      try { msg = JSON.parse(event.data as string); } catch { return; }
      if (msg.session_id !== sessionId) return;

      switch (msg.type) {
        case 'file-open-meta': {
          const { mtime, format } = msg as { mtime: number; format: FileFormat };
          formatRef.current = format;
          // If mtime matches cache, skip streaming — use cached content
          if (mtime === cachedMtime && cachedContent && cachedFormat === format) {
            skipStreamRef.current = true;
            setState({ status: 'complete', format, content: cachedContent, pdfBuffer: null, mtime, error: null });
          } else {
            contentRef.current = '';
            b64Ref.current = '';
          }
          break;
        }
        case 'file-chunk': {
          if (skipStreamRef.current) break;
          const { data, encoding } = msg as { data: string; encoding: 'utf8' | 'base64' };
          if (encoding === 'base64') {
            b64Ref.current += data;
          } else {
            contentRef.current += data;
          }
          scheduleFlush();
          break;
        }
        case 'file-open-end': {
          if (skipStreamRef.current) break;
          if (throttleRef.current !== null) { clearTimeout(throttleRef.current); throttleRef.current = null; }
          const fmt = formatRef.current;
          const mtime = (msg as { mtime: number }).mtime;
          if (fmt === 'pdf-binary') {
            const binary = atob(b64Ref.current);
            const buffer = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) buffer[i] = binary.charCodeAt(i);
            setState({ status: 'complete', format: fmt, content: '', pdfBuffer: buffer, mtime, error: null });
          } else {
            try {
              localStorage.setItem(cacheKey, JSON.stringify({ content: contentRef.current, mtime, format: fmt }));
            } catch { /* storage full */ }
            setState({ status: 'complete', format: fmt ?? 'text', content: contentRef.current, pdfBuffer: null, mtime, error: null });
          }
          break;
        }
        case 'file-open-error': {
          setState((prev) => ({ ...prev, status: 'error', error: (msg as { error: string }).error }));
          break;
        }
      }
    }

    ws.addEventListener('message', handleMessage);
    ws.send(JSON.stringify({ type: 'file-open', session_id: sessionId, path: filePath, source }));

    return () => {
      ws.removeEventListener('message', handleMessage);
      if (throttleRef.current !== null) { clearTimeout(throttleRef.current); throttleRef.current = null; }
    };
  }, [sessionId, notebookId, filePath, source, ws, scheduleFlush]); // eslint-disable-line react-hooks/exhaustive-deps

  return state;
}
```

**Step 2: Verify TypeScript compiles**

```bash
cd /home/ubuntu/notebook-ai && npx tsc --project packages/web/tsconfig.json --noEmit 2>&1 | head -10
```

**Step 3: Commit**

```bash
git add packages/web/src/hooks/useFileStream.ts
git commit -m "feat: add useFileStream hook"
```

---

### Task 8: Create useAnnotationPersistence hook

**Files:**
- Create: `packages/web/src/hooks/useAnnotationPersistence.ts`

Adapted from `/home/ubuntu/cli-online/web/src/hooks/useAnnotationPersistence.ts`. Key difference: L2 uses WebSocket (not HTTP PUT). On load, sends `annotation-load` and listens for `annotation-data` response.

**Step 1: Create `packages/web/src/hooks/useAnnotationPersistence.ts`**

```ts
import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import type { FileAnnotations } from '../types/fileAnnotations';
import { storageKey, EMPTY_FILE_ANNOTATIONS } from '../types/fileAnnotations';

interface UseAnnotationPersistenceArgs {
  sessionId: string;
  notebookId: string;
  filePath: string;
  annotations: FileAnnotations;
  annLoadedRef: React.MutableRefObject<boolean>;
  setAnnotations: React.Dispatch<React.SetStateAction<FileAnnotations>>;
}

/**
 * Dual-layer annotation persistence:
 * - L1: localStorage with 50ms debounce
 * - L2: WebSocket annotation-sync with adaptive interval (max(200ms, latency×3))
 * - Load: L1 instant + L2 async merge (take newer by updatedAt)
 */
export function useAnnotationPersistence({
  sessionId, notebookId, filePath, annotations, annLoadedRef, setAnnotations,
}: UseAnnotationPersistenceArgs) {
  const ws = useStore((s) => s.ws);
  const latency = useStore((s) => s.latency);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const syncTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const syncInFlightRef = useRef(false);

  // L1 + L2 save whenever annotations change
  useEffect(() => {
    if (!annLoadedRef.current || !ws) return;
    const lsKey = storageKey(notebookId, filePath);
    const serialized = JSON.stringify(annotations);

    // L1: 50ms → localStorage
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      try { localStorage.setItem(lsKey, serialized); } catch { /* full */ }
    }, 50);

    // L2: adaptive ≥200ms → WS annotation-sync
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    const syncInterval = Math.max(200, (latency ?? 30) * 3);
    syncTimerRef.current = setTimeout(() => {
      if (syncInFlightRef.current) return;
      syncInFlightRef.current = true;
      ws.send(JSON.stringify({
        type: 'annotation-sync',
        session_id: sessionId,
        path: filePath,
        content: serialized,
        updated_at: annotations.updatedAt,
      }));
      setTimeout(() => { syncInFlightRef.current = false; }, 5000);
    }, syncInterval);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    };
  }, [annotations, sessionId, notebookId, filePath, ws, latency, annLoadedRef]);

  // Load on filePath change: L1 instant + L2 async merge
  useEffect(() => {
    if (!ws) return;
    annLoadedRef.current = false;

    // L1: instant from localStorage
    let localUpdatedAt = 0;
    try {
      const saved = localStorage.getItem(storageKey(notebookId, filePath));
      if (saved) {
        const parsed = JSON.parse(saved) as FileAnnotations;
        setAnnotations(parsed);
        localUpdatedAt = parsed.updatedAt ?? 0;
      } else {
        setAnnotations(EMPTY_FILE_ANNOTATIONS);
      }
    } catch {
      setAnnotations(EMPTY_FILE_ANNOTATIONS);
    }

    // L2: async from server
    function handleMessage(event: MessageEvent) {
      let msg: { type: string; session_id?: string; path?: string; [key: string]: unknown };
      try { msg = JSON.parse(event.data as string); } catch { return; }
      if (msg.type !== 'annotation-data') return;
      if (msg.session_id !== sessionId) return;
      if (msg.path !== filePath) return;

      const serverUpdatedAt = (msg.updated_at as number) ?? 0;
      if (serverUpdatedAt > localUpdatedAt) {
        try {
          const parsed = JSON.parse(msg.content as string) as FileAnnotations;
          setAnnotations(parsed);
          try { localStorage.setItem(storageKey(notebookId, filePath), msg.content as string); } catch { /* full */ }
        } catch { /* corrupt */ }
      }
      annLoadedRef.current = true;
    }

    ws.addEventListener('message', handleMessage);
    ws.send(JSON.stringify({ type: 'annotation-load', session_id: sessionId, path: filePath }));
    annLoadedRef.current = true; // allow saving even while fetch is in flight

    return () => {
      ws.removeEventListener('message', handleMessage);
    };
  }, [sessionId, notebookId, filePath, ws]); // eslint-disable-line react-hooks/exhaustive-deps
}
```

**Step 2: Verify TypeScript compiles**

```bash
cd /home/ubuntu/notebook-ai && npx tsc --project packages/web/tsconfig.json --noEmit 2>&1 | head -10
```

**Step 3: Commit**

```bash
git add packages/web/src/hooks/useAnnotationPersistence.ts
git commit -m "feat: add useAnnotationPersistence hook"
```

---

### Task 9: Build annotation UI components

**Files:**
- Create: `packages/web/src/components/FileSelectionFloat.tsx`
- Create: `packages/web/src/components/FileAnnotationCard.tsx`
- Create: `packages/web/src/components/FileAnnotationDropdown.tsx`

Adapted from `/home/ubuntu/cli-online/web/src/components/{SelectionFloat,AnnotationCard,AnnotationDropdown}.tsx`. Uses project color vars instead of cli-online's `--accent-*` vars.

**Step 1: Create `FileSelectionFloat.tsx`**

```tsx
interface FileSelectionFloatProps {
  x: number;
  y: number;
  onDelete: () => void;
  onReplace: () => void;
  onComment: () => void;
  onInsertAfter: () => void;
}

export function FileSelectionFloat({ x, y, onDelete, onReplace, onComment, onInsertAfter }: FileSelectionFloatProps) {
  return (
    <div className="fv-selection-float" style={{ top: y, left: x }}>
      <button className="fv-sf-btn fv-sf-delete" onMouseDown={(e) => { e.preventDefault(); onDelete(); }} title="Delete">−</button>
      <button className="fv-sf-btn fv-sf-replace" onMouseDown={(e) => { e.preventDefault(); onReplace(); }} title="Replace">⇄</button>
      <button className="fv-sf-btn fv-sf-comment" onMouseDown={(e) => { e.preventDefault(); onComment(); }} title="Comment">?</button>
      <button className="fv-sf-btn fv-sf-insert" onMouseDown={(e) => { e.preventDefault(); onInsertAfter(); }} title="Insert after">+</button>
    </div>
  );
}
```

**Step 2: Create `FileAnnotationCard.tsx`**

```tsx
import { useState, useRef, useEffect, useCallback } from 'react';
import type { FileAnnotation } from '../types/fileAnnotations';

interface FileAnnotationCardProps {
  annotation: FileAnnotation;
  onEdit: (id: string, content: string) => void;
  onRemove: (id: string) => void;
  onSend: (id: string) => void;
}

const TYPE_META = {
  insert:  { label: 'Insert',  color: 'var(--color-completed)' },
  delete:  { label: 'Delete',  color: 'var(--color-error)' },
  replace: { label: 'Replace', color: 'var(--color-primary)' },
  comment: { label: 'Comment', color: 'var(--text-secondary)' },
} as const;

export function FileAnnotationCard({ annotation, onEdit, onRemove, onSend }: FileAnnotationCardProps) {
  const meta = TYPE_META[annotation.type];
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const editRef = useRef<HTMLTextAreaElement>(null);

  const startEdit = useCallback(() => {
    setEditing(true);
    setEditText(annotation.content ?? annotation.selected_text);
  }, [annotation]);

  const saveEdit = useCallback(() => {
    const trimmed = editText.trim();
    if (trimmed) onEdit(annotation.id, trimmed);
    else onRemove(annotation.id);
    setEditing(false);
  }, [editText, annotation.id, onEdit, onRemove]);

  useEffect(() => {
    if (editing) {
      requestAnimationFrame(() => {
        const el = editRef.current;
        if (el) { el.focus(); el.selectionStart = el.selectionEnd = el.value.length; }
      });
    }
  }, [editing]);

  return (
    <div className={`fv-ann-card fv-ann-card--${annotation.type}`}>
      <span className="fv-ann-card__type" style={{ color: meta.color }}>{meta.label}</span>
      <span className="fv-ann-card__anchor">&ldquo;{annotation.selected_text.slice(0, 50)}&rdquo;</span>
      {annotation.content && !editing && (
        <span className="fv-ann-card__content" onDoubleClick={startEdit} title="Double-click to edit">
          {annotation.content}
        </span>
      )}
      {editing && (
        <textarea
          ref={editRef}
          className="fv-ann-card__textarea"
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveEdit(); }
            if (e.key === 'Escape') { e.preventDefault(); setEditing(false); }
          }}
          onBlur={saveEdit}
          rows={3}
        />
      )}
      <div className="fv-ann-card__actions">
        <button className="fv-ann-card__btn" onClick={() => onSend(annotation.id)}>Send</button>
        <button className="fv-ann-card__btn" onClick={startEdit}>✎</button>
        <button className="fv-ann-card__btn fv-ann-card__btn--danger" onClick={() => onRemove(annotation.id)}>×</button>
      </div>
    </div>
  );
}
```

**Step 3: Create `FileAnnotationDropdown.tsx`**

```tsx
import { useState, useEffect, useRef } from 'react';
import type { FileAnnotations } from '../types/fileAnnotations';

interface FileAnnotationDropdownProps {
  annotations: FileAnnotations;
  onSendAll: () => void;
  onSendSingle: (id: string) => void;
  onRemove: (id: string) => void;
}

const TYPE_SYMBOL: Record<string, string> = {
  insert: '+', delete: '−', replace: '⇄', comment: '?',
};

export function FileAnnotationDropdown({ annotations, onSendAll, onSendSingle, onRemove }: FileAnnotationDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const count = annotations.items.length;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (count === 0) return null;

  return (
    <div ref={ref} className="fv-ann-dropdown">
      <button className="fv-ann-dropdown__trigger" onClick={() => setOpen((v) => !v)}>
        {count} annotation{count !== 1 ? 's' : ''} ▾
      </button>
      {open && (
        <div className="fv-ann-dropdown__panel">
          <div className="fv-ann-dropdown__header">
            <button className="fv-ann-dropdown__send-all" onClick={onSendAll}>Send All</button>
          </div>
          <div className="fv-ann-dropdown__list">
            {annotations.items.map((a) => (
              <div key={a.id} className="fv-ann-dropdown__item">
                <span className={`fv-ann-dropdown__type fv-ann-dropdown__type--${a.type}`}>
                  {TYPE_SYMBOL[a.type]}
                </span>
                <span className="fv-ann-dropdown__text">
                  {(a.content ?? a.selected_text).slice(0, 60)}
                </span>
                <button className="fv-ann-dropdown__btn" onClick={() => onSendSingle(a.id)}>Send</button>
                <button className="fv-ann-dropdown__btn fv-ann-dropdown__btn--danger" onClick={() => onRemove(a.id)}>×</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 4: Verify TypeScript compiles**

```bash
cd /home/ubuntu/notebook-ai && npx tsc --project packages/web/tsconfig.json --noEmit 2>&1 | head -10
```

**Step 5: Commit**

```bash
git add packages/web/src/components/FileSelectionFloat.tsx packages/web/src/components/FileAnnotationCard.tsx packages/web/src/components/FileAnnotationDropdown.tsx
git commit -m "feat: add file annotation UI components (SelectionFloat, Card, Dropdown)"
```

---

### Task 10: Build FileViewerStatusBar

**Files:**
- Create: `packages/web/src/components/FileViewerStatusBar.tsx`

**Step 1: Create the file**

```tsx
export type FileFormat = 'text' | 'html' | 'pdf-binary' | 'unsupported';

interface FileViewerStatusBarProps {
  filename: string;
  format: FileFormat | null;
  mode: 'render' | 'edit';
  maximized: boolean;
  onToggleMode: () => void;
  onToggleMaximize: () => void;
  onClose: () => void;
}

const FORMAT_LABEL: Partial<Record<FileFormat, string>> = {
  text: 'Text', html: 'HTML', 'pdf-binary': 'PDF', unsupported: '—',
};

export function FileViewerStatusBar({ filename, format, mode, maximized, onToggleMode, onToggleMaximize, onClose }: FileViewerStatusBarProps) {
  const canEdit = format !== null && format !== 'pdf-binary' && format !== 'unsupported';
  return (
    <div className="fv-statusbar">
      <span className="fv-statusbar__name" title={filename}>{filename}</span>
      {format && <span className="fv-statusbar__format">{FORMAT_LABEL[format] ?? format}</span>}
      <div className="fv-statusbar__actions">
        {canEdit && (
          <button className={`fv-statusbar__btn${mode === 'edit' ? ' active' : ''}`} onClick={onToggleMode}>
            {mode === 'edit' ? 'Preview' : 'Edit'}
          </button>
        )}
        <button className="fv-statusbar__btn" onClick={onToggleMaximize} title={maximized ? 'Restore' : 'Maximize'}>
          {maximized ? '⊡' : '⛶'}
        </button>
        <button className="fv-statusbar__btn fv-statusbar__close" onClick={onClose} title="Close">✕</button>
      </div>
    </div>
  );
}
```

**Step 2: Verify TypeScript compiles**

**Step 3: Commit**

```bash
git add packages/web/src/components/FileViewerStatusBar.tsx
git commit -m "feat: add FileViewerStatusBar component"
```

---

### Task 11: Build FileViewerRender component

**Files:**
- Create: `packages/web/src/components/FileViewerRender.tsx`

Renders file content based on format (md → ReactMarkdown, text → `<pre>`, html → DOMPurify+innerHTML, pdf → react-pdf, unsupported → notice). Shows `FileSelectionFloat` on text selection and inline `FileAnnotationCard`s.

**Step 1: Create `packages/web/src/components/FileViewerRender.tsx`**

```tsx
import { useState, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import DOMPurify from 'dompurify';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import type { FileFormat } from '../hooks/useFileStream';
import type { FileAnnotations, FileAnnotation } from '../types/fileAnnotations';
import { uid, buildAnnotationText } from '../types/fileAnnotations';
import { FileSelectionFloat } from './FileSelectionFloat';
import { FileAnnotationCard } from './FileAnnotationCard';
import { FileAnnotationDropdown } from './FileAnnotationDropdown';

// Set PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

interface FileViewerRenderProps {
  format: FileFormat;
  content: string;
  pdfBuffer: Uint8Array | null;
  filename: string;
  annotations: FileAnnotations;
  filePath: string;
  onAnnotationsChange: (a: FileAnnotations) => void;
  onSendToPrompt: (text: string) => void;
}

export function FileViewerRender({
  format, content, pdfBuffer, filename, annotations, filePath, onAnnotationsChange, onSendToPrompt,
}: FileViewerRenderProps) {
  const [float, setFloat] = useState<{ x: number; y: number; text: string } | null>(null);
  const [pdfPages, setPdfPages] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const isMd = filename.endsWith('.md');

  const addAnnotation = useCallback((type: FileAnnotation['type'], selectedText: string, defaultContent?: string) => {
    const ann: FileAnnotation = {
      id: uid(),
      type,
      file_path: filePath,
      selected_text: selectedText.slice(0, 80),
      content: defaultContent,
      author: 'user',
      timestamp: new Date().toISOString(),
      updatedAt: Date.now(),
    };
    onAnnotationsChange({ items: [...annotations.items, ann], updatedAt: Date.now() });
    setFloat(null);
  }, [annotations, filePath, onAnnotationsChange]);

  const removeAnnotation = useCallback((id: string) => {
    onAnnotationsChange({ items: annotations.items.filter((a) => a.id !== id), updatedAt: Date.now() });
  }, [annotations, onAnnotationsChange]);

  const editAnnotation = useCallback((id: string, newContent: string) => {
    onAnnotationsChange({
      items: annotations.items.map((a) => a.id === id ? { ...a, content: newContent, updatedAt: Date.now() } : a),
      updatedAt: Date.now(),
    });
  }, [annotations, onAnnotationsChange]);

  const handleMouseUp = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) { setFloat(null); return; }
    const text = sel.toString().trim();
    if (!text) { setFloat(null); return; }
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) return;
    setFloat({ x: rect.left - containerRect.left, y: rect.top - containerRect.top - 40, text });
  }, []);

  const handleSendSingle = useCallback((id: string) => {
    const ann = annotations.items.find((a) => a.id === id);
    if (ann) {
      onSendToPrompt(`[File annotation: ${ann.type}] "${ann.selected_text}"${ann.content ? ` → ${ann.content}` : ''}`);
    }
  }, [annotations, onSendToPrompt]);

  const handleSendAll = useCallback(() => {
    onSendToPrompt(buildAnnotationText(annotations));
  }, [annotations, onSendToPrompt]);

  return (
    <div ref={containerRef} className="fv-render" onMouseUp={handleMouseUp}>
      {/* Annotation dropdown — top-right corner */}
      <div className="fv-render__ann-overlay">
        <FileAnnotationDropdown
          annotations={annotations}
          onSendAll={handleSendAll}
          onSendSingle={handleSendSingle}
          onRemove={removeAnnotation}
        />
      </div>

      {/* Selection float */}
      {float && (
        <FileSelectionFloat
          x={float.x}
          y={float.y}
          onDelete={() => addAnnotation('delete', float.text)}
          onReplace={() => addAnnotation('replace', float.text, '(replacement)')}
          onComment={() => addAnnotation('comment', float.text, '(comment)')}
          onInsertAfter={() => addAnnotation('insert', float.text, '(insert content)')}
        />
      )}

      {/* File content */}
      {format === 'text' && isMd && (
        <div className="fv-render__markdown">
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
      )}
      {format === 'text' && !isMd && (
        <pre className="fv-render__text">{content}</pre>
      )}
      {format === 'html' && (
        <div
          className="fv-render__html"
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content) }}
        />
      )}
      {format === 'unsupported' && (
        <div className="fv-render__unsupported">
          <p>This file format is not supported for preview.</p>
        </div>
      )}
      {format === 'pdf-binary' && pdfBuffer && (
        <Document
          file={{ data: pdfBuffer }}
          onLoadSuccess={({ numPages }) => setPdfPages(numPages)}
          className="fv-render__pdf"
        >
          {Array.from({ length: pdfPages }, (_, i) => (
            <Page key={i + 1} pageNumber={i + 1} renderTextLayer={true} renderAnnotationLayer={false} />
          ))}
        </Document>
      )}

      {/* Inline annotation cards */}
      {annotations.items.length > 0 && (
        <div className="fv-render__ann-cards">
          {annotations.items.map((a) => (
            <FileAnnotationCard
              key={a.id}
              annotation={a}
              onEdit={editAnnotation}
              onRemove={removeAnnotation}
              onSend={handleSendSingle}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Verify TypeScript compiles**

```bash
cd /home/ubuntu/notebook-ai && npx tsc --project packages/web/tsconfig.json --noEmit 2>&1 | head -20
```

**Step 3: Commit**

```bash
git add packages/web/src/components/FileViewerRender.tsx
git commit -m "feat: add FileViewerRender component"
```

---

### Task 12: Build FileViewerEditor (TipTap)

**Files:**
- Create: `packages/web/src/components/FileViewerEditor.tsx`

TipTap rich-text editor for md/text/docx/pptx edit mode. Sends `file-save` WS message on Save click. Listens for `file-save-ok` / `file-save-error`.

**Step 1: Create `packages/web/src/components/FileViewerEditor.tsx`**

```tsx
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useState, useEffect, useCallback } from 'react';
import { useStore } from '../store';

interface FileViewerEditorProps {
  content: string;
  format: 'text' | 'html';
  sessionId: string;
  filePath: string;
  source: 'workspace' | 'library';
}

export function FileViewerEditor({ content, format, sessionId, filePath, source }: FileViewerEditorProps) {
  const ws = useStore((s) => s.ws);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  const editor = useEditor({
    extensions: [StarterKit],
    content: format === 'html' ? content : `<pre><code>${content}</code></pre>`,
  });

  useEffect(() => {
    if (!ws) return;
    function handleMessage(event: MessageEvent) {
      let msg: { type: string; session_id?: string };
      try { msg = JSON.parse(event.data as string); } catch { return; }
      if (msg.session_id !== sessionId) return;
      if (msg.type === 'file-save-ok') {
        setSaving(false);
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } else if (msg.type === 'file-save-error') {
        setSaving(false);
        setSaveStatus('error');
      }
    }
    ws.addEventListener('message', handleMessage);
    return () => ws.removeEventListener('message', handleMessage);
  }, [ws, sessionId]);

  const handleSave = useCallback(() => {
    if (!editor || !ws) return;
    setSaving(true);
    setSaveStatus('idle');
    ws.send(JSON.stringify({
      type: 'file-save',
      session_id: sessionId,
      path: filePath,
      source,
      content: editor.getHTML(),
      format: 'html',
    }));
  }, [editor, ws, sessionId, filePath, source]);

  return (
    <div className="fv-editor">
      <div className="fv-editor__toolbar">
        <button className="fv-editor__save" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : saveStatus === 'saved' ? 'Saved ✓' : saveStatus === 'error' ? 'Error ✕' : 'Save'}
        </button>
      </div>
      <EditorContent editor={editor} className="fv-editor__content" />
    </div>
  );
}
```

**Step 2: Verify TypeScript compiles**

**Step 3: Commit**

```bash
git add packages/web/src/components/FileViewerEditor.tsx
git commit -m "feat: add FileViewerEditor (TipTap)"
```

---

### Task 13: Build FileViewer main shell

**Files:**
- Create: `packages/web/src/components/FileViewer.tsx`

Reads `openFile` from store, orchestrates `useFileStream` + `useAnnotationPersistence`, renders `FileViewerStatusBar` + render/edit modes.

**Step 1: Create `packages/web/src/components/FileViewer.tsx`**

```tsx
import { useState, useRef } from 'react';
import { useStore } from '../store';
import { useFileStream } from '../hooks/useFileStream';
import { useAnnotationPersistence } from '../hooks/useAnnotationPersistence';
import type { FileAnnotations } from '../types/fileAnnotations';
import { EMPTY_FILE_ANNOTATIONS, buildAnnotationText } from '../types/fileAnnotations';
import { FileViewerStatusBar } from './FileViewerStatusBar';
import { FileViewerRender } from './FileViewerRender';
import { FileViewerEditor } from './FileViewerEditor';

export function FileViewer() {
  const openFile = useStore((s) => s.openFile);
  const fileViewerMaximized = useStore((s) => s.fileViewerMaximized);
  const setOpenFile = useStore((s) => s.setOpenFile);
  const toggleFileViewerMaximized = useStore((s) => s.toggleFileViewerMaximized);
  const activeNotebookId = useStore((s) => s.activeNotebookId);
  const submitPrompt = useStore((s) => s.submitPrompt);

  const [mode, setMode] = useState<'render' | 'edit'>('render');
  const [annotations, setAnnotations] = useState<FileAnnotations>(EMPTY_FILE_ANNOTATIONS);
  const annLoadedRef = useRef(false);

  const fileState = useFileStream(
    openFile?.sessionId ?? null,
    activeNotebookId,
    openFile?.path ?? null,
    openFile?.source ?? 'workspace',
  );

  useAnnotationPersistence({
    sessionId: openFile?.sessionId ?? '',
    notebookId: activeNotebookId ?? '',
    filePath: openFile?.path ?? '',
    annotations,
    annLoadedRef,
    setAnnotations,
  });

  if (!openFile) return null;

  const filename = openFile.path.split('/').pop() ?? openFile.path;
  const canEdit = fileState.format !== null && fileState.format !== 'pdf-binary' && fileState.format !== 'unsupported';

  return (
    <div className={`file-viewer${fileViewerMaximized ? ' file-viewer--maximized' : ''}`}>
      <FileViewerStatusBar
        filename={filename}
        format={fileState.format}
        mode={mode}
        maximized={fileViewerMaximized}
        onToggleMode={() => { if (canEdit) setMode((m) => m === 'render' ? 'edit' : 'render'); }}
        onToggleMaximize={toggleFileViewerMaximized}
        onClose={() => setOpenFile(null)}
      />
      {fileState.status === 'loading' && <div className="fv-loading">Loading…</div>}
      {fileState.status === 'error' && <div className="fv-error">Error: {fileState.error}</div>}
      {fileState.status === 'complete' && mode === 'render' && (
        <FileViewerRender
          format={fileState.format!}
          content={fileState.content}
          pdfBuffer={fileState.pdfBuffer}
          filename={filename}
          annotations={annotations}
          filePath={openFile.path}
          onAnnotationsChange={setAnnotations}
          onSendToPrompt={submitPrompt}
        />
      )}
      {fileState.status === 'complete' && mode === 'edit' && canEdit && (
        <FileViewerEditor
          content={fileState.content}
          format={fileState.format === 'html' ? 'html' : 'text'}
          sessionId={openFile.sessionId}
          filePath={openFile.path}
          source={openFile.source}
        />
      )}
    </div>
  );
}
```

**Step 2: Verify TypeScript compiles**

```bash
cd /home/ubuntu/notebook-ai && npx tsc --project packages/web/tsconfig.json --noEmit 2>&1 | head -20
```

**Step 3: Commit**

```bash
git add packages/web/src/components/FileViewer.tsx
git commit -m "feat: add FileViewer main shell component"
```

---

### Task 14: Update App.tsx layout for split view

**Files:**
- Modify: `packages/web/src/App.tsx`

When `openFile` is set, the layout changes:
- `.app-body` gets class `app-body--viewer-open` (CSS collapses sidebar to icon-only)
- `<main>` wraps its content in `.content-split--active` (flex row)
- `.notebook-area` holds the existing notebook content (hidden when maximized)
- `<FileViewer />` renders alongside (hidden when maximized → takes full width instead)

**Step 1: Add import** at the top of App.tsx:

```tsx
import { FileViewer } from './components/FileViewer';
```

**Step 2: Add store selectors** in `AuthenticatedApp` (after existing selectors):

```tsx
const openFile = useStore((s) => s.openFile);
const fileViewerMaximized = useStore((s) => s.fileViewerMaximized);
```

**Step 3: Replace the `.app-body` div** in `AuthenticatedApp` render:

Old:
```tsx
<div className={`app-body${filesPanelOpen ? ' app-body--files-open' : ''}`}>
  <Sidebar />
  <main ref={contentRef} className="app-content">
    {notebookLoading ? (
      <NotebookLoadingScreen />
    ) : creatingNotebook ? (
      <NotebookCreationPanel />
    ) : hasNotebook ? (
      <Notebook />
    ) : (
      <WelcomeScreen />
    )}
  </main>
  <FilesPanel />
</div>
```

New:
```tsx
<div className={[
  'app-body',
  filesPanelOpen ? 'app-body--files-open' : '',
  openFile ? 'app-body--viewer-open' : '',
].filter(Boolean).join(' ')}>
  <Sidebar />
  <main ref={contentRef} className="app-content">
    <div className={`content-split${openFile ? ' content-split--active' : ''}`}>
      <div className={`notebook-area${fileViewerMaximized && openFile ? ' notebook-area--hidden' : ''}`}>
        {notebookLoading ? (
          <NotebookLoadingScreen />
        ) : creatingNotebook ? (
          <NotebookCreationPanel />
        ) : hasNotebook ? (
          <Notebook />
        ) : (
          <WelcomeScreen />
        )}
      </div>
      {openFile && <FileViewer />}
    </div>
  </main>
  <FilesPanel />
</div>
```

**Step 4: Verify TypeScript compiles**

```bash
cd /home/ubuntu/notebook-ai && npx tsc --project packages/web/tsconfig.json --noEmit 2>&1 | head -20
```

**Step 5: Commit**

```bash
git add packages/web/src/App.tsx
git commit -m "feat: update App.tsx layout for file viewer split"
```

---

### Task 15: Add file click handler to FilesPanel

**Files:**
- Modify: `packages/web/src/components/FilesPanel.tsx`

`FileSection` (the inner component, lines ~171-460) renders file entries. We need to add an `onFileClick` prop and wire it up. The parent `FilesPanel` passes the callback using `setOpenFile` from the store.

**Step 1: Read FilesPanel.tsx lines 460-530** to confirm the outer `FilesPanel` component structure before editing.

**Step 2: Add `onFileClick` prop to `FileSectionProps` interface** (after `workspaceDir?: string | null`):

```ts
onFileClick?: (subPath: string, filename: string) => void;
```

**Step 3: Destructure `onFileClick` in `FileSection` function params**

**Step 4: Add click handler on file entries** — in the file entry div (around line 433), add:

```tsx
onClick={() => onFileClick?.(subPath, f.name)}
style={{ cursor: onFileClick ? 'pointer' : undefined }}
```

The full relative path to pass: `subPath === '.' ? f.name : \`${subPath}/${f.name}\``

**Step 5: Update `FilesPanel` outer component** — add store access and pass callback:

```tsx
const setOpenFile = useStore((s) => s.setOpenFile);
const sessionId = useStore((s) => s.sessionId);
```

Pass `onFileClick` to each `FileSection`:

```tsx
// workspace section:
<FileSection
  baseUrl="/api/workspace"
  authToken={authToken}
  workspaceDir={workspaceDir}
  onFileClick={(subPath, name) => {
    if (!sessionId) return;
    const relPath = subPath === '.' ? name : `${subPath}/${name}`;
    setOpenFile({ path: relPath, source: 'workspace', sessionId });
  }}
/>

// library section:
<FileSection
  baseUrl="/api/library"
  authToken={authToken}
  showDownloadAll
  dropLabel="Drop to add to Library"
  workspaceDir={workspaceDir}
  onFileClick={(subPath, name) => {
    if (!sessionId) return;
    const relPath = subPath === '.' ? name : `${subPath}/${name}`;
    setOpenFile({ path: relPath, source: 'library', sessionId });
  }}
/>
```

**Step 6: Verify TypeScript compiles**

```bash
cd /home/ubuntu/notebook-ai && npx tsc --project packages/web/tsconfig.json --noEmit 2>&1 | head -20
```

**Step 7: Commit**

```bash
git add packages/web/src/components/FilesPanel.tsx
git commit -m "feat: add file click handler to FilesPanel"
```

---

### Task 16: Remove notebook-level annotation system from cells

**Files:**
- Modify: `packages/web/src/store/notebookSlice.ts` (remove addAnnotation/removeAnnotation implementations)
- Modify: `packages/web/src/store/types.ts` (remove addAnnotation/removeAnnotation from interface)
- Modify: `packages/web/src/components/Notebook.tsx` (verify no annotation components remain)

Note: keep `annotations` field in `packages/shared/src/types.ts` (Zod schema) for backward compatibility with saved notebook files.

**Step 1: Read `packages/web/src/store/notebookSlice.ts`** to find `addAnnotation` and `removeAnnotation`.

**Step 2: Remove `addAnnotation` and `removeAnnotation`** from `notebookSlice.ts` implementation.

**Step 3: Remove from `types.ts`** — delete these two lines from the `// ── Annotation actions` section:

```ts
addAnnotation(annotation: Annotation): void;
removeAnnotation(annotationId: string): void;
```

Also remove `Annotation` from the import list in `types.ts` if it's no longer used.

**Step 4: Read Notebook.tsx lines 1-50** to check for any annotation component imports.

**Step 5: Remove any remaining annotation imports/usage** from Notebook.tsx if present.

**Step 6: Check for orphaned annotation component files**

```bash
ls /home/ubuntu/notebook-ai/packages/web/src/components/ | grep -i annot
ls /home/ubuntu/notebook-ai/packages/web/src/components/ | grep -i selection
```

If `Annotations.tsx`, `AnnotationCard.tsx`, or `SelectionFloat.tsx` (notebook versions) exist and are unused, delete them.

**Step 7: Verify TypeScript compiles**

```bash
cd /home/ubuntu/notebook-ai && npx tsc --project packages/web/tsconfig.json --noEmit 2>&1 | head -20
```

**Step 8: Commit**

```bash
git add packages/web/src/store/notebookSlice.ts packages/web/src/store/types.ts packages/web/src/components/Notebook.tsx
git commit -m "chore: remove notebook-level annotation system"
```

---

### Task 17: Add CSS for FileViewer and annotation system

**Files:**
- Modify: `packages/web/src/styles.css`

Append the following styles at the end of `styles.css`:

**Layout — file viewer split:**

```css
/* ── File Viewer Split Layout ──────────────────────────────────────── */

/* Sidebar collapses to icon-only when viewer is open */
.app-body--viewer-open .sidebar {
  width: 48px;
  overflow: hidden;
}
.app-body--viewer-open .sidebar-notebook-list,
.app-body--viewer-open .sidebar-nav-label {
  display: none;
}

/* Content split container */
.content-split {
  display: contents;
}
.content-split--active {
  display: flex;
  flex-direction: row;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* Notebook area when split */
.notebook-area {
  flex: 1;
  min-width: 320px;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}
.notebook-area--hidden {
  display: none;
}

/* ── FileViewer Container ────────────────────────────────────────────── */
.file-viewer {
  width: 45%;
  min-width: 320px;
  max-width: 900px;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--border-default);
  background: var(--bg-page);
  overflow: hidden;
  flex-shrink: 0;
}
.file-viewer--maximized {
  width: 100%;
  max-width: 100%;
}

/* ── FileViewerStatusBar ─────────────────────────────────────────────── */
.fv-statusbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: var(--toolbar-bg);
  color: var(--toolbar-text);
  font-size: 13px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--toolbar-border);
}
.fv-statusbar__name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}
.fv-statusbar__format {
  font-size: 11px;
  opacity: 0.55;
  padding: 1px 6px;
  background: rgba(255,255,255,0.08);
  border-radius: 3px;
}
.fv-statusbar__actions {
  display: flex;
  gap: 4px;
}
.fv-statusbar__btn {
  background: rgba(255,255,255,0.07);
  border: none;
  color: var(--toolbar-text);
  padding: 3px 9px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}
.fv-statusbar__btn:hover {
  background: rgba(255,255,255,0.15);
}
.fv-statusbar__btn.active {
  background: var(--color-primary);
}
.fv-statusbar__close {
  color: rgba(255,255,255,0.45);
}

/* ── FileViewerRender ────────────────────────────────────────────────── */
.fv-render {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
  position: relative;
}
.fv-render__text {
  white-space: pre-wrap;
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-primary);
}
.fv-render__markdown,
.fv-render__html {
  font-size: 14px;
  line-height: 1.7;
  color: var(--text-primary);
}
.fv-render__markdown h1, .fv-render__markdown h2, .fv-render__markdown h3 {
  font-family: var(--font-display);
}
.fv-render__unsupported {
  padding: 60px 24px;
  text-align: center;
  color: var(--text-secondary);
}
.fv-render__pdf {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.fv-render__ann-overlay {
  position: sticky;
  top: 8px;
  float: right;
  z-index: 10;
  margin-bottom: -32px;
}
.fv-render__ann-cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--border-default);
}
.fv-loading {
  padding: 60px;
  text-align: center;
  color: var(--text-secondary);
}
.fv-error {
  padding: 60px;
  text-align: center;
  color: var(--color-error);
}

/* ── FileSelectionFloat ──────────────────────────────────────────────── */
.fv-selection-float {
  position: absolute;
  display: flex;
  gap: 2px;
  z-index: 200;
  background: var(--toolbar-bg);
  border-radius: 6px;
  padding: 3px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.25);
}
.fv-sf-btn {
  border: none;
  background: transparent;
  color: var(--toolbar-text);
  padding: 3px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
}
.fv-sf-btn:hover { background: rgba(255,255,255,0.12); }
.fv-sf-delete:hover { color: var(--color-error); }
.fv-sf-replace:hover { color: var(--color-primary); }
.fv-sf-comment:hover { color: var(--text-secondary); }
.fv-sf-insert:hover { color: var(--color-completed); }

/* ── FileAnnotationCard ──────────────────────────────────────────────── */
.fv-ann-card {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid var(--border-default);
  border-left-width: 3px;
  background: var(--bg-cell);
  font-size: 13px;
}
.fv-ann-card--insert { border-left-color: var(--color-completed); }
.fv-ann-card--delete { border-left-color: var(--color-error); }
.fv-ann-card--replace { border-left-color: var(--color-primary); }
.fv-ann-card--comment { border-left-color: var(--text-secondary); }
.fv-ann-card__type {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  flex-shrink: 0;
}
.fv-ann-card__anchor {
  flex: 1;
  min-width: 0;
  font-style: italic;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fv-ann-card__content {
  width: 100%;
  color: var(--text-primary);
  white-space: pre-wrap;
  cursor: text;
}
.fv-ann-card__textarea {
  width: 100%;
  resize: vertical;
  font-family: var(--font-sans);
  font-size: 13px;
  border: 1px solid var(--border-default);
  border-radius: 4px;
  padding: 4px 6px;
}
.fv-ann-card__actions {
  display: flex;
  gap: 4px;
  margin-left: auto;
  flex-shrink: 0;
}
.fv-ann-card__btn {
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 2px 7px;
  border-radius: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}
.fv-ann-card__btn:hover { background: var(--bg-cell-hover); color: var(--text-primary); }
.fv-ann-card__btn--danger:hover { color: var(--color-error); }

/* ── FileAnnotationDropdown ──────────────────────────────────────────── */
.fv-ann-dropdown {
  position: relative;
}
.fv-ann-dropdown__trigger {
  border: none;
  background: var(--color-primary-light);
  color: var(--color-primary);
  padding: 4px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
}
.fv-ann-dropdown__trigger:hover {
  background: var(--color-primary-ring);
}
.fv-ann-dropdown__panel {
  position: absolute;
  right: 0;
  top: calc(100% + 4px);
  width: 300px;
  background: var(--bg-cell);
  border: 1px solid var(--border-default);
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.12);
  z-index: 300;
}
.fv-ann-dropdown__header {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-default);
}
.fv-ann-dropdown__send-all {
  border: none;
  background: var(--color-primary);
  color: white;
  padding: 4px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}
.fv-ann-dropdown__list {
  max-height: 300px;
  overflow-y: auto;
  padding: 4px 0;
}
.fv-ann-dropdown__item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 12px;
}
.fv-ann-dropdown__item:hover { background: var(--bg-cell-hover); }
.fv-ann-dropdown__type { font-weight: 700; flex-shrink: 0; }
.fv-ann-dropdown__type--insert { color: var(--color-completed); }
.fv-ann-dropdown__type--delete { color: var(--color-error); }
.fv-ann-dropdown__type--replace { color: var(--color-primary); }
.fv-ann-dropdown__type--comment { color: var(--text-secondary); }
.fv-ann-dropdown__text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-secondary);
}
.fv-ann-dropdown__btn {
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 11px;
  color: var(--text-secondary);
  flex-shrink: 0;
}
.fv-ann-dropdown__btn:hover { background: var(--bg-cell-hover); color: var(--text-primary); }
.fv-ann-dropdown__btn--danger:hover { color: var(--color-error); }

/* ── FileViewerEditor ────────────────────────────────────────────────── */
.fv-editor {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
}
.fv-editor__toolbar {
  padding: 8px 14px;
  border-bottom: 1px solid var(--border-default);
  flex-shrink: 0;
  background: var(--bg-page);
}
.fv-editor__save {
  background: var(--color-primary);
  color: white;
  border: none;
  padding: 5px 16px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 13px;
}
.fv-editor__save:disabled { opacity: 0.5; cursor: not-allowed; }
.fv-editor__save:hover:not(:disabled) { background: var(--color-primary-dark); }
.fv-editor__content {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}
.fv-editor__content .ProseMirror {
  outline: none;
  min-height: 200px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--text-primary);
}
```

**Step 1: Check what sidebar label classes exist**

```bash
grep -n "sidebar-nav-label\|sidebar-notebook-list\|class.*sidebar" /home/ubuntu/notebook-ai/packages/web/src/components/Sidebar.tsx | head -20
```

Adjust the CSS selector `.app-body--viewer-open .sidebar-nav-label` to match the actual class names found.

**Step 2: Append the CSS block** to the end of `packages/web/src/styles.css`.

**Step 3: Restart dev server and visually verify**

```bash
cd /home/ubuntu/notebook-ai && ./restart.sh
```

Open the browser, click a file in the Files panel, and verify:
- Layout splits correctly
- FileViewer appears on the right
- Sidebar collapses
- Text selection shows the float toolbar
- Annotations persist on reload

**Step 4: Commit**

```bash
git add packages/web/src/styles.css
git commit -m "feat: add FileViewer and annotation CSS styles"
```

---

## Summary of all new/modified files

| Task | File | Action |
|------|------|--------|
| 1 | `packages/web/package.json` | Add react-pdf, tiptap, dompurify |
| 2 | `packages/server/src/db.ts` | Add file_annotations table + methods |
| 2 | `packages/server/src/__tests__/db-file-annotations.test.ts` | New unit tests |
| 3 | `packages/shared/src/types.ts` | Add 12 new WS message schemas |
| 4 | `packages/server/src/ws-handler.ts` | Add 4 new WS handlers |
| 5 | `packages/web/src/store/types.ts` | Add openFile, fileViewerMaximized |
| 5 | `packages/web/src/store/uiSlice.ts` | Implement new state/actions |
| 6 | `packages/web/src/types/fileAnnotations.ts` | New: annotation types + helpers |
| 7 | `packages/web/src/hooks/useFileStream.ts` | New: streaming file loader hook |
| 8 | `packages/web/src/hooks/useAnnotationPersistence.ts` | New: L1+L2 annotation sync hook |
| 9 | `packages/web/src/components/FileSelectionFloat.tsx` | New |
| 9 | `packages/web/src/components/FileAnnotationCard.tsx` | New |
| 9 | `packages/web/src/components/FileAnnotationDropdown.tsx` | New |
| 10 | `packages/web/src/components/FileViewerStatusBar.tsx` | New |
| 11 | `packages/web/src/components/FileViewerRender.tsx` | New |
| 12 | `packages/web/src/components/FileViewerEditor.tsx` | New |
| 13 | `packages/web/src/components/FileViewer.tsx` | New |
| 14 | `packages/web/src/App.tsx` | Split layout + FileViewer mount |
| 15 | `packages/web/src/components/FilesPanel.tsx` | Add file click handler |
| 16 | `packages/web/src/store/notebookSlice.ts` | Remove annotation actions |
| 16 | `packages/web/src/store/types.ts` | Remove annotation actions |
| 17 | `packages/web/src/styles.css` | Add FileViewer + annotation CSS |
