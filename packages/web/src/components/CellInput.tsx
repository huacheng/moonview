import { useRef, useEffect, useCallback } from 'react';
import { useDraft } from '../hooks/useDraft';

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { draft, setDraft, clearDraft } = useDraft(cellId, value);

  // Auto-resize textarea to fit content.
  const resize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useEffect(() => { resize(); }, [draft, resize]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (disabled) return;
      // Commit draft to store first, then execute.
      onChange(draft);
      clearDraft();
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
