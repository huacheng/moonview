import { useState, useRef, useCallback } from 'react';

interface InsertZoneProps {
  cellId: string;
  afterOutputIndex: number;
  onInsert: (content: string) => void;
}

export function InsertZone({ cellId: _cellId, afterOutputIndex: _afterOutputIndex, onInsert }: InsertZoneProps) {
  const [expanded, setExpanded] = useState(false);
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleOpen = useCallback(() => {
    setExpanded(true);
    // Focus the textarea after render
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }, []);

  const handleSave = useCallback(() => {
    const trimmed = value.trim();
    if (trimmed) {
      onInsert(trimmed);
    }
    setValue('');
    setExpanded(false);
  }, [value, onInsert]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleSave();
      }
      if (e.key === 'Escape') {
        setValue('');
        setExpanded(false);
      }
    },
    [handleSave],
  );

  const handleBlur = useCallback(() => {
    // Small delay to allow button clicks to register
    setTimeout(() => {
      if (value.trim()) {
        handleSave();
      } else {
        setExpanded(false);
      }
    }, 150);
  }, [value, handleSave]);

  if (!expanded) {
    return (
      <div className="insert-zone">
        <div className="insert-zone-line" />
        <button
          className="insert-zone-btn"
          onClick={handleOpen}
          title="Insert annotation here"
        >
          +
        </button>
        <div className="insert-zone-line" />
      </div>
    );
  }

  return (
    <div className="insert-zone insert-zone-expanded">
      <textarea
        ref={textareaRef}
        className="insert-zone-textarea"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder="Type annotation text... (Ctrl+Enter to save, Esc to cancel)"
        rows={2}
      />
    </div>
  );
}
