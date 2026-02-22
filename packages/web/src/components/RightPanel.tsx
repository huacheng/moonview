import { useState, useEffect, useRef, useCallback } from 'react';
import { useStore } from '../store';

interface FileEntry {
  name: string;
  type: 'file' | 'directory';
  size: number;
  modifiedAt: string;
}

function PanelFileList({
  title,
  fetchUrl,
  viewingFile,
  onFileClick,
  onBack,
}: {
  title: string;
  fetchUrl: string;
  viewingFile: string | null;
  onFileClick: (path: string) => void;
  onBack: () => void;
}) {
  const authToken = useStore(s => s.authToken);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [currentPath, setCurrentPath] = useState('');

  const loadFiles = useCallback((subPath: string) => {
    const url = subPath ? `${fetchUrl}?path=${encodeURIComponent(subPath)}` : fetchUrl;
    fetch(url, {
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    })
      .then(r => r.json())
      .then((data: { files?: FileEntry[] }) => setFiles(data.files ?? []))
      .catch(() => setFiles([]));
  }, [fetchUrl, authToken]);

  useEffect(() => { loadFiles(currentPath); }, [loadFiles, currentPath]);

  if (viewingFile) {
    return (
      <div className="right-panel-viewer">
        <div className="right-panel-viewer-header" onClick={onBack}>
          <span>&larr; Back</span>
        </div>
        <div className="right-panel-viewer-content">
          <pre className="right-panel-file-preview">{viewingFile}</pre>
        </div>
      </div>
    );
  }

  return (
    <div className="right-panel-file-list">
      <div className="right-panel-section-header">
        {currentPath && (
          <span className="right-panel-back" onClick={() => {
            const parts = currentPath.split('/');
            parts.pop();
            setCurrentPath(parts.join('/'));
          }}>&larr; </span>
        )}
        <span>{title}{currentPath ? ` / ${currentPath}` : ''}</span>
      </div>
      <div className="right-panel-items">
        {files.map(f => (
          <div
            key={f.name}
            className={`right-panel-item right-panel-item--${f.type}`}
            onClick={() => {
              if (f.type === 'directory') {
                setCurrentPath(currentPath ? `${currentPath}/${f.name}` : f.name);
              } else {
                onFileClick(`${currentPath ? currentPath + '/' : ''}${f.name}`);
              }
            }}
          >
            <span className="right-panel-item-icon">{f.type === 'directory' ? '\u{1F4C1}' : '\u{1F4C4}'}</span>
            <span className="right-panel-item-name">{f.name}</span>
          </div>
        ))}
        {files.length === 0 && <div className="right-panel-empty">No files</div>}
      </div>
    </div>
  );
}

export function RightPanel() {
  const rightPanelOpen = useStore(s => s.rightPanelOpen);
  const toggleRightPanel = useStore(s => s.toggleRightPanel);
  const rightPanelSplitRatio = useStore(s => s.rightPanelSplitRatio);
  const setRightPanelSplitRatio = useStore(s => s.setRightPanelSplitRatio);
  const activeProjectId = useStore(s => s.activeProjectId);
  const deliverablesViewingFile = useStore(s => s.deliverablesViewingFile);
  const libraryViewingFile = useStore(s => s.libraryViewingFile);
  const openFileInDeliverables = useStore(s => s.openFileInDeliverables);
  const openFileInLibrary = useStore(s => s.openFileInLibrary);
  const closeDeliverablesViewer = useStore(s => s.closeDeliverablesViewer);
  const closeLibraryViewer = useStore(s => s.closeLibraryViewer);

  const panelRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const handleDragStart = useCallback(() => { dragging.current = true; }, []);

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!dragging.current || !panelRef.current) return;
      const rect = panelRef.current.getBoundingClientRect();
      const ratio = (e.clientY - rect.top) / rect.height;
      setRightPanelSplitRatio(Math.max(0.2, Math.min(0.8, ratio)));
    };
    const handleUp = () => { dragging.current = false; };
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
  }, [setRightPanelSplitRatio]);

  if (!rightPanelOpen) {
    return (
      <div className="right-panel right-panel--collapsed">
        <button className="right-panel-expand-btn" onClick={toggleRightPanel}>&lsaquo;</button>
      </div>
    );
  }

  const deliverablesFetchUrl = activeProjectId
    ? `/api/projects/${activeProjectId}/files?path=.deliverables`
    : '';
  const libraryFetchUrl = '/api/library/files';

  return (
    <div className="right-panel" ref={panelRef}>
      <div className="right-panel-toolbar">
        <span className="right-panel-title">Panels</span>
        <button className="right-panel-collapse-btn" onClick={toggleRightPanel}>&rsaquo;</button>
      </div>
      <div className="right-panel-section" style={{ flex: rightPanelSplitRatio }}>
        <PanelFileList
          title="Deliverables"
          fetchUrl={deliverablesFetchUrl}
          viewingFile={deliverablesViewingFile}
          onFileClick={openFileInDeliverables}
          onBack={closeDeliverablesViewer}
        />
      </div>
      <div className="right-panel-divider" onMouseDown={handleDragStart} />
      <div className="right-panel-section" style={{ flex: 1 - rightPanelSplitRatio }}>
        <PanelFileList
          title="Library"
          fetchUrl={libraryFetchUrl}
          viewingFile={libraryViewingFile}
          onFileClick={openFileInLibrary}
          onBack={closeLibraryViewer}
        />
      </div>
    </div>
  );
}
