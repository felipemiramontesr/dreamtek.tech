import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Footer } from '@/components/layout/Footer';
import { es } from '@/i18n/dictionaries/es';
import { en } from '@/i18n/dictionaries/en';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

describe('Footer Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.scrollTo = vi.fn();
    vi.useFakeTimers();
  });

  it('debe renderizar el footer en español con enlaces y copyright', () => {
    render(<Footer dict={es} lang="es" />);

    expect(screen.getByText(es.footer.subtitle)).toBeInTheDocument();
    expect(screen.getAllByText(/Dreamtek/i).length).toBeGreaterThan(0);
    expect(screen.getByText(es.footer.company)).toBeInTheDocument();
    expect(screen.getByText(es.footer.legal)).toBeInTheDocument();

    expect(screen.getByRole('link', { name: es.navbar.services })).toHaveAttribute(
      'href',
      '#servicios',
    );
    expect(screen.getByRole('link', { name: es.navbar.differential })).toHaveAttribute(
      'href',
      '#diferencial',
    );
    expect(screen.getByRole('link', { name: es.footer.cookies })).toHaveAttribute(
      'href',
      '/cookies',
    );
    expect(screen.getByRole('link', { name: es.footer.privacy })).toHaveAttribute(
      'href',
      '/privacidad',
    );
    expect(screen.getByRole('link', { name: es.footer.terms })).toHaveAttribute(
      'href',
      '/terminos',
    );
  });

  it('debe navegar al inicio al hacer clic en el botón de logotipo del footer', () => {
    render(<Footer dict={es} lang="es" />);

    const returnBtn = screen.getByRole('button', { name: new RegExp(es.navbar.returnSite, 'i') });
    fireEvent.click(returnBtn);

    expect(pushMock).toHaveBeenCalledWith('/', { scroll: false });

    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'instant' });
  });

  it('debe renderizar los enlaces adaptados a inglés con prefijos de ruta correctos', () => {
    render(<Footer dict={en} lang="en" />);

    expect(screen.getByRole('link', { name: en.footer.cookies })).toHaveAttribute(
      'href',
      '/en/cookies',
    );
    expect(screen.getByRole('link', { name: en.footer.privacy })).toHaveAttribute(
      'href',
      '/en/privacidad',
    );
    expect(screen.getByRole('link', { name: en.footer.terms })).toHaveAttribute(
      'href',
      '/en/terminos',
    );
  });
});
