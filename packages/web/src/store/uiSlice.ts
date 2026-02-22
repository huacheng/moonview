import type { StateCreator } from 'zustand';
import type { NotebookStore } from './types';

export const createUiSlice: StateCreator<NotebookStore, [], [], Pick<NotebookStore,
  | 'activeTab' | 'gitTabOpen' | 'sessionNotice' | 'latency' | 'creatingNotebook'
  | 'filesPanelOpen' | 'wsReconnectExhausted'
  | 'setActiveTab' | 'openGitTab' | 'closeGitTab'
  | 'clearSessionNotice' | 'setLatency'
  | 'setWsReconnectExhausted' | 'toggleFilesPanel'
  | 'openFile' | 'fileViewerMaximized'
  | 'setOpenFile' | 'toggleFileViewerMaximized'
  | 'rightPanelOpen' | 'rightPanelSplitRatio'
  | 'deliverablesViewingFile' | 'libraryViewingFile'
  | 'toggleRightPanel' | 'setRightPanelSplitRatio'
  | 'openFileInDeliverables' | 'openFileInLibrary'
  | 'closeDeliverablesViewer' | 'closeLibraryViewer'
>> = (set) => ({
  activeTab: 'notebook',
  gitTabOpen: false,
  sessionNotice: null,
  latency: null,
  creatingNotebook: false,
  filesPanelOpen: false,
  wsReconnectExhausted: false,
  openFile: null,
  fileViewerMaximized: false,
  rightPanelOpen: true,
  rightPanelSplitRatio: 0.5,
  deliverablesViewingFile: null,
  libraryViewingFile: null,

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

  toggleFilesPanel() {
    set((state) => ({ filesPanelOpen: !state.filesPanelOpen }));
  },

  setOpenFile(file) {
    set({ openFile: file });
  },

  toggleFileViewerMaximized() {
    set((s) => ({ fileViewerMaximized: !s.fileViewerMaximized }));
  },

  toggleRightPanel() {
    set((state) => ({ rightPanelOpen: !state.rightPanelOpen }));
  },

  setRightPanelSplitRatio(ratio) {
    set({ rightPanelSplitRatio: ratio });
  },

  openFileInDeliverables(path) {
    set({ deliverablesViewingFile: path });
  },

  openFileInLibrary(path) {
    set({ libraryViewingFile: path });
  },

  closeDeliverablesViewer() {
    set({ deliverablesViewingFile: null });
  },

  closeLibraryViewer() {
    set({ libraryViewingFile: null });
  },
});
