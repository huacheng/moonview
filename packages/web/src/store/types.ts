import type {
  Notebook,
  CellType,
  CellStatus,
  CellOutput,
  SliceSection,
  Annotation,
  NotebookListItem,
} from '@notebook-ai/shared';

/**
 * Full combined store interface.
 * Imported by slice files to type StateCreator without circular deps.
 */
export interface NotebookStore {
  // ── Auth state ─────────────────────────────────────────────────────────
  authToken: string | null;
  authRequired: boolean | null;
  authError: string | null;
  authLoading: boolean;

  // ── Notebook state ─────────────────────────────────────────────────────
  notebook: Notebook | null;
  sliceLoading: boolean;
  notebookLoading: boolean;

  // ── Sidebar / history state ────────────────────────────────────────────
  sidebarOpen: boolean;
  notebookList: NotebookListItem[];
  notebookListLoading: boolean;
  activeNotebookId: string | null;
  workspaceDir: string | null;

  // ── UI state ───────────────────────────────────────────────────────────
  activeTab: 'notebook' | 'slice';
  sessionNotice: string | null;
  latency: number | null;
  creatingNotebook: boolean;
  filesPanelOpen: boolean;
  wsReconnectExhausted: boolean;

  // ── WebSocket state ────────────────────────────────────────────────────
  ws: WebSocket | null;
  wsStatus: 'disconnected' | 'connecting' | 'connected';
  sessionId: string | null;

  // ── Auth actions ───────────────────────────────────────────────────────
  checkAuthStatus(): Promise<void>;
  login(token: string): Promise<void>;
  logout(): void;

  // ── Sidebar / history actions ──────────────────────────────────────────
  toggleSidebar(): void;
  setSidebarOpen(open: boolean): void;
  fetchNotebookList(): Promise<void>;
  createNewNotebook(title: string): Promise<void>;
  restoreNotebook(notebookId: string): Promise<void>;
  deleteNotebook(notebookId: string): Promise<void>;
  renameNotebook(notebookId: string, newTitle: string): Promise<void>;
  setCreatingNotebook(v: boolean): void;
  importNotebookFile(file: File): Promise<void>;

  // ── Notebook actions ───────────────────────────────────────────────────
  setNotebook(nb: Notebook): void;
  updateTitle(title: string): void;
  addCell(type: CellType, index?: number): void;
  submitPrompt(source: string): void;
  removeCell(cellId: string): void;
  moveCell(cellId: string, direction: 'up' | 'down'): void;
  updateCellSource(cellId: string, source: string): void;
  setCellStatus(cellId: string, status: CellStatus): void;
  appendCellOutput(cellId: string, output: CellOutput): void;
  updateToolResult(cellId: string, toolUseId: string, content: string, isError?: boolean): void;
  setCellGitDiff(cellId: string, diff: string): void;

  // ── Annotation actions ─────────────────────────────────────────────────
  addAnnotation(annotation: Annotation): void;
  removeAnnotation(annotationId: string): void;

  // ── Slice actions ──────────────────────────────────────────────────────
  generateSlice(): Promise<void>;
  updateSliceSections(sections: SliceSection[]): void;

  // ── UI actions ─────────────────────────────────────────────────────────
  setActiveTab(tab: 'notebook' | 'slice'): void;
  clearSessionNotice(): void;
  setLatency(ms: number | null): void;
  setWsReconnectExhausted(v: boolean): void;
  toggleFilesPanel(): void;

  // ── WebSocket actions ──────────────────────────────────────────────────
  connectWebSocket(): void;
  disconnectWebSocket(): void;
  subscribeToSession(sessionId: string): void;
  unsubscribeFromSession(sessionId: string): void;
  executeCell(cellId: string): void;
  saveNotebook(path?: string): void;
  loadNotebook(path: string): void;
  exportHtml(): void;
}
