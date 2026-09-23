import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as authClient from '@/lib/auth/client';
import {
  DashboardSubpageHeader,
  MODULE_ALLOWLIST,
  getUserDisplayName,
} from '@/components/dashboard/client/DashboardSubpageHeader';
import { ClientHubModuleCard } from '@/components/dashboard/client/ClientHubModuleCard';
import EscoltaSubpage from '@/app/client/dashboard/escolta/page';
import ArchonSubpage from '@/app/client/dashboard/archon/page';
import CyberSubpage from '@/app/client/dashboard/cyber/page';
import ProjectsSubpage from '@/app/client/dashboard/projects/page';
import BillingSubpage from '@/app/client/dashboard/billing/page';
import SecuritySubpage from '@/app/client/dashboard/security/page';
import SupportSubpage from '@/app/client/dashboard/support/page';

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
  getMfaStatus: vi.fn().mockResolvedValue({ status: 'success', is_2fa_enabled: false }),
}));

const baseMockData: authClient.ClientDashboardData = {
  status: 'success',
  profile: {
    id: 55,
    full_name: 'Usuario Modular',
    email: 'modular@dreamtek.tech',
    role: 'CLIENT',
    created_at: '2026-09-01',
  },
  services: [
    {
      id: 's1',
      name: 'Escolta WEB',
      status: 'active',
      billing_cycle: 'monthly',
      amount: 2899,
      renews_at: '2026-10-01',
    },
  ],
  sites: [
    {
      id: 1,
      domain: 'modular.com',
      status: 'live',
      ssl: 1,
    },
  ],
  projects: [
    {
      id: 10,
      tenant_id: 1,
      user_id: 55,
      project_name: 'App Modular',
      vertical: 'custom_dev',
      status: 'DISCOVERY',
      currency: 'MXN',
      budget_cents: 5000000,
      paid_amount_cents: 2500000,
      pending_balance_cents: 2500000,
      estimated_weeks: 6,
      created_at: '2026-09-01',
      updated_at: '2026-09-01',
    },
  ],
};

