import { useRef, useEffect, useCallback, useState } from 'react';

interface CellInputProps {
  cellId: string;
  value: string;          // committed value from store (only used as initial fallback)
  onChange(value: string): void;  // called on Ctrl+Enter to commit draft to store
  onExecute(): void;
  disabled?: boolean;
  placeholder?: string;
}

export function CellInput({
  cellId,
  value,
  onChange,
  onExecute,
  disabled = false,
  placeholder = 'Enter a prompt… (Ctrl+Enter to run)',
}: CellInputProps) {
  const storageKey = `nb-draft-${cellId}`;
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Initialize from localStorage draft, falling back to committed value.
  const [draft, setDraft] = useState<string>(
    () => localStorage.getItem(storageKey) ?? value,
  );

  // Auto-resize textarea to fit content.
  const resize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useEffect(() => { resize(); }, [draft, resize]);

  // Save draft to localStorage 50ms after each keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      localStorage.setItem(storageKey, draft);
    }, 50);
    return () => clearTimeout(timer);
  }, [draft, storageKey]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (disabled) return;
      // Commit draft to store first, then execute.
      onChange(draft);
      localStorage.removeItem(storageKey);
      onExecute();
    }
  }

  return (
    <div className="cell-input-wrapper">
      <textarea
        ref={textareaRef}
        className="cell-input"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          resize();
        }}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={placeholder}
        rows={1}
        spellCheck={false}
      />
    </div>
  );
}
