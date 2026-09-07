/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import {
  LeadCrmPipeline,
  LeadItem,
  getStatusConfig,
} from '@/components/dashboard/admin/LeadCrmPipeline';
import * as authClient from '@/lib/auth/client';

vi.mock('@/lib/auth/client', () => ({
  fetchAdminLeads: vi.fn(),
  fetchAdminLeadDetails: vi.fn(),
  updateAdminLeadStatus: vi.fn(),
  addAdminLeadActivity: vi.fn(),
  sendAdminLeadEmail: vi.fn(),
}));

const mockLeadsData: LeadItem[] = [
  {
    id: 1,
    full_name: 'Roberto Gómez',
    email: 'roberto@acme.com',
    phone: '+52 (55) 1234-5678',
    company: 'Acme Security',
    status: 'NEW',
    project_vertical: 'CYBERSECURITY',
    complexity_level: 'ENTERPRISE',
    estimated_budget_min: 5000,
    estimated_budget_max: 12000,
    estimated_weeks_min: 4,
    estimated_weeks_max: 8,
    created_at: '2026-09-06T10:00:00Z',
  },
  {
    id: 2,
    name: 'Ana López',
    email: 'ana@tech.io',
    phone: '5587654321',
    company_name: 'Tech IO',
    status: 'QUALIFIED',
    project_vertical: 'AI_AUTOMATION',
    complexity_level: 'MVP',
    estimated_budget_min: 2500,
    estimated_budget_max: 5000,
    estimated_weeks_min: 2,
    estimated_weeks_max: 4,
    currency: 'USD',
    locale: 'en',
    created_at: '2026-09-06T11:00:00Z',
  },
  {
    id: 3,
    email: 'contacto@particular.com',
    status: 'WON',
    created_at: '2026-09-06T12:00:00Z',
  },
  {
    id: 4,
    email: 'unknown@custom.com',
    status: 'OTHER' as any,
    created_at: '2026-09-06T13:00:00Z',
  },
];

