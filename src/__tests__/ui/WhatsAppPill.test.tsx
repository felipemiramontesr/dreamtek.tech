import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { WhatsAppPill } from '@/components/ui/WhatsAppPill';
import { es } from '@/i18n/dictionaries/es';

describe('WhatsAppPill Component', () => {
  it('debe renderizar el botón flotante de WhatsApp con su enlace y texto de ayuda', () => {
    render(<WhatsAppPill dict={es} />);

    const link = screen.getByRole('link', { name: /WhatsApp/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute(
      'href',
      'https://wa.me/524481117977?text=%C2%A1Hola%2C%20equipo%20Dreamtek!%20%C2%BFPodr%C3%ADan%20ayudarme%20con%20la%20siguiente%20informaci%C3%B3n%3F',
    );
    expect(link).toHaveAttribute('target', '_blank');

    expect(screen.getByText(es.whatsapp.help)).toBeInTheDocument();
  });
});
