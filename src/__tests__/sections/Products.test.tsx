import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Products } from '@/components/sections/Products';
import { es } from '@/i18n/dictionaries/es';

describe('Products Component', () => {
  beforeEach(() => {
    document.body.className = '';
    vi.useFakeTimers();
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

  it('debe abrir el Focus Modal al hacer clic en "Ver Alcance y Detalles" y cerrarlo con el botón de cierre', () => {
    render(<Products dict={es} />);

    const openModalBtn = screen.getByRole('button', { name: /Ver Alcance y Detalles/i });
    fireEvent.click(openModalBtn);

    expect(screen.getByText(es.products.modal.description)).toBeInTheDocument();
    expect(document.body.classList.contains('modal-open')).toBe(true);

    const closeModalBtn = screen.getByRole('button', { name: /Cerrar modal/i });
    fireEvent.click(closeModalBtn);

    expect(screen.queryByText(es.products.modal.description)).not.toBeInTheDocument();
    expect(document.body.classList.contains('modal-open')).toBe(false);
  });

  it('debe cerrar el modal al hacer clic en el backdrop de fondo', () => {
    const { container } = render(<Products dict={es} />);

    fireEvent.click(screen.getByRole('button', { name: /Ver Alcance y Detalles/i }));
    expect(screen.getByText(es.products.modal.description)).toBeInTheDocument();

    const backdrop = container.querySelector('.fixed.inset-0 > .absolute.inset-0');
    expect(backdrop).toBeInTheDocument();

    fireEvent.click(backdrop!);
    expect(screen.queryByText(es.products.modal.description)).not.toBeInTheDocument();
  });

  it('debe cambiar entre pestañas móviles (INCLUYE, BAJO COTIZACIÓN, PROCESO) dentro del modal', () => {
    render(<Products dict={es} />);

    fireEvent.click(screen.getByRole('button', { name: /Ver Alcance y Detalles/i }));

    const includesTab = screen.getByRole('button', { name: /^INCLUYE$/i });
    const excludesTab = screen.getByRole('button', { name: /^BAJO COTIZACIÓN$/i });
    const processTab = screen.getByRole('button', { name: /^PROCESO$/i });

    fireEvent.click(excludesTab);
    expect(excludesTab.className).toContain('border-sky-400');

    fireEvent.click(processTab);
    expect(processTab.className).toContain('border-sky-400');

    fireEvent.click(includesTab);
    expect(includesTab.className).toContain('border-emerald-400');
  });

  it('debe disparar el evento custom "select-service" y realizar scroll-smooth al hacer clic en el CTA del modal', () => {
    render(<Products dict={es} />);

    const scrollIntoViewMock = vi.fn();
    const contactDiv = document.createElement('div');
    contactDiv.id = 'contacto';
    contactDiv.scrollIntoView = scrollIntoViewMock;
    document.body.appendChild(contactDiv);

    const customEventSpy = vi.fn();
    window.addEventListener('select-service', customEventSpy);

    fireEvent.click(screen.getByRole('button', { name: /Ver Alcance y Detalles/i }));

    const modalCtaBtn = screen.getByRole('button', {
      name: new RegExp(es.products.modal.ctaText, 'i'),
    });
    fireEvent.click(modalCtaBtn);

    expect(customEventSpy).toHaveBeenCalled();
    const dispatchedEvent = customEventSpy.mock.calls[0][0] as CustomEvent;
    expect(dispatchedEvent.detail).toBe('starterkit');

    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: 'smooth' });

    document.body.removeChild(contactDiv);
    window.removeEventListener('select-service', customEventSpy);
  });
});
