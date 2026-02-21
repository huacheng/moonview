interface FileSelectionFloatProps {
  x: number;
  y: number;
  onDelete: () => void;
  onReplace: () => void;
  onComment: () => void;
  onInsertAfter: () => void;
}

export function FileSelectionFloat({ x, y, onDelete, onReplace, onComment, onInsertAfter }: FileSelectionFloatProps) {
  return (
    <div className="fv-selection-float" style={{ top: y, left: x }}>
      <button className="fv-sf-btn fv-sf-delete" onMouseDown={(e) => { e.preventDefault(); onDelete(); }} title="Delete">−</button>
      <button className="fv-sf-btn fv-sf-replace" onMouseDown={(e) => { e.preventDefault(); onReplace(); }} title="Replace">⇄</button>
      <button className="fv-sf-btn fv-sf-comment" onMouseDown={(e) => { e.preventDefault(); onComment(); }} title="Comment">?</button>
      <button className="fv-sf-btn fv-sf-insert" onMouseDown={(e) => { e.preventDefault(); onInsertAfter(); }} title="Insert after">+</button>
    </div>
  );
}
