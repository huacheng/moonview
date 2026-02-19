import type { CellType } from '@notebook-ai/shared';
import { useStore } from '../store';
import { Cell } from './Cell';

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

// ── Slice view ──────────────────────────────────────────────────────────────

function SliceView() {
  const notebook = useStore((s) => s.notebook);
  const slice = notebook?.slice;

  if (!slice || !slice.generated || slice.sections.length === 0) {
    return (
      <div className="slice-empty">
        <p>No slice generated yet.</p>
        <p className="slice-empty-hint">
          Run cells in the Notebook tab and the AI will populate a structured summary here.
        </p>
      </div>
    );
  }

  return (
    <div className="slice-view">
      {slice.sections
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((section) => (
          <div key={section.id} className="slice-section">
            <h2 className="slice-section-title">{section.title}</h2>
            <div className="slice-section-content">
              <p>{section.content}</p>
            </div>
            {section.cell_refs.length > 0 && (
              <div className="slice-section-refs">
                <span>Referenced cells: </span>
                {section.cell_refs.map((ref) => (
                  <code key={ref} className="slice-cell-ref">
                    {ref.slice(0, 8)}
                  </code>
                ))}
              </div>
            )}
          </div>
        ))}
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
