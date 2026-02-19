import type { CellType } from '@notebook-ai/shared';
import { useStore } from '../store';
import { Cell } from './Cell';
import { SliceView } from './SliceView';

// ── Add cell buttons ────────────────────────────────────────────────────────

interface AddCellButtonsProps {
  onAdd(type: CellType): void;
}

function AddCellButtons({ onAdd }: AddCellButtonsProps) {
  return (
    <div className="add-cell-wrapper">
      <button className="add-cell-btn" onClick={() => onAdd('prompt')}>
        <span className="add-cell-option-icon">⚡</span> + Prompt
      </button>
      <button className="add-cell-btn" onClick={() => onAdd('markdown')}>
        <span className="add-cell-option-icon">M↓</span> + Markdown
      </button>
    </div>
  );
}

// ── Notebook status bar ─────────────────────────────────────────────────────

function NotebookStatusBar() {
  const notebook = useStore((s) => s.notebook);
  const activeNotebookId = useStore((s) => s.activeNotebookId);
  const notebookList = useStore((s) => s.notebookList);
  const sessionId = useStore((s) => s.sessionId);
  const activeTab = useStore((s) => s.activeTab);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const saveNotebook = useStore((s) => s.saveNotebook);
  const wsStatus = useStore((s) => s.wsStatus);
  const connected = wsStatus === 'connected';

  // Prefer the title from the sidebar list (always kept current by renameNotebook +
  // fetchNotebookList) so the status bar stays in sync after any rename.
  const listTitle = notebookList.find((n) => n.id === activeNotebookId)?.title;
  const title = listTitle ?? notebook?.metadata.title ?? 'Untitled Notebook';
  const inSlice = activeTab === 'slice';

  function handleExport() {
    if (!sessionId) return;
    const url = `/api/notebooks/${encodeURIComponent(sessionId)}/export-zip`;
    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  return (
    <div className="notebook-statusbar">
      <span className="notebook-statusbar-title" title={title}>{title}</span>

      <div className="notebook-statusbar-actions">
        <button
          className="notebook-statusbar-btn"
          onClick={() => saveNotebook()}
          disabled={!connected}
          title={connected ? 'Save notebook' : 'Not connected'}
        >
          Save
        </button>
        <button
          className="notebook-statusbar-btn"
          onClick={handleExport}
          disabled={!sessionId}
          title={sessionId ? 'Export notebook as bundle' : 'No active session'}
        >
          Export
        </button>
        <button
          className={`notebook-statusbar-btn notebook-statusbar-slice-btn${inSlice ? ' active' : ''}`}
          onClick={() => setActiveTab(inSlice ? 'notebook' : 'slice')}
          title={inSlice ? 'Back to Notebook' : 'Open Slice view'}
        >
          {inSlice ? '◂ Notebook' : 'Slice ▸'}
        </button>
      </div>
    </div>
  );
}

// ── Main Notebook component ─────────────────────────────────────────────────

export function Notebook() {
  const notebook = useStore((s) => s.notebook);
  const activeTab = useStore((s) => s.activeTab);
  const addCell = useStore((s) => s.addCell);

  const cells = notebook?.cells ?? [];

  return (
    <div className="notebook-container">
      <NotebookStatusBar />

      {activeTab === 'notebook' && (
        <div className="notebook-cells">
          {cells.length === 0 && (
            <div className="notebook-empty">
              <p>This notebook is empty.</p>
              <p>Add a cell below to get started.</p>
            </div>
          )}

          {cells.map((cell, index) => (
            <Cell
              key={cell.id}
              cell={cell}
              index={index}
              totalCells={cells.length}
            />
          ))}

          <div className="notebook-add-cell-row">
            <AddCellButtons onAdd={(type) => addCell(type)} />
          </div>
        </div>
      )}

      {activeTab === 'slice' && <SliceView />}
    </div>
  );
}
