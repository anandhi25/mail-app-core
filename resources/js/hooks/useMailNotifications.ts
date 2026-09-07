import { useEffect, useRef, useState } from 'react';

export interface UnreadCounts {
  [folder: string]: number;
}

const SSE_URL = '/api/v1/webmail/notifications/stream';
const RECONNECT_DELAY_MS = 5_000;

/**
 * Subscribe to realtime mail notifications via Server-Sent Events.
 *
 * Returns unread counts per folder that update in realtime as new mail
 * arrives. The connection reconnects automatically if it drops.
 *
 * @example
 * const { unreadCounts, isConnected } = useMailNotifications();
 * // unreadCounts => { INBOX: 3, Junk: 1, Drafts: 0 }
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
    if (!token) {
      return;
    }

    // EventSource doesn't support custom headers natively — pass token via query param
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
        // Malformed payload — ignore
      }
    });

    es.addEventListener('error', () => {
      // Don't log — SSE fires error on every reconnect cycle too
    });

    es.onerror = () => {
      setIsConnected(false);
      es.close();
      eventSourceRef.current = null;

      // Schedule reconnect
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
