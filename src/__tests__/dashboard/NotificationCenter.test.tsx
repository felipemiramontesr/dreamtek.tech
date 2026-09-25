/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { NotificationBell } from '@/components/dashboard/client/NotificationBell';
import { NotificationDrawer } from '@/components/dashboard/client/NotificationDrawer';
import { ClientWebhooksWidget } from '@/components/dashboard/client/ClientWebhooksWidget';
import * as clientAuth from '@/lib/auth/client';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

describe('FC 053: Frontend Client Notification Center & Security Webhooks Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('1. NotificationBell Component', () => {
    it('debe renderizar el botón sin badge cuando unread_count es 0', async () => {
      vi.spyOn(clientAuth, 'fetchClientNotifications').mockResolvedValue({
        status: 'success',
        notifications: [],
        total: 0,
        unread_count: 0,
        page: 1,
        total_pages: 1,
      });

      render(<NotificationBell />);

      await act(async () => {
        await Promise.resolve();
      });

      const btn = screen.getByTestId('notification-bell-btn');
      expect(btn).toBeInTheDocument();
      expect(btn).toHaveAttribute('aria-label', 'Notificaciones');
      expect(screen.queryByTestId('notification-badge')).not.toBeInTheDocument();
    });

    it('debe mostrar badge con conteo y aria-label actualizado cuando unread_count > 0', async () => {
      vi.spyOn(clientAuth, 'fetchClientNotifications').mockResolvedValue({
        status: 'success',
        notifications: [],
        total: 5,
        unread_count: 5,
        page: 1,
        total_pages: 1,
      });

      render(<NotificationBell />);

      await act(async () => {
        await Promise.resolve();
      });

      const badge = screen.getByTestId('notification-badge');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('5');

      const btn = screen.getByTestId('notification-bell-btn');
      expect(btn).toHaveAttribute('aria-label', '5 notificaciones no leídas');
    });

    it('debe mostrar 99+ en el badge cuando unread_count es mayor a 99', async () => {
      vi.spyOn(clientAuth, 'fetchClientNotifications').mockResolvedValue({
        status: 'success',
        notifications: [],
        total: 150,
        unread_count: 150,
        page: 1,
        total_pages: 5,
      });

      render(<NotificationBell />);

      await act(async () => {
        await Promise.resolve();
      });

      const badge = screen.getByTestId('notification-badge');
      expect(badge).toHaveTextContent('99+');
    });

    it('debe alternar la apertura del cajón de notificaciones al hacer clic', async () => {
      vi.spyOn(clientAuth, 'fetchClientNotifications').mockResolvedValue({
        status: 'success',
        notifications: [],
        total: 0,
        unread_count: 0,
        page: 1,
        total_pages: 1,
      });

      render(<NotificationBell />);

      const btn = screen.getByTestId('notification-bell-btn');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      await act(async () => {
        fireEvent.click(btn);
        await Promise.resolve();
      });
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      // Cerrar mediante botón de la drawer pasando por onClose del NotificationBell (L105)
      const closeDrawerBtn = screen.getByLabelText('Cerrar panel de notificaciones');
      await act(async () => {
        fireEvent.click(closeDrawerBtn);
        await Promise.resolve();
      });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      // Reabrir y cerrar con segundo click en el botón de campana
      await act(async () => {
        fireEvent.click(btn);
        await Promise.resolve();
      });
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      await act(async () => {
        fireEvent.click(btn);
        await Promise.resolve();
      });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('debe tolerar fallos de red en polling de forma silenciosa', async () => {
      vi.spyOn(clientAuth, 'fetchClientNotifications').mockRejectedValue(
        new Error('Network error'),
      );

      render(<NotificationBell pollIntervalMs={5000} />);

      await act(async () => {
        vi.advanceTimersByTime(5000);
      });

      expect(screen.getByTestId('notification-bell-btn')).toBeInTheDocument();
    });

    it('debe ejecutar callback de intervalo y actualizar conteo periódicamente', async () => {
      vi.spyOn(clientAuth, 'fetchClientNotifications')
        .mockResolvedValueOnce({
          status: 'success',
          notifications: [],
          total: 1,
          unread_count: 1,
          page: 1,
          total_pages: 1,
        })
        .mockResolvedValueOnce({
          status: 'success',
          notifications: [],
          total: 8,
          unread_count: 8,
          page: 1,
          total_pages: 1,
        });

      render(<NotificationBell pollIntervalMs={1000} />);

      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.getByTestId('notification-badge')).toHaveTextContent('1');

      await act(async () => {
        vi.advanceTimersByTime(1000);
        await Promise.resolve();
      });

      expect(screen.getByTestId('notification-badge')).toHaveTextContent('8');
    });

    it('debe manejar respuesta sin unread_count asignando 0', async () => {
      vi.spyOn(clientAuth, 'fetchClientNotifications').mockResolvedValue({
        status: 'success',
        notifications: [],
        total: 0,
        page: 1,
        total_pages: 1,
      } as any);

      render(<NotificationBell pollIntervalMs={0} />);

      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.queryByTestId('notification-badge')).not.toBeInTheDocument();
    });

    it('debe ignorar actualizaciones de NotificationBell si se desmonta antes de resolver el fetch (active = false)', async () => {
      let resolvePromise: (val: any) => void = () => {};
      const pendingPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      vi.spyOn(clientAuth, 'fetchClientNotifications').mockReturnValue(pendingPromise as any);

      const { unmount } = render(<NotificationBell pollIntervalMs={0} />);
      unmount();

      await act(async () => {
        resolvePromise({
          status: 'success',
          notifications: [],
          total: 10,
          unread_count: 10,
          page: 1,
          total_pages: 1,
        });
        await Promise.resolve();
      });
    });

    it('debe actualizar conteo cuando la drawer invoca onNotificationsChanged', async () => {
      const fetchSpy = vi.spyOn(clientAuth, 'fetchClientNotifications').mockResolvedValue({
        status: 'success',
        notifications: [
          {
            id: 1,
            tenant_id: 10,
            event_type: 'SECURITY_ALERT',
            severity: 'CRITICAL',
            title: 'Alerta',
            message: 'Alerta',
            is_read: false,
            created_at: '2026-09-25T10:00:00Z',
          },
        ],
        total: 1,
        unread_count: 1,
        page: 1,
        total_pages: 1,
      });
      vi.spyOn(clientAuth, 'markNotificationsAsRead').mockResolvedValue({
        status: 'success',
        marked_count: 1,
      });

      render(<NotificationBell pollIntervalMs={0} />);

      await act(async () => {
        await Promise.resolve();
      });

      // Abrir drawer
      const btn = screen.getByTestId('notification-bell-btn');
      await act(async () => {
        fireEvent.click(btn);
        await Promise.resolve();
      });

      // Marcar todas como leídas dentro de la drawer, lo que llama a onNotificationsChanged
      const markAllBtn = screen.getByText('Marcar todas como leídas');
      await act(async () => {
        fireEvent.click(markAllBtn);
        await Promise.resolve();
      });

      expect(fetchSpy).toHaveBeenCalled();
    });
  });

  describe('2. NotificationDrawer Component', () => {
    const mockNotifications: clientAuth.ClientNotification[] = [
      {
        id: 1,
        tenant_id: 10,
        event_type: 'SECURITY_ALERT',
        severity: 'CRITICAL',
        title: 'Intento de Acceso Anómalo',
        message: 'IP bloqueada por política perimetral.',
        action_url: '/client/dashboard/security',
        is_read: false,
        created_at: '2026-09-25T10:00:00Z',
      },
      {
        id: 2,
        tenant_id: 10,
        event_type: 'PROJECT_UPDATE',
        severity: 'WARNING',
        title: 'Hito 2 en Espera de Firma',
        message: 'Por favor revise el entregable de arquitectura.',
        action_url: '/client/dashboard/projects',
        is_read: true,
        created_at: '2026-09-25T11:00:00Z',
      },
      {
        id: 3,
        tenant_id: 10,
        event_type: 'BILLING_INVOICE',
        severity: 'INFO',
        title: 'Factura Disponible',
        message: 'Comprobante fiscal CFDI generado.',
        action_url: 'https://attacker.com/steal-token', // Unsafe external URL (C-053.5)
        is_read: false,
        created_at: '2026-09-25T12:00:00Z',
      },
    ];

    it('no debe renderizar nada cuando isOpen es false', () => {
      const { container } = render(<NotificationDrawer isOpen={false} onClose={vi.fn()} />);
      expect(container.firstChild).toBeNull();
    });

    it('debe cargar y renderizar notificaciones con sus severidades', async () => {
      vi.spyOn(clientAuth, 'fetchClientNotifications').mockResolvedValue({
        status: 'success',
        notifications: mockNotifications,
        total: 3,
        unread_count: 2,
        page: 1,
        total_pages: 1,
      });

      render(<NotificationDrawer isOpen={true} onClose={vi.fn()} />);

      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.getByText('Intento de Acceso Anómalo')).toBeInTheDocument();
      expect(screen.getByText('Hito 2 en Espera de Firma')).toBeInTheDocument();
      expect(screen.getByText('Factura Disponible')).toBeInTheDocument();
      expect(screen.getByText('CRÍTICO')).toBeInTheDocument();
      expect(screen.getByText('ALERTA')).toBeInTheDocument();
      expect(screen.getByText('INFO')).toBeInTheDocument();
      expect(screen.getByText('2 nuevas')).toBeInTheDocument();
    });

    it('debe cerrar el panel con el botón X, backdrop y tecla Escape', async () => {
      const onCloseMock = vi.fn();
      vi.spyOn(clientAuth, 'fetchClientNotifications').mockResolvedValue({
        status: 'success',
        notifications: [],
        total: 0,
        unread_count: 0,
        page: 1,
        total_pages: 1,
      });

      const { rerender } = render(<NotificationDrawer isOpen={true} onClose={onCloseMock} />);

      await act(async () => {
        await Promise.resolve();
      });

      // Botón X
      const closeBtn = screen.getByLabelText('Cerrar panel de notificaciones');
      await act(async () => {
        fireEvent.click(closeBtn);
      });
      expect(onCloseMock).toHaveBeenCalledTimes(1);

      // Backdrop
      const backdrop = screen.getByTestId('notification-backdrop');
      await act(async () => {
        fireEvent.click(backdrop);
      });
      expect(onCloseMock).toHaveBeenCalledTimes(2);

      // Tecla Escape
      await act(async () => {
        fireEvent.keyDown(window, { key: 'Escape' });
      });
      expect(onCloseMock).toHaveBeenCalledTimes(3);

      // Otra tecla no debe cerrar
      await act(async () => {
        fireEvent.keyDown(window, { key: 'Enter' });
      });
      expect(onCloseMock).toHaveBeenCalledTimes(3);

      rerender(<NotificationDrawer isOpen={false} onClose={onCloseMock} />);
      await act(async () => {
        fireEvent.keyDown(window, { key: 'Escape' });
      });
      expect(onCloseMock).toHaveBeenCalledTimes(3);
    });

    it('debe filtrar por tabs de tipo de evento', async () => {
      const fetchSpy = vi.spyOn(clientAuth, 'fetchClientNotifications').mockResolvedValue({
        status: 'success',
        notifications: [],
        total: 0,
        unread_count: 0,
        page: 1,
        total_pages: 1,
      });

      render(<NotificationDrawer isOpen={true} onClose={vi.fn()} />);

      await act(async () => {
        await Promise.resolve();
      });

      fireEvent.click(screen.getByText('Seguridad'));
      await act(async () => {
        await Promise.resolve();
      });
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'SECURITY_ALERT' }),
      );

      fireEvent.click(screen.getByText('Proyectos'));
      await act(async () => {
        await Promise.resolve();
      });
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'PROJECT_UPDATE' }),
      );

      fireEvent.click(screen.getByText('Facturación'));
      await act(async () => {
        await Promise.resolve();
      });
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'BILLING_INVOICE' }),
      );

      fireEvent.click(screen.getByText('Todas'));
      await act(async () => {
        await Promise.resolve();
      });
      expect(fetchSpy).toHaveBeenCalledWith(expect.objectContaining({ eventType: undefined }));
    });

    it('debe marcar todas las notificaciones como leídas', async () => {
      vi.spyOn(clientAuth, 'fetchClientNotifications').mockResolvedValue({
        status: 'success',
        notifications: mockNotifications,
        total: 3,
        unread_count: 2,
        page: 1,
        total_pages: 1,
      });
      const markSpy = vi.spyOn(clientAuth, 'markNotificationsAsRead').mockResolvedValue({
        status: 'success',
        marked_count: 2,
      });
      const onChangedMock = vi.fn();

      render(
        <NotificationDrawer
          isOpen={true}
          onClose={vi.fn()}
          onNotificationsChanged={onChangedMock}
        />,
      );

      await act(async () => {
        await Promise.resolve();
      });

      const markAllBtn = screen.getByText('Marcar todas como leídas');
      fireEvent.click(markAllBtn);

      await act(async () => {
        await Promise.resolve();
      });

      expect(markSpy).toHaveBeenCalledWith({ all: true });
      expect(onChangedMock).toHaveBeenCalled();
    });

    it('debe marcar un ítem individual como leído y navegar a URL interna segura (C-053.5)', async () => {
      vi.spyOn(clientAuth, 'fetchClientNotifications').mockResolvedValue({
        status: 'success',
        notifications: mockNotifications,
        total: 3,
        unread_count: 2,
        page: 1,
        total_pages: 1,
      });
      const markSpy = vi.spyOn(clientAuth, 'markNotificationsAsRead').mockResolvedValue({
        status: 'success',
        marked_count: 1,
      });
      const closeMock = vi.fn();
      const changedMock = vi.fn();

      render(
        <NotificationDrawer
          isOpen={true}
          onClose={closeMock}
          onNotificationsChanged={changedMock}
        />,
      );

      await act(async () => {
        await Promise.resolve();
      });

      // Clic en la primera notificación (no leída, action_url seguro)
      const notifItem = screen.getByText('Intento de Acceso Anómalo');
      fireEvent.click(notifItem);

      await act(async () => {
        await Promise.resolve();
      });

      expect(markSpy).toHaveBeenCalledWith({ notificationIds: [1] });
      expect(closeMock).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith('/client/dashboard/security');
      expect(changedMock).toHaveBeenCalled();
    });

    it('debe rechazar la navegación ante URLs no permitidas o externas (C-053.5)', async () => {
      vi.spyOn(clientAuth, 'fetchClientNotifications').mockResolvedValue({
        status: 'success',
        notifications: mockNotifications,
        total: 3,
        unread_count: 2,
        page: 1,
        total_pages: 1,
      });
      vi.spyOn(clientAuth, 'markNotificationsAsRead').mockResolvedValue({
        status: 'success',
        marked_count: 1,
      });
      mockPush.mockClear();

      render(<NotificationDrawer isOpen={true} onClose={vi.fn()} />);

      await act(async () => {
        await Promise.resolve();
      });

      // Clic en la tercera notificación con URL maliciosa externa
      const unsafeItem = screen.getByText('Factura Disponible');
      fireEvent.click(unsafeItem);

      await act(async () => {
        await Promise.resolve();
      });

      // NO debe haber llamado a router.push con la URL externa
      expect(mockPush).not.toHaveBeenCalledWith(expect.stringContaining('attacker.com'));
    });

    it('debe mostrar mensaje de error si falla la carga o la acción', async () => {
      vi.spyOn(clientAuth, 'fetchClientNotifications').mockRejectedValue(
        new Error('Fallo crítico'),
      );

      render(<NotificationDrawer isOpen={true} onClose={vi.fn()} />);

      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.getByText('Fallo crítico')).toBeInTheDocument();
    });

    it('debe manejar error al marcar todas como leídas y mostrar mensaje en el panel', async () => {
      vi.spyOn(clientAuth, 'fetchClientNotifications').mockResolvedValue({
        status: 'success',
        notifications: mockNotifications,
        total: 3,
        unread_count: 2,
        page: 1,
        total_pages: 1,
      });
      vi.spyOn(clientAuth, 'markNotificationsAsRead').mockRejectedValue(
        new Error('Fallo al marcar todas'),
      );

      render(<NotificationDrawer isOpen={true} onClose={vi.fn()} />);

      await act(async () => {
        await Promise.resolve();
      });

      const markAllBtn = screen.getByText('Marcar todas como leídas');
      await act(async () => {
        fireEvent.click(markAllBtn);
        await Promise.resolve();
      });

      expect(screen.getByText('Fallo al marcar todas')).toBeInTheDocument();
    });

    it('debe tolerar fallo silencioso al marcar notificación individual como leída y manejar ítem sin action_url', async () => {
      vi.spyOn(clientAuth, 'fetchClientNotifications').mockResolvedValue({
        status: 'success',
        notifications: [
          {
            id: 88,
            tenant_id: 10,
            event_type: 'SECURITY_ALERT',
            severity: 'CRITICAL',
            title: 'Notif Sin URL',
            message: 'Alerta sin enlace de acción.',
            is_read: false,
            created_at: '2026-09-25T10:00:00Z',
          },
        ],
        total: 1,
        unread_count: 1,
        page: 1,
        total_pages: 1,
      });
      vi.spyOn(clientAuth, 'markNotificationsAsRead').mockRejectedValue(
        new Error('Error silencioso'),
      );

      render(<NotificationDrawer isOpen={true} onClose={vi.fn()} />);

      await act(async () => {
        await Promise.resolve();
      });

      const item = screen.getByText('Notif Sin URL');
      await act(async () => {
        fireEvent.click(item);
        await Promise.resolve();
      });

      expect(mockPush).not.toHaveBeenCalled();
    });

    it('debe navegar directamente al hacer clic en notificación que ya estaba leída', async () => {
      vi.spyOn(clientAuth, 'fetchClientNotifications').mockResolvedValue({
        status: 'success',
        notifications: [
          {
            id: 99,
            tenant_id: 10,
            event_type: 'PROJECT_UPDATE',
            severity: 'INFO',
            title: 'Notif Ya Leída',
            message: 'Detalle de proyecto.',
            action_url: '/client/dashboard/projects',
            is_read: true,
            created_at: '2026-09-25T10:00:00Z',
          },
        ],
        total: 1,
        unread_count: 0,
        page: 1,
        total_pages: 1,
      });
      const markSpy = vi.spyOn(clientAuth, 'markNotificationsAsRead');
      const closeMock = vi.fn();

      render(<NotificationDrawer isOpen={true} onClose={closeMock} />);

      await act(async () => {
        await Promise.resolve();
      });

      const item = screen.getByText('Notif Ya Leída');
      await act(async () => {
        fireEvent.click(item);
        await Promise.resolve();
      });

      // No debe marcar como leída porque ya lo estaba
      expect(markSpy).not.toHaveBeenCalled();
      expect(closeMock).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith('/client/dashboard/projects');
    });

    it('debe ignorar actualizaciones de estado si el componente se desmonta antes de resolver el fetch (active = false)', async () => {
      let resolvePromise: (val: any) => void = () => {};
      const pendingPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      vi.spyOn(clientAuth, 'fetchClientNotifications').mockReturnValue(pendingPromise as any);

      const { unmount } = render(<NotificationDrawer isOpen={true} onClose={vi.fn()} />);

      // Desmontar inmediatamente mientras el fetch está pendiente
      unmount();

      // Resolver después del desmontaje
      await act(async () => {
        resolvePromise({
          status: 'success',
          notifications: [],
          total: 0,
          unread_count: 0,
          page: 1,
          total_pages: 1,
        });
        await Promise.resolve();
      });
    });

    it('debe ignorar errores si el componente se desmonta antes del catch (active = false)', async () => {
      let rejectPromise: (err: any) => void = () => {};
      const pendingPromise = new Promise((_, reject) => {
        rejectPromise = reject;
      });

      vi.spyOn(clientAuth, 'fetchClientNotifications').mockReturnValue(pendingPromise as any);

      const { unmount } = render(<NotificationDrawer isOpen={true} onClose={vi.fn()} />);

      unmount();

      await act(async () => {
        rejectPromise(new Error('Fetch falló post-unmount'));
        await Promise.resolve();
      });
    });

    it('debe manejar respuesta sin arreglo de notificaciones ni unread_count asignando valores vacíos por defecto', async () => {
      vi.spyOn(clientAuth, 'fetchClientNotifications').mockResolvedValue({
        status: 'success',
      } as any);

      render(<NotificationDrawer isOpen={true} onClose={vi.fn()} />);

      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.getByText('No hay notificaciones')).toBeInTheDocument();
    });

    it('debe usar mensaje predeterminado cuando el error arrojado no tiene propiedad message', async () => {
      vi.spyOn(clientAuth, 'fetchClientNotifications').mockRejectedValue('Error plano sin objeto');

      render(<NotificationDrawer isOpen={true} onClose={vi.fn()} />);

      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.getByText('Error al cargar notificaciones.')).toBeInTheDocument();
    });

    it('debe usar mensaje predeterminado cuando markNotificationsAsRead falla sin mensaje', async () => {
      vi.spyOn(clientAuth, 'fetchClientNotifications').mockResolvedValue({
        status: 'success',
        notifications: mockNotifications,
        total: 3,
        unread_count: 2,
        page: 1,
        total_pages: 1,
      });
      vi.spyOn(clientAuth, 'markNotificationsAsRead').mockRejectedValue('Fallo crudo');

      render(<NotificationDrawer isOpen={true} onClose={vi.fn()} />);

      await act(async () => {
        await Promise.resolve();
      });

      const markAllBtn = screen.getByText('Marcar todas como leídas');
      await act(async () => {
        fireEvent.click(markAllBtn);
        await Promise.resolve();
      });

      expect(screen.getByText('No se pudieron marcar como leídas.')).toBeInTheDocument();
    });
  });

  describe('3. ClientWebhooksWidget Component', () => {
    const mockWebhooks: clientAuth.ClientWebhookSubscription[] = [
      {
        id: 101,
        tenant_id: 10,
        target_url: 'https://api.empresa.com/webhook',
        events: ['SECURITY_ALERT', 'PROJECT_UPDATE'],
        is_active: true,
        created_at: '2026-09-25T10:00:00Z',
        updated_at: '2026-09-25T10:00:00Z',
      },
    ];

    it('debe listar los webhooks activos del tenant', async () => {
      vi.spyOn(clientAuth, 'fetchClientWebhooks').mockResolvedValue({
        status: 'success',
        subscriptions: mockWebhooks,
      });

      render(<ClientWebhooksWidget />);

      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.getByText('https://api.empresa.com/webhook')).toBeInTheDocument();
      expect(screen.getByText('Seguridad')).toBeInTheDocument();
      expect(screen.getByText('Proyectos')).toBeInTheDocument();
      expect(screen.getByText('Activo')).toBeInTheDocument();
    });

    it('debe mostrar estado vacío cuando no hay webhooks', async () => {
      vi.spyOn(clientAuth, 'fetchClientWebhooks').mockResolvedValue({
        status: 'success',
        subscriptions: [],
      });

      render(<ClientWebhooksWidget />);

      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.getByText('No hay webhooks registrados')).toBeInTheDocument();
    });

    it('debe abrir modal, validar y registrar webhook revelando secreto único (C-053.3)', async () => {
      vi.spyOn(clientAuth, 'fetchClientWebhooks').mockResolvedValue({
        status: 'success',
        subscriptions: [],
      });
      const createSpy = vi.spyOn(clientAuth, 'createClientWebhook').mockResolvedValue({
        status: 'success',
        message: 'Creado',
        subscription: mockWebhooks[0],
        secret: 'secret_hex_32_bytes_test_token_123',
      });

      render(<ClientWebhooksWidget />);

      await act(async () => {
        await Promise.resolve();
      });

      // Abrir modal
      fireEvent.click(screen.getByText('+ Registrar Webhook'));
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      // Completar formulario
      const urlInput = screen.getByLabelText(/URL de Destino/i);
      fireEvent.change(urlInput, { target: { value: 'https://siem.corp.com/alerts' } });

      // Enviar
      fireEvent.click(screen.getByText('Crear Suscripción'));

      await act(async () => {
        await Promise.resolve();
      });

      expect(createSpy).toHaveBeenCalledWith({
        target_url: 'https://siem.corp.com/alerts',
        events: ['SECURITY_ALERT', 'PROJECT_UPDATE', 'BILLING_INVOICE'],
      });

      // Pantalla de secreto único revelado
      expect(screen.getByText('Webhook Registrado Exitosamente')).toBeInTheDocument();
      expect(screen.getByDisplayValue('secret_hex_32_bytes_test_token_123')).toBeInTheDocument();
      expect(screen.getByText(/NO se volverá a mostrar en texto plano jamás/i)).toBeInTheDocument();

      // Copiar secreto (camino exitoso try)
      const origClipboard = navigator.clipboard;
      (navigator as any).clipboard = {
        writeText: vi.fn().mockResolvedValue(undefined),
      };

      try {
        const copyBtn = screen.getByText('Copiar');
        await act(async () => {
          fireEvent.click(copyBtn);
          await Promise.resolve();
        });
        expect(screen.getByText('¡Copiado!')).toBeInTheDocument();

        // Avanzar timer 3s para resetear estado copiado
        await act(async () => {
          vi.advanceTimersByTime(3500);
          await Promise.resolve();
        });
        expect(screen.getByText('Copiar')).toBeInTheDocument();
      } finally {
        (navigator as any).clipboard = origClipboard;
      }

      // Cerrar modal
      fireEvent.click(screen.getByText('Entendido, he guardado el secreto'));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('debe ejecutar Test Ping exitoso y mostrar status con latencia', async () => {
      vi.spyOn(clientAuth, 'fetchClientWebhooks').mockResolvedValue({
        status: 'success',
        subscriptions: mockWebhooks,
      });
      const pingSpy = vi.spyOn(clientAuth, 'testClientWebhook').mockResolvedValue({
        status: 'success',
        message: 'Test completado',
        ping: {
          success: true,
          statusCode: 200,
          durationMs: 75,
        },
      });

      render(<ClientWebhooksWidget />);

      await act(async () => {
        await Promise.resolve();
      });

      const pingBtn = screen.getByText('Test Ping');
      fireEvent.click(pingBtn);

      await act(async () => {
        await Promise.resolve();
      });

      expect(pingSpy).toHaveBeenCalledWith(101);
      expect(screen.getByText(/Ping exitoso \(200\) en 75ms/)).toBeInTheDocument();
    });

    it('debe ejecutar Test Ping fallido y mostrar error', async () => {
      vi.spyOn(clientAuth, 'fetchClientWebhooks').mockResolvedValue({
        status: 'success',
        subscriptions: mockWebhooks,
      });
      vi.spyOn(clientAuth, 'testClientWebhook').mockResolvedValue({
        status: 'success',
        message: 'Fallo',
        ping: {
          success: false,
          statusCode: 504,
          error: 'Gateway Timeout',
          durationMs: 5000,
        },
      });

      render(<ClientWebhooksWidget />);

      await act(async () => {
        await Promise.resolve();
      });

      fireEvent.click(screen.getByText('Test Ping'));

      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.getByText(/Fallo: Gateway Timeout/)).toBeInTheDocument();
    });

    it('debe eliminar un webhook tras confirmación', async () => {
      vi.spyOn(clientAuth, 'fetchClientWebhooks').mockResolvedValue({
        status: 'success',
        subscriptions: mockWebhooks,
      });
      const deleteSpy = vi.spyOn(clientAuth, 'deleteClientWebhook').mockResolvedValue({
        status: 'success',
        message: 'Eliminado',
      });
      vi.spyOn(window, 'confirm').mockReturnValue(true);

      render(<ClientWebhooksWidget />);

      await act(async () => {
        await Promise.resolve();
      });

      const delBtn = screen.getByText('Eliminar');
      fireEvent.click(delBtn);

      await act(async () => {
        await Promise.resolve();
      });

      expect(deleteSpy).toHaveBeenCalledWith(101);
      expect(screen.getByText('Webhook eliminado exitosamente.')).toBeInTheDocument();
      expect(screen.queryByText('https://api.empresa.com/webhook')).not.toBeInTheDocument();

      // Descartar alerta de éxito
      const closeSuccessBtn = screen.getByText('✕');
      await act(async () => {
        fireEvent.click(closeSuccessBtn);
        await Promise.resolve();
      });
      expect(screen.queryByText('Webhook eliminado exitosamente.')).not.toBeInTheDocument();
    });

    it('no debe eliminar el webhook si el usuario cancela la confirmación', async () => {
      vi.spyOn(clientAuth, 'fetchClientWebhooks').mockResolvedValue({
        status: 'success',
        subscriptions: mockWebhooks,
      });
      const deleteSpy = vi.spyOn(clientAuth, 'deleteClientWebhook');
      vi.spyOn(window, 'confirm').mockReturnValue(false);

      render(<ClientWebhooksWidget />);

      await act(async () => {
        await Promise.resolve();
      });

      fireEvent.click(screen.getByText('Eliminar'));
      expect(deleteSpy).not.toHaveBeenCalled();
    });

    it('debe validar URL vacía o sin eventos seleccionados en el modal', async () => {
      vi.spyOn(clientAuth, 'fetchClientWebhooks').mockResolvedValue({
        status: 'success',
        subscriptions: [],
      });

      render(<ClientWebhooksWidget />);

      await act(async () => {
        await Promise.resolve();
      });

      fireEvent.click(screen.getByText('+ Registrar Webhook'));

      // Intentar enviar con URL vacía
      const form = screen.getByRole('dialog').querySelector('form')!;
      fireEvent.submit(form);
      expect(screen.getByText('Ingrese una URL válida para el webhook.')).toBeInTheDocument();

      // Escribir URL y desmarcar todos los eventos
      const urlInput = screen.getByLabelText(/URL de Destino/i);
      fireEvent.change(urlInput, { target: { value: 'https://test.com/hook' } });

      const checkboxes = screen.getAllByRole('checkbox');
      checkboxes.forEach((cb) => fireEvent.click(cb));

      fireEvent.submit(form);
      expect(
        screen.getByText('Debe seleccionar al menos un tipo de evento para suscribirse.'),
      ).toBeInTheDocument();
    });

    it('debe renderizar badges de eventos para BILLING_INVOICE y eventos no estándar', async () => {
      const complexWebhooks: clientAuth.ClientWebhookSubscription[] = [
        {
          id: 102,
          tenant_id: 10,
          target_url: 'https://billing.empresa.com/hook',
          events: ['BILLING_INVOICE', 'UNKNOWN_CUSTOM_EVENT' as any],
          is_active: false,
          created_at: '2026-09-25T10:00:00Z',
          updated_at: '2026-09-25T10:00:00Z',
        },
      ];

      vi.spyOn(clientAuth, 'fetchClientWebhooks').mockResolvedValue({
        status: 'success',
        subscriptions: complexWebhooks,
      });

      render(<ClientWebhooksWidget />);

      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.getByText('Facturación')).toBeInTheDocument();
      expect(screen.getByText('UNKNOWN_CUSTOM_EVENT')).toBeInTheDocument();
      expect(screen.getByText('Inactivo')).toBeInTheDocument();
    });

    it('debe permitir descartar alertas de error y éxito', async () => {
      vi.spyOn(clientAuth, 'fetchClientWebhooks').mockRejectedValue(new Error('Error de conexión'));

      render(<ClientWebhooksWidget />);

      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.getByText('Error de conexión')).toBeInTheDocument();

      // Descartar alerta de error
      const closeErrBtn = screen.getByText('✕');
      await act(async () => {
        fireEvent.click(closeErrBtn);
        await Promise.resolve();
      });

      expect(screen.queryByText('Error de conexión')).not.toBeInTheDocument();
    });

    it('debe manejar error al registrar webhook en el servidor', async () => {
      vi.spyOn(clientAuth, 'fetchClientWebhooks').mockResolvedValue({
        status: 'success',
        subscriptions: [],
      });
      vi.spyOn(clientAuth, 'createClientWebhook').mockRejectedValue(
        new Error('Destino bloqueado SSRF'),
      );

      render(<ClientWebhooksWidget />);

      await act(async () => {
        await Promise.resolve();
      });

      fireEvent.click(screen.getByText('+ Registrar Webhook'));

      const urlInput = screen.getByLabelText(/URL de Destino/i);
      fireEvent.change(urlInput, { target: { value: 'https://169.254.169.254' } });

      const form = screen.getByRole('dialog').querySelector('form')!;
      await act(async () => {
        fireEvent.submit(form);
        await Promise.resolve();
      });

      expect(screen.getByText('Destino bloqueado SSRF')).toBeInTheDocument();
    });

    it('debe manejar fallo de red o excepción inesperada en test ping', async () => {
      vi.spyOn(clientAuth, 'fetchClientWebhooks').mockResolvedValue({
        status: 'success',
        subscriptions: mockWebhooks,
      });
      vi.spyOn(clientAuth, 'testClientWebhook').mockRejectedValue(new Error('Fallo de red DNS'));

      render(<ClientWebhooksWidget />);

      await act(async () => {
        await Promise.resolve();
      });

      const pingBtn = screen.getByText('Test Ping');
      await act(async () => {
        fireEvent.click(pingBtn);
        await Promise.resolve();
      });

      expect(screen.getByText(/Fallo de red DNS/)).toBeInTheDocument();
    });

    it('debe manejar error al eliminar webhook', async () => {
      vi.spyOn(clientAuth, 'fetchClientWebhooks').mockResolvedValue({
        status: 'success',
        subscriptions: mockWebhooks,
      });
      vi.spyOn(clientAuth, 'deleteClientWebhook').mockRejectedValue(new Error('No autorizado'));
      vi.spyOn(window, 'confirm').mockReturnValue(true);

      render(<ClientWebhooksWidget />);

      await act(async () => {
        await Promise.resolve();
      });

      const delBtn = screen.getByText('Eliminar');
      await act(async () => {
        fireEvent.click(delBtn);
        await Promise.resolve();
      });

      expect(screen.getByText('No autorizado')).toBeInTheDocument();
    });

    it('debe tolerar fallo al copiar el secreto al portapapeles', async () => {
      vi.spyOn(clientAuth, 'fetchClientWebhooks').mockResolvedValue({
        status: 'success',
        subscriptions: [],
      });
      vi.spyOn(clientAuth, 'createClientWebhook').mockResolvedValue({
        status: 'success',
        message: 'Creado',
        subscription: mockWebhooks[0],
        secret: 'test_secret_32bytes',
      });

      // Simular fallo en clipboard
      const origClipboard = navigator.clipboard;
      (navigator as any).clipboard = {
        writeText: vi.fn().mockRejectedValue(new Error('Clipboard blocked')),
      };

      try {
        render(<ClientWebhooksWidget />);

        await act(async () => {
          await Promise.resolve();
        });

        fireEvent.click(screen.getByText('+ Registrar Webhook'));

        const urlInput = screen.getByLabelText(/URL de Destino/i);
        fireEvent.change(urlInput, { target: { value: 'https://siem.corp.com/hook' } });

        const form = screen.getByRole('dialog').querySelector('form')!;
        await act(async () => {
          fireEvent.submit(form);
          await Promise.resolve();
        });

        const copyBtn = screen.getByText('Copiar');
        await act(async () => {
          fireEvent.click(copyBtn);
          await Promise.resolve();
        });

        expect(screen.getByText('¡Copiado!')).toBeInTheDocument();
      } finally {
        (navigator as any).clipboard = origClipboard;
      }
    });

    it('debe cancelar el modal de registro con el botón Cancelar y botón X', async () => {
      vi.spyOn(clientAuth, 'fetchClientWebhooks').mockResolvedValue({
        status: 'success',
        subscriptions: [],
      });

      render(<ClientWebhooksWidget />);

      await act(async () => {
        await Promise.resolve();
      });

      // Abrir y cancelar con botón Cancelar
      fireEvent.click(screen.getByText('+ Registrar Webhook'));
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Cancelar'));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      // Abrir y cerrar con botón X
      fireEvent.click(screen.getByText('+ Registrar Webhook'));
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      const closeBtn = screen.getByRole('dialog').querySelector('button[type="button"]')!;
      fireEvent.click(closeBtn);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
