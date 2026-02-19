import { useMemo } from 'react';
import { Toolbar } from './components/Toolbar';
import { Notebook } from './components/Notebook';
import { SliceView } from './components/SliceView';
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

export default function App() {
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
