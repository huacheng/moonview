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

  const tabs = Object.entries(openNotebooks);
  const activeProject = activeProjectId ? projects.find(p => p.id === activeProjectId) : null;

  if (tabs.length === 0 && !activeProject) return null;

  return (
    <div className="notebook-tabs">
      {tabs.map(([id, { notebook }]) => (
        <div
          key={id}
          className={`notebook-tab${id === activeNotebookTabId && !gitTabOpen ? ' notebook-tab--active' : ''}`}
          onClick={() => { closeGitTab(); setActiveNotebookTab(id); }}
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
          className={`notebook-tab notebook-tab--git${gitTabOpen ? ' notebook-tab--active' : ''}`}
          onClick={openGitTab}
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
    </div>
  );
}
