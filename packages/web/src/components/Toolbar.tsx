import { useState, useRef, useEffect } from 'react';
import { useStore } from '../store';

// ── Connection status badge ─────────────────────────────────────────────────

function ConnectionStatus() {
  const wsStatus = useStore((s) => s.wsStatus);

  const label: Record<typeof wsStatus, string> = {
    connected: 'Connected',
    connecting: 'Connecting…',
    disconnected: 'Disconnected',
  };

  return (
    <div className={`connection-status connection-status-${wsStatus}`}>
      <span className="connection-dot" aria-hidden="true" />
      <span className="connection-label">{label[wsStatus]}</span>
    </div>
  );
}

// ── Editable title ──────────────────────────────────────────────────────────

function NotebookTitle() {
  const title = useStore((s) => s.notebook?.metadata.title ?? 'Untitled Notebook');
  const updateTitle = useStore((s) => s.updateTitle);
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
    updateTitle(trimmed);
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

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="toolbar-title-input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        aria-label="Notebook title"
      />
    );
  }

  return (
    <button
      className="toolbar-title"
      onClick={() => {
        setDraft(title);
        setEditing(true);
      }}
      title="Click to rename notebook"
    >
      {title}
    </button>
  );
}

// ── Tab switcher ────────────────────────────────────────────────────────────

function TabSwitcher() {
  const activeTab = useStore((s) => s.activeTab);
  const setActiveTab = useStore((s) => s.setActiveTab);

  return (
    <nav className="tab-switcher" role="tablist" aria-label="Main tabs">
      <button
        className={`tab-btn ${activeTab === 'notebook' ? 'tab-btn-active' : ''}`}
        role="tab"
        aria-selected={activeTab === 'notebook'}
        onClick={() => setActiveTab('notebook')}
      >
        Notebook
      </button>
      <button
        className={`tab-btn ${activeTab === 'slice' ? 'tab-btn-active' : ''}`}
        role="tab"
        aria-selected={activeTab === 'slice'}
        onClick={() => setActiveTab('slice')}
      >
        Slice
      </button>
    </nav>
  );
}

// ── File operations ─────────────────────────────────────────────────────────

function FileOperations() {
  const saveNotebook = useStore((s) => s.saveNotebook);
  const exportHtml = useStore((s) => s.exportHtml);
  const wsStatus = useStore((s) => s.wsStatus);
  const connected = wsStatus === 'connected';

  return (
    <div className="file-ops">
      <button
        className="toolbar-btn"
        onClick={() => saveNotebook()}
        disabled={!connected}
        title={connected ? 'Save notebook' : 'Connect to save'}
      >
        Save
      </button>
      <button
        className="toolbar-btn"
        onClick={() => exportHtml()}
        disabled={!connected}
        title={connected ? 'Export as HTML' : 'Connect to export'}
      >
        Export HTML
      </button>
    </div>
  );
}

// ── Main Toolbar ────────────────────────────────────────────────────────────

export function Toolbar() {
  return (
    <header className="toolbar">
      <div className="toolbar-left">
        <span className="toolbar-logo" aria-label="Notebook AI">
          NB
        </span>
        <NotebookTitle />
      </div>

      <div className="toolbar-center">
        <TabSwitcher />
      </div>

      <div className="toolbar-right">
        <FileOperations />
        <ConnectionStatus />
      </div>
    </header>
  );
}