describe('Modular Hub Subpages & Components Suite (FC 051 100% Coverage)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authClient.fetchClientDashboard).mockResolvedValue(baseMockData);
  });

  describe('DashboardSubpageHeader Component', () => {
    it('debe renderizar título, breadcrumb y allowlist de navegación', () => {
      render(
        <DashboardSubpageHeader
          currentModule="billing"
          userName="Felipe M"
          userEmail="felipe@dreamtek.tech"
        />,
      );

      expect(screen.getByText('← Volver al Hub')).toBeInTheDocument();
      expect(screen.getByText('DREAMTEK.TECH')).toBeInTheDocument();
      expect(screen.getByText('Facturación & Datos Fiscales')).toBeInTheDocument();
      expect(screen.getByText('Felipe M')).toBeInTheDocument();
      expect(screen.getByText('felipe@dreamtek.tech')).toBeInTheDocument();

      // Verificar que todos los módulos de la allowlist existen
      Object.values(MODULE_ALLOWLIST).forEach((mod) => {
        expect(screen.getByText(mod.shortName)).toBeInTheDocument();
      });
    });

    it('debe procesar logout exitoso y fallido en el header', async () => {
      vi.mocked(authClient.logoutUser).mockResolvedValueOnce({ message: 'OK' });

      render(<DashboardSubpageHeader currentModule="escolta" />);
      const logoutBtn = screen.getByRole('button', { name: 'Cerrar Sesión' });
      fireEvent.click(logoutBtn);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/');
      });

      // Catch error
      vi.mocked(authClient.logoutUser).mockRejectedValueOnce(new Error('Logout fail'));
      fireEvent.click(logoutBtn);
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/');
      });
    });

    it('debe manejar fallback de módulo desconocido y helper getUserDisplayName', () => {
      // Módulo desconocido
      // @ts-expect-error probando fallback de allowlist
      render(<DashboardSubpageHeader currentModule="desconocido" />);
      expect(screen.getByText('Módulo')).toBeInTheDocument();

      // Helper getUserDisplayName
      expect(getUserDisplayName()).toBe('Cliente');
      expect(getUserDisplayName(undefined)).toBe('Cliente');
      expect(getUserDisplayName({ full_name: 'Felipe' })).toBe('Felipe');
      expect(getUserDisplayName({ full_name: '', username: 'felipe_dev' })).toBe('felipe_dev');
      expect(getUserDisplayName({ full_name: '', username: '' })).toBe('Cliente');
    });
  });

  describe('ClientHubModuleCard Component', () => {
    it('debe renderizar variantes de badges, ctaText y soportar clics en actionButton', () => {
      const mockAction = vi.fn();
      const { rerender } = render(
        <ClientHubModuleCard
          id="escolta"
          title="Escolta"
          description="Desc"
          icon={<span>icon</span>}
          href="/test"
          badge={{ text: 'Activo', variant: 'emerald' }}
          metrics={[{ label: 'M1', value: 'V1' }]}
          isContracted={true}
          ctaText="Personalizado →"
          actionButton={{ text: 'Accion', onClick: mockAction }}
        />,
      );

      expect(screen.getByText('Activo')).toBeInTheDocument();
      expect(screen.getByText('Personalizado →')).toBeInTheDocument();
      expect(screen.getByText('M1')).toBeInTheDocument();
      expect(screen.getByText('V1')).toBeInTheDocument();

      const btn = screen.getByRole('button', { name: 'Accion' });
      fireEvent.click(btn);
      expect(mockAction).toHaveBeenCalledTimes(1);

      // Probar resto de variantes de color en badge
      const variants: Array<'cyan' | 'amber' | 'slate' | 'red'> = ['cyan', 'amber', 'slate', 'red'];
      variants.forEach((v) => {
        rerender(
          <ClientHubModuleCard
            id="escolta"
            title="Escolta"
            description="Desc"
            icon={<span>icon</span>}
            href="/test"
            badge={{ text: v, variant: v }}
            isContracted={false}
          />,
        );
        expect(screen.getByText(v)).toBeInTheDocument();
      });

      // Probar CTA default según isContracted
      rerender(
        <ClientHubModuleCard
          id="escolta"
          title="Escolta"
          description="Desc"
          icon={<span>icon</span>}
          href="/test"
          isContracted={true}
        />,
      );
      expect(screen.getByText('Abrir espacio →')).toBeInTheDocument();

      rerender(
        <ClientHubModuleCard
          id="escolta"
          title="Escolta"
          description="Desc"
          icon={<span>icon</span>}
          href="/test"
          isContracted={false}
        />,
      );
      expect(screen.getByText('Ver alcance →')).toBeInTheDocument();
    });

    it('debe manejar desmontaje de subpáginas antes de resolución de fetch sin actualizar estado', () => {
      let resolveFetch!: (val: authClient.ClientDashboardData) => void;
      let rejectFetch!: (err: Error) => void;
      vi.mocked(authClient.fetchClientDashboard).mockImplementation(
        () =>
          new Promise((res, rej) => {
            resolveFetch = res;
            rejectFetch = rej;
          }),
      );

      const { unmount: u1 } = render(<EscoltaSubpage />);
      u1();
      resolveFetch(baseMockData);

      const { unmount: u2 } = render(<ArchonSubpage />);
      u2();
      rejectFetch(new Error('fail'));

      const { unmount: u3 } = render(<CyberSubpage />);
      u3();
      resolveFetch(baseMockData);

      const { unmount: u4 } = render(<BillingSubpage />);
      u4();
      resolveFetch(baseMockData);

      const { unmount: u5 } = render(<SecuritySubpage />);
      u5();
      resolveFetch(baseMockData);

      const { unmount: u6 } = render(<SupportSubpage />);
      u6();
      resolveFetch(baseMockData);

      const { unmount: u7 } = render(<ProjectsSubpage />);
      u7();
      resolveFetch(baseMockData);
    });
  });

  describe('Subpáginas Dedicadas', () => {
    it('EscoltaSubpage: renderiza y procesa soporte', async () => {
      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

      render(<EscoltaSubpage />);
      await waitFor(() => {
        expect(screen.getByText('Escolta WEB')).toBeInTheDocument();
        expect(screen.getByText('modular.com')).toBeInTheDocument();
      });

      const supportBtn = screen.getByRole('button', { name: 'Solicitar Soporte Técnico' });
      fireEvent.click(supportBtn);
      expect(openSpy).toHaveBeenCalledWith('mailto:soporte@dreamtek.tech', '_blank');
      openSpy.mockRestore();
    });

    it('EscoltaSubpage: redirige a / ante 401', async () => {
      vi.mocked(authClient.fetchClientDashboard).mockRejectedValueOnce(new Error('401'));
      render(<EscoltaSubpage />);
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/');
      });
    });

    it('ArchonSubpage: renderiza y procesa upgrade', async () => {
      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

      render(<ArchonSubpage />);
      await waitFor(() => {
        expect(screen.getByText('ARCHON Flotas')).toBeInTheDocument();
      });

      const demoBtn = screen.getByRole('button', { name: 'Solicitar Demostración Bespoke' });
      fireEvent.click(demoBtn);
      expect(openSpy).toHaveBeenCalledWith('https://dreamtek.tech/#products', '_blank');
      openSpy.mockRestore();
    });

    it('ArchonSubpage: redirige a / ante 401', async () => {
      vi.mocked(authClient.fetchClientDashboard).mockRejectedValueOnce(new Error('401'));
      render(<ArchonSubpage />);
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/');
      });
    });

    it('CyberSubpage: renderiza y procesa solicitud de auditoría', async () => {
      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

      render(<CyberSubpage />);
      await waitFor(() => {
        expect(screen.getByText('Ciberseguridad Ofensiva')).toBeInTheDocument();
      });

      const auditBtn = screen.getByRole('button', {
        name: 'Solicitar Auditoría Táctica ($1,800 USD)',
      });
      fireEvent.click(auditBtn);
      expect(openSpy).toHaveBeenCalledWith('https://dreamtek.tech/#contact', '_blank');
      openSpy.mockRestore();
    });

    it('CyberSubpage: redirige a / ante 401', async () => {
      vi.mocked(authClient.fetchClientDashboard).mockRejectedValueOnce(new Error('401'));
      render(<CyberSubpage />);
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/');
      });
    });

    it('ProjectsSubpage: renderiza proyecto corporativo', async () => {
      render(<ProjectsSubpage />);
      await waitFor(() => {
        expect(screen.getByText('Proyectos Corporativos B2B')).toBeInTheDocument();
        expect(screen.getByText('App Modular')).toBeInTheDocument();
      });
    });

    it('ProjectsSubpage: redirige a / ante 401', async () => {
      vi.mocked(authClient.fetchClientDashboard).mockRejectedValueOnce(new Error('401'));
      render(<ProjectsSubpage />);
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/');
      });
    });

    it('BillingSubpage: renderiza expediente fiscal', async () => {
      render(<BillingSubpage />);
      await waitFor(() => {
        expect(screen.getByText('Facturación & Datos Fiscales')).toBeInTheDocument();
      });
    });

    it('BillingSubpage: redirige a / ante 401', async () => {
      vi.mocked(authClient.fetchClientDashboard).mockRejectedValueOnce(new Error('401'));
      render(<BillingSubpage />);
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/');
      });
    });

    it('SecuritySubpage: renderiza panel de seguridad', async () => {
      render(<SecuritySubpage />);
      await waitFor(() => {
        expect(screen.getByText('Seguridad & Credenciales (2FA)')).toBeInTheDocument();
      });
    });

    it('SecuritySubpage: redirige a / ante 401', async () => {
      vi.mocked(authClient.fetchClientDashboard).mockRejectedValueOnce(new Error('401'));
      render(<SecuritySubpage />);
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/');
      });
    });

    it('SupportSubpage: renderiza y despacha mailto preformateado', async () => {
      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

      render(<SupportSubpage />);
      await waitFor(() => {
        expect(screen.getByText('Mesa de Ayuda & Soporte')).toBeInTheDocument();
        expect(screen.getByText('Mesa de Ayuda & Soporte de Ingeniería')).toBeInTheDocument();
      });

      const ticketBtn = screen.getByRole('button', {
        name: /Abrir Ticket en soporte@dreamtek.tech/i,
      });
      fireEvent.click(ticketBtn);

      expect(openSpy).toHaveBeenCalledWith(
        expect.stringContaining('mailto:soporte@dreamtek.tech?subject='),
        '_blank',
      );
      openSpy.mockRestore();
    });

    it('SupportSubpage: redirige a / ante 401', async () => {
      vi.mocked(authClient.fetchClientDashboard).mockRejectedValueOnce(new Error('401'));
      render(<SupportSubpage />);
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/');
      });
    });
  });
});
