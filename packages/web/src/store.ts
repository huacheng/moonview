import { create } from 'zustand';
import { createAuthSlice } from './store/authSlice';
import { createSidebarSlice } from './store/sidebarSlice';
import { createNotebookSlice } from './store/notebookSlice';
import { createProjectSlice } from './store/projectSlice';
import { createUiSlice } from './store/uiSlice';
import { createWsSlice } from './store/wsSlice';
import { _persistNotebook } from './store/cacheHelpers';

export type { NotebookStore } from './store/types';

export const useStore = create<import('./store/types').NotebookStore>()((...a) => ({
  ...createAuthSlice(...a),
  ...createSidebarSlice(...a),
  ...createNotebookSlice(...a),
  ...createProjectSlice(...a),
  ...createUiSlice(...a),
  ...createWsSlice(...a),
}));

// Auto-persist notebook to localStorage whenever it changes
useStore.subscribe((state, prevState) => {
  if (
    state.notebook !== prevState.notebook &&
    state.notebook !== null &&
    state.activeNotebookId !== null
  ) {
    _persistNotebook(state.activeNotebookId, state.notebook);
  }
});
