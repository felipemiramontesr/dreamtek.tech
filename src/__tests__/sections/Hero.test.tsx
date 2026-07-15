import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Hero } from '@/components/sections/Hero';
import { es } from '@/i18n/dictionaries/es';

describe('Hero Component', () => {
  it('debe renderizar el canvas de fondo espacial y el titulo principal', () => {
    const { container } = render(<Hero dict={es} />);

    // Validamos que se muestre el canvas de estrellas en el fondo
    const canvas = container.querySelector('canvas');
    expect(canvas).toBeInTheDocument();
    expect(canvas).toHaveAttribute('aria-hidden', 'true');

    // Validamos el texto del titular
    expect(screen.getByText(/Convertimos visiones complejas en/i)).toBeInTheDocument();
    expect(screen.getByText(/infraestructura digital robusta/i)).toBeInTheDocument();
  });

  it('debe renderizar los botones de accion (CTAs) requeridos', () => {
    render(<Hero dict={es} />);

    expect(
      screen.getByRole('button', { name: /Solicitar Diagnóstico Inicial/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Conocer Metodología/i })).toBeInTheDocument();
  });
});
