import { useRef, useEffect, useCallback } from 'react';

interface CellInputProps {
  value: string;
  onChange(value: string): void;
  onExecute(): void;
  disabled?: boolean;
  placeholder?: string;
}

export function CellInput({
  value,
  onChange,
  onExecute,
  disabled = false,
  placeholder = 'Enter a prompt… (Shift+Enter to run)',
}: CellInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea to fit content
  const resize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useEffect(() => {
    resize();
  }, [value, resize]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      if (!disabled) onExecute();
    }
  }

  return (
    <div className="cell-input-wrapper">
      <textarea
        ref={textareaRef}
        className="cell-input"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
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
