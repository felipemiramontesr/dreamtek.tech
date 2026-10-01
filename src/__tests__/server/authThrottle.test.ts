/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as db from '../../../server/src/db';
import {
  computeThrottleKey,
  checkLoginThrottle,
  recordFailedLoginAttempt,
  clearLoginThrottle,
} from '../../../server/src/services/authThrottleService';
import { checkUserEmailVerificationQuota } from '../../../server/src/services/mailerQuotaService';
import { validateBootEnvironment } from '../../../server/src/index';

vi.mock('../../../server/src/db', () => ({
  query: vi.fn(),
}));

describe('FC 055 — Fase 2: Auth Throttle & Mailer Quota Services (100% Coverage Suite)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.query).mockReset();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('authThrottleService — Derived Keys & Domain Separation (Enmienda O)', () => {
    it('computeThrottleKey debe normalizar correos e IPs con hashing HMAC-SHA256 determinista derivado de JWT_SECRET', () => {
      process.env.JWT_SECRET = 'test_jwt_secret_key_fixed';
      const key1 = computeThrottleKey('  User@Example.COM ', ' 203.0.113.1 ');
      const key2 = computeThrottleKey('user@example.com', '203.0.113.1');
      expect(key1).toBe(key2);
      expect(key1).toHaveLength(64); // SHA256 hex string

      // Handles empty/null gracefully
      const keyEmpty = computeThrottleKey('', '');
      expect(keyEmpty).toHaveLength(64);
    });

    it('la rotación de JWT_SECRET debe alterar determinísticamente la clave derivada', () => {
      process.env.JWT_SECRET = 'secret_version_1';
      const keyV1 = computeThrottleKey('user@example.com', '203.0.113.1');

      process.env.JWT_SECRET = 'secret_version_2';
      const keyV2 = computeThrottleKey('user@example.com', '203.0.113.1');

      expect(keyV1).not.toBe(keyV2);
      expect(keyV1).toHaveLength(64);
      expect(keyV2).toHaveLength(64);
    });

    it('debe respetar el scope de dominio especificado', () => {
      process.env.JWT_SECRET = 'test_jwt_secret';
      const loginKey = computeThrottleKey('user@example.com', '203.0.113.1', 'login');
      const customKey = computeThrottleKey('user@example.com', '203.0.113.1', 'custom-scope');
      expect(loginKey).not.toBe(customKey);
    });

    it('validateBootEnvironment debe fallar en el arranque (throw) en producción si JWT_SECRET no existe', () => {
      delete process.env.JWT_SECRET;
      process.env.NODE_ENV = 'production';
      expect(() => validateBootEnvironment()).toThrow(
        'FATAL SECURITY ERROR: JWT_SECRET environment variable is missing in production.',
      );
    });

    it('validateBootEnvironment no debe fallar cuando JWT_SECRET está presente en producción', () => {
      process.env.JWT_SECRET = 'valid_production_secret';
      process.env.NODE_ENV = 'production';
      expect(() => validateBootEnvironment()).not.toThrow();
    });
  });

  describe('authThrottleService — checkLoginThrottle', () => {
    it('debe permitir si no hay registro en auth_throttle_counters', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);
      const result = await checkLoginThrottle('alice@example.com', '198.51.100.1');
      expect(result).toEqual({ throttled: false, retryAfterSeconds: 0 });
    });

    it('debe permitir si rows es null/undefined', async () => {
      vi.mocked(db.query).mockResolvedValueOnce(null as any);
      const result = await checkLoginThrottle('alice@example.com', '198.51.100.1');
      expect(result).toEqual({ throttled: false, retryAfterSeconds: 0 });
    });

    it('debe reiniciar y permitir si el último intento tiene más de 15 minutos', async () => {
      const olderThan15Min = new Date(Date.now() - 16 * 60 * 1000).toISOString();
      vi.mocked(db.query).mockResolvedValueOnce([
        { counter: 10, window_start: olderThan15Min, last_attempt_at: olderThan15Min },
      ]);
      const result = await checkLoginThrottle('alice@example.com', '198.51.100.1');
      expect(result).toEqual({ throttled: false, retryAfterSeconds: 0 });
    });

    it('debe permitir sin retardo si el contador es menor a 5', async () => {
      const recent = new Date().toISOString();
      vi.mocked(db.query).mockResolvedValueOnce([
        { counter: 4, window_start: recent, last_attempt_at: recent },
      ]);
      const result = await checkLoginThrottle('alice@example.com', '198.51.100.1');
      expect(result).toEqual({ throttled: false, retryAfterSeconds: 0 });
    });

    it('debe bloquear con 429 LOGIN_THROTTLED y calcular Retry-After si no ha pasado el retardo progresivo', async () => {
      // 5 failed attempts -> 1 second delay
      const justNow = new Date(Date.now() - 100).toISOString(); // 100ms ago
      vi.mocked(db.query).mockResolvedValueOnce([
        { counter: 5, window_start: justNow, last_attempt_at: justNow },
      ]);
      const result = await checkLoginThrottle('alice@example.com', '198.51.100.1');
      expect(result.throttled).toBe(true);
      expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    });

    it('debe permitir si ya transcurrió el tiempo de retardo exponencial', async () => {
      // 5 failed attempts -> 1 second delay. Last attempt was 3 seconds ago
      const threeSecAgo = new Date(Date.now() - 3000).toISOString();
      vi.mocked(db.query).mockResolvedValueOnce([
        { counter: 5, window_start: threeSecAgo, last_attempt_at: threeSecAgo },
      ]);
      const result = await checkLoginThrottle('alice@example.com', '198.51.100.1');
      expect(result).toEqual({ throttled: false, retryAfterSeconds: 0 });
    });

    it('debe topar el retardo máximo en 60 segundos para contadores altos (e.g. 20 intentos)', async () => {
      const justNow = new Date(Date.now() - 100).toISOString();
      vi.mocked(db.query).mockResolvedValueOnce([
        { counter: 20, window_start: justNow, last_attempt_at: justNow },
      ]);
      const result = await checkLoginThrottle('alice@example.com', '198.51.100.1');
      expect(result.throttled).toBe(true);
      expect(result.retryAfterSeconds).toBeLessThanOrEqual(60);
    });

    it('debe garantizar matemáticamente el techo Retry-After <= 60s para contadores arbitrariamente altos (11, 25, 50, 100)', async () => {
      const justNow = new Date(Date.now() - 50).toISOString();
      for (const count of [11, 25, 50, 100]) {
        vi.mocked(db.query).mockResolvedValueOnce([
          { counter: count, window_start: justNow, last_attempt_at: justNow },
        ]);
        const result = await checkLoginThrottle('attacker@example.com', '198.51.100.99');
        expect(result.throttled).toBe(true);
        expect(result.retryAfterSeconds).toBeLessThanOrEqual(60);
        expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe('authThrottleService — recordFailedLoginAttempt & clearLoginThrottle', () => {
    it('recordFailedLoginAttempt debe ejecutar INSERT con ON DUPLICATE KEY UPDATE atómico', async () => {
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 } as any);
      await recordFailedLoginAttempt('bob@example.com', '192.0.2.1');
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO auth_throttle_counters'),
        [expect.any(String)],
      );
    });

    it('clearLoginThrottle debe eliminar exclusivamente la clave del usuario|IP (C-055.5)', async () => {
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 } as any);
      await clearLoginThrottle('bob@example.com', '192.0.2.1');
      expect(db.query).toHaveBeenCalledWith(
        'DELETE FROM auth_throttle_counters WHERE key_hash = ?',
        [expect.any(String)],
      );
    });
  });

  describe('mailerQuotaService — checkUserEmailVerificationQuota', () => {
    it('debe permitir envío si el usuario no ha alcanzado los 5 correos en 24h', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([{ count: 2 }]);
      const quota = await checkUserEmailVerificationQuota(42);
      expect(quota).toEqual({ allowed: true, remaining: 3 });
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT COUNT(*) as count FROM user_email_verifications'),
        [42],
      );
    });

    it('debe bloquear si el usuario ya envió 5 o más correos en 24 horas', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([{ count: 5 }]);
      const quota = await checkUserEmailVerificationQuota(42);
      expect(quota).toEqual({ allowed: false, remaining: 0 });
    });

    it('debe manejar respuestas vacías o nulas de DB como conteo 0', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);
      const quota = await checkUserEmailVerificationQuota(42);
      expect(quota).toEqual({ allowed: true, remaining: 5 });
    });
  });

  describe('Route Integration: /api/v1/auth/login and /register/resend-otp', () => {
    let app: any;
    let jwt: any;
    let supertest: any;

    beforeEach(async () => {
      const express = (await import('express')).default;
      const cookieParser = (await import('cookie-parser')).default;
      const auth = await import('../../../server/src/routes/auth');
      jwt = (await import('jsonwebtoken')).default;
      supertest = (await import('supertest')).default;

      app = express();
      app.use(express.json());
      app.use(cookieParser());
      app.use('/api/v1/auth', auth.authRouter);
    });

    it('POST /login debe responder 429 LOGIN_THROTTLED con cabecera Retry-After cuando el throttle está activo', async () => {
      const now = new Date().toISOString();
      // First query in POST /login is checkLoginThrottle (auth_throttle_counters)
      vi.mocked(db.query).mockResolvedValueOnce([
        { counter: 6, window_start: now, last_attempt_at: now },
      ]);

      const res = await supertest(app)
        .post('/api/v1/auth/login')
        .send({ email: 'target@dreamtek.tech', password: 'AnyPassword123!' });

      expect(res.status).toBe(429);
      expect(res.headers['retry-after']).toBeDefined();
      expect(res.body.code).toBe('LOGIN_THROTTLED');
      expect(res.body.retry_after).toBeGreaterThanOrEqual(1);
    });

    it('POST /register/resend-otp debe responder 429 MAILER_QUOTA_EXCEEDED cuando se supera la cuota diaria', async () => {
      const ticket = jwt.sign(
        {
          userId: 99,
          email: 'quota@dreamtek.tech',
          fullName: 'Quota User',
          type: 'REG_TICKET',
          stage: 'REGISTRATION_OTP_PENDING',
        },
        'dreamtek_dev_jwt_secret_key_2026',
        { algorithm: 'HS512', expiresIn: '15m' },
      );

      // checkUserEmailVerificationQuota returns count: 5
      vi.mocked(db.query).mockResolvedValueOnce([{ count: 5 }]);

      const res = await supertest(app)
        .post('/api/v1/auth/register/resend-otp')
        .set('Cookie', ['dreamtek_reg_ticket=' + ticket]);

      expect(res.status).toBe(429);
      expect(res.body.code).toBe('MAILER_QUOTA_EXCEEDED');
      expect(res.body.message).toContain('superado el límite diario');
    });
  });
});
