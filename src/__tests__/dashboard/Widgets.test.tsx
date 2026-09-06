import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EscoltaWidget } from '@/components/dashboard/escolta/EscoltaWidget';
import { ArchonWidget } from '@/components/dashboard/archon/ArchonWidget';
import { CyberAuditWidget } from '@/components/dashboard/cyber/CyberAuditWidget';
import { OmnipotentAdminPanel } from '@/components/dashboard/admin/OmnipotentAdminPanel';
import * as authClient from '@/lib/auth/client';

vi.mock('@/lib/auth/client', () => ({
  fetchArchonBridgeUrl: vi.fn(),
  fetchAdminLeads: vi.fn(),
  fetchAdminAuditLogs: vi.fn(),
}));

describe('Dashboard Widgets Suite (FC 038 100% Coverage)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('EscoltaWidget', () => {
    it('debe renderizar estado vacío cuando no hay sitios registrados', () => {
      render(<EscoltaWidget sites={[]} />);
      expect(screen.getByText('Escolta WEB — Sitios & Presencia Digital')).toBeInTheDocument();
      expect(screen.getByText('No hay sitios registrados aún.')).toBeInTheDocument();
      expect(screen.getByText('Soporte: 3h disponibles / mes')).toBeInTheDocument();
    });

    it('debe renderizar sitios con estado live y desarrollo, y procesar onRequestSupport', () => {
      const handleSupport = vi.fn();
      const mockSites = [
        { id: 1, domain: 'empresa1.com', status: 'live', ssl_status: 'ACTIVO' },
        { id: 2, domain: 'empresa2.com', status: 'pending', ssl: true },
        { id: 3, domain: 'empresa3.com', status: 'pending' },
      ];

      render(
        <EscoltaWidget
          sites={mockSites}
          supportHoursAvailable={5}
          onRequestSupport={handleSupport}
        />,
      );

      expect(screen.getByText('empresa1.com')).toBeInTheDocument();
      expect(screen.getByText('En Producción')).toBeInTheDocument();
      expect(screen.getAllByText('En Desarrollo')).toHaveLength(2);
      expect(screen.getByText('Soporte: 5h disponibles / mes')).toBeInTheDocument();

      const supportBtn = screen.getByRole('button', { name: 'Solicitar Soporte Técnico' });
      fireEvent.click(supportBtn);
      expect(handleSupport).toHaveBeenCalledTimes(1);
    });
  });

  describe('ArchonWidget', () => {
    it('debe renderizar estado inactivo por defecto y ejecutar onUpgrade', () => {
      const handleUpgrade = vi.fn();
      render(<ArchonWidget hasActivePlan={false} onUpgrade={handleUpgrade} />);

      expect(screen.getByText('Módulo Opcional')).toBeInTheDocument();
      const upgradeBtn = screen.getByRole('button', {
        name: 'Solicitar Demostración Bespoke',
      });
      fireEvent.click(upgradeBtn);
      expect(handleUpgrade).toHaveBeenCalledTimes(1);
    });

    it('debe renderizar estado activo, generar enlace HMAC exitosamente y abrir ventana', async () => {
      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
      vi.mocked(authClient.fetchArchonBridgeUrl).mockResolvedValueOnce({
        url: 'https://fleet.archon.dreamtek.tech/bridge?token=123',
        expires_in: 300,
      });

      render(<ArchonWidget hasActivePlan={true} />);

      expect(screen.getByText('Instancia Activa')).toBeInTheDocument();
      const enterBtn = screen.getByRole('button', { name: 'Entrar al ERP ARCHON ↗' });
      fireEvent.click(enterBtn);

      await waitFor(() => {
        expect(authClient.fetchArchonBridgeUrl).toHaveBeenCalledTimes(1);
        expect(openSpy).toHaveBeenCalledWith(
          'https://fleet.archon.dreamtek.tech/bridge?token=123',
          '_blank',
          'noopener,noreferrer',
        );
      });
      openSpy.mockRestore();
    });

    it('debe capturar errores al generar el enlace HMAC y mostrar mensaje', async () => {
      vi.mocked(authClient.fetchArchonBridgeUrl).mockRejectedValueOnce(
        new Error('Conexión rechazada'),
      );

      render(<ArchonWidget hasActivePlan={true} />);

      const enterBtn = screen.getByRole('button', { name: 'Entrar al ERP ARCHON ↗' });
      fireEvent.click(enterBtn);

      await waitFor(() => {
        expect(screen.getByText('Conexión rechazada')).toBeInTheDocument();
      });

      // Error sin mensaje explícito (fallback)
      vi.mocked(authClient.fetchArchonBridgeUrl).mockRejectedValueOnce({});
      fireEvent.click(enterBtn);
      await waitFor(() => {
        expect(screen.getByText('Error al conectar con la plataforma ARCHON.')).toBeInTheDocument();
      });
    });

    it('debe manejar caso donde res.url es vacío sin abrir ventana', async () => {
      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
      vi.mocked(authClient.fetchArchonBridgeUrl).mockResolvedValueOnce({
        url: '',
        expires_in: 300,
      });

      render(<ArchonWidget hasActivePlan={true} />);

      const enterBtn = screen.getByRole('button', { name: 'Entrar al ERP ARCHON ↗' });
      fireEvent.click(enterBtn);

      await waitFor(() => {
        expect(authClient.fetchArchonBridgeUrl).toHaveBeenCalledTimes(1);
        expect(openSpy).not.toHaveBeenCalled();
      });
      openSpy.mockRestore();
    });
  });

  describe('CyberAuditWidget', () => {
    it('debe renderizar estado sin auditoría activa y procesar onRequestAudit', () => {
      const handleAudit = vi.fn();
      render(<CyberAuditWidget hasActiveAudit={false} onRequestAudit={handleAudit} />);

      expect(screen.getByText('Módulo por Demanda')).toBeInTheDocument();
      const requestBtn = screen.getByRole('button', {
        name: 'Solicitar Auditoría Táctica ($1,800 USD)',
      });
      fireEvent.click(requestBtn);
      expect(handleAudit).toHaveBeenCalledTimes(1);
    });

    it('debe renderizar estado con auditoría en curso y botón de estado táctico', () => {
      const handleAudit = vi.fn();
      render(<CyberAuditWidget hasActiveAudit={true} onRequestAudit={handleAudit} />);

      expect(screen.getByText('Auditoría en Curso')).toBeInTheDocument();
      expect(screen.getByText('Diagnóstico de seguridad en ejecución')).toBeInTheDocument();
      const statusBtn = screen.getByRole('button', { name: 'Consultar Estado Táctico' });
      fireEvent.click(statusBtn);
      expect(handleAudit).toHaveBeenCalledTimes(1);
    });
  });

  describe('OmnipotentAdminPanel', () => {
    it('debe cargar datos de leads y auditoría, y permitir navegación entre pestañas', async () => {
      const mockLeads = [
        {
          id: 1,
          full_name: 'Lead Uno',
          email: 'lead1@dtk.com',
          company_name: 'Corp 1',
          plan_id: 'Plan Pro',
          created_at: '2026-09-01T10:00:00Z',
        },
        {
          id: 2,
          name: 'Lead Dos',
          email: 'lead2@dtk.com',
          company_name: null,
          plan_id: null,
          created_at: '2026-09-02T10:00:00Z',
        },
      ];

      const mockLogs = [
        {
          id: 10,
          event_type: 'LOGIN_SUCCESS',
          ip_address: '192.168.1.1',
          user_agent: 'Mozilla/5.0 Chrome/120',
          payload_sha256: 'a1b2c3d4e5',
          created_at: '2026-09-05T12:00:00Z',
        },
        {
          id: 11,
          event_type: 'HMAC_LINK_ISSUED',
          ip_address: null,
          user_agent: 'Curl/7.8',
          payload_sha256: 'f6e5d4c3b2',
          created_at: '2026-09-05T13:00:00Z',
        },
      ];

      vi.mocked(authClient.fetchAdminLeads).mockResolvedValueOnce({ leads: mockLeads });
      vi.mocked(authClient.fetchAdminAuditLogs).mockResolvedValueOnce({ logs: mockLogs });

      const handleViewClient = vi.fn();
      render(
        <OmnipotentAdminPanel
          adminName="GrayMan"
          totalSites={7}
          totalServices={4}
          onViewAsClient={handleViewClient}
        />,
      );

      expect(screen.getByText('SUPERADMIN · GrayMan')).toBeInTheDocument();
      expect(screen.getByText('7')).toBeInTheDocument();
      expect(screen.getByText('4')).toBeInTheDocument();

      // Botón previsualizar vista cliente
      const previewBtn = screen.getByRole('button', { name: 'Previsualizar Vista Cliente ↗' });
      fireEvent.click(previewBtn);
      expect(handleViewClient).toHaveBeenCalledTimes(1);

      // Tab overview
      expect(screen.getByText('Resumen Ejecutivo')).toBeInTheDocument();
      expect(screen.getByText('✓ Sistema en Óptimas Condiciones')).toBeInTheDocument();

      // Tab leads
      await waitFor(() => {
        expect(screen.getByText('Prospectos (2)')).toBeInTheDocument();
      });
      const leadsTab = screen.getByText('Prospectos (2)');
      fireEvent.click(leadsTab);
      expect(screen.getByText('Lead Uno')).toBeInTheDocument();
      expect(screen.getByText('Lead Dos')).toBeInTheDocument();
      expect(screen.getByText('Corp 1')).toBeInTheDocument();
      expect(screen.getByText('N/A')).toBeInTheDocument();

      // Tab security
      const securityTab = screen.getByText('Bitácora Forense (2)');
      fireEvent.click(securityTab);
      expect(screen.getByText('LOGIN_SUCCESS')).toBeInTheDocument();
      expect(screen.getByText('HMAC_LINK_ISSUED')).toBeInTheDocument();
      expect(screen.getByText('192.168.1.1')).toBeInTheDocument();
      expect(screen.getByText('127.0.0.1')).toBeInTheDocument();

      // Return to overview tab
      const overviewTab = screen.getByText('Resumen Ejecutivo');
      fireEvent.click(overviewTab);
      expect(screen.getByText('✓ Sistema en Óptimas Condiciones')).toBeInTheDocument();
    });

    it('debe manejar estado sin leads ni logs de auditoría cuando las APIs fallan', async () => {
      vi.mocked(authClient.fetchAdminLeads).mockRejectedValueOnce(new Error('Network error'));
      vi.mocked(authClient.fetchAdminAuditLogs).mockRejectedValueOnce(new Error('Network error'));

      render(<OmnipotentAdminPanel />);

      await waitFor(() => {
        expect(screen.getByText('Prospectos (0)')).toBeInTheDocument();
      });

      // Check leads tab empty state
      fireEvent.click(screen.getByText('Prospectos (0)'));
      expect(screen.getByText('No hay prospectos registrados actualmente.')).toBeInTheDocument();

      // Check security tab empty state
      fireEvent.click(screen.getByText('Bitácora Forense (0)'));
      expect(screen.getByText('No hay eventos de seguridad registrados.')).toBeInTheDocument();
    });

    it('debe tolerar respuestas sin claves leads ni logs usando array vacío', async () => {
      vi.mocked(authClient.fetchAdminLeads).mockResolvedValueOnce(
        {} as unknown as Record<string, unknown>,
      );
      vi.mocked(authClient.fetchAdminAuditLogs).mockResolvedValueOnce(
        {} as unknown as Record<string, unknown>,
      );

      render(<OmnipotentAdminPanel />);

      await waitFor(() => {
        expect(screen.getByText('Prospectos (0)')).toBeInTheDocument();
        expect(screen.getByText('Bitácora Forense (0)')).toBeInTheDocument();
      });
    });
  });
});
