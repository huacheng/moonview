import { useState, useRef, useEffect, useCallback, Fragment } from 'react';
import { useStore } from '../store';

// Compute a POSIX-style relative path from `fromDir` to `toFile`.
// Both arguments must be absolute Unix paths.
function relativePath(fromDir: string, toFile: string): string {
  const from = fromDir.replace(/\/+$/, '').split('/');
  const to = toFile.replace(/\/+$/, '').split('/');
  let i = 0;
  while (i < from.length && i < to.length && from[i] === to[i]) i++;
  const ups = from.length - i;
  const downs = to.slice(i);
  return [...Array(ups).fill('..'), ...downs].join('/') || '.';
}

// ── Types ──────────────────────────────────────────────────────────────────

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

// ── Helpers ────────────────────────────────────────────────────────────────

const EXT_TYPE: Record<string, string> = {
  py: 'py', js: 'js', jsx: 'js', ts: 'ts', tsx: 'ts',
  json: 'json', md: 'md', txt: 'txt', sh: 'sh',
  csv: 'csv', html: 'html', css: 'css', yaml: 'yml', yml: 'yml',
  png: 'img', jpg: 'img', jpeg: 'img', gif: 'img', svg: 'img', webp: 'img',
  pdf: 'pdf', zip: 'zip', tar: 'zip', gz: 'zip',
};

function fileType(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return EXT_TYPE[ext] ?? (ext.slice(0, 4) || '···');
}

// ── SVG Icons ──────────────────────────────────────────────────────────────

function IconUpload() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="6" y1="8" x2="6" y2="1.5" />
      <polyline points="3.5,4 6,1.5 8.5,4" />
      <line x1="2" y1="10.5" x2="10" y2="10.5" />
    </svg>
  );
}

function IconNewFile() {
  return (
    <svg width="11" height="13" viewBox="0 0 11 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1.5 1h6l3 3v8H1.5V1z" />
      <path d="M7.5 1v3h3" />
      <line x1="5.5" y1="6" x2="5.5" y2="9.5" />
      <line x1="3.8" y1="7.75" x2="7.2" y2="7.75" />
    </svg>
  );
}

function IconNewFolder() {
  return (
    <svg width="13" height="12" viewBox="0 0 13 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 2.5h4.5l1 1.5H12v7H1V2.5z" />
      <line x1="6.5" y1="6" x2="6.5" y2="9" />
      <line x1="5" y1="7.5" x2="8" y2="7.5" />
    </svg>
  );
}

function IconRefresh() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.5 2.5a5 5 0 1 0 .5 4" />
      <polyline points="10.5,2.5 10.5,5.5 7.5,5.5" />
    </svg>
  );
}

function IconDownload() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="6" y1="1.5" x2="6" y2="8" />
      <polyline points="3.5,5.5 6,8 8.5,5.5" />
      <line x1="2" y1="10.5" x2="10" y2="10.5" />
    </svg>
  );
}

function IconFile() {
  return (
    <svg width="11" height="13" viewBox="0 0 11 13" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" className="fp-entry-icon" aria-hidden="true">
      <path d="M1.5 1h6l3 3v8H1.5V1z" />
      <path d="M7.5 1v3h3" />
    </svg>
  );
}

function IconFolder() {
  return (
    <svg width="13" height="12" viewBox="0 0 13 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" className="fp-entry-icon fp-entry-icon-dir" aria-hidden="true">
      <path d="M1 2.5h4.5l1 1.5H12v7H1V2.5z" />
    </svg>
  );
}

// ── Drop zone hook — tracks external OS file drags ─────────────────────────

function useDropZone(onUpload: (files: FileList) => void) {
  const [isDragOver, setIsDragOver] = useState(false);
  const count = useRef(0);

  const isFileDrag = (e: React.DragEvent) =>
    Array.from(e.dataTransfer.types).includes('Files');

  const dropProps = {
    onDragEnter(e: React.DragEvent) {
      if (!isFileDrag(e)) return;
      count.current++;
      setIsDragOver(true);
    },
    onDragLeave(e: React.DragEvent) {
      if (!isFileDrag(e)) return;
      count.current = Math.max(0, count.current - 1);
      if (count.current === 0) setIsDragOver(false);
    },
    onDragOver(e: React.DragEvent) {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    },
    onDrop(e: React.DragEvent) {
      count.current = 0;
      setIsDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        e.preventDefault();
        onUpload(e.dataTransfer.files);
      }
    },
  };

  return { isDragOver, dropProps };
}

