/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import supertest from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import * as db from '../../../server/src/db';
import {
  authRouter,
  COOKIE_NAME,
  MFA_COOKIE_NAME,
  setAuthTransporterForTest,
  getAuthTransporter,
} from '../../../server/src/routes/auth';
import { mfaVerifySchema } from '../../../server/src/schemas/auth.schema';
import {
  encryptTotpSecret,
  computeTotpCode,
  getCurrentTimestep,
  hashRecoveryCode,
  generateEmailOtp,
} from '../../../server/src/utils/totp';

vi.mock('../../../server/src/db', () => {
  const mockQuery = vi.fn();
  return {
    query: mockQuery,
    withTransaction: vi.fn(async (cb: any) => cb({ query: mockQuery })),
    pool: {
      execute: vi.fn().mockResolvedValue([{ insertId: 1 }]),
    },
  };
});

const TEST_SECRET = 'dreamtek_dev_jwt_secret_key_2026';

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/v1/auth', authRouter);

describe('FC 047 Multi-Factor Authentication (2FA) API Suite (Conditions C-047.1-9)', () => {
  const originalEnv = process.env;
  let mockSendMail: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.query).mockReset();
    process.env = { ...originalEnv };
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = TEST_SECRET;

    mockSendMail = vi.fn().mockResolvedValue({ messageId: 'mfa-otp-test-123' });
    setAuthTransporterForTest({
      sendMail: mockSendMail,
    });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  const hashPassword = (pw: string) => bcrypt.hashSync(pw, 8);

  describe('POST /api/v1/auth/login with 2FA Challenge (Conditions C-047.1 & C-047.3)', () => {
    it('authenticates standard user without 2FA directly with dreamtek_session cookie', async () => {
      const pwHash = hashPassword('CorrectPassword123');
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 10,
          username: 'user10',
          email: 'user10@dreamtek.tech',
          password_hash: pwHash,
          role: 'CLIENT',
          full_name: 'Regular User',
          is_2fa_enabled: 0,
        },
      ]);

      const res = await supertest(app)
        .post('/api/v1/auth/login')
        .send({ email: 'user10@dreamtek.tech', password: 'CorrectPassword123' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.user.email).toBe('user10@dreamtek.tech');

      const cookies = res.headers['set-cookie'] as unknown as string[];
      expect(cookies.some((c) => c.includes(COOKIE_NAME))).toBe(true);
      expect(cookies.some((c) => c.includes(MFA_COOKIE_NAME))).toBe(false);
    });

    it('triggers 2FA challenge when is_2fa_enabled === 1 and issues ONLY dreamtek_mfa_ticket (C-047.1 & C-047.3)', async () => {
      const pwHash = hashPassword('CorrectPassword123');
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 20,
          username: 'admin20',
          email: 'admin20@dreamtek.tech',
          password_hash: pwHash,
          role: 'ADMIN',
          full_name: 'Admin 2FA',
          is_2fa_enabled: 1,
          totp_secret_encrypted: encryptTotpSecret('JBSWY3DPEHPK3PXP'),
        },
      ]);

      const res = await supertest(app)
        .post('/api/v1/auth/login')
        .send({ email: 'admin20@dreamtek.tech', password: 'CorrectPassword123' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('2fa_required');
      expect(res.body.available_methods).toEqual(['TOTP', 'EMAIL', 'RECOVERY']);
      expect(res.body.user.id).toBe(20);
      expect(res.body.mfa_ticket).toBeUndefined(); // Condition C-047.3: Never in JSON body!

      const cookies = res.headers['set-cookie'] as unknown as string[];
      // Condition C-047.1: NEVER set session cookie on first stage!
      expect(cookies.some((c) => c.includes(COOKIE_NAME))).toBe(false);
      // Condition C-047.3: Set HttpOnly MFA ticket cookie
      expect(cookies.some((c) => c.includes(MFA_COOKIE_NAME) && c.includes('HttpOnly'))).toBe(true);
    });

    it('rejects invalid credentials with 401 and logs failure', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .post('/api/v1/auth/login')
        .send({ email: 'ghost@dreamtek.tech', password: 'WrongPassword123' });

      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Credenciales inválidas.');
    });
  });

  describe('POST /api/v1/auth/2fa/verify (Conditions C-047.1/3/5/6)', () => {
    const getMfaTicketCookie = (uid = 20, email = 'admin20@dreamtek.tech') => {
      const ticket = jwt.sign(
        { userId: uid, uid, email, role: 'ADMIN', type: 'MFA_TICKET', stage: 'MFA_PENDING' },
        TEST_SECRET,
        { algorithm: 'HS512', expiresIn: '5m' },
      );
      return `${MFA_COOKIE_NAME}=${ticket}`;
    };

    it('rejects verification if dreamtek_mfa_ticket is missing or invalid', async () => {
      const res = await supertest(app)
        .post('/api/v1/auth/2fa/verify')
        .send({ code: '123456', method: 'TOTP' });

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('Ticket de verificación 2FA no encontrado');

      const invalidRes = await supertest(app)
        .post('/api/v1/auth/2fa/verify')
        .set('Cookie', `${MFA_COOKIE_NAME}=corrupt_ticket`)
        .send({ code: '123456', method: 'TOTP' });

      expect(invalidRes.status).toBe(401);
    });

    it('verifies TOTP code cleanly, updates last_totp_timestep and issues dreamtek_session', async () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const encSecret = encryptTotpSecret(secret);
      const currentStep = getCurrentTimestep();
      const validCode = computeTotpCode(secret, currentStep);

      vi.mocked(db.query)
        .mockResolvedValueOnce([
          {
            id: 20,
            email: 'admin20@dreamtek.tech',
            role: 'ADMIN',
            full_name: 'Admin 2FA',
            is_2fa_enabled: 1,
            totp_secret_encrypted: encSecret,
            last_totp_timestep: currentStep - 5n,
          },
        ]) // SELECT user
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE last_totp_timestep

      const res = await supertest(app)
        .post('/api/v1/auth/2fa/verify')
        .set('Cookie', getMfaTicketCookie(20))
        .send({ code: validCode, method: 'TOTP' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.user.email).toBe('admin20@dreamtek.tech');

      const cookies = res.headers['set-cookie'] as unknown as string[];
      expect(cookies.some((c) => c.includes(COOKIE_NAME))).toBe(true);
      expect(cookies.some((c) => c.includes(`${MFA_COOKIE_NAME}=;`))).toBe(true);
    });

    it('enforces anti-replay on TOTP verification (Condition C-047.5)', async () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const encSecret = encryptTotpSecret(secret);
      const currentStep = getCurrentTimestep();
      const code = computeTotpCode(secret, currentStep);

      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 20,
          email: 'admin20@dreamtek.tech',
          role: 'ADMIN',
          full_name: 'Admin 2FA',
          is_2fa_enabled: 1,
          totp_secret_encrypted: encSecret,
          last_totp_timestep: currentStep, // Already used for this step!
        },
      ]);

      const res = await supertest(app)
        .post('/api/v1/auth/2fa/verify')
        .set('Cookie', getMfaTicketCookie(20))
        .send({ code, method: 'TOTP' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Código ya utilizado');
    });

    it('verifies Email OTP correctly and consumes token', async () => {
      const { code, codeHash } = generateEmailOtp(10);

      vi.mocked(db.query)
        .mockResolvedValueOnce([
          {
            id: 20,
            email: 'admin20@dreamtek.tech',
            role: 'ADMIN',
            full_name: 'Admin 2FA',
            is_2fa_enabled: 1,
          },
        ]) // SELECT user
        .mockResolvedValueOnce([
          {
            id: 101,
            code_hash: codeHash,
            attempts: 0,
            max_attempts: 5,
            expires_at: new Date(Date.now() + 600000),
          },
        ]) // SELECT active OTP
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE used = 1

      const res = await supertest(app)
        .post('/api/v1/auth/2fa/verify')
        .set('Cookie', getMfaTicketCookie(20))
        .send({ code, method: 'EMAIL' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
    });

    it('rejects Email OTP when attempts exceeded or code is wrong', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([
          { id: 20, email: 'admin20@dreamtek.tech', role: 'ADMIN', is_2fa_enabled: 1 },
        ])
        .mockResolvedValueOnce([
          {
            id: 101,
            code_hash: 'somehash',
            attempts: 5,
            max_attempts: 5,
            expires_at: new Date(Date.now() + 600000),
          },
        ]);

      const res = await supertest(app)
        .post('/api/v1/auth/2fa/verify')
        .set('Cookie', getMfaTicketCookie(20))
        .send({ code: '123456', method: 'EMAIL' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Número máximo de intentos excedido');
    });

    it('verifies one-time recovery code and marks it used atomically (Condition C-047.6)', async () => {
      const plainCode = 'A1B2C-D3E4F';
      const hashed = hashRecoveryCode(plainCode);

      vi.mocked(db.query)
        .mockResolvedValueOnce([
          {
            id: 20,
            email: 'admin20@dreamtek.tech',
            role: 'ADMIN',
            full_name: 'Admin 2FA',
            is_2fa_enabled: 1,
          },
        ]) // SELECT user
        .mockResolvedValueOnce([
          { id: 501, code_hash: hashed },
          { id: 502, code_hash: 'different_hash' },
        ]) // SELECT recovery codes
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE used = 1

      const res = await supertest(app)
        .post('/api/v1/auth/2fa/verify')
        .set('Cookie', getMfaTicketCookie(20))
        .send({ code: plainCode, method: 'RECOVERY' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
    });
  });

  describe('POST /api/v1/auth/2fa/send-email-otp', () => {
    const getMfaTicketCookie = (uid = 20, email = 'admin20@dreamtek.tech') => {
      const ticket = jwt.sign(
        { userId: uid, uid, email, role: 'ADMIN', type: 'MFA_TICKET', stage: 'MFA_PENDING' },
        TEST_SECRET,
        { algorithm: 'HS512', expiresIn: '5m' },
      );
      return `${MFA_COOKIE_NAME}=${ticket}`;
    };

    it('sends email OTP and records in user_mfa_email_otps', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ count: 1 }]) // Rate limit count < 3
        .mockResolvedValueOnce([{ insertId: 77 }]); // Insert OTP

      const res = await supertest(app)
        .post('/api/v1/auth/2fa/send-email-otp')
        .set('Cookie', getMfaTicketCookie(20));

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(mockSendMail).toHaveBeenCalledTimes(1);
    });

    it('enforces rate limit of 3 emails in 15 minutes window', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([{ count: 3 }]); // Rate limit reached

      const res = await supertest(app)
        .post('/api/v1/auth/2fa/send-email-otp')
        .set('Cookie', getMfaTicketCookie(20));

      expect(res.status).toBe(429);
      expect(res.body.message).toContain('Demasiadas solicitudes de código');
    });
  });

  describe('Management: /status, /setup, /enable, /disable (Condition C-047.8)', () => {
    const getSessionCookie = (uid = 30) => {
      const token = jwt.sign(
        { userId: uid, uid, email: `user_${uid}@dreamtek.tech`, role: 'CLIENT' },
        TEST_SECRET,
        { algorithm: 'HS512' },
      );
      return `${COOKIE_NAME}=${token}`;
    };

    it('GET /2fa/status returns current enrollment and remaining recovery codes', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([
          {
            id: 30,
            email: 'user30@dreamtek.tech',
            is_2fa_enabled: 1,
            mfa_enrolled_at: '2026-09-12',
          },
        ]) // getSessionUser
        .mockResolvedValueOnce([{ remaining: 7 }]); // recovery count

      const res = await supertest(app)
        .get('/api/v1/auth/2fa/status')
        .set('Cookie', getSessionCookie(30));

      expect(res.status).toBe(200);
      expect(res.body.is_2fa_enabled).toBe(true);
      expect(res.body.remaining_recovery_codes).toBe(7);
    });

    it('POST /2fa/setup returns fresh Base32 secret, otpauth URL and 8 recovery codes', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 30, email: 'user30@dreamtek.tech', is_2fa_enabled: 0 },
      ]);

      const res = await supertest(app)
        .post('/api/v1/auth/2fa/setup')
        .set('Cookie', getSessionCookie(30));

      expect(res.status).toBe(200);
      expect(res.body.secretBase32).toBeDefined();
      expect(res.body.otpauthUrl).toContain('otpauth://totp/Dreamtek');
      expect(res.body.recoveryCodes.length).toBe(8);
    });

    it('POST /2fa/enable activates 2FA on valid code verification', async () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const validCode = computeTotpCode(secret, getCurrentTimestep());

      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: 30, email: 'user30@dreamtek.tech' }]) // getSessionUser
        .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE users
        .mockResolvedValueOnce([{ affectedRows: 0 }]) // DELETE old recovery
        .mockResolvedValue([{ affectedRows: 1 }]); // INSERT 8 recovery codes

      const res = await supertest(app)
        .post('/api/v1/auth/2fa/enable')
        .set('Cookie', getSessionCookie(30))
        .send({
          code: validCode,
          secretBase32: secret,
          recoveryCodes: ['CODE1-AAAAA', 'CODE2-BBBBB'],
        });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('activada exitosamente');
    });

    it('POST /2fa/disable requires password + valid TOTP/recovery code (Condition C-047.8)', async () => {
      const pwHash = hashPassword('MySecretPassword123');
      const secret = 'JBSWY3DPEHPK3PXP';
      const encSecret = encryptTotpSecret(secret);
      const validCode = computeTotpCode(secret, getCurrentTimestep());

      vi.mocked(db.query)
        .mockResolvedValueOnce([
          {
            id: 30,
            email: 'user30@dreamtek.tech',
            password_hash: pwHash,
            is_2fa_enabled: 1,
            totp_secret_encrypted: encSecret,
          },
        ]) // getSessionUser
        .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE users is_2fa_enabled=0
        .mockResolvedValueOnce([{ affectedRows: 8 }]) // DELETE recovery
        .mockResolvedValueOnce([{ affectedRows: 2 }]); // DELETE email otps

      const res = await supertest(app)
        .post('/api/v1/auth/2fa/disable')
        .set('Cookie', getSessionCookie(30))
        .send({
          password: 'MySecretPassword123',
          code: validCode,
        });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('desactivada exitosamente');
    });

    it('POST /2fa/disable rejects if password does not match', async () => {
      const pwHash = hashPassword('MySecretPassword123');
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 30,
          email: 'user30@dreamtek.tech',
          password_hash: pwHash,
          is_2fa_enabled: 1,
        },
      ]);

      const res = await supertest(app)
        .post('/api/v1/auth/2fa/disable')
        .set('Cookie', getSessionCookie(30))
        .send({
          password: 'WrongPassword!',
          code: '123456',
        });

      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Contraseña incorrecta.');
    });

    it('POST /2fa/disable succeeds using recovery code when TOTP code fails or secret unreadable', async () => {
      const pwHash = hashPassword('MySecretPassword123');
      const recCode = 'REC01-AAAAA';
      const recHash = hashRecoveryCode(recCode);

      vi.mocked(db.query)
        .mockResolvedValueOnce([
          {
            id: 30,
            email: 'user30@dreamtek.tech',
            password_hash: pwHash,
            is_2fa_enabled: 1,
            totp_secret_encrypted: 'corrupted:secret',
          },
        ]) // getSessionUser
        .mockResolvedValueOnce([
          { id: 99, code_hash: hashRecoveryCode('NOMATCH-1234') },
          { id: 101, code_hash: recHash },
        ]) // recovery query with first item false and second item true
        .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE users
        .mockResolvedValueOnce([{ affectedRows: 1 }]) // DELETE recovery
        .mockResolvedValueOnce([{ affectedRows: 0 }]); // DELETE otps

      const res = await supertest(app)
        .post('/api/v1/auth/2fa/disable')
        .set('Cookie', getSessionCookie(30))
        .send({
          password: 'MySecretPassword123',
          code: recCode,
        });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('desactivada exitosamente');
    });

    it('POST /2fa/disable rejects when neither TOTP nor recovery code matches', async () => {
      const pwHash = hashPassword('MySecretPassword123');
      vi.mocked(db.query)
        .mockResolvedValueOnce([
          {
            id: 30,
            email: 'user30@dreamtek.tech',
            password_hash: pwHash,
            is_2fa_enabled: 1,
            totp_secret_encrypted: null,
          },
        ]) // getSessionUser
        .mockResolvedValueOnce([]); // no matching recovery codes

      const res = await supertest(app)
        .post('/api/v1/auth/2fa/disable')
        .set('Cookie', getSessionCookie(30))
        .send({
          password: 'MySecretPassword123',
          code: 'WRONG1-CODE',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('incorrecto');
    });

    it('handles unauthorized access (no cookie / corrupt cookie) on 2FA management endpoints', async () => {
      const endpoints = [
        { method: 'get', path: '/api/v1/auth/2fa/status' },
        { method: 'post', path: '/api/v1/auth/2fa/setup' },
        {
          method: 'post',
          path: '/api/v1/auth/2fa/enable',
          body: { code: '123456', secretBase32: 'JBSWY3DPEHPK3PXP' },
        },
        {
          method: 'post',
          path: '/api/v1/auth/2fa/disable',
          body: { password: 'pass', code: '123456' },
        },
      ];

      for (const ep of endpoints) {
        // No cookie
        const resNoCookie = await (supertest(app) as any)[ep.method](ep.path).send(ep.body || {});
        expect(resNoCookie.status).toBe(401);

        // Corrupt cookie
        const resCorrupt = await (supertest(app) as any)
          [ep.method](ep.path)
          .set('Cookie', `${COOKIE_NAME}=invalid_jwt`)
          .send(ep.body || {});
        expect(resCorrupt.status).toBe(401);
      }
    });

    it('POST /2fa/enable handles invalid TOTP code and default recovery codes generation', async () => {
      // 1. Invalid code
      vi.mocked(db.query).mockResolvedValueOnce([{ id: 30, email: 'user30@dreamtek.tech' }]);
      const resInvalid = await supertest(app)
        .post('/api/v1/auth/2fa/enable')
        .set('Cookie', getSessionCookie(30))
        .send({
          code: '000000',
          secretBase32: 'JBSWY3DPEHPK3PXP',
        });
      expect(resInvalid.status).toBe(400);
      expect(resInvalid.body.message).toContain('incorrecto');

      // 2. Valid code with empty recoveryCodes (generates 8 fresh codes)
      const secret = 'JBSWY3DPEHPK3PXP';
      const validCode = computeTotpCode(secret, getCurrentTimestep());
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: 30, email: 'user30@dreamtek.tech' }])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 0 }])
        .mockResolvedValue([{ affectedRows: 1 }]);

      const resDefaultCodes = await supertest(app)
        .post('/api/v1/auth/2fa/enable')
        .set('Cookie', getSessionCookie(30))
        .send({
          code: validCode,
          secretBase32: secret,
        });
      expect(resDefaultCodes.status).toBe(200);
    });

    it('POST /2fa/verify covers invalid ticket, unconfigured TOTP, and edge cases', async () => {
      // 1. Ticket with wrong type or stage
      const wrongTypeTicket = jwt.sign(
        { userId: 20, type: 'OTHER_TICKET', stage: 'MFA_PENDING' },
        TEST_SECRET,
        { algorithm: 'HS512' },
      );
      const resWrongTicket = await supertest(app)
        .post('/api/v1/auth/2fa/verify')
        .set('Cookie', `${MFA_COOKIE_NAME}=${wrongTypeTicket}`)
        .send({ code: '123456', method: 'TOTP' });
      expect(resWrongTicket.status).toBe(401);

      // 2. User not found or 2FA not enabled
      const ticket = jwt.sign(
        { userId: 999, type: 'MFA_TICKET', stage: 'MFA_PENDING' },
        TEST_SECRET,
        { algorithm: 'HS512' },
      );
      vi.mocked(db.query).mockResolvedValueOnce([]);
      const resNoUser = await supertest(app)
        .post('/api/v1/auth/2fa/verify')
        .set('Cookie', `${MFA_COOKIE_NAME}=${ticket}`)
        .send({ code: '123456', method: 'TOTP' });
      expect(resNoUser.status).toBe(400);

      // 3. User TOTP secret missing
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 20, is_2fa_enabled: 1, totp_secret_encrypted: null },
      ]);
      const resNoSecret = await supertest(app)
        .post('/api/v1/auth/2fa/verify')
        .set('Cookie', `${MFA_COOKIE_NAME}=${ticket}`)
        .send({ code: '123456', method: 'TOTP' });
      expect(resNoSecret.status).toBe(400);
      expect(resNoSecret.body.message).toContain('Método TOTP no configurado');

      // 4. TOTP invalid expired code
      const encSecret = encryptTotpSecret('JBSWY3DPEHPK3PXP');
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 20, is_2fa_enabled: 1, totp_secret_encrypted: encSecret, last_totp_timestep: 0n },
      ]);
      const resInvalidTotp = await supertest(app)
        .post('/api/v1/auth/2fa/verify')
        .set('Cookie', `${MFA_COOKIE_NAME}=${ticket}`)
        .send({ code: '000000', method: 'TOTP' });
      expect(resInvalidTotp.status).toBe(400);
      expect(resInvalidTotp.body.message).toContain('inválido o expirado');

      // 5. EMAIL with no active OTP
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: 20, is_2fa_enabled: 1 }]) // user
        .mockResolvedValueOnce([]); // no active OTP
      const resNoOtp = await supertest(app)
        .post('/api/v1/auth/2fa/verify')
        .set('Cookie', `${MFA_COOKIE_NAME}=${ticket}`)
        .send({ code: '123456', method: 'EMAIL' });
      expect(resNoOtp.status).toBe(400);
      expect(resNoOtp.body.message).toContain('No hay código de verificación activo');

      // 6. EMAIL with max attempts exceeded
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: 20, is_2fa_enabled: 1 }])
        .mockResolvedValueOnce([{ id: 5, attempts: 5, max_attempts: 5 }]);
      const resMaxOtp = await supertest(app)
        .post('/api/v1/auth/2fa/verify')
        .set('Cookie', `${MFA_COOKIE_NAME}=${ticket}`)
        .send({ code: '123456', method: 'EMAIL' });
      expect(resMaxOtp.status).toBe(400);
      expect(resMaxOtp.body.message).toContain('Número máximo de intentos excedido');

      // 7. EMAIL with incorrect code incrementing attempts
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: 20, is_2fa_enabled: 1 }])
        .mockResolvedValueOnce([{ id: 5, code_hash: 'some_hash', attempts: 0, max_attempts: 5 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE attempts
      const resWrongEmailCode = await supertest(app)
        .post('/api/v1/auth/2fa/verify')
        .set('Cookie', `${MFA_COOKIE_NAME}=${ticket}`)
        .send({ code: '999999', method: 'EMAIL' });
      expect(resWrongEmailCode.status).toBe(400);
      expect(resWrongEmailCode.body.message).toContain('incorrecto');

      // 8. RECOVERY with invalid code
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: 20, is_2fa_enabled: 1 }])
        .mockResolvedValueOnce([{ id: 1, code_hash: hashRecoveryCode('VALID-CODE') }]);
      const resInvalidRecovery = await supertest(app)
        .post('/api/v1/auth/2fa/verify')
        .set('Cookie', `${MFA_COOKIE_NAME}=${ticket}`)
        .send({ code: 'WRONG-CODE', method: 'RECOVERY' });
      expect(resInvalidRecovery.status).toBe(400);
      expect(resInvalidRecovery.body.message).toContain('inválido o ya utilizado');
    });

    it('handles send-email-otp errors and 500 error catch blocks', async () => {
      // 1. send-email-otp missing ticket
      const resNoTicket = await supertest(app).post('/api/v1/auth/2fa/send-email-otp');
      expect(resNoTicket.status).toBe(401);

      // 2. send-email-otp corrupt ticket
      const resCorruptTicket = await supertest(app)
        .post('/api/v1/auth/2fa/send-email-otp')
        .set('Cookie', `${MFA_COOKIE_NAME}=corrupted`);
      expect(resCorruptTicket.status).toBe(401);

      // 3. 500 errors on all endpoints
      const ticket = jwt.sign(
        { userId: 20, type: 'MFA_TICKET', stage: 'MFA_PENDING' },
        TEST_SECRET,
        { algorithm: 'HS512' },
      );

      vi.mocked(db.query).mockRejectedValue(new Error('Fatal DB Crash'));

      // verify 500
      const resVerify500 = await supertest(app)
        .post('/api/v1/auth/2fa/verify')
        .set('Cookie', `${MFA_COOKIE_NAME}=${ticket}`)
        .send({ code: '123456', method: 'TOTP' });
      expect(resVerify500.status).toBe(500);

      // send-email-otp 500
      const resSend500 = await supertest(app)
        .post('/api/v1/auth/2fa/send-email-otp')
        .set('Cookie', `${MFA_COOKIE_NAME}=${ticket}`);
      expect(resSend500.status).toBe(500);

      // status 500
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: 20, is_2fa_enabled: 1 }]) // getSessionUser
        .mockRejectedValueOnce(new Error('Fatal DB Crash on count'));
      const resStatus500 = await supertest(app)
        .get('/api/v1/auth/2fa/status')
        .set('Cookie', getSessionCookie(20));
      expect(resStatus500.status).toBe(500);

      // setup 500
      vi.mocked(db.query).mockResolvedValueOnce([{ id: 20, email: 'user@test.com' }]);
      const cryptoSpy = vi.spyOn(crypto, 'randomBytes').mockImplementationOnce(() => {
        throw new Error('Entropy failure');
      });
      const resSetup500 = await supertest(app)
        .post('/api/v1/auth/2fa/setup')
        .set('Cookie', getSessionCookie(20));
      expect(resSetup500.status).toBe(500);
      cryptoSpy.mockRestore();

      // enable 500
      const secret = 'JBSWY3DPEHPK3PXP';
      const validCode = computeTotpCode(secret, getCurrentTimestep());
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: 20 }])
        .mockRejectedValueOnce(new Error('Fatal DB Crash on enable update'));
      const resEnable500 = await supertest(app)
        .post('/api/v1/auth/2fa/enable')
        .set('Cookie', getSessionCookie(20))
        .send({ code: validCode, secretBase32: secret });
      expect(resEnable500.status).toBe(500);

      // disable 500
      const pw = 'MySecretPassword123';
      const pwHash = hashPassword(pw);
      vi.mocked(db.query)
        .mockResolvedValueOnce([
          {
            id: 20,
            password_hash: pwHash,
            is_2fa_enabled: 1,
            totp_secret_encrypted: encryptTotpSecret(secret),
          },
        ])
        .mockRejectedValueOnce(new Error('Fatal DB Crash on disable update'));
      const resDisable500 = await supertest(app)
        .post('/api/v1/auth/2fa/disable')
        .set('Cookie', getSessionCookie(20))
        .send({ password: pw, code: validCode });
      expect(resDisable500.status).toBe(500);
    });

    it('covers getAuthTransporter default and mfaVerifySchema errorMap', () => {
      setAuthTransporterForTest(null);
      process.env.SMTP_SECURE = 'true';
      const transporter1 = getAuthTransporter();
      expect(transporter1).toBeDefined();

      process.env.SMTP_SECURE = 'false';
      const transporter2 = getAuthTransporter();
      expect(transporter2).toBeDefined();

      const parseResult = mfaVerifySchema.safeParse({ code: '123456', method: 'INVALID' });
      expect(parseResult.success).toBe(false);
      if (!parseResult.success) {
        expect(parseResult.error.issues[0].message).toBe(
          'Método de verificación debe ser TOTP, EMAIL o RECOVERY.',
        );
      }
    });

    it('covers uid-only payload, empty user list, empty counts, and null role/username branches', async () => {
      // 1. getSessionCookie with uid only
      const uidOnlyToken = jwt.sign({ uid: 33, email: 'uidonly@dreamtek.tech' }, TEST_SECRET, {
        algorithm: 'HS512',
      });
      vi.mocked(db.query)
        .mockResolvedValueOnce([
          { id: 33, email: 'uidonly@dreamtek.tech', is_2fa_enabled: 0, mfa_enrolled_at: null },
        ])
        .mockResolvedValueOnce([]); // empty counts

      const resStatus = await supertest(app)
        .get('/api/v1/auth/2fa/status')
        .set('Cookie', `${COOKIE_NAME}=${uidOnlyToken}`);
      expect(resStatus.status).toBe(200);
      expect(resStatus.body.is_2fa_enabled).toBe(false);
      expect(resStatus.body.remaining_recovery_codes).toBe(0);

      // 2. getSessionUser when DB returns empty array
      vi.mocked(db.query).mockResolvedValueOnce([]);
      const resEmptyUser = await supertest(app)
        .get('/api/v1/auth/2fa/status')
        .set('Cookie', `${COOKIE_NAME}=${uidOnlyToken}`);
      expect(resEmptyUser.status).toBe(401);

      // 3. /2fa/send-email-otp with ticket having only uid, and recentRequests = []
      const ticketUidOnly = jwt.sign(
        { uid: 33, email: 'uidonly@dreamtek.tech', type: 'MFA_TICKET', stage: 'MFA_PENDING' },
        TEST_SECRET,
        { algorithm: 'HS512', expiresIn: '5m' },
      );
      vi.mocked(db.query)
        .mockResolvedValueOnce([]) // recentRequests empty array
        .mockResolvedValueOnce([{ insertId: 1 }]); // INSERT otp
      const resSendOtp = await supertest(app)
        .post('/api/v1/auth/2fa/send-email-otp')
        .set('Cookie', `${MFA_COOKIE_NAME}=${ticketUidOnly}`);
      expect(resSendOtp.status).toBe(200);

      // 4. /2fa/verify with ticket having only uid, and user with role = null
      const secret = 'JBSWY3DPEHPK3PXP';
      const timestep = getCurrentTimestep();
      const code = computeTotpCode(secret, timestep);
      vi.mocked(db.query)
        .mockResolvedValueOnce([
          {
            id: 33,
            email: 'uidonly@dreamtek.tech',
            role: null,
            is_2fa_enabled: 1,
            totp_secret_encrypted: encryptTotpSecret(secret),
            last_totp_timestep: null,
          },
        ])
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // update last_totp_timestep
      const resVerify = await supertest(app)
        .post('/api/v1/auth/2fa/verify')
        .set('Cookie', `${MFA_COOKIE_NAME}=${ticketUidOnly}`)
        .send({ method: 'TOTP', code });
      expect(resVerify.status).toBe(200);

      // 5. /login with user having role = null and username = null
      const pw = 'MySecretPassword123';
      const pwHash = hashPassword(pw);
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 34,
          username: null,
          email: 'nulluser@dreamtek.tech',
          password_hash: pwHash,
          role: null,
          is_2fa_enabled: 0,
        },
      ]);
      const resLogin = await supertest(app)
        .post('/api/v1/auth/login')
        .send({ email: 'nulluser@dreamtek.tech', password: pw });
      expect(resLogin.status).toBe(200);
      expect(resLogin.body.user.username).toBeNull();

      // 6. /login with user having is_2fa_enabled: 1 and role: null
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 35,
          username: 'user35',
          email: 'user35@dreamtek.tech',
          password_hash: pwHash,
          role: null,
          is_2fa_enabled: 1,
        },
      ]);
      const resLogin2FaNoRole = await supertest(app)
        .post('/api/v1/auth/login')
        .send({ email: 'user35@dreamtek.tech', password: pw });
      expect(resLogin2FaNoRole.status).toBe(200);
      expect(resLogin2FaNoRole.body.status).toBe('2fa_required');

      // 7. GET /me with cookie having only uid
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 33, email: 'uidonly@dreamtek.tech', role: 'CLIENT', full_name: 'UID Only' },
      ]);
      const resMeUidOnly = await supertest(app)
        .get('/api/v1/auth/me')
        .set('Cookie', `${COOKIE_NAME}=${uidOnlyToken}`);
      expect(resMeUidOnly.status).toBe(200);
      expect(resMeUidOnly.body.user.email).toBe('uidonly@dreamtek.tech');
    });
  });
});
