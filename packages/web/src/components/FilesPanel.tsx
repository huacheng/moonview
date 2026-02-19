import { useState, useRef, useEffect, useCallback, Fragment } from 'react';
import { useStore } from '../store';

// ── Types ────────────────────────────────────────────────────────────────────

interface FileEntry {
  name: string;
  type: 'file' | 'directory';
  size: number;
  modifiedAt: string;
}

interface ListResult {
  dirPath: string;
  files: FileEntry[];
  truncated: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileTypeLabel(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    py: 'py', js: 'js', ts: 'ts', tsx: 'tsx', jsx: 'jsx',
    json: 'json', md: 'md', txt: 'txt', sh: 'sh',
    csv: 'csv', html: 'html', css: 'css', yaml: 'yml', yml: 'yml',
    png: 'img', jpg: 'img', jpeg: 'img', gif: 'img', svg: 'img', webp: 'img',
    pdf: 'pdf', zip: 'zip', tar: 'tar', gz: 'tar',
  };
  return map[ext] ?? (ext.slice(0, 4) || 'file');
}

// ── FilesPanel ───────────────────────────────────────────────────────────────

export function FilesPanel() {
  const sessionId = useStore((s) => s.sessionId);
  const filesPanelOpen = useStore((s) => s.filesPanelOpen);
  const toggleFilesPanel = useStore((s) => s.toggleFilesPanel);
  const authToken = useStore((s) => s.authToken);

  const [subPath, setSubPath] = useState('.');
  const [files, setFiles] = useState<FileEntry[]>(() => {
    // Load from cache immediately on mount (will be refreshed async).
    if (!sessionId) return [];
    try {
      const raw = localStorage.getItem(`nb-files-${sessionId}-.`);
      return raw ? (JSON.parse(raw) as FileEntry[]) : [];
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [creating, setCreating] = useState<'file' | 'folder' | null>(null);
  const [newName, setNewName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const newNameRef = useRef<HTMLInputElement>(null);
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Focus name input when creation mode starts
  useEffect(() => {
    if (creating) {
      setNewName('');
      setTimeout(() => newNameRef.current?.focus(), 0);
    }
  }, [creating]);

  // ── Fetch file list ───────────────────────────────────────────────────────

  const fetchFiles = useCallback(
    async (path: string, silent = false) => {
      if (!sessionId) return;
      if (!silent) setLoading(true);
      setError(null);

      // Show cached version immediately while fetching.
      if (!silent) {
        try {
          const cached = localStorage.getItem(`nb-files-${sessionId}-${path}`);
          if (cached) setFiles(JSON.parse(cached) as FileEntry[]);
        } catch {}
      }

      try {
        const headers: Record<string, string> = {};
        if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
        const res = await fetch(
          `/api/notebooks/${encodeURIComponent(sessionId)}/files?path=${encodeURIComponent(path)}`,
          { headers },
        );
        if (!res.ok) {
          const data = (await res.json()) as { error: string };
          if (!silent) setError(data.error);
          return;
        }
        const data = (await res.json()) as ListResult;
        setFiles(data.files);
        // Persist to cache.
        try {
          localStorage.setItem(`nb-files-${sessionId}-${path}`, JSON.stringify(data.files));
        } catch {}
      } catch (err) {
        if (!silent) setError(String(err));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [sessionId, authToken],
  );

  // Reset to root when panel opens or session changes.
  useEffect(() => {
    if (filesPanelOpen && sessionId) {
      setSubPath('.');
      fetchFiles('.');
    }
  }, [filesPanelOpen, sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refetch when subPath changes.
  const prevPathRef = useRef<string | null>(null);
  useEffect(() => {
    if (!filesPanelOpen || !sessionId) return;
    if (prevPathRef.current === null) {
      prevPathRef.current = subPath;
      return;
    }
    if (prevPathRef.current !== subPath) {
      prevPathRef.current = subPath;
      fetchFiles(subPath);
    }
  }, [subPath, filesPanelOpen, sessionId, fetchFiles]);

  // Auto-refresh every 3 seconds when panel is open (skips when tab is hidden).
  useEffect(() => {
    if (!filesPanelOpen || !sessionId) {
      if (autoRefreshRef.current) {
        clearInterval(autoRefreshRef.current);
        autoRefreshRef.current = null;
      }
      return;
    }
    autoRefreshRef.current = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      fetchFiles(subPath, true /* silent */);
    }, 3000);
    return () => {
      if (autoRefreshRef.current) {
        clearInterval(autoRefreshRef.current);
        autoRefreshRef.current = null;
      }
    };
  }, [filesPanelOpen, sessionId, subPath, fetchFiles]);

  // ── Navigation ────────────────────────────────────────────────────────────

  function navigateInto(dirName: string) {
    setSubPath((p) => (p === '.' ? dirName : `${p}/${dirName}`));
  }

  function navigateUp() {
    if (subPath === '.') return;
    const parts = subPath.split('/');
    parts.pop();
    setSubPath(parts.length === 0 ? '.' : parts.join('/'));
  }

  function navigateToCrumb(index: number) {
    const parts = subPath.split('/');
    setSubPath(parts.slice(0, index + 1).join('/'));
  }

  // ── Download ──────────────────────────────────────────────────────────────

  function downloadFile(fileName: string) {
    if (!sessionId) return;
    const filePath = subPath === '.' ? fileName : `${subPath}/${fileName}`;
    const url = `/api/notebooks/${encodeURIComponent(sessionId)}/files/download?path=${encodeURIComponent(filePath)}`;
    triggerDownload(url);
  }

  function downloadAll() {
    if (!sessionId) return;
    triggerDownload(`/api/notebooks/${encodeURIComponent(sessionId)}/files/zip`);
  }

  function triggerDownload(url: string) {
    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // ── Upload ────────────────────────────────────────────────────────────────

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0 || !sessionId) return;

    const formData = new FormData();
    for (const file of fileList) {
      formData.append('files', file);
    }

    setUploading(true);
    setUploadProgress(0);
    setError(null);

    const xhr = new XMLHttpRequest();

    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable) {
        setUploadProgress(Math.round((evt.loaded / evt.total) * 100));
      }
    };

    xhr.onload = () => {
      setUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (xhr.status >= 200 && xhr.status < 300) {
        fetchFiles(subPath);
      } else {
        try {
          const body = JSON.parse(xhr.responseText) as { error: string };
          setError(body.error);
        } catch {
          setError(`Upload failed (${xhr.status})`);
        }
      }
    };

    xhr.onerror = () => {
      setUploading(false);
      setError('Upload failed — network error');
    };

    xhr.open(
      'POST',
      `/api/notebooks/${encodeURIComponent(sessionId)}/files?path=${encodeURIComponent(subPath)}`,
    );
    if (authToken) xhr.setRequestHeader('Authorization', `Bearer ${authToken}`);
    xhr.send(formData);
  }

  // ── Create file / folder ──────────────────────────────────────────────────

  async function submitCreate() {
    const name = newName.trim();
    if (!name || !sessionId) { setCreating(null); return; }

    const endpoint = creating === 'file' ? 'new-file' : 'mkdir';
    const headers: Record<string, string> = {};
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

    try {
      const res = await fetch(
        `/api/notebooks/${encodeURIComponent(sessionId)}/files/${endpoint}?path=${encodeURIComponent(subPath)}&name=${encodeURIComponent(name)}`,
        { method: 'POST', headers },
      );
      if (!res.ok) {
        const data = (await res.json()) as { error: string };
        setError(data.error);
      } else {
        fetchFiles(subPath);
      }
    } catch (err) {
      setError(String(err));
    }
    setCreating(null);
  }

  // ── Delete entry ─────────────────────────────────────────────────────────

  async function deleteEntry(name: string) {
    if (!sessionId) return;
    // First click — show inline confirm; second click (or explicit confirm) — execute.
    if (confirmDelete !== name) {
      setConfirmDelete(name);
      return;
    }
    setConfirmDelete(null);

    const filePath = subPath === '.' ? name : `${subPath}/${name}`;
    const headers: Record<string, string> = {};
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

    try {
      const res = await fetch(
        `/api/notebooks/${encodeURIComponent(sessionId)}/files?path=${encodeURIComponent(filePath)}`,
        { method: 'DELETE', headers },
      );
      if (!res.ok) {
        const data = (await res.json()) as { error: string };
        setError(data.error);
      } else {
        setFiles((prev) => prev.filter((f) => f.name !== name));
      }
    } catch (err) {
      setError(String(err));
    }
  }

  // ── Render: Collapsed strip ───────────────────────────────────────────────

  if (!filesPanelOpen) {
    return (
      <aside className="files-panel files-panel-collapsed">
        <button
          className="files-panel-expand-btn"
          onClick={toggleFilesPanel}
          title="Show workspace files"
          aria-label="Show workspace files"
        >
          ☰
        </button>
      </aside>
    );
  }

  // ── Render: Full panel ────────────────────────────────────────────────────

  const pathParts = subPath === '.' ? [] : subPath.split('/');

  return (
    <aside className="files-panel">
      {/* Header */}
      <div className="files-panel-header">
        <span className="files-panel-title">Workspace Files</span>
        <button
          className="files-panel-close"
          onClick={toggleFilesPanel}
          title="Collapse"
          aria-label="Collapse"
        >
          ☰
        </button>
      </div>

      {/* Breadcrumbs */}
      <div className="files-panel-breadcrumbs">
        <button
          className={`files-crumb ${subPath === '.' ? 'files-crumb-active' : ''}`}
          onClick={() => setSubPath('.')}
        >
          workspace
        </button>
        {pathParts.map((part, i) => (
          <Fragment key={i}>
            <span className="files-crumb-sep">›</span>
            <button
              className={`files-crumb ${i === pathParts.length - 1 ? 'files-crumb-active' : ''}`}
              onClick={() => navigateToCrumb(i)}
            >
              {part}
            </button>
          </Fragment>
        ))}
        <button
          className="files-crumb-refresh"
          onClick={() => fetchFiles(subPath)}
          disabled={loading}
          title="Refresh"
        >
          ↻
        </button>
      </div>

      {/* Action buttons */}
      <div className="files-panel-actions">
        <button
          className="files-action-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || !sessionId}
          title="Upload files to current directory"
        >
          ↑ Upload
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileChange}
          style={{ display: 'none' }}
          aria-label="Select files to upload"
        />
        <button
          className="files-action-btn files-action-btn-sm"
          onClick={() => setCreating('file')}
          disabled={!sessionId}
          title="New file"
        >
          + File
        </button>
        <button
          className="files-action-btn files-action-btn-sm"
          onClick={() => setCreating('folder')}
          disabled={!sessionId}
          title="New folder"
        >
          + Dir
        </button>
        <button
          className="files-action-btn files-action-btn-download"
          onClick={downloadAll}
          disabled={!sessionId}
          title="Download workspace archive (.tar.gz)"
        >
          ↓ All
        </button>
      </div>

      {/* New file/folder inline input */}
      {creating && (
        <div className="files-new-row">
          <span className="files-new-icon">{creating === 'file' ? '📄' : '📁'}</span>
          <input
            ref={newNameRef}
            className="files-new-input"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitCreate();
              if (e.key === 'Escape') setCreating(null);
            }}
            placeholder={creating === 'file' ? 'filename.txt' : 'folder-name'}
            aria-label={creating === 'file' ? 'New file name' : 'New folder name'}
          />
          <button className="files-new-ok" onClick={submitCreate} title="Create">✓</button>
          <button className="files-new-cancel" onClick={() => setCreating(null)} title="Cancel">✗</button>
        </div>
      )}

      {/* Upload progress */}
      {uploading && (
        <div className="files-upload-progress">
          <div className="files-upload-bar" style={{ width: `${uploadProgress}%` }} />
          <span className="files-upload-pct">{uploadProgress}%</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="files-error">
          {error}
          <button className="files-error-close" onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* File list */}
      <div className="files-list">
        {loading && <div className="files-loading">Loading…</div>}

        {/* Up directory */}
        {!loading && subPath !== '.' && (
          <button className="files-entry-row files-entry-dir" onClick={navigateUp}>
            <span className="files-icon files-icon-dir">↩</span>
            <span className="files-entry-name">..</span>
          </button>
        )}

        {/* Entries */}
        {!loading &&
          files.map((f) => (
            <div key={f.name} className="files-entry">
              {f.type === 'directory' ? (
                <div className="files-entry-row files-entry-dir">
                  <span className="files-entry-dl-placeholder" />
                  <button className="files-entry-nav" onClick={() => navigateInto(f.name)}>
                    <span className="files-entry-name" title={f.name}>{f.name}</span>
                  </button>
                  <span className="files-entry-meta">dir</span>
                  {confirmDelete === f.name ? (
                    <span className="files-entry-confirm">
                      <button className="files-entry-confirm-ok" onClick={() => deleteEntry(f.name)} title="Confirm delete">✓</button>
                      <button className="files-entry-confirm-cancel" onClick={() => setConfirmDelete(null)} title="Cancel">✗</button>
                    </span>
                  ) : (
                    <button className="files-entry-del" onClick={() => deleteEntry(f.name)} title={`Delete ${f.name}`}>✕</button>
                  )}
                </div>
              ) : (
                <div className="files-entry-row files-entry-file">
                  <button
                    className="files-entry-dl"
                    onClick={() => downloadFile(f.name)}
                    title={`Download ${f.name}`}
                  >
                    ↓
                  </button>
                  <span className="files-entry-name" title={f.name}>{f.name}</span>
                  <span className="files-icon files-icon-file">{fileTypeLabel(f.name)}</span>
                  <span className="files-entry-meta">{formatSize(f.size)}</span>
                  {confirmDelete === f.name ? (
                    <span className="files-entry-confirm">
                      <button className="files-entry-confirm-ok" onClick={() => deleteEntry(f.name)} title="Confirm delete">✓</button>
                      <button className="files-entry-confirm-cancel" onClick={() => setConfirmDelete(null)} title="Cancel">✗</button>
                    </span>
                  ) : (
                    <button className="files-entry-del" onClick={() => deleteEntry(f.name)} title={`Delete ${f.name}`}>✕</button>
                  )}
                </div>
              )}
            </div>
          ))}

        {/* Empty state */}
        {!loading && files.length === 0 && !error && (
          <div className="files-empty">Empty directory</div>
        )}
      </div>
    </aside>
  );
}
