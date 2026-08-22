/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import supertest from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import webhooksRouter from '../../../server/src/routes/webhooks';
import * as db from '../../../server/src/db';
import {
  WebhookEventEnum,
  createWebhookSchema,
  updateWebhookSchema,
  webhookIdParamSchema,
  deliveriesQuerySchema,
} from '../../../server/src/schemas/webhook.schema';
import {
  validateWebhookUrl,
  generateWebhookSignature,
  generateWebhookSecret,
  dispatchWebhookEvent,
  deliverWebhook,
} from '../../../server/src/utils/webhookDispatcher';
import { webhooksRateLimiter } from '../../../server/src/middleware/rateLimiter';

// Mock DB
vi.mock('../../../server/src/db', () => {
  const queryFn = vi.fn();
  const executeFn = vi.fn().mockResolvedValue([{ affectedRows: 1 }]);
  return {
    query: queryFn,
    pool: {
      execute: executeFn,
    },
  };
});

const TEST_SECRET = 'test-jwt-secret-key-super-secure-and-long-enough-for-hs512-compliance-testing';
process.env.JWT_SECRET = TEST_SECRET;

const app = express();
app.use(express.json());
app.use('/webhooks', webhooksRouter);

describe('DAM Webhooks & Outbound Event Notifications (FC 012)', () => {
  const adminToken = jwt.sign(
    { userId: 1, uid: 1, email: 'admin@dreamtek.tech', role: 'ADMIN', tenantId: 1 },
    TEST_SECRET,
    { algorithm: 'HS512' },
  );

  const clientToken = jwt.sign(
    { userId: 2, uid: 2, email: 'client@dreamtek.tech', role: 'CLIENT', tenantId: 1 },
    TEST_SECRET,
    { algorithm: 'HS512' },
  );

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.pool.execute).mockResolvedValue([{ affectedRows: 1 }] as any);
  });

  describe('1. Zod Schema & Security Helpers Unit Tests', () => {
    it('validates WebhookEventEnum values', () => {
      const events = [
        'asset.created',
        'asset.updated',
        'asset.deleted',
        'version.created',
        'rights.updated',
        'job.completed',
        '*',
      ];
      for (const e of events) {
        expect(WebhookEventEnum.safeParse(e).success).toBe(true);
      }
      expect(WebhookEventEnum.safeParse('invalid.event').success).toBe(false);
    });

    it('validates createWebhookSchema and updateWebhookSchema', () => {
      const validCreate = {
        url: 'https://example.com/hook',
        description: 'Production CMS Webhook',
        events: ['asset.created', 'job.completed'],
        is_active: true,
      };
      expect(createWebhookSchema.safeParse(validCreate).success).toBe(true);
      expect(createWebhookSchema.safeParse({ url: 'not-a-url', events: ['*'] }).success).toBe(
        false,
      );
      expect(
        createWebhookSchema.safeParse({ url: 'https://example.com/hook', events: [] }).success,
      ).toBe(false);

      expect(updateWebhookSchema.safeParse({ url: 'https://example.com/new-hook' }).success).toBe(
        true,
      );
      expect(updateWebhookSchema.safeParse({ description: null, is_active: false }).success).toBe(
        true,
      );
      expect(updateWebhookSchema.safeParse({ url: 'invalid-url' }).success).toBe(false);
    });

    it('validates webhookIdParamSchema and deliveriesQuerySchema', () => {
      expect(webhookIdParamSchema.safeParse({ id: '5' }).success).toBe(true);
      expect(webhookIdParamSchema.safeParse({ id: '-1' }).success).toBe(false);

      expect(
        deliveriesQuerySchema.safeParse({ page: 2, limit: 50, status: 'SUCCESS' }).success,
      ).toBe(true);
      expect(deliveriesQuerySchema.safeParse({ status: 'INVALID_STATUS' }).success).toBe(false);
      const defaultParsed = deliveriesQuerySchema.parse({});
      expect(defaultParsed.page).toBe(1);
      expect(defaultParsed.limit).toBe(20);
    });

    it('validateWebhookUrl validates URLs and blocks SSRF / Private Networks', () => {
      // Valid URLs (Hostnames and Public IPs)
      expect(validateWebhookUrl('https://api.partner.com/webhook').valid).toBe(true);
      expect(validateWebhookUrl('http://api.partner.com/webhook').valid).toBe(true);
      expect(validateWebhookUrl('https://93.184.216.34/webhook').valid).toBe(true);

      // Protocol check
      expect(validateWebhookUrl('ftp://example.com').valid).toBe(false);
      expect(validateWebhookUrl('file:///etc/passwd').valid).toBe(false);

      // Production HTTPS check
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      expect(validateWebhookUrl('http://example.com/hook').valid).toBe(false);
      process.env.NODE_ENV = originalEnv;

      // Loopback & Local hostnames
      expect(validateWebhookUrl('https://localhost/hook').valid).toBe(false);
      expect(validateWebhookUrl('https://myapi.localhost/hook').valid).toBe(false);
      expect(validateWebhookUrl('https://dev.local/hook').valid).toBe(false);
      expect(validateWebhookUrl('https://127.0.0.1/hook').valid).toBe(false);
      expect(validateWebhookUrl('https://[::1]/hook').valid).toBe(false);
      expect(validateWebhookUrl('https://0.0.0.0/hook').valid).toBe(false);

      // Cloud Metadata Services
      expect(validateWebhookUrl('https://169.254.169.254/latest/meta-data').valid).toBe(false);
      expect(validateWebhookUrl('https://metadata.google.internal/computeMetadata').valid).toBe(
        false,
      );

      // IPv4 RFC 1918 Private Ranges
      expect(validateWebhookUrl('https://10.0.1.50/hook').valid).toBe(false);
      expect(validateWebhookUrl('https://172.16.0.1/hook').valid).toBe(false);
      expect(validateWebhookUrl('https://172.31.255.254/hook').valid).toBe(false);
      expect(validateWebhookUrl('https://192.168.1.100/hook').valid).toBe(false);
      expect(validateWebhookUrl('https://169.254.5.5/hook').valid).toBe(false);
      expect(validateWebhookUrl('https://127.0.5.1/hook').valid).toBe(false);

      // IPv6 Private & Link-Local & IPv4 Mapped
      expect(validateWebhookUrl('https://[fe80::1ff:fe23:4567:890a]/hook').valid).toBe(false);
      expect(validateWebhookUrl('https://[fc00::1]/hook').valid).toBe(false);
      expect(validateWebhookUrl('https://[fd00::1]/hook').valid).toBe(false);
      expect(validateWebhookUrl('https://[::ffff:127.0.0.1]/hook').valid).toBe(false);
      expect(validateWebhookUrl('https://[::ffff:10.0.0.1]/hook').valid).toBe(false);
      expect(validateWebhookUrl('https://[::ffff:192.168.0.1]/hook').valid).toBe(false);

      // Malformed URL
      expect(validateWebhookUrl('not-a-url').valid).toBe(false);
    });

    it('generateWebhookSignature and generateWebhookSecret generate valid HMAC signatures', () => {
      const secret = generateWebhookSecret();
      expect(secret.length).toBe(64);

      const payload = JSON.stringify({ event: 'asset.created', asset_id: 10 });
      const { timestamp, signature, header } = generateWebhookSignature(
        secret,
        payload,
        1787328000,
      );

      expect(timestamp).toBe(1787328000);
      expect(signature.length).toBe(64);
      expect(header).toBe(`t=1787328000,v1=${signature}`);
    });
  });

  describe('2. Webhook Dispatcher Unit Tests', () => {
    it('dispatchWebhookEvent returns empty array when no active endpoints exist', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const ids = await dispatchWebhookEvent(1, 'asset.created', { id: 10 });
      expect(ids).toEqual([]);
    });

    it('dispatchWebhookEvent returns empty array when no endpoints match the event', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 1, url: 'https://example.com/h1', secret: 'sec1', events: '["asset.deleted"]' },
        { id: 2, url: 'https://example.com/h2', secret: 'sec2', events: 'invalid-json' },
      ]);

      const ids = await dispatchWebhookEvent(1, 'asset.created', { id: 10 });
      expect(ids).toEqual([]);
    });

    it('dispatchWebhookEvent creates delivery records and returns delivery IDs', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 1, url: 'https://example.com/h1', secret: 'sec1', events: ['asset.created'] },
        { id: 2, url: 'https://example.com/h2', secret: 'sec2', events: '["*"]' },
      ]);
      // Insert delivery 1
      vi.mocked(db.query).mockResolvedValueOnce({ insertId: 501 } as any);
      // Insert delivery 2
      vi.mocked(db.query).mockResolvedValueOnce({ insertId: 502 } as any);

      const ids = await dispatchWebhookEvent(1, 'asset.created', { id: 10 }, false);
      expect(ids).toEqual([501, 502]);
    });

    it('dispatchWebhookEvent triggers auto-dispatch in background', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 1, url: 'https://example.com/h1', secret: 'sec1', events: ['asset.created'] },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce({ insertId: 503 } as any);
      // deliverWebhook query: not found
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const ids = await dispatchWebhookEvent(1, 'asset.created', { id: 10 }, true);
      expect(ids).toEqual([503]);
      await new Promise((r) => setTimeout(r, 50));
    });

    it('dispatchWebhookEvent handles DB exceptions gracefully', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('Dispatch DB Failure'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const ids = await dispatchWebhookEvent(1, 'asset.created', { id: 10 });
      expect(ids).toEqual([]);
      consoleSpy.mockRestore();
    });

    it('deliverWebhook returns error when delivery record not found', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await deliverWebhook(999);
      expect(res.success).toBe(false);
      expect(res.error).toBe('Delivery record not found');
    });

    it('deliverWebhook marks FAILED when endpoint is inactive', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 1,
          webhook_endpoint_id: 10,
          event_type: 'asset.created',
          payload: { id: 1 },
          attempts: 0,
          max_attempts: 3,
          url: 'https://example.com/hook',
          secret: 'sec',
          is_active: 0,
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([{ affectedRows: 1 }] as any);

      const res = await deliverWebhook(1);
      expect(res.success).toBe(false);
      expect(res.error).toBe('Webhook endpoint is inactive');
    });

    it('deliverWebhook marks FAILED when URL fails SSRF check', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 2,
          tenant_id: 1,
          webhook_endpoint_id: 10,
          event_type: 'asset.created',
          payload: '{"id":1}',
          attempts: 0,
          max_attempts: 3,
          url: 'https://127.0.0.1/hook',
          secret: 'sec',
          is_active: 1,
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([{ affectedRows: 1 }] as any);

      const res = await deliverWebhook(2);
      expect(res.success).toBe(false);
      expect(res.error).toContain('Destino no permitido');
    });

    it('deliverWebhook delivers successfully when payload is already an object', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 9,
          tenant_id: 1,
          webhook_endpoint_id: 10,
          event_type: 'asset.created',
          payload: { asset_id: 99 },
          attempts: 0,
          max_attempts: 3,
          url: 'https://api.external.com/hook',
          secret: 'sec',
          is_active: 1,
        },
      ]);

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('{"ok": true}'),
      });
      global.fetch = mockFetch as any;

      vi.mocked(db.query).mockResolvedValueOnce([{ affectedRows: 1 }] as any);

      const res = await deliverWebhook(9);
      expect(res.success).toBe(true);
      expect(res.statusCode).toBe(200);
    });

    it('deliverWebhook handles network failure with statusCode undefined', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 10,
          tenant_id: 1,
          webhook_endpoint_id: 10,
          event_type: 'asset.created',
          payload: '{"id":1}',
          attempts: 0,
          max_attempts: 3,
          url: 'https://api.external.com/hook',
          secret: 'sec',
          is_active: 1,
        },
      ]);

      global.fetch = vi.fn().mockRejectedValue(new Error('Network error')) as any;
      vi.mocked(db.query).mockResolvedValueOnce([{ affectedRows: 1 }] as any);

      const res = await deliverWebhook(10);
      expect(res.success).toBe(false);
      expect(res.statusCode).toBeUndefined();
    });

    it('deliverWebhook marks EXHAUSTED when HTTP error exceeds max_attempts', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 4,
          tenant_id: 1,
          webhook_endpoint_id: 10,
          event_type: 'asset.created',
          payload: JSON.stringify({ id: 1 }),
          attempts: 2,
          max_attempts: 3,
          url: 'https://api.external.com/hook',
          secret: 'sec',
          is_active: 1,
        },
      ]);

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: () => Promise.resolve('Service Unavailable'),
      });
      global.fetch = mockFetch as any;

      vi.mocked(db.query).mockResolvedValueOnce([{ affectedRows: 1 }] as any);

      const res = await deliverWebhook(4);
      expect(res.success).toBe(false);
      expect(res.statusCode).toBe(503);
    });

    it('deliverWebhook marks FAILED when fetch throws network exception', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 5,
          tenant_id: 1,
          webhook_endpoint_id: 10,
          event_type: 'asset.created',
          payload: JSON.stringify({ id: 1 }),
          attempts: 0,
          max_attempts: 3,
          url: 'https://api.external.com/hook',
          secret: 'sec',
          is_active: 1,
        },
      ]);

      const mockFetch = vi.fn().mockRejectedValue(new Error('Connection timed out'));
      global.fetch = mockFetch as any;

      vi.mocked(db.query).mockResolvedValueOnce([{ affectedRows: 1 }] as any);

      const res = await deliverWebhook(5);
      expect(res.success).toBe(false);
      expect(res.error).toContain('Connection timed out');
    });

    it('deliverWebhook handles non-Error rejection in fetch', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 6,
          tenant_id: 1,
          webhook_endpoint_id: 10,
          event_type: 'asset.created',
          payload: JSON.stringify({ id: 1 }),
          attempts: 0,
          max_attempts: 3,
          url: 'https://api.external.com/hook',
          secret: 'sec',
          is_active: 1,
        },
      ]);

      const mockFetch = vi.fn().mockRejectedValue('String network error');
      global.fetch = mockFetch as any;

      vi.mocked(db.query).mockResolvedValueOnce([{ affectedRows: 1 }] as any);

      const res = await deliverWebhook(6);
      expect(res.success).toBe(false);
      expect(res.error).toBe('String network error');
    });

    it('deliverWebhook handles outer exception gracefully', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('Outer failure'));
      vi.mocked(db.query).mockResolvedValueOnce([{ affectedRows: 1 }] as any);

      const res = await deliverWebhook(7);
      expect(res.success).toBe(false);
      expect(res.error).toBe('Outer failure');
    });

    it('deliverWebhook handles outer non-Error exception gracefully', async () => {
      vi.mocked(db.query).mockRejectedValueOnce('Outer string failure');
      vi.mocked(db.query).mockRejectedValueOnce(new Error('Secondary failure'));

      const res = await deliverWebhook(8);
      expect(res.success).toBe(false);
      expect(res.error).toBe('Outer string failure');
    });
  });

  describe('3. Webhooks Routes Integration Tests', () => {
    it('GET /api/v1/webhooks returns 401 when unauthenticated', async () => {
      const res = await supertest(app).get('/webhooks');
      expect(res.status).toBe(401);
    });

    it('GET /api/v1/webhooks returns 403 when user is not ADMIN', async () => {
      const res = await supertest(app)
        .get('/webhooks')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(res.status).toBe(403);
    });

    it('GET /api/v1/webhooks returns 200 with list of endpoints (secret omitted)', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 1,
          url: 'https://example.com/h1',
          description: 'Desc 1',
          events: JSON.stringify(['asset.created']),
          is_active: 1,
          created_at: '2026-08-21T12:00:00.000Z',
          updated_at: '2026-08-21T12:00:00.000Z',
        },
        {
          id: 2,
          tenant_id: 1,
          url: 'https://example.com/h2',
          description: null,
          events: ['*'],
          is_active: 0,
          created_at: '2026-08-21T12:05:00.000Z',
          updated_at: '2026-08-21T12:05:00.000Z',
        },
        {
          id: 3,
          tenant_id: 1,
          url: 'https://example.com/h3',
          description: null,
          events: 'invalid-json-string',
          is_active: 1,
          created_at: '2026-08-21T12:10:00.000Z',
          updated_at: '2026-08-21T12:10:00.000Z',
        },
      ]);

      const res = await supertest(app)
        .get('/webhooks')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(3);
      expect(res.body.data[0].secret).toBeUndefined();
      expect(res.body.data[0].events).toEqual(['asset.created']);
      expect(res.body.data[1].is_active).toBe(false);
      expect(res.body.data[2].events).toEqual([]);
    });

    it('GET /api/v1/webhooks returns 500 when DB query fails', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('DB List Error'));

      const res = await supertest(app)
        .get('/webhooks')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(500);
      expect(res.body.message).toContain('Error al obtener la lista de webhooks');
    });

    it('POST /api/v1/webhooks returns 400 on SSRF blocked URL', async () => {
      const res = await supertest(app)
        .post('/webhooks')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          url: 'https://127.0.0.1/hook',
          events: ['asset.created'],
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Destino no permitido');
    });

    it('POST /api/v1/webhooks returns 201 and creates webhook endpoint with secret', async () => {
      vi.mocked(db.query).mockResolvedValueOnce({ insertId: 10 } as any);

      const res = await supertest(app)
        .post('/webhooks')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          url: 'https://api.partner.com/webhook',
          description: 'Partner webhook',
          events: ['asset.created', 'job.completed'],
          is_active: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBe(10);
      expect(res.body.data.secret.length).toBe(64);
      expect(res.body.data.events).toEqual(['asset.created', 'job.completed']);
    });

    it('POST /api/v1/webhooks returns 201 when is_active is false and description is omitted', async () => {
      vi.mocked(db.query).mockResolvedValueOnce({ insertId: 11 } as any);

      const res = await supertest(app)
        .post('/webhooks')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          url: 'https://api.partner.com/webhook',
          events: ['*'],
          is_active: false,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBe(11);
      expect(res.body.data.is_active).toBe(false);
      expect(res.body.data.description).toBeNull();
    });

    it('POST /api/v1/webhooks returns 500 on DB insert error', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('Insert DB Error'));

      const res = await supertest(app)
        .post('/webhooks')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          url: 'https://api.partner.com/webhook',
          events: ['asset.created'],
        });

      expect(res.status).toBe(500);
      expect(res.body.message).toContain('Error al registrar el endpoint de webhook');
    });

    it('GET /api/v1/webhooks/:id returns 404 when endpoint not found or cross-tenant', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .get('/webhooks/999')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('Endpoint de webhook no encontrado');
    });

    it('GET /api/v1/webhooks/:id returns 200 with endpoint details', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 5,
          tenant_id: 1,
          url: 'https://api.partner.com/hook',
          description: 'Desc',
          events: JSON.stringify(['asset.created']),
          is_active: 1,
          created_at: '2026-08-21T12:00:00.000Z',
          updated_at: '2026-08-21T12:00:00.000Z',
        },
      ]);

      const res = await supertest(app)
        .get('/webhooks/5')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(5);
      expect(res.body.data.secret).toBeUndefined();
    });

    it('GET /api/v1/webhooks/:id returns 500 on DB error', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('Get DB Error'));

      const res = await supertest(app)
        .get('/webhooks/5')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(500);
    });

    it('PUT /api/v1/webhooks/:id returns 404 when webhook does not exist', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .put('/webhooks/999')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ description: 'Updated' });

      expect(res.status).toBe(404);
    });

    it('PUT /api/v1/webhooks/:id returns 400 when updating to an SSRF-blocked URL', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 5, url: 'https://valid.com/hook', description: 'Old', events: '["*"]', is_active: 1 },
      ]);

      const res = await supertest(app)
        .put('/webhooks/5')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ url: 'https://10.0.0.1/blocked' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Destino no permitido');
    });

    it('PUT /api/v1/webhooks/:id returns 200 and updates webhook endpoint', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 5, url: 'https://valid.com/hook', description: 'Old', events: '["*"]', is_active: 1 },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([{ affectedRows: 1 }] as any);

      const res = await supertest(app)
        .put('/webhooks/5')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          url: 'https://newvalid.com/hook',
          description: 'New Description',
          events: ['asset.deleted'],
          is_active: false,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.description).toBe('New Description');
      expect(res.body.data.events).toEqual(['asset.deleted']);
      expect(res.body.data.is_active).toBe(false);
    });

    it('PUT /api/v1/webhooks/:id updates is_active to true', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 5, url: 'https://valid.com/hook', description: 'Old', events: '["*"]', is_active: 0 },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([{ affectedRows: 1 }] as any);

      const res = await supertest(app)
        .put('/webhooks/5')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ is_active: true });

      expect(res.status).toBe(200);
      expect(res.body.data.is_active).toBe(true);
    });

    it('PUT /api/v1/webhooks/:id with empty payload preserves existing values', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 5, url: 'https://valid.com/hook', description: 'Old', events: '["*"]', is_active: 1 },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([{ affectedRows: 1 }] as any);

      const res = await supertest(app)
        .put('/webhooks/5')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.data.url).toBe('https://valid.com/hook');
      expect(res.body.data.description).toBe('Old');
    });

    it('PUT /api/v1/webhooks/:id returns 500 on DB error', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('Update DB Error'));

      const res = await supertest(app)
        .put('/webhooks/5')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ description: 'Test' });

      expect(res.status).toBe(500);
    });

    it('DELETE /api/v1/webhooks/:id returns 404 when webhook does not exist', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .delete('/webhooks/999')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });

    it('DELETE /api/v1/webhooks/:id returns 200 and deletes webhook', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([{ id: 5 }]);
      vi.mocked(db.query).mockResolvedValueOnce([{ affectedRows: 1 }] as any);

      const res = await supertest(app)
        .delete('/webhooks/5')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('eliminado exitosamente');
    });

    it('DELETE /api/v1/webhooks/:id returns 500 on DB error', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('Delete DB Error'));

      const res = await supertest(app)
        .delete('/webhooks/5')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(500);
    });

    it('POST /api/v1/webhooks/:id/rotate-secret returns 404 when webhook does not exist', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .post('/webhooks/999/rotate-secret')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });

    it('POST /api/v1/webhooks/:id/rotate-secret returns 200 and generates new secret', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([{ id: 5 }]);
      vi.mocked(db.query).mockResolvedValueOnce([{ affectedRows: 1 }] as any);

      const res = await supertest(app)
        .post('/webhooks/5/rotate-secret')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(5);
      expect(res.body.data.secret.length).toBe(64);
    });

    it('POST /api/v1/webhooks/:id/rotate-secret returns 500 on DB error', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('Rotate DB Error'));

      const res = await supertest(app)
        .post('/webhooks/5/rotate-secret')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(500);
    });

    it('POST /api/v1/webhooks/:id/test returns 404 when webhook not found', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .post('/webhooks/999/test')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });

    it('POST /api/v1/webhooks/:id/test sends immediate test ping', async () => {
      // 1. Endpoint exists
      vi.mocked(db.query).mockResolvedValueOnce([{ id: 5, is_active: 1 }]);
      // 2. Insert test delivery
      vi.mocked(db.query).mockResolvedValueOnce({ insertId: 77 } as any);
      // 3. deliverWebhook fetch delivery details
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 77,
          tenant_id: 1,
          webhook_endpoint_id: 5,
          event_type: 'webhook.test',
          payload: JSON.stringify({ message: 'test' }),
          attempts: 0,
          max_attempts: 3,
          url: 'https://api.partner.com/hook',
          secret: 'sec',
          is_active: 1,
        },
      ]);
      // Mock fetch
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('ok'),
      }) as any;
      // 4. Update delivery to SUCCESS
      vi.mocked(db.query).mockResolvedValueOnce([{ affectedRows: 1 }] as any);

      const res = await supertest(app)
        .post('/webhooks/5/test')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.delivery_id).toBe(77);
      expect(res.body.data.success).toBe(true);
    });

    it('POST /api/v1/webhooks/:id/test returns 500 on DB error', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('Test DB Error'));

      const res = await supertest(app)
        .post('/webhooks/5/test')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(500);
    });

    it('GET /api/v1/webhooks/:id/deliveries returns 404 when webhook not found', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .get('/webhooks/999/deliveries')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });

    it('GET /api/v1/webhooks/:id/deliveries returns 200 with paginated delivery history', async () => {
      // 1. Endpoint exists
      vi.mocked(db.query).mockResolvedValueOnce([{ id: 5 }]);
      // 2. Count deliveries
      vi.mocked(db.query).mockResolvedValueOnce([{ total: 2 }]);
      // 3. Deliveries rows
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 101,
          webhook_endpoint_id: 5,
          event_type: 'asset.created',
          payload: JSON.stringify({ asset_id: 10 }),
          status: 'SUCCESS',
          status_code: 200,
          response_body: '{"ok":true}',
          error_message: null,
          attempts: 1,
          max_attempts: 3,
          delivered_at: '2026-08-21T12:00:01.000Z',
          created_at: '2026-08-21T12:00:00.000Z',
        },
        {
          id: 102,
          webhook_endpoint_id: 5,
          event_type: 'asset.deleted',
          payload: { asset_id: 20 },
          status: 'FAILED',
          status_code: 500,
          response_body: 'Internal Error',
          error_message: 'HTTP error status 500',
          attempts: 1,
          max_attempts: 3,
          delivered_at: null,
          created_at: '2026-08-21T12:05:00.000Z',
        },
        {
          id: 103,
          webhook_endpoint_id: 5,
          event_type: 'asset.updated',
          payload: 'invalid-json-payload',
          status: 'PENDING',
          status_code: null,
          response_body: null,
          error_message: null,
          attempts: 0,
          max_attempts: 3,
          delivered_at: null,
          created_at: '2026-08-21T12:06:00.000Z',
        },
      ]);

      const res = await supertest(app)
        .get('/webhooks/5/deliveries?page=1&limit=20&status=SUCCESS')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(3);
      expect(res.body.data[0].payload).toEqual({ asset_id: 10 });
      expect(res.body.data[2].payload).toBe('invalid-json-payload');
      expect(res.body.pagination.total).toBe(2);
    });

    it('GET /api/v1/webhooks/:id/deliveries returns empty list when no deliveries exist', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([{ id: 5 }]);
      vi.mocked(db.query).mockResolvedValueOnce([{ total: 0 }]);
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .get('/webhooks/5/deliveries')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.pagination.total).toBe(0);
      expect(res.body.pagination.totalPages).toBe(1);
    });

    it('GET /api/v1/webhooks/:id/deliveries returns 500 on DB error', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('Deliveries DB Error'));

      const res = await supertest(app)
        .get('/webhooks/5/deliveries')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(500);
    });
  });

  describe('4. Webhooks Rate Limiter Tests', () => {
    it('triggers webhooksRateLimiter 429 response handler', async () => {
      const appLimit = express();
      appLimit.use(webhooksRateLimiter);
      appLimit.get('/test-limit', (_req, res) => res.json({ ok: true }));

      for (let i = 0; i < 60; i++) {
        await supertest(appLimit).get('/test-limit');
      }
      const resBlocked = await supertest(appLimit).get('/test-limit');
      expect(resBlocked.status).toBe(429);
      expect(resBlocked.body.message).toMatch(/Límite de operaciones de webhooks alcanzado/);
    });
  });
});
