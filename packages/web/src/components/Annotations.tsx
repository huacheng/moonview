import { useCallback, useMemo, useRef, useState } from 'react';
import type {
  Annotation,
  InsertAnnotation,
  DeleteAnnotation,
  ReplaceAnnotation,
  CommentAnnotation,
  CellOutput as CellOutputType,
} from '@notebook-ai/shared';
import { useStore } from '../store';
import { AnnotationCard } from './AnnotationCard';
import { InsertZone } from './InsertZone';
import { SelectionFloat } from './SelectionFloat';

interface AnnotationsProps {
  cellId: string;
  outputs: CellOutputType[];
}

/**
 * Modal for Replace annotation — prompts user for replacement text.
 */
function ReplaceModal({
  selectedText,
  onConfirm,
  onCancel,
}: {
  selectedText: string;
  onConfirm: (replacement: string) => void;
  onCancel: () => void;
}) {
  const [replacement, setReplacement] = useState('');

  return (
    <div className="annotation-modal-overlay" onClick={onCancel}>
      <div
        className="annotation-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <h4 className="annotation-modal-title">Replace Text</h4>
        <div className="annotation-modal-field">
          <label className="annotation-modal-label">Original:</label>
          <pre className="annotation-modal-original">{selectedText}</pre>
        </div>
        <div className="annotation-modal-field">
          <label className="annotation-modal-label">Replacement:</label>
          <textarea
            className="annotation-modal-input"
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            placeholder="Enter replacement text..."
            rows={3}
            autoFocus
          />
        </div>
        <div className="annotation-modal-actions">
          <button className="annotation-modal-btn annotation-modal-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="annotation-modal-btn annotation-modal-confirm"
            onClick={() => onConfirm(replacement)}
            disabled={!replacement.trim()}
          >
            Replace
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Modal for Comment annotation — prompts user for comment text.
 */
function CommentModal({
  selectedText,
  onConfirm,
  onCancel,
}: {
  selectedText: string;
  onConfirm: (comment: string) => void;
  onCancel: () => void;
}) {
  const [comment, setComment] = useState('');

  return (
    <div className="annotation-modal-overlay" onClick={onCancel}>
      <div
        className="annotation-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <h4 className="annotation-modal-title">Add Comment</h4>
        <div className="annotation-modal-field">
          <label className="annotation-modal-label">Selected text:</label>
          <pre className="annotation-modal-original">{selectedText}</pre>
        </div>
        <div className="annotation-modal-field">
          <label className="annotation-modal-label">Comment:</label>
          <textarea
            className="annotation-modal-input"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Enter your comment..."
            rows={3}
            autoFocus
          />
        </div>
        <div className="annotation-modal-actions">
          <button className="annotation-modal-btn annotation-modal-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="annotation-modal-btn annotation-modal-confirm"
            onClick={() => onConfirm(comment)}
            disabled={!comment.trim()}
          >
            Add Comment
          </button>
        </div>
      </div>
    </div>
  );
}

export function Annotations({ cellId, outputs }: AnnotationsProps) {
  const addAnnotation = useStore((s) => s.addAnnotation);
  const removeAnnotation = useStore((s) => s.removeAnnotation);
  // Select the raw annotations array (stable reference across unrelated store
  // updates such as appendCellOutput).  Filter locally via useMemo so we never
  // return a new array reference from the Zustand selector — doing so would
  // cause useSyncExternalStore to detect a "tear" on every render and loop
  // indefinitely (React error #185).
  const allAnnotations = useStore((s) => s.notebook?.annotations);
  const annotations = useMemo(
    () => allAnnotations?.filter((a) => a.target_cell === cellId) ?? [],
    [allAnnotations, cellId],
  );

  const containerRef = useRef<HTMLDivElement>(null);

  // Modal state
  const [replaceModal, setReplaceModal] = useState<{
    cellId: string;
    text: string;
  } | null>(null);

  const [commentModal, setCommentModal] = useState<{
    cellId: string;
    text: string;
  } | null>(null);

  // ── Insert annotation ──────────────────────────────────────────────────

  const handleInsert = useCallback(
    (afterOutputIndex: number, content: string) => {
      const annotation: InsertAnnotation = {
        id: crypto.randomUUID(),
        type: 'insert',
        target_cell: cellId,
        after_output_index: afterOutputIndex,
        content,
        author: 'user',
        timestamp: new Date().toISOString(),
      };
      addAnnotation(annotation);
    },
    [cellId, addAnnotation],
  );

  // ── Delete annotation ──────────────────────────────────────────────────

  const handleDelete = useCallback(
    (_cellId: string, selectedText: string) => {
      const annotation: DeleteAnnotation = {
        id: crypto.randomUUID(),
        type: 'delete',
        target_cell: cellId,
        output_indices: [],
        selected_text: selectedText,
        author: 'user',
        timestamp: new Date().toISOString(),
      };
      addAnnotation(annotation);
    },
    [cellId, addAnnotation],
  );

  // ── Replace annotation ─────────────────────────────────────────────────

  const handleReplaceStart = useCallback(
    (cId: string, selectedText: string) => {
      setReplaceModal({ cellId: cId, text: selectedText });
    },
    [],
  );

  const handleReplaceConfirm = useCallback(
    (replacement: string) => {
      if (!replaceModal) return;
      const annotation: ReplaceAnnotation = {
        id: crypto.randomUUID(),
        type: 'replace',
        target_cell: cellId,
        output_indices: [],
        selected_text: replaceModal.text,
        replacement,
        author: 'user',
        timestamp: new Date().toISOString(),
      };
      addAnnotation(annotation);
      setReplaceModal(null);
    },
    [cellId, replaceModal, addAnnotation],
  );

  // ── Comment annotation ─────────────────────────────────────────────────

  const handleCommentStart = useCallback(
    (cId: string, selectedText: string) => {
      setCommentModal({ cellId: cId, text: selectedText });
    },
    [],
  );

  const handleCommentConfirm = useCallback(
    (comment: string) => {
      if (!commentModal) return;
      const annotation: CommentAnnotation = {
        id: crypto.randomUUID(),
        type: 'comment',
        target_cell: cellId,
        output_indices: [],
        selected_text: commentModal.text,
        comment,
        author: 'user',
        timestamp: new Date().toISOString(),
      };
      addAnnotation(annotation);
      setCommentModal(null);
    },
    [cellId, commentModal, addAnnotation],
  );

  // Get annotations that are "insert" type for positioning between outputs
  const insertAnnotations = annotations.filter(
    (a): a is InsertAnnotation => a.type === 'insert',
  );

  // Get non-insert annotations for display after the output area
  const otherAnnotations = annotations.filter(
    (a): a is Exclude<Annotation, InsertAnnotation> => a.type !== 'insert',
  );

  // Don't render anything when there are no annotations at all – avoids
  // empty wrapper divs / InsertZone buttons cluttering the output area.
  if (annotations.length === 0) return null;

  return (
    <div className="annotations-wrapper" ref={containerRef}>
      {/* Selection float toolbar on output text */}
      <SelectionFloat
        containerRef={containerRef}
        cellId={cellId}
        onDelete={handleDelete}
        onReplace={handleReplaceStart}
        onComment={handleCommentStart}
      />

      {/* Insert annotations rendered at their positions */}
      {insertAnnotations.length > 0 && outputs.length > 0 && (
        <>
          {outputs.map((_output, i) => {
            const insertsAfter = insertAnnotations.filter(
              (a) => a.after_output_index === i,
            );
            if (insertsAfter.length === 0) return null;
            return (
              <div key={`insert-zone-${i}`}>
                {insertsAfter.map((ann) => (
                  <AnnotationCard
                    key={ann.id}
                    annotation={ann}
                    onRemove={removeAnnotation}
                  />
                ))}
                <InsertZone
                  cellId={cellId}
                  afterOutputIndex={i}
                  onInsert={(content) => handleInsert(i, content)}
                />
              </div>
            );
          })}
        </>
      )}

      {/* Other annotation cards */}
      {otherAnnotations.length > 0 && (
        <div className="annotations-list">
          {otherAnnotations.map((ann) => (
            <AnnotationCard
              key={ann.id}
              annotation={ann}
              onRemove={removeAnnotation}
            />
          ))}
        </div>
      )}

      {/* Replace modal */}
      {replaceModal && (
        <ReplaceModal
          selectedText={replaceModal.text}
          onConfirm={handleReplaceConfirm}
          onCancel={() => setReplaceModal(null)}
        />
      )}

      {/* Comment modal */}
      {commentModal && (
        <CommentModal
          selectedText={commentModal.text}
          onConfirm={handleCommentConfirm}
          onCancel={() => setCommentModal(null)}
        />
      )}
    </div>
  );
}
