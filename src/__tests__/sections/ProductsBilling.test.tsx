import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Products } from '@/components/sections/Products';

describe('Products Billing Toggle (TDD)', () => {
  it('debe renderizar el toggle de ciclo de facturacion mensual/anual', () => {
    render(<Products />);

    // El toggle o switch de facturación debe estar presente
    expect(screen.getByRole('checkbox', { name: /facturación anual/i })).toBeInTheDocument();
    expect(screen.getByText('Mensual')).toBeInTheDocument();
    expect(screen.getByText('Anual')).toBeInTheDocument();
  });

  it('debe mostrar los precios mensuales por defecto', () => {
    render(<Products />);

    // Verificamos precios mensuales
    expect(screen.getByText('$1,200')).toBeInTheDocument();
    expect(screen.getByText('$3,500')).toBeInTheDocument();
    expect(screen.getByText('$1,800')).toBeInTheDocument();

    // No debe haber badge de "20% OFF" o "Ahorra 20%" activo por defecto
    expect(screen.queryByText(/Ahorra 20%/)).not.toBeInTheDocument();
    expect(screen.queryByText(/facturado al año/)).not.toBeInTheDocument();
  });

  it('debe aplicar descuento del 20% e indicar cobro anual al activar el toggle', () => {
    render(<Products />);

    const toggle = screen.getByRole('checkbox', { name: /facturación anual/i });

    // Cambiamos a facturación anual
    fireEvent.click(toggle);

    // Debe mostrarse el badge de ahorro
    expect(screen.getAllByText(/Ahorra 20%/i).length).toBeGreaterThan(0);

    // Los precios deben cambiar aplicando el 20% de descuento
    // Web Starter: 1200 * 0.8 = 960
    expect(screen.getByText('$960')).toBeInTheDocument();
    // Custom App: 3500 * 0.8 = 2800
    expect(screen.getByText('$2,800')).toBeInTheDocument();
    // Cyber Audit: 1800 * 0.8 = 1440
    expect(screen.getByText('$1,440')).toBeInTheDocument();

    // Debe mostrar la etiqueta de cobro anual
    expect(screen.getByText(/facturado al año: \$11,520/i)).toBeInTheDocument();
    expect(screen.getByText(/facturado al año: \$33,600/i)).toBeInTheDocument();
    expect(screen.getByText(/facturado al año: \$17,280/i)).toBeInTheDocument();
  });

  it('debe retornar a precios mensuales al desactivar el toggle', () => {
    render(<Products />);

    const toggle = screen.getByRole('checkbox', { name: /facturación anual/i });

    // Activar y luego desactivar
    fireEvent.click(toggle);
    fireEvent.click(toggle);

    // Precios mensuales originales
    expect(screen.getByText('$1,200')).toBeInTheDocument();
    expect(screen.getByText('$3,500')).toBeInTheDocument();
    expect(screen.getByText('$1,800')).toBeInTheDocument();

    expect(screen.queryByText(/Ahorra 20%/)).not.toBeInTheDocument();
    expect(screen.queryByText(/facturado al año/)).not.toBeInTheDocument();
  });
});
