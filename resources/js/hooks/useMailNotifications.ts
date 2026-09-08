import { useEffect, useRef, useState } from 'react';

export interface UnreadCounts {
  [folder: string]: number;
}

const SSE_URL = '/api/v1/webmail/notifications/stream';
const RECONNECT_DELAY_MS = 5_000;

/**
 * Subscribe to realtime mail notifications via Server-Sent Events.
 *
 * Maintains one persistent connection per browser tab. The server pushes
 * unread counts whenever they change — no polling from the client side.
 * Reconnects automatically after network drops.
 */
export function useMailNotifications() {
  const [unreadCounts, setUnreadCounts] = useState<UnreadCounts>({});
  const [isConnected, setIsConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearReconnectTimer = () => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  };

  const connect = () => {
    clearReconnectTimer();

    const token = localStorage.getItem('auth_token');
    if (!token) return;

    // EventSource doesn't support custom headers — pass token via query param
    const url = `${SSE_URL}?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.addEventListener('connected', () => {
      setIsConnected(true);
    });

    es.addEventListener('mail.unread', (event: MessageEvent) => {
      try {
        const counts: UnreadCounts = JSON.parse(event.data);
        setUnreadCounts(counts);
      } catch {
        // malformed payload — ignore
      }
    });

    es.onerror = () => {
      setIsConnected(false);
      es.close();
      eventSourceRef.current = null;
      // Auto-reconnect after delay
      reconnectTimerRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
    };
  };

  useEffect(() => {
    connect();
    return () => {
      clearReconnectTimer();
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, []);

  return { unreadCounts, isConnected };
}
