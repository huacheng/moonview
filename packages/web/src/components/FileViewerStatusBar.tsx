export type FileFormat = 'text' | 'html' | 'pdf-binary' | 'unsupported';

interface FileViewerStatusBarProps {
  filename: string;
  format: FileFormat | null;
  mode: 'render' | 'edit';
  maximized: boolean;
  onToggleMode: () => void;
  onToggleMaximize: () => void;
  onClose: () => void;
}

const FORMAT_LABEL: Partial<Record<FileFormat, string>> = {
  text: 'Text', html: 'HTML', 'pdf-binary': 'PDF', unsupported: '—',
};

export function FileViewerStatusBar({ filename, format, mode, maximized, onToggleMode, onToggleMaximize, onClose }: FileViewerStatusBarProps) {
  const canEdit = format !== null && format !== 'pdf-binary' && format !== 'unsupported';
  return (
    <div className="fv-statusbar">
      <span className="fv-statusbar__name" title={filename}>{filename}</span>
      {format && <span className="fv-statusbar__format">{FORMAT_LABEL[format] ?? format}</span>}
      <div className="fv-statusbar__actions">
        {canEdit && (
          <button className={`fv-statusbar__btn${mode === 'edit' ? ' active' : ''}`} onClick={onToggleMode}>
            {mode === 'edit' ? 'Preview' : 'Edit'}
          </button>
        )}
        <button className="fv-statusbar__btn" onClick={onToggleMaximize} title={maximized ? 'Restore' : 'Maximize'}>
          {maximized ? '⊡' : '⛶'}
        </button>
        <button className="fv-statusbar__btn fv-statusbar__close" onClick={onClose} title="Close">✕</button>
      </div>
    </div>
  );
}
