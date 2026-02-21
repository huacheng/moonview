# File Viewer Design

**Date:** 2026-02-21
**Reference implementation:** `/home/ubuntu/cli-online`

---

## Goal

When a file is clicked in the FilesPanel, open a FileViewer panel alongside the Notebook. The FileViewer renders the file, supports a four-mode annotation system (insert / delete / replace / comment), and optionally a TipTap rich-text edit mode. All file I/O and annotation sync go through the existing WebSocket connection.

---

## Supported Formats

| Format | Render | Annotate | Edit |
|--------|--------|----------|------|
| md     | react-markdown | ✅ | ✅ TipTap |
| text   | `<pre>` | ✅ | ✅ TipTap |
| docx   | LibreOffice → HTML | ✅ | ✅ TipTap |
| pptx   | LibreOffice → HTML | ✅ | ✅ TipTap |
| pdf    | react-pdf (text layer) | ✅ | ❌ |
| binary | — | ❌ | ❌ (shows unsupported notice) |

---

## Layout Change

```
app-body (flex row)
├─ .sidebar          (收缩: 48px icon-only when FileViewer open)
├─ .app-content      (flex row when FileViewer open)
│   ├─ .notebook-area   (flex: 1, min-width: 320px)
│   └─ .file-viewer     (width: 45%, or maximized: flex:1 replaces notebook)
└─ .files-panel      (stays open, 288px)
```

Maximized: `.file-viewer--maximized` takes full `.app-content` width; notebook-area hidden.

Store additions (uiSlice):
```ts
openFile: { path: string; source: 'workspace' | 'library'; sessionId: string } | null
fileViewerMaximized: boolean
setOpenFile(file: ... | null): void
toggleFileViewerMaximized(): void
```

---

## WebSocket Protocol (All File I/O)

All file operations extend the existing WS connection (`ws-handler.ts`). No new HTTP endpoints for file content or annotations.

### File Loading

```
C→S  { type: 'file-open', path, source, sessionId }

S→C  { type: 'file-open-meta', size, mtime, format }
       format: 'text' | 'html' | 'pdf-binary' | 'unsupported'
       (docx/pptx: server runs LibreOffice first, then streams HTML)

S→C  { type: 'file-chunk', data: string, encoding: 'utf8' | 'base64' }
       × N  (chunk size ≈ 16 KB)

S→C  { type: 'file-open-end', mtime }
   OR { type: 'file-open-error', error }
```

### File Save (Edit Mode)

```
C→S  { type: 'file-save', path, source, sessionId,
        content: string, format: 'text' | 'html' }
       (docx/pptx: content is TipTap HTML, server runs LibreOffice to convert back)

S→C  { type: 'file-save-ok', mtime }
   OR { type: 'file-save-error', error }
```

### Annotation Sync

```
C→S  { type: 'annotation-load', path, sessionId }
S→C  { type: 'annotation-data', content: string, updatedAt: number }

C→S  { type: 'annotation-sync', path, sessionId,
        content: string, updatedAt: number }
S→C  { type: 'annotation-sync-ok', updatedAt }
```

---

## Annotation System (ported from cli-online)

### Data Model

```ts
interface FileAnnotation {
  id: string                  // uid() = ann_${++counter}_${Date.now()}
  type: 'insert' | 'delete' | 'replace' | 'comment'
  file_path: string           // relative to workspace/library root
  selected_text: string       // anchor snapshot (max 80 chars)
  content?: string            // insert/replace/comment text
  author: string
  timestamp: string           // ISO
  updatedAt: number           // ms epoch, for L1/L2 merge
}
```

### Dual-Layer Persistence (ported directly)

```
User action (create / edit / delete annotation)
  │
  ├─ L1: 50ms debounce → localStorage
  │       key: file-annotations-{notebookId}-{filePath}
  │
  └─ L2: adaptive debounce = max(200ms, latency × 3)
          → WS { type: 'annotation-sync', ... }
          → Server SQLite upsert (same schema as cli-online)
          inflight guard prevents concurrent sends

Load strategy:
  1. Sync read from localStorage → render immediately
  2. WS { type: 'annotation-load' } → server returns latest
  3. Compare updatedAt → take newer, update L1 if server is newer
```

### Server-Side Storage

New SQLite table in `db.ts`:

```sql
CREATE TABLE IF NOT EXISTS file_annotations (
  session_name TEXT NOT NULL,
  file_path    TEXT NOT NULL,
  content      TEXT NOT NULL DEFAULT '{}',
  updated_at   INTEGER NOT NULL,
  PRIMARY KEY (session_name, file_path)
);
CREATE INDEX IF NOT EXISTS idx_fa_updated_at ON file_annotations(updated_at);
```

Cleanup: entries older than 7 days purged on server start.

### UI Components

Ported from cli-online with adaptations:

| Component | Source | Changes |
|-----------|--------|---------|
| `FileSelectionFloat` | `SelectionFloat.tsx` | inject callbacks instead of hardcoded notebook actions |
| `FileAnnotationCard` | `AnnotationCard.tsx` | 4 types, "Send" forwards to notebook prompt |
| `FileAnnotationDropdown` | `AnnotationDropdown.tsx` | summary + "Send All" button |
| `useAnnotationPersistence` | hook in cli-online | L2 uses WS instead of HTTP PUT |
| `useFileStream` | `useFileStream.ts` | accumulate chunks, mtime-based cache invalidation |

