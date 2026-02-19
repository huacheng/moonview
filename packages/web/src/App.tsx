import { useEffect, useRef } from 'react';
import { Toolbar } from './components/Toolbar';
import { Notebook } from './components/Notebook';
import { Sidebar } from './components/Sidebar';
import { FilesPanel } from './components/FilesPanel';
import { WelcomeScreen } from './components/WelcomeScreen';
import { NotebookCreationPanel } from './components/NotebookCreationPanel';
import { LoginPage } from './components/LoginPage';
import { useWebSocket } from './hooks/useWebSocket';
import { useStore } from './store';
import './styles.css';

// ── Scroll position persistence ─────────────────────────────────────────────

/**
 * Saves and restores the scroll position of a container element,
 * keyed by notebookId in localStorage.
 * Also re-applies the saved position when the browser tab becomes visible again.
 */
function useScrollRestoration(
  notebookId: string | null,
  containerRef: React.RefObject<HTMLElement | null>,
) {
  // Restore saved position when notebook changes (switch between notebooks).
  useEffect(() => {
    if (!notebookId || !containerRef.current) return;
    // Slight delay to let React finish rendering cells before scrolling.
    const id = requestAnimationFrame(() => {
      const saved = localStorage.getItem(`nb-scroll-${notebookId}`);
      if (saved && containerRef.current) {
        containerRef.current.scrollTop = parseInt(saved, 10);
      }
    });
    return () => cancelAnimationFrame(id);
  }, [notebookId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist scroll position on user scroll (debounced at 200 ms).
  useEffect(() => {
    if (!notebookId || !containerRef.current) return;
    const el = containerRef.current;
    let timer = 0;

    function onScroll() {
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        localStorage.setItem(`nb-scroll-${notebookId}`, String(el.scrollTop));
      }, 200);
    }

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      clearTimeout(timer);
    };
  }, [notebookId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-apply saved position when the user switches back to this browser tab.
  useEffect(() => {
    if (!notebookId) return;

    function onVisibilityChange() {
      if (document.visibilityState === 'visible' && containerRef.current) {
        const saved = localStorage.getItem(`nb-scroll-${notebookId}`);
        if (saved) {
          containerRef.current.scrollTop = parseInt(saved, 10);
        }
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [notebookId]); // eslint-disable-line react-hooks/exhaustive-deps
}

function NotebookLoadingScreen() {
  return (
    <div className="notebook-loading-screen">
      <div className="notebook-loading-bar" />
      <div className="notebook-loading-body">
        <div className="notebook-loading-spinner" />
        <p className="notebook-loading-text">Loading notebook…</p>
      </div>
    </div>
  );
}

function AuthenticatedApp() {
  const sessionId = useStore((s) => s.sessionId);
  const notebook = useStore((s) => s.notebook);
  const notebookLoading = useStore((s) => s.notebookLoading);
  const activeNotebookId = useStore((s) => s.activeNotebookId);
  const creatingNotebook = useStore((s) => s.creatingNotebook);
  const restoreNotebook = useStore((s) => s.restoreNotebook);

  const contentRef = useRef<HTMLElement | null>(null);

  // Initiate WebSocket connection only when we have a sessionId.
  useWebSocket(sessionId);

  // Persist and restore scroll position across notebook switches and browser tab switches.
  useScrollRestoration(activeNotebookId, contentRef);

  // Save last opened notebook ID to localStorage.
  useEffect(() => {
    if (activeNotebookId) {
      localStorage.setItem('nb-last-notebook', activeNotebookId);
    }
  }, [activeNotebookId]);

  // On mount: reopen the last notebook if none is currently active.
  useEffect(() => {
    const lastId = localStorage.getItem('nb-last-notebook');
    if (lastId) {
      restoreNotebook(lastId).catch(() => {
        localStorage.removeItem('nb-last-notebook');
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Show the notebook view as soon as notebook data exists (optimistic create/restore).
  // sessionId may still be null while the backend session initializes — that's fine.
  const hasNotebook = notebook !== null;

  return (
    <div className="app">
      <Toolbar />
      <div className="app-body app-body--files-open">
        <Sidebar />
        <main ref={contentRef} className="app-content">
          {notebookLoading ? (
            <NotebookLoadingScreen />
          ) : hasNotebook ? (
            <Notebook />
          ) : creatingNotebook ? (
            <NotebookCreationPanel />
          ) : (
            <WelcomeScreen />
          )}
        </main>
        <FilesPanel />
      </div>
    </div>
  );
}

export default function App() {
  const authRequired = useStore((s) => s.authRequired);
  const authToken = useStore((s) => s.authToken);
  const authError = useStore((s) => s.authError);
  const authLoading = useStore((s) => s.authLoading);
  const checkAuthStatus = useStore((s) => s.checkAuthStatus);
  const login = useStore((s) => s.login);

  // Check if auth is required on mount
  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  // Still checking auth status
  if (authRequired === null) {
    return (
      <div className="app-loading">
        <div className="login-logo">NB</div>
        <p>Loading...</p>
      </div>
    );
  }

  // Auth required but no token
  if (authRequired && !authToken) {
    return (
      <LoginPage
        onLogin={login}
        error={authError}
        loading={authLoading}
      />
    );
  }

  return <AuthenticatedApp />;
}
