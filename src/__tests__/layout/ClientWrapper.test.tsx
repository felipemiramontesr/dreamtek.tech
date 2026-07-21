import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ClientWrapper } from '@/components/layout/ClientWrapper';

const pushMock = vi.fn();
let mockPathname = '/';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => mockPathname,
}));

describe('ClientWrapper Component', () => {
  it('debe detectar la ruta principal en español y configurar document.documentElement.lang a "es"', () => {
    mockPathname = '/';

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
});
