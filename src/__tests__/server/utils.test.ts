/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from 'crypto';
import { describe, it, expect, afterEach } from 'vitest';
import express, { Request, Response } from 'express';
import supertest from 'supertest';
import { encryptField, decryptField, getJwtSecret } from '../../../server/src/utils/crypto';
import { validate } from '../../../server/src/middleware/validate';
import { sensitiveEndpointLimiter } from '../../../server/src/middleware/rateLimiter';
import { z } from 'zod';

describe('Server Utils & Middleware 100% Comprehensive Suite', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('crypto.ts debe encriptar y desencriptar texto con Encrypt-then-HMAC-SHA512', () => {
    const originalText = 'SensiblePassword123!';
    const encrypted = encryptField(originalText);
    expect(encrypted).not.toBe(originalText);
    expect(typeof encrypted).toBe('string');
    expect(encrypted.split(':').length).toBe(3);

    const decrypted = decryptField(encrypted);
    expect(decrypted).toBe(originalText);

    // Empty/invalid text return original
    expect(encryptField('')).toBe('');
    expect(decryptField('')).toBe('');
    expect(decryptField('invalid_format')).toBe('invalid_format');
  });

  it('crypto.ts debe validar HMAC alterado y capturar excepciones en decryptField', () => {
    const originalText = 'TestData123';
    const encrypted = encryptField(originalText);
    const parts = encrypted.split(':');

    // Tamper HMAC part (parts[1])
    const badMacEncrypted = `${parts[0]}:00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000:${parts[2]}`;
    expect(decryptField(badMacEncrypted)).toBe(badMacEncrypted);

    // Tamper IV length to trigger decipher exception
    const badIvEncrypted = `badiv:${parts[1]}:${parts[2]}`;
    expect(decryptField(badIvEncrypted)).toBe(badIvEncrypted);
  });

  it('crypto.ts getJwtSecret debe lanzar fatal error en producción si falta JWT_SECRET', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;
    expect(() => getJwtSecret()).toThrow(/FATAL SECURITY ERROR: JWT_SECRET/);

    process.env.JWT_SECRET = 'prod_secret_123';
    expect(getJwtSecret()).toBe('prod_secret_123');
  });

  it('crypto.ts encriptación debe lanzar fatal error en producción si falta DB_ENCRYPTION_KEY', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.DB_ENCRYPTION_KEY;
    expect(() => encryptField('test')).toThrow(/FATAL SECURITY ERROR: DB_ENCRYPTION_KEY/);
  });

  it('validate middleware debe permitir datos válidos y rechazar esquemas Zod inválidos con HTTP 400', () => {
    const dummySchema = z.object({
      name: z.string().min(2),
    });

    const middleware = validate(dummySchema, 'body');

    // Test Valid Body
    const reqValid = { body: { name: 'Dreamtek' } } as Request;
    let nextCalled = false;
    middleware(reqValid, {} as Response, () => {
      nextCalled = true;
    });
    expect(nextCalled).toBe(true);

    // Test Invalid Body
    const reqInvalid = { body: { name: 'a' } } as Request;
    let statusSent = 0;
    let jsonSent: Record<string, unknown> | null = null;
    const resInvalid = {
      status: (s: number) => {
        statusSent = s;
        return resInvalid;
      },
      json: (j: Record<string, unknown>) => {
        jsonSent = j;
        return resInvalid;
      },
    } as unknown as Response;

    middleware(reqInvalid, resInvalid, () => {});
    expect(statusSent).toBe(400);
    expect(jsonSent?.status).toBe(400);
    expect(jsonSent?.error).toBe('Validation Error');
    expect(jsonSent?.details).toBeDefined();
  });

  it('sensitiveEndpointLimiter debe integrarse con Express y omitir GET o responder HTTP 429 si se excede', async () => {
    const app = express();
    app.use(express.json());
    app.use('/sensitive', sensitiveEndpointLimiter, (_req: Request, res: Response) => {
      res.json({ ok: true });
    });

    // GET requests should skip rate limiting
    const resGet = await supertest(app).get('/sensitive');
    expect(resGet.status).toBe(200);

    // POST /me should also be exempt
    const appMe = express();
    appMe.use('/me', sensitiveEndpointLimiter, (_req: Request, res: Response) => {
      res.json({ ok: true });
    });
    const resMe = await supertest(appMe).post('/me');
    expect(resMe.status).toBe(200);

    // Test 429 rate limiting by exceeding max requests
    const appLimit = express();
    appLimit.use(express.json());
    appLimit.use('/limit', sensitiveEndpointLimiter);

    for (let i = 0; i < 5; i++) {
      await supertest(appLimit).post('/limit');
    }
    const resBlocked = await supertest(appLimit).post('/limit');
    expect(resBlocked.status).toBe(429);
    expect(resBlocked.body.status).toBe(429);
  });

  it('crypto.ts decryptField y getJwtSecret/getDbEncryptionKey deben cubrir todas las ramas y excepciones', () => {
    // Test parts.length !== 3 when string contains one colon
    const twoParts = 'part1:part2';
    expect(decryptField(twoParts)).toBe(twoParts);

    // Test getJwtSecret and getDbEncryptionKey in production without keys
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;
    delete process.env.DB_ENCRYPTION_KEY;

    expect(() => getJwtSecret()).toThrow('FATAL SECURITY ERROR: JWT_SECRET');
    expect(() => encryptField('test')).toThrow('FATAL SECURITY ERROR: DB_ENCRYPTION_KEY');

    // Test decipher.final failure catch block (line 89)
    const cryptoNode = crypto;
    const dbKey = process.env.DB_ENCRYPTION_KEY || 'dreamtek_dev_db_encryption_key_512bits_2026';
    const hmacDigest = cryptoNode
      .createHmac('sha512', dbKey)
      .update('dreamtek_db_encryption_salt_2026')
      .digest();
    const macKey = hmacDigest.subarray(32, 64);

    const ivHex = '00'.repeat(16);
    const corruptEncryptedHex = '00'.repeat(16);
    const validMacHex = cryptoNode
      .createHmac('sha512', macKey)
      .update(`${ivHex}:${corruptEncryptedHex}`)
      .digest('hex');

    const corruptPayload = `${ivHex}:${validMacHex}:${corruptEncryptedHex}`;
    expect(decryptField(corruptPayload)).toBe(corruptPayload);
  });

  it('metrics.ts matchLabels y getMetricsSecretToken deben cubrir todas las ramas', async () => {
    const { metricsRegistry } = await import('../../../server/src/utils/metrics');
    const { getMetricsSecretToken } = await import('../../../server/src/routes/metrics');

    metricsRegistry.incCounter('test_counter', { env: 'test', region: 'us' }, 1);
    metricsRegistry.incCounter('test_counter', { env: 'test' }, 1);
    metricsRegistry.incCounter('empty_labels', undefined as any, 1);
    metricsRegistry.incCounter('empty_labels', undefined as any, 1);
    metricsRegistry.setGauge('test_gauge', 42, { instance: 'srv1' });
    metricsRegistry.observeHistogram('test_hist', 0.1, { route: '/api' });

    // Exhaustively test matchLabels branches
    expect((metricsRegistry as any).matchLabels(undefined, undefined)).toBe(true);
    expect((metricsRegistry as any).matchLabels(undefined, { a: '1' })).toBe(false);
    expect((metricsRegistry as any).matchLabels({ a: '1' }, undefined)).toBe(false);
    expect((metricsRegistry as any).matchLabels({ a: '1', b: '2' }, { a: '1' })).toBe(false);
    expect((metricsRegistry as any).matchLabels({ a: '1' }, { a: '2' })).toBe(false);
    expect((metricsRegistry as any).matchLabels({ a: '1' }, { a: '1' })).toBe(true);

    const metricsStr = metricsRegistry.getPrometheusMetrics();
    expect(metricsStr).toContain('test_counter');
    expect(metricsStr).toContain('test_gauge');

    // Test empty metrics string when no metrics exist
    (metricsRegistry as any).counters.clear();
    (metricsRegistry as any).gauges.clear();
    (metricsRegistry as any).histograms.clear();
    expect(metricsRegistry.getPrometheusMetrics()).toBe('');

    // Restore metrics
    metricsRegistry.resetMetricsForTest();

    // Test getMetricsSecretToken with METRICS_BEARER_TOKEN
    process.env.METRICS_BEARER_TOKEN = 'custom_metrics_secret';
    expect(getMetricsSecretToken()).toBe('custom_metrics_secret');
  });

  it('rateLimiter.ts uploadRateLimiter debe bloquear tras exceder el límite', async () => {
    const { uploadRateLimiter } = await import('../../../server/src/middleware/rateLimiter');
    const appUpload = express();
    appUpload.use(uploadRateLimiter);
    appUpload.post('/upload', (_req, res) => res.json({ ok: true }));

    for (let i = 0; i < 20; i++) {
      await supertest(appUpload).post('/upload');
    }
    const resBlocked = await supertest(appUpload).post('/upload');
    expect(resBlocked.status).toBe(429);
    expect(resBlocked.body.message).toMatch(/Upload limit reached/);
  });
});
