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
});
