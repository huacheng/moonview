import type { Annotation } from '@notebook-ai/shared';

interface AnnotationCardProps {
  annotation: Annotation;
  onRemove: (id: string) => void;
}

function formatTimestamp(ts: string): string {
  try {
    const date = new Date(ts);
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return ts;
  }
}

function InsertAnnotationBody({ annotation }: { annotation: Extract<Annotation, { type: 'insert' }> }) {
  return (
    <div className="annotation-card-body">
      <span className="annotation-card-label">Insert</span>
      <p className="annotation-card-content">{annotation.content}</p>
    </div>
  );
}

function DeleteAnnotationBody({ annotation }: { annotation: Extract<Annotation, { type: 'delete' }> }) {
  return (
    <div className="annotation-card-body">
      <span className="annotation-card-label">Delete</span>
      <p className="annotation-card-content annotation-card-strikethrough">
        {annotation.selected_text}
      </p>
    </div>
  );
}

function ReplaceAnnotationBody({ annotation }: { annotation: Extract<Annotation, { type: 'replace' }> }) {
  return (
    <div className="annotation-card-body">
      <span className="annotation-card-label">Replace</span>
      <div className="annotation-card-replace-comparison">
        <span className="annotation-card-old">{annotation.selected_text}</span>
        <span className="annotation-card-arrow">&rarr;</span>
        <span className="annotation-card-new">{annotation.replacement}</span>
      </div>
    </div>
  );
}

function CommentAnnotationBody({ annotation }: { annotation: Extract<Annotation, { type: 'comment' }> }) {
  return (
    <div className="annotation-card-body">
      <span className="annotation-card-label">Comment</span>
      <blockquote className="annotation-card-quote">
        {annotation.selected_text}
      </blockquote>
      <p className="annotation-card-content">{annotation.comment}</p>
    </div>
  );
}

export function AnnotationCard({ annotation, onRemove }: AnnotationCardProps) {
  return (
    <div className={`annotation-card annotation-card-${annotation.type}`}>
      <div className="annotation-card-header">
        <span className="annotation-card-timestamp">
          {formatTimestamp(annotation.timestamp)}
        </span>
        <span className="annotation-card-author">{annotation.author}</span>
        <button
          className="annotation-card-remove"
          onClick={() => onRemove(annotation.id)}
          title="Remove annotation"
        >
          &times;
        </button>
      </div>

      {annotation.type === 'insert' && <InsertAnnotationBody annotation={annotation} />}
      {annotation.type === 'delete' && <DeleteAnnotationBody annotation={annotation} />}
      {annotation.type === 'replace' && <ReplaceAnnotationBody annotation={annotation} />}
      {annotation.type === 'comment' && <CommentAnnotationBody annotation={annotation} />}
    </div>
  );
}
