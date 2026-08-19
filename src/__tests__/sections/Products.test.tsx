import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Products } from '@/components/sections/Products';
import { es } from '@/i18n/dictionaries/es';
import { en } from '@/i18n/dictionaries/en';

describe('Products Component (100% Coverage Suite)', () => {
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

  it('debe abrir el Modal Informativo y permitir cambiar entre las pestañas móviles (Incluye / Exclusiones / Proceso)', () => {
    render(<Products dict={es} />);

    const openModalBtn = screen.getByRole('button', { name: /Ver Alcance y Detalles/i });
    fireEvent.click(openModalBtn);

    // Default tab: includes
    expect(screen.getAllByText(es.products.modal.includesTitle).length).toBeGreaterThan(0);

    // Switch to excludes tab
    const excludesTabBtn = screen.getByRole('button', {
      name: new RegExp(es.products.modal.tabs.excludes, 'i'),
    });
    fireEvent.click(excludesTabBtn);
    expect(screen.getAllByText(es.products.modal.excludesTitle).length).toBeGreaterThan(0);

    // Switch to process tab
    const processTabBtn = screen.getByRole('button', {
      name: new RegExp(es.products.modal.tabs.process, 'i'),
    });
    fireEvent.click(processTabBtn);
    expect(screen.getAllByText(es.products.modal.processTitle).length).toBeGreaterThan(0);

    // Switch back to includes tab
    const includesTabBtn = screen.getByRole('button', {
      name: new RegExp(es.products.modal.tabs.includes, 'i'),
    });
    fireEvent.click(includesTabBtn);
    expect(screen.getAllByText(es.products.modal.includesTitle).length).toBeGreaterThan(0);
  });

  it('debe pasar al Wizard al pulsar el CTA del footer del modal y cerrarlo', () => {
    render(<Products dict={es} />);

    fireEvent.click(screen.getByRole('button', { name: /Ver Alcance y Detalles/i }));

    const ctaWizardBtn = screen.getByRole('button', {
      name: new RegExp(`${es.products.modal.ctaText}`, 'i'),
    });
    fireEvent.click(ctaWizardBtn);

    expect(screen.getByText(/Paso 1: Información de Contacto/i)).toBeInTheDocument();

    const closeModalBtn = screen.getByRole('button', { name: /Cerrar modal/i });
    fireEvent.click(closeModalBtn);

    expect(screen.queryByText(/Paso 1: Información de Contacto/i)).not.toBeInTheDocument();
    expect(document.body.classList.contains('modal-open')).toBe(false);
  });

  it('debe abrir el modal en modo Onboarding y permitir cerrarlo desde el wizard', () => {
    render(<Products dict={es} />);

    fireEvent.click(screen.getByRole('button', { name: /Ver Alcance y Detalles/i }));

    const ctaWizardBtn = screen.getByRole('button', {
      name: new RegExp(`${es.products.modal.ctaText}`, 'i'),
    });
    fireEvent.click(ctaWizardBtn);

    expect(screen.getByText(/Paso 1: Información de Contacto/i)).toBeInTheDocument();

    // Click link inside wizard which calls onClose on the modal
    const authLink = screen.getByRole('button', {
      name: /¿Ya eres cliente de Dreamtek\? Inicia sesión aquí/i,
    });
    fireEvent.click(authLink);

    expect(screen.queryByText(/Paso 1: Información de Contacto/i)).not.toBeInTheDocument();
  });

  it('debe alternar la facturación anual dentro de la sección principal y actualizar precios', () => {
    render(<Products dict={es} />);

    const sectionToggle = screen.getByRole('checkbox', { name: 'Facturación anual' });
    expect(sectionToggle).not.toBeChecked();

    // Toggle on (annual)
    fireEvent.click(sectionToggle);
    expect(sectionToggle).toBeChecked();
    expect(screen.getAllByText(es.products.save).length).toBeGreaterThan(0);

    // Toggle off (monthly)
    fireEvent.click(sectionToggle);
    expect(sectionToggle).not.toBeChecked();
  });

  it('debe alternar la facturación anual dentro del modal y permitir regresar de onboarding a info', () => {
    render(<Products dict={es} />);

    // Open modal in info mode
    fireEvent.click(screen.getByRole('button', { name: /Ver Alcance y Detalles/i }));

    // Toggle annual switch inside modal headerAction
    const modalAnnualToggle = screen.getByRole('checkbox', { name: /facturación anual modal/i });
    fireEvent.click(modalAnnualToggle);
    expect(screen.getAllByText(es.products.save).length).toBeGreaterThan(0);

    // Switch to onboarding wizard mode
    const ctaWizardBtn = screen.getByRole('button', {
      name: new RegExp(`${es.products.modal.ctaText}`, 'i'),
    });
    fireEvent.click(ctaWizardBtn);
    expect(screen.getByText(/Paso 1: Información de Contacto/i)).toBeInTheDocument();

    // Click return to info button in header
    const returnToInfoBtn = screen.getByRole('button', { name: /VOLVER A ALCANCE Y DETALLES/i });
    fireEvent.click(returnToInfoBtn);

    expect(screen.getAllByText(es.products.modal.includesTitle).length).toBeGreaterThan(0);
  });

  it('debe soportar la renderización en inglés y taxNote fallback en modal anual', () => {
    render(<Products dict={en} lang="en" />);
    expect(screen.getByText(en.products.subtitle)).toBeInTheDocument();

    // Open modal in english and toggle annual to test modal taxNote
    fireEvent.click(screen.getByRole('button', { name: /View Scope & Details/i }));
    const modalToggle = screen.getByRole('checkbox', { name: /facturación anual modal/i });
    fireEvent.click(modalToggle);
    expect(screen.getByText(en.products.modal.annualTaxNote)).toBeInTheDocument();
  });

  it('debe renderizar badge de plan, variante featured y fallback de taxNote cuando annualTaxNote no existe', () => {
    const customDict = {
      ...es,
      products: {
        ...es.products,
        plans: es.products.plans.map((p, idx) => ({
          ...p,
          badge: idx === 0 ? 'DESTACADO' : '',
          featured: idx === 0 || idx === 1 ? true : false,
        })),
        modal: {
          ...es.products.modal,
          annualTaxNote: undefined,
        },
      },
    };

    render(<Products dict={customDict as unknown as typeof es} />);
    expect(screen.getByText('DESTACADO')).toBeInTheDocument();

    // Open modal and toggle annual with annualTaxNote undefined
    fireEvent.click(screen.getByRole('button', { name: /Ver Alcance y Detalles/i }));
    const modalToggle = screen.getByRole('checkbox', { name: /facturación anual modal/i });
    fireEvent.click(modalToggle);
    expect(screen.getByText(es.products.modal.taxNote)).toBeInTheDocument();
  });
});
