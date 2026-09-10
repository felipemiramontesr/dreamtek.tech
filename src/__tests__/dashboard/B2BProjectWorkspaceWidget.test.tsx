import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { B2BProjectWorkspaceWidget } from '@/components/dashboard/client/B2BProjectWorkspaceWidget';
import * as authClient from '@/lib/auth/client';
import type { ClientProject, ClientProjectBriefing } from '@/lib/auth/client';

vi.mock('@/lib/auth/client', async () => {
  const actual = await vi.importActual<typeof authClient>('@/lib/auth/client');
  return {
    ...actual,
    updateClientProjectBriefing: vi.fn(),
    signOffClientMilestone: vi.fn(),
    createProjectSettlementSession: vi.fn(),
    getClientProjectHandover: vi.fn(),
    revealProjectHandoverCredentials: vi.fn(),
    getProjectSettlementCertificate: vi.fn(),
  };
});

describe('B2BProjectWorkspaceWidget Component Suite (FC 044 100% Coverage)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('debe renderizar estado vacío cuando no hay proyectos B2B', () => {
    render(<B2BProjectWorkspaceWidget projects={[]} />);
    expect(screen.getByText('Proyectos B2B & Workspace de Desarrollo')).toBeInTheDocument();
    expect(
      screen.getByText('No cuentas con proyectos corporativos activos en este momento.'),
    ).toBeInTheDocument();
  });

  it('debe renderizar los detalles del proyecto, balances read-only y enlaces de despliegue', () => {
    const mockProjects: ClientProject[] = [
      {
        id: 1,
        tenant_id: 10,
        user_id: 42,
        project_name: 'Plataforma B2B Logistics',
        vertical: 'saas_platform',
        status: 'IN_DEVELOPMENT',
        currency: 'USD',
        budget_cents: 1000000,
        paid_amount_cents: 600000,
        pending_balance_cents: 400000,
        estimated_weeks: 8,
        staging_url: 'https://staging.logistics.dreamtek.tech',
        repository_url: 'https://github.com/dreamtek/logistics-b2b',
        milestones: [
          {
            id: 101,
            project_id: 1,
            milestone_index: 1,
            title: 'Arquitectura Técnica',
            description: 'Diseño inicial',
            target_week: 2,
            status: 'COMPLETED',
            completed_at: '2026-09-01T12:00:00Z',
          },
          {
            id: 102,
            project_id: 1,
            milestone_index: 2,
            title: 'Core Backend',
            description: 'Modelado de DB',
            target_week: 4,
            status: 'IN_PROGRESS',
          },
          {
            id: 103,
            project_id: 1,
            milestone_index: 3,
            title: 'Frontend Web',
            description: 'UI responsive',
            target_week: 6,
            status: 'REVIEW',
          },
          {
            id: 104,
            project_id: 1,
            milestone_index: 4,
            title: 'QA & Producción',
            description: 'Auditoría',
            target_week: 8,
            status: 'PENDING',
          },
        ],
        created_at: '2026-09-01',
        updated_at: '2026-09-01',
      },
    ];

    render(<B2BProjectWorkspaceWidget projects={mockProjects} />);

    expect(screen.getByText('Plataforma B2B Logistics')).toBeInTheDocument();
    expect(screen.getByText('SAAS_PLATFORM')).toBeInTheDocument();
    expect(screen.getByText('Fase: En Desarrollo Activo')).toBeInTheDocument();
    expect(screen.getByText('25%')).toBeInTheDocument();

    // Balances
    expect(screen.getByText('$6,000 USD')).toBeInTheDocument();
    expect(screen.getByText('$4,000 USD')).toBeInTheDocument();
    expect(screen.getByText('PAGADO')).toBeInTheDocument();

    // URLs
    expect(screen.getByText('Abrir Staging')).toBeInTheDocument();
    expect(screen.getByText('Ver Repositorio')).toBeInTheDocument();

    // Hitos
    expect(screen.getByText('Arquitectura Técnica')).toBeInTheDocument();
    expect(screen.getByText('✓ Completado')).toBeInTheDocument();
    expect(screen.getByText('Core Backend')).toBeInTheDocument();
    expect(screen.getByText('● En Progreso')).toBeInTheDocument();
    expect(screen.getByText('Frontend Web')).toBeInTheDocument();
    expect(screen.getByText('Revisión')).toBeInTheDocument();
    expect(screen.getByText('QA & Producción')).toBeInTheDocument();
    expect(screen.getByText('Pendiente')).toBeInTheDocument();
  });

  it('debe renderizar placeholders cuando las URLs no están configuradas y diferentes estados de fase', () => {
    const mockProjects: ClientProject[] = [
      {
        id: 2,
        tenant_id: 11,
        user_id: 43,
        project_name: 'App Móvil iOS',
        vertical: 'mobile_app',
        status: 'ONBOARDING_BRIEF',
        currency: 'MXN',
        budget_cents: 8000000,
        paid_amount_cents: 4000000,
        pending_balance_cents: 4000000,
        estimated_weeks: 4,
        progress_percent: 50,
        briefing_data: null,
        created_at: '2026-09-01',
        updated_at: '2026-09-01',
      },
      {
        id: 3,
        tenant_id: 12,
        user_id: 44,
        project_name: 'Portal Arquitectura',
        vertical: 'custom_dev',
        status: 'ARCHITECTURE_DESIGN',
        currency: 'USD',
        budget_cents: 400000,
        paid_amount_cents: 200000,
        pending_balance_cents: 200000,
        estimated_weeks: 4,
        created_at: '2026-09-01',
        updated_at: '2026-09-01',
      },
      {
        id: 4,
        tenant_id: 13,
        user_id: 45,
        project_name: 'Portal Staging',
        vertical: 'custom_dev',
        status: 'STAGING_REVIEW',
        currency: 'USD',
        budget_cents: 400000,
        paid_amount_cents: 400000,
        pending_balance_cents: 0,
        estimated_weeks: 4,
        created_at: '2026-09-01',
        updated_at: '2026-09-01',
      },
      {
        id: 5,
        tenant_id: 14,
        user_id: 46,
        project_name: 'Portal Entregado',
        vertical: 'custom_dev',
        status: 'COMPLETED_DELIVERED',
        currency: 'USD',
        budget_cents: 400000,
        paid_amount_cents: 400000,
        pending_balance_cents: 0,
        estimated_weeks: 4,
        created_at: '2026-09-01',
        updated_at: '2026-09-01',
      },
      {
        id: 6,
        tenant_id: 15,
        user_id: 47,
        project_name: 'Portal Pausado',
        vertical: 'custom_dev',
        status: 'ON_HOLD',
        currency: 'USD',
        budget_cents: 400000,
        paid_amount_cents: 200000,
        pending_balance_cents: 200000,
        estimated_weeks: 4,
        created_at: '2026-09-01',
        updated_at: '2026-09-01',
      },
      {
        id: 7,
        tenant_id: 16,
        user_id: 48,
        project_name: 'Portal Otro Estado',
        vertical: 'custom_dev',
        status: 'UNKNOWN_STATUS' as unknown as ClientProject['status'],
        currency: 'USD',
        budget_cents: 400000,
        paid_amount_cents: 200000,
        pending_balance_cents: 200000,
        estimated_weeks: 4,
        created_at: '2026-09-01',
        updated_at: '2026-09-01',
      },
    ];

    render(<B2BProjectWorkspaceWidget projects={mockProjects} />);

    expect(screen.getByText('Fase: Briefing Inicial')).toBeInTheDocument();
    expect(screen.getByText('Fase: Arquitectura & Diseño')).toBeInTheDocument();
    expect(screen.getByText('Fase: Revisión en Staging')).toBeInTheDocument();
    expect(screen.getByText('Fase: Completado & Entregado')).toBeInTheDocument();
    expect(screen.getByText('Fase: En Pausa')).toBeInTheDocument();
    expect(screen.getByText('UNKNOWN_STATUS')).toBeInTheDocument();
    expect(
      screen.getAllByText('En configuración por el equipo técnico durante la fase de integración.')
        .length,
    ).toBeGreaterThan(0);
  });

  it('debe abrir modal de briefing, validar inputs y enviar actualización exitosa', async () => {
    const handleUpdate = vi.fn();
    const mockProjects: ClientProject[] = [
      {
        id: 10,
        tenant_id: 1,
        user_id: 42,
        project_name: 'Proyecto Fintech',
        vertical: 'saas_platform',
        status: 'ONBOARDING_BRIEF',
        currency: 'USD',
        budget_cents: 500000,
        paid_amount_cents: 250000,
        pending_balance_cents: 250000,
        estimated_weeks: 4,
        briefing_data: {
          business_goals: 'Objetivos existentes',
          target_audience: 'B2B',
          technical_stack_preferences: 'Next.js',
          infrastructure_notes: 'AWS',
          reference_urls: ['https://dreamtek.tech'],
          contact_lead_notes: 'Nota existente',
        },
        created_at: '2026-09-01',
        updated_at: '2026-09-01',
      },
    ];

    render(<B2BProjectWorkspaceWidget projects={mockProjects} onProjectUpdated={handleUpdate} />);

    // Abrir modal con "Actualizar Briefing"
    const openBtn = screen.getByRole('button', { name: 'Actualizar Briefing' });
    fireEvent.click(openBtn);

    // Intentar enviar con objetivos menores a 5 caracteres
    const goalsInput = screen.getByDisplayValue('Objetivos existentes');
    fireEvent.change(goalsInput, { target: { value: '123' } });

    const submitBtn = screen.getByRole('button', { name: 'Guardar Briefing' });
    fireEvent.click(submitBtn);

    expect(
      screen.getByText('Los objetivos del proyecto deben tener al menos 5 caracteres.'),
    ).toBeInTheDocument();

    // Restaurar objetivos válidos
    fireEvent.change(goalsInput, {
      target: { value: 'Objetivos comerciales válidos y detallados' },
    });

    // Cambiar otros campos del formulario
    const audienceInput = screen.getByPlaceholderText(/e.g. Clientes B2B/);
    fireEvent.change(audienceInput, { target: { value: 'Usuarios corporativos' } });

    const stackInput = screen.getByPlaceholderText(/e.g. Next.js, Node.js/);
    fireEvent.change(stackInput, { target: { value: 'React, Vite, Node' } });

    const infraInput = screen.getByPlaceholderText(/e.g. Servidor actual/);
    fireEvent.change(infraInput, { target: { value: 'Docker en VPS' } });

    const contactInput = screen.getByPlaceholderText(/Disponibilidad horaria/);
    fireEvent.change(contactInput, { target: { value: 'Lunes a viernes 9 a 18h' } });

    // Intentar enviar con URL que no es https
    const urlTextarea = screen.getByPlaceholderText(/https:\/\/figma\.com/);
    fireEvent.change(urlTextarea, { target: { value: 'http://insecure-link.com' } });

    fireEvent.click(submitBtn);

    expect(screen.getByText(/debe comenzar estrictamente con https:\/\//)).toBeInTheDocument();

    // Corregir URL a https
    fireEvent.change(urlTextarea, { target: { value: 'https://secure-figma.com/design' } });

    vi.mocked(authClient.updateClientProjectBriefing).mockResolvedValueOnce({
      status: 'success',
      message: 'OK',
      briefing: {} as unknown as ClientProjectBriefing,
      status_updated: 'ARCHITECTURE_DESIGN',
    });

    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(authClient.updateClientProjectBriefing).toHaveBeenCalledWith(
        10,
        expect.objectContaining({
          business_goals: 'Objetivos comerciales válidos y detallados',
          target_audience: 'Usuarios corporativos',
          technical_stack_preferences: 'React, Vite, Node',
          infrastructure_notes: 'Docker en VPS',
          contact_lead_notes: 'Lunes a viernes 9 a 18h',
          reference_urls: ['https://secure-figma.com/design'],
        }),
      );
    });

    expect(
      screen.getByText('Briefing técnico enviado y registrado con éxito.'),
    ).toBeInTheDocument();

    await waitFor(
      () => {
        expect(handleUpdate).toHaveBeenCalledTimes(1);
      },
      { timeout: 3000 },
    );
  });

  it('debe manejar errores al enviar briefing y permitir cancelar modal', async () => {
    const mockProjects: ClientProject[] = [
      {
        id: 15,
        tenant_id: 1,
        user_id: 42,
        project_name: 'App Pendiente',
        vertical: 'mobile_app',
        status: 'ONBOARDING_BRIEF',
        currency: 'USD',
        budget_cents: 500000,
        paid_amount_cents: 250000,
        pending_balance_cents: 250000,
        estimated_weeks: 4,
        briefing_data: null,
        created_at: '2026-09-01',
        updated_at: '2026-09-01',
      },
    ];

    render(<B2BProjectWorkspaceWidget projects={mockProjects} />);

    const openBtn = screen.getByRole('button', { name: 'Completar Briefing' });
    fireEvent.click(openBtn);

    // Cancelar modal
    const cancelBtn = screen.getByRole('button', { name: 'Cancelar' });
    fireEvent.click(cancelBtn);
    expect(screen.queryByText('Briefing Técnico del Proyecto')).not.toBeInTheDocument();

    // Reabrir y simular error en backend
    fireEvent.click(screen.getByRole('button', { name: 'Completar Briefing' }));

    const goalsTextarea = screen.getByPlaceholderText(/Describe qué problema resuelve/);
    fireEvent.change(goalsTextarea, {
      target: { value: 'Objetivos de negocio detallados para el desarrollo' },
    });

    vi.mocked(authClient.updateClientProjectBriefing).mockRejectedValueOnce(
      new Error('Fallo de conexión en servidor'),
    );

    const submitBtn = screen.getByRole('button', { name: 'Guardar Briefing' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText('Fallo de conexión en servidor')).toBeInTheDocument();
    });

    // Cerrar con la X
    const closeX = screen.getByText('✕');
    fireEvent.click(closeX);
    expect(screen.queryByText('Briefing Técnico del Proyecto')).not.toBeInTheDocument();
  });

  it('debe ejecutar onProjectUpdated tras guardar briefing con éxito y manejar errores no-Error', async () => {
    const onUpdatedMock = vi.fn();
    const mockProjects: ClientProject[] = [
      {
        id: 20,
        tenant_id: 1,
        user_id: 42,
        project_name: 'App Callback Test',
        vertical: 'custom_dev',
        status: 'ONBOARDING_BRIEF',
        currency: 'USD',
        budget_cents: 100000,
        paid_amount_cents: 50000,
        pending_balance_cents: 50000,
        estimated_weeks: 4,
        briefing_data: null,
        created_at: '2026-09-01',
        updated_at: '2026-09-01',
      },
    ];

    render(<B2BProjectWorkspaceWidget projects={mockProjects} onProjectUpdated={onUpdatedMock} />);

    // Proyecto sin milestones debe tener progreso 0%
    expect(screen.getByText('0%')).toBeInTheDocument();

    const openBtn = screen.getByRole('button', { name: 'Completar Briefing' });
    fireEvent.click(openBtn);

    const goalsTextarea = screen.getByPlaceholderText(/Describe qué problema resuelve/);
    fireEvent.change(goalsTextarea, {
      target: { value: 'Objetivos para el test de callback de briefing' },
    });

    // Simular error no-Error (string)
    vi.mocked(authClient.updateClientProjectBriefing).mockRejectedValueOnce(
      'Error no instancia de Error',
    );

    const submitBtn = screen.getByRole('button', { name: 'Guardar Briefing' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText('Error al guardar el briefing técnico.')).toBeInTheDocument();
    });

    // Ahora simular éxito
    vi.mocked(authClient.updateClientProjectBriefing).mockResolvedValueOnce({
      status: 'success',
      message: 'OK',
      briefing: {} as unknown as ClientProjectBriefing,
      status_updated: 'ARCHITECTURE_DESIGN',
    });

    fireEvent.click(submitBtn);

    await waitFor(
      () => {
        expect(onUpdatedMock).toHaveBeenCalled();
      },
      { timeout: 3000 },
    );
  });

  it('debe cerrar modal sin error tras briefing exitoso cuando onProjectUpdated no está definido', async () => {
    const mockProjects: ClientProject[] = [
      {
        id: 25,
        tenant_id: 1,
        user_id: 42,
        project_name: 'App Sin Callback',
        vertical: 'custom_dev',
        status: 'ONBOARDING_BRIEF',
        currency: 'USD',
        budget_cents: 100000,
        paid_amount_cents: 50000,
        pending_balance_cents: 50000,
        estimated_weeks: 4,
        briefing_data: null,
        created_at: '2026-09-01',
        updated_at: '2026-09-01',
      },
    ];

    // Sin prop onProjectUpdated
    render(<B2BProjectWorkspaceWidget projects={mockProjects} />);

    fireEvent.click(screen.getByRole('button', { name: 'Completar Briefing' }));
    const goalsTextarea = screen.getByPlaceholderText(/Describe qué problema resuelve/);
    fireEvent.change(goalsTextarea, { target: { value: 'Objetivos para el test sin callback' } });

    vi.mocked(authClient.updateClientProjectBriefing).mockResolvedValueOnce({
      status: 'success',
      message: 'OK',
      briefing: {} as unknown as ClientProjectBriefing,
      status_updated: 'ARCHITECTURE_DESIGN',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Guardar Briefing' }));

    await waitFor(
      () => {
        expect(screen.queryByText('Briefing Técnico del Proyecto')).not.toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  });

  describe('FC 045: Milestone Sign-Off & Final Settlement Suite', () => {
    it('debe abrir modal de visto bueno (Sign-Off), validar checkbox obligatorio y enviar aprobación exitosa', async () => {
      const handleUpdate = vi.fn();
      const mockProjects: ClientProject[] = [
        {
          id: 50,
          tenant_id: 1,
          user_id: 42,
          project_name: 'Proyecto SignOff Test',
          vertical: 'custom_dev',
          status: 'IN_DEVELOPMENT',
          currency: 'USD',
          budget_cents: 1000000,
          paid_amount_cents: 500000,
          pending_balance_cents: 500000,
          estimated_weeks: 4,
          milestones: [
            {
              id: 501,
              project_id: 50,
              milestone_index: 1,
              title: 'Hito en Revisión',
              description: 'Entregables del sprint 1 listos en staging',
              target_week: 2,
              status: 'REVIEW',
            },
          ],
          created_at: '2026-09-01',
          updated_at: '2026-09-01',
        },
      ];

      render(<B2BProjectWorkspaceWidget projects={mockProjects} onProjectUpdated={handleUpdate} />);

      // Botón "Revisar & Aprobar" presente
      const reviewBtn = screen.getByRole('button', { name: 'Revisar & Aprobar' });
      fireEvent.click(reviewBtn);

      expect(screen.getByText('Visto Bueno & Sign-Off Formal')).toBeInTheDocument();
      expect(screen.getByText('Alcance del Entregable')).toBeInTheDocument();
      expect(
        screen.getAllByText('Entregables del sprint 1 listos en staging').length,
      ).toBeGreaterThanOrEqual(1);

      // Botón enviar deshabilitado hasta marcar checkbox
      const submitBtn = screen.getByRole('button', { name: 'Aprobar Hito Formalmente' });
      expect(submitBtn).toBeDisabled();

      // Forzar click en form sin checkbox
      const checkbox = screen.getByLabelText(
        /Confirmo haber revisado y validado a entera satisfacción técnica/,
      );
      expect(checkbox).not.toBeChecked();

      // Marcar checkbox
      fireEvent.click(checkbox);
      expect(checkbox).toBeChecked();
      expect(submitBtn).not.toBeDisabled();

      // Añadir feedback opcional
      const feedbackInput = screen.getByPlaceholderText(/e.g. Aprobado conforme a la demo/);
      fireEvent.change(feedbackInput, {
        target: { value: 'Todo conforme y probado en staging.' },
      });

      vi.mocked(authClient.signOffClientMilestone).mockResolvedValueOnce({
        status: 'success',
        message: 'Hito aprobado',
        milestone: {
          id: 501,
          project_id: 50,
          milestone_index: 1,
          title: 'Hito en Revisión',
          status: 'COMPLETED',
          client_approved_at: '2026-09-08T12:00:00Z',
          client_feedback: 'Todo conforme y probado en staging.',
        },
      });

      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(authClient.signOffClientMilestone).toHaveBeenCalledWith(50, 501, {
          accepted: true,
          feedback: 'Todo conforme y probado en staging.',
        });
      });

      expect(
        screen.getByText('Hito aprobado formalmente con éxito. Registro de auditoría asentado.'),
      ).toBeInTheDocument();

      await waitFor(
        () => {
          expect(handleUpdate).toHaveBeenCalledTimes(1);
        },
        { timeout: 3000 },
      );
    });

    it('debe manejar errores y cancelación en modal de visto bueno (Sign-Off)', async () => {
      const mockProjects: ClientProject[] = [
        {
          id: 55,
          tenant_id: 1,
          user_id: 42,
          project_name: 'Proyecto Error SignOff',
          vertical: 'custom_dev',
          status: 'IN_DEVELOPMENT',
          currency: 'USD',
          budget_cents: 1000000,
          paid_amount_cents: 500000,
          pending_balance_cents: 500000,
          estimated_weeks: 4,
          milestones: [
            {
              id: 551,
              project_id: 55,
              milestone_index: 1,
              title: 'Hito en Progreso con Sign-Off',
              status: 'IN_PROGRESS',
            },
          ],
          created_at: '2026-09-01',
          updated_at: '2026-09-01',
        },
      ];

      render(<B2BProjectWorkspaceWidget projects={mockProjects} />);

      // Abrir modal
      fireEvent.click(screen.getByRole('button', { name: 'Revisar & Aprobar' }));
      expect(screen.getByText('Visto Bueno & Sign-Off Formal')).toBeInTheDocument();

      // Cancelar con botón "Cancelar"
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
      expect(screen.queryByText('Visto Bueno & Sign-Off Formal')).not.toBeInTheDocument();

      // Reabrir modal
      fireEvent.click(screen.getByRole('button', { name: 'Revisar & Aprobar' }));

      // Cerrar con "✕"
      const closeButtons = screen.getAllByText('✕');
      fireEvent.click(closeButtons[0]);
      expect(screen.queryByText('Visto Bueno & Sign-Off Formal')).not.toBeInTheDocument();

      // Reabrir modal
      fireEvent.click(screen.getByRole('button', { name: 'Revisar & Aprobar' }));

      // Intentar enviar sin marcar el checkbox obligatorio (líneas 147-148)
      const signOffForm = screen
        .getByRole('button', { name: 'Aprobar Hito Formalmente' })
        .closest('form')!;
      fireEvent.submit(signOffForm);
      expect(
        screen.getByText('Debes confirmar y aceptar formalmente los entregables para proceder.'),
      ).toBeInTheDocument();

      // Ahora marcar el checkbox y simular error estándar
      const checkbox = screen.getByLabelText(/Confirmo haber revisado y validado/);
      fireEvent.click(checkbox);

      vi.mocked(authClient.signOffClientMilestone).mockRejectedValueOnce(
        new Error('Hito ya completado previamente (C-045.2)'),
      );

      fireEvent.click(screen.getByRole('button', { name: 'Aprobar Hito Formalmente' }));

      await waitFor(() => {
        expect(screen.getByText('Hito ya completado previamente (C-045.2)')).toBeInTheDocument();
      });

      // Simular error no-Error (string)
      vi.mocked(authClient.signOffClientMilestone).mockRejectedValueOnce('Error de red plano');

      fireEvent.click(screen.getByRole('button', { name: 'Aprobar Hito Formalmente' }));

      await waitFor(() => {
        expect(screen.getByText('Error al registrar el visto bueno del hito.')).toBeInTheDocument();
      });
    });

    it('debe renderizar badge de hito aprobado con feedback y fecha', () => {
      const mockProjects: ClientProject[] = [
        {
          id: 60,
          tenant_id: 1,
          user_id: 42,
          project_name: 'Proyecto Aprobado',
          vertical: 'custom_dev',
          status: 'IN_DEVELOPMENT',
          currency: 'USD',
          budget_cents: 1000000,
          paid_amount_cents: 500000,
          pending_balance_cents: 500000,
          estimated_weeks: 4,
          milestones: [
            {
              id: 601,
              project_id: 60,
              milestone_index: 1,
              title: 'Hito Aprobado Previamente',
              status: 'COMPLETED',
              completed_at: '2026-09-05T00:00:00Z',
              client_approved_at: '2026-09-05T10:00:00Z',
              client_feedback: 'Aprobado excelente calidad de código',
            },
          ],
          created_at: '2026-09-01',
          updated_at: '2026-09-01',
        },
      ];

      render(<B2BProjectWorkspaceWidget projects={mockProjects} />);

      expect(screen.getByText(/✓ Visto Bueno Cliente:/)).toBeInTheDocument();
      expect(screen.getByText('“Aprobado excelente calidad de código”')).toBeInTheDocument();
      // No debe haber botón de revisar en hito completado y aprobado
      expect(screen.queryByRole('button', { name: 'Revisar & Aprobar' })).not.toBeInTheDocument();
    });

    it('debe renderizar banner de liquidación de finiquito y redirigir a Stripe Checkout al pulsar botón', async () => {
      const originalLocation = window.location;
      delete (window as unknown as { location?: unknown }).location;
      window.location = { ...originalLocation, href: '' } as unknown as Location;

      const mockProjects: ClientProject[] = [
        {
          id: 70,
          tenant_id: 1,
          user_id: 42,
          project_name: 'Proyecto Finiquito',
          vertical: 'saas_platform',
          status: 'SETTLEMENT_PENDING',
          currency: 'USD',
          budget_cents: 2000000,
          paid_amount_cents: 1000000,
          pending_balance_cents: 1000000,
          estimated_weeks: 6,
          milestones: [
            {
              id: 701,
              project_id: 70,
              milestone_index: 1,
              title: 'Entrega Final',
              status: 'COMPLETED',
            },
          ],
          created_at: '2026-09-01',
          updated_at: '2026-09-01',
        },
      ];

      render(<B2BProjectWorkspaceWidget projects={mockProjects} />);

      expect(screen.getByText('Liquidación Final & Finiquito de Entrega')).toBeInTheDocument();
      expect(screen.getByText('Fase: Finiquito Pendiente')).toBeInTheDocument();

      const settleBtn = screen.getByRole('button', {
        name: 'Liquidar Saldo en Stripe (Finiquito)',
      });

      vi.mocked(authClient.createProjectSettlementSession).mockResolvedValueOnce({
        status: 'success',
        checkout_url: 'https://checkout.stripe.com/pay/cs_test_settlement_123',
        session_id: 'cs_test_settlement_123',
        amount_cents: 1000000,
        currency: 'USD',
      });

      fireEvent.click(settleBtn);

      await waitFor(() => {
        expect(authClient.createProjectSettlementSession).toHaveBeenCalledWith(70);
        expect(window.location.href).toBe('https://checkout.stripe.com/pay/cs_test_settlement_123');
      });

      window.location = originalLocation;
    });

    it('debe manejar errores en la pasarela de liquidación final (sin url y excepción)', async () => {
      const mockProjects: ClientProject[] = [
        {
          id: 75,
          tenant_id: 1,
          user_id: 42,
          project_name: 'Proyecto Error Settle',
          vertical: 'saas_platform',
          status: 'IN_DEVELOPMENT',
          currency: 'USD',
          budget_cents: 2000000,
          paid_amount_cents: 1000000,
          pending_balance_cents: 1000000,
          estimated_weeks: 6,
          milestones: [
            {
              id: 751,
              project_id: 75,
              milestone_index: 1,
              title: 'Hito Completado',
              status: 'COMPLETED',
            },
          ],
          created_at: '2026-09-01',
          updated_at: '2026-09-01',
        },
      ];

      render(<B2BProjectWorkspaceWidget projects={mockProjects} />);

      const settleBtn = screen.getByRole('button', {
        name: 'Liquidar Saldo en Stripe (Finiquito)',
      });

      // Caso 1: respuesta sin URL
      vi.mocked(authClient.createProjectSettlementSession).mockResolvedValueOnce({
        status: 'success',
        checkout_url: '',
        session_id: 'cs_test_settlement_124',
        amount_cents: 1000000,
        currency: 'USD',
      });

      fireEvent.click(settleBtn);

      await waitFor(() => {
        expect(
          screen.getByText('No se recibió la URL de la pasarela de pago.'),
        ).toBeInTheDocument();
      });

      // Caso 2: excepción en backend
      vi.mocked(authClient.createProjectSettlementSession).mockRejectedValueOnce(
        new Error('Stripe API Timeout'),
      );

      fireEvent.click(settleBtn);

      await waitFor(() => {
        expect(screen.getByText('Stripe API Timeout')).toBeInTheDocument();
      });

      // Caso 3: excepción no-Error (string)
      vi.mocked(authClient.createProjectSettlementSession).mockRejectedValueOnce(
        'Error desconocido',
      );

      fireEvent.click(settleBtn);

      await waitFor(() => {
        expect(screen.getByText('Error al iniciar la pasarela de finiquito.')).toBeInTheDocument();
      });
    });

    it('debe renderizar banner de proyecto entregado cuando status es COMPLETED_DELIVERED y saldo 0', () => {
      const mockProjects: ClientProject[] = [
        {
          id: 80,
          tenant_id: 1,
          user_id: 42,
          project_name: 'Proyecto Entregado Formalmente',
          vertical: 'saas_platform',
          status: 'COMPLETED_DELIVERED',
          currency: 'USD',
          budget_cents: 2000000,
          paid_amount_cents: 2000000,
          pending_balance_cents: 0,
          estimated_weeks: 6,
          milestones: [
            {
              id: 801,
              project_id: 80,
              milestone_index: 1,
              title: 'Hito 1',
              status: 'COMPLETED',
            },
          ],
          created_at: '2026-09-01',
          updated_at: '2026-09-01',
        },
      ];

      render(<B2BProjectWorkspaceWidget projects={mockProjects} />);

      expect(
        screen.getByText('Proyecto Entregado & Finiquito Liquidado al 100%'),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          'Garantías y código entregados formalmente a conformidad del cliente. Balance en cero.',
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /Abrir Bóveda de Entrega & Finiquito/i }),
      ).toBeInTheDocument();
    });

    it('debe abrir la Bóveda de Entrega, consultar getClientProjectHandover y renderizar enlaces, notas y constancia de finiquito', async () => {
      const mockProject: ClientProject = {
        id: 90,
        tenant_id: 1,
        user_id: 42,
        project_name: 'Plataforma B2B Finiquitada',
        vertical: 'saas_platform',
        status: 'COMPLETED_DELIVERED',
        currency: 'USD',
        budget_cents: 1000000,
        paid_amount_cents: 1000000,
        pending_balance_cents: 0,
        estimated_weeks: 4,
        created_at: '2026-09-01',
        updated_at: '2026-09-01',
      };

      vi.mocked(authClient.getClientProjectHandover).mockResolvedValueOnce({
        status: 'success',
        handover: {
          project_id: 90,
          repository_url: 'https://github.com/dreamtek/repo-90',
          deployment_url: 'https://prod-90.dreamtek.tech',
          documentation_url: 'https://docs-90.dreamtek.tech',
          handover_notes: 'Notas clave del despliegue en AWS',
          certificate_sha256: 'a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890',
          has_credentials: true,
          downloaded_at: null,
          download_count: 0,
        },
      });

      render(<B2BProjectWorkspaceWidget projects={[mockProject]} />);

      const openVaultBtn = screen.getByRole('button', {
        name: /Abrir Bóveda de Entrega & Finiquito/i,
      });
      fireEvent.click(openVaultBtn);

      expect(authClient.getClientProjectHandover).toHaveBeenCalledWith(90);

      await waitFor(() => {
        expect(screen.getByText('Bóveda Segura de Entrega & Finiquito')).toBeInTheDocument();
        expect(screen.getByText('Abrir Repositorio ↗')).toBeInTheDocument();
        expect(screen.getByText('Ver Despliegue ↗')).toBeInTheDocument();
        expect(screen.getByText('Guía & Manual ↗')).toBeInTheDocument();
        expect(screen.getByText('Notas clave del despliegue en AWS')).toBeInTheDocument();
        expect(
          screen.getByText('a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890'),
        ).toBeInTheDocument();
        expect(screen.getByText('Descargas: 0')).toBeInTheDocument();
      });

      // Cerrar con botón de cerrar
      const closeBtn = screen.getByRole('button', { name: /Cerrar Bóveda/i });
      fireEvent.click(closeBtn);

      await waitFor(() => {
        expect(screen.queryByText('Bóveda Segura de Entrega & Finiquito')).not.toBeInTheDocument();
      });
    });

    it('debe manejar enlaces faltantes y notas no configuradas en la Bóveda de Entrega', async () => {
      const mockProject: ClientProject = {
        id: 91,
        tenant_id: 1,
        user_id: 42,
        project_name: 'Proyecto Minimalista',
        vertical: 'custom_dev',
        status: 'COMPLETED_DELIVERED',
        currency: 'USD',
        budget_cents: 500000,
        paid_amount_cents: 500000,
        pending_balance_cents: 0,
        estimated_weeks: 2,
        created_at: '2026-09-01',
        updated_at: '2026-09-01',
      };

      vi.mocked(authClient.getClientProjectHandover).mockResolvedValueOnce({
        status: 'success',
        handover: {
          project_id: 91,
          repository_url: null,
          deployment_url: null,
          documentation_url: null,
          handover_notes: null,
          certificate_sha256: 'fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321',
          has_credentials: false,
          downloaded_at: '2026-09-09T20:00:00Z',
          download_count: 5,
        },
      });

      render(<B2BProjectWorkspaceWidget projects={[mockProject]} />);

      fireEvent.click(screen.getByRole('button', { name: /Abrir Bóveda de Entrega & Finiquito/i }));

      await waitFor(() => {
        expect(screen.getAllByText('No configurado')).toHaveLength(2); // Repo y Despliegue
        expect(screen.getByText('No configurada')).toBeInTheDocument(); // Documentación
        expect(
          screen.getByText('No se configuraron credenciales maestras en este proyecto.'),
        ).toBeInTheDocument();
      });

      // Cerrar con ✕
      const xBtn = screen.getByRole('button', { name: '✕' });
      fireEvent.click(xBtn);

      await waitFor(() => {
        expect(screen.queryByText('Bóveda Segura de Entrega & Finiquito')).not.toBeInTheDocument();
      });
    });

    it('debe manejar errores al consultar la bóveda de entrega (Error y no-Error)', async () => {
      const mockProject: ClientProject = {
        id: 92,
        tenant_id: 1,
        user_id: 42,
        project_name: 'Proyecto Con Fallo',
        vertical: 'custom_dev',
        status: 'COMPLETED_DELIVERED',
        currency: 'USD',
        budget_cents: 500000,
        paid_amount_cents: 500000,
        pending_balance_cents: 0,
        estimated_weeks: 2,
        created_at: '2026-09-01',
        updated_at: '2026-09-01',
      };

      // Caso 1: Error instance
      vi.mocked(authClient.getClientProjectHandover).mockRejectedValueOnce(
        new Error('Fallo de red al consultar bóveda'),
      );

      const { rerender } = render(<B2BProjectWorkspaceWidget projects={[mockProject]} />);

      fireEvent.click(screen.getByRole('button', { name: /Abrir Bóveda de Entrega & Finiquito/i }));

      await waitFor(() => {
        expect(screen.getByText('Fallo de red al consultar bóveda')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Cerrar Bóveda/i }));

      // Caso 2: non-Error rejection
      vi.mocked(authClient.getClientProjectHandover).mockRejectedValueOnce('raw rejection');

      rerender(<B2BProjectWorkspaceWidget projects={[mockProject]} />);

      fireEvent.click(screen.getByRole('button', { name: /Abrir Bóveda de Entrega & Finiquito/i }));

      await waitFor(() => {
        expect(screen.getByText('Error al consultar la bóveda de entrega.')).toBeInTheDocument();
      });
    });

    it('debe revelar credenciales de producción, permitir copiarlas y manejar errores de revelación', async () => {
      const mockProject: ClientProject = {
        id: 93,
        tenant_id: 1,
        user_id: 42,
        project_name: 'Proyecto Credenciales',
        vertical: 'saas_platform',
        status: 'COMPLETED_DELIVERED',
        currency: 'USD',
        budget_cents: 1000000,
        paid_amount_cents: 1000000,
        pending_balance_cents: 0,
        estimated_weeks: 4,
        created_at: '2026-09-01',
        updated_at: '2026-09-01',
      };

      vi.mocked(authClient.getClientProjectHandover).mockResolvedValueOnce({
        status: 'success',
        handover: {
          project_id: 93,
          repository_url: 'https://github.com/dreamtek/repo-93',
          deployment_url: 'https://prod-93.dreamtek.tech',
          documentation_url: null,
          handover_notes: null,
          certificate_sha256: 'hash93',
          has_credentials: true,
          downloaded_at: null,
          download_count: 0,
        },
      });

      // Mock navigator.clipboard
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: {
          writeText: writeTextMock,
        },
      });

      render(<B2BProjectWorkspaceWidget projects={[mockProject]} />);

      fireEvent.click(screen.getByRole('button', { name: /Abrir Bóveda de Entrega & Finiquito/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Revelar Credenciales/i })).toBeInTheDocument();
      });

      // Revelación exitosa
      vi.mocked(authClient.revealProjectHandoverCredentials).mockResolvedValueOnce({
        status: 'success',
        credentials: 'DATABASE_URL=postgres://user:pass@host:5432/db',
      });

      fireEvent.click(screen.getByRole('button', { name: /Revelar Credenciales/i }));

      await waitFor(() => {
        expect(
          screen.getByText('DATABASE_URL=postgres://user:pass@host:5432/db'),
        ).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Copiar Credenciales/i })).toBeInTheDocument();
      });

      // Copiar credenciales
      fireEvent.click(screen.getByRole('button', { name: /Copiar Credenciales/i }));
      expect(writeTextMock).toHaveBeenCalledWith('DATABASE_URL=postgres://user:pass@host:5432/db');

      await waitFor(() => {
        expect(screen.getByText(/Copiado al Portapapeles ✓/i)).toBeInTheDocument();
      });
    });

    it('debe manejar errores al revelar credenciales (Error y no-Error)', async () => {
      const mockProject: ClientProject = {
        id: 94,
        tenant_id: 1,
        user_id: 42,
        project_name: 'Proyecto Error Revelar',
        vertical: 'saas_platform',
        status: 'COMPLETED_DELIVERED',
        currency: 'USD',
        budget_cents: 1000000,
        paid_amount_cents: 1000000,
        pending_balance_cents: 0,
        estimated_weeks: 4,
        created_at: '2026-09-01',
        updated_at: '2026-09-01',
      };

      vi.mocked(authClient.getClientProjectHandover).mockResolvedValueOnce({
        status: 'success',
        handover: {
          project_id: 94,
          repository_url: null,
          deployment_url: null,
          documentation_url: null,
          handover_notes: null,
          certificate_sha256: 'hash94',
          has_credentials: true,
          downloaded_at: null,
          download_count: 0,
        },
      });

      render(<B2BProjectWorkspaceWidget projects={[mockProject]} />);

      fireEvent.click(screen.getByRole('button', { name: /Abrir Bóveda de Entrega & Finiquito/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Revelar Credenciales/i })).toBeInTheDocument();
      });

      // Error instance
      vi.mocked(authClient.revealProjectHandoverCredentials).mockRejectedValueOnce(
        new Error('Clave de bóveda inaccesible'),
      );

      fireEvent.click(screen.getByRole('button', { name: /Revelar Credenciales/i }));

      await waitFor(() => {
        expect(screen.getByText('Clave de bóveda inaccesible')).toBeInTheDocument();
      });

      // Non-error rejection
      vi.mocked(authClient.revealProjectHandoverCredentials).mockRejectedValueOnce('raw string');

      fireEvent.click(screen.getByRole('button', { name: /Revelar Credenciales/i }));

      await waitFor(() => {
        expect(screen.getByText('Error al revelar credenciales cifradas.')).toBeInTheDocument();
      });
    });

    it('debe descargar la constancia de finiquito (.JSON) y manejar errores de descarga', async () => {
      const mockProject: ClientProject = {
        id: 95,
        tenant_id: 1,
        user_id: 42,
        project_name: 'Proyecto Certificado',
        vertical: 'saas_platform',
        status: 'COMPLETED_DELIVERED',
        currency: 'USD',
        budget_cents: 1000000,
        paid_amount_cents: 1000000,
        pending_balance_cents: 0,
        estimated_weeks: 4,
        created_at: '2026-09-01',
        updated_at: '2026-09-01',
      };

      vi.mocked(authClient.getClientProjectHandover).mockResolvedValueOnce({
        status: 'success',
        handover: {
          project_id: 95,
          repository_url: null,
          deployment_url: null,
          documentation_url: null,
          handover_notes: null,
          certificate_sha256: 'hash95',
          has_credentials: false,
          downloaded_at: null,
          download_count: 1,
        },
      });

      // Mock URL.createObjectURL / revokeObjectURL
      const createObjectURLMock = vi.fn().mockReturnValue('blob:http://localhost/cert-blob');
      const revokeObjectURLMock = vi.fn();
      global.URL.createObjectURL = createObjectURLMock;
      global.URL.revokeObjectURL = revokeObjectURLMock;

      render(<B2BProjectWorkspaceWidget projects={[mockProject]} />);

      fireEvent.click(screen.getByRole('button', { name: /Abrir Bóveda de Entrega & Finiquito/i }));

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /Descargar Constancia \(\.JSON\)/i }),
        ).toBeInTheDocument();
      });

      // Descarga exitosa
      vi.mocked(authClient.getProjectSettlementCertificate).mockResolvedValueOnce({
        status: 'success',
        certificate: {
          canonical_data: { project_id: 95 },
          certificate_sha256: 'hash95',
          downloaded_at: '2026-09-09T21:00:00Z',
          download_count: 2,
        },
      });

      fireEvent.click(screen.getByRole('button', { name: /Descargar Constancia \(\.JSON\)/i }));

      await waitFor(() => {
        expect(authClient.getProjectSettlementCertificate).toHaveBeenCalledWith(95);
        expect(createObjectURLMock).toHaveBeenCalled();
        expect(revokeObjectURLMock).toHaveBeenCalled();
        expect(
          screen.getByText('Constancia de finiquito descargada exitosamente.'),
        ).toBeInTheDocument();
        expect(screen.getByText('Descargas: 2')).toBeInTheDocument();
      });

      // Error al descargar (Error instance)
      vi.mocked(authClient.getProjectSettlementCertificate).mockRejectedValueOnce(
        new Error('Error de servidor al generar constancia'),
      );

      fireEvent.click(screen.getByRole('button', { name: /Descargar Constancia \(\.JSON\)/i }));

      await waitFor(() => {
        expect(screen.getByText('Error de servidor al generar constancia')).toBeInTheDocument();
      });

      // Error al descargar (non-Error rejection)
      vi.mocked(authClient.getProjectSettlementCertificate).mockRejectedValueOnce('raw cert error');

      fireEvent.click(screen.getByRole('button', { name: /Descargar Constancia \(\.JSON\)/i }));

      await waitFor(() => {
        expect(
          screen.getByText('Error al descargar la constancia de finiquito.'),
        ).toBeInTheDocument();
      });
    });
  });
});
