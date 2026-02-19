import type { StateCreator } from 'zustand';
import type { NotebookStore } from './types';

export const createUiSlice: StateCreator<NotebookStore, [], [], Pick<NotebookStore,
  | 'activeTab' | 'sessionNotice' | 'latency' | 'creatingNotebook'
  | 'filesPanelOpen' | 'wsReconnectExhausted'
  | 'setActiveTab' | 'clearSessionNotice' | 'setLatency'
  | 'setWsReconnectExhausted' | 'toggleFilesPanel'
>> = (set) => ({
  activeTab: 'notebook',
  sessionNotice: null,
  latency: null,
  creatingNotebook: false,
  filesPanelOpen: false,
  wsReconnectExhausted: false,

  setActiveTab(tab) {
    set({ activeTab: tab });
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
});
