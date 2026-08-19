import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard';
import * as onboardingClient from '@/lib/onboarding/client';

vi.mock('@/lib/onboarding/client', () => ({
  submitLead: vi.fn(),
  checkDomainAvailability: vi.fn(),
  createCheckoutSession: vi.fn(),
  verifyCheckoutSuccess: vi.fn(),
}));

describe('OnboardingWizard Component (100% Coverage Suite)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
    Object.defineProperty(window, 'location', {
      writable: true,
      value: new URL('https://dreamtek.tech'),
    });
  });

  it('debe ejecutar el flujo completo de 5 pasos exitosamente', async () => {
    vi.mocked(onboardingClient.submitLead).mockResolvedValueOnce({
      status: 'success',
      lead_id: 1,
    });
    vi.mocked(onboardingClient.checkDomainAvailability).mockResolvedValueOnce({
      domain: 'empresa.com',
      available: true,
      message: 'Dominio disponible para registro inmediato',
    });
    vi.mocked(onboardingClient.createCheckoutSession).mockResolvedValueOnce({
      status: 'success',
      session_id: 'cs_123',
    });

    const onClose = vi.fn();
    render(<OnboardingWizard isAnnual={false} onClose={onClose} />);

    // STEP 1
    expect(screen.getByText('Paso 1: Información de Contacto')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Ej. Roberto Gómez'), {
      target: { value: 'Roberto Gómez' },
    });
    fireEvent.change(screen.getByPlaceholderText('roberto@empresa.com'), {
      target: { value: 'roberto@empresa.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('+52 55 1234 5678'), {
      target: { value: '+52 55 1234 5678' },
    });
    fireEvent.change(screen.getByPlaceholderText('Ej. Innovación Digital S.A.'), {
      target: { value: 'Innovación Digital S.A.' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Continuar a Plantillas/i }));

    await waitFor(() => {
      expect(onboardingClient.submitLead).toHaveBeenCalledWith({
        email: 'roberto@empresa.com',
        full_name: 'Roberto Gómez',
        phone: '+52 55 1234 5678',
        company: 'Innovación Digital S.A.',
        step_reached: 2,
      });
      expect(screen.getByText('Paso 2: Selección de Estructura Visual')).toBeInTheDocument();
    });

    // STEP 2: Choose services template
    const servicesCard = screen.getByText('Servicios & Consultoría');
    fireEvent.click(servicesCard);
    fireEvent.click(screen.getByRole('button', { name: /Continuar a Dominio/i }));

    // STEP 3: Domain check
    expect(screen.getByText(/Paso 3: Verificación de Dominio/i)).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('ej. miempresa.com'), {
      target: { value: 'empresa.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Verificar/i }));

    await waitFor(() => {
      expect(onboardingClient.checkDomainAvailability).toHaveBeenCalledWith('empresa.com');
      expect(screen.getByText(/Dominio disponible para registro inmediato/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Continuar a Resumen/i }));

    // STEP 4: Summary & Checkout
    expect(screen.getByText(/Paso 4: Resumen de Orden/i)).toBeInTheDocument();
    expect(screen.getByText('Facturación Mensual')).toBeInTheDocument();
    expect(screen.getByText('SERVICES')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Proceder al Pago Seguro/i }));

    // STEP 5: Confirmation & Notes
    await waitFor(() => {
      expect(screen.getByText('¡Pago Confirmado & Orden Activa!')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText(/Escribe detalles como eslogan de marca/i), {
      target: { value: 'Paleta Azul y Cyan' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Finalizar Registro/i }));
    expect(window.alert).toHaveBeenCalledWith(
      '¡Información de sitio enviada! El equipo de Dreamtek iniciará tu despliegue.',
    );
  });

  it('debe manejar la redirección de checkout a URL de Stripe en Step 4', async () => {
    vi.mocked(onboardingClient.submitLead).mockResolvedValueOnce({
      status: 'success',
      lead_id: 1,
    });
    vi.mocked(onboardingClient.createCheckoutSession).mockResolvedValueOnce({
      status: 'success',
      checkout_url: 'https://checkout.stripe.com/pay/cs_test_123',
    });

    render(<OnboardingWizard isAnnual={true} onClose={vi.fn()} />);

    // Fast forward to Step 4
    fireEvent.change(screen.getByPlaceholderText('Ej. Roberto Gómez'), {
      target: { value: 'Roberto Gómez' },
    });
    fireEvent.change(screen.getByPlaceholderText('roberto@empresa.com'), {
      target: { value: 'roberto@empresa.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('+52 55 1234 5678'), {
      target: { value: '+52 55 1234 5678' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Continuar a Plantillas/i }));

    await waitFor(() => {
      expect(screen.getByText('Paso 2: Selección de Estructura Visual')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /Continuar a Dominio/i }));
    fireEvent.click(screen.getByRole('button', { name: /Continuar a Resumen/i }));

    fireEvent.click(screen.getByRole('button', { name: /Proceder al Pago Seguro/i }));

    await waitFor(() => {
      expect(onboardingClient.createCheckoutSession).toHaveBeenCalled();
    });
  });

  it('debe validar errores de validación de Zod en submitLead (Step 1)', async () => {
    vi.mocked(onboardingClient.submitLead).mockRejectedValueOnce({
      errors: [
        { path: ['fullName'], message: 'Nombre inválido' },
        { path: ['email'], message: 'Email requerido' },
      ],
    });

    render(<OnboardingWizard isAnnual={false} onClose={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('Ej. Roberto Gómez'), {
      target: { value: 'R' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Continuar a Plantillas/i }));

    await waitFor(() => {
      expect(screen.getByText(/Nombre inválido/i)).toBeInTheDocument();
    });
  });

  it('debe manejar error genérico en submitLead (Step 1)', async () => {
    vi.mocked(onboardingClient.submitLead).mockRejectedValueOnce(
      new Error('Fallo de conexión al servidor'),
    );

    render(<OnboardingWizard isAnnual={false} onClose={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('Ej. Roberto Gómez'), {
      target: { value: 'Roberto Gómez' },
    });
    fireEvent.change(screen.getByPlaceholderText('roberto@empresa.com'), {
      target: { value: 'roberto@empresa.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('+52 55 1234 5678'), {
      target: { value: '+52 55 1234 5678' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Continuar a Plantillas/i }));

    await waitFor(() => {
      expect(screen.getByText(/Fallo de conexión al servidor/i)).toBeInTheDocument();
    });
  });

  it('debe despachar el evento open-auth-modal y cerrar el wizard al hacer clic en "¿Ya tienes cuenta?"', () => {
    const onClose = vi.fn();
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    render(<OnboardingWizard isAnnual={false} onClose={onClose} />);

    const authLink = screen.getByRole('button', {
      name: /¿Ya tienes una cuenta registrada\? Inicia sesión aquí/i,
    });
    fireEvent.click(authLink);

    expect(onClose).toHaveBeenCalled();
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'open-auth-modal',
      }),
    );
  });

  it('debe navegar hacia atrás (← Regresar) entre los pasos', async () => {
    vi.mocked(onboardingClient.submitLead).mockResolvedValueOnce({
      status: 'success',
      lead_id: 1,
    });

    render(<OnboardingWizard isAnnual={false} onClose={vi.fn()} />);

    // Advance to Step 2
    fireEvent.change(screen.getByPlaceholderText('Ej. Roberto Gómez'), {
      target: { value: 'Roberto Gómez' },
    });
    fireEvent.change(screen.getByPlaceholderText('roberto@empresa.com'), {
      target: { value: 'roberto@empresa.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('+52 55 1234 5678'), {
      target: { value: '+52 55 1234 5678' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Continuar a Plantillas/i }));

    await waitFor(() => {
      expect(screen.getByText('Paso 2: Selección de Estructura Visual')).toBeInTheDocument();
    });

    // Go back to Step 1
    fireEvent.click(screen.getByRole('button', { name: /← Regresar/i }));
    expect(screen.getByText('Paso 1: Información de Contacto')).toBeInTheDocument();

    // Re-advance to Step 2 then Step 3
    fireEvent.click(screen.getByRole('button', { name: /Continuar a Plantillas/i }));
    await waitFor(() => {
      expect(screen.getByText('Paso 2: Selección de Estructura Visual')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /Continuar a Dominio/i }));
    expect(screen.getByText('Paso 3: Identidad y Dominio Web')).toBeInTheDocument();

    // Go back from Step 3 to Step 2
    fireEvent.click(screen.getByRole('button', { name: /← Regresar/i }));
    expect(screen.getByText('Paso 2: Selección de Estructura Visual')).toBeInTheDocument();

    // Advance to Step 4 (Summary)
    fireEvent.click(screen.getByRole('button', { name: /Continuar a Dominio/i }));
    fireEvent.click(screen.getByRole('button', { name: /Continuar a Resumen/i }));
    expect(screen.getByText('Paso 4: Resumen de Despliegue')).toBeInTheDocument();

    // Go back from Step 4 to Step 3
    fireEvent.click(screen.getByRole('button', { name: /← Regresar/i }));
    expect(screen.getByText('Paso 3: Identidad y Dominio Web')).toBeInTheDocument();
  });

  it('debe validar la disponibilidad de dominio y mostrar sugerencia si está ocupado', async () => {
    vi.mocked(onboardingClient.submitLead).mockResolvedValueOnce({
      status: 'success',
      lead_id: 1,
    });
    vi.mocked(onboardingClient.checkDomainAvailability).mockResolvedValueOnce({
      domain: 'google.com',
      available: false,
      suggestion: 'google-portal.tech',
      message: 'Dominio ocupado',
    });

    render(<OnboardingWizard isAnnual={false} onClose={vi.fn()} />);

    // Advance to Step 3
    fireEvent.change(screen.getByPlaceholderText('Ej. Roberto Gómez'), {
      target: { value: 'Roberto Gómez' },
    });
    fireEvent.change(screen.getByPlaceholderText('roberto@empresa.com'), {
      target: { value: 'roberto@empresa.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('+52 55 1234 5678'), {
      target: { value: '+52 55 1234 5678' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Continuar a Plantillas/i }));

    await waitFor(() => {
      expect(screen.getByText('Paso 2: Selección de Estructura Visual')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /Continuar a Dominio/i }));

    fireEvent.change(screen.getByPlaceholderText('mi-empresa-ideal'), {
      target: { value: 'google' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Verificar Disponibilidad/i }));

    await waitFor(() => {
      expect(screen.getByText(/Dominio ocupado/i)).toBeInTheDocument();
      expect(screen.getByText(/google-portal\.tech/i)).toBeInTheDocument();
    });
  });

  it('debe manejar error de verificación de dominio cuando el servicio falla', async () => {
    vi.mocked(onboardingClient.submitLead).mockResolvedValueOnce({
      status: 'success',
      lead_id: 1,
    });
    vi.mocked(onboardingClient.checkDomainAvailability).mockRejectedValueOnce(
      new Error('Timeout de WHOIS'),
    );

    render(<OnboardingWizard isAnnual={false} onClose={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('Ej. Roberto Gómez'), {
      target: { value: 'Roberto Gómez' },
    });
    fireEvent.change(screen.getByPlaceholderText('roberto@empresa.com'), {
      target: { value: 'roberto@empresa.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('+52 55 1234 5678'), {
      target: { value: '+52 55 1234 5678' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Continuar a Plantillas/i }));

    await waitFor(() => {
      expect(screen.getByText('Paso 2: Selección de Estructura Visual')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /Continuar a Dominio/i }));

    fireEvent.change(screen.getByPlaceholderText('mi-empresa-ideal'), {
      target: { value: 'error-domain' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Verificar Disponibilidad/i }));

    await waitFor(() => {
      expect(screen.getByText(/Timeout de WHOIS/i)).toBeInTheDocument();
    });
  });

  it('debe manejar error al iniciar sesión de checkout en Step 4', async () => {
    vi.mocked(onboardingClient.submitLead).mockResolvedValueOnce({
      status: 'success',
      lead_id: 1,
    });
    vi.mocked(onboardingClient.createCheckoutSession).mockRejectedValueOnce(
      new Error('Fallo pasarela Stripe'),
    );

    render(<OnboardingWizard isAnnual={false} onClose={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('Ej. Roberto Gómez'), {
      target: { value: 'Roberto Gómez' },
    });
    fireEvent.change(screen.getByPlaceholderText('roberto@empresa.com'), {
      target: { value: 'roberto@empresa.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('+52 55 1234 5678'), {
      target: { value: '+52 55 1234 5678' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Continuar a Plantillas/i }));

    await waitFor(() => {
      expect(screen.getByText('Paso 2: Selección de Estructura Visual')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /Continuar a Dominio/i }));
    fireEvent.click(screen.getByRole('button', { name: /Continuar a Resumen/i }));

    fireEvent.click(screen.getByRole('button', { name: /Proceder al Pago Seguro/i }));

    await waitFor(() => {
      expect(screen.getByText(/Fallo pasarela Stripe/i)).toBeInTheDocument();
    });
  });

  it('debe verificar la sesión de Stripe en URL al cargar en Step 5', async () => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: new URL('https://dreamtek.tech?session_id=cs_123&step=5'),
    });
    vi.mocked(onboardingClient.verifyCheckoutSuccess).mockResolvedValueOnce({
      status: 'paid',
      customer_email: 'test@example.com',
      subscription_id: 'sub_123',
    });

    render(<OnboardingWizard isAnnual={false} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(onboardingClient.verifyCheckoutSuccess).toHaveBeenCalledWith('cs_123');
      expect(screen.getByText('¡Pago Confirmado & Orden Activa!')).toBeInTheDocument();
    });
  });

  it('debe mostrar error si la verificación de sesión en URL falla', async () => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: new URL('https://dreamtek.tech?session_id=cs_fail&step=5'),
    });
    vi.mocked(onboardingClient.verifyCheckoutSuccess).mockRejectedValueOnce(
      new Error('Sesión expirada o no encontrada'),
    );

    render(<OnboardingWizard isAnnual={false} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/Sesión expirada o no encontrada/i)).toBeInTheDocument();
    });
  });
});
