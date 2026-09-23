import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ClientDashboardPage from '@/app/client/dashboard/page';
import * as authClient from '@/lib/auth/client';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock('@/lib/auth/client', () => ({
  fetchClientDashboard: vi.fn(),
  logoutUser: vi.fn(),
  fetchArchonBridgeUrl: vi.fn(),
  fetchAdminLeads: vi.fn(),
  fetchAdminAuditLogs: vi.fn(),
  updateClientProjectBriefing: vi.fn(),
  getMfaStatus: vi.fn().mockResolvedValue({ status: 'success', is_2fa_enabled: false }),
}));

describe('ClientDashboardPage (Modular Hub Launchpad - FC 051)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('debe mostrar estado de carga mientras se verifican las credenciales', () => {
    vi.mocked(authClient.fetchClientDashboard).mockImplementation(
      () => new Promise(() => {}), // nunca resuelve de inmediato
    );

    render(<ClientDashboardPage />);
    expect(screen.getByText('Verificando credenciales de sesión...')).toBeInTheDocument();
  });

  it('debe mostrar pantalla de Acceso Restringido ante error y redirigir al inicio', async () => {
    vi.mocked(authClient.fetchClientDashboard).mockRejectedValueOnce(
      new Error('Sesión no autorizada'),
    );

    render(<ClientDashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Acceso Restringido')).toBeInTheDocument();
      expect(screen.getByText('Sesión no autorizada')).toBeInTheDocument();
    });

    const homeBtn = screen.getByRole('button', { name: 'Ir al Inicio de Dreamtek' });
    fireEvent.click(homeBtn);
    expect(mockPush).toHaveBeenCalledWith('/');
  });

  it('debe manejar error sin mensaje explícito usando fallback por defecto', async () => {
    vi.mocked(authClient.fetchClientDashboard).mockRejectedValueOnce({});

    render(<ClientDashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Acceso Restringido')).toBeInTheDocument();
      expect(screen.getByText('No se pudo cargar el panel de control.')).toBeInTheDocument();
    });
  });

  it('debe renderizar el Hub con todas sus tarjetas de módulos y procesar acciones', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    const mockData: authClient.ClientDashboardData = {
      status: 'success',
      profile: {
        id: 42,
        full_name: 'Cliente Prueba',
        email: 'cliente@test.com',
        role: 'CLIENT',
        created_at: '2026-09-01',
      },
      services: [
        {
          id: 'sub-1',
          name: 'Escolta WEB B2C',
          status: 'active',
          billing_cycle: 'monthly',
          amount: 4900,
          renews_at: '2026-10-01',
        },
      ],
      sites: [
        {
          id: 101,
          domain: 'miempresa.com',
          status: 'live',
          ssl: 1,
        },
      ],
      projects: [
        {
          id: 77,
          tenant_id: 1,
          user_id: 42,
          project_name: 'Proyecto Alpha',
          vertical: 'custom_dev',
          status: 'IN_PROGRESS',
          currency: 'USD',
          budget_cents: 200000,
          paid_amount_cents: 100000,
          pending_balance_cents: 100000,
          estimated_weeks: 4,
          created_at: '2026-09-01',
          updated_at: '2026-09-01',
          milestones: [
            {
              id: 1,
              title: 'Hito 1',
              status: 'APPROVED',
              amount_cents: 50000,
              order_index: 1,
            },
          ],
        },
      ],
    };

    vi.mocked(authClient.fetchClientDashboard).mockResolvedValueOnce(mockData);
    vi.mocked(authClient.logoutUser).mockResolvedValueOnce({ message: 'Sesión cerrada' });

    render(<ClientDashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Hola,')).toBeInTheDocument();
      expect(screen.getAllByText('Cliente Prueba').length).toBeGreaterThan(0);
      expect(screen.getByText('DTK-USR-42')).toBeInTheDocument();
      expect(screen.getByText('2 Activos')).toBeInTheDocument();
    });

    // Validar tarjetas del Hub presentes
    expect(screen.getByTestId('hub-card-escolta')).toBeInTheDocument();
    expect(screen.getByTestId('hub-card-archon')).toBeInTheDocument();
    expect(screen.getByTestId('hub-card-cyber')).toBeInTheDocument();
    expect(screen.getByTestId('hub-card-projects')).toBeInTheDocument();
    expect(screen.getByTestId('hub-card-billing')).toBeInTheDocument();
    expect(screen.getByTestId('hub-card-security')).toBeInTheDocument();
    expect(screen.getByTestId('hub-card-support')).toBeInTheDocument();

    // Click logo para volver al home
    const logoBtn = screen.getByText(/DREAMTEK/i);
    fireEvent.click(logoBtn);
    expect(mockPush).toHaveBeenCalledWith('/');

    // Botones de acción rápida en las tarjetas
    const supportActionBtn = screen.getByRole('button', { name: 'Soporte' });
    fireEvent.click(supportActionBtn);
    expect(openSpy).toHaveBeenCalledWith('mailto:soporte@dreamtek.tech', '_blank');

    const demoActionBtn = screen.getByRole('button', { name: 'Demo' });
    fireEvent.click(demoActionBtn);
    expect(openSpy).toHaveBeenCalledWith('https://dreamtek.tech/#products', '_blank');

    const cyberActionBtn = screen.getByRole('button', { name: 'Cotizar' });
    fireEvent.click(cyberActionBtn);
    expect(openSpy).toHaveBeenCalledWith('https://dreamtek.tech/#contact', '_blank');

    const ticketActionBtn = screen.getByRole('button', { name: 'Ticket' });
    fireEvent.click(ticketActionBtn);
    expect(openSpy).toHaveBeenCalledWith('mailto:soporte@dreamtek.tech', '_blank');

    // Cerrar sesión
    const logoutBtn = screen.getByRole('button', { name: 'Cerrar Sesión' });
    fireEvent.click(logoutBtn);

    await waitFor(() => {
      expect(authClient.logoutUser).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith('/');
    });

    openSpy.mockRestore();
  });

  it('debe manejar logout fallido redirigiendo de todas formas al inicio en catch', async () => {
    const mockData: authClient.ClientDashboardData = {
      status: 'success',
      profile: {
        id: 99,
        full_name: '',
        username: 'UserFallback',
        email: 'user@test.com',
        role: 'CLIENT',
        created_at: '2026-09-01',
      },
      services: [],
      sites: [],
    };

    vi.mocked(authClient.fetchClientDashboard).mockResolvedValueOnce(mockData);
    vi.mocked(authClient.logoutUser).mockRejectedValueOnce(new Error('Network error'));

    render(<ClientDashboardPage />);

    await waitFor(() => {
      expect(screen.getAllByText('UserFallback').length).toBeGreaterThan(0);
    });

    const logoutBtn = screen.getByRole('button', { name: 'Cerrar Sesión' });
    fireEvent.click(logoutBtn);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/');
    });
  });

  it('debe renderizar vista SUPERADMIN para GrayMan y conmutar entre vista admin y cliente', async () => {
    vi.mocked(authClient.fetchAdminLeads).mockResolvedValue({ leads: [] });
    vi.mocked(authClient.fetchAdminAuditLogs).mockResolvedValue({ logs: [] });

    const adminData: authClient.ClientDashboardData = {
      status: 'success',
      profile: {
        id: 1,
        username: 'GrayMan',
        full_name: 'GrayMan Omnipotent Administrator',
        email: 'admin@dreamtek.tech',
        role: 'ADMIN',
        created_at: '2026-09-01',
      },
      services: [
        {
          id: 'sub-archon',
          name: 'ARCHON Fleet ERP Enterprise',
          status: 'active',
          billing_cycle: 'annual',
          amount: 25000,
          renews_at: '2027-09-01',
        },
      ],
      sites: [
        {
          id: 1,
          domain: 'dreamtek.tech',
          status: 'live',
          ssl: 1,
        },
      ],
    };

    vi.mocked(authClient.fetchClientDashboard).mockResolvedValueOnce(adminData);

    render(<ClientDashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Panel de Control Omnipotente')).toBeInTheDocument();
      expect(screen.getByText('SUPERADMIN · GrayMan')).toBeInTheDocument();
    });

    // Conmutar a vista cliente vía toggle bar
    const clientViewBtn = screen.getByRole('button', { name: 'Vista Cliente' });
    fireEvent.click(clientViewBtn);

    expect(screen.getByText('Hola,')).toBeInTheDocument();
    expect(screen.getByText('DTK-USR-1')).toBeInTheDocument();

    // Conmutar de vuelta a vista admin
    const adminViewBtn = screen.getByRole('button', { name: 'Omnipotente (Admin)' });
    fireEvent.click(adminViewBtn);
    expect(screen.getByText('Panel de Control Omnipotente')).toBeInTheDocument();

    // Conmutar a vista cliente vía botón de previsualización en el panel admin
    const previewBtn = screen.getByRole('button', { name: 'Previsualizar Vista Cliente ↗' });
    fireEvent.click(previewBtn);
    expect(screen.getByText('Hola,')).toBeInTheDocument();
  });

  it('debe manejar ramas de nombres por defecto y data nula', async () => {
    // 1. Data nula
    vi.mocked(authClient.fetchClientDashboard).mockResolvedValueOnce(
      null as unknown as authClient.ClientDashboardData,
    );

    render(<ClientDashboardPage />);

    await waitFor(() => {
      expect(
        screen.getByText('Debes iniciar sesión para acceder a tu área de clientes de Dreamtek.'),
      ).toBeInTheDocument();
    });

    // 2. Usuario con nombre y username vacíos para activar fallbacks de strings
    const fallbackData: authClient.ClientDashboardData = {
      status: 'success',
      profile: {
        id: 777,
        full_name: '',
        username: '',
        email: 'fallback@test.com',
        role: 'CLIENT',
        created_at: '2026-09-01',
      },
      services: [],
      sites: [],
    };

    vi.mocked(authClient.fetchClientDashboard).mockResolvedValueOnce(fallbackData);

    render(<ClientDashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Usuario Dreamtek')).toBeInTheDocument();
      expect(screen.getByText('Cliente')).toBeInTheDocument();
    });

    // 3. Admin sin username ni full_name
    const adminFallbackData: authClient.ClientDashboardData = {
      status: 'success',
      profile: {
        id: 1,
        full_name: '',
        username: '',
        email: 'admin@dtk.com',
        role: 'ADMIN',
        created_at: '2026-09-01',
      },
      services: [],
      sites: [],
    };

    vi.mocked(authClient.fetchClientDashboard).mockResolvedValueOnce(adminFallbackData);

    render(<ClientDashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('SUPERADMIN · GrayMan')).toBeInTheDocument();
    });
  });

  it('debe abortar actualización de estado si el componente se desmonta antes de resolver', async () => {
    let resolvePromise: (val: unknown) => void = () => {};
    vi.mocked(authClient.fetchClientDashboard).mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePromise = resolve;
      }),
    );

    const { unmount } = render(<ClientDashboardPage />);
    unmount();
    resolvePromise(null);
  });

  it('debe abortar en catch y finally si el componente se desmonta antes de rechazar', async () => {
    let rejectPromise: (val: unknown) => void = () => {};
    vi.mocked(authClient.fetchClientDashboard).mockReturnValueOnce(
      new Promise((_, reject) => {
        rejectPromise = reject;
      }),
    );

    const { unmount } = render(<ClientDashboardPage />);
    unmount();
    rejectPromise(new Error('Abort'));
  });
});
