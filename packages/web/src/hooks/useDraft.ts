import { useState, useEffect } from 'react';

export function useDraft(cellId: string, initialValue: string) {
  const storageKey = `nb-draft-${cellId}`;
  const [draft, setDraft] = useState<string>(
    () => localStorage.getItem(storageKey) ?? initialValue,
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      localStorage.setItem(storageKey, draft);
    }, 50);
    return () => clearTimeout(timer);
  }, [draft, storageKey]);

  function clearDraft() {
    localStorage.removeItem(storageKey);
  }

  return { draft, setDraft, clearDraft };
}
