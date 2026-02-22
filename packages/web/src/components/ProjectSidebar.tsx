import { useEffect, useState } from 'react';
import { useStore } from '../store';

interface FileEntry {
  name: string;
  type: 'file' | 'directory';
  size: number;
  modifiedAt: string;
}

function ProjectList() {
  const { projects, projectsLoading, createProject, setActiveProject } = useStore();
  const [newTitle, setNewTitle] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    await createProject(newTitle.trim());
    setNewTitle('');
    setShowCreate(false);
  };

  return (
    <div className="project-list">
      <div className="project-list-header">
        <span>Projects</span>
      </div>
      {projectsLoading && <div className="project-list-loading">Loading...</div>}
      <div className="project-list-items">
        {projects.map(p => (
          <div
            key={p.id}
            className="project-list-item"
            onClick={() => setActiveProject(p.id, p.path)}
          >
            <span className="project-list-item-title">{p.title}</span>
            <span className="project-list-item-meta">
              {p.notebook_count} notebooks
            </span>
          </div>
        ))}
      </div>
      {showCreate ? (
        <div className="project-create-form">
          <input
            autoFocus
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setShowCreate(false); }}
            placeholder="Project name..."
          />
          <button onClick={handleCreate}>Create</button>
        </div>
      ) : (
        <button className="project-create-btn" onClick={() => setShowCreate(true)}>
          + New Project
        </button>
      )}
    </div>
  );
}

function FileBrowser() {
  const {
    activeProjectId, activeProjectPath, fileBrowserPath,
    goBackToProjectList, navigateFileBrowser, authToken,
    openNotebookTab, subscribeToSession, openFileInDeliverables,
  } = useStore();
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const projectTitle = useStore(s => s.projects.find(p => p.id === s.activeProjectId)?.title ?? 'Project');

  useEffect(() => {
    if (!activeProjectId) return;
    setLoading(true);
    const subPath = fileBrowserPath ? `.working/${fileBrowserPath}` : '.working';
    fetch(`/api/projects/${activeProjectId}/files?path=${encodeURIComponent(subPath)}`, {
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    })
      .then(r => r.json())
      .then((data: { files: FileEntry[] }) => {
        setFiles(data.files ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [activeProjectId, fileBrowserPath, authToken]);

  const handleFileClick = async (entry: FileEntry) => {
    if (entry.type === 'directory') {
      const newPath = fileBrowserPath ? `${fileBrowserPath}/${entry.name}` : entry.name;
      navigateFileBrowser(newPath);
      return;
    }
    if (entry.name.endsWith('.notebook.json')) {
      // Load notebook and open as tab
      const notebookPath = `${activeProjectPath}/.working/${fileBrowserPath ? fileBrowserPath + '/' : ''}${entry.name}`;
      try {
        const res = await fetch(`/api/notebooks/open-by-path`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          },
          body: JSON.stringify({ path: notebookPath }),
        });
        if (res.ok) {
          const data = await res.json();
          openNotebookTab(data.notebookId, data.notebook, data.sessionId);
          subscribeToSession(data.sessionId);
        }
      } catch (err) {
        console.error('Failed to open notebook:', err);
      }
    } else {
      // Open in right panel FileViewer
      const filePath = `${activeProjectPath}/.working/${fileBrowserPath ? fileBrowserPath + '/' : ''}${entry.name}`;
      openFileInDeliverables(filePath);
    }
  };

  const [showNbCreate, setShowNbCreate] = useState(false);
  const [nbTitle, setNbTitle] = useState('');
  const [nbCreating, setNbCreating] = useState(false);

  const handleCreateNotebook = async () => {
    if (!nbTitle.trim() || !activeProjectId || nbCreating) return;
    setNbCreating(true);
    try {
      const store = useStore.getState();
      await store.createNotebook(activeProjectId, nbTitle.trim());
      setNbTitle('');
      setShowNbCreate(false);
      navigateFileBrowser(fileBrowserPath);
    } catch (err) {
      console.error('Failed to create notebook:', err);
    } finally {
      setNbCreating(false);
    }
  };

  const handleBack = () => {
    if (fileBrowserPath) {
      const parts = fileBrowserPath.split('/');
      parts.pop();
      navigateFileBrowser(parts.join('/'));
    } else {
      goBackToProjectList();
    }
  };

  return (
    <div className="file-browser">
      <div className="file-browser-header" onClick={handleBack}>
        <span className="file-browser-back">&larr;</span>
        <span className="file-browser-title">{fileBrowserPath || projectTitle}</span>
      </div>
      {loading && <div className="file-browser-loading">Loading...</div>}
      <div className="file-browser-items">
        {files.map(f => (
          <div
            key={f.name}
            className={`file-browser-item file-browser-item--${f.type}`}
            onClick={() => handleFileClick(f)}
          >
            <span className="file-browser-item-icon">{f.type === 'directory' ? '\u{1F4C1}' : '\u{1F4C4}'}</span>
            <span className="file-browser-item-name">{f.name}</span>
          </div>
        ))}
      </div>
      {showNbCreate ? (
        <div className="project-create-form">
          <input
            autoFocus
            value={nbTitle}
            onChange={e => setNbTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreateNotebook(); if (e.key === 'Escape') setShowNbCreate(false); }}
            placeholder="Notebook name..."
            disabled={nbCreating}
          />
          <button onClick={handleCreateNotebook} disabled={nbCreating || !nbTitle.trim()}>
            {nbCreating ? '...' : 'Create'}
          </button>
        </div>
      ) : (
        <button className="file-browser-create-btn" onClick={() => setShowNbCreate(true)}>
          + New Notebook
        </button>
      )}
    </div>
  );
}

export function ProjectSidebar() {
  const sidebarLevel = useStore(s => s.sidebarLevel);
  return (
    <aside className="sidebar">
      {sidebarLevel === 'L1' ? <ProjectList /> : <FileBrowser />}
    </aside>
  );
}
