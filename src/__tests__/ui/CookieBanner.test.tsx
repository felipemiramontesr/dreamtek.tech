import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CookieBanner } from '@/components/ui/CookieBanner';

describe('CookieBanner Component', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('debe mostrarse si no hay preferencia previa en localStorage', async () => {
    render(<CookieBanner />);
    const text = await screen.findByText(/Este sitio utiliza cookies propias y de terceros/);
    expect(text).toBeInTheDocument();
  });

  it('debe registrar accepted en localStorage al hacer clic en Aceptar', async () => {
    render(<CookieBanner />);
    const acceptBtn = await screen.findByRole('button', { name: 'Aceptar' });
    fireEvent.click(acceptBtn);

    expect(localStorage.getItem('cookieConsent')).toBe('accepted');
    expect(
      screen.queryByText(/Este sitio utiliza cookies propias y de terceros/),
    ).not.toBeInTheDocument();
  });

  it('debe registrar rejected en localStorage al hacer clic en Rechazar', async () => {
    render(<CookieBanner />);
    const rejectBtn = await screen.findByRole('button', { name: 'Rechazar' });
    fireEvent.click(rejectBtn);

    expect(localStorage.getItem('cookieConsent')).toBe('rejected');
    expect(
      screen.queryByText(/Este sitio utiliza cookies propias y de terceros/),
    ).not.toBeInTheDocument();
  });

  it('no debe mostrarse si ya existe preferencia en localStorage', async () => {
    localStorage.setItem('cookieConsent', 'accepted');
    render(<CookieBanner />);

    // Esperamos un instante corto para asegurar que el useEffect se procesó
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(
      screen.queryByText(/Este sitio utiliza cookies propias y de terceros/),
    ).not.toBeInTheDocument();
  });
});
