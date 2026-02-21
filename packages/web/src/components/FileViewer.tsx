import { useState, useRef } from 'react';
import { useStore } from '../store';
import { useFileStream } from '../hooks/useFileStream';
import { useAnnotationPersistence } from '../hooks/useAnnotationPersistence';
import type { FileAnnotations } from '../types/fileAnnotations';
import { EMPTY_FILE_ANNOTATIONS } from '../types/fileAnnotations';
import { FileViewerStatusBar } from './FileViewerStatusBar';
import { FileViewerRender } from './FileViewerRender';
import { FileViewerEditor } from './FileViewerEditor';

export function FileViewer() {
  const openFile = useStore((s) => s.openFile);
  const fileViewerMaximized = useStore((s) => s.fileViewerMaximized);
  const setOpenFile = useStore((s) => s.setOpenFile);
  const toggleFileViewerMaximized = useStore((s) => s.toggleFileViewerMaximized);
  const activeNotebookId = useStore((s) => s.activeNotebookId);
  const submitPrompt = useStore((s) => s.submitPrompt);

  const [mode, setMode] = useState<'render' | 'edit'>('render');
  const [annotations, setAnnotations] = useState<FileAnnotations>(EMPTY_FILE_ANNOTATIONS);
  const annLoadedRef = useRef(false);

  const fileState = useFileStream(
    openFile?.sessionId ?? null,
    activeNotebookId,
    openFile?.path ?? null,
    openFile?.source ?? 'workspace',
  );

  useAnnotationPersistence({
    sessionId: openFile?.sessionId ?? '',
    notebookId: activeNotebookId ?? '',
    filePath: openFile?.path ?? '',
    annotations,
    annLoadedRef,
    setAnnotations,
  });

  if (!openFile) return null;

  const filename = openFile.path.split('/').pop() ?? openFile.path;
  const canEdit = fileState.format !== null && fileState.format !== 'pdf-binary' && fileState.format !== 'unsupported';

  return (
    <div className={`file-viewer${fileViewerMaximized ? ' file-viewer--maximized' : ''}`}>
      <FileViewerStatusBar
        filename={filename}
        format={fileState.format}
        mode={mode}
        maximized={fileViewerMaximized}
        onToggleMode={() => { if (canEdit) setMode((m) => m === 'render' ? 'edit' : 'render'); }}
        onToggleMaximize={toggleFileViewerMaximized}
        onClose={() => setOpenFile(null)}
      />
      {fileState.status === 'loading' && <div className="fv-loading">Loading…</div>}
      {fileState.status === 'error' && <div className="fv-error">Error: {fileState.error}</div>}
      {fileState.status === 'complete' && mode === 'render' && (
        <FileViewerRender
          format={fileState.format!}
          content={fileState.content}
          pdfBuffer={fileState.pdfBuffer}
          filename={filename}
          annotations={annotations}
          filePath={openFile.path}
          onAnnotationsChange={setAnnotations}
          onSendToPrompt={submitPrompt}
        />
      )}
      {fileState.status === 'complete' && mode === 'edit' && canEdit && (
        <FileViewerEditor
          content={fileState.content}
          format={fileState.format === 'html' ? 'html' : 'text'}
          sessionId={openFile.sessionId}
          filePath={openFile.path}
          source={openFile.source}
        />
      )}
    </div>
  );
}
