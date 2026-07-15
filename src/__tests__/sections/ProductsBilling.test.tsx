import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Products } from '@/components/sections/Products';
import { es } from '@/i18n/dictionaries/es';

describe('Products Billing Toggle (TDD)', () => {
  it('debe renderizar el toggle de ciclo de facturacion mensual/anual', () => {
    render(<Products dict={es} />);

    // El toggle o switch de facturación debe estar presente
    expect(screen.getByRole('checkbox', { name: /facturación anual/i })).toBeInTheDocument();
    expect(screen.getByText(es.products.monthly)).toBeInTheDocument();
    expect(screen.getByText(es.products.annual)).toBeInTheDocument();
  });

  it('debe mostrar los precios mensuales por defecto', () => {
    render(<Products dict={es} />);

    // Verificamos precios mensuales
    expect(screen.getByText(es.products.plans[0].price)).toBeInTheDocument();
    expect(screen.getByText(es.products.plans[1].price)).toBeInTheDocument();
    expect(screen.getByText(es.products.plans[2].price)).toBeInTheDocument();

    // No debe haber badge de "20% OFF" o "Ahorra 20%" activo por defecto
    expect(screen.queryByText(/Ahorra 20%/)).not.toBeInTheDocument();
    expect(screen.queryByText(/facturado al año/i)).not.toBeInTheDocument();
  });

  it('debe aplicar descuento del 20% e indicar cobro anual al activar el toggle', () => {
    render(<Products dict={es} />);

    const toggle = screen.getByRole('checkbox', { name: /facturación anual/i });

    // Cambiamos a facturación anual
    fireEvent.click(toggle);

    // Debe mostrarse el badge de ahorro
    expect(screen.getAllByText(/Ahorra 20%/i).length).toBeGreaterThan(0);

    // Los precios deben cambiar aplicando el 20% de descuento (usamos valores del dict)
    expect(screen.getByText(es.products.plans[0].annualPrice)).toBeInTheDocument();
    expect(screen.getByText(es.products.plans[1].annualPrice)).toBeInTheDocument();
    expect(screen.getByText(es.products.plans[2].annualPrice)).toBeInTheDocument();

    // Debe mostrar la etiqueta de cobro anual
    expect(
      screen.getByText(
        (content) =>
          content.includes(es.products.billedAnnually.trim()) &&
          content.includes(es.products.plans[0].annualTotal),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        (content) =>
          content.includes(es.products.billedAnnually.trim()) &&
          content.includes(es.products.plans[1].annualTotal),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        (content) =>
          content.includes(es.products.billedAnnually.trim()) &&
          content.includes(es.products.plans[2].annualTotal),
      ),
    ).toBeInTheDocument();
  });

  it('debe retornar a precios mensuales al desactivar el toggle', () => {
    render(<Products dict={es} />);

    const toggle = screen.getByRole('checkbox', { name: /facturación anual/i });

    // Activar y luego desactivar
    fireEvent.click(toggle);
    fireEvent.click(toggle);

    // Precios mensuales originales
    expect(screen.getByText(es.products.plans[0].price)).toBeInTheDocument();
    expect(screen.getByText(es.products.plans[1].price)).toBeInTheDocument();
    expect(screen.getByText(es.products.plans[2].price)).toBeInTheDocument();

    expect(screen.queryByText(/Ahorra 20%/)).not.toBeInTheDocument();
    expect(screen.queryByText(/facturado al año/i)).not.toBeInTheDocument();
  });
});
