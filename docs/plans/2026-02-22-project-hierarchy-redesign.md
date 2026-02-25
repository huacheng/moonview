# Design: notebook-ai v0.1.0 — Project Hierarchy Redesign

**Date**: 2026-02-22
**Status**: Approved

## Overview

Restructure notebook-ai from a flat notebook list to a project-based hierarchy where one "big task" (project) contains multiple notebooks, each operating in its own git worktree for branch isolation. Redesign the UI layout to three columns with multi-tab notebook rendering and token-level streaming.

## Six Changes

1. Introduce project hierarchy — one deliverable may require multiple notebooks
2. Sidebar becomes two-level project browser with file browsing
3. Notebook tabs — multiple notebooks open simultaneously
4. Right panel — deliverables + library file browsers
5. Worktree per notebook — `init` creates branch + worktree
6. Token-level streaming — backend forwards deltas, frontend batches DOM updates every 20ms

---

## 1. Directory Structure

```
nb-workspaces/
├── .library/                           # Global shared library
│   ├── .memory/                        #   System knowledge base
│   └── <user-imported>/                #   User imports
│
└── project-a/                          # Big task (git main repo)
    ├── .index.json                     # Project metadata
    ├── .git/
    ├── .working/                       # Sidebar L2 entry point
    │   ├── notebook-a/                 # Per-notebook subdirectory
    │   │   ├── notebook-a.notebook.json
    │   │   ├── .index.json             # Notebook task metadata
    │   │   ├── .target.md              # Requirements
    │   │   ├── .plan.md                # Implementation plan
    │   │   ├── .summary.md             # Context summary
    │   │   ├── .notes/
    │   │   ├── .test/
    │   │   └── .analysis/
    │   └── notebook-b/
    │       └── ...
    ├── .deliverables/                  # Right panel top
    └── .worktrees/                     # Git worktrees
        ├── task-notebook-a/
        └── task-notebook-b/
```

**Key principles:**
- Each notebook has its own complete set of system files (.index.json, .target.md, .plan.md, etc.)
- `.working/` contains ONLY notebook subdirectories (no shared task-level system files)
- `.deliverables/` is sibling to `.working/` under the project root
- `.worktrees/` holds git worktrees, one per notebook

---

## 2. Layout

```
┌─ toolbar (54px) ─────────────────────────────────────────────────┐
├─ sidebar (272px) ─┬─ notebook area (flex) ──┬─ right panel(300px)┤
│                   │                         │                    │
│ L1: Project list  │ [Tab:nb-a] [Tab:nb-b] × │ ┌── Deliverables ─┐│
│  ├ project-A  ▶   │                         │ │ .deliverables/  ││
│  └ + New Project  │   notebook cells        │ │  ├ report.md    ││
│                   │   (scrollable, streamed) │ │  └ app/         ││
│ L2: File browser  │                         │ ├─────────────────┤│
│  [← project-A]   │                         │ │ Library          ││
│   📁 notebook-a/  │                         │ │ .library/       ││
│   📁 notebook-b/  │                         │ │  ├ .memory/     ││
│   [+ New Notebook]│                         │ │  └ my-docs/     ││
│                   │ [input bar]             │ └─────────────────┘│
└───────────────────┴─────────────────────────┴────────────────────┘
```

**Dimensions:**
- Sidebar: 272px (unchanged)
- Right panel: 300px (collapsible, resizable via drag)
- Notebook area: remaining space (flex: 1)
- Right panel split: 50/50 (resizable via drag)

---

## 3. Sidebar Navigation

### L1 — Project List

- Scans `nb-workspaces/` subdirectories, reads each project's `.index.json` for metadata
- Each entry: title, status indicator, update age
- `+ New Project` → creates project directory + git init + `.index.json` + `.working/` + `.deliverables/` skeleton
- Click project → transitions to L2

### L2 — File Browser

- Top: `[← Project Name]` back button to L1
- Content: file tree of `.working/` directory
- Navigation: standard file browser — click directories to enter, breadcrumb navigation
- Bottom: `+ New Notebook` button

**Click behavior:**
- `.notebook.json` file → opens notebook in center area as new Tab
- Other files (.md, .pdf, etc.) → opens in right panel FileViewer (deliverables section, in-place)
- Directories → navigate into them (standard file browser)

---

## 4. Notebook Multi-Tab

- Tab bar at top of notebook area
- Each open notebook = one Tab (name + × close button)
- Active Tab:
  - Renders its cells below
  - Binds the input bar at bottom
  - Owns its session (independent ClaudeProcess)
- Switching Tabs preserves:
  - Scroll position per notebook (localStorage)
  - Cell state (outputs, status)
