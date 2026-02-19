import { useState } from 'react';

interface GitDiffViewProps {
  diff: string;
}

export function GitDiffView({ diff }: GitDiffViewProps) {
  const [open, setOpen] = useState(false);

  if (!diff) return null;

  // Count added/removed lines for summary
  const lines = diff.split('\n');
  const added = lines.filter((l) => l.startsWith('+')).length;
  const removed = lines.filter((l) => l.startsWith('-')).length;

  return (
    <div className="git-diff-view">
      <button
        className="git-diff-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="git-diff-icon">{open ? '▼' : '▶'}</span>
        <span className="git-diff-label">Git Diff</span>
        <span className="git-diff-stats">
          <span className="git-diff-added">+{added}</span>
          {' '}
          <span className="git-diff-removed">-{removed}</span>
        </span>
      </button>

      {open && (
        <div className="git-diff-content">
          <pre className="git-diff-pre">
            {lines.map((line, i) => {
              let className = 'diff-line';
              if (line.startsWith('+') && !line.startsWith('+++')) className += ' diff-line-added';
              else if (line.startsWith('-') && !line.startsWith('---')) className += ' diff-line-removed';
              else if (line.startsWith('@@')) className += ' diff-line-hunk';
              else if (line.startsWith('diff ') || line.startsWith('index ')) className += ' diff-line-meta';
              return (
                <span key={i} className={className}>
                  {line}
                  {'\n'}
                </span>
              );
            })}
          </pre>
        </div>
      )}
    </div>
  );
}
