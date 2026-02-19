import type { StateCreator } from 'zustand';
import type { NotebookStore } from './types';

export const createAuthSlice: StateCreator<NotebookStore, [], [], Pick<NotebookStore,
  | 'authToken' | 'authRequired' | 'authError' | 'authLoading'
  | 'checkAuthStatus' | 'login' | 'logout'
>> = (set, get) => ({
  authToken: localStorage.getItem('nb-auth-token'),
  authRequired: null,
  authError: null,
  authLoading: false,

  async checkAuthStatus() {
    try {
      const res = await fetch('/api/auth/status');
      const data = (await res.json()) as { authEnabled: boolean };
      set({ authRequired: data.authEnabled });

      if (data.authEnabled) {
        const token = get().authToken;
        if (token) {
          const check = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
          });
          if (!check.ok) {
            localStorage.removeItem('nb-auth-token');
            set({ authToken: null });
          }
        }
      }
    } catch {
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
    get().disconnectWebSocket();
  },
});
