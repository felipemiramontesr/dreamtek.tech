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

    // El texto de cobro anual debe estar oculto con opacity-0 por defecto
    const annualTotalElement = screen.getByText(
      (content) =>
        content.includes(es.products.billedAnnually.trim()) &&
        content.includes(es.products.plans[0].annualTotal),
    );
    expect(annualTotalElement.className).toContain('opacity-0');
  });

  it('debe aplicar descuento del 10% e indicar cobro anual al activar el toggle', () => {
    render(<Products dict={es} />);

    const toggle = screen.getByRole('checkbox', { name: /facturación anual/i });

    // Cambiamos a facturación anual
    fireEvent.click(toggle);

    // Debe mostrarse el badge de ahorro
    expect(screen.getAllByText(/Ahorra 10%/i).length).toBeGreaterThan(0);

    // Los precios deben cambiar aplicando el 10% de descuento (usamos valores del dict)
    expect(screen.getByText(es.products.plans[0].annualPrice)).toBeInTheDocument();
    expect(screen.getByText(es.products.plans[1].annualPrice)).toBeInTheDocument();
    expect(screen.getByText(es.products.plans[2].annualPrice)).toBeInTheDocument();

    // Debe mostrar la etiqueta de cobro anual visible (opacity-100) para el plan con total anual
    const annualTotalElementActive = screen.getByText(
      (content) =>
        content.includes(es.products.billedAnnually.trim()) &&
        content.includes(es.products.plans[0].annualTotal),
    );
    expect(annualTotalElementActive.className).toContain('opacity-100');
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

    expect(screen.queryByText(/Ahorra 10%/)).not.toBeInTheDocument();
    const annualTotalElementHidden = screen.getByText(
      (content) =>
        content.includes(es.products.billedAnnually.trim()) &&
        content.includes(es.products.plans[0].annualTotal),
    );
    expect(annualTotalElementHidden.className).toContain('opacity-0');
  });
});
