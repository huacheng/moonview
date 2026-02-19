import { useState, useCallback, useEffect, memo } from 'react';
import type { Cell as CellData, PromptCell, MarkdownCell } from '@notebook-ai/shared';
import { CellInput } from './CellInput';
import { CellOutput } from './CellOutput';
import { GitDiffView } from './GitDiffView';
import { useStore } from '../store';
import { useDraft } from '../hooks/useDraft';

// ── Status indicator ────────────────────────────────────────────────────────

const StatusIndicator = memo(function StatusIndicator({ status }: { status: CellData['status'] }) {
  const labels: Record<CellData['status'], string> = {
    idle: '',
    running: 'Running…',
    completed: 'Done',
    error: 'Error',
  };
  return (
    <span className={`cell-status cell-status-${status}`} aria-label={status}>
      {status === 'running' && <span className="spinner" aria-hidden="true" />}
      {labels[status]}
    </span>
  );
});

// ── Toolbar for each cell ───────────────────────────────────────────────────

interface CellToolbarProps {
  cellId: string;
  cellType: CellData['type'];
  status: CellData['status'];
  isFirst: boolean;
  isLast: boolean;
  onRun(): void;
  onDelete(): void;
  onMoveUp(): void;
  onMoveDown(): void;
}

const CellToolbar = memo(function CellToolbar({
  cellType,
  status,
  isFirst,
  isLast,
  onRun,
  onDelete,
  onMoveUp,
  onMoveDown,
}: CellToolbarProps) {
  return (
    <div className="cell-toolbar">
      <div className="cell-toolbar-left">
        {cellType === 'prompt' && (
          <button
            className="cell-btn cell-btn-run"
            onClick={onRun}
            disabled={status === 'running'}
            title="Run cell (Ctrl+Enter)"
          >
            {status === 'running' ? '■' : '▶'}
          </button>
        )}
        <button
          className="cell-btn"
          onClick={onMoveUp}
          disabled={isFirst}
          title="Move up"
        >
          ↑
        </button>
        <button
          className="cell-btn"
          onClick={onMoveDown}
          disabled={isLast}
          title="Move down"
        >
          ↓
        </button>
      </div>
      <div className="cell-toolbar-right">
        <button
          className="cell-btn cell-btn-delete"
          onClick={onDelete}
          title="Delete cell"
        >
          ✕
        </button>
      </div>
    </div>
  );
});

// ── Markdown cell ───────────────────────────────────────────────────────────

function MarkdownCellBody({ cell }: { cell: MarkdownCell }) {
  const [editing, setEditing] = useState(!cell.source);
  const updateCellSource = useStore((s) => s.updateCellSource);
  const { draft, setDraft, clearDraft } = useDraft(cell.id, cell.source);

  // Pause localStorage saves when not editing.
  useEffect(() => {
    if (!editing) return;
    const timer = setTimeout(() => {
      localStorage.setItem(`nb-draft-${cell.id}`, draft);
    }, 50);
    return () => clearTimeout(timer);
  }, [draft, cell.id, editing]);

  // Escape HTML special chars to prevent XSS before inserting user content into markup.
  function escapeHtml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Very minimal markdown → HTML (bold, italic, headings, paragraphs).
  // Input is HTML-escaped first so user content can never inject markup.
  function renderMarkdown(text: string): string {
    const lines = text.split('\n');
    const htmlLines = lines.map((line) => {
      if (/^### (.+)/.test(line)) return `<h3>${escapeHtml(line.slice(4))}</h3>`;
      if (/^## (.+)/.test(line))  return `<h2>${escapeHtml(line.slice(3))}</h2>`;
      if (/^# (.+)/.test(line))   return `<h1>${escapeHtml(line.slice(2))}</h1>`;
      if (line.trim() === '') return '<br/>';
      let html = escapeHtml(line)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/`(.+?)`/g, '<code>$1</code>');
      return `<p>${html}</p>`;
    });
    return htmlLines.join('');
  }

  function commitDraft() {
    updateCellSource(cell.id, draft);
    clearDraft();
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="markdown-edit-wrapper">
        <textarea
          className="cell-input markdown-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              commitDraft();
            }
          }}
          placeholder="Enter Markdown… (Ctrl+Enter to preview)"
          rows={4}
        />
        <button
          className="cell-btn markdown-preview-btn"
          onClick={commitDraft}
        >
          Preview
        </button>
      </div>
    );
  }

  return (
    <div
      className="markdown-preview"
      onClick={() => setEditing(true)}
      title="Click to edit"
      dangerouslySetInnerHTML={{ __html: renderMarkdown(cell.source) || '<em>Empty — click to edit</em>' }}
    />
  );
}

// ── Prompt cell ─────────────────────────────────────────────────────────────

function PromptCellBody({ cell }: { cell: PromptCell }) {
  const updateCellSource = useStore((s) => s.updateCellSource);
  const executeCell = useStore((s) => s.executeCell);

  const handleExecute = useCallback(() => {
    executeCell(cell.id);
  }, [executeCell, cell.id]);

  return (
    <>
      <CellInput
        cellId={cell.id}
        value={cell.source}
        onChange={(v) => updateCellSource(cell.id, v)}
        onExecute={handleExecute}
        disabled={cell.status === 'running'}
      />
      {cell.outputs.length > 0 && (
        <CellOutput
          outputs={cell.outputs}
          cellId={cell.id}
          isActiveCell={cell.status === 'running'}
        />
      )}
      {cell.git_diff && <GitDiffView diff={cell.git_diff} />}
    </>
  );
}

// ── Main Cell component ─────────────────────────────────────────────────────

interface CellProps {
  cell: CellData;
  index: number;
  totalCells: number;
}

export function Cell({ cell, index, totalCells }: CellProps) {
  const removeCell = useStore((s) => s.removeCell);
  const moveCell = useStore((s) => s.moveCell);
  const executeCell = useStore((s) => s.executeCell);

  const isFirst = index === 0;
  const isLast = index === totalCells - 1;

  const handleRun = useCallback(() => executeCell(cell.id), [cell.id, executeCell]);
  const handleDelete = useCallback(() => removeCell(cell.id), [cell.id, removeCell]);
  const handleMoveUp = useCallback(() => moveCell(cell.id, 'up'), [cell.id, moveCell]);
  const handleMoveDown = useCallback(() => moveCell(cell.id, 'down'), [cell.id, moveCell]);

  return (
    <div
      className={`cell cell-${cell.type} cell-status-indicator-${cell.status}`}
      data-cell-id={cell.id}
    >
      <div className="cell-left-gutter">
        <span className="cell-index">
          {cell.type === 'prompt' ? `[${cell.execution_count || ' '}]` : ''}
        </span>
      </div>

      <div className="cell-body">
        <CellToolbar
          cellId={cell.id}
          cellType={cell.type}
          status={cell.status}
          isFirst={isFirst}
          isLast={isLast}
          onRun={handleRun}
          onDelete={handleDelete}
          onMoveUp={handleMoveUp}
          onMoveDown={handleMoveDown}
        />

        <div className="cell-content">
          {cell.type === 'prompt' && <PromptCellBody cell={cell} />}
          {cell.type === 'markdown' && <MarkdownCellBody cell={cell} />}
          {cell.type === 'visualization' && (
            <div className="cell-visualization-placeholder">
              Visualization cell — rendering coming soon
            </div>
          )}
        </div>

        <div className="cell-footer">
          <StatusIndicator status={cell.status} />
          {cell.type === 'prompt' && cell.status === 'completed' && (
            <span className="cell-exec-count">
              Execution #{cell.execution_count}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
