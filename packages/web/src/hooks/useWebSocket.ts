import { useEffect, useRef } from 'react';
import { useStore } from '../store';

const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_ATTEMPTS = 10;

/**
 * Manages WebSocket lifecycle: single persistent connection per tab,
 * with subscribe/unsubscribe when the active sessionId changes.
 */
export function useWebSocket(sessionId: string | null) {
  const connectWebSocket = useStore((s) => s.connectWebSocket);
  const disconnectWebSocket = useStore((s) => s.disconnectWebSocket);
  const subscribeToSession = useStore((s) => s.subscribeToSession);
  const unsubscribeFromSession = useStore((s) => s.unsubscribeFromSession);
  const setWsReconnectExhausted = useStore((s) => s.setWsReconnectExhausted);

  const reconnectAttempts = useRef(0);
  const prevSessionIdRef = useRef<string | null>(null);

  // Connect once on mount; auto-reconnect on disconnect.
  useEffect(() => {
    reconnectAttempts.current = 0;
    setWsReconnectExhausted(false);
    connectWebSocket();

    const interval = setInterval(() => {
      const status = useStore.getState().wsStatus;
      if (status === 'disconnected' && reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts.current += 1;
        connectWebSocket();
      }
      if (status === 'disconnected' && reconnectAttempts.current >= MAX_RECONNECT_ATTEMPTS) {
        setWsReconnectExhausted(true);
      }
      if (status === 'connected') {
        reconnectAttempts.current = 0;
        setWsReconnectExhausted(false);
      }
    }, RECONNECT_DELAY_MS);

    return () => {
      clearInterval(interval);
      disconnectWebSocket();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Subscribe/unsubscribe when the active session changes.
  useEffect(() => {
    const prev = prevSessionIdRef.current;

    if (prev && prev !== sessionId) {
      unsubscribeFromSession(prev);
    }
    if (sessionId && sessionId !== prev) {
      subscribeToSession(sessionId);
    }

    prevSessionIdRef.current = sessionId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);
}
