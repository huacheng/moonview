import { useState, useEffect } from 'react';
import { cacheSet, cacheGet, cacheRemove, TTL } from '../utils/localCache';

export function useDraft(cellId: string, initialValue: string) {
  const storageKey = `nb-draft-${cellId}`;
  const [draft, setDraft] = useState<string>(
    () => cacheGet<string>(storageKey, TTL.DRAFT) ?? initialValue,
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      cacheSet(storageKey, draft);
    }, 50);
    return () => clearTimeout(timer);
  }, [draft, storageKey]);

  function clearDraft() {
    cacheRemove(storageKey);
  }

  return { draft, setDraft, clearDraft };
}
