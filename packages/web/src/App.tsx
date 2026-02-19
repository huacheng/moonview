import { useMemo, useEffect } from 'react';
import { Toolbar } from './components/Toolbar';
import { Notebook } from './components/Notebook';
import { SliceView } from './components/SliceView';
import { LoginPage } from './components/LoginPage';
import { useWebSocket } from './hooks/useWebSocket';
import { useStore } from './store';
import './styles.css';

// Generate a stable session ID per page load
function useSessionId(): string {
  return useMemo(() => {
    const stored = sessionStorage.getItem('nb-session-id');
    if (stored) return stored;
    const id = crypto.randomUUID();
    sessionStorage.setItem('nb-session-id', id);
    return id;
  }, []);
}

function AuthenticatedApp() {
  const sessionId = useSessionId();
  const activeTab = useStore((s) => s.activeTab);

  // Initiate WebSocket connection (with auto-reconnect)
  useWebSocket(sessionId);

  return (
    <div className="app">
      <Toolbar />
      <main className="app-content">
        {activeTab === 'notebook' ? <Notebook /> : <SliceView />}
      </main>
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
