import { describe, it, expect, afterEach } from 'vitest';
import express, { Response } from 'express';
import supertest from 'supertest';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import {
  requireAuth,
  requireRole,
  AuthenticatedRequest,
} from '../../../server/src/middleware/auth';

const TEST_SECRET = 'dreamtek_dev_jwt_secret_key_2026';

describe('FC 001m Portal Authentication & RBAC Suite', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  app.get(
    '/protected-client',
    requireAuth,
    requireRole(['CLIENT']),
    (req: AuthenticatedRequest, res: Response) => {
      res.json({ status: 'success', user: req.user });
    },
  );

  app.get(
    '/protected-admin',
    requireAuth,
    requireRole(['ADMIN']),
    (req: AuthenticatedRequest, res: Response) => {
      res.json({ status: 'success', user: req.user });
    },
  );

  it('debe denegar el acceso (401) si no se proporciona token de sesión o cookie', async () => {
    const res = await supertest(app).get('/protected-client');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });

  it('debe denegar el acceso (401) si el token JWT es inválido o alterado', async () => {
    const res = await supertest(app)
      .get('/protected-client')
      .set('Authorization', 'Bearer invalid_jwt_token_123');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });

  it('debe denegar el acceso (403) si el rol del usuario no tiene permisos para el endpoint', async () => {
    const clientToken = jwt.sign(
      { userId: 10, email: 'client@empresa.com', role: 'CLIENT' },
      TEST_SECRET,
      { algorithm: 'HS512' },
    );
    const res = await supertest(app)
      .get('/protected-admin')
      .set('Authorization', `Bearer ${clientToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Forbidden');
  });

  it('debe otorgar acceso (200) cuando el token y el rol coinciden correctamente', async () => {
    const adminToken = jwt.sign(
      { userId: 1, email: 'admin@dreamtek.tech', role: 'ADMIN' },
      TEST_SECRET,
      { algorithm: 'HS512' },
    );
    const res = await supertest(app)
      .get('/protected-admin')
      .set('Cookie', [`dreamtek_session=${adminToken}`]);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.user.role).toBe('ADMIN');
  });

  it('debe manejar fallback de id y rol cuando no se especifican explícitamente en el payload JWT', async () => {
    const fallbackToken = jwt.sign({ id: 55, email: 'fallback@empresa.com' }, TEST_SECRET, {
      algorithm: 'HS512',
    });
    const res = await supertest(app)
      .get('/protected-client')
      .set('Authorization', `Bearer ${fallbackToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user.userId).toBe(55);
    expect(res.body.user.role).toBe('CLIENT');
  });

  it('debe fallar la autenticación en producción si falta JWT_SECRET', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;

    const res = await supertest(app)
      .get('/protected-client')
      .set('Authorization', 'Bearer token_123');
    expect(res.status).toBe(401);
  });

  it('requireRole middleware debe retornar HTTP 401 si req.user no existe', () => {
    const roleMiddleware = requireRole(['ADMIN']);
    let statusSent = 0;
    let jsonSent: Record<string, unknown> | null = null;
    const resMock = {
      status: (s: number) => {
        statusSent = s;
        return resMock;
      },
      json: (j: Record<string, unknown>) => {
        jsonSent = j;
        return resMock;
      },
    } as unknown as Response;

    roleMiddleware({} as AuthenticatedRequest, resMock, () => {});
    expect(statusSent).toBe(401);
    expect(jsonSent?.message).toBe('Usuario no autenticado.');
  });

  it('requireAuth middleware debe asignar userId = 0 si no existe uid, userId ni id en el token', async () => {
    const noIdToken = jwt.sign({ email: 'noid@empresa.com', role: 'CLIENT' }, TEST_SECRET, {
      algorithm: 'HS512',
    });
    const res = await supertest(app)
      .get('/protected-client')
      .set('Authorization', `Bearer ${noIdToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user.userId).toBe(0);
  });
});
