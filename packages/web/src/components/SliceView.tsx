import { useState, useCallback } from 'react';
import { useStore } from '../store';
import type { SliceSection } from '@notebook-ai/shared';

// ── Section card ─────────────────────────────────────────────────────────────

function SliceSectionCard({
  section,
  onUpdate,
  onDelete,
  onMove,
  isFirst,
  isLast,
}: {
  section: SliceSection;
  onUpdate: (id: string, patch: Partial<Pick<SliceSection, 'title' | 'content'>>) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, direction: 'up' | 'down') => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingContent, setEditingContent] = useState(false);
  const [draftTitle, setDraftTitle] = useState(section.title);
  const [draftContent, setDraftContent] = useState(section.content);

  function commitTitle() {
    const trimmed = draftTitle.trim() || section.title;
    onUpdate(section.id, { title: trimmed });
    setEditingTitle(false);
  }

  function commitContent() {
    onUpdate(section.id, { content: draftContent });
    setEditingContent(false);
  }

  return (
    <div className="slice-section">
      {/* Header bar with order, move, and delete controls */}
      <div className="slice-section-header">
        <span className="slice-section-order">#{section.order + 1}</span>

        <div className="slice-section-actions">
          <button
            className="cell-btn"
            onClick={() => onMove(section.id, 'up')}
            disabled={isFirst}
            title="Move up"
          >
            &#9650;
          </button>
          <button
            className="cell-btn"
            onClick={() => onMove(section.id, 'down')}
            disabled={isLast}
            title="Move down"
          >
            &#9660;
          </button>
          <button
            className="cell-btn cell-btn-delete"
            onClick={() => onDelete(section.id)}
            title="Delete section"
          >
            &#10005;
          </button>
        </div>
      </div>

      {/* Editable title */}
      {editingTitle ? (
        <input
          className="slice-title-input"
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitTitle();
            if (e.key === 'Escape') {
              setDraftTitle(section.title);
              setEditingTitle(false);
            }
          }}
          autoFocus
        />
      ) : (
        <h3
          className="slice-section-title"
          onClick={() => {
            setDraftTitle(section.title);
            setEditingTitle(true);
          }}
          title="Click to edit title"
        >
          {section.title}
        </h3>
      )}

      {/* Editable content */}
      {editingContent ? (
        <div className="slice-content-edit-wrapper">
          <textarea
            className="slice-content-textarea"
            value={draftContent}
            onChange={(e) => setDraftContent(e.target.value)}
            onBlur={commitContent}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setDraftContent(section.content);
                setEditingContent(false);
              }
            }}
            autoFocus
            rows={6}
          />
          <button className="slice-content-done-btn" onClick={commitContent}>
            Done
          </button>
        </div>
      ) : (
        <div
          className="slice-section-content"
          onClick={() => {
            setDraftContent(section.content);
            setEditingContent(true);
          }}
          title="Click to edit content"
        >
          {section.content}
        </div>
      )}

      {/* Cell references */}
      {section.cell_refs.length > 0 && (
        <div className="slice-section-refs">
          <span>Cells:</span>
          {section.cell_refs.map((ref) => (
            <span key={ref} className="slice-cell-ref">
              {ref.slice(0, 8)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main SliceView ───────────────────────────────────────────────────────────

export function SliceView() {
  const notebook = useStore((s) => s.notebook);
  const sliceLoading = useStore((s) => s.sliceLoading);
  const generateSlice = useStore((s) => s.generateSlice);
  const updateSliceSections = useStore((s) => s.updateSliceSections);

  const sections = notebook?.slice.sections ?? [];
  const generated = notebook?.slice.generated ?? false;

  const handleUpdate = useCallback(
    (id: string, patch: Partial<Pick<SliceSection, 'title' | 'content'>>) => {
      const updated = sections.map((s) =>
        s.id === id ? { ...s, ...patch } : s,
      );
      updateSliceSections(updated);
    },
    [sections, updateSliceSections],
  );

  const handleDelete = useCallback(
    (id: string) => {
      const updated = sections
        .filter((s) => s.id !== id)
        .map((s, i) => ({ ...s, order: i }));
      updateSliceSections(updated);
    },
    [sections, updateSliceSections],
  );

  const handleMove = useCallback(
    (id: string, direction: 'up' | 'down') => {
      const idx = sections.findIndex((s) => s.id === id);
      if (idx === -1) return;
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= sections.length) return;

      const updated = [...sections];
      [updated[idx], updated[swapIdx]] = [updated[swapIdx], updated[idx]];
      // Re-index order values
      const reindexed = updated.map((s, i) => ({ ...s, order: i }));
      updateSliceSections(reindexed);
    },
    [sections, updateSliceSections],
  );

  // No notebook loaded
  if (!notebook) {
    return (
      <div className="slice-empty">
        <p>No notebook loaded.</p>
      </div>
    );
  }

  // Slice not yet generated
  if (!generated || sections.length === 0) {
    return (
      <div className="slice-empty">
        <p>No slice generated yet.</p>
        <p className="slice-empty-hint">
          Click the button below to generate a presentation summary from your notebook cells.
        </p>
        <div style={{ marginTop: '16px' }}>
          <button
            className="toolbar-btn"
            onClick={() => generateSlice()}
            disabled={sliceLoading}
          >
            {sliceLoading ? 'Generating...' : 'Generate Slice'}
          </button>
        </div>
      </div>
    );
  }

  // Slice generated — show sections
  return (
    <div className="slice-view">
      <div className="slice-toolbar">
        <button
          className="toolbar-btn"
          onClick={() => generateSlice()}
          disabled={sliceLoading}
        >
          {sliceLoading ? 'Regenerating...' : 'Re-generate Slice'}
        </button>
        <span className="slice-section-count">
          {sections.length} section{sections.length !== 1 ? 's' : ''}
        </span>
      </div>

      {[...sections]
        .sort((a, b) => a.order - b.order)
        .map((section, idx) => (
          <SliceSectionCard
            key={section.id}
            section={section}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            onMove={handleMove}
            isFirst={idx === 0}
            isLast={idx === sections.length - 1}
          />
        ))}
    </div>
  );
}
