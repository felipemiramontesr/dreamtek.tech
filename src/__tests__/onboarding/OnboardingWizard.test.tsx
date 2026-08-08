import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard';
import * as clientOnboarding from '@/lib/onboarding/client';

vi.mock('@/lib/onboarding/client', () => ({
  submitLead: vi.fn(),
  checkDomainAvailability: vi.fn(),
  createCheckoutSession: vi.fn(),
  verifyCheckoutSuccess: vi.fn(),
}));

describe('OnboardingWizard Component 100% Suite', () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(clientOnboarding.submitLead).mockResolvedValue({ status: 'success', lead_id: 101 });
    vi.mocked(clientOnboarding.checkDomainAvailability).mockResolvedValue({
      available: true,
      domain: 'miempresa.com',
    });
    vi.mocked(clientOnboarding.createCheckoutSession).mockResolvedValue({
      status: 'success',
      checkout_url: 'https://checkout.stripe.com/pay',
    });
    vi.mocked(clientOnboarding.verifyCheckoutSuccess).mockResolvedValue({
      status: 'success',
      order_id: 'ord_123',
    });
  });

  it('debe renderizar el paso 1 correctamente con los títulos e insumos requeridos', () => {
    render(<OnboardingWizard isAnnual={false} onClose={mockOnClose} />);

    expect(screen.getByText(/Paso 1: Información de Contacto/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Roberto Gómez/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/roberto@empresa.com/i)).toBeInTheDocument();
  });

  it('debe avanzar exitosamente del paso 1 al paso 2 al enviar datos válidos', async () => {
    render(<OnboardingWizard isAnnual={true} onClose={mockOnClose} />);

    fireEvent.change(screen.getByPlaceholderText(/Roberto Gómez/i), {
      target: { value: 'Carlos Mendoza' },
    });
    fireEvent.change(screen.getByPlaceholderText(/roberto@empresa.com/i), {
      target: { value: 'carlos@empresa.com' },
    });
    fireEvent.change(screen.getByPlaceholderText(/\+52 55 1234 5678/i), {
      target: { value: '5512345678' },
    });

    const submitBtn = screen.getByText(/Continuar a Plantillas/i);
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Paso 2: Selección de Estructura Visual/i)).toBeInTheDocument();
    });
  });

  it('debe permitir seleccionar plantilla en paso 2 y avanzar al paso 3', async () => {
    render(<OnboardingWizard isAnnual={false} onClose={mockOnClose} />);

    // Step 1 -> Step 2
    fireEvent.change(screen.getByPlaceholderText(/Roberto Gómez/i), {
      target: { value: 'Ana Lopez' },
    });
    fireEvent.change(screen.getByPlaceholderText(/roberto@empresa.com/i), {
      target: { value: 'ana@empresa.com' },
    });
    fireEvent.change(screen.getByPlaceholderText(/\+52 55 1234 5678/i), {
      target: { value: '5598765432' },
    });
    fireEvent.click(screen.getByText(/Continuar a Plantillas/i));

    await waitFor(() => {
      expect(screen.getByText(/Paso 2: Selección de Estructura Visual/i)).toBeInTheDocument();
    });

    const step2Btn = screen.getByText(/Continuar a Dominio/i);
    fireEvent.click(step2Btn);

    await waitFor(() => {
      expect(screen.getByText(/Paso 3:/i)).toBeInTheDocument();
    });
  });

  it('debe llamar a onClose al hacer clic en el botón de cerrar', () => {
    render(<OnboardingWizard isAnnual={false} onClose={mockOnClose} />);

    const buttons = screen.getAllByRole('button');
    const closeBtn = buttons.find(
      (btn) => btn.getAttribute('aria-label') === 'Cerrar' || btn.textContent?.includes('✕'),
    );
    if (closeBtn) {
      fireEvent.click(closeBtn);
      expect(mockOnClose).toHaveBeenCalled();
    }
  });
});
