import { useStore } from '../store';

export function NotebookTabs() {
  const openNotebooks = useStore(s => s.openNotebooks);
  const activeNotebookTabId = useStore(s => s.activeNotebookTabId);
  const setActiveNotebookTab = useStore(s => s.setActiveNotebookTab);
  const closeNotebookTab = useStore(s => s.closeNotebookTab);
  const gitTabOpen = useStore(s => s.gitTabOpen);
  const openGitTab = useStore(s => s.openGitTab);
  const closeGitTab = useStore(s => s.closeGitTab);
  const activeProjectId = useStore(s => s.activeProjectId);
  const projects = useStore(s => s.projects);
  const openFile = useStore(s => s.openFile);
  const setOpenFile = useStore(s => s.setOpenFile);

  const tabs = Object.entries(openNotebooks);
  const activeProject = activeProjectId ? projects.find(p => p.id === activeProjectId) : null;
  const hasFileTab = openFile !== null;

  if (tabs.length === 0 && !activeProject && !hasFileTab) return null;

  return (
    <div className="notebook-tabs">
      {tabs.map(([id, { notebook }]) => (
        <div
          key={id}
          className={`notebook-tab${id === activeNotebookTabId && !gitTabOpen && !hasFileTab ? ' notebook-tab--active' : ''}`}
          onClick={() => { closeGitTab(); setOpenFile(null); setActiveNotebookTab(id); }}
        >
          <span className="notebook-tab-title">{notebook.metadata.title}</span>
          <button
            className="notebook-tab-close"
            onClick={e => { e.stopPropagation(); closeNotebookTab(id); }}
          >
            &times;
          </button>
        </div>
      ))}
      {activeProject && (
        <div
          className={`notebook-tab notebook-tab--git${gitTabOpen && !hasFileTab ? ' notebook-tab--active' : ''}`}
          onClick={() => { setOpenFile(null); openGitTab(); }}
        >
          <span className="notebook-tab-title">Git({activeProject.title})</span>
          <button
            className="notebook-tab-close"
            onClick={e => { e.stopPropagation(); closeGitTab(); }}
          >
            &times;
          </button>
        </div>
      )}
      {hasFileTab && (
        <div className="notebook-tab notebook-tab--file notebook-tab--active">
          <span className="notebook-tab-title">{openFile!.path.split('/').pop()}</span>
          <button
            className="notebook-tab-close"
            onClick={() => setOpenFile(null)}
          >
            &times;
          </button>
        </div>
      )}
    </div>
  );
}
