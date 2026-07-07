import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Hero } from '@/components/sections/Hero';

describe('Hero Component', () => {
  it('debe renderizar el canvas de fondo espacial y el titulo principal', () => {
    const { container } = render(<Hero />);

    // Validamos que se muestre el canvas de estrellas en el fondo
    const canvas = container.querySelector('canvas');
    expect(canvas).toBeInTheDocument();
    expect(canvas).toHaveAttribute('aria-hidden', 'true');

    // Validamos el texto del titular
    expect(screen.getByText(/Convertimos visiones complejas en/i)).toBeInTheDocument();
    expect(screen.getByText(/infraestructura digital robusta/i)).toBeInTheDocument();
  });

  it('debe renderizar los botones de accion (CTAs) requeridos', () => {
    render(<Hero />);

    expect(
      screen.getByRole('button', { name: /Solicitar Diagnóstico Inicial/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Conocer Metodología/i })).toBeInTheDocument();
  });
});
