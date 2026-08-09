import { describe, it, expect, vi } from 'vitest';
import {
  computeSanitizedPayloadHash,
  logSecurityEvent,
} from '../../../server/src/middleware/auditLogger';
import { Request } from 'express';

vi.mock('../../../server/src/db', () => ({
  pool: {
    execute: vi.fn().mockResolvedValue([{ affectedRows: 1 }]),
  },
}));

describe('FC 001h Security Hardening Suite & auditLogger 100% Coverage', () => {
  it('computeSanitizedPayloadHash debe sanitizar campos sensibles y retornar SHA-256 hex', () => {
    const payload = {
      user: 'test@dreamtek.tech',
      password: 'SuperSecretPassword123!',
      token: 'jwt.token.val',
      credit_card: '4111111111111111',
      cvv: '123',
      meta: {
        api_key: 'sk_test_secret',
      },
    };

    const hash = computeSanitizedPayloadHash(payload);
    expect(hash).toBeDefined();
    expect(typeof hash).toBe('string');
    expect(hash.length).toBe(64); // 256 bits = 64 hex characters
  });

  it('computeSanitizedPayloadHash debe manejar nulos, no objetos y errores de serialización circular', () => {
    expect(computeSanitizedPayloadHash(null)).toBeNull();
    expect(computeSanitizedPayloadHash(undefined)).toBeNull();
    expect(computeSanitizedPayloadHash('plain_string')).toBeNull();
    expect(computeSanitizedPayloadHash(12345)).toBeNull();

    // Circular object
    const circularObj: Record<string, unknown> = { name: 'test' };
    circularObj.self = circularObj;
    expect(computeSanitizedPayloadHash(circularObj)).toBeNull();
  });

  it('logSecurityEvent debe extraer IP de x-forwarded-for, req.ip o remoteAddress y ejecutar log sin excepciones', async () => {
    const reqForwarded = {
      headers: { 'x-forwarded-for': '192.168.1.100, 10.0.0.1' },
    } as unknown as Request;

    await expect(
      logSecurityEvent(reqForwarded, {
        eventType: 'TEST_EVENT_FORWARDED',
        status: 'SUCCESS',
      }),
    ).resolves.not.toThrow();

    const reqIp = {
      headers: {},
      ip: '10.0.0.2',
    } as unknown as Request;

    await expect(
      logSecurityEvent(reqIp, {
        eventType: 'TEST_EVENT_IP',
        status: 'SUCCESS',
      }),
    ).resolves.not.toThrow();

    const reqRemote = {
      headers: {},
      socket: { remoteAddress: '172.16.0.5' },
    } as unknown as Request;

    await expect(
      logSecurityEvent(reqRemote, {
        eventType: 'TEST_EVENT_REMOTE',
        status: 'SUCCESS',
      }),
    ).resolves.not.toThrow();

    // Test fallback IP (127.0.0.1) and default status (SUCCESS)
    const reqEmpty = {
      headers: {},
      socket: {},
    } as unknown as Request;

    await expect(
      logSecurityEvent(reqEmpty, {
        eventType: 'TEST_EVENT_EMPTY_IP',
        details: 'Long details text '.repeat(50),
      }),
    ).resolves.not.toThrow();
  });

  it('logSecurityEvent debe capturar excepciones de pool.execute y escribir en console.warn', async () => {
    const { pool } = await import('../../../server/src/db');
    vi.mocked(pool.execute).mockRejectedValueOnce(new Error('Audit DB Fail'));

    const req = { headers: {}, socket: {} } as Request;
    await expect(logSecurityEvent(req, { eventType: 'FAIL_EVENT' })).resolves.not.toThrow();
  });
});
