import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Products } from '@/components/sections/Products';
import { es } from '@/i18n/dictionaries/es';

describe('Products Component', () => {
  it('se debe renderizar la seccion de productos y mostrar los planes primarios', () => {
    render(<Products dict={es} />);

    // Verificamos que se renderice el título de la sección
    expect(
      screen.getByText((content) => content.includes(es.products.heading1.trim())),
    ).toBeInTheDocument();
    expect(
      screen.getByText((content) => content.includes(es.products.heading2.trim())),
    ).toBeInTheDocument();

    // Verificamos que los tres planes estén visibles
    expect(screen.getByText(es.products.plans[0].title)).toBeInTheDocument();
    expect(screen.getByText(es.products.plans[1].title)).toBeInTheDocument();
    expect(screen.getByText(es.products.plans[2].title)).toBeInTheDocument();

    // Verificamos que aparezcan las características clave
    expect(screen.getByText(es.products.plans[0].features[0])).toBeInTheDocument();
    expect(screen.getByText(es.products.plans[1].features[0])).toBeInTheDocument();
    expect(screen.getByText(es.products.plans[2].features[0])).toBeInTheDocument();
  });
});
