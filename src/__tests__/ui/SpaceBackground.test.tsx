import { render, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SpaceBackground } from '@/components/ui/SpaceBackground';

describe('SpaceBackground Component', () => {
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

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => mockCtx);
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      return setTimeout(() => cb(performance.now()), 16) as unknown as number;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id: number) => {
      clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('debe renderizar el canvas y registrar listeners de resize y mousemove', () => {
    const { container, unmount } = render(<SpaceBackground />);

    const canvas = container.querySelector('canvas');
    expect(canvas).toBeInTheDocument();

    act(() => {
      fireEvent.resize(window);
      fireEvent.mouseMove(window, { clientX: 300, clientY: 400 });
    });

    expect(mockCtx.clearRect).toHaveBeenCalled();

    unmount();
  });
});
