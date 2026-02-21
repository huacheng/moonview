import { useStore } from '../store';

export function WelcomeScreen() {
  const setCreatingNotebook = useStore((s) => s.setCreatingNotebook);
  const sessionNotice = useStore((s) => s.sessionNotice);
  const clearSessionNotice = useStore((s) => s.clearSessionNotice);

  return (
    <div className="welcome-screen">
      {sessionNotice && (
        <div className="session-notice">
          <span>{sessionNotice}</span>
          <button className="session-notice-close" onClick={clearSessionNotice}>✕</button>
        </div>
      )}
      <h1 className="welcome-title">NoteBook AI</h1>
      <p className="welcome-subtitle">
        An interactive notebook for AI-CLI
      </p>
      <button
        className="welcome-create-btn"
        onClick={() => setCreatingNotebook(true)}
      >
        + New NoteBook
      </button>
    </div>
  );
}
