import { memo } from 'react';
import type { Cell as CellData, MarkdownCell } from '@notebook-ai/shared';
import { CellOutput } from './CellOutput';
import { GitDiffView } from './GitDiffView';
import { renderMd } from '../utils/markdown';

// ── Status indicator ────────────────────────────────────────────────────────

const StatusIndicator = memo(function StatusIndicator({ status }: { status: CellData['status'] }) {
  if (status === 'idle') return null;
  return (
    <span className={`cell-status cell-status-${status}`} aria-label={status}>
      {status === 'running' && <span className="spinner" aria-hidden="true" />}
      {status === 'running' ? 'Running…' : status === 'error' ? 'Error' : null}
    </span>
  );
});

// ── Markdown cell (read-only) ────────────────────────────────────────────────

function MarkdownCellBody({ cell }: { cell: MarkdownCell }) {
  return (
    <div
      className="markdown-preview"
      dangerouslySetInnerHTML={{
        __html: renderMd(cell.source) || '<em>Empty markdown cell</em>',
      }}
    />
  );
}

// ── Main Cell component ─────────────────────────────────────────────────────

interface CellProps {
  cell: CellData;
  index: number;
}

export function Cell({ cell, index }: CellProps) {
  const execNum = cell.execution_count || index + 1;

  return (
    <div
      className={`cell cell-${cell.type} cell-status-indicator-${cell.status}`}
      data-cell-id={cell.id}
    >
      {cell.type === 'prompt' && (
        <>
          <div className="cell-prompt-row">
            <span className="cell-index">[{execNum}]</span>
            <div
              className="cell-prompt-source markdown-body"
              dangerouslySetInnerHTML={{ __html: renderMd(cell.source) }}
            />
          </div>

          {(cell.outputs.length > 0 || cell.status === 'running') && (
            <div className="cell-output-area">
              <StatusIndicator status={cell.status} />
              {cell.outputs.length > 0 && (
                <CellOutput
                  outputs={cell.outputs}
                  cellId={cell.id}
                  isActiveCell={cell.status === 'running'}
                />
              )}
            </div>
          )}

          {cell.git_diff && <GitDiffView diff={cell.git_diff} />}
        </>
      )}

      {cell.type === 'markdown' && <MarkdownCellBody cell={cell} />}
    </div>
  );
}
