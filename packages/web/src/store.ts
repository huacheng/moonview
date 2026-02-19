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
  NotebookListItem,
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
  // Auth state
  authToken: string | null;
  authRequired: boolean | null; // null = not yet checked
  authError: string | null;
  authLoading: boolean;

  notebook: Notebook | null;
  activeTab: 'notebook' | 'slice';
  ws: WebSocket | null;
  wsStatus: 'disconnected' | 'connecting' | 'connected';
  sessionId: string | null;
  sliceLoading: boolean;

  // Sidebar / history state
  sidebarOpen: boolean;
  notebookList: NotebookListItem[];
  notebookListLoading: boolean;
  activeNotebookId: string | null;
  workspaceDir: string | null;

  // Auth actions
  checkAuthStatus(): Promise<void>;
  login(token: string): Promise<void>;
  logout(): void;

  // Sidebar / history actions
  toggleSidebar(): void;
  setSidebarOpen(open: boolean): void;
  fetchNotebookList(): Promise<void>;
  createNewNotebook(title: string): Promise<void>;
  restoreNotebook(notebookId: string): Promise<void>;
  deleteNotebook(notebookId: string): Promise<void>;
  renameNotebook(notebookId: string, newTitle: string): Promise<void>;

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
  authToken: localStorage.getItem('nb-auth-token'),
  authRequired: null,
  authError: null,
  authLoading: false,

  notebook: null,
  activeTab: 'notebook',
  ws: null,
  wsStatus: 'disconnected',
  sessionId: null,
  sliceLoading: false,

  sidebarOpen: true,
  notebookList: [],
  notebookListLoading: false,
  activeNotebookId: null,
  workspaceDir: null,

  // ── Auth actions ────────────────────────────────────────────────────────

  async checkAuthStatus() {
    try {
      const res = await fetch('/api/auth/status');
      const data = (await res.json()) as { authEnabled: boolean };
      set({ authRequired: data.authEnabled });

      // If auth is enabled and we have a stored token, validate it
      if (data.authEnabled) {
        const token = get().authToken;
        if (token) {
          const check = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
          });
          if (!check.ok) {
            // Stored token is invalid — clear it
            localStorage.removeItem('nb-auth-token');
            set({ authToken: null });
          }
        }
      }
    } catch {
      // If we can't reach the server, assume auth not required for now
      set({ authRequired: false });
    }
  },

  async login(token: string) {
    set({ authLoading: true, authError: null });
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error: string };
        set({ authError: data.error, authLoading: false });
        return;
      }
      localStorage.setItem('nb-auth-token', token);
      set({ authToken: token, authError: null, authLoading: false });
    } catch {
      set({ authError: 'Failed to connect to server.', authLoading: false });
    }
  },

  logout() {
    localStorage.removeItem('nb-auth-token');
    set({ authToken: null });
    // Disconnect WebSocket on logout
    get().disconnectWebSocket();
  },

  // ── Sidebar / History actions ────────────────────────────────────────────

  toggleSidebar() {
    set((state) => ({ sidebarOpen: !state.sidebarOpen }));
  },

  setSidebarOpen(open) {
    set({ sidebarOpen: open });
  },

  async fetchNotebookList() {
    set({ notebookListLoading: true });
    try {
      const headers: Record<string, string> = {};
      const token = get().authToken;
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/notebooks/list', { headers });
      if (res.ok) {
        const data = (await res.json()) as { notebooks: NotebookListItem[] };
        // Merge any pending optimistic title renames from localStorage.
        const notebooks = data.notebooks.map((item) => {
          const cached = localStorage.getItem(`nb-title-${item.id}`);
          return cached ? { ...item, title: cached } : item;
        });
        set({ notebookList: notebooks });
      }
    } catch (err) {
      console.error('[store] fetchNotebookList error:', err);
    } finally {
      set({ notebookListLoading: false });
    }
  },

  async createNewNotebook(title: string) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = get().authToken;
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      // Disconnect existing WebSocket and clear sessionId to prevent auto-reconnect.
      get().disconnectWebSocket();
      set({ sessionId: null });

      const res = await fetch('/api/notebooks/create', {
        method: 'POST',
        headers,
        body: JSON.stringify({ title }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error: string };
        console.error('[store] createNewNotebook failed:', err.error);
        return;
      }
      const data = (await res.json()) as {
        notebook: Notebook;
        notebookId: string;
        sessionId: string;
        workspaceDir: string;
      };

      set({
        notebook: data.notebook,
        sessionId: data.sessionId,
        activeNotebookId: data.notebookId,
        workspaceDir: data.workspaceDir,
      });

      // useWebSocket hook will auto-connect when sessionId changes.
      // Refresh the notebook list.
      get().fetchNotebookList();
    } catch (err) {
      console.error('[store] createNewNotebook error:', err);
    }
  },

  async restoreNotebook(notebookId: string) {
    // Don't restore if already active.
    if (get().activeNotebookId === notebookId) return;

    const headers: Record<string, string> = {};
    const token = get().authToken;
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      // Disconnect existing WebSocket and clear sessionId to prevent auto-reconnect.
      get().disconnectWebSocket();
      set({ sessionId: null });

      const res = await fetch(`/api/notebooks/${encodeURIComponent(notebookId)}/restore`, {
        method: 'POST',
        headers,
      });
      if (!res.ok) {
        const err = (await res.json()) as { error: string };
        console.error('[store] restoreNotebook failed:', err.error);
        return;
      }
      const data = (await res.json()) as {
        notebook: Notebook;
        sessionId: string;
        reconnected: boolean;
        notebookId: string;
        workspaceDir: string;
      };

      set({
        notebook: data.notebook,
        sessionId: data.sessionId,
        activeNotebookId: data.notebookId,
        workspaceDir: data.workspaceDir,
      });

      // useWebSocket hook will auto-connect when sessionId changes.
      // Refresh list to update active session indicators.
      get().fetchNotebookList();
    } catch (err) {
      console.error('[store] restoreNotebook error:', err);
    }
  },

  async deleteNotebook(notebookId: string) {
    const headers: Record<string, string> = {};
    const token = get().authToken;
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      await fetch(`/api/notebooks/${encodeURIComponent(notebookId)}`, {
        method: 'DELETE',
        headers,
      });

      // If we deleted the active notebook, clear state.
      if (get().activeNotebookId === notebookId) {
        get().disconnectWebSocket();
        set({
          notebook: null,
          sessionId: null,
          activeNotebookId: null,
          workspaceDir: null,
        });
      }

      get().fetchNotebookList();
    } catch (err) {
      console.error('[store] deleteNotebook error:', err);
    }
  },

  async renameNotebook(notebookId: string, newTitle: string) {
    // Optimistic update — sidebar list + active notebook title update instantly.
    set((state) => {
      const patch: Partial<NotebookStore> = {
        notebookList: state.notebookList.map((item) =>
          item.id === notebookId ? { ...item, title: newTitle } : item,
        ),
      };
      if (state.activeNotebookId === notebookId && state.notebook) {
        patch.notebook = {
          ...state.notebook,
          metadata: { ...state.notebook.metadata, title: newTitle, updated: new Date().toISOString() },
        };
      }
      return patch;
    });

    // Cache in localStorage so a page refresh before PATCH completes still shows the new title.
    localStorage.setItem(`nb-title-${notebookId}`, newTitle);

    // Fire PATCH to server in background.
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = get().authToken;
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      await fetch(`/api/notebooks/${encodeURIComponent(notebookId)}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ title: newTitle }),
      });
      localStorage.removeItem(`nb-title-${notebookId}`);
      get().fetchNotebookList();
    } catch (err) {
      console.error('[store] renameNotebook error:', err);
    }
  },

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
      const headers: Record<string, string> = {};
      const token = get().authToken;
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(
        `/api/notebooks/${encodeURIComponent(sessionId)}/generate-slice`,
        { method: 'POST', headers },
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
      // Remove handlers before closing to prevent stale onclose from
      // overwriting the new connection's state.
      existing.onclose = null;
      existing.onerror = null;
      existing.onmessage = null;
      existing.close();
    }

    set({ wsStatus: 'connecting', sessionId });

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const tokenParam = get().authToken ? `&token=${encodeURIComponent(get().authToken!)}` : '';
    const wsUrl = `${protocol}//${window.location.host}/ws?sessionId=${sessionId}${tokenParam}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      // Only update if this ws is still the current one.
      if (get().ws === ws) {
        set({ wsStatus: 'connected' });
      }
    };

    ws.onclose = () => {
      // Only update if this ws is still the current one.
      if (get().ws === ws) {
        set({ wsStatus: 'disconnected', ws: null });
      }
    };

    ws.onerror = () => {
      if (get().ws === ws) {
        set({ wsStatus: 'disconnected' });
      }
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
