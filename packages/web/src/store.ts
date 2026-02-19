import { create } from 'zustand';
import type {
  Notebook,
  Cell,
  CellType,
  CellStatus,
  CellOutput,
  PromptCell,
  MarkdownCell,
  SliceSection,
  Annotation,
  WSServerMessage,
} from '@notebook-ai/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCell(type: CellType): Cell {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  if (type === 'prompt') {
    const cell: PromptCell = {
      id,
      type: 'prompt',
      source: '',
      outputs: [],
      execution_count: 0,
      status: 'idle',
      created_at: now,
      updated_at: now,
    };
    return cell;
  }

  if (type === 'markdown') {
    const cell: MarkdownCell = {
      id,
      type: 'markdown',
      source: '',
      execution_count: 0,
      status: 'idle',
      created_at: now,
      updated_at: now,
    };
    return cell;
  }

  // visualization (fallback)
  return {
    id,
    type: 'visualization',
    source: '',
    data: null,
    execution_count: 0,
    status: 'idle',
    created_at: now,
    updated_at: now,
  };
}

function makeBlankNotebook(): Notebook {
  const now = new Date().toISOString();
  return {
    version: 1,
    metadata: {
      title: 'Untitled Notebook',
      created: now,
      updated: now,
      git_repo: false,
    },
    cells: [],
    slice: { generated: false, sections: [] },
    annotations: [],
    assets: { intermediate_files: [] },
  };
}

// ---------------------------------------------------------------------------
// Store shape
// ---------------------------------------------------------------------------

export interface NotebookStore {
  notebook: Notebook | null;
  activeTab: 'notebook' | 'slice';
  ws: WebSocket | null;
  wsStatus: 'disconnected' | 'connecting' | 'connected';
  sessionId: string | null;
  sliceLoading: boolean;

  // Notebook actions
  setNotebook(nb: Notebook): void;
  updateTitle(title: string): void;
  addCell(type: CellType, index?: number): void;
  removeCell(cellId: string): void;
  moveCell(cellId: string, direction: 'up' | 'down'): void;
  updateCellSource(cellId: string, source: string): void;
  setCellStatus(cellId: string, status: CellStatus): void;
  appendCellOutput(cellId: string, output: CellOutput): void;
  setCellGitDiff(cellId: string, diff: string): void;

  // Annotation actions
  addAnnotation(annotation: Annotation): void;
  removeAnnotation(annotationId: string): void;

  // Slice actions
  generateSlice(): Promise<void>;
  updateSliceSections(sections: SliceSection[]): void;

  // UI actions
  setActiveTab(tab: 'notebook' | 'slice'): void;

  // WebSocket actions
  connectWebSocket(sessionId: string): void;
  disconnectWebSocket(): void;
  executeCell(cellId: string): void;
  saveNotebook(path?: string): void;
  loadNotebook(path: string): void;
  exportHtml(): void;
}

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

