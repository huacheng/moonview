import { useState, useRef, useEffect } from 'react';
import type { CellType } from '@notebook-ai/shared';
import { useStore } from '../store';
import { Cell } from './Cell';

// ── Add cell dropdown ───────────────────────────────────────────────────────

interface AddCellButtonProps {
  onAdd(type: CellType): void;
  label?: string;
}

function AddCellButton({ onAdd, label = '+ Add Cell' }: AddCellButtonProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="add-cell-wrapper" ref={ref}>
      <button
        className="add-cell-btn"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
      >
        {label}
      </button>
      {open && (
        <div className="add-cell-dropdown" role="menu">
          <button
            className="add-cell-option"
            role="menuitem"
            onClick={() => {
              onAdd('prompt');
              setOpen(false);
            }}
          >
            <span className="add-cell-option-icon">⚡</span>
            Prompt cell
          </button>
          <button
            className="add-cell-option"
            role="menuitem"
            onClick={() => {
              onAdd('markdown');
              setOpen(false);
            }}
          >
            <span className="add-cell-option-icon">M↓</span>
            Markdown cell
          </button>
        </div>
      )}
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
            <AddCellButton onAdd={(type) => addCell(type)} />
          </div>
        </div>
      )}

      {activeTab === 'slice' && <SliceView />}
    </div>
  );
}
