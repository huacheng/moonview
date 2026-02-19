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
  notebookLoading: boolean;
  sessionNotice: string | null; // non-null when notebook was rejected (already open in another tab)
  latency: number | null; // WebSocket RTT in ms, null = not yet measured
  creatingNotebook: boolean; // true while the creation-choice panel is shown

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
  setCreatingNotebook(v: boolean): void;
  importNotebookFile(file: File): Promise<void>;

  // Notebook actions
  setNotebook(nb: Notebook): void;
  updateTitle(title: string): void;
  addCell(type: CellType, index?: number): void;
  removeCell(cellId: string): void;
  moveCell(cellId: string, direction: 'up' | 'down'): void;
  updateCellSource(cellId: string, source: string): void;
  setCellStatus(cellId: string, status: CellStatus): void;
  appendCellOutput(cellId: string, output: CellOutput): void;
  updateToolResult(cellId: string, toolUseId: string, content: string, isError?: boolean): void;
  setCellGitDiff(cellId: string, diff: string): void;

  // Annotation actions
  addAnnotation(annotation: Annotation): void;
  removeAnnotation(annotationId: string): void;

  // Slice actions
  generateSlice(): Promise<void>;
  updateSliceSections(sections: SliceSection[]): void;

  // Files panel
  filesPanelOpen: boolean;
  toggleFilesPanel(): void;

  // UI actions
  setActiveTab(tab: 'notebook' | 'slice'): void;
  clearSessionNotice(): void;
  setLatency(ms: number | null): void;

  // WebSocket actions
  connectWebSocket(): void;
  disconnectWebSocket(): void;
  subscribeToSession(sessionId: string): void;
  unsubscribeFromSession(sessionId: string): void;
  executeCell(cellId: string): void;
  saveNotebook(path?: string): void;
  loadNotebook(path: string): void;
  exportHtml(): void;
}

// ---------------------------------------------------------------------------
// Module-level adaptive sync state (cell source → server)
// ---------------------------------------------------------------------------