- Closing Tab does NOT destroy session (background session persists, can reopen)
- Each Tab has independent execution — can run prompts in parallel across Tabs

---

## 5. Right Panel

```
┌── Deliverables ── [📁] [↑] [⟨] ────┐    ⟨ = collapse entire right panel
│                                      │
│  .deliverables/ file tree            │
│   ├ report.md                        │
│   └ app/                             │
│                                      │
│  (click file → in-place FileViewer   │
│   with [← Back] button)             │
├─────────── draggable divider ────────┤
│                                      │
│  Library file tree                   │
│  .library/                           │
│   ├ .memory/                         │
│   └ my-docs/                         │
│                                      │
│  (click file → in-place FileViewer   │
│   with [← Back] button)             │
└──────────────────────────────────────┘
```

- Entire right panel collapsible via button
- Top/bottom split ratio draggable
- Both sections independently use FileViewer module
- File operations: upload, new file/directory, download
- Deliverables scope: project's `.deliverables/` directory
- Library scope: global `nb-workspaces/.library/` directory

---

## 6. Worktree Integration

### Create Notebook Flow

```
User clicks "+ New Notebook"
  → User enters notebook name
  → Frontend sends create request to backend
  → Backend:
    1. Calls task-ai:init
    2. git branch task/<notebook-name>
    3. git worktree add .worktrees/task-<name>/ task/<notebook-name>
    4. mkdir .working/<notebook-name>/
    5. Creates .notebook.json + .index.json skeleton
  → Frontend refreshes L2 file list
  → Auto-opens new notebook as Tab
```

### Session Working Directory

- ClaudeProcess `cwd` = `.worktrees/task-<name>/` (branch isolation)
- All Claude file operations happen in the worktree
- Git commits happen on the notebook's branch
- Merge to main branch via task-ai merge sub-command

---

## 7. Streaming Rendering

### Backend: Token-Level Forwarding

Current: ClaudeProcess collects complete JSONL blocks → broadcasts as CellOutput objects via WS.

New: Forward individual content deltas immediately.

```
ClaudeProcess JSONL output
  ├─ content_block_delta (text)
  │    → New WS message: cell_stream { cellId, delta, blockType: 'text'|'thinking' }
  │    → Forwarded immediately, no accumulation
  │
  ├─ content_block_stop
  │    → Existing WS message: cell_output { complete block }
  │    → Used for tool_use, error, chart (non-streamable types)
  │
  └─ result
       → Existing WS message: execution_complete { duration_ms }
```

### Frontend: 20ms Batch DOM Updates

```
// Delta accumulation (no immediate render)
deltaBuffer: Map<cellId, string[]>

on('cell_stream', { cellId, delta, blockType }):
  deltaBuffer.get(cellId).push(delta)

// Batch render loop
every 20ms (requestAnimationFrame or setInterval):
  for each cellId with pending deltas:
    text = deltaBuffer.get(cellId).join('')
    append to active cell DOM (textContent or innerHTML)
    clear flushed deltas

// Final consistency
on('execution_complete', { cellId }):
  replace streamed content with complete cell_output
  ensures no delta loss
```

### Render Classification

| Output Type | Rendering Method |
|-------------|-----------------|
| Text | Character streaming (20ms batch) |
| Thinking | Character streaming (20ms batch) |
| Tool Use | Complete block (single render) |
| Error | Complete block (single render) |
| Chart | Complete block (single render) |

---

## 8. Data Model Changes

### New: Project Schema

```typescript
interface Project {
  id: string
  title: string
  path: string              // Absolute path to project directory
  status: 'active' | 'archived'
  created_at: string
  updated_at: string
}
```

### Modified: Notebook Metadata

```typescript
// Add to existing Notebook metadata
interface NotebookMetadata {
  // ... existing fields ...
  project_id: string            // Parent project reference
  worktree_path: string         // Path to git worktree
  branch: string                // Git branch name (task/<name>)
}
```

### Modified: Session Management

```typescript
// SessionManager changes
interface Session {
  // ... existing fields ...
  projectPath: string           // Project root directory
  worktreePath: string          // Worktree for this notebook
  branch: string                // Git branch
}
```

### New: WebSocket Message Types

```typescript
// Token-level streaming
interface CellStreamMessage {
  type: 'cell_stream'
  cellId: string
  delta: string                 // Text delta (single token or chunk)
  blockType: 'text' | 'thinking'
}
```

---

## 9. Migration Path

- Existing flat notebooks can be imported into projects via a migration utility
- No breaking changes to `.notebook.json` format (additive metadata fields only)
- Backend serves both old and new API until migration complete
