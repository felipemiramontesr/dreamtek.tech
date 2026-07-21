import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Differential } from '@/components/sections/Differential';
import { es } from '@/i18n/dictionaries/es';

describe('Differential Component', () => {
  it('debe renderizar el título y los elementos diferenciales requeridos', () => {
    render(<Differential dict={es} />);

    expect(screen.getByText(/El Diferencial/i)).toBeInTheDocument();
    expect(screen.getByText(/Dreamtek/i)).toBeInTheDocument();

    es.differential.items.forEach((item) => {
      expect(screen.getByText(item.title)).toBeInTheDocument();
      expect(screen.getByText(item.description)).toBeInTheDocument();
    });
  });
});
