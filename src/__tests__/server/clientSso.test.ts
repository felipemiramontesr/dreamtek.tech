import { describe, it, expect, vi, beforeEach } from 'vitest';
import supertest from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import * as db from '../../../server/src/db';
import { authRouter } from '../../../server/src/routes/auth';
import { clientRouter } from '../../../server/src/routes/client';

vi.mock('../../../server/src/db', () => ({
  query: vi.fn(),
  withTransaction: vi.fn(),
  getConnection: vi.fn(),
}));

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/client', clientRouter);

describe('Client SSO & Dual Auth Integration Suite (FC 038 100% Coverage)', () => {
  const jwtSecret = process.env.JWT_SECRET || 'dreamtek_dev_jwt_secret_key_2026';

  const makeToken = (payload: { userId: number; email: string; role: string }) =>
    jwt.sign(
      {
        userId: payload.userId,
        uid: payload.userId,
        email: payload.email,
        role: payload.role,
      },
      jwtSecret,
      { algorithm: 'HS512', expiresIn: '1h' },
    );

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ARCHON_BASE_URL;
    delete process.env.ARCHON_SSO_SECRET;
  });

  describe('POST /api/v1/auth/login — Dual Identifier Authentication', () => {
    it('debe autenticar exitosamente usando username en lugar de email', async () => {
      const hashed = await bcrypt.hash('Omnipotent2026!', 10);
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          username: 'GrayMan',
          email: 'admin@dreamtek.tech',
          password_hash: hashed,
          role: 'ADMIN',
          full_name: 'GrayMan Omnipotent',
        },
      ]);

      const res = await supertest(app).post('/api/v1/auth/login').send({
        email: 'GrayMan', // Identificador enviado en campo email
        password: 'Omnipotent2026!',
      });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.user.username).toBe('GrayMan');
      expect(res.body.user.role).toBe('ADMIN');
      expect(res.headers['set-cookie']).toBeDefined();
    });

    it('debe retornar 401 si el usuario con username no existe o contraseña es incorrecta', async () => {
      // 1. Usuario no encontrado
      vi.mocked(db.query).mockResolvedValueOnce([]);
      const resNotFound = await supertest(app).post('/api/v1/auth/login').send({
        email: 'NonExistentUser',
        password: 'Password123!',
      });
      expect(resNotFound.status).toBe(401);
      expect(resNotFound.body.message).toBe('Credenciales inválidas.');

      // 2. Contraseña incorrecta
      const hashed = await bcrypt.hash('CorrectPassword!', 10);
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 2,
          username: 'UserTest',
          email: 'user@test.com',
          password_hash: hashed,
          role: 'CLIENT',
        },
      ]);
      const resBadPass = await supertest(app).post('/api/v1/auth/login').send({
        email: 'UserTest',
        password: 'WrongPassword!',
      });
      expect(resBadPass.status).toBe(401);
      expect(resBadPass.body.message).toBe('Credenciales inválidas.');
    });
  });

  describe('POST /api/v1/client/sso/archon — HMAC Bridge URL Generator', () => {
    it('debe rechazar la solicitud si no hay cookie de sesión activa (401)', async () => {
      const res = await supertest(app).post('/api/v1/client/sso/archon');
      expect(res.status).toBe(401);
    });

    it('debe permitir acceso directo a rol ADMIN sin verificar suscripción previa', async () => {
      const adminToken = makeToken({ userId: 1, email: 'admin@dreamtek.tech', role: 'ADMIN' });

      const res = await supertest(app)
        .post('/api/v1/client/sso/archon')
        .set('Cookie', [`dreamtek_session=${adminToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.type).toBe('HMAC_LINK');
      expect(res.body.expires_in).toBe(300);
      expect(res.body.url).toContain('https://fleet.archon.dreamtek.tech/auth/bridge');
      expect(res.body.url).toContain('uid=1');
      expect(res.body.url).toContain('role=ADMIN');
      expect(res.body.url).toContain('sig=');
    });

    it('debe permitir acceso a CLIENT con plan de suscripción ARCHON activo', async () => {
      const clientToken = makeToken({ userId: 42, email: 'client@fleet.com', role: 'CLIENT' });

      vi.mocked(db.query).mockResolvedValueOnce([{ id: 99, plan_id: 'archon-fleet-standard' }]);

      const res = await supertest(app)
        .post('/api/v1/client/sso/archon')
        .set('Cookie', [`dreamtek_session=${clientToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.type).toBe('HMAC_LINK');
      expect(res.body.url).toContain('uid=42');
      expect(res.body.url).toContain('role=CLIENT');
    });

    it('debe denegar acceso (403) a CLIENT sin suscripción a ARCHON', async () => {
      const clientToken = makeToken({ userId: 43, email: 'no_archon@fleet.com', role: 'CLIENT' });

      vi.mocked(db.query).mockResolvedValueOnce([]); // No subs

      const res = await supertest(app)
        .post('/api/v1/client/sso/archon')
        .set('Cookie', [`dreamtek_session=${clientToken}`]);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Forbidden');
      expect(res.body.message).toContain('No cuenta con una suscripción activa a ARCHON');
    });

    it('debe denegar acceso (403) si la consulta de base de datos de suscripciones falla', async () => {
      const clientToken = makeToken({ userId: 44, email: 'db_fail@fleet.com', role: 'CLIENT' });

      vi.mocked(db.query).mockRejectedValueOnce(new Error('Connection lost'));

      const res = await supertest(app)
        .post('/api/v1/client/sso/archon')
        .set('Cookie', [`dreamtek_session=${clientToken}`]);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Forbidden');
    });

    it('debe rechazar (400) si ARCHON_BASE_URL no pertenece al allowlist seguro anti-redirección', async () => {
      process.env.ARCHON_BASE_URL = 'https://malicious-phishing-site.com';
      const adminToken = makeToken({ userId: 1, email: 'admin@dreamtek.tech', role: 'ADMIN' });

      const res = await supertest(app)
        .post('/api/v1/client/sso/archon')
        .set('Cookie', [`dreamtek_session=${adminToken}`]);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Security Error');
      expect(res.body.message).toContain('Base URL de destino no autorizada');
    });

    it('debe manejar excepciones inesperadas con status 500', async () => {
      const adminToken = makeToken({ userId: 1, email: 'admin@dreamtek.tech', role: 'ADMIN' });

      let calls = 0;
      const realNow = Date.now;
      const dateSpy = vi.spyOn(Date, 'now').mockImplementation(() => {
        calls++;
        if (calls > 1) {
          throw new Error('System clock failure');
        }
        return realNow();
      });

      const res = await supertest(app)
        .post('/api/v1/client/sso/archon')
        .set('Cookie', [`dreamtek_session=${adminToken}`]);

      expect(res.status).toBe(500);
      expect(res.body.status).toBe('error');
      expect(res.body.message).toBe('System clock failure');

      dateSpy.mockRestore();
    });

    it('debe asumir rol CLIENT por defecto cuando el token no contiene role', async () => {
      const tokenWithoutRole = jwt.sign({ userId: 50, email: 'norole@fleet.com' }, jwtSecret, {
        algorithm: 'HS512',
        expiresIn: '1h',
      });

      vi.mocked(db.query).mockResolvedValueOnce([]); // No archon sub

      const res = await supertest(app)
        .post('/api/v1/client/sso/archon')
        .set('Cookie', [`dreamtek_session=${tokenWithoutRole}`]);

      expect(res.status).toBe(403);
    });

    it('debe usar mensaje de error por defecto cuando la excepción no tiene message', async () => {
      const adminToken = makeToken({ userId: 1, email: 'admin@dreamtek.tech', role: 'ADMIN' });

      let calls = 0;
      const realNow = Date.now;
      const dateSpy = vi.spyOn(Date, 'now').mockImplementation(() => {
        calls++;
        if (calls > 1) {
          throw ''; // thrown string has no .message
        }
        return realNow();
      });

      const res = await supertest(app)
        .post('/api/v1/client/sso/archon')
        .set('Cookie', [`dreamtek_session=${adminToken}`]);

      expect(res.status).toBe(500);
      expect(res.body.status).toBe('error');
      expect(res.body.message).toBe('Error al generar enlace seguro para ARCHON.');

      dateSpy.mockRestore();
    });
  });

  describe('GET /api/v1/client/dashboard & /sites edge cases', () => {
    it('GET /api/v1/client/dashboard debe retornar 404 si el usuario no existe', async () => {
      const clientToken = makeToken({ userId: 999, email: 'ghost@dtk.com', role: 'CLIENT' });
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .get('/api/v1/client/dashboard')
        .set('Cookie', [`dreamtek_session=${clientToken}`]);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Not Found');
    });

    it('GET /api/v1/client/dashboard debe retornar 500 ante error no controlado en query de usuario', async () => {
      const clientToken = makeToken({ userId: 1, email: 'admin@dtk.com', role: 'ADMIN' });
      vi.mocked(db.query).mockRejectedValueOnce(new Error('Fatal DB failure'));

      const res = await supertest(app)
        .get('/api/v1/client/dashboard')
        .set('Cookie', [`dreamtek_session=${clientToken}`]);

      expect(res.status).toBe(500);
      expect(res.body.message).toBe('Fatal DB failure');

      // Fallback sin .message
      vi.mocked(db.query).mockRejectedValueOnce('');
      const resFallback = await supertest(app)
        .get('/api/v1/client/dashboard')
        .set('Cookie', [`dreamtek_session=${clientToken}`]);

      expect(resFallback.status).toBe(500);
      expect(resFallback.body.message).toBe('Error al obtener el panel de cliente.');
    });

    it('GET /api/v1/client/sites debe retornar 500 ante error no controlado', async () => {
      const clientToken = makeToken({ userId: 1, email: 'admin@dtk.com', role: 'ADMIN' });

      let count = 0;
      const originalJson = express.response.json;
      const jsonSpy = vi.spyOn(express.response, 'json').mockImplementation(function (
        this: express.Response,
        body: unknown,
      ) {
        count++;
        if (count === 1) {
          throw new Error('Sites fatal crash');
        }
        return originalJson.call(this, body);
      });

      const res = await supertest(app)
        .get('/api/v1/client/sites')
        .set('Cookie', [`dreamtek_session=${clientToken}`]);

      expect(res.status).toBe(500);
      expect(res.body.message).toBe('Sites fatal crash');

      // Fallback sin .message
      count = 0;
      const jsonFallbackSpy = vi.spyOn(express.response, 'json').mockImplementation(function (
        this: express.Response,
        body: unknown,
      ) {
        count++;
        if (count === 1) {
          throw '';
        }
        return originalJson.call(this, body);
      });

      const resFallback = await supertest(app)
        .get('/api/v1/client/sites')
        .set('Cookie', [`dreamtek_session=${clientToken}`]);

      expect(resFallback.status).toBe(500);
      expect(resFallback.body.message).toBe('Error al obtener sitios web del cliente.');

      jsonSpy.mockRestore();
      jsonFallbackSpy.mockRestore();
    });
  });
});
