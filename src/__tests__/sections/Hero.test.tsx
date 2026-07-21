import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Hero } from '@/components/sections/Hero';
import { es } from '@/i18n/dictionaries/es';

describe('Hero Component', () => {
  it('debe renderizar el canvas de fondo espacial y el titulo principal', async () => {
    const { container } = render(<Hero dict={es} />);

    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/Convertimos visiones complejas/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(container.querySelector('canvas')).toBeInTheDocument();
    });
  });

  it('debe renderizar los botones de accion (CTAs) requeridos', () => {
    render(<Hero dict={es} />);

    expect(
      screen.getByRole('button', { name: new RegExp(es.hero.ctaPrimary, 'i') }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: new RegExp(es.hero.ctaSecondary, 'i') }),
    ).toBeInTheDocument();
  });
});
