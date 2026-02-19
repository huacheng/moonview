import type { Notebook } from '@notebook-ai/shared';

let _persistTimer: ReturnType<typeof setTimeout> | null = null;

export function _cacheKey(notebookId: string) {
  return `nb-notebook-${notebookId}`;
}

export function _persistNotebook(notebookId: string, notebook: Notebook) {
  if (_persistTimer) clearTimeout(_persistTimer);
  _persistTimer = setTimeout(() => {
    _persistTimer = null;
    try {
      localStorage.setItem(_cacheKey(notebookId), JSON.stringify(notebook));
    } catch {
      // localStorage quota exceeded — evict oldest notebook caches
      try {
        const keys = Object.keys(localStorage).filter((k) => k.startsWith('nb-notebook-'));
        if (keys.length > 0) {
          localStorage.removeItem(keys[0]);
          localStorage.setItem(_cacheKey(notebookId), JSON.stringify(notebook));
        }
      } catch {}
    }
  }, 400);
}

export function _loadCachedNotebook(notebookId: string): Notebook | null {
  try {
    const raw = localStorage.getItem(_cacheKey(notebookId));
    if (!raw) return null;
    return JSON.parse(raw) as Notebook;
  } catch {
    return null;
  }
}
