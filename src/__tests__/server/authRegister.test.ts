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
  REG_COOKIE_NAME,
  setAuthTransporterForTest,
} from '../../../server/src/routes/auth';

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

describe('FC 049 Public Sign-Up & Email Verification Suite (Conditions C-049.1-7)', () => {
  const originalEnv = process.env;
  let mockSendMail: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.query).mockReset();
    process.env = { ...originalEnv };
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = TEST_SECRET;

    mockSendMail = vi.fn().mockResolvedValue({ messageId: 'test-otp-msg-123' });
    setAuthTransporterForTest({
      sendMail: mockSendMail,
    });
  });

  afterEach(() => {
    setAuthTransporterForTest(null);
    process.env = { ...originalEnv };
  });

  describe('POST /api/v1/auth/register (Condition C-049.2 & C-049.3)', () => {
    it('rechaza el registro si los datos de entrada son inválidos según Zod', async () => {
      const res = await supertest(app)
        .post('/api/v1/auth/register')
        .send({ email: 'correo-invalido', password: '123' });

      expect(res.status).toBe(400);
    });

    it('rechaza el registro si el correo electrónico ya se encuentra registrado (409 Conflict)', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([{ id: 45 }]);

      const res = await supertest(app).post('/api/v1/auth/register').send({
        email: 'existente@empresa.com',
        password: 'PasswordRobusto123!',
        full_name: 'Usuario Existente',
      });

      expect(res.status).toBe(409);
      expect(res.body.message).toContain('ya se encuentra registrado');
    });

    it('crea usuario con is_email_verified = 0, persiste OTP y expide cookie HttpOnly dreamtek_reg_ticket', async () => {
      // 1. Email check: no existing user
      vi.mocked(db.query).mockResolvedValueOnce([]);
      // 2. Insert user
      vi.mocked(db.query).mockResolvedValueOnce({ insertId: 101 } as any);
      // 3. Insert OTP in user_email_verifications
      vi.mocked(db.query).mockResolvedValueOnce({ insertId: 1 } as any);

      const res = await supertest(app).post('/api/v1/auth/register').send({
        email: 'nuevo@empresa.com',
        password: 'PasswordSeguro123!',
        full_name: 'Carlos Mendoza',
        phone: '+525512345678',
      });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('verification_required');
      expect(res.body.user.id).toBe(101);
      expect(res.body.user.email).toBe('nuevo@empresa.com');

      // Condition C-049.2: NEVER set dreamtek_session cookie upon registration
      const cookies = res.headers['set-cookie'] || [];
      const hasSessionCookie = cookies.some((c: string) => c.startsWith(`${COOKIE_NAME}=`));
      expect(hasSessionCookie).toBe(false);

      // Condition C-049.3: Must deliver dreamtek_reg_ticket HttpOnly cookie
      const regCookie = cookies.find((c: string) => c.startsWith(`${REG_COOKIE_NAME}=`));
      expect(regCookie).toBeDefined();
      expect(regCookie).toContain('HttpOnly');

      // Condition C-049.1: Dispatches email from contacto@dreamtek.tech
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: expect.stringContaining('contacto@dreamtek.tech'),
          to: 'nuevo@empresa.com',
        }),
      );
    });

    it('registra usuario exitosamente sin teléfono (campo opcional null)', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);
      vi.mocked(db.query).mockResolvedValueOnce({ insertId: 102 } as any);
      vi.mocked(db.query).mockResolvedValueOnce({ insertId: 2 } as any);

      const res = await supertest(app).post('/api/v1/auth/register').send({
        email: 'sin_telefono@empresa.com',
        password: 'PasswordSeguro123!',
        full_name: 'Usuario Sin Telefono',
      });

      expect(res.status).toBe(201);
      expect(res.body.user.id).toBe(102);
    });

    it('maneja errores internos con status 500 al fallar el registro en BD', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('DB crash'));
      const res = await supertest(app).post('/api/v1/auth/register').send({
        email: 'error@empresa.com',
        password: 'Password123!',
        full_name: 'Usuario Error',
      });
      expect(res.status).toBe(500);
      expect(res.body.message).toContain('Error interno al registrar la cuenta');
    });
  });

  describe('POST /api/v1/auth/register/verify-otp (Conditions C-049.2 & C-049.4)', () => {
    it('rechaza la verificación si no existe la cookie dreamtek_reg_ticket (401)', async () => {
      const res = await supertest(app)
        .post('/api/v1/auth/register/verify-otp')
        .send({ code: '123456' });

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('Sesión de registro no encontrada');
    });

    it('rechaza la verificación si el ticket de registro está corrupto o expirado (401)', async () => {
      const res = await supertest(app)
        .post('/api/v1/auth/register/verify-otp')
        .set('Cookie', [`${REG_COOKIE_NAME}=ticket-invalido`])
        .send({ code: '123456' });

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('Ticket de registro');
    });

    it('rechaza la verificación si el payload del ticket no corresponde a REG_TICKET (401)', async () => {
      const wrongTicket = jwt.sign(
        { userId: 99, email: 'bad@test.com', type: 'OTHER', stage: 'OTHER' },
        TEST_SECRET,
        { algorithm: 'HS512', expiresIn: '15m' },
      );
      const res = await supertest(app)
        .post('/api/v1/auth/register/verify-otp')
        .set('Cookie', [`${REG_COOKIE_NAME}=${wrongTicket}`])
        .send({ code: '123456' });

      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Ticket de registro inválido.');
    });

    it('rechaza la verificación si el código no tiene 6 dígitos numéricos (400)', async () => {
      const ticket = jwt.sign(
        {
          userId: 101,
          email: 'nuevo@empresa.com',
          type: 'REG_TICKET',
          stage: 'REGISTRATION_OTP_PENDING',
        },
        TEST_SECRET,
        { algorithm: 'HS512', expiresIn: '15m' },
      );

      const res = await supertest(app)
        .post('/api/v1/auth/register/verify-otp')
        .set('Cookie', [`${REG_COOKIE_NAME}=${ticket}`])
        .send({ code: '123' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('6 dígitos');
    });

    it('rechaza si el código no es string (400)', async () => {
      const ticket = jwt.sign(
        {
          userId: 101,
          email: 'nuevo@empresa.com',
          type: 'REG_TICKET',
          stage: 'REGISTRATION_OTP_PENDING',
        },
        TEST_SECRET,
        { algorithm: 'HS512', expiresIn: '15m' },
      );

      const res = await supertest(app)
        .post('/api/v1/auth/register/verify-otp')
        .set('Cookie', [`${REG_COOKIE_NAME}=${ticket}`])
        .send({ code: 123456 });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('6 dígitos');
    });

    it('rechaza si no hay OTP activo o expiró en BD (400)', async () => {
      const ticket = jwt.sign(
        {
          userId: 101,
          email: 'nuevo@empresa.com',
          type: 'REG_TICKET',
          stage: 'REGISTRATION_OTP_PENDING',
        },
        TEST_SECRET,
        { algorithm: 'HS512', expiresIn: '15m' },
      );

      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .post('/api/v1/auth/register/verify-otp')
        .set('Cookie', [`${REG_COOKIE_NAME}=${ticket}`])
        .send({ code: '123456' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('No hay código de verificación activo');
    });

    it('rechaza e incrementa intentos si el código es incorrecto (400)', async () => {
      const ticket = jwt.sign(
        {
          userId: 101,
          email: 'nuevo@empresa.com',
          type: 'REG_TICKET',
          stage: 'REGISTRATION_OTP_PENDING',
        },
        TEST_SECRET,
        { algorithm: 'HS512', expiresIn: '15m' },
      );

      const realHash = crypto.createHash('sha256').update('654321').digest('hex');
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 5, code_hash: realHash, attempts: 1, max_attempts: 5, expires_at: new Date() },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 } as any);

      const res = await supertest(app)
        .post('/api/v1/auth/register/verify-otp')
        .set('Cookie', [`${REG_COOKIE_NAME}=${ticket}`])
        .send({ code: '111111' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Código de verificación incorrecto');
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE user_email_verifications SET attempts = attempts + 1'),
        [5],
      );
    });

    it('rechaza si se superó el número máximo de intentos para ese código (400)', async () => {
      const ticket = jwt.sign(
        {
          userId: 101,
          email: 'nuevo@empresa.com',
          type: 'REG_TICKET',
          stage: 'REGISTRATION_OTP_PENDING',
        },
        TEST_SECRET,
        { algorithm: 'HS512', expiresIn: '15m' },
      );

      const realHash = crypto.createHash('sha256').update('654321').digest('hex');
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 5, code_hash: realHash, attempts: 5, max_attempts: 5, expires_at: new Date() },
      ]);

      const res = await supertest(app)
        .post('/api/v1/auth/register/verify-otp')
        .set('Cookie', [`${REG_COOKIE_NAME}=${ticket}`])
        .send({ code: '654321' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Número máximo de intentos excedido');
    });

    it('valida exitosamente el código (timingSafeEqual), activa cuenta y expide cookie dreamtek_session', async () => {
      const ticket = jwt.sign(
        {
          userId: 101,
          email: 'nuevo@empresa.com',
          fullName: 'Carlos Mendoza',
          type: 'REG_TICKET',
          stage: 'REGISTRATION_OTP_PENDING',
        },
        TEST_SECRET,
        { algorithm: 'HS512', expiresIn: '15m' },
      );

      const correctCode = '876543';
      const realHash = crypto.createHash('sha256').update(correctCode).digest('hex');

      // 1. Fetch OTP
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 8, code_hash: realHash, attempts: 0, max_attempts: 5, expires_at: new Date() },
      ]);
      // 2. Mark OTP used
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 } as any);
      // 3. Mark user verified
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 } as any);

      const res = await supertest(app)
        .post('/api/v1/auth/register/verify-otp')
        .set('Cookie', [`${REG_COOKIE_NAME}=${ticket}`])
        .send({ code: correctCode });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.user.email).toBe('nuevo@empresa.com');

      // Condition C-049.2: Delivers final dreamtek_session cookie
      const cookies = res.headers['set-cookie'] || [];
      const sessionCookie = cookies.find((c: string) => c.startsWith(`${COOKIE_NAME}=`));
      expect(sessionCookie).toBeDefined();
      expect(sessionCookie).toContain('HttpOnly');
    });

    it('maneja errores internos de base de datos con status 500 en verify-otp', async () => {
      const ticket = jwt.sign(
        {
          userId: 101,
          email: 'nuevo@empresa.com',
          fullName: 'Carlos Mendoza',
          type: 'REG_TICKET',
          stage: 'REGISTRATION_OTP_PENDING',
        },
        TEST_SECRET,
        { algorithm: 'HS512', expiresIn: '15m' },
      );
      vi.mocked(db.query).mockRejectedValueOnce(new Error('DB Timeout'));

      const res = await supertest(app)
        .post('/api/v1/auth/register/verify-otp')
        .set('Cookie', [`${REG_COOKIE_NAME}=${ticket}`])
        .send({ code: '123456' });

      expect(res.status).toBe(500);
      expect(res.body.message).toContain('Error interno en la verificación');
    });
  });

  describe('POST /api/v1/auth/register/resend-otp (Condition C-049.5)', () => {
    it('rechaza reenvío si no existe ticket de registro (401)', async () => {
      const res = await supertest(app).post('/api/v1/auth/register/resend-otp');
      expect(res.status).toBe(401);
    });

    it('rechaza el reenvío si el ticket de registro está corrupto o expirado (401)', async () => {
      const res = await supertest(app)
        .post('/api/v1/auth/register/resend-otp')
        .set('Cookie', [`${REG_COOKIE_NAME}=ticket-corrupto`]);

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('Ticket de registro expirado o inválido');
    });

    it('aplica rate limiting si se superan 3 solicitudes en 15 minutos (429)', async () => {
      const ticket = jwt.sign(
        {
          userId: 101,
          email: 'nuevo@empresa.com',
          type: 'REG_TICKET',
          stage: 'REGISTRATION_OTP_PENDING',
        },
        TEST_SECRET,
        { algorithm: 'HS512', expiresIn: '15m' },
      );

      vi.mocked(db.query).mockResolvedValueOnce([{ count: 3 }]);

      const res = await supertest(app)
        .post('/api/v1/auth/register/resend-otp')
        .set('Cookie', [`${REG_COOKIE_NAME}=${ticket}`]);

      expect(res.status).toBe(429);
      expect(res.body.message).toContain('Demasiadas solicitudes');
    });

    it('reenvía exitosamente código cuando está dentro de la cuota (200)', async () => {
      const ticket = jwt.sign(
        {
          userId: 101,
          email: 'nuevo@empresa.com',
          fullName: 'Carlos Mendoza',
          type: 'REG_TICKET',
          stage: 'REGISTRATION_OTP_PENDING',
        },
        TEST_SECRET,
        { algorithm: 'HS512', expiresIn: '15m' },
      );

      // 1. Count requests in last 15 min (<3)
      vi.mocked(db.query).mockResolvedValueOnce([{ count: 1 }]);
      // 2. Invalidate previous OTPs
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 } as any);
      // 3. Insert new OTP
      vi.mocked(db.query).mockResolvedValueOnce({ insertId: 2 } as any);

      const res = await supertest(app)
        .post('/api/v1/auth/register/resend-otp')
        .set('Cookie', [`${REG_COOKIE_NAME}=${ticket}`]);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'nuevo@empresa.com',
          subject: 'Confirma tu correo electrónico — Dreamtek',
        }),
      );
    });

    it('maneja errores internos de base de datos con status 500 al reenviar código', async () => {
      const ticket = jwt.sign(
        {
          userId: 101,
          email: 'nuevo@empresa.com',
          fullName: 'Carlos Mendoza',
          type: 'REG_TICKET',
          stage: 'REGISTRATION_OTP_PENDING',
        },
        TEST_SECRET,
        { algorithm: 'HS512', expiresIn: '15m' },
      );

      vi.mocked(db.query).mockRejectedValueOnce(new Error('DB Connection Timeout'));

      const res = await supertest(app)
        .post('/api/v1/auth/register/resend-otp')
        .set('Cookie', [`${REG_COOKIE_NAME}=${ticket}`]);

      expect(res.status).toBe(500);
      expect(res.body.message).toContain('Error interno al reenviar código');
    });
  });

  describe('POST /api/v1/auth/login con verificación de correo obligatoria (Condition C-049.2)', () => {
    it('bloquea inicio de sesión con 403 si is_email_verified === 0', async () => {
      const pwHash = bcrypt.hashSync('PasswordCorrecto123', 8);
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 50,
          username: 'no_verificado',
          email: 'bloqueado@empresa.com',
          password_hash: pwHash,
          role: 'CLIENT',
          full_name: 'No Verificado',
          is_2fa_enabled: 0,
          is_email_verified: 0,
        },
      ]);

      const res = await supertest(app).post('/api/v1/auth/login').send({
        email: 'bloqueado@empresa.com',
        password: 'PasswordCorrecto123',
      });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
      expect(res.body.message).toContain('no ha sido verificado');
    });

    it('permite inicio de sesión si is_email_verified === 1', async () => {
      const pwHash = bcrypt.hashSync('PasswordCorrecto123', 8);
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 51,
          username: 'verificado',
          email: 'activo@empresa.com',
          password_hash: pwHash,
          role: 'CLIENT',
          full_name: 'Usuario Activo',
          is_2fa_enabled: 0,
          is_email_verified: 1,
        },
      ]);

      const res = await supertest(app).post('/api/v1/auth/login').send({
        email: 'activo@empresa.com',
        password: 'PasswordCorrecto123',
      });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
    });
  });
});
