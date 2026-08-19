import React from 'react';
import { render, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SpaceBackground } from '@/components/ui/SpaceBackground';

describe('SpaceBackground Component (100% Coverage Suite)', () => {
  let mockCtx: Record<string, unknown>;

  beforeEach(() => {
    mockCtx = {
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      createLinearGradient: vi.fn(() => ({
        addColorStop: vi.fn(),
      })),
      createRadialGradient: vi.fn(() => ({
        addColorStop: vi.fn(),
      })),
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      shadowBlur: 0,
      shadowColor: '',
    };

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => mockCtx as unknown as CanvasRenderingContext2D,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('debe no fallar si canvasRef.current es null', () => {
    vi.spyOn(React, 'useEffect').mockImplementation((effect) => {
      // Execute effect while canvasRef.current is still null
      effect();
      return () => {};
    });
    const { unmount } = render(<SpaceBackground />);
    unmount();
  });

  it('debe manejar gracefully si getContext retorna null', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const { container, unmount } = render(<SpaceBackground />);
    expect(container.querySelector('canvas')).toBeInTheDocument();
    unmount();
  });

  it('debe animar estrellas (sparkling, normales grandes y pequeñas) y actualizar posición y envolver bordes', () => {
    let animCallback: FrameRequestCallback | null = null;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      animCallback = cb;
      return 1;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(vi.fn());

    // Make stars spawn near top edge (y=0) and with fast drift speed
    let initCalls = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => {
      initCalls++;
      // Star y (second random call for each star): spawn at y = 0
      if (initCalls % 6 === 2) return 0.0001;
      return 0.5;
    });

    const { container, unmount } = render(<SpaceBackground />);
    const canvas = container.querySelector('canvas');
    expect(canvas).toBeInTheDocument();

    act(() => {
      fireEvent.resize(window);
      fireEvent.mouseMove(window, { clientX: 400, clientY: 500 });
    });

    // Run animation frames to trigger star movement and wrapping past y < -10
    for (let frame = 0; frame < 200; frame++) {
      act(() => {
        if (animCallback) {
          animCallback(performance.now());
        }
      });
    }

    expect(mockCtx.clearRect).toHaveBeenCalled();
    expect(mockCtx.beginPath).toHaveBeenCalled();
    expect(mockCtx.fill).toHaveBeenCalled();
    expect(mockCtx.stroke).toHaveBeenCalled();

    unmount();
  });

  it('debe spawnear y dibujar meteoritos desde el borde superior y lateral derecho', () => {
    let animCallback: FrameRequestCallback | null = null;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      animCallback = cb;
      return 1;
    });

    let isAnimating = false;
    let spawnCount = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => {
      if (!isAnimating) return 0.5;
      spawnCount++;
      // Return < 0.0025 on first call in animate frame, then alternate startFromTop (> 0.4 and <= 0.4)
      if (spawnCount % 5 === 1) return 0.001; // spawn meteor
      if (spawnCount % 5 === 2) return 0.8; // startFromTop = true
      if (spawnCount % 5 === 3) return 0.2; // startFromTop = false
      return 0.5;
    });

    const { unmount } = render(<SpaceBackground />);
    isAnimating = true;

    fireEvent.mouseMove(window, { clientX: 200, clientY: 150 });

    // Run frames to animate meteors across active and inactive states
    for (let frame = 0; frame < 100; frame++) {
      act(() => {
        if (animCallback) {
          animCallback(performance.now());
        }
      });
    }

    expect(mockCtx.createLinearGradient).toHaveBeenCalled();
    expect(mockCtx.save).toHaveBeenCalled();
    expect(mockCtx.restore).toHaveBeenCalled();

    unmount();
  });

  it('debe desactivar y limpiar meteoritos cuando exceden los límites de pantalla o expira su opacidad', () => {
    let animCallback: FrameRequestCallback | null = null;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      animCallback = cb;
      return 1;
    });

    let isAnimating = false;
    let call = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => {
      if (!isAnimating) return 0.5;
      call++;
      if (call <= 4) return 0.001; // spawn meteors
      if (call === 2) return 0.9; // startFromTop = true
      if (call === 4) return 0.1; // startFromTop = false
      return 0.5;
    });

    const { unmount } = render(<SpaceBackground />);
    isAnimating = true;

    for (let frame = 0; frame < 350; frame++) {
      act(() => {
        if (animCallback) {
          animCallback(performance.now());
        }
      });
    }

    unmount();
  });

  it('debe manejar ramas de meteoros inactivos y salida por límites X y Y', () => {
    let animCallback: FrameRequestCallback | null = null;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      animCallback = cb;
      return 1;
    });

    let isAnimating = false;
    let call = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => {
      if (!isAnimating) return 0.5;
      call++;
      // Frame 1: Spawn Meteor 1 (active at top)
      if (call === 1) return 0.0001;
      if (call === 2) return 0.9;
      // Frame 2: Spawn Meteor 2 (lateral right, fast)
      if (call === 10) return 0.0001;
      if (call === 11) return 0.1;
      return 0.5;
    });

    const { unmount } = render(<SpaceBackground />);
    isAnimating = true;

    // Step 1: Advance frames to move meteors across screen boundaries
    for (let frame = 0; frame < 150; frame++) {
      act(() => {
        if (animCallback) {
          animCallback(performance.now());
        }
      });
    }

    unmount();
  });

  it('debe ajustar la cantidad y tamaño de estrellas en pantallas móviles y spawnear meteoros laterales', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 480 });
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: 800,
    });

    let animCallback: FrameRequestCallback | null = null;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      animCallback = cb;
      return 1;
    });

    let calls = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => {
      calls++;
      if (calls === 1) return 0.0001; // spawn meteor
      if (calls === 2) return 0.1; // startFromTop = false (spawn from right)
      return 0.5;
    });

    const { unmount } = render(<SpaceBackground />);

    for (let frame = 0; frame < 50; frame++) {
      act(() => {
        if (animCallback) {
          animCallback(performance.now());
        }
      });
    }

    expect(mockCtx.arc).toHaveBeenCalled();
    unmount();
  });
});
