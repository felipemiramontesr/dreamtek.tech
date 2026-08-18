import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useSSE } from '../../lib/events/useSSE';

describe('useSSE React Hook Unit Tests', () => {
  const mockInstances: MockEventSource[] = [];

  class MockEventSource {
    url: string;
    withCredentials?: boolean;
    onopen: (() => void) | null = null;
    onmessage: ((event: Partial<MessageEvent>) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    close = vi.fn();

    constructor(url: string, options?: { withCredentials?: boolean }) {
      this.url = url;
      this.withCredentials = options?.withCredentials;
      mockInstances.push(this);
    }
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockInstances.length = 0;
    vi.stubGlobal('EventSource', MockEventSource);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('debe inicializar en estado CLOSED cuando enabled es false', () => {
    const { result } = renderHook(() => useSSE({ enabled: false }));
    expect(result.current.connectionState).toBe('CLOSED');
    expect(result.current.isConnected).toBe(false);
  });

  it('debe conectar a SSE y cambiar a estado OPEN al disparar onopen', () => {
    const { result } = renderHook(() => useSSE({ url: '/api/v1/events' }));

    act(() => {
      const activeInstance = mockInstances[mockInstances.length - 1];
      if (activeInstance?.onopen) {
        activeInstance.onopen();
      }
    });

    expect(result.current.connectionState).toBe('OPEN');
    expect(result.current.isConnected).toBe(true);
  });

  it('debe procesar mensajes JSON en onmessage y actualizar lastEvent', () => {
    const { result } = renderHook(() => useSSE({ url: '/api/v1/events' }));

    act(() => {
      const activeInstance = mockInstances[mockInstances.length - 1];
      if (activeInstance?.onmessage) {
        activeInstance.onmessage({ data: JSON.stringify({ type: 'PING', ok: true }) });
      }
    });

    expect(result.current.lastEvent).toEqual({ type: 'PING', ok: true });
  });

  it('debe procesar mensajes texto plano si falla JSON.parse', () => {
    const { result } = renderHook(() => useSSE({ url: '/api/v1/events' }));

    act(() => {
      const activeInstance = mockInstances[mockInstances.length - 1];
      if (activeInstance?.onmessage) {
        activeInstance.onmessage({ data: 'raw string event' });
      }
    });

    expect(result.current.lastEvent).toBe('raw string event');
  });

  it('debe manejar errores en onerror y cerrar la conexión', () => {
    const onErrorMock = vi.fn();
    const { result } = renderHook(() => useSSE({ url: '/api/v1/events', onError: onErrorMock }));
    const activeInstance = mockInstances[mockInstances.length - 1];

    act(() => {
      if (activeInstance?.onerror) {
        activeInstance.onerror(new Event('error'));
      }
    });

    expect(result.current.connectionState).toBe('CLOSED');
    expect(activeInstance?.close).toHaveBeenCalled();
    expect(onErrorMock).toHaveBeenCalled();
  });

  it('debe manejar errores en onerror cuando onError no se proporciona y limpiar al desmontar', () => {
    const { unmount } = renderHook(() => useSSE({ url: '/api/v1/events' }));
    const activeInstance = mockInstances[mockInstances.length - 1];

    act(() => {
      if (activeInstance?.onerror) {
        activeInstance.onerror(new Event('error'));
      }
    });

    expect(activeInstance?.close).toHaveBeenCalled();
    unmount();
  });
});
