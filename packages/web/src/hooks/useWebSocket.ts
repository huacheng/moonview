import { useEffect, useRef, useCallback } from 'react';
import { useStore } from '../store';

const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_ATTEMPTS = 10;

/**
 * Manages WebSocket lifecycle: connection, auto-reconnect, and teardown.
 *
 * Call this once near the top of your component tree. Pass a stable sessionId
 * so the effect only fires when the session actually changes.
 */
export function useWebSocket(sessionId: string) {
  const connectWebSocket = useStore((s) => s.connectWebSocket);
  const disconnectWebSocket = useStore((s) => s.disconnectWebSocket);
  const wsStatus = useStore((s) => s.wsStatus);

  const reconnectAttempts = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmounted = useRef(false);

  const connect = useCallback(() => {
    if (unmounted.current) return;
    connectWebSocket(sessionId);
  }, [connectWebSocket, sessionId]);

  // Auto-reconnect when status drops to disconnected
  useEffect(() => {
    if (wsStatus === 'disconnected' && reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
      reconnectTimer.current = setTimeout(() => {
        if (!unmounted.current) {
          reconnectAttempts.current += 1;
          connect();
        }
      }, RECONNECT_DELAY_MS);
    }

    if (wsStatus === 'connected') {
      reconnectAttempts.current = 0;
    }

    return () => {
      if (reconnectTimer.current !== null) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
    };
  }, [wsStatus, connect]);

  // Initial connect on mount; cleanup on unmount
  useEffect(() => {
    unmounted.current = false;
    connect();
    return () => {
      unmounted.current = true;
      disconnectWebSocket();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);
}
