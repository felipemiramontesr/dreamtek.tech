import { useEffect, useRef, useState } from 'react';

export interface SSEOptions {
  url?: string;
  onMessage?: (event: MessageEvent) => void;
  onError?: (event: Event) => void;
  enabled?: boolean;
}

export type ConnectionState = 'CONNECTING' | 'OPEN' | 'CLOSED';

export function useSSE(options: SSEOptions = {}) {
  const { url = '/api/v1/events', enabled = true, onError } = options;
  const [connectionState, setConnectionState] = useState<ConnectionState>('CLOSED');
  const [lastEvent, setLastEvent] = useState<unknown | null>(null);

  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const eventSource = new EventSource(url, { withCredentials: true });

    eventSource.onopen = () => {
      setConnectionState('OPEN');
    };

    eventSource.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        setLastEvent(parsed);
      } catch {
        setLastEvent(event.data);
      }
    };

    eventSource.onerror = (err) => {
      setConnectionState('CLOSED');
      eventSource.close();
      if (onErrorRef.current) {
        onErrorRef.current(err);
      }
    };

    return () => {
      eventSource.close();
      setConnectionState('CLOSED');
    };
  }, [url, enabled]);

  return {
    connectionState,
    lastEvent,
    isConnected: connectionState === 'OPEN',
  };
}
