import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CookieBanner } from '@/components/ui/CookieBanner';
import { es } from '@/i18n/dictionaries/es';
import { en } from '@/i18n/dictionaries/en';
import * as navigation from 'next/navigation';

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/'),
}));

describe('CookieBanner Component (100% Coverage Suite)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.mocked(navigation.usePathname).mockReturnValue('/');
    Object.defineProperty(window, 'scrollY', { value: 0, writable: true });
  });

  it('debe mostrarse si no hay preferencia previa en localStorage', async () => {
    render(<CookieBanner dict={es} />);
    const text = await screen.findByText(/Este sitio utiliza cookies propias y de terceros/);
    expect(text).toBeInTheDocument();
  });

  it('debe renderizar enlaces en inglés cuando lang="en"', async () => {
    render(<CookieBanner dict={en} lang="en" />);
    const link = await screen.findByText('Cookie Policy');
    expect(link).toBeInTheDocument();
    expect(link.closest('a')).toHaveAttribute('href', '/en/cookies');
  });

  it('debe aplicar la clase solid-bg en páginas legales como /cookies', async () => {
    vi.mocked(navigation.usePathname).mockReturnValue('/cookies');
    const { container } = render(<CookieBanner dict={es} />);
    await screen.findByText(/Este sitio utiliza cookies/);
    const banner = container.querySelector('.cookie-banner');
    expect(banner).toHaveClass('solid-bg');
  });

  it('debe activar solid-bg al hacer scroll vertical superior a 100px', async () => {
    const { container, unmount } = render(<CookieBanner dict={es} />);
    await screen.findByText(/Este sitio utiliza cookies/);

    act(() => {
      window.scrollY = 150;
      fireEvent.scroll(window);
    });

    const banner = container.querySelector('.cookie-banner');
    expect(banner).toHaveClass('solid-bg');

    unmount();
  });

  it('debe registrar accepted en localStorage al hacer clic en Aceptar', async () => {
    render(<CookieBanner dict={es} />);
    const acceptBtn = await screen.findByRole('button', { name: 'Aceptar' });
    fireEvent.click(acceptBtn);

    expect(localStorage.getItem('cookieConsent')).toBe('accepted');
    expect(
      screen.queryByText(/Este sitio utiliza cookies propias y de terceros/),
    ).not.toBeInTheDocument();
  });

  it('debe registrar rejected en localStorage al hacer clic en Rechazar', async () => {
    render(<CookieBanner dict={es} />);
    const rejectBtn = await screen.findByRole('button', { name: 'Rechazar' });
    fireEvent.click(rejectBtn);

    expect(localStorage.getItem('cookieConsent')).toBe('rejected');
    expect(
      screen.queryByText(/Este sitio utiliza cookies propias y de terceros/),
    ).not.toBeInTheDocument();
  });

  it('no debe mostrarse si ya existe preferencia en localStorage', async () => {
    localStorage.setItem('cookieConsent', 'accepted');
    render(<CookieBanner dict={es} />);

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(
      screen.queryByText(/Este sitio utiliza cookies propias y de terceros/),
    ).not.toBeInTheDocument();
  });
});
