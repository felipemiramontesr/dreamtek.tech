import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import supertest from 'supertest';
import express, { Request, Response } from 'express';
import { app } from '../../../server/src/index';
import { authRouter } from '../../../server/src/routes/auth';

describe('FC 055 — Fase 1 (Proxy & Real IP Calibration Suite)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('Condition C-055.2: Invariants and Configuration of Trust Proxy', () => {
    it('app debe tener configurado trust proxy estrictamente como "loopback"', () => {
      const trustProxySetting = app.get('trust proxy');
      expect(trustProxySetting).toBe('loopback');
      // Invariant: strictly forbidden to be true (C-055.2)
      expect(trustProxySetting).not.toBe(true);
      expect(trustProxySetting).not.toBe(1);
    });

    it('debe ignorar cabeceras X-Forwarded-For falsificadas a la izquierda cuando la petición proviene de loopback', async () => {
      process.env.ANTI_BOT_PROXY_DEBUG = '1';

      // Attacker forges 1.2.3.4, real client is 203.0.113.195
      const res = await supertest(app)
        .get('/api/v1/auth/proxy-debug')
        .set('X-Forwarded-For', '1.2.3.4, 203.0.113.195');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      // Express trust proxy loopback traverses backwards and stops at the first non-loopback IP (203.0.113.195)
      expect(res.body.ip).toBe('203.0.113.195');
      expect(res.body.ips).toEqual(['203.0.113.195']);
    });

    it('debe resolver correctamente la IP real cuando hay múltiples saltos loopback en la cadena', async () => {
      process.env.ANTI_BOT_PROXY_DEBUG = '1';

      const res = await supertest(app)
        .get('/api/v1/auth/proxy-debug')
        .set('X-Forwarded-For', '198.51.100.42, 127.0.0.1');

      expect(res.status).toBe(200);
      expect(res.body.ip).toBe('198.51.100.42');
    });

    it('debe manejar clientes con direcciones IPv6 legítimas', async () => {
      process.env.ANTI_BOT_PROXY_DEBUG = '1';

      const ipv6Address = '2001:db8:85a3::8a2e:370:7334';
      const res = await supertest(app)
        .get('/api/v1/auth/proxy-debug')
        .set('X-Forwarded-For', ipv6Address);

      expect(res.status).toBe(200);
      expect(res.body.ip).toBe(ipv6Address);
    });

    it('debe ignorar X-Forwarded-For si el socket remoto no es loopback', async () => {
      // Create test harness app with trust proxy 'loopback' and mock remoteAddress middleware
      const testApp = express();
      testApp.set('trust proxy', 'loopback');

      // Simulate a non-loopback direct socket connection (e.g. 192.0.2.1)
      testApp.use((req: Request, _res: Response, next) => {
        Object.defineProperty(req.socket, 'remoteAddress', {
          value: '192.0.2.1',
          configurable: true,
        });
        next();
      });

      testApp.get('/test-ip', (req: Request, res: Response) => {
        res.json({ ip: req.ip });
      });

      const res = await supertest(testApp).get('/test-ip').set('X-Forwarded-For', '10.0.0.1');

      // Because socket.remoteAddress is not loopback, X-Forwarded-For is untrusted and ignored
      expect(res.body.ip).toBe('192.0.2.1');
    });
  });

  describe('Condition C-055.1: Ephemeral Diagnostic Endpoint GET /api/v1/auth/proxy-debug', () => {
    it('debe responder 404 por defecto cuando ANTI_BOT_PROXY_DEBUG no está configurado', async () => {
      delete process.env.ANTI_BOT_PROXY_DEBUG;

      const res = await supertest(app).get('/api/v1/auth/proxy-debug');
      expect(res.status).toBe(404);
      expect(res.body).toEqual({
        status: 'error',
        message: 'Not found',
      });
    });

    it('debe responder 404 cuando ANTI_BOT_PROXY_DEBUG tiene un valor distinto de "1"', async () => {
      process.env.ANTI_BOT_PROXY_DEBUG = '0';
      const res0 = await supertest(app).get('/api/v1/auth/proxy-debug');
      expect(res0.status).toBe(404);

      process.env.ANTI_BOT_PROXY_DEBUG = 'true';
      const resTrue = await supertest(app).get('/api/v1/auth/proxy-debug');
      expect(resTrue.status).toBe(404);
    });

    it('debe responder 200 con la estructura de diagnóstico cuando ANTI_BOT_PROXY_DEBUG="1"', async () => {
      process.env.ANTI_BOT_PROXY_DEBUG = '1';

      const res = await supertest(app)
        .get('/api/v1/auth/proxy-debug')
        .set('X-Forwarded-For', '203.0.113.55')
        .set('X-Real-IP', '203.0.113.55')
        .set('CF-Connecting-IP', '203.0.113.55')
        .set('True-Client-IP', '203.0.113.55')
        .set('X-Forwarded-Proto', 'https')
        .set('X-Forwarded-Host', 'apiv1.dreamtek.tech')
        .set('Host', 'apiv1.dreamtek.tech');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.ip).toBe('203.0.113.55');
      expect(res.body.headers).toEqual({
        'x-forwarded-for': '203.0.113.55',
        'x-real-ip': '203.0.113.55',
        'cf-connecting-ip': '203.0.113.55',
        'true-client-ip': '203.0.113.55',
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'apiv1.dreamtek.tech',
        host: 'apiv1.dreamtek.tech',
      });
      expect(res.body).toHaveProperty('socket_remote_address');
    });

    it('prohibido reflejar valores de cookies o cabeceras de autorización en el diagnóstico (C-055.1)', async () => {
      process.env.ANTI_BOT_PROXY_DEBUG = '1';

      const res = await supertest(app)
        .get('/api/v1/auth/proxy-debug')
        .set('Authorization', 'Bearer super-secret-token-do-not-leak')
        .set('Cookie', 'dreamtek_session=secret_cookie_token_12345; other_cookie=xyz')
        .set('Proxy-Authorization', 'Basic dXNlcjpwYXNz')
        .set('X-Api-Key', 'confidential-api-key');

      expect(res.status).toBe(200);
      const responseString = JSON.stringify(res.body);

      // Verify strict omission of sensitive strings and keys
      expect(responseString).not.toContain('super-secret-token-do-not-leak');
      expect(responseString).not.toContain('secret_cookie_token_12345');
      expect(responseString).not.toContain('dXNlcjpwYXNz');
      expect(responseString).not.toContain('confidential-api-key');
      expect(res.body.headers).not.toHaveProperty('authorization');
      expect(res.body.headers).not.toHaveProperty('cookie');
      expect(res.body.headers).not.toHaveProperty('set-cookie');
      expect(res.body.headers).not.toHaveProperty('proxy-authorization');
      expect(res.body.headers).not.toHaveProperty('x-api-key');
    });

    it('debe devolver null para cabeceras no enviadas y manejar socket sin remoteAddress', async () => {
      process.env.ANTI_BOT_PROXY_DEBUG = '1';

      const testRouterApp = express();
      testRouterApp.use(
        '/api/v1/auth',
        (req, _res, next) => {
          if (req.socket) {
            Object.defineProperty(req.socket, 'remoteAddress', {
              value: undefined,
              configurable: true,
            });
          }
          next();
        },
        authRouter,
      );

      const res = await supertest(testRouterApp).get('/api/v1/auth/proxy-debug');
      expect(res.status).toBe(200);
      expect(res.body.headers['x-forwarded-for']).toBeNull();
      expect(res.body.headers['x-real-ip']).toBeNull();
      expect(res.body.headers['cf-connecting-ip']).toBeNull();
      expect(res.body.headers['true-client-ip']).toBeNull();
      expect(res.body.headers['x-forwarded-proto']).toBeNull();
      expect(res.body.headers['x-forwarded-host']).toBeNull();
      expect(res.body.socket_remote_address).toBeNull();
    });
  });
});