**Annotation → Prompt forwarding** (instead of cli-online's terminal execute):
- "Send" / "Send All" calls `forwardToPrompt(buildAnnotationText(annotations))`
- Same `buildAnnotationJson` helper logic from cli-online

### Annotation in Render Mode

- md/text/docx/pptx: full SelectionFloat (delete / replace / comment / insert zones between blocks)
- pdf: SelectionFloat on react-pdf text layer (delete / replace / comment only; no insert zones)
- Edit mode: annotation system disabled, TipTap active

---

## File Loading & Caching

### useFileStream hook (ported from cli-online)

```ts
// Modes
type StreamMode = 'text' | 'html' | 'pdf-binary'

// On file-open:
// 1. Read localStorage: key = file-content-{notebookId}-{filePath}
// 2. { content, mtime } from cache → render immediately if hit
// 3. Send WS file-open-request
// 4. On file-open-meta: if mtime matches cache → skip stream, use cache
// 5. Accumulate chunks (200ms throttle on state updates)
// 6. On file-open-end: write to localStorage, render final
```

Cache invalidation: `mtime` mismatch forces full re-stream.

### File Edit Cache (same dual-layer)

```
TipTap onChange
  ├─ 50ms → localStorage (key: file-edit-{notebookId}-{filePath})
  └─ adaptive ≥200ms → WS file-save
```

---

## FileViewer Component Tree

```
<FileViewer>
  <FileViewerStatusBar>
    filename | mode badge | [Edit|Preview] toggle | [⛶] maximize | [✕] close
  </FileViewerStatusBar>

  {mode === 'render' && (
    <FileViewerRender>
      {format === 'md'}    → <ReactMarkdown> + annotation overlay
      {format === 'text'}  → <pre> + annotation overlay
      {format === 'html'}  → dangerouslySetInnerHTML (DOMPurify) + annotation overlay
      {format === 'pdf'}   → <Document> from react-pdf (textLayer=true) + annotation overlay
      {format === 'unsupported'} → notice banner

      <FileSelectionFloat />          // appears on text selection
      <FileAnnotationDropdown />      // top-right summary badge
      {insertZones}                   // between blocks (not for pdf)
      {annotationCards}               // inline cards per annotation
    </FileViewerRender>
  )}

  {mode === 'edit' && format !== 'pdf' && (
    <FileViewerEditor>
      <TipTap editor />
      <SaveButton />                 // triggers WS file-save
    </FileViewerEditor>
  )}
</FileViewer>
```

---

## Remove Notebook Annotations

- Remove `<Annotations>` wrapper from cell render in `Notebook.tsx`
- Remove `<SelectionFloat>` from cell area
- Remove `addAnnotation` / `removeAnnotation` from `notebookSlice.ts`
- Remove `annotations: Annotation[]` field from the in-memory notebook state
  (keep in shared Zod schema for backward compat with saved files)
- `Annotations.tsx`, `AnnotationCard.tsx`, `SelectionFloat.tsx` → moved/repurposed
  for FileViewer only (renamed with `File` prefix)

---

## Backend Changes Summary

### ws-handler.ts

New message handlers:
- `file-open` → detect format, run LibreOffice if needed, stream chunks
- `file-save` → write file (LibreOffice convert if html→docx/pptx)
- `annotation-load` → query SQLite, return JSON
- `annotation-sync` → upsert SQLite

### db.ts

- Add `file_annotations` table + prepared statements
- Add `cleanupOldFileAnnotations(maxAgeDays = 7)`

### System Dependency

LibreOffice (not yet installed):
```bash
sudo apt-get install -y libreoffice-common libreoffice-writer libreoffice-impress
```

Conversion:
```bash
# docx/pptx → html
libreoffice --headless --convert-to html --outdir /tmp/nb-render/ file.docx

# html → docx (edit save)
libreoffice --headless --convert-to docx --outdir /workspace/ edited.html
```

---

## New npm Packages Required

| Package | Purpose |
|---------|---------|
| `react-pdf` | PDF rendering with text layer |
| `@tiptap/react` `@tiptap/starter-kit` | Rich text editor |
| `dompurify` | Sanitize LibreOffice HTML output |
| `@types/dompurify` | Types |

---

## File Changes Summary

| File | Change |
|------|--------|
| `packages/server/src/db.ts` | Add file_annotations table |
| `packages/server/src/ws-handler.ts` | Add file-open/save/annotation WS handlers |
| `packages/web/src/store/uiSlice.ts` | Add openFile, fileViewerMaximized state |
| `packages/web/src/App.tsx` | Layout split when openFile set; sidebar collapse |
| `packages/web/src/components/FileViewer.tsx` | New: main file viewer component |
| `packages/web/src/components/FileViewerStatusBar.tsx` | New: status bar |
| `packages/web/src/components/FileViewerRender.tsx` | New: render mode (md/text/html/pdf) |
| `packages/web/src/components/FileViewerEditor.tsx` | New: TipTap edit mode |
| `packages/web/src/components/FileSelectionFloat.tsx` | Ported from cli-online |
| `packages/web/src/components/FileAnnotationCard.tsx` | Ported from cli-online |
| `packages/web/src/components/FileAnnotationDropdown.tsx` | Ported from cli-online |
| `packages/web/src/hooks/useFileStream.ts` | Ported from cli-online |
| `packages/web/src/hooks/useAnnotationPersistence.ts` | Ported from cli-online |
| `packages/web/src/components/FilesPanel.tsx` | Add onClick handler on file entries |
| `packages/web/src/components/Notebook.tsx` | Remove Annotations + SelectionFloat |
| `packages/web/src/store/notebookSlice.ts` | Remove addAnnotation/removeAnnotation |
| `packages/web/src/styles.css` | FileViewer layout + annotation styles |
