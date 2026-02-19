import { useEffect, useState, useRef } from 'react';
import { useStore } from '../store';

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

function SidebarItem({
  title,
  cellCount,
  hasActiveSession,
  updatedAt,
  isActive,
  onClick,
  onDelete,
  onRename,
}: {
  title: string;
  cellCount: number;
  hasActiveSession: boolean;
  updatedAt: string;
  isActive: boolean;
  onClick: () => void;
  onDelete: () => void;
  onRename: (newTitle: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.select();
    }
  }, [editing]);

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
      className={`sidebar-item ${isActive ? 'sidebar-item-active' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onClick();
      }}
    >
      <div className="sidebar-item-header">
        {editing ? (
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
        ) : (
          <span
            className="sidebar-item-title"
            onDoubleClick={(e) => {
              e.stopPropagation();
              setDraft(title);
              setEditing(true);
            }}
          >
            {title}
          </span>
        )}
        {hasActiveSession && (
          <span className="sidebar-item-live" title="Active session" />
        )}
      </div>
      <div className="sidebar-item-meta">
        <span>{cellCount} cell{cellCount !== 1 ? 's' : ''}</span>
        <span>{formatDate(updatedAt)}</span>
      </div>
      <button
        className="sidebar-item-delete"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        title="Delete notebook"
        aria-label={`Delete ${title}`}
      >
        &times;
      </button>
    </div>
  );
}

export function Sidebar() {
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const notebookList = useStore((s) => s.notebookList);
  const notebookListLoading = useStore((s) => s.notebookListLoading);
  const activeNotebookId = useStore((s) => s.activeNotebookId);
  const fetchNotebookList = useStore((s) => s.fetchNotebookList);
  const createNewNotebook = useStore((s) => s.createNewNotebook);
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
        onClick={() => createNewNotebook('Untitled Notebook')}
      >
        + New Notebook
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
            cellCount={item.cellCount}
            hasActiveSession={item.hasActiveSession}
            updatedAt={item.updatedAt}
            isActive={activeNotebookId === item.id}
            onClick={() => restoreNotebook(item.id)}
            onDelete={() => deleteNotebook(item.id)}
            onRename={(newTitle) => renameNotebook(item.id, newTitle)}
          />
        ))}
      </div>
    </aside>
  );
}
