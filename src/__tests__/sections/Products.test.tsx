import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Products } from '@/components/sections/Products';
import { es } from '@/i18n/dictionaries/es';

describe('Products Component with Onboarding Wizard', () => {
  beforeEach(() => {
    document.body.className = '';
    vi.restoreAllMocks();
  });

  it('se debe renderizar la seccion de productos y mostrar los planes primarios', () => {
    render(<Products dict={es} />);

    expect(screen.getByText(/Planes y/i)).toBeInTheDocument();
    expect(screen.getByText(/Productos/i)).toBeInTheDocument();
    expect(screen.getByText(es.products.subtitle)).toBeInTheDocument();

    es.products.plans.forEach((plan) => {
      expect(screen.getByText(plan.title)).toBeInTheDocument();
      expect(screen.getByText(plan.description)).toBeInTheDocument();
    });
  });

  it('debe abrir el Modal Informativo al hacer clic en "Ver Alcance y Detalles" y pasar al Onboarding Wizard al pulsar el CTA', () => {
    render(<Products dict={es} />);

    const openModalBtn = screen.getByRole('button', { name: /Ver Alcance y Detalles/i });
    fireEvent.click(openModalBtn);

    // Debe mostrar la vista informativa original
    expect(screen.getAllByText(es.products.modal.includesTitle).length).toBeGreaterThan(0);
    expect(document.body.classList.contains('modal-open')).toBe(true);

    // Al hacer clic en el botón del footer "Iniciar mi Posicionamiento Web", pasa al Wizard (Paso 1)
    const ctaWizardBtn = screen.getByRole('button', { name: new RegExp(`${es.products.modal.ctaText}`, 'i') });
    fireEvent.click(ctaWizardBtn);

    expect(screen.getByText(/Paso 1: Información de Contacto/i)).toBeInTheDocument();

    const closeModalBtn = screen.getByRole('button', { name: /Cerrar modal/i });
    fireEvent.click(closeModalBtn);

    expect(screen.queryByText(/Paso 1: Información de Contacto/i)).not.toBeInTheDocument();
    expect(document.body.classList.contains('modal-open')).toBe(false);
  });

  it('debe cerrar el modal al hacer clic en el backdrop de fondo', () => {
    const { container } = render(<Products dict={es} />);

    fireEvent.click(screen.getByRole('button', { name: /Ver Alcance y Detalles/i }));
    expect(screen.getAllByText(es.products.modal.includesTitle).length).toBeGreaterThan(0);

    const backdrop = container.querySelector('.fixed.inset-0 > .absolute.inset-0');
    expect(backdrop).toBeInTheDocument();

    fireEvent.click(backdrop!);
    expect(screen.queryByText(es.products.modal.includesTitle)).not.toBeInTheDocument();
  });
});
