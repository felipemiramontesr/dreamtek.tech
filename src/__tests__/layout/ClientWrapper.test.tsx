import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClientWrapper } from '@/components/layout/ClientWrapper';

let mockPathname = '/';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => mockPathname,
}));

describe('ClientWrapper Component (100% Coverage Suite)', () => {
  beforeEach(() => {
    mockPathname = '/';
    vi.clearAllMocks();
  });

  it('debe detectar la ruta principal en español y configurar document.documentElement.lang a "es"', () => {
    render(
      <ClientWrapper>
        <div data-testid="test-child">Contenido Hilo</div>
      </ClientWrapper>,
    );

    expect(screen.getByTestId('test-child')).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('es');
  });

  it('debe detectar la ruta en inglés "/en" y configurar document.documentElement.lang a "en"', () => {
    mockPathname = '/en';

    render(
      <ClientWrapper>
        <div data-testid="test-child-en">English Child</div>
      </ClientWrapper>,
    );

    expect(screen.getByTestId('test-child-en')).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
  });

  it('debe abrir y cerrar AuthModal vía open-auth-modal custom event (con y sin mode explícito)', () => {
    const { unmount } = render(
      <ClientWrapper>
        <div>Content</div>
      </ClientWrapper>,
    );

    // Dispatch event with mode: 'register'
    act(() => {
      window.dispatchEvent(
        new CustomEvent('open-auth-modal', {
          detail: { mode: 'register' },
        }),
      );
    });

    // Verify modal is open
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // Close modal via close button
    const closeBtn = screen.getByRole('button', { name: /Cerrar modal/i });
    fireEvent.click(closeBtn);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // Dispatch event without detail (fallback to 'login')
    act(() => {
      window.dispatchEvent(new CustomEvent('open-auth-modal', { detail: {} }));
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    unmount();
  });

  it('debe abrir AuthModal al hacer clic en el botón de login de Navbar', () => {
    render(
      <ClientWrapper>
        <div>Content</div>
      </ClientWrapper>,
    );

    const navAuthButtons = screen.getAllByRole('button', { name: /área de clientes|client area/i });
    expect(navAuthButtons.length).toBeGreaterThan(0);
    fireEvent.click(navAuthButtons[0]);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
