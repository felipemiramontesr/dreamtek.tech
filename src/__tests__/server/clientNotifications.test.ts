/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import supertest from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import * as db from '../../../server/src/db';
import { clientNotificationsRouter } from '../../../server/src/routes/clientNotifications';
import {
  createNotificationSchema,
  NOTIFICATION_TYPES,
  NOTIFICATION_SEVERITIES,
} from '../../../server/src/schemas/notification.schema';
import {
  createClientNotification,
  resolveTenantForUser,
  getClientNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from '../../../server/src/services/clientNotificationService';

vi.mock('../../../server/src/db', () => {
  const mockQuery = vi.fn();
  return {
    query: mockQuery,
    withTransaction: vi.fn(async (cb: any) => cb({ query: mockQuery })),
    pool: {
      execute: vi.fn().mockResolvedValue([{ insertId: 1 }]),
    },
  };
});

const TEST_SECRET = 'dreamtek_dev_jwt_secret_key_2026';

const getClientToken = (uid = 42, tenantId?: number) =>
  jwt.sign(
    { userId: uid, uid, email: `client_${uid}@empresa.com`, role: 'CLIENT', tenantId },
    TEST_SECRET,
    { algorithm: 'HS512' },
  );

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/v1/client/notifications', clientNotificationsRouter);

describe('FC 053 — Client Portal Notification Center Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Zod Schemas Validation (notification.schema.ts)', () => {
    it('debe aceptar notificaciones válidas con tipos, severidades y action_url interno', () => {
      const valid = {
        type: 'SECURITY_ALERT',
        severity: 'CRITICAL',
        title: 'Nuevo inicio de sesión detectado',
        message: 'Se ha registrado un acceso desde una nueva dirección IP.',
        action_url: '/client/dashboard/security',
      };
      const result = createNotificationSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('debe asignar severidad INFO por defecto si se omite', () => {
      const valid = {
        type: 'PROJECT_UPDATE',
        title: 'Hito completado',
        message: 'El Hito 2 ha sido entregado para revisión.',
      };
      const result = createNotificationSchema.safeParse(valid);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.severity).toBe('INFO');
        expect(result.data.action_url).toBeUndefined();
      }
    });

    it('debe rechazar action_url externos o que no inicien con /client/dashboard (C-053.5 Anti-Open-Redirect)', () => {
      const invalidUrls = [
        'https://malicious.site.com/exploit',
        'http://localhost:3000',
        '/admin/secret-panel',
        'javascript:alert(1)',
        '//evil.com',
      ];

      for (const url of invalidUrls) {
        const result = createNotificationSchema.safeParse({
          type: 'BILLING_EVENT',
          title: 'Factura lista',
          message: 'Tu comprobante fiscal ha sido procesado.',
          action_url: url,
        });
        expect(result.success).toBe(false);
      }
    });

    it('debe rechazar títulos vacíos o tipos no permitidos (ej: SUPPORT_TICKET no soportado aún)', () => {
      const resultEmptyTitle = createNotificationSchema.safeParse({
        type: 'SECURITY_ALERT',
        title: '',
        message: 'Contenido',
      });
      expect(resultEmptyTitle.success).toBe(false);

      const resultUnsupportedType = createNotificationSchema.safeParse({
        type: 'SUPPORT_TICKET',
        title: 'Ticket abierto',
        message: 'Contenido',
      });
      expect(resultUnsupportedType.success).toBe(false);
    });

    it('debe exportar arrays constantes inmutables de tipos y severidades', () => {
      expect(NOTIFICATION_TYPES).toContain('SECURITY_ALERT');
      expect(NOTIFICATION_TYPES).toContain('PROJECT_UPDATE');
      expect(NOTIFICATION_TYPES).toContain('BILLING_EVENT');
      expect(NOTIFICATION_SEVERITIES).toContain('INFO');
      expect(NOTIFICATION_SEVERITIES).toContain('WARNING');
      expect(NOTIFICATION_SEVERITIES).toContain('CRITICAL');
    });
  });

  describe('2. Service Layer & DB Tenant Resolution (clientNotificationService.ts)', () => {
    it('resolveTenantForUser debe resolver tenant_id desde client_projects (C-053.1)', async () => {
      (db.query as any).mockResolvedValueOnce([{ tenant_id: 10 }]);

      const tenantId = await resolveTenantForUser(42);
      expect(tenantId).toBe(10);
      expect(db.query).toHaveBeenCalledWith(
        'SELECT tenant_id FROM client_projects WHERE user_id = ? AND tenant_id IS NOT NULL LIMIT 1',
        [42],
      );
    });

    it('resolveTenantForUser debe resolver tenant_id desde client_sites si no hay proyectos', async () => {
      (db.query as any)
        .mockResolvedValueOnce([]) // client_projects vacío
        .mockResolvedValueOnce([{ tenant_id: 20 }]); // client_sites encontrado

      const tenantId = await resolveTenantForUser(42);
      expect(tenantId).toBe(20);
    });

    it('resolveTenantForUser debe resolver tenant_id desde tenants por owner_user_id si no hay sitios', async () => {
      (db.query as any)
        .mockResolvedValueOnce([]) // client_projects vacío
        .mockResolvedValueOnce([]) // client_sites vacío
        .mockResolvedValueOnce([{ id: 30 }]); // tenants encontrado

      const tenantId = await resolveTenantForUser(42);
      expect(tenantId).toBe(30);
    });

    it('resolveTenantForUser debe lanzar error 400 si el usuario no tiene registros previos ni tenant asignado (C-053.1)', async () => {
      (db.query as any)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await expect(resolveTenantForUser(99)).rejects.toMatchObject({
        message: 'Cuenta de usuario sin tenant asignado.',
        statusCode: 400,
      });
    });

    it('createClientNotification debe persistir una notificación e invocar query correctamente', async () => {
      (db.query as any).mockResolvedValueOnce({ insertId: 101 });

      const notifId = await createClientNotification({
        tenantId: 10,
        userId: 42,
        type: 'SECURITY_ALERT',
        severity: 'WARNING',
        title: 'Prueba',
        message: 'Mensaje de prueba',
        actionUrl: '/client/dashboard/security',
      });

      expect(notifId).toBe(101);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO client_notifications'),
        [
          10,
          42,
          'SECURITY_ALERT',
          'WARNING',
          'Prueba',
          'Mensaje de prueba',
          '/client/dashboard/security',
        ],
      );
    });

    it('createClientNotification debe auto-resolver tenantId si no es proporcionado', async () => {
      // 1. resolveTenantForUser lookup
      (db.query as any)
        .mockResolvedValueOnce([{ tenant_id: 15 }]) // resolveTenantForUser
        .mockResolvedValueOnce({ insertId: 102 }); // insert

      const notifId = await createClientNotification({
        userId: 42,
        type: 'BILLING_EVENT',
        title: 'Pago recibido',
        message: 'Anticipo confirmado',
      });

      expect(notifId).toBe(102);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO client_notifications'),
        [15, 42, 'BILLING_EVENT', 'INFO', 'Pago recibido', 'Anticipo confirmado', null],
      );
    });

    it('getClientNotifications debe calcular total y unreadCount con filtros paginados', async () => {
      // Count total
      (db.query as any)
        .mockResolvedValueOnce([{ total: 10 }])
        // Count unread
        .mockResolvedValueOnce([{ unread_count: 3 }])
        // List rows
        .mockResolvedValueOnce([
          {
            id: 1,
            tenant_id: 10,
            user_id: 42,
            type: 'SECURITY_ALERT',
            severity: 'INFO',
            title: 'Test',
            message: 'Hola',
            action_url: null,
            is_read: 0,
            created_at: '2026-09-25 12:00:00',
            read_at: null,
          },
        ]);

      const res = await getClientNotifications({
        tenantId: 10,
        userId: 42,
        isRead: false,
        limit: 10,
        offset: 0,
      });

      expect(res.total).toBe(10);
      expect(res.unreadCount).toBe(3);
      expect(res.notifications).toHaveLength(1);

      // Clamping de limit y offset (undefined, negativo, mayor a 100) y rows vacíos
      (db.query as any)
        .mockResolvedValueOnce([]) // countRows vacío
        .mockResolvedValueOnce([]) // unreadRows vacío
        .mockResolvedValueOnce([]); // rows vacío

      const resClamp = await getClientNotifications({
        tenantId: 10,
        userId: 42,
        limit: 500, // Clamps to 100
        offset: -10, // Clamps to 0
      });

      expect(resClamp.total).toBe(0);
      expect(resClamp.unreadCount).toBe(0);

      // limit negativo que clampea a 1 y offset undefined
      (db.query as any)
        .mockResolvedValueOnce([{ total: 0 }])
        .mockResolvedValueOnce([{ unread_count: 0 }])
        .mockResolvedValueOnce([]);

      const resClampMin = await getClientNotifications({
        tenantId: 10,
        userId: 42,
        limit: -5, // Clamps to 1
      });
      expect(resClampMin.total).toBe(0);

      // limit y offset omitidos / undefined (cubre ramas de default || 20 y || 0)
      (db.query as any)
        .mockResolvedValueOnce([{ total: 0 }])
        .mockResolvedValueOnce([{ unread_count: 0 }])
        .mockResolvedValueOnce([]);

      const resDefault = await getClientNotifications({
        tenantId: 10,
        userId: 42,
      });
      expect(resDefault.total).toBe(0);
    });

    it('markNotificationAsRead debe retornar true si actualizó la fila y false si no', async () => {
      (db.query as any).mockResolvedValueOnce({ affectedRows: 1 });
      const ok = await markNotificationAsRead(1, 10, 42);
      expect(ok).toBe(true);

      (db.query as any).mockResolvedValueOnce({ affectedRows: 0 });
      const notFound = await markNotificationAsRead(999, 10, 42);
      expect(notFound).toBe(false);
    });

    it('markAllNotificationsAsRead debe marcar todas las no leídas y retornar affectedRows', async () => {
      (db.query as any).mockResolvedValueOnce({ affectedRows: 5 });
      const count = await markAllNotificationsAsRead(10, 42);
      expect(count).toBe(5);
    });
  });

  describe('3. REST Endpoints Integration & Anti-IDOR Tests (/api/v1/client/notifications)', () => {
    it('debe retornar 401 si se intenta consultar notificaciones sin autenticación', async () => {
      const res = await supertest(app).get('/api/v1/client/notifications');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    it('GET /api/v1/client/notifications debe retornar listado y contadores con cookie HttpOnly', async () => {
      const token = getClientToken(42, 10);

      // 1. count total, 2. count unread, 3. list rows
      (db.query as any)
        .mockResolvedValueOnce([{ total: 1 }])
        .mockResolvedValueOnce([{ unread_count: 1 }])
        .mockResolvedValueOnce([
          {
            id: 50,
            tenant_id: 10,
            user_id: 42,
            type: 'PROJECT_UPDATE',
            severity: 'INFO',
            title: 'Siguiente Sprint',
            message: 'Comenzó el desarrollo del hito 3.',
            action_url: '/client/dashboard/projects',
            is_read: 0,
            created_at: '2026-09-25T12:00:00.000Z',
            read_at: null,
          },
        ]);

      const res = await supertest(app)
        .get('/api/v1/client/notifications?limit=10&offset=0&is_read=false')
        .set('Cookie', [`dreamtek_session=${token}`]);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.total).toBe(1);
      expect(res.body.data.unreadCount).toBe(1);
      expect(res.body.data.notifications[0].title).toBe('Siguiente Sprint');
    });

    it('GET /api/v1/client/notifications debe manejar filtro is_read=true e is_read=false', async () => {
      const token = getClientToken(42, 10);

      (db.query as any)
        .mockResolvedValueOnce([{ total: 0 }])
        .mockResolvedValueOnce([{ unread_count: 0 }])
        .mockResolvedValueOnce([]);

      const res = await supertest(app)
        .get('/api/v1/client/notifications?is_read=true')
        .set('Cookie', [`dreamtek_session=${token}`]);

      expect(res.status).toBe(200);
    });

    it('GET /api/v1/client/notifications debe manejar excepciones 500 de base de datos', async () => {
      const token = getClientToken(42, 10);
      (db.query as any).mockRejectedValueOnce(new Error('DB Connection Timeout'));

      const res = await supertest(app)
        .get('/api/v1/client/notifications')
        .set('Cookie', [`dreamtek_session=${token}`]);

      expect(res.status).toBe(500);
      expect(res.body.status).toBe('error');
      expect(res.body.message).toContain('Error interno');
    });

    it('PATCH /api/v1/client/notifications/:id/read debe marcar como leída exitosamente (200)', async () => {
      const token = getClientToken(42, 10);
      (db.query as any).mockResolvedValueOnce({ affectedRows: 1 });

      const res = await supertest(app)
        .patch('/api/v1/client/notifications/50/read')
        .set('Cookie', [`dreamtek_session=${token}`]);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.message).toBe('Notificación marcada como leída.');
    });

    it('PATCH /api/v1/client/notifications/:id/read debe retornar 404 ante intentos de acceso cruzado entre tenants (C-053.1 Anti-IDOR)', async () => {
      const token = getClientToken(42, 10);
      // Intento de marcar notificación de otro tenant -> affectedRows = 0
      (db.query as any).mockResolvedValueOnce({ affectedRows: 0 });

      const res = await supertest(app)
        .patch('/api/v1/client/notifications/999/read')
        .set('Cookie', [`dreamtek_session=${token}`]);

      expect(res.status).toBe(404);
      expect(res.body.status).toBe('error');
      expect(res.body.message).toContain('no encontrada o no pertenece');
    });

    it('PATCH /api/v1/client/notifications/:id/read debe manejar excepciones 500', async () => {
      const token = getClientToken(42, 10);
      (db.query as any).mockRejectedValueOnce(new Error('Fatal DB Crash'));

      const res = await supertest(app)
        .patch('/api/v1/client/notifications/50/read')
        .set('Cookie', [`dreamtek_session=${token}`]);

      expect(res.status).toBe(500);
      expect(res.body.status).toBe('error');
    });

    it('POST /api/v1/client/notifications/read-all debe marcar todas las no leídas (200)', async () => {
      const token = getClientToken(42, 10);
      (db.query as any).mockResolvedValueOnce({ affectedRows: 4 });

      const res = await supertest(app)
        .post('/api/v1/client/notifications/read-all')
        .set('Cookie', [`dreamtek_session=${token}`]);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.markedCount).toBe(4);
    });

    it('POST /api/v1/client/notifications/read-all debe manejar excepciones 500', async () => {
      const token = getClientToken(42, 10);
      (db.query as any).mockRejectedValueOnce(new Error('DB Crash'));

      const res = await supertest(app)
        .post('/api/v1/client/notifications/read-all')
        .set('Cookie', [`dreamtek_session=${token}`]);

      expect(res.status).toBe(500);
      expect(res.body.status).toBe('error');
    });

    it('GET /api/v1/client/notifications debe procesar is_read=1, is_read=0, y auto-resolver tenantId si no viene en token', async () => {
      // 1. is_read=1
      const tokenNoTenant = getClientToken(42, undefined);
      (db.query as any)
        .mockResolvedValueOnce([{ tenant_id: 10 }]) // resolveTenantForUser
        .mockResolvedValueOnce([{ total: 0 }])
        .mockResolvedValueOnce([{ unread_count: 0 }])
        .mockResolvedValueOnce([]);

      const res1 = await supertest(app)
        .get('/api/v1/client/notifications?is_read=1')
        .set('Cookie', [`dreamtek_session=${tokenNoTenant}`]);

      expect(res1.status).toBe(200);

      // 2. is_read=0
      (db.query as any)
        .mockResolvedValueOnce([{ tenant_id: 10 }]) // resolveTenantForUser
        .mockResolvedValueOnce([{ total: 0 }])
        .mockResolvedValueOnce([{ unread_count: 0 }])
        .mockResolvedValueOnce([]);

      const res2 = await supertest(app)
        .get('/api/v1/client/notifications?is_read=0')
        .set('Cookie', [`dreamtek_session=${tokenNoTenant}`]);

      expect(res2.status).toBe(200);

      // 3. is_read con valor inválido que evalúa a undefined
      (db.query as any)
        .mockResolvedValueOnce([{ tenant_id: 10 }]) // resolveTenantForUser
        .mockResolvedValueOnce([{ total: 0 }])
        .mockResolvedValueOnce([{ unread_count: 0 }])
        .mockResolvedValueOnce([]);

      const res3 = await supertest(app)
        .get('/api/v1/client/notifications?is_read=invalid_param')
        .set('Cookie', [`dreamtek_session=${tokenNoTenant}`]);

      expect(res3.status).toBe(200);
    });

    it('PATCH y POST /read-all deben auto-resolver tenantId si el token no tiene tenantId', async () => {
      const tokenNoTenant = getClientToken(42, undefined);

      // PATCH con tenantId resuelto
      (db.query as any)
        .mockResolvedValueOnce([{ tenant_id: 10 }]) // resolveTenantForUser
        .mockResolvedValueOnce({ affectedRows: 1 });

      const patchRes = await supertest(app)
        .patch('/api/v1/client/notifications/55/read')
        .set('Cookie', [`dreamtek_session=${tokenNoTenant}`]);

      expect(patchRes.status).toBe(200);

      // POST read-all con tenantId resuelto
      (db.query as any)
        .mockResolvedValueOnce([{ tenant_id: 10 }]) // resolveTenantForUser
        .mockResolvedValueOnce({ affectedRows: 2 });

      const postRes = await supertest(app)
        .post('/api/v1/client/notifications/read-all')
        .set('Cookie', [`dreamtek_session=${tokenNoTenant}`]);

      expect(postRes.status).toBe(200);
      expect(postRes.body.data.markedCount).toBe(2);
    });

    it('debe retornar HTTP 400 en todas las rutas si el usuario no tiene tenant asignado (C-053.1)', async () => {
      const tokenNoTenant = getClientToken(99, undefined);

      // GET /
      (db.query as any)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      const getRes = await supertest(app)
        .get('/api/v1/client/notifications')
        .set('Cookie', [`dreamtek_session=${tokenNoTenant}`]);
      expect(getRes.status).toBe(400);
      expect(getRes.body.message).toContain('sin tenant asignado');

      // PATCH /:id/read
      (db.query as any)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      const patchRes = await supertest(app)
        .patch('/api/v1/client/notifications/10/read')
        .set('Cookie', [`dreamtek_session=${tokenNoTenant}`]);
      expect(patchRes.status).toBe(400);
      expect(patchRes.body.message).toContain('sin tenant asignado');

      // POST /read-all
      (db.query as any)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      const postRes = await supertest(app)
        .post('/api/v1/client/notifications/read-all')
        .set('Cookie', [`dreamtek_session=${tokenNoTenant}`]);
      expect(postRes.status).toBe(400);
      expect(postRes.body.message).toContain('sin tenant asignado');
    });
  });
});