let _sourceSyncTimer: ReturnType<typeof setTimeout> | null = null;

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
  notebookLoading: false,
  sessionNotice: null,

  filesPanelOpen: false,
  latency: null,
  creatingNotebook: false,

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
    let lastErr: unknown;
    for (let attempt = 1; attempt <= 3; attempt++) {
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
          set({ notebookList: notebooks, notebookListLoading: false });
          return;
        }
        break; // Non-2xx — don't retry
      } catch (err) {
        lastErr = err;
        if (attempt < 3) await new Promise((r) => setTimeout(r, 600 * attempt));
      }
    }
    if (lastErr) console.error('[store] fetchNotebookList failed:', lastErr);
    set({ notebookListLoading: false });
  },

  async createNewNotebook(title: string) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = get().authToken;
    if (token) headers['Authorization'] = `Bearer ${token}`;

    set({ sessionNotice: null });
    // Optimistic: show blank notebook immediately without waiting for backend.
    const tempId = crypto.randomUUID();
    const blankNotebook = makeBlankNotebook();
    blankNotebook.metadata.title = title;
    set({
      notebook: blankNotebook,
      sessionId: null,
      activeNotebookId: tempId,
      workspaceDir: null,
      filesPanelOpen: true,
    });

    // Async: create session on backend, then wire up WebSocket.
    try {
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

      get().fetchNotebookList();
    } catch (err) {
      console.error('[store] createNewNotebook error:', err);
    }
  },

  async restoreNotebook(notebookId: string) {
    // Don't restore if already active.
    if (get().activeNotebookId === notebookId) return;

    // Immediately mark this notebook as active and show loading screen.
    set({
      sessionNotice: null,
      notebookLoading: true,
      activeNotebookId: notebookId,
      notebook: null,
      sessionId: null,
      workspaceDir: null,
    });

    const headers: Record<string, string> = {};
    const token = get().authToken;
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      const res = await fetch(`/api/notebooks/${encodeURIComponent(notebookId)}/restore`, {
        method: 'POST',
        headers,
      });
      if (!res.ok) {
        const err = (await res.json()) as { error: string };
        console.error('[store] restoreNotebook failed:', err.error);
        set({ notebookLoading: false, activeNotebookId: null });
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
        notebookLoading: false,
        filesPanelOpen: true,
      });

      get().fetchNotebookList();
    } catch (err) {
      console.error('[store] restoreNotebook error:', err);
      set({ notebookLoading: false, activeNotebookId: null });
    }
  },

  async deleteNotebook(notebookId: string) {
    const headers: Record<string, string> = {};
    const token = get().authToken;
    if (token) headers['Authorization'] = `Bearer ${token}`;

    // Optimistic: remove from list and clear active state immediately.
    set((state) => ({
      notebookList: state.notebookList.filter((n) => n.id !== notebookId),
    }));
    if (get().activeNotebookId === notebookId) {
      set({ notebook: null, sessionId: null, activeNotebookId: null, workspaceDir: null, filesPanelOpen: false });
      localStorage.removeItem('nb-last-notebook');
    }

    try {
      const res = await fetch(`/api/notebooks/${encodeURIComponent(notebookId)}`, {
        method: 'DELETE',
        headers,
      });
      if (!res.ok && res.status !== 404) {
        console.error('[store] deleteNotebook failed:', res.status);
      }
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

    // Adaptive sync to server: max(200ms, latency × 3)
    // Keeps server's in-memory notebook up to date with client edits.
    if (_sourceSyncTimer) clearTimeout(_sourceSyncTimer);
    const latency = get().latency ?? 30;
    const interval = Math.max(200, latency * 3);
    _sourceSyncTimer = setTimeout(() => {
      _sourceSyncTimer = null;
      const { ws, sessionId } = get();
      if (ws && ws.readyState === WebSocket.OPEN && sessionId) {
        ws.send(JSON.stringify({
          type: 'update_cell_source',
          session_id: sessionId,
          cell_id: cellId,
          source,
        }));
      }
    }, interval);
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

  updateToolResult(cellId, toolUseId, content, isError) {
    set((state) => {
      if (!state.notebook) return {};
      let matched = false;
      return {
        notebook: {
          ...state.notebook,
          cells: state.notebook.cells.map((c) => {
            if (c.id !== cellId || c.type !== 'prompt') return c;
            return {
              ...c,
              outputs: c.outputs.map((out) => {
                if (matched || out.type !== 'tool_use') return out;
                // Match by stored tool_use_id (preferred), fall back to first unresolved.
                const byId = out.tool_use_id === toolUseId;
                const unresolved = !byId && out.result === undefined;
                if (byId || unresolved) {
                  matched = true;
                  return { ...out, result: content, is_error: isError };
                }
                return out;
              }),
            };
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
      ws.send(JSON.stringify({ type: 'slice_update', session_id: get().sessionId ?? '', sections }));
    }
  },

  // ── Files panel ─────────────────────────────────────────────────────────

  toggleFilesPanel() {
    set((state) => ({ filesPanelOpen: !state.filesPanelOpen }));
  },

  // ── Notebook creation ────────────────────────────────────────────────────

  setCreatingNotebook(v) {
    set({ creatingNotebook: v });
  },

  async importNotebookFile(file: File) {
    let imported: Notebook;
    try {
      if (file.name.endsWith('.zip')) {
        // Extract notebook.json from an exported zip bundle.
        const formData = new FormData();
        formData.append('file', file);
        const headers: Record<string, string> = {};
        const token = get().authToken;
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const extractRes = await fetch('/api/notebooks/extract-zip', {
          method: 'POST',
          headers,
          body: formData,
        });
        if (!extractRes.ok) {
          const data = (await extractRes.json()) as { error: string };
          console.error('[store] extract-zip error:', data.error);
          return;
        }
        imported = (await extractRes.json()) as Notebook;
      } else {
        imported = JSON.parse(await file.text()) as Notebook;
      }
    } catch {
      return; // invalid file
    }

    const title = imported.metadata?.title || 'Imported Notebook';
    set({ creatingNotebook: false, sessionNotice: null });

    // Create a new session for the imported notebook.
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = get().authToken;
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      const res = await fetch('/api/notebooks/create', {
        method: 'POST',
        headers,
        body: JSON.stringify({ title }),
      });
      if (!res.ok) return;

      const data = (await res.json()) as {
        notebook: Notebook;
        notebookId: string;
        sessionId: string;
        workspaceDir: string;
      };

      // Merge imported metadata (title/cwd) with a fresh timestamp.
      const importedWithMeta: Notebook = {
        ...imported,
        metadata: {
          ...imported.metadata,
          title,
          updated: new Date().toISOString(),
        },
      };

      set({
        notebook: importedWithMeta,
        sessionId: data.sessionId,
        activeNotebookId: data.notebookId,
        workspaceDir: data.workspaceDir,
        filesPanelOpen: true,
      });

      // Persist the imported content to disk.
      await fetch(`/api/notebooks/${encodeURIComponent(data.notebookId)}/import-content`, {
        method: 'POST',
        headers,
        body: JSON.stringify(importedWithMeta),
      });

      get().fetchNotebookList();
    } catch (err) {
      console.error('[store] importNotebookFile error:', err);
    }
  },

  // ── UI actions ──────────────────────────────────────────────────────────

  setActiveTab(tab) {
    set({ activeTab: tab });
  },

  clearSessionNotice() {
    set({ sessionNotice: null });
  },

  setLatency(ms) {
    set({ latency: ms });
  },

  // ── WebSocket actions ───────────────────────────────────────────────────

  connectWebSocket() {
    const existing = get().ws;
    if (existing) {
      // Remove handlers before closing to prevent stale onclose from
      // overwriting the new connection's state.
      existing.onclose = null;
      existing.onerror = null;
      existing.onmessage = null;
      existing.close();
    }

    set({ wsStatus: 'connecting', latency: null });

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const token = get().authToken;
    const wsUrl = token
      ? `${protocol}//${window.location.host}/ws?token=${encodeURIComponent(token)}`
      : `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);

    // Ping/pong state for this connection
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    let pongTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
    let pingSentAt = 0;

    const PING_INTERVAL = 10_000;
    const PONG_TIMEOUT  =  4_000;

    function sendPing() {
      if (ws.readyState !== WebSocket.OPEN) return;
      pingSentAt = performance.now();
      ws.send(JSON.stringify({ type: 'ping' }));
      pongTimeoutTimer = setTimeout(() => {
        if (pingSentAt > 0) {
          pingSentAt = 0;
          ws.close(); // pong timed out — trigger reconnect
        }
      }, PONG_TIMEOUT);
    }

    function stopPing() {
      if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
      if (pongTimeoutTimer) { clearTimeout(pongTimeoutTimer); pongTimeoutTimer = null; }
      pingSentAt = 0;
    }

    ws.onopen = () => {
      // Only update if this ws is still the current one.
      if (get().ws === ws) {
        set({ wsStatus: 'connected' });
        // Auto-subscribe to the current session (handles connect-after-sessionId-set case)
        const { sessionId } = get();
        if (sessionId) {
          ws.send(JSON.stringify({ type: 'subscribe', session_id: sessionId }));
        }
        // Start ping/pong heartbeat
        sendPing();
        pingTimer = setInterval(sendPing, PING_INTERVAL);
      }
    };

    ws.onclose = () => {
      // Only update if this ws is still the current one.
      if (get().ws === ws) {
        stopPing();
        set({ wsStatus: 'disconnected', ws: null, latency: null });
      }
    };

    ws.onerror = () => {
      if (get().ws === ws) {
        stopPing();
        set({ wsStatus: 'disconnected', latency: null });
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
        case 'tool_result':
          store.updateToolResult(parsed.cell_id, parsed.tool_use_id, parsed.content, parsed.is_error);
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
        case 'pong':
          if (pingSentAt > 0) {
            if (pongTimeoutTimer) { clearTimeout(pongTimeoutTimer); pongTimeoutTimer = null; }
            const rtt = Math.round(performance.now() - pingSentAt);
            pingSentAt = 0;
            // Only update from the primary connection to avoid flicker
            if (get().ws === ws) set({ latency: rtt });
          }
          break;

        case 'session_already_open':
          // Another tab already owns this session — clear the notebook and show a notice.
          set({
            notebook: null,
            sessionId: null,
            activeNotebookId: null,
            workspaceDir: null,
            sessionNotice: '此 Notebook 已在另一个标签页中打开，请先关闭它。',
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

  subscribeToSession(sessionId) {
    const { ws } = get();
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'subscribe', session_id: sessionId }));
    }
  },

  unsubscribeFromSession(sessionId) {
    const { ws } = get();
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'unsubscribe', session_id: sessionId }));
    }
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
          session_id: get().sessionId ?? '',
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
      ws.send(JSON.stringify({ type: 'save_notebook', session_id: get().sessionId ?? '', path }));
    }
  },

  loadNotebook(path: string) {
    const { ws } = get();
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'load_notebook', session_id: get().sessionId ?? '', path }));
    }
  },

  exportHtml() {
    const { ws } = get();
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: 'export_html',
          session_id: get().sessionId ?? '',
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
