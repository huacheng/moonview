import type { StateCreator } from 'zustand';
import type { NotebookStore } from './types';

export interface ProjectListItem {
  id: string;
  title: string;
  slug: string;
  status: 'active' | 'archived';
  notebook_count: number;
  path: string;
  created_at: string;
  updated_at: string;
}

export const createProjectSlice: StateCreator<NotebookStore, [], [], Pick<NotebookStore,
  | 'projects' | 'projectsLoading' | 'activeProjectId' | 'activeProjectPath'
  | 'sidebarLevel' | 'fileBrowserPath'
  | 'fetchProjects' | 'createProject' | 'setActiveProject' | 'goBackToProjectList'
  | 'navigateFileBrowser' | 'createNotebook'
>> = (set, get) => ({
  projects: [],
  projectsLoading: false,
  activeProjectId: null,
  activeProjectPath: null,
  sidebarLevel: 'L1' as const,
  fileBrowserPath: '',

  fetchProjects: async () => {
    set({ projectsLoading: true });
    try {
      const token = get().authToken;
      const res = await fetch('/api/projects', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const projects = await res.json();
      set({ projects, projectsLoading: false });
    } catch {
      set({ projectsLoading: false });
    }
  },

  createProject: async (title: string) => {
    const token = get().authToken;
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ title }),
    });
    if (res.ok) {
      await get().fetchProjects();
    }
  },

  setActiveProject: (id: string, path: string) => {
    set({
      activeProjectId: id,
      activeProjectPath: path,
      sidebarLevel: 'L2' as const,
      fileBrowserPath: '',
    });
  },

  goBackToProjectList: () => {
    set({
      activeProjectId: null,
      activeProjectPath: null,
      sidebarLevel: 'L1' as const,
      fileBrowserPath: '',
    });
  },

  navigateFileBrowser: (subPath: string) => {
    set({ fileBrowserPath: subPath });
  },

  createNotebook: async (projectId: string, title: string) => {
    const token = get().authToken;
    const res = await fetch(`/api/projects/${projectId}/notebooks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ title }),
    });
    const data = await res.json();
    return { sessionId: data.sessionId, notebookPath: data.notebookPath };
  },
});
