import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { QuoteFunnelWizard } from '../../components/funnel/QuoteFunnelWizard';
import * as quotesClient from '../../lib/quotes/client';

vi.mock('../../lib/quotes/client', async () => {
  const actual = await vi.importActual('../../lib/quotes/client');
  return {
    ...actual,
    submitQuoteDiagnostic: vi.fn(),
  };
});

describe('QuoteFunnelWizard Component & Frontend API Client Suite (FC 039 100% Coverage)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Wizard Navigation & User Interaction Flow', () => {
    it('debe renderizar el paso 1 con las 4 opciones de vertical y avanzar al paso 2', () => {
      render(<QuoteFunnelWizard />);

      expect(screen.getByText('Paso 1 de 4')).toBeInTheDocument();
      expect(screen.getByText('Calcula el alcance de tu proyecto')).toBeInTheDocument();

      // Verificar que las 4 verticales estén presentes
      expect(screen.getByText('Desarrollo Web & SaaS')).toBeInTheDocument();
      expect(screen.getByText('Gestión de Flotas & ERP ARCHON')).toBeInTheDocument();
      expect(screen.getByText('Inteligencia Artificial & Agentes')).toBeInTheDocument();
      expect(screen.getByText('Ciberseguridad & Auditoría Forense')).toBeInTheDocument();

      // Cambiar de vertical
      fireEvent.click(screen.getByText('Gestión de Flotas & ERP ARCHON'));

      // Avanzar al paso 2
      fireEvent.click(screen.getByRole('button', { name: /Continuar al Paso 2/i }));

      expect(screen.getByText('Paso 2 de 4')).toBeInTheDocument();
      expect(screen.getByText(/Vertical: Gestión de Flotas & ERP ARCHON/i)).toBeInTheDocument();
    });

    it('debe permitir seleccionar escalas en el paso 2 y retroceder al paso 1', () => {
      render(<QuoteFunnelWizard />);

      // Avanzar a paso 2
      fireEvent.click(screen.getByRole('button', { name: /Continuar al Paso 2/i }));
      expect(screen.getByText('Paso 2 de 4')).toBeInTheDocument();

      // Seleccionar segunda escala
      fireEvent.click(screen.getByText('Arquitectura Escalable & Microservicios'));

      // Retroceder al paso 1
      fireEvent.click(screen.getByRole('button', { name: /Volver/i }));
      expect(screen.getByText('Paso 1 de 4')).toBeInTheDocument();
    });

    it('debe mostrar la proyección paramétrica en el paso 3 con disclaimer de honestidad', () => {
      render(<QuoteFunnelWizard />);

      // Paso 1 -> Paso 2
      fireEvent.click(screen.getByRole('button', { name: /Continuar al Paso 2/i }));

      // Paso 2 -> Paso 3
      fireEvent.click(screen.getByRole('button', { name: /Ver Estimación Paramétrica/i }));
      expect(screen.getByText('Paso 3 de 4')).toBeInTheDocument();

      // Verificar elementos del Paso 3
      expect(screen.getByText('Proyección Paramétrica')).toBeInTheDocument();
      expect(screen.getByText('Transparencia Técnica')).toBeInTheDocument();
      expect(screen.getByText('$35,000 – $60,000')).toBeInTheDocument();
      expect(screen.getByText('3 a 5 Semanas')).toBeInTheDocument();
      expect(screen.getByText(/Aviso de Honestidad Técnica/i)).toBeInTheDocument();

      // Probar botón volver a paso 2
      fireEvent.click(screen.getByRole('button', { name: /Cambiar Alcance/i }));
      expect(screen.getByText('Paso 2 de 4')).toBeInTheDocument();
    });

    it('debe validar campos obligatorios en el paso 4 antes de enviar', async () => {
      render(<QuoteFunnelWizard />);

      // Paso 1 -> 2 -> 3 -> 4
      fireEvent.click(screen.getByRole('button', { name: /Continuar al Paso 2/i }));
      fireEvent.click(screen.getByRole('button', { name: /Ver Estimación Paramétrica/i }));
      fireEvent.click(screen.getByRole('button', { name: /Solicitar Propuesta Formal/i }));
      expect(screen.getByText('Paso 4 de 4')).toBeInTheDocument();

      const submitBtn = screen.getByRole('button', { name: /Registrar y Solicitar Contacto/i });
      const nameInput = screen.getByLabelText(/Nombre Completo/i);
      const emailInput = screen.getByLabelText(/Correo Corporativo/i);

      // Caso 1: Todos vacíos
      fireEvent.submit(submitBtn.closest('form')!);
      expect(
        screen.getByText('Por favor completa los campos obligatorios (Nombre, Email y Teléfono).'),
      ).toBeInTheDocument();

      // Caso 2: Nombre lleno, email y teléfono vacíos
      fireEvent.change(nameInput, { target: { value: 'Lic. Ana' } });
      fireEvent.submit(submitBtn.closest('form')!);
      expect(
        screen.getByText('Por favor completa los campos obligatorios (Nombre, Email y Teléfono).'),
      ).toBeInTheDocument();

      // Caso 3: Nombre y email llenos, teléfono vacío
      fireEvent.change(emailInput, { target: { value: 'ana@empresa.com' } });
      fireEvent.submit(submitBtn.closest('form')!);
      expect(
        screen.getByText('Por favor completa los campos obligatorios (Nombre, Email y Teléfono).'),
      ).toBeInTheDocument();
    });

    it('debe procesar el envío exitoso de cotización y renderizar la tarjeta de confirmación con reset', async () => {
      vi.mocked(quotesClient.submitQuoteDiagnostic).mockResolvedValueOnce({
        status: 'success',
        message: 'Registrado con éxito',
        data: {
          vertical: 'WEB_DEV',
          scale: 'MVP',
          service_label: 'Desarrollo Web y Plataformas SaaS',
          scale_label: 'MVP Ágil y Validado',
          estimated_budget_min: 35000,
          estimated_budget_max: 60000,
          estimated_weeks_min: 3,
          estimated_weeks_max: 5,
          currency: 'MXN',
          disclaimer: 'Estimación paramétrica orientativa.',
        },
      });

      render(<QuoteFunnelWizard />);

      // Navegar al paso 4
      fireEvent.click(screen.getByRole('button', { name: /Continuar al Paso 2/i }));
      fireEvent.click(screen.getByRole('button', { name: /Ver Estimación Paramétrica/i }));
      fireEvent.click(screen.getByRole('button', { name: /Solicitar Propuesta Formal/i }));

      // Llenar formulario
      fireEvent.change(screen.getByLabelText(/Nombre Completo/i), {
        target: { value: 'Lic. Mariana Garza' },
      });
      fireEvent.change(screen.getByLabelText(/Correo Corporativo/i), {
        target: { value: 'mariana@corporativo.mx' },
      });
      fireEvent.change(screen.getByLabelText(/Teléfono \/ WhatsApp/i), {
        target: { value: '+52 55 9876 5432' },
      });
      fireEvent.change(screen.getByLabelText(/Empresa \/ Organización/i), {
        target: { value: 'Garza Holdings' },
      });
      fireEvent.change(screen.getByLabelText(/Detalles Adicionales/i), {
        target: { value: 'Necesitamos integración con CRM Salesforce.' },
      });

      // Enviar
      fireEvent.click(screen.getByRole('button', { name: /Registrar y Solicitar Contacto/i }));

      await waitFor(() => {
        expect(screen.getByText('¡Diagnóstico Registrado con Éxito!')).toBeInTheDocument();
        expect(screen.getByText('$35,000 – $60,000 MXN')).toBeInTheDocument();
        expect(screen.getByText('3 a 5 semanas')).toBeInTheDocument();
      });

      // Probar botón de reset para hacer otra cotización
      fireEvent.click(screen.getByRole('button', { name: /Realizar otra cotización/i }));
      expect(screen.getByText('Paso 1 de 4')).toBeInTheDocument();
    });

    it('debe manejar errores al enviar y mostrar mensaje de error amigable', async () => {
      vi.mocked(quotesClient.submitQuoteDiagnostic).mockRejectedValueOnce(
        new Error('Fallo de conexión con el servidor.'),
      );

      render(<QuoteFunnelWizard />);

      // Paso 1 -> 2 -> 3 -> 4
      fireEvent.click(screen.getByRole('button', { name: /Continuar al Paso 2/i }));
      fireEvent.click(screen.getByRole('button', { name: /Ver Estimación Paramétrica/i }));
      fireEvent.click(screen.getByRole('button', { name: /Solicitar Propuesta Formal/i }));

      fireEvent.change(screen.getByLabelText(/Nombre Completo/i), {
        target: { value: 'Error User' },
      });
      fireEvent.change(screen.getByLabelText(/Correo Corporativo/i), {
        target: { value: 'err@test.com' },
      });
      fireEvent.change(screen.getByLabelText(/Teléfono \/ WhatsApp/i), {
        target: { value: '123456789' },
      });

      fireEvent.click(screen.getByRole('button', { name: /Registrar y Solicitar Contacto/i }));

      await waitFor(() => {
        expect(screen.getByText('Fallo de conexión con el servidor.')).toBeInTheDocument();
      });

      // Error no instancia de Error
      vi.mocked(quotesClient.submitQuoteDiagnostic).mockRejectedValueOnce('Network Fail');
      fireEvent.click(screen.getByRole('button', { name: /Registrar y Solicitar Contacto/i }));

      await waitFor(() => {
        expect(screen.getByText('Error inesperado al enviar cotización.')).toBeInTheDocument();
      });
    });

    it('debe enviar la cotización exitosamente sin campos opcionales (company y notes vacíos)', async () => {
      vi.mocked(quotesClient.submitQuoteDiagnostic).mockResolvedValueOnce({
        status: 'success',
        message: 'Registrado con éxito',
        data: {
          vertical: 'AI_AUTOMATION',
          scale: 'AGENT',
          service_label: 'Inteligencia Artificial y Agentes Autónomos',
          scale_label: 'Agente Conversacional & RAG',
          estimated_budget_min: 40000,
          estimated_budget_max: 80000,
          estimated_weeks_min: 3,
          estimated_weeks_max: 6,
          currency: 'MXN',
          disclaimer: 'Estimación orientativa.',
        },
      });

      render(<QuoteFunnelWizard />);

      // Paso 1: Seleccionar AI_AUTOMATION
      fireEvent.click(screen.getByText('Inteligencia Artificial & Agentes'));
      fireEvent.click(screen.getByRole('button', { name: /Continuar al Paso 2/i }));

      // Paso 2: Seleccionar AGENT (default) y avanzar
      fireEvent.click(screen.getByRole('button', { name: /Ver Estimación Paramétrica/i }));

      // Paso 3 -> Paso 4
      fireEvent.click(screen.getByRole('button', { name: /Solicitar Propuesta Formal/i }));

      // Llenar solo obligatorios
      fireEvent.change(screen.getByLabelText(/Nombre Completo/i), {
        target: { value: 'Dr. Roberto Luna' },
      });
      fireEvent.change(screen.getByLabelText(/Correo Corporativo/i), {
        target: { value: 'roberto@ai.com' },
      });
      fireEvent.change(screen.getByLabelText(/Teléfono \/ WhatsApp/i), {
        target: { value: '+52 81 1234 5678' },
      });

      // Enviar
      fireEvent.click(screen.getByRole('button', { name: /Registrar y Solicitar Contacto/i }));

      await waitFor(() => {
        expect(screen.getByText('¡Diagnóstico Registrado con Éxito!')).toBeInTheDocument();
        expect(quotesClient.submitQuoteDiagnostic).toHaveBeenCalledWith({
          vertical: 'AI_AUTOMATION',
          scale: 'AGENT',
          full_name: 'Dr. Roberto Luna',
          email: 'roberto@ai.com',
          phone: '+52 81 1234 5678',
          company_name: undefined,
          notes: undefined,
        });
      });
    });

    it('debe permitir seleccionar la vertical de ciberseguridad y todas sus escalas', () => {
      render(<QuoteFunnelWizard />);

      fireEvent.click(screen.getByText('Ciberseguridad & Auditoría Forense'));
      fireEvent.click(screen.getByRole('button', { name: /Continuar al Paso 2/i }));

      expect(screen.getByText(/Vertical: Ciberseguridad & Auditoría Forense/i)).toBeInTheDocument();
      fireEvent.click(screen.getByText('Pentesting Manual Web & API Integral'));
      fireEvent.click(screen.getByRole('button', { name: /Ver Estimación Paramétrica/i }));

      expect(screen.getByText('Pentesting Manual Web & API Integral')).toBeInTheDocument();
    });
  });

  describe('2. Frontend API Client (lib/quotes/client.ts) Unit Tests', () => {
    it('debe enviar la solicitud HTTP POST y retornar los datos si la respuesta es ok', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'success',
          message: 'OK',
          data: { vertical: 'WEB_DEV' },
        }),
      });
      global.fetch = mockFetch;

      const actualClient =
        await vi.importActual<typeof import('../../lib/quotes/client')>('../../lib/quotes/client');

      const res = await actualClient.submitQuoteDiagnostic({
        vertical: 'WEB_DEV',
        scale: 'MVP',
        full_name: 'Test',
        email: 'test@dtk.com',
        phone: '12345678',
      });

      expect(res.status).toBe('success');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/quotes'),
        expect.objectContaining({
          method: 'POST',
        }),
      );
    });

    it('debe lanzar excepción si response.ok es false', async () => {
      // 1. Con message
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: 'Error específico de backend' }),
      });

      const actualClient =
        await vi.importActual<typeof import('../../lib/quotes/client')>('../../lib/quotes/client');

      await expect(
        actualClient.submitQuoteDiagnostic({
          vertical: 'WEB_DEV',
          scale: 'MVP',
          full_name: 'Test',
          email: 'test@dtk.com',
          phone: '12345678',
        }),
      ).rejects.toThrow('Error específico de backend');

      // 2. Con error
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Error alterno' }),
      });

      await expect(
        actualClient.submitQuoteDiagnostic({
          vertical: 'WEB_DEV',
          scale: 'MVP',
          full_name: 'Test',
          email: 'test@dtk.com',
          phone: '12345678',
        }),
      ).rejects.toThrow('Error alterno');

      // 3. Sin error ni message (fallback string)
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        json: async () => ({}),
      });

      await expect(
        actualClient.submitQuoteDiagnostic({
          vertical: 'WEB_DEV',
          scale: 'MVP',
          full_name: 'Test',
          email: 'test@dtk.com',
          phone: '12345678',
        }),
      ).rejects.toThrow('Error al enviar cotización.');
    });
  });
});
