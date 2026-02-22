import { useStore } from '../store';

export function NotebookTabs() {
  const openNotebooks = useStore(s => s.openNotebooks);
  const activeNotebookTabId = useStore(s => s.activeNotebookTabId);
  const setActiveNotebookTab = useStore(s => s.setActiveNotebookTab);
  const closeNotebookTab = useStore(s => s.closeNotebookTab);

  const tabs = Object.entries(openNotebooks);
  if (tabs.length === 0) return null;

  return (
    <div className="notebook-tabs">
      {tabs.map(([id, { notebook }]) => (
        <div
          key={id}
          className={`notebook-tab${id === activeNotebookTabId ? ' notebook-tab--active' : ''}`}
          onClick={() => setActiveNotebookTab(id)}
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
    </div>
  );
}
