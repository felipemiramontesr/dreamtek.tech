import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { Response } from 'express';
import {
  requireAuth,
  requireRole,
  AuthenticatedRequest,
} from '../../../server/src/middleware/auth';

const TEST_SECRET = 'dreamtek_dev_jwt_secret_key_2026';

describe('FC 001m Client & Admin Portal Auth & RBAC Suite', () => {
  it('requireAuth debe rechazar solicitudes sin cookies ni encabezados Bearer con HTTP 401', () => {
    const req = { cookies: {}, headers: {} } as AuthenticatedRequest;
    let statusSent = 0;
    let jsonBody: Record<string, unknown> | null = null;

    const res = {
      status: (s: number) => {
        statusSent = s;
        return res;
      },
      json: (b: Record<string, unknown>) => {
        jsonBody = b;
        return res;
      },
    } as unknown as Response;

    let nextCalled = false;
    const next = () => {
      nextCalled = true;
    };

    requireAuth(req, res, next);

    expect(statusSent).toBe(401);
    expect(jsonBody?.error).toBe('Unauthorized');
    expect(nextCalled).toBe(false);
  });

  it('requireAuth debe validar firma JWT inyectando req.user con userId y rol en mayúsculas', () => {
    const token = jwt.sign(
      { userId: 42, email: 'cliente@empresa.com', role: 'client' },
      TEST_SECRET,
      { algorithm: 'HS512' },
    );

    const req = {
      cookies: { dreamtek_session: token },
      headers: {},
    } as AuthenticatedRequest;

    const res = {} as unknown as Response;
    let nextCalled = false;
    const next = () => {
      nextCalled = true;
    };

    requireAuth(req, res, next);

    expect(nextCalled).toBe(true);
    expect(req.user).toBeDefined();
    expect(req.user?.userId).toBe(42);
    expect(req.user?.role).toBe('CLIENT');
  });

  it('requireRole debe bloquear a usuarios CLIENT que intenten acceder a recursos ADMIN con HTTP 403', () => {
    const req = {
      user: { userId: 10, email: 'cliente@empresa.com', role: 'CLIENT' },
    } as AuthenticatedRequest;

    let statusSent = 0;
    let jsonBody: Record<string, unknown> | null = null;

    const res = {
      status: (s: number) => {
        statusSent = s;
        return res;
      },
      json: (b: Record<string, unknown>) => {
        jsonBody = b;
        return res;
      },
    } as unknown as Response;

    let nextCalled = false;
    const next = () => {
      nextCalled = true;
    };

    const adminCheck = requireRole(['ADMIN']);
    adminCheck(req, res, next);

    expect(statusSent).toBe(403);
    expect(jsonBody?.error).toBe('Forbidden');
    expect(nextCalled).toBe(false);
  });

  it('requireRole debe permitir el paso a usuarios con rol ADMIN en mayúsculas', () => {
    const req = {
      user: { userId: 1, email: 'admin@dreamtek.tech', role: 'ADMIN' },
    } as AuthenticatedRequest;

    const res = {} as unknown as Response;
    let nextCalled = false;
    const next = () => {
      nextCalled = true;
    };

    const adminCheck = requireRole(['ADMIN']);
    adminCheck(req, res, next);

    expect(nextCalled).toBe(true);
  });
});
