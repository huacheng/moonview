import { useState, useEffect, useCallback, useRef } from 'react';

export interface SelectionInfo {
  text: string;
  rect: DOMRect;
}

interface SelectionFloatProps {
  containerRef: React.RefObject<HTMLElement | null>;
  cellId: string;
  onDelete: (cellId: string, selectedText: string) => void;
  onReplace: (cellId: string, selectedText: string) => void;
  onComment: (cellId: string, selectedText: string) => void;
}

export function SelectionFloat({
  containerRef,
  cellId,
  onDelete,
  onReplace,
  onComment,
}: SelectionFloatProps) {
  const [selection, setSelection] = useState<SelectionInfo | null>(null);
  const floatRef = useRef<HTMLDivElement>(null);

  const handleSelectionChange = useCallback(() => {
    const sel = document.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) {
      setSelection(null);
      return;
    }

    const range = sel.getRangeAt(0);
    const container = containerRef.current;
    if (!container || !container.contains(range.commonAncestorContainer)) {
      setSelection(null);
      return;
    }

    const text = sel.toString().trim();
    if (!text) {
      setSelection(null);
      return;
    }

    const rect = range.getBoundingClientRect();
    setSelection({ text, rect });
  }, [containerRef]);

  useEffect(() => {
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [handleSelectionChange]);

  const handleAction = useCallback(
    (action: 'delete' | 'replace' | 'comment') => {
      if (!selection) return;
      const text = selection.text;
      // Clear selection after action
      document.getSelection()?.removeAllRanges();
      setSelection(null);

      switch (action) {
        case 'delete':
          onDelete(cellId, text);
          break;
        case 'replace':
          onReplace(cellId, text);
          break;
        case 'comment':
          onComment(cellId, text);
          break;
      }
    },
    [selection, cellId, onDelete, onReplace, onComment],
  );

  if (!selection) return null;

  const container = containerRef.current;
  if (!container) return null;

  const containerRect = container.getBoundingClientRect();
  const top = selection.rect.top - containerRect.top - 40;
  const left =
    selection.rect.left -
    containerRect.left +
    selection.rect.width / 2;

  return (
    <div
      ref={floatRef}
      className="selection-float"
      style={{
        position: 'absolute',
        top: `${Math.max(0, top)}px`,
        left: `${left}px`,
        transform: 'translateX(-50%)',
        zIndex: 300,
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <button
        className="selection-float-btn selection-float-delete"
        onClick={() => handleAction('delete')}
        title="Delete selected text"
      >
        &minus;
      </button>
      <button
        className="selection-float-btn selection-float-replace"
        onClick={() => handleAction('replace')}
        title="Replace selected text"
      >
        &#8644;
      </button>
      <button
        className="selection-float-btn selection-float-comment"
        onClick={() => handleAction('comment')}
        title="Comment on selected text"
      >
        ?
      </button>
    </div>
  );
}
