/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import supertest from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import * as db from '../../../server/src/db';
import { clientWebhooksRouter } from '../../../server/src/routes/clientWebhooks';
import {
  validateClientWebhookUrl,
  dispatchClientWebhook,
  dispatchTestWebhook,
} from '../../../server/src/services/clientWebhookDispatcher';
import { encryptField } from '../../../server/src/utils/crypto';
import dns from 'dns';

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
app.use('/api/v1/client/webhooks', clientWebhooksRouter);

describe('FC 053 — Client Webhooks & Outbound Security Engine Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Anti-SSRF URL Validation (C-053.2)', () => {
    it('debe rechazar protocolos no permitidos (ftp, file, javascript)', async () => {
      const resFtp = await validateClientWebhookUrl('ftp://example.com/webhook');
      expect(resFtp.valid).toBe(false);
      expect(resFtp.error).toContain('Protocolo no permitido');

      const resJs = await validateClientWebhookUrl('javascript:alert(1)');
      expect(resJs.valid).toBe(false);
    });

    it('debe forzar HTTPS en entorno de producción', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const resHttp = await validateClientWebhookUrl('http://api.miempresa.com/hooks');
      expect(resHttp.valid).toBe(false);
      expect(resHttp.error).toContain('requiere protocolo HTTPS seguro');

      const resHttps = await validateClientWebhookUrl('https://api.miempresa.com/hooks');
      expect(resHttps.valid).toBe(true);

      process.env.NODE_ENV = originalEnv;
    });

    it('debe bloquear hostnames locales y loopback (localhost, 127.0.0.1, ::1, 0.0.0.0)', async () => {
      const loopbackUrls = [
        'https://localhost/hook',
        'https://sub.localhost:8080/hook',
        'https://app.local/webhook',
        'https://127.0.0.1:8000/webhook',
        'https://127.0.1.1/webhook',
        'https://[::1]:3000/webhook',
        'https://0.0.0.0/webhook',
      ];

      for (const url of loopbackUrls) {
        const res = await validateClientWebhookUrl(url);
        expect(res.valid).toBe(false);
        expect(res.error).toMatch(/local|loopback/);
      }
    });

    it('debe bloquear servicios de metadatos de infraestructura cloud (169.254.169.254, metadata.google.internal)', async () => {
      const resAws = await validateClientWebhookUrl('https://169.254.169.254/latest/meta-data/');
      expect(resAws.valid).toBe(false);
      expect(resAws.error).toContain('metadatos');

      const resGcp = await validateClientWebhookUrl(
        'https://metadata.google.internal/computeMetadata/v1/',
      );
      expect(resGcp.valid).toBe(false);
      expect(resGcp.error).toContain('metadatos');
    });

    it('debe bloquear rangos privados IPv4 (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16) y link-local', async () => {
      const privateIps = [
        'https://10.0.0.5:443/webhook',
        'https://172.16.50.1/hook',
        'https://172.31.255.250/hook',
        'https://192.168.1.100/webhook',
        'https://169.254.1.1/hook',
      ];

      for (const url of privateIps) {
        const res = await validateClientWebhookUrl(url);
        expect(res.valid).toBe(false);
        expect(res.error).toMatch(/red privada|link-local/);
      }
    });

    it('debe bloquear rangos IPv6 privados y link-local (fe80, fc00, fd00, ::ffff)', async () => {
      const ipv6Urls = [
        'https://[fe80::1]/webhook',
        'https://[fc00::1234]/hook',
        'https://[fd00::99]/hook',
        'https://[::ffff:192.168.1.1]/hook',
      ];

      for (const url of ipv6Urls) {
        const res = await validateClientWebhookUrl(url);
        expect(res.valid).toBe(false);
        expect(res.error).toContain('IPv6');
      }
    });

    it('debe mitigar DNS rebinding resolviendo el dominio si no es IP directa', async () => {
      const lookupSpy = vi.spyOn(dns.promises, 'lookup');

      // Simular que el dominio público resuelve a IP privada
      lookupSpy.mockResolvedValueOnce({ address: '10.20.30.40', family: 4 });
      const resRebind = await validateClientWebhookUrl('https://evil-rebind.com/hook');
      expect(resRebind.valid).toBe(false);
      expect(resRebind.error).toContain('red privada');

      // Simular que el dominio público resuelve a loopback
      lookupSpy.mockResolvedValueOnce({ address: '127.0.0.1', family: 4 });
      const resLoop = await validateClientWebhookUrl('https://evil-loop.com/hook');
      expect(resLoop.valid).toBe(false);

      // Simular fallo de resolución DNS
      lookupSpy.mockRejectedValueOnce(new Error('ENOTFOUND'));
      const resNotFound = await validateClientWebhookUrl(
        'https://non-existent-domain-xyz.com/hook',
      );
      expect(resNotFound.valid).toBe(false);
      expect(resNotFound.error).toContain('No se pudo resolver');

      lookupSpy.mockRestore();
    });

    it('debe aceptar URLs HTTPS públicas legítimas', async () => {
      const lookupSpy = vi
        .spyOn(dns.promises, 'lookup')
        .mockResolvedValue({ address: '93.184.216.34', family: 4 } as any);
      const validUrls = [
        'https://webhook.site/abc-123',
        'https://api.miempresa.com/integrations/dreamtek',
        'https://hooks.slack.com/services/T00/B00/X00',
      ];

      for (const url of validUrls) {
        const res = await validateClientWebhookUrl(url);
        expect(res.valid).toBe(true);
      }
      lookupSpy.mockRestore();
    });
  });

  describe('2. Webhook Dispatcher Engine & HMAC Signatures (C-053.4)', () => {
    it('dispatchClientWebhook debe consultar suscripciones activas y despachar a los eventos coincidentes', async () => {
      const encryptedSecret = encryptField('test_signing_secret_32bytes_hex');
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => 'OK',
      } as any);

      // Mock DB: 1. SELECT subscriptions, 2. INSERT delivery
      (db.query as any)
        .mockResolvedValueOnce([
          {
            id: 1,
            target_url: 'https://webhook.site/test',
            secret_encrypted: encryptedSecret,
            events: JSON.stringify(['auth.login', 'billing.deposit_paid']),
          },
        ])
        .mockResolvedValueOnce({ insertId: 501 });

      await dispatchClientWebhook(10, 'auth.login', { userId: 42, ip: '1.2.3.4' });

      // Esperar a que el dispatcher asíncrono (setImmediate) ejecute
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://webhook.site/test',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Dreamtek-Event': 'auth.login',
            'X-Dreamtek-Signature': expect.stringMatching(/^t=\d+,v1=[a-f0-9]{64}$/),
          }),
        }),
      );

      fetchSpy.mockRestore();
    });

    it('dispatchClientWebhook debe omitir webhooks que no estén suscritos al evento específico', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      (db.query as any).mockResolvedValueOnce([
        {
          id: 2,
          target_url: 'https://webhook.site/test2',
          secret_encrypted: encryptField('secret'),
          events: JSON.stringify(['billing.invoice_requested']),
        },
      ]);

      await dispatchClientWebhook(10, 'auth.login', { userId: 42 });
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });

    it('dispatchTestWebhook debe lanzar error si la suscripción no existe para el tenant (C-053.1)', async () => {
      (db.query as any).mockResolvedValueOnce([]); // no subscription

      await expect(dispatchTestWebhook(999, 10)).rejects.toThrow(
        'Suscripción de webhook no encontrada para este tenant.',
      );
    });

    it('dispatchTestWebhook debe ejecutar ping exitoso y persistir bitácora de entrega', async () => {
      const encryptedSecret = encryptField('test_ping_secret');
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '{"received":true}',
      } as any);

      (db.query as any)
        .mockResolvedValueOnce([
          {
            target_url: 'https://webhook.site/ping',
            secret_encrypted: encryptedSecret,
          },
        ])
        .mockResolvedValueOnce({ insertId: 601 });

      const result = await dispatchTestWebhook(1, 10);

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);

      fetchSpy.mockRestore();
    });

    it('dispatchTestWebhook debe reintentar hasta 3 veces con backoff en caso de fallo de red', async () => {
      const encryptedSecret = encryptField('test_retry_secret');
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockRejectedValueOnce(new Error('Connection reset'))
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => 'OK',
        } as any);

      (db.query as any)
        .mockResolvedValueOnce([
          {
            target_url: 'https://webhook.site/flaky',
            secret_encrypted: encryptedSecret,
          },
        ])
        .mockResolvedValueOnce({ insertId: 602 });

      const result = await dispatchTestWebhook(2, 10);
      expect(result.success).toBe(true);
      expect(fetchSpy).toHaveBeenCalledTimes(3);

      fetchSpy.mockRestore();
    });
  });

  describe('3. REST Endpoints Integration & Anti-IDOR Tests (/api/v1/client/webhooks)', () => {
    it('debe retornar 401 si no se provee cookie de sesión válida', async () => {
      const res = await supertest(app).get('/api/v1/client/webhooks');
      expect(res.status).toBe(401);
    });

    it('GET /api/v1/client/webhooks debe listar suscripciones del tenant SIN exponer secretos (C-053.3)', async () => {
      const token = getClientToken(42, 10);
      (db.query as any).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 10,
          name: 'Producción Webhook',
          target_url: 'https://api.miempresa.com/hook',
          events: '["auth.login","project.milestone_updated"]',
          is_active: 1,
          created_at: '2026-09-25 12:00:00',
          updated_at: '2026-09-25 12:00:00',
        },
      ]);

      const res = await supertest(app)
        .get('/api/v1/client/webhooks')
        .set('Cookie', [`dreamtek_session=${token}`]);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('Producción Webhook');
      expect(res.body.data[0].events).toEqual(['auth.login', 'project.milestone_updated']);
      // A02/C-053.3: NUNCA retornar el secreto en el listado
      expect(res.body.data[0].secret).toBeUndefined();
      expect(res.body.data[0].secret_encrypted).toBeUndefined();
    });

    it('GET /api/v1/client/webhooks debe manejar excepciones 500', async () => {
      const token = getClientToken(42, 10);
      (db.query as any).mockRejectedValueOnce(new Error('DB Crash'));

      const res = await supertest(app)
        .get('/api/v1/client/webhooks')
        .set('Cookie', [`dreamtek_session=${token}`]);

      expect(res.status).toBe(500);
    });

    it('POST /api/v1/client/webhooks debe crear suscripción con secreto único de 32 bytes (201) (C-053.3)', async () => {
      const token = getClientToken(42, 10);
      (db.query as any).mockResolvedValueOnce({ insertId: 77 });

      const res = await supertest(app)
        .post('/api/v1/client/webhooks')
        .set('Cookie', [`dreamtek_session=${token}`])
        .send({
          name: 'Integración CRM',
          target_url: 'https://webhook.site/valid-endpoint',
          events: ['billing.deposit_paid', 'project.settlement_completed'],
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data.id).toBe(77);
      expect(res.body.data.name).toBe('Integración CRM');
      // C-053.3: El secreto se entrega una sola vez en el POST de creación
      expect(res.body.data.secret).toBeDefined();
      expect(res.body.data.secret).toHaveLength(64); // 32 bytes en hex = 64 chars
      expect(res.body.message).toContain('Guarda el secreto');
    });

    it('POST /api/v1/client/webhooks debe rechazar esquemas inválidos o arrays de eventos vacíos (400)', async () => {
      const token = getClientToken(42, 10);

      const resEmpty = await supertest(app)
        .post('/api/v1/client/webhooks')
        .set('Cookie', [`dreamtek_session=${token}`])
        .send({
          name: '',
          target_url: 'not-a-url',
          events: [],
        });

      expect(resEmpty.status).toBe(400);
      expect(resEmpty.body.error).toBe('Validation Error');
    });

    it('POST /api/v1/client/webhooks debe rechazar URLs privadas con error anti-SSRF (400) (C-053.2)', async () => {
      const token = getClientToken(42, 10);

      const resSsrf = await supertest(app)
        .post('/api/v1/client/webhooks')
        .set('Cookie', [`dreamtek_session=${token}`])
        .send({
          name: 'Intento SSRF',
          target_url: 'https://192.168.1.1/hook',
          events: ['auth.login'],
        });

      expect(resSsrf.status).toBe(400);
      expect(resSsrf.body.message).toContain('Destino no permitido');
    });

    it('POST /api/v1/client/webhooks debe manejar excepciones 500', async () => {
      const token = getClientToken(42, 10);
      (db.query as any).mockRejectedValueOnce(new Error('Insert failed'));

      const res = await supertest(app)
        .post('/api/v1/client/webhooks')
        .set('Cookie', [`dreamtek_session=${token}`])
        .send({
          name: 'Error Webhook',
          target_url: 'https://webhook.site/test',
          events: ['auth.login'],
        });

      expect(res.status).toBe(500);
    });

    it('DELETE /api/v1/client/webhooks/:id debe eliminar suscripción propia (200)', async () => {
      const token = getClientToken(42, 10);
      (db.query as any).mockResolvedValueOnce({ affectedRows: 1 });

      const res = await supertest(app)
        .delete('/api/v1/client/webhooks/77')
        .set('Cookie', [`dreamtek_session=${token}`]);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.message).toContain('eliminada exitosamente');
    });

    it('DELETE /api/v1/client/webhooks/:id debe retornar 404 ante intentos de borrado cruzado entre tenants (C-053.1)', async () => {
      const token = getClientToken(42, 10);
      (db.query as any).mockResolvedValueOnce({ affectedRows: 0 }); // no rows for this tenant

      const res = await supertest(app)
        .delete('/api/v1/client/webhooks/999')
        .set('Cookie', [`dreamtek_session=${token}`]);

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('no pertenece a tu cuenta');
    });

    it('DELETE /api/v1/client/webhooks/:id debe manejar excepciones 500', async () => {
      const token = getClientToken(42, 10);
      (db.query as any).mockRejectedValueOnce(new Error('Delete error'));

      const res = await supertest(app)
        .delete('/api/v1/client/webhooks/77')
        .set('Cookie', [`dreamtek_session=${token}`]);

      expect(res.status).toBe(500);
    });

    it('POST /api/v1/client/webhooks/:id/test debe ejecutar ping test y retornar status (200)', async () => {
      const token = getClientToken(42, 10);
      const encryptedSecret = encryptField('test_secret');

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => 'OK',
      } as any);

      (db.query as any)
        .mockResolvedValueOnce([
          {
            target_url: 'https://webhook.site/test-ping',
            secret_encrypted: encryptedSecret,
          },
        ])
        .mockResolvedValueOnce({ insertId: 801 });

      const res = await supertest(app)
        .post('/api/v1/client/webhooks/77/test')
        .set('Cookie', [`dreamtek_session=${token}`]);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.success).toBe(true);
      expect(res.body.data.statusCode).toBe(200);

      fetchSpy.mockRestore();
    });

    it('POST /api/v1/client/webhooks/:id/test debe retornar 404 si el webhook no existe para el tenant', async () => {
      const token = getClientToken(42, 10);
      (db.query as any).mockResolvedValueOnce([]); // no webhook for this tenant

      const res = await supertest(app)
        .post('/api/v1/client/webhooks/999/test')
        .set('Cookie', [`dreamtek_session=${token}`]);

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('no pertenece a tu cuenta');
    });

    it('POST /api/v1/client/webhooks/:id/test debe manejar excepciones 500', async () => {
      const token = getClientToken(42, 10);
      (db.query as any).mockRejectedValueOnce(new Error('Unexpected Crash'));

      const res = await supertest(app)
        .post('/api/v1/client/webhooks/77/test')
        .set('Cookie', [`dreamtek_session=${token}`]);

      expect(res.status).toBe(500);
    });
  });
});
