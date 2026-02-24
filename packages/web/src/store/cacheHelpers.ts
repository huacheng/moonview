import type { Notebook } from '@notebook-ai/shared';
import { cacheSet, cacheGet, TTL } from '../utils/localCache';

let _persistTimer: ReturnType<typeof setTimeout> | null = null;

export function _cacheKey(notebookId: string) {
  return `nb-notebook-${notebookId}`;
}

export function _persistNotebook(notebookId: string, notebook: Notebook) {
  if (_persistTimer) clearTimeout(_persistTimer);
  _persistTimer = setTimeout(() => {
    _persistTimer = null;
    cacheSet(_cacheKey(notebookId), notebook);
  }, 400);
}

export function _loadCachedNotebook(notebookId: string): Notebook | null {
  return cacheGet<Notebook>(_cacheKey(notebookId), TTL.NOTEBOOK);
}
