import { useEffect } from 'react';
import { Toolbar } from './components/Toolbar';
import { Notebook } from './components/Notebook';
import { SliceView } from './components/SliceView';
import { Sidebar } from './components/Sidebar';
import { WelcomeScreen } from './components/WelcomeScreen';
import { LoginPage } from './components/LoginPage';
import { useWebSocket } from './hooks/useWebSocket';
import { useStore } from './store';
import './styles.css';

function AuthenticatedApp() {
  const activeTab = useStore((s) => s.activeTab);
  const sessionId = useStore((s) => s.sessionId);
  const notebook = useStore((s) => s.notebook);

  // Initiate WebSocket connection only when we have a sessionId.
  useWebSocket(sessionId);

  const hasNotebook = notebook !== null && sessionId !== null;

  return (
    <div className="app">
      <Toolbar />
      <div className="app-body">
        <Sidebar />
        <main className="app-content">
          {hasNotebook ? (
            activeTab === 'notebook' ? <Notebook /> : <SliceView />
          ) : (
            <WelcomeScreen />
          )}
        </main>
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
