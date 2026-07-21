import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Services } from '@/components/sections/Services';
import { es } from '@/i18n/dictionaries/es';

describe('Services Component', () => {
  it('debe renderizar los encabezados principales de la sección de servicios', () => {
    render(<Services dict={es} />);

    expect(screen.getByText(/Servicios/i)).toBeInTheDocument();
    expect(screen.getByText(/Core/i)).toBeInTheDocument();
    expect(screen.getByText(es.services.subtitle)).toBeInTheDocument();
  });

  it('debe renderizar las 3 tarjetas de servicios con sus respectivos títulos y botones CTA', () => {
    render(<Services dict={es} />);

    es.services.cards.forEach((card) => {
      expect(screen.getByText(card.title)).toBeInTheDocument();
      expect(screen.getByText(card.description)).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: new RegExp(card.ctaText, 'i') }),
      ).toBeInTheDocument();

      card.badges.forEach((badge) => {
        expect(screen.getAllByText(badge).length).toBeGreaterThan(0);
      });
    });
  });
});
