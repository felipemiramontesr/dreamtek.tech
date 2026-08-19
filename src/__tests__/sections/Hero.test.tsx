import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Hero } from '@/components/sections/Hero';
import { es } from '@/i18n/dictionaries/es';

describe('Hero Component (100% Coverage Suite)', () => {
  it('debe renderizar el canvas de fondo espacial y el titulo principal', async () => {
    const { container } = render(<Hero dict={es} />);

    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/Convertimos visiones complejas/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(container.querySelector('canvas')).toBeInTheDocument();
    });
  });

  it('debe llamar a onOpenAuthModal al hacer clic en el CTA secundario si se proporciona', () => {
    const onOpenAuthModal = vi.fn();
    render(<Hero dict={es} onOpenAuthModal={onOpenAuthModal} />);

    const secondaryCta = screen.getByRole('button', {
      name: new RegExp(es.hero.ctaSecondary, 'i'),
    });
    fireEvent.click(secondaryCta);

    expect(onOpenAuthModal).toHaveBeenCalledTimes(1);
  });

  it('debe despachar CustomEvent open-auth-modal al hacer clic en CTA secundario sin prop onOpenAuthModal', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    render(<Hero dict={es} />);

    const secondaryCta = screen.getByRole('button', {
      name: new RegExp(es.hero.ctaSecondary, 'i'),
    });
    fireEvent.click(secondaryCta);

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'open-auth-modal',
        detail: { mode: 'login' },
      }),
    );
  });
});
