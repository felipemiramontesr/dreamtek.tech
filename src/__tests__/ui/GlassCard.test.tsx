import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GlassCard } from '@/components/ui/GlassCard';

describe('GlassCard Component Suite', () => {
  it('renderiza con clases por defecto (hover activo y sin destaque)', () => {
    const { container } = render(
      <GlassCard className="custom-class">
        <span>Contenido Test</span>
      </GlassCard>,
    );

    expect(screen.getByText('Contenido Test')).toBeInTheDocument();
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain('glass-panel');
    expect(card.className).toContain('glass-panel-hover');
    expect(card.className).toContain('group');
    expect(card.className).toContain('custom-class');
    expect(screen.getByTestId('glass-card-glow')).toBeInTheDocument();
  });

  it('renderiza con featured={true} aplicando estilos de destaque', () => {
    const { container } = render(
      <GlassCard featured>
        <span>Contenido Featured</span>
      </GlassCard>,
    );

    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain('!border-[#FF2D00]/40');
    expect(card.className).toContain('shadow-[0_0_30px_rgba(255,45,0,0.15)]');
  });

  it('renderiza con hover={false} desactivando clases y resplandor de hover', () => {
    const { container } = render(
      <GlassCard hover={false}>
        <span>Contenido Sin Hover</span>
      </GlassCard>,
    );

    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain('glass-panel');
    expect(card.className).not.toContain('glass-panel-hover');
    expect(card.className).not.toContain('group');
    expect(screen.queryByTestId('glass-card-glow')).toBeNull();
  });
});
