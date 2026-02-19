import { useEffect, useState, useRef } from 'react';
import { useStore } from '../store';

function formatAge(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function SidebarItem({
  title,
  updatedAt,
  isActive,
  onActivate,
  onDelete,
  onRename,
}: {
  title: string;
  updatedAt: string;
  isActive: boolean;
  onActivate: () => void;
  onDelete: () => void;
  onRename: (newTitle: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.select();
    }
  }, [editing]);

  useEffect(() => {
    if (!editing) setDraft(title);
  }, [title, editing]);

  function commit() {
    const trimmed = draft.trim() || 'Untitled Notebook';
    onRename(trimmed);
    setDraft(trimmed);
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') {
      setDraft(title);
      setEditing(false);
    }
  }

  return (
    <div
      className={`sidebar-item${isActive ? ' sidebar-item-active' : ''}`}
      onDoubleClick={() => { if (!editing && !confirmingDelete) onActivate(); }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' && !editing) onActivate(); }}
    >
      {confirmingDelete ? (
        <div className="sidebar-item-confirm" onClick={(e) => e.stopPropagation()}>
          <span className="sidebar-item-confirm-text">Delete?</span>
          <button
            className="sidebar-item-confirm-yes"
            onClick={(e) => { e.stopPropagation(); setConfirmingDelete(false); onDelete(); }}
          >
            Delete
          </button>
          <button
            className="sidebar-item-confirm-no"
            onClick={(e) => { e.stopPropagation(); setConfirmingDelete(false); }}
          >
            Cancel
          </button>
        </div>
      ) : editing ? (
        <div className="sidebar-item-row">
          <input
            ref={inputRef}
            className="sidebar-item-title-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={handleKeyDown}
            onClick={(e) => e.stopPropagation()}
            aria-label="Rename notebook"
          />
        </div>
      ) : (
        <div className="sidebar-item-row">
          <button
            className="sidebar-item-action sidebar-item-action-rename"
            onClick={(e) => { e.stopPropagation(); setDraft(title); setEditing(true); }}
            title="Rename"
            aria-label={`Rename ${title}`}
          >
            ✎
          </button>
          <span className="sidebar-item-title">{title}</span>
          <span className="sidebar-item-age">{formatAge(updatedAt)}</span>
          <div className="sidebar-item-actions">
            <button
              className="sidebar-item-action sidebar-item-action-delete"
              onClick={(e) => { e.stopPropagation(); setConfirmingDelete(true); }}
              title="Delete"
              aria-label={`Delete ${title}`}
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const notebookList = useStore((s) => s.notebookList);
  const notebookListLoading = useStore((s) => s.notebookListLoading);
  const activeNotebookId = useStore((s) => s.activeNotebookId);
  const fetchNotebookList = useStore((s) => s.fetchNotebookList);
  const setCreatingNotebook = useStore((s) => s.setCreatingNotebook);
  const restoreNotebook = useStore((s) => s.restoreNotebook);
  const deleteNotebook = useStore((s) => s.deleteNotebook);
  const renameNotebook = useStore((s) => s.renameNotebook);

  useEffect(() => {
    fetchNotebookList();
  }, [fetchNotebookList]);

  if (!sidebarOpen) return null;

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-header-title">Notebooks</span>
      </div>

      <button
        className="sidebar-new-btn"
        onClick={() => setCreatingNotebook(true)}
      >
        + New NoteBook
      </button>

      <div className="sidebar-list">
        {notebookListLoading && notebookList.length === 0 && (
          <div className="sidebar-loading">Loading...</div>
        )}

        {!notebookListLoading && notebookList.length === 0 && (
          <div className="sidebar-empty">No notebooks yet</div>
        )}

        {notebookList.map((item) => (
          <SidebarItem
            key={item.id}
            title={item.title}
            updatedAt={item.updatedAt}
            isActive={activeNotebookId === item.id}
            onActivate={() => restoreNotebook(item.id)}
            onDelete={() => deleteNotebook(item.id)}
            onRename={(newTitle) => renameNotebook(item.id, newTitle)}
          />
        ))}
      </div>
    </aside>
  );
}
