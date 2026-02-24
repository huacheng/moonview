import type { StateCreator } from 'zustand';
import type { NotebookStore } from './types';

export const createUiSlice: StateCreator<NotebookStore, [], [], Pick<NotebookStore,
  | 'activeTab' | 'gitTabOpen' | 'sessionNotice' | 'latency' | 'creatingNotebook'
  | 'wsReconnectExhausted'
  | 'setActiveTab' | 'openGitTab' | 'closeGitTab'
  | 'clearSessionNotice' | 'setLatency'
  | 'setWsReconnectExhausted'
  | 'openFiles' | 'activeFileTabId' | 'fileViewerMaximized'
  | 'openFileTab' | 'closeFileTab' | 'setActiveFileTab' | 'deactivateFileTab' | 'closeAllFileTabs' | 'setFileTabLoading'
  | 'toggleFileViewerMaximized'
  | 'leftSidebarSplitRatio' | 'setLeftSidebarSplitRatio'
  | 'rightPanelOpen' | 'rightPanelSplitRatio'
  | 'toggleRightPanel' | 'setRightPanelOpen' | 'setRightPanelSplitRatio'
  | 'sidebarWidth' | 'rightPanelWidth'
  | 'setSidebarWidth' | 'setRightPanelWidth'
>> = (set) => ({
  activeTab: 'notebook',
  gitTabOpen: false,
  sessionNotice: null,
  latency: null,
  creatingNotebook: false,
  wsReconnectExhausted: false,
  leftSidebarSplitRatio: 0.5,
  openFiles: {},
  activeFileTabId: null,
  fileViewerMaximized: false,
  rightPanelOpen: true,
  rightPanelSplitRatio: 0.5,
  sidebarWidth: 272,
  rightPanelWidth: 300,

  setActiveTab(tab) {
    set({ activeTab: tab, gitTabOpen: tab === 'git' });
  },

  openGitTab() {
    set({ activeTab: 'git', gitTabOpen: true });
  },

  closeGitTab() {
    set({ activeTab: 'notebook', gitTabOpen: false });
  },

  clearSessionNotice() {
    set({ sessionNotice: null });
  },

  setLatency(ms) {
    set({ latency: ms });
  },

  setWsReconnectExhausted(v) {
    set({ wsReconnectExhausted: v });
  },

  openFileTab(file) {
    const tabId = `${file.source}::${file.path}`;
    set(s => ({
      openFiles: { ...s.openFiles, [tabId]: { ...file, loading: true } },
      activeFileTabId: tabId,
    }));
  },

  closeFileTab(tabId) {
    set(s => {
      const { [tabId]: _, ...rest } = s.openFiles;
      const ids = Object.keys(rest);
      const newActive = s.activeFileTabId === tabId
        ? (ids[0] ?? null)
        : s.activeFileTabId;
      return { openFiles: rest, activeFileTabId: newActive };
    });
  },

  setActiveFileTab(tabId) {
    set({ activeFileTabId: tabId });
  },

  deactivateFileTab() {
    set({ activeFileTabId: null });
  },

  closeAllFileTabs() {
    set({ openFiles: {}, activeFileTabId: null });
  },

  setFileTabLoading(tabId, loading) {
    set(s => {
      const entry = s.openFiles[tabId];
      if (!entry) return s;
      return { openFiles: { ...s.openFiles, [tabId]: { ...entry, loading } } };
    });
  },

  toggleFileViewerMaximized() {
    set((s) => ({ fileViewerMaximized: !s.fileViewerMaximized }));
  },

  toggleRightPanel() {
    set((state) => ({ rightPanelOpen: !state.rightPanelOpen }));
  },

  setRightPanelOpen(open) {
    set({ rightPanelOpen: open });
  },

  setLeftSidebarSplitRatio(ratio) {
    set({ leftSidebarSplitRatio: Math.min(0.8, Math.max(0.2, ratio)) });
  },

  setRightPanelSplitRatio(ratio) {
    set({ rightPanelSplitRatio: ratio });
  },

  setSidebarWidth(px) {
    set({ sidebarWidth: Math.min(500, Math.max(180, px)) });
  },

  setRightPanelWidth(px) {
    set({ rightPanelWidth: Math.min(500, Math.max(180, px)) });
  },
});