export const useStore = create<NotebookStore>((set, get) => ({
  notebook: makeBlankNotebook(),
  activeTab: 'notebook',
  ws: null,
  wsStatus: 'disconnected',
  sessionId: null,
  sliceLoading: false,

  // ── Notebook actions ────────────────────────────────────────────────────

  setNotebook(nb) {
    set({ notebook: nb });
  },

  updateTitle(title) {
    set((state) => {
      if (!state.notebook) return {};
      return {
        notebook: {
          ...state.notebook,
          metadata: {
            ...state.notebook.metadata,
            title,
            updated: new Date().toISOString(),
          },
        },
      };
    });
  },

  addCell(type, index) {
    const cell = makeCell(type);
    set((state) => {
      if (!state.notebook) return {};
      const cells = [...state.notebook.cells];
      if (index !== undefined) {
        cells.splice(index, 0, cell);
      } else {
        cells.push(cell);
      }
      return {
        notebook: {
          ...state.notebook,
          cells,
          metadata: {
            ...state.notebook.metadata,
            updated: new Date().toISOString(),
          },
        },
      };
    });
  },

  removeCell(cellId) {
    set((state) => {
      if (!state.notebook) return {};
      return {
        notebook: {
          ...state.notebook,
          cells: state.notebook.cells.filter((c) => c.id !== cellId),
          metadata: {
            ...state.notebook.metadata,
            updated: new Date().toISOString(),
          },
        },
      };
    });
  },

  moveCell(cellId, direction) {
    set((state) => {
      if (!state.notebook) return {};
      const cells = [...state.notebook.cells];
      const idx = cells.findIndex((c) => c.id === cellId);
      if (idx === -1) return {};
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= cells.length) return {};
      [cells[idx], cells[swapIdx]] = [cells[swapIdx], cells[idx]];
      return {
        notebook: {
          ...state.notebook,
          cells,
          metadata: {
            ...state.notebook.metadata,
            updated: new Date().toISOString(),
          },
        },
      };
    });
  },

  updateCellSource(cellId, source) {
    set((state) => {
      if (!state.notebook) return {};
      return {
        notebook: {
          ...state.notebook,
          cells: state.notebook.cells.map((c) =>
            c.id === cellId ? { ...c, source, updated_at: new Date().toISOString() } : c
          ),
        },
      };
    });
  },

  setCellStatus(cellId, status) {
    set((state) => {
      if (!state.notebook) return {};
      return {
        notebook: {
          ...state.notebook,
          cells: state.notebook.cells.map((c) =>
            c.id === cellId ? { ...c, status } : c
          ),
        },
      };
    });
  },

  appendCellOutput(cellId, output) {
    set((state) => {
      if (!state.notebook) return {};
      return {
        notebook: {
          ...state.notebook,
          cells: state.notebook.cells.map((c) => {
            if (c.id !== cellId || c.type !== 'prompt') return c;
            return { ...c, outputs: [...c.outputs, output] };
          }),
        },
      };
    });
  },

  setCellGitDiff(cellId, diff) {
    set((state) => {
      if (!state.notebook) return {};
      return {
        notebook: {
          ...state.notebook,
          cells: state.notebook.cells.map((c) => {
            if (c.id !== cellId || c.type !== 'prompt') return c;
            return { ...c, git_diff: diff };
          }),
        },
      };
    });
  },

  // ── Annotation actions ──────────────────────────────────────────────────

  addAnnotation(annotation) {
    set((state) => {
      if (!state.notebook) return {};
      return {
        notebook: {
          ...state.notebook,
          annotations: [...state.notebook.annotations, annotation],
          metadata: {
            ...state.notebook.metadata,
            updated: new Date().toISOString(),
          },
        },
      };
    });
  },

  removeAnnotation(annotationId) {
    set((state) => {
      if (!state.notebook) return {};
      return {
        notebook: {
          ...state.notebook,
          annotations: state.notebook.annotations.filter(
            (a) => a.id !== annotationId,
          ),
          metadata: {
            ...state.notebook.metadata,
            updated: new Date().toISOString(),
          },
        },
      };
    });
  },

  // ── Slice actions ───────────────────────────────────────────────────────

  async generateSlice() {
    const { sessionId } = get();
    if (!sessionId) return;

    set({ sliceLoading: true });
    try {
      const res = await fetch(
        `http://localhost:3002/api/notebooks/${encodeURIComponent(sessionId)}/generate-slice`,
        { method: 'POST' },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Unknown error' }));
        console.error('[store] generateSlice failed:', body);
        return;
      }
      const { sections } = (await res.json()) as { sections: SliceSection[] };
      set((state) => {
        if (!state.notebook) return {};
        return {
          notebook: {
            ...state.notebook,
            slice: {
              generated: true,
              sections,
              updated_at: new Date().toISOString(),
            },
          },
        };
      });
    } catch (err) {
      console.error('[store] generateSlice error:', err);
    } finally {
      set({ sliceLoading: false });
    }
  },

  updateSliceSections(sections) {
    set((state) => {
      if (!state.notebook) return {};
      return {
        notebook: {
          ...state.notebook,
          slice: {
            ...state.notebook.slice,
            sections,
            updated_at: new Date().toISOString(),
          },
        },
      };
    });

    // Send update to server via WebSocket
    const { ws } = get();
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'slice_update', sections }));
    }
  },

  // ── UI actions ──────────────────────────────────────────────────────────

  setActiveTab(tab) {
    set({ activeTab: tab });
  },

  // ── WebSocket actions ───────────────────────────────────────────────────

  connectWebSocket(sessionId) {
    const existing = get().ws;
    if (existing) {
      existing.close();
    }

    set({ wsStatus: 'connecting', sessionId });

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws?session=${sessionId}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      set({ wsStatus: 'connected' });
    };

    ws.onclose = () => {
      set({ wsStatus: 'disconnected', ws: null });
    };

    ws.onerror = () => {
      set({ wsStatus: 'disconnected' });
    };

    ws.onmessage = (event: MessageEvent) => {
      let parsed: WSServerMessage;
      try {
        parsed = JSON.parse(event.data as string) as WSServerMessage;
      } catch {
        return;
      }
      const store = get();
      switch (parsed.type) {
        case 'cell_output':
          store.appendCellOutput(parsed.cell_id, parsed.output);
          break;
        case 'execution_complete':
          store.setCellStatus(parsed.cell_id, 'completed');
          break;
        case 'git_diff':
          store.setCellGitDiff(parsed.cell_id, parsed.diff);
          break;
        case 'export_complete':
          // Trigger file download with slugified title + date
          {
            const title = store.notebook?.metadata.title ?? 'notebook';
            const slug = title
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-|-$/g, '');
            const date = new Date().toISOString().slice(0, 10);
            const filename = `${slug || 'notebook'}-${date}.html`;

            const blob = new Blob([parsed.html], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }
          break;
        case 'slice_update':
          // Incoming from server — update local state without re-sending via WS
          set((state) => {
            if (!state.notebook) return {};
            return {
              notebook: {
                ...state.notebook,
                slice: {
                  ...state.notebook.slice,
                  generated: true,
                  sections: parsed.sections,
                  updated_at: new Date().toISOString(),
                },
              },
            };
          });
          break;
        case 'error':
          if (parsed.cell_id) {
            store.setCellStatus(parsed.cell_id, 'error');
            store.appendCellOutput(parsed.cell_id, {
              type: 'error',
              message: parsed.message,
              timestamp: new Date().toISOString(),
            });
          }
          break;
      }
    };

    set({ ws });
  },

  disconnectWebSocket() {
    const { ws } = get();
    if (ws) {
      ws.close();
    }
    set({ ws: null, wsStatus: 'disconnected' });
  },

  executeCell(cellId) {
    const { ws, notebook } = get();
    const cell = notebook?.cells.find((c) => c.id === cellId);
    if (!cell || cell.type !== 'prompt') return;

    // Clear previous outputs
    set((state) => {
      if (!state.notebook) return {};
      return {
        notebook: {
          ...state.notebook,
          cells: state.notebook.cells.map((c) =>
            c.id === cellId
              ? { ...c, outputs: [], status: 'running', execution_count: c.execution_count + 1 }
              : c
          ),
        },
      };
    });

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: 'execute_request',
          cell_id: cellId,
          source: cell.source,
        })
      );
    } else {
      // Simulate offline execution feedback
      get().setCellStatus(cellId, 'error');
      get().appendCellOutput(cellId, {
        type: 'error',
        message: 'WebSocket not connected. Cannot execute cell.',
        timestamp: new Date().toISOString(),
      });
    }
  },

  saveNotebook(path = 'notebook.ai.json') {
    const { ws } = get();
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'save_notebook', path }));
    }
  },

  loadNotebook(path: string) {
    const { ws } = get();
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'load_notebook', path }));
    }
  },

  exportHtml() {
    const { ws } = get();
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: 'export_html',
          options: {
            include_slice: true,
            include_replay: true,
            include_annotations: true,
          },
        })
      );
    }
  },
}));
