import { useStore } from '../store';

export function WelcomeScreen() {
  const createNewNotebook = useStore((s) => s.createNewNotebook);

  return (
    <div className="welcome-screen">
      <div className="welcome-logo">NB</div>
      <h1 className="welcome-title">Notebook AI</h1>
      <p className="welcome-subtitle">
        Create a new notebook to start an interactive Claude Code session.
      </p>
      <button
        className="welcome-create-btn"
        onClick={() => createNewNotebook('Untitled Notebook')}
      >
        Create New Notebook
      </button>
    </div>
  );
}
