import type { StateCreator } from 'zustand';
import type { NotebookStore } from './types';

export const createUiSlice: StateCreator<NotebookStore, [], [], Pick<NotebookStore,
  | 'activeTab' | 'gitTabOpen' | 'sessionNotice' | 'latency' | 'creatingNotebook'
  | 'wsReconnectExhausted'
  | 'setActiveTab' | 'openGitTab' | 'closeGitTab'
  | 'clearSessionNotice' | 'setLatency'
  | 'setWsReconnectExhausted'
  | 'openFile' | 'fileViewerMaximized'
  | 'setOpenFile' | 'toggleFileViewerMaximized'
  | 'leftSidebarSplitRatio' | 'setLeftSidebarSplitRatio'
  | 'rightPanelOpen' | 'rightPanelSplitRatio'
  | 'toggleRightPanel' | 'setRightPanelSplitRatio'
>> = (set) => ({
  activeTab: 'notebook',
  gitTabOpen: false,
  sessionNotice: null,
  latency: null,
  creatingNotebook: false,
  wsReconnectExhausted: false,
  leftSidebarSplitRatio: 0.5,
  openFile: null,
  fileViewerMaximized: false,
  rightPanelOpen: true,
  rightPanelSplitRatio: 0.5,

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

  setOpenFile(file) {
    set({ openFile: file });
  },

  toggleFileViewerMaximized() {
    set((s) => ({ fileViewerMaximized: !s.fileViewerMaximized }));
  },

  toggleRightPanel() {
    set((state) => ({ rightPanelOpen: !state.rightPanelOpen }));
  },

  setLeftSidebarSplitRatio(ratio) {
    set({ leftSidebarSplitRatio: Math.min(0.8, Math.max(0.2, ratio)) });
  },

  setRightPanelSplitRatio(ratio) {
    set({ rightPanelSplitRatio: ratio });
  },
});
