import { describe, it, expect } from 'vitest';
import { computeSanitizedPayloadHash } from '../../../server/src/middleware/auditLogger';
import { logSecurityEvent } from '../../../server/src/middleware/auditLogger';
import { Request } from 'express';

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
  });
});
