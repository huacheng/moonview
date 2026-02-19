import { useEffect, useRef } from 'react';
import { useStore } from '../store';

const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_ATTEMPTS = 10;

/**
 * Manages WebSocket lifecycle: connection, auto-reconnect, and teardown.
 *
 * Pass a sessionId to connect, or null to skip.
 */
export function useWebSocket(sessionId: string | null) {
  const connectWebSocket = useStore((s) => s.connectWebSocket);
  const disconnectWebSocket = useStore((s) => s.disconnectWebSocket);

  const reconnectAttempts = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Single effect: connect when sessionId changes, set up reconnect polling.
  useEffect(() => {
    if (!sessionId) return;

    reconnectAttempts.current = 0;
    connectWebSocket(sessionId);

    // Poll-based reconnect: periodically check wsStatus and reconnect if needed.
    const interval = setInterval(() => {
      const status = useStore.getState().wsStatus;
      if (status === 'disconnected' && reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts.current += 1;
        connectWebSocket(sessionId);
      }
      if (status === 'connected') {
        reconnectAttempts.current = 0;
      }
    }, RECONNECT_DELAY_MS);

    return () => {
      clearInterval(interval);
      if (reconnectTimer.current !== null) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      disconnectWebSocket();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);
}
