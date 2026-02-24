import { useState, useRef, useEffect } from 'react';
import { useStore } from '../store';
import { useFileStream } from '../hooks/useFileStream';
import { useAnnotationPersistence } from '../hooks/useAnnotationPersistence';
import type { FileAnnotations } from '../types/fileAnnotations';
import { EMPTY_FILE_ANNOTATIONS } from '../types/fileAnnotations';
import { FileViewerStatusBar } from './FileViewerStatusBar';
import { FileViewerRender } from './FileViewerRender';
import { FileViewerEditor } from './FileViewerEditor';

export function FileViewer() {
  const openFiles = useStore((s) => s.openFiles);
  const activeFileTabId = useStore((s) => s.activeFileTabId);
  const activeFile = activeFileTabId ? openFiles[activeFileTabId] ?? null : null;
  const fileViewerMaximized = useStore((s) => s.fileViewerMaximized);
  const closeFileTab = useStore((s) => s.closeFileTab);
  const toggleFileViewerMaximized = useStore((s) => s.toggleFileViewerMaximized);
  const setFileTabLoading = useStore((s) => s.setFileTabLoading);
  const activeNotebookId = useStore((s) => s.activeNotebookId);
  const submitPrompt = useStore((s) => s.submitPrompt);

  const [mode, setMode] = useState<'render' | 'edit'>('render');
  const [annotations, setAnnotations] = useState<FileAnnotations>(EMPTY_FILE_ANNOTATIONS);
  const annLoadedRef = useRef(false);

  const fileState = useFileStream(
    activeFile?.sessionId ?? null,
    activeNotebookId,
    activeFile?.path ?? null,
    activeFile?.source ?? 'workspace',
  );

  useAnnotationPersistence({
    sessionId: activeFile?.sessionId ?? '',
    notebookId: activeNotebookId ?? '',
    filePath: activeFile?.path ?? '',
    annotations,
    annLoadedRef,
    setAnnotations,
  });

  // Sync loading state to store so tabs can show spinner
  useEffect(() => {
    if (!activeFileTabId) return;
    const isLoading = fileState.status === 'loading' || fileState.status === 'converting';
    setFileTabLoading(activeFileTabId, isLoading);
  }, [activeFileTabId, fileState.status, setFileTabLoading]);

  // Auto-close with alert when file format is unsupported
  useEffect(() => {
    if (fileState.status === 'complete' && fileState.format === 'unsupported' && activeFile && activeFileTabId) {
      const name = activeFile.path.split('/').pop() ?? activeFile.path;
      alert(`不支持预览此文件格式: ${name}`);
      closeFileTab(activeFileTabId);
    }
  }, [fileState.status, fileState.format, activeFile, activeFileTabId, closeFileTab]);

  if (!activeFile) return null;

  const filename = activeFile.path.split('/').pop() ?? activeFile.path;
  const canEdit = fileState.format !== null && !fileState.format.endsWith('-binary') && fileState.format !== 'unsupported';

  return (
    <div className="file-viewer">
      <FileViewerStatusBar
        filename={filename}
        format={fileState.format}
        mode={mode}
        maximized={fileViewerMaximized}
        onToggleMode={() => { if (canEdit) setMode((m) => m === 'render' ? 'edit' : 'render'); }}
        onToggleMaximize={toggleFileViewerMaximized}
        onClose={() => closeFileTab(activeFileTabId!)}
      />
      {fileState.status === 'loading' && <div className="fv-loading">Loading…</div>}
      {fileState.status === 'converting' && <div className="fv-loading">Converting document…</div>}
      {fileState.status === 'error' && <div className="fv-error">Error: {fileState.error}</div>}
      {fileState.status === 'complete' && mode === 'render' && (
        <FileViewerRender
          format={fileState.format!}
          content={fileState.content}
          binaryBuffer={fileState.binaryBuffer}
          filename={filename}
          annotations={annotations}
          filePath={activeFile.path}
          onAnnotationsChange={setAnnotations}
          onSendToPrompt={submitPrompt}
        />
      )}
      {fileState.status === 'complete' && mode === 'edit' && canEdit && (
        <FileViewerEditor
          content={fileState.content}
          format={fileState.format === 'html' ? 'html' : 'text'}
          sessionId={activeFile.sessionId}
          filePath={activeFile.path}
          source={activeFile.source}
        />
      )}
    </div>
  );
}
