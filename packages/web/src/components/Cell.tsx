import { memo } from 'react';
import type { Cell as CellData } from '@notebook-ai/shared';
import { CellOutput } from './CellOutput';
import { GitDiffView } from './GitDiffView';
import { renderMd } from '../utils/markdown';

// ── Status indicator ────────────────────────────────────────────────────────

const StatusIndicator = memo(function StatusIndicator({ status }: { status: CellData['status'] }) {
  if (status === 'idle' || status === 'completed') return null;
  return (
    <span className={`cell-status cell-status-${status}`} aria-label={status}>
      {status === 'running' && <span className="spinner" aria-hidden="true" />}
      {status === 'running' ? 'Running…' : status === 'error' ? 'Error' : null}
    </span>
  );
});

// ── Main Cell component ─────────────────────────────────────────────────────

interface CellProps {
  cell: CellData;
  index: number;
}

export function Cell({ cell, index }: CellProps) {
  // Only prompt cells are rendered; other types (markdown, visualization) are silently skipped.
  if (cell.type !== 'prompt') return null;

  const execNum = cell.execution_count || index + 1;
  const hasResponse = cell.outputs.length > 0 || cell.status === 'running';

  return (
    <div className="cell" data-cell-id={cell.id}>

      {/* ── Section 1: User prompt — right aligned ── */}
      <div className="cell-prompt-row">
        <span className="cell-index">[{execNum}]</span>
        <div
          className="cell-prompt-source markdown-body"
          dangerouslySetInnerHTML={{ __html: renderMd(cell.source) }}
        />
      </div>

      {/* ── Divider ── */}
      {hasResponse && <div className="cell-response-divider" />}

      {/* ── Sections 2/3/4: AI response — left aligned ── */}
      {hasResponse && (
        <div className="cell-response-area">
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
    </div>
  );
}