describe('LeadCrmPipeline Component Suite (FC 041 100% Coverage)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cleanup();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
  });

  it('debe renderizar pipeline con initialLeads y listar prospectos con WhatsApp sanitizado', () => {
    render(<LeadCrmPipeline initialLeads={mockLeadsData} />);

    expect(screen.getByText('Pipeline Comercial & Gestión de Prospectos')).toBeInTheDocument();
    expect(screen.getByText('Roberto Gómez')).toBeInTheDocument();
    expect(screen.getByText('Acme Security')).toBeInTheDocument();
    expect(screen.getByText('Ana López')).toBeInTheDocument();
    expect(screen.getByText('Tech IO')).toBeInTheDocument();
    expect(screen.getAllByText('Sin nombre').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('N/A').length).toBeGreaterThanOrEqual(1);

    // Verificamos enlaces de WhatsApp con sólo dígitos (C-041.3)
    const waLinks = screen.getAllByTitle('Contactar vía WhatsApp');
    expect(waLinks).toHaveLength(2);
    expect(waLinks[0].getAttribute('href')).toBe('https://wa.me/525512345678');
    expect(waLinks[1].getAttribute('href')).toBe('https://wa.me/5587654321');
  });

  it('debe cargar leads de la API cuando initialLeads no se proporciona', async () => {
    vi.mocked(authClient.fetchAdminLeads).mockResolvedValueOnce({
      leads: mockLeadsData,
    });

    render(<LeadCrmPipeline />);

    expect(screen.getByText('Cargando prospectos...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Roberto Gómez')).toBeInTheDocument();
    });
    expect(authClient.fetchAdminLeads).toHaveBeenCalledWith({
      status: undefined,
      search: undefined,
    });
  });

  it('debe filtrar leads por estado comercial al hacer clic en las píldoras', async () => {
    vi.mocked(authClient.fetchAdminLeads).mockResolvedValueOnce({
      leads: [mockLeadsData[0]],
    });

    render(<LeadCrmPipeline initialLeads={mockLeadsData} />);

    const newFilterBtn = screen.getByRole('button', { name: /Nuevo/i });
    fireEvent.click(newFilterBtn);

    await waitFor(() => {
      expect(authClient.fetchAdminLeads).toHaveBeenCalledWith({
        status: 'NEW',
        search: undefined,
      });
    });
  });

  it('debe filtrar leads al escribir en la barra de búsqueda', async () => {
    vi.mocked(authClient.fetchAdminLeads).mockResolvedValueOnce({
      leads: [mockLeadsData[1]],
    });

    render(<LeadCrmPipeline initialLeads={mockLeadsData} />);

    const searchInput = screen.getByPlaceholderText('Buscar por nombre, email o empresa...');
    fireEvent.change(searchInput, { target: { value: 'Ana' } });

    await waitFor(() => {
      expect(authClient.fetchAdminLeads).toHaveBeenCalledWith({
        status: undefined,
        search: 'Ana',
      });
    });
  });

  it('debe actualizar el estado comercial de un lead desde el selector de la tabla', async () => {
    vi.mocked(authClient.updateAdminLeadStatus).mockResolvedValueOnce({
      status: 'success',
    });
    vi.mocked(authClient.fetchAdminLeads).mockResolvedValueOnce({
      leads: mockLeadsData,
    });

    render(<LeadCrmPipeline initialLeads={mockLeadsData} />);

    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'CONTACTED' } });

    await waitFor(() => {
      expect(authClient.updateAdminLeadStatus).toHaveBeenCalledWith(1, 'CONTACTED');
      expect(screen.getByText(/Estado actualizado a Contactado/i)).toBeInTheDocument();
    });
  });

  it('debe abrir el expediente modal, cargar actividades y permitir cerrarlo', async () => {
    const mockActivities = [
      {
        id: 101,
        lead_id: 1,
        activity_type: 'STATUS_CHANGE' as const,
        title: 'Lead ingresado',
        details: 'Prospecto desde Cotizador',
        created_at: '2026-09-06T10:05:00Z',
        author_name: 'GrayMan',
      },
    ];

    vi.mocked(authClient.fetchAdminLeadDetails).mockResolvedValueOnce({
      lead: {
        ...mockLeadsData[0],
        activities: mockActivities,
      },
    });

    render(<LeadCrmPipeline initialLeads={mockLeadsData} />);

    const openBtns = screen.getAllByRole('button', { name: 'Expediente ↗' });
    fireEvent.click(openBtns[0]);

    await waitFor(() => {
      expect(authClient.fetchAdminLeadDetails).toHaveBeenCalledWith(1);
      expect(screen.getByText('Lead ingresado')).toBeInTheDocument();
      expect(screen.getByText('Prospecto desde Cotizador')).toBeInTheDocument();
      expect(screen.getByText(/GrayMan/)).toBeInTheDocument();
    });

    // Cerrar modal
    const closeBtn = screen.getByRole('button', { name: '✕' });
    fireEvent.click(closeBtn);

    expect(screen.queryByText('Lead ingresado')).not.toBeInTheDocument();
  });

  it('debe registrar una nueva actividad comercial en el expediente', async () => {
    vi.mocked(authClient.fetchAdminLeadDetails).mockResolvedValue({
      lead: {
        ...mockLeadsData[0],
        activities: [],
      },
    });
    vi.mocked(authClient.addAdminLeadActivity).mockResolvedValueOnce({
      status: 'success',
      activity_id: 202,
    });

    render(<LeadCrmPipeline initialLeads={mockLeadsData} />);

    const openBtns = screen.getAllByRole('button', { name: 'Expediente ↗' });
    fireEvent.click(openBtns[0]);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Ej. Llamada de diagnóstico')).toBeInTheDocument();
    });

    const titleInput = screen.getByPlaceholderText('Ej. Llamada de diagnóstico');
    const detailsInput = screen.getByPlaceholderText(
      'Resumen de acuerdos, dudas o próximos pasos...',
    );

    fireEvent.change(titleInput, { target: { value: 'Llamada comercial de alineación' } });
    fireEvent.change(detailsInput, { target: { value: 'Se acordó enviar propuesta' } });

    const saveBtn = screen.getByRole('button', { name: 'Guardar en Bitácora 📝' });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(authClient.addAdminLeadActivity).toHaveBeenCalledWith(1, {
        activity_type: 'NOTE',
        title: 'Llamada comercial de alineación',
        details: 'Se acordó enviar propuesta',
      });
      expect(screen.getByText('Actividad registrada en la bitácora.')).toBeInTheDocument();
    });
  });

  it('debe despachar correo de seguimiento manual bajo demanda (C-041.1)', async () => {
    vi.mocked(authClient.fetchAdminLeadDetails).mockResolvedValue({
      lead: {
        ...mockLeadsData[0],
        activities: [],
      },
    });
    vi.mocked(authClient.sendAdminLeadEmail).mockResolvedValueOnce({
      status: 'success',
      subject: 'Invitación a Diagnóstico Técnico',
    });
    vi.mocked(authClient.fetchAdminLeads).mockResolvedValueOnce({
      leads: mockLeadsData,
    });

    render(<LeadCrmPipeline initialLeads={mockLeadsData} />);

    const openBtns = screen.getAllByRole('button', { name: 'Expediente ↗' });
    fireEvent.click(openBtns[0]);

    await waitFor(() => {
      expect(screen.getByText('Plantillas de Seguimiento Manual')).toBeInTheDocument();
    });

    const subjectInput = screen.getByPlaceholderText('Dejar vacío para asunto predeterminado');
    const msgInput = screen.getByPlaceholderText(
      'Mensaje personalizado incluido en la plantilla...',
    );

    fireEvent.change(subjectInput, { target: { value: 'Asunto de prueba' } });
    fireEvent.change(msgInput, { target: { value: 'Mensaje especial para el cliente' } });

    const sendBtn = screen.getByRole('button', {
      name: 'Despachar Correo de Seguimiento ✉',
    });
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(authClient.sendAdminLeadEmail).toHaveBeenCalledWith(1, {
        template_id: 'DIAGNOSTIC_INVITATION',
        subject: 'Asunto de prueba',
        custom_message: 'Mensaje especial para el cliente',
      });
      expect(
        screen.getByText('Correo de seguimiento manual enviado con éxito.'),
      ).toBeInTheDocument();
    });
  });

  it('debe capturar y desplegar errores en todas las operaciones', async () => {
    // 1. Error cargando leads
    vi.mocked(authClient.fetchAdminLeads).mockRejectedValueOnce(new Error('Fallo de red'));
    render(<LeadCrmPipeline />);

    await waitFor(() => {
      expect(screen.getByText('Fallo de red')).toBeInTheDocument();
    });

    // Descartar banner de error
    const dismissBtn = screen.getByText('✕');
    fireEvent.click(dismissBtn);
    expect(screen.queryByText('Fallo de red')).not.toBeInTheDocument();

    // 2. Error al cambiar status
    vi.mocked(authClient.updateAdminLeadStatus).mockRejectedValueOnce(new Error('Error de DB'));
    render(<LeadCrmPipeline initialLeads={mockLeadsData} />);

    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'LOST' } });

    await waitFor(() => {
      expect(screen.getByText('Error de DB')).toBeInTheDocument();
    });

    // 3. Error al abrir expediente
    vi.mocked(authClient.fetchAdminLeadDetails).mockRejectedValueOnce(
      new Error('Fallo expediente'),
    );
    const openBtns = screen.getAllByRole('button', { name: 'Expediente ↗' });
    fireEvent.click(openBtns[0]);

    await waitFor(() => {
      expect(screen.getByText('Fallo expediente')).toBeInTheDocument();
    });
  });

  it('debe manejar errores al registrar actividad y enviar correo', async () => {
    vi.mocked(authClient.fetchAdminLeadDetails).mockResolvedValue({
      lead: {
        ...mockLeadsData[0],
        activities: [],
      },
    });
    vi.mocked(authClient.addAdminLeadActivity).mockRejectedValueOnce(
      new Error('Error al registrar'),
    );
    vi.mocked(authClient.sendAdminLeadEmail).mockRejectedValueOnce(
      new Error('Error al enviar SMTP'),
    );

    render(<LeadCrmPipeline initialLeads={mockLeadsData} />);

    const openBtns = screen.getAllByRole('button', { name: 'Expediente ↗' });
    fireEvent.click(openBtns[0]);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Ej. Llamada de diagnóstico')).toBeInTheDocument();
    });

    // Error en actividad
    const titleInput = screen.getByPlaceholderText('Ej. Llamada de diagnóstico');
    fireEvent.change(titleInput, { target: { value: 'Llamada' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar en Bitácora 📝' }));

    await waitFor(() => {
      expect(screen.getByText('Error al registrar')).toBeInTheDocument();
    });

    // Error en correo
    fireEvent.click(screen.getByRole('button', { name: 'Despachar Correo de Seguimiento ✉' }));

    await waitFor(() => {
      expect(screen.getByText('Error al enviar SMTP')).toBeInTheDocument();
    });
  });

  it('debe cubrir branches de reseteo de filtro Todos, selectores de plantilla y actividad, y lead con teléfono sin dígitos', async () => {
    const leadSinDigitos: LeadItem = {
      id: 99,
      email: 'nodigits@test.com',
      phone: '---',
      status: 'LOST',
      created_at: '2026-09-06T12:00:00Z',
    };

    const mockActivities = [
      {
        id: 301,
        lead_id: 99,
        activity_type: 'CALL_LOG' as const,
        title: 'Llamada rápida',
        created_at: '2026-09-06T12:05:00Z',
      },
    ];

    vi.mocked(authClient.fetchAdminLeadDetails)
      .mockResolvedValueOnce({
        lead: {
          ...leadSinDigitos,
          activities: mockActivities,
        },
      })
      .mockResolvedValueOnce({
        lead: {
          ...leadSinDigitos,
        },
      });
    vi.mocked(authClient.updateAdminLeadStatus).mockResolvedValue({
      status: 'success',
    });
    vi.mocked(authClient.fetchAdminLeads).mockResolvedValue({
      leads: [leadSinDigitos],
    });

    render(<LeadCrmPipeline />);

    await waitFor(() => {
      expect(screen.getByText('nodigits@test.com')).toBeInTheDocument();
    });

    // 1. Clic en píldora Perdido y luego en Todos
    const lostPill = screen.getByRole('button', { name: /Perdido/i });
    fireEvent.click(lostPill);

    await waitFor(() => {
      expect(authClient.fetchAdminLeads).toHaveBeenCalledWith({
        status: 'LOST',
        search: undefined,
      });
    });

    const todosPill = screen.getByRole('button', { name: /Todos/i });
    fireEvent.click(todosPill);

    await waitFor(() => {
      expect(authClient.fetchAdminLeads).toHaveBeenCalledWith({
        status: undefined,
        search: undefined,
      });
    });

    // 2. Abrir expediente para el lead sin dígitos
    const openBtn = screen.getByRole('button', { name: 'Expediente ↗' });
    fireEvent.click(openBtn);

    await waitFor(() => {
      expect(screen.getByText('Llamada rápida')).toBeInTheDocument();
    });

    // Verificamos que no hay botón WhatsApp ya que phone no tiene dígitos
    expect(screen.queryByText('Abrir WhatsApp Web ↗')).not.toBeInTheDocument();

    // 3. Cambiar selector de tipo de actividad a CALL_LOG o MEETING_SCHEDULED
    const activitySelect = screen
      .getAllByRole('combobox')
      .find((el) => (el as HTMLSelectElement).value === 'NOTE');
    expect(activitySelect).toBeDefined();
    fireEvent.change(activitySelect!, { target: { value: 'CALL_LOG' } });

    // 4. Cambiar selector de plantilla de correo a PROPOSAL_SUBMITTED
    const templateSelect = screen
      .getAllByRole('combobox')
      .find((el) => (el as HTMLSelectElement).value === 'DIAGNOSTIC_INVITATION');
    expect(templateSelect).toBeDefined();
    fireEvent.change(templateSelect!, { target: { value: 'PROPOSAL_SUBMITTED' } });

    // 5. Cambiar status del lead mientras el expediente está abierto
    const rowStatusSelect = screen
      .getAllByRole('combobox')
      .find((el) => (el as HTMLSelectElement).value === 'LOST');
    expect(rowStatusSelect).toBeDefined();
    fireEvent.change(rowStatusSelect!, { target: { value: 'WON' } });

    await waitFor(() => {
      expect(authClient.updateAdminLeadStatus).toHaveBeenCalledWith(99, 'WON');
    });
  });

  it('debe tolerar respuestas sin actividades en fetchAdminLeadDetails tras acciones', async () => {
    const leadSinAct: LeadItem = {
      id: 50,
      email: 'sinact@test.com',
      status: 'NEW',
      created_at: '2026-09-06T12:00:00Z',
    };

    vi.mocked(authClient.fetchAdminLeadDetails).mockResolvedValue({
      lead: leadSinAct,
    });
    vi.mocked(authClient.addAdminLeadActivity).mockResolvedValue({
      status: 'success',
    });
    vi.mocked(authClient.sendAdminLeadEmail).mockResolvedValue({
      status: 'success',
    });

    render(<LeadCrmPipeline initialLeads={[leadSinAct]} />);

    const openBtn = screen.getByRole('button', { name: 'Expediente ↗' });
    fireEvent.click(openBtn);

    await waitFor(() => {
      expect(screen.getByText('Sin actividades registradas aún.')).toBeInTheDocument();
    });

    // Guardar actividad cuando updated no tiene activities
    const titleInput = screen.getByPlaceholderText('Ej. Llamada de diagnóstico');
    fireEvent.change(titleInput, { target: { value: 'Actividad sin retorno' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar en Bitácora 📝' }));

    await waitFor(() => {
      expect(authClient.addAdminLeadActivity).toHaveBeenCalledWith(50, {
        activity_type: 'NOTE',
        title: 'Actividad sin retorno',
        details: undefined,
      });
    });

    // Enviar email cuando updated no tiene activities
    fireEvent.click(screen.getByRole('button', { name: 'Despachar Correo de Seguimiento ✉' }));
    await waitFor(() => {
      expect(authClient.sendAdminLeadEmail).toHaveBeenCalled();
    });
  });

  it('debe resolver configuración de status válida y fallback a NEW', () => {
    expect(getStatusConfig('QUALIFIED').label).toBe('Calificado');
    expect(getStatusConfig('OTHER').label).toBe('Nuevo');
    expect(getStatusConfig(undefined).label).toBe('Nuevo');
    expect(getStatusConfig(null).label).toBe('Nuevo');
  });

  it('debe abortar el guardado si el título de actividad está vacío', async () => {
    vi.mocked(authClient.fetchAdminLeadDetails).mockResolvedValue({
      lead: {
        ...mockLeadsData[0],
        activities: [],
      },
    });

    render(<LeadCrmPipeline initialLeads={mockLeadsData} />);
    const openBtns = screen.getAllByRole('button', { name: 'Expediente ↗' });
    fireEvent.click(openBtns[0]);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Ej. Llamada de diagnóstico')).toBeInTheDocument();
    });

    const form = screen.getByPlaceholderText('Ej. Llamada de diagnóstico').closest('form')!;
    fireEvent.submit(form);

    expect(authClient.addAdminLeadActivity).not.toHaveBeenCalled();
  });

  it('debe mostrar mensajes de error predeterminados cuando el error arrojado no tiene message', async () => {
    // 1. fetchAdminLeads con {}
    vi.mocked(authClient.fetchAdminLeads).mockRejectedValueOnce({});
    const { unmount } = render(<LeadCrmPipeline />);

    await waitFor(() => {
      expect(screen.getByText('Error al cargar prospectos')).toBeInTheDocument();
    });
    unmount();

    // 2. updateAdminLeadStatus con {}
    vi.mocked(authClient.updateAdminLeadStatus).mockRejectedValueOnce({});
    render(<LeadCrmPipeline initialLeads={mockLeadsData} />);
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'CONTACTED' } });

    await waitFor(() => {
      expect(screen.getByText('Error al actualizar estado')).toBeInTheDocument();
    });

    // 3. fetchAdminLeadDetails con {}
    vi.mocked(authClient.fetchAdminLeadDetails).mockRejectedValueOnce({});
    const openBtns = screen.getAllByRole('button', { name: 'Expediente ↗' });
    fireEvent.click(openBtns[0]);

    await waitFor(() => {
      expect(screen.getByText('Error al cargar expediente')).toBeInTheDocument();
    });

    // 4. addAdminLeadActivity con {}
    vi.mocked(authClient.fetchAdminLeadDetails).mockResolvedValue({
      lead: { ...mockLeadsData[0], activities: [] },
    });
    vi.mocked(authClient.addAdminLeadActivity).mockRejectedValueOnce({});
    fireEvent.click(openBtns[0]);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Ej. Llamada de diagnóstico')).toBeInTheDocument();
    });

    const titleInput = screen.getByPlaceholderText('Ej. Llamada de diagnóstico');
    fireEvent.change(titleInput, { target: { value: 'Test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar en Bitácora 📝' }));

    await waitFor(() => {
      expect(screen.getByText('Error al registrar actividad.')).toBeInTheDocument();
    });

    // 5. sendAdminLeadEmail con {}
    vi.mocked(authClient.sendAdminLeadEmail).mockRejectedValueOnce({});
    fireEvent.click(screen.getByRole('button', { name: 'Despachar Correo de Seguimiento ✉' }));

    await waitFor(() => {
      expect(screen.getByText('Error al enviar correo.')).toBeInTheDocument();
    });
  });
});
