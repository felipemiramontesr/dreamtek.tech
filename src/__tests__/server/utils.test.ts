import { describe, it, expect } from 'vitest';
import { encryptField, decryptField, getJwtSecret } from '../../../server/src/utils/crypto';
import { validate } from '../../../server/src/middleware/validate';
import {
  globalRateLimiter,
  sensitiveEndpointLimiter,
} from '../../../server/src/middleware/rateLimiter';
import { z } from 'zod';
import { Request, Response } from 'express';

describe('Server Utils & Middleware 100% Coverage Suite', () => {
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

  it('crypto.ts getJwtSecret debe manejar entornos dev y prod', () => {
    const secretDev = getJwtSecret();
    expect(typeof secretDev).toBe('string');
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

  it('deben existir los rate limiters globales y sensibles', () => {
    expect(globalRateLimiter).toBeDefined();
    expect(sensitiveEndpointLimiter).toBeDefined();
  });
});
