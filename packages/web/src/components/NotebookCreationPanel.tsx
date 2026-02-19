import { useState, useRef } from 'react';
import { useStore } from '../store';

export function NotebookCreationPanel() {
  const createNewNotebook = useStore((s) => s.createNewNotebook);
  const importNotebookFile = useStore((s) => s.importNotebookFile);
  const setCreatingNotebook = useStore((s) => s.setCreatingNotebook);
  const sessionNotice = useStore((s) => s.sessionNotice);
  const clearSessionNotice = useStore((s) => s.clearSessionNotice);

  const [title, setTitle] = useState('Untitled Notebook');
  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [creating, setCreating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Import ────────────────────────────────────────────────────────────────

  async function handleFile(file: File) {
    if (!file.name.endsWith('.json') && !file.name.endsWith('.zip')) {
      alert('Please select a .notebook.json file or an exported .zip bundle.');
      return;
    }
    setImporting(true);
    await importNotebookFile(file);
    setImporting(false);
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragging(true);
  }

  function onDragLeave() {
    setDragging(false);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }

  // ── Create empty ─────────────────────────────────────────────────────────

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim() || 'Untitled Notebook';
    setCreating(true);
    await createNewNotebook(t);
    setCreating(false);
    setCreatingNotebook(false);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="nb-creation-panel">
      {sessionNotice && (
        <div className="session-notice">
          <span>{sessionNotice}</span>
          <button className="session-notice-close" onClick={clearSessionNotice}>✕</button>
        </div>
      )}

      <div className="nb-creation-header">
        <h2 className="nb-creation-title">New Notebook</h2>
        <button
          className="nb-creation-cancel"
          onClick={() => setCreatingNotebook(false)}
          title="Cancel"
        >
          ✕
        </button>
      </div>

      <div className="nb-creation-dashed-frame">
      <div className="nb-creation-options">
        {/* ── Import option ── */}
        <div
          className={`nb-creation-card${dragging ? ' nb-creation-card-drag' : ''}`}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => !importing && fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
        >
          <span className="nb-creation-card-icon">⬆</span>
          <span className="nb-creation-card-label">
            {importing ? 'Importing…' : 'Import Notebook'}
          </span>
          <span className="nb-creation-card-hint">
            Drop or click to upload<br />.notebook.json or exported .zip
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.notebook.json,.zip"
            onChange={onFileChange}
            style={{ display: 'none' }}
            aria-label="Select notebook file"
          />
        </div>

        <div className="nb-creation-or">or</div>

        {/* ── Create empty option ── */}
        <form className="nb-creation-card nb-creation-card-create" onSubmit={handleCreate}>
          <span className="nb-creation-card-icon">✚</span>
          <span className="nb-creation-card-label">Create Empty</span>
          <input
            className="nb-creation-title-input"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Notebook title"
            onClick={(e) => e.stopPropagation()}
            aria-label="Notebook title"
            autoFocus
          />
          <button
            type="submit"
            className="nb-creation-submit"
            disabled={creating}
          >
            {creating ? 'Creating…' : 'Create'}
          </button>
        </form>
      </div>
      </div>
    </div>
  );
}