// ── Type badge ─────────────────────────────────────────────────────────────

function TypeBadge({ name }: { name: string }) {
  const t = fileType(name);
  return <span className={`fp-badge fp-badge-${t}`}>{t}</span>;
}

// ── Unified FileSection ────────────────────────────────────────────────────

interface FileSectionProps {
  baseUrl: string;
  authToken: string | null;
  showDownloadAll?: boolean;
  dropLabel?: string;
  /** If provided, drag paths are computed relative to this directory (library mode). */
  workspaceDir?: string | null;
}

function FileSection({
  baseUrl,
  authToken,
  showDownloadAll = false,
  dropLabel = 'Drop to upload',
  workspaceDir,
}: FileSectionProps) {
  const [subPath, setSubPath] = useState('.');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [currentDirPath, setCurrentDirPath] = useState<string | null>(null);
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

  useEffect(() => {
    if (creating) { setNewName(''); setTimeout(() => newNameRef.current?.focus(), 0); }
  }, [creating]);

  const fetchFiles = useCallback(async (path: string, silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const h: Record<string, string> = {};
      if (authToken) h['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch(
        `${baseUrl}/files?path=${encodeURIComponent(path)}`,
        { headers: h },
      );
      if (!res.ok) { if (!silent) setError(((await res.json()) as { error: string }).error); return; }
      const result = (await res.json()) as ListResult;
      setFiles(result.files);
      setCurrentDirPath(result.dirPath);
    } catch (err) { if (!silent) setError(String(err)); }
    finally { if (!silent) setLoading(false); }
  }, [baseUrl, authToken]);

  useEffect(() => { setSubPath('.'); fetchFiles('.'); }, [baseUrl]); // eslint-disable-line

  const prevPath = useRef<string | null>(null);
  useEffect(() => {
    if (prevPath.current === null) { prevPath.current = subPath; return; }
    if (prevPath.current !== subPath) { prevPath.current = subPath; fetchFiles(subPath); }
  }, [subPath, fetchFiles]);

  useEffect(() => {
    autoRefreshRef.current = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      fetchFiles(subPath, true);
    }, 3000);
    return () => { if (autoRefreshRef.current) clearInterval(autoRefreshRef.current); };
  }, [subPath, fetchFiles]);

  const uploadFileList = useCallback((fileList: FileList | File[]) => {
    const formData = new FormData();
    for (const f of Array.from(fileList)) formData.append('files', f);
    setUploading(true); setUploadProgress(0); setError(null);
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      setUploading(false); setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (xhr.status >= 200 && xhr.status < 300) fetchFiles(subPath);
      else {
        try { setError((JSON.parse(xhr.responseText) as { error: string }).error); }
        catch { setError(`Upload failed (${xhr.status})`); }
      }
    };
    xhr.onerror = () => { setUploading(false); setError('Upload failed — network error'); };
    xhr.open('POST', `${baseUrl}/files?path=${encodeURIComponent(subPath)}`);
    if (authToken) xhr.setRequestHeader('Authorization', `Bearer ${authToken}`);
    xhr.send(formData);
  }, [baseUrl, authToken, subPath, fetchFiles]);

  const { isDragOver, dropProps } = useDropZone(uploadFileList);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) uploadFileList(e.target.files);
  }

  async function submitCreate() {
    const name = newName.trim(); if (!name) { setCreating(null); return; }
    const endpoint = creating === 'file' ? 'new-file' : 'mkdir';
    const h: Record<string, string> = {}; if (authToken) h['Authorization'] = `Bearer ${authToken}`;
    try {
      const res = await fetch(
        `${baseUrl}/files/${endpoint}?path=${encodeURIComponent(subPath)}&name=${encodeURIComponent(name)}`,
        { method: 'POST', headers: h },
      );
      if (!res.ok) setError(((await res.json()) as { error: string }).error);
      else fetchFiles(subPath);
    } catch (err) { setError(String(err)); }
    setCreating(null);
  }

  async function deleteEntry(name: string) {
    if (confirmDelete !== name) { setConfirmDelete(name); return; }
    setConfirmDelete(null);
    const fp = subPath === '.' ? name : `${subPath}/${name}`;
    const h: Record<string, string> = {}; if (authToken) h['Authorization'] = `Bearer ${authToken}`;
    try {
      const res = await fetch(
        `${baseUrl}/files?path=${encodeURIComponent(fp)}`,
        { method: 'DELETE', headers: h },
      );
      if (!res.ok) setError(((await res.json()) as { error: string }).error);
      else setFiles((prev) => prev.filter((f) => f.name !== name));
    } catch (err) { setError(String(err)); }
  }

  function downloadFile(name: string) {
    const fp = subPath === '.' ? name : `${subPath}/${name}`;
    triggerDl(`${baseUrl}/files/download?path=${encodeURIComponent(fp)}`);
  }

  function triggerDl(url: string) {
    const a = document.createElement('a'); a.href = url; a.download = '';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }

  function startFileDrag(e: React.DragEvent, name: string) {
    let fp: string;
    if (workspaceDir && currentDirPath) {
      // Library mode: compute path relative to the workspace CWD
      const absFile = `${currentDirPath}/${name}`;
      fp = relativePath(workspaceDir, absFile);
    } else {
      // Workspace mode: subPath is already relative to workspace root (= CWD)
      fp = subPath === '.' ? name : `${subPath}/${name}`;
    }
    e.dataTransfer.setData('text/plain', `[file: ${fp}]`);
    e.dataTransfer.effectAllowed = 'copy';
  }

  function navigateInto(dirName: string) {
    setSubPath((p) => (p === '.' ? dirName : `${p}/${dirName}`));
  }

  function navigateUp() {
    if (subPath === '.') return;
    const parts = subPath.split('/'); parts.pop();
    setSubPath(parts.length === 0 ? '.' : parts.join('/'));
  }

  const pathParts = subPath === '.' ? [] : subPath.split('/');

  return (
    <div className="fp-section-body">
      {/* Toolbar: breadcrumbs + action buttons */}
      <div className="fp-toolbar">
        <div className="fp-crumbs">
          <button
            className={`fp-crumb${subPath === '.' ? ' fp-crumb-active' : ''}`}
            onClick={() => setSubPath('.')} title="Root"
          >/</button>
          {pathParts.map((part, i) => (
            <Fragment key={i}>
              <span className="fp-crumb-sep">›</span>
              <button
                className={`fp-crumb${i === pathParts.length - 1 ? ' fp-crumb-active' : ''}`}
                onClick={() => setSubPath(pathParts.slice(0, i + 1).join('/'))}
              >{part}</button>
            </Fragment>
          ))}
        </div>
        <div className="fp-toolbar-btns">
          <button className="fp-btn" onClick={() => fileInputRef.current?.click()} disabled={uploading} title="Upload files">
            <IconUpload />
          </button>
          <input ref={fileInputRef} type="file" multiple onChange={handleFileChange} style={{ display: 'none' }} />
          <button className="fp-btn" onClick={() => setCreating('file')} title="New file">
            <IconNewFile />
          </button>
          <button className="fp-btn" onClick={() => setCreating('folder')} title="New folder">
            <IconNewFolder />
          </button>
          {showDownloadAll && (
            <button className="fp-btn" onClick={() => triggerDl(`${baseUrl}/files/zip`)} title="Download all (.tar.gz)">
              <IconDownload />
            </button>
          )}
          <button className="fp-btn" onClick={() => fetchFiles(subPath)} disabled={loading} title="Refresh">
            <IconRefresh />
          </button>
        </div>
      </div>

      {/* Inline create input */}
      {creating && (
        <div className="fp-new-row">
          <span className="fp-new-icon">
            {creating === 'file' ? <IconFile /> : <IconFolder />}
          </span>
          <input
            ref={newNameRef} className="fp-new-input" value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitCreate(); if (e.key === 'Escape') setCreating(null); }}
            placeholder={creating === 'file' ? 'filename.txt' : 'folder-name'}
          />
          <button className="fp-new-ok" onClick={submitCreate} title="Create">✓</button>
          <button className="fp-new-cancel" onClick={() => setCreating(null)} title="Cancel">✗</button>
        </div>
      )}

      {/* Upload progress */}
      {uploading && (
        <div className="fp-progress">
          <div className="fp-progress-bar" style={{ width: `${uploadProgress}%` }} />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="fp-error">
          <span>{error}</span>
          <button className="fp-error-close" onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* File list — also a drop zone for external files */}
      <div className="fp-list-wrap" {...dropProps}>
        {isDragOver && (
          <div className="fp-drop-overlay">
            <span className="fp-drop-label">{dropLabel}</span>
          </div>
        )}
        <div className="fp-list">
          {loading && <div className="fp-empty">Loading…</div>}

          {/* Up directory */}
          {!loading && subPath !== '.' && (
            <div className="fp-entry fp-entry-dir fp-entry-up" onClick={navigateUp}>
              <span className="fp-dir-up-icon">↩</span>
              <span className="fp-name">..</span>
            </div>
          )}

          {/* Entries */}
          {!loading && files.map((f) => f.type === 'directory' ? (
            <div key={f.name} className="fp-entry fp-entry-dir" onClick={() => navigateInto(f.name)}>
              <IconFolder />
              <span className="fp-name" title={f.name}>{f.name}</span>
              <div className="fp-actions" onClick={(e) => e.stopPropagation()}>
                {confirmDelete === f.name ? (
                  <span className="fp-confirm">
                    <button className="fp-confirm-ok" onClick={() => deleteEntry(f.name)}>del?</button>
                    <button className="fp-confirm-cancel" onClick={() => setConfirmDelete(null)}>✗</button>
                  </span>
                ) : (
                  <button className="fp-action" onClick={() => deleteEntry(f.name)} title="Delete">✕</button>
                )}
              </div>
            </div>
          ) : (
            <div
              key={f.name}
              className="fp-entry fp-entry-draggable"
              draggable
              onDragStart={(e) => startFileDrag(e, f.name)}
            >
              <IconFile />
              <span className="fp-name" title={f.name}>{f.name}</span>
              <TypeBadge name={f.name} />
              <div className="fp-actions">
                {confirmDelete === f.name ? (
                  <span className="fp-confirm">
                    <button className="fp-confirm-ok" onClick={() => deleteEntry(f.name)}>del?</button>
                    <button className="fp-confirm-cancel" onClick={() => setConfirmDelete(null)}>✗</button>
                  </span>
                ) : (
                  <>
                    <button className="fp-action" onClick={() => downloadFile(f.name)} title="Download">↓</button>
                    {f.name !== 'MEMORY.md' && (
                      <button className="fp-action" onClick={() => deleteEntry(f.name)} title="Delete">✕</button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}

          {!loading && files.length === 0 && !error && (
            <div className="fp-empty">Drop files here or click <IconUpload /> upload</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── FilesPanel ─────────────────────────────────────────────────────────────

export function FilesPanel() {
  const sessionId = useStore((s) => s.sessionId);
  const workspaceDir = useStore((s) => s.workspaceDir);
  const filesPanelOpen = useStore((s) => s.filesPanelOpen);
  const toggleFilesPanel = useStore((s) => s.toggleFilesPanel);
  const authToken = useStore((s) => s.authToken);

  if (!filesPanelOpen) {
    return (
      <aside className="files-panel files-panel-collapsed">
        <button className="fp-expand-btn" onClick={toggleFilesPanel} title="Show files" aria-label="Show files">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
            <rect x="1.5" y="1.5" width="11" height="11" rx="1.5" />
            <line x1="5" y1="1.5" x2="5" y2="12.5" />
          </svg>
        </button>
      </aside>
    );
  }

  const wsBase = sessionId ? `/api/notebooks/${encodeURIComponent(sessionId)}` : null;

  return (
    <aside className="files-panel">
      {/* Panel header */}
      <div className="fp-header">
        <span className="fp-title">Files</span>
        <button className="fp-close" onClick={toggleFilesPanel} title="Collapse" aria-label="Collapse">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <line x1="1" y1="1" x2="9" y2="9" />
            <line x1="9" y1="1" x2="1" y2="9" />
          </svg>
        </button>
      </div>

      <div className="fp-sections">
        {/* Workspace */}
        <div className="fp-section fp-section-ws">
          <div className="fp-section-head">
            <span className="fp-section-name">Workspace</span>
          </div>
          {wsBase
            ? <FileSection baseUrl={wsBase} authToken={authToken} showDownloadAll dropLabel="Drop to upload to workspace" />
            : <div className="fp-section-body"><div className="fp-empty">No active session</div></div>
          }
        </div>

        {/* Library */}
        <div className="fp-section fp-section-lib">
          <div className="fp-section-head">
            <span className="fp-section-name">Library</span>
            <span className="fp-section-sub">drag to prompt</span>
          </div>
          <FileSection baseUrl="/api/library" authToken={authToken} showDownloadAll dropLabel="Drop to add to Library" workspaceDir={workspaceDir} />
        </div>
      </div>
    </aside>
  );
}
