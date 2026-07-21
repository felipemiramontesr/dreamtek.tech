import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import LandingPageSpanish from '@/app/(landing)/page';
import LandingPageEnglish from '@/app/(landing)/en/page';
import CookiesPageSpanish from '@/app/cookies/page';
import CookiesPageEnglish from '@/app/en/cookies/page';
import PrivacyPageSpanish from '@/app/privacidad/page';
import PrivacyPageEnglish from '@/app/en/privacidad/page';
import TermsPageSpanish from '@/app/terminos/page';
import TermsPageEnglish from '@/app/en/terminos/page';

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => <img alt="" {...props} />,
}));

describe('App Pages', () => {
  it('debe renderizar la Landing Page en español e inyectar el script JSON-LD de datos estructurados', () => {
    const { container } = render(<LandingPageSpanish />);

    expect(screen.getByText(/Convertimos visiones/i)).toBeInTheDocument();

    const jsonLdScript = container.querySelector('script[type="application/ld+json"]');
    expect(jsonLdScript).toBeInTheDocument();
    expect(jsonLdScript?.innerHTML).toContain('Dreamtek');
  });

  it('debe renderizar la Landing Page en inglés e inyectar su script JSON-LD', () => {
    const { container } = render(<LandingPageEnglish />);

    expect(screen.getByText(/We transform complex visions/i)).toBeInTheDocument();

    const jsonLdScript = container.querySelector('script[type="application/ld+json"]');
    expect(jsonLdScript).toBeInTheDocument();
  });

  it('debe renderizar las páginas legales en español e inglés', () => {
    render(<CookiesPageSpanish />);
    expect(
      screen.getByRole('heading', { level: 1, name: /Manejo de Cookies/i }),
    ).toBeInTheDocument();

    render(<CookiesPageEnglish />);
    expect(screen.getByRole('heading', { level: 1, name: /Cookie Policy/i })).toBeInTheDocument();

    render(<PrivacyPageSpanish />);
    expect(
      screen.getByRole('heading', { level: 1, name: /Aviso de Privacidad/i }),
    ).toBeInTheDocument();

    render(<PrivacyPageEnglish />);
    expect(screen.getByRole('heading', { level: 1, name: /Privacy Policy/i })).toBeInTheDocument();

    render(<TermsPageSpanish />);
    expect(
      screen.getByRole('heading', { level: 1, name: /Términos de Servicio/i }),
    ).toBeInTheDocument();

    render(<TermsPageEnglish />);
    expect(
      screen.getByRole('heading', { level: 1, name: /Terms of Service/i }),
    ).toBeInTheDocument();
  });
});
