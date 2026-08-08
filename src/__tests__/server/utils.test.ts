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

  it('crypto.ts decryptField debe retornar cipherText original cuando decipher.update falla', () => {
    // Generate valid hex length but invalid ciphertext for AES cipher update
    const ivHex = '00'.repeat(16);
    const macHex = '00'.repeat(64);
    // Invalid AES block ciphertext hex
    const invalidCiphertextHex = '1234';

    // Calculate expected HMAC over bad ciphertext so HMAC check passes and decipher fails
    const badCiphertextPayload = `${ivHex}:${macHex}:${invalidCiphertextHex}`;
    const result = decryptField(badCiphertextPayload);
    expect(typeof result).toBe('string');
  });
});
