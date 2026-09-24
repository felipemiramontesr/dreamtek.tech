/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import supertest from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import * as db from '../../../server/src/db';
import {
  authRouter,
  COOKIE_NAME,
  MFA_COOKIE_NAME,
  SETUP_COOKIE_NAME,
} from '../../../server/src/routes/auth';
import {
  encodeBase32,
  decodeBase32,
  generateTotpSecret,
  computeTotpCode,
  verifyTotpCode,
  verifyBackupCode,
  generateBackupCodes,
  hashBackupCode,
} from '../../../server/src/services/totp.service';
import {
  findMfaCredential,
  upsertMfaCredential,
  confirmMfaCredential,
  updateLastUsedStep,
  storeBackupCodes,
  consumeBackupCode,
  createChallenge,
  getChallenge,
  recordFailedChallengeAttempt,
  revokeChallenge,
  resetMfaForUser,
} from '../../../server/src/repositories/mfa.repository';
import {
  evaluateLoginPolicy,
  verifyMfaChallengeAttempt,
  startMfaSetup,
  confirmMfaSetup,
  disableMfaSecurity,
} from '../../../server/src/services/mfa.service';

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

describe('FC 052 Enterprise MFA TOTP RFC 6238 Suite', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.query).mockReset();
    process.env = { ...originalEnv };
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Zero-Dependency Pure TOTP Engine (RFC 6238 / RFC 4226)', () => {
    it('debe codificar y decodificar Base32 sin padding (RFC 4648)', () => {
      const buffer = Buffer.from('Hello Dreamtek!', 'utf8');
      const base32 = encodeBase32(buffer);
      expect(base32).toBeDefined();
      expect(base32).not.toContain('=');

      const decoded = decodeBase32(base32);
      expect(decoded.toString('utf8')).toBe('Hello Dreamtek!');

      // Decodificación con espacios, guiones y minúsculas
      const formatted = `  ${base32.toLowerCase().slice(0, 4)}-${base32.toLowerCase().slice(4)}  `;
      expect(decodeBase32(formatted).toString('utf8')).toBe('Hello Dreamtek!');

      // Error ante caracter inválido
      expect(() => decodeBase32('INVALID#BASE32!')).toThrow('Invalid Base32 character');
    });

    it('debe generar secreto Base32 de 160 bits y URI otpauth válida', () => {
      const { secretBytes, secretBase32, otpauthUri } = generateTotpSecret('admin@empresa.com');
      expect(secretBytes.length).toBe(20);
      expect(secretBase32.length).toBe(32);
      expect(otpauthUri).toContain('otpauth://totp/Dreamtek:admin%40empresa.com');
      expect(otpauthUri).toContain(`secret=${secretBase32}`);
      expect(otpauthUri).toContain('algorithm=SHA1&digits=6&period=30');
    });

    it('debe calcular código TOTP de 6 dígitos numéricos congruente con paso temporal', () => {
      const { secretBase32 } = generateTotpSecret();
      const code1 = computeTotpCode(secretBase32, 1000);
      expect(code1).toMatch(/^\d{6}$/);

      const code2 = computeTotpCode(secretBase32, 1000);
      expect(code1).toBe(code2);

      const code3 = computeTotpCode(secretBase32, 1001);
      expect(code3).toMatch(/^\d{6}$/);
    });

    it('debe verificar código TOTP respetando ventana de deriva ±1 y formato estricto', () => {
      const { secretBase32 } = generateTotpSecret();
      const nowSeconds = 1700000000;
      const currentStep = BigInt(Math.floor(nowSeconds / 30));

      // Código en el paso actual
      const codeCurrent = computeTotpCode(secretBase32, currentStep);
      const resCurrent = verifyTotpCode(secretBase32, codeCurrent, null, nowSeconds);
      expect(resCurrent.valid).toBe(true);
      expect(resCurrent.matchedStep).toBe(currentStep);

      // Código en paso previo (-1 drift)
      const codePast = computeTotpCode(secretBase32, currentStep - 1n);
      const resPast = verifyTotpCode(secretBase32, codePast, null, nowSeconds);
      expect(resPast.valid).toBe(true);
      expect(resPast.matchedStep).toBe(currentStep - 1n);

      // Código en paso futuro (+1 drift)
      const codeFuture = computeTotpCode(secretBase32, currentStep + 1n);
      const resFuture = verifyTotpCode(secretBase32, codeFuture, null, nowSeconds);
      expect(resFuture.valid).toBe(true);
      expect(resFuture.matchedStep).toBe(currentStep + 1n);

      // Código fuera de ventana (drift +2)
      const codeTooFar = computeTotpCode(secretBase32, currentStep + 2n);
      const resTooFar = verifyTotpCode(secretBase32, codeTooFar, null, nowSeconds);
      expect(resTooFar.valid).toBe(false);
      expect(resTooFar.reason).toBe('INVALID_CODE');

      // Formato inválido
      expect(verifyTotpCode(secretBase32, 'abc123', null, nowSeconds).reason).toBe(
        'INVALID_FORMAT',
      );
      expect(verifyTotpCode(secretBase32, '12345', null, nowSeconds).reason).toBe('INVALID_FORMAT');
    });

    it('debe mitigar ataques de repetición (Anti-Replay) mediante last_used_step', () => {
      const { secretBase32 } = generateTotpSecret();
      const nowSeconds = 1700000000;
      const currentStep = BigInt(Math.floor(nowSeconds / 30));
      const codeCurrent = computeTotpCode(secretBase32, currentStep);

      // Si el paso actual ya fue utilizado previamente
      const resReplay = verifyTotpCode(secretBase32, codeCurrent, currentStep, nowSeconds);
      expect(resReplay.valid).toBe(false);
      expect(resReplay.reason).toBe('CODE_REPLAYED');

      // Si el paso actual es mayor que el último usado, es aceptado
      const resAccept = verifyTotpCode(secretBase32, codeCurrent, currentStep - 1n, nowSeconds);
      expect(resAccept.valid).toBe(true);
    });

    it('debe generar y verificar Backup Codes con hashing nativo y sal criptográfica', () => {
      const { plainCodes, hashedCodes } = generateBackupCodes(8);
      expect(plainCodes.length).toBe(8);
      expect(hashedCodes.length).toBe(8);

      for (let i = 0; i < 8; i++) {
        expect(plainCodes[i]).toMatch(
          /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{5}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{5}$/,
        );
        expect(verifyBackupCode(plainCodes[i], hashedCodes[i])).toBe(true);
        expect(verifyBackupCode('INVALID-CODE', hashedCodes[i])).toBe(false);
      }

      // Parámetros vacíos o malformados
      expect(verifyBackupCode('', hashedCodes[0])).toBe(false);
      expect(verifyBackupCode(plainCodes[0], '')).toBe(false);
      expect(verifyBackupCode(plainCodes[0], 'badhash')).toBe(false);
    });
  });

  describe('MFA Repository Layer (MariaDB Parametrizada)', () => {
    it('findMfaCredential debe retornar credencial o null', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          user_id: 10,
          type: 'totp',
          secret_encrypted: 'vault_enc',
          is_confirmed: 1,
          last_used_step: '123456',
        },
      ]);
      const cred = await findMfaCredential(10, 'totp');
      expect(cred?.user_id).toBe(10);
      expect(cred?.is_confirmed).toBe(1);

      vi.mocked(db.query).mockResolvedValueOnce([]);
      const notFound = await findMfaCredential(99, 'totp');
      expect(notFound).toBeNull();
    });

    it('upsertMfaCredential y confirmMfaCredential deben ejecutar queries parametrizadas', async () => {
      vi.mocked(db.query).mockResolvedValue({ affectedRows: 1 });
      await upsertMfaCredential(10, 'totp', 'encrypted_secret_123');
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO user_mfa_credentials'),
        [10, 'totp', 'encrypted_secret_123'],
      );

      await confirmMfaCredential(10, 'totp', 50000n);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE user_mfa_credentials'),
        ['50000', 10, 'totp'],
      );
      expect(db.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE users'), ['50000', 10]);
    });

    it('updateLastUsedStep debe actualizar el contador en ambas tablas', async () => {
      vi.mocked(db.query).mockResolvedValue({ affectedRows: 1 });
      await updateLastUsedStep(10, 'totp', 60000n);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE user_mfa_credentials'),
        ['60000', 10, 'totp'],
      );
      expect(db.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE users'), ['60000', 10]);
    });

    it('storeBackupCodes y consumeBackupCode deben gestionar códigos atómicamente', async () => {
      vi.mocked(db.query).mockResolvedValue({ affectedRows: 1 });
      const { plainCodes, hashedCodes } = generateBackupCodes(2);
      await storeBackupCodes(10, hashedCodes);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM user_mfa_backup_codes'),
        [10],
      );

      // Consumo exitoso
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 101, code_hash: hashedCodes[0] },
        { id: 102, code_hash: hashedCodes[1] },
      ]);
      const consumed = await consumeBackupCode(10, plainCodes[0]);
      expect(consumed).toBe(true);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE user_mfa_backup_codes SET used_at = NOW()'),
        [101],
      );

      // Consumo fallido
      vi.mocked(db.query).mockResolvedValueOnce([{ id: 102, code_hash: hashedCodes[1] }]);
      const fail = await consumeBackupCode(10, 'WRONG-CODE1');
      expect(fail).toBe(false);
    });

    it('gestión de desafíos: createChallenge, getChallenge, recordFailedChallengeAttempt, revokeChallenge', async () => {
      vi.mocked(db.query).mockResolvedValue({ affectedRows: 1 });
      const chId = 'test-challenge-uuid-1';
      await createChallenge(chId, 10);
      expect(db.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO mfa_challenges'), [
        chId,
        10,
      ]);

      // getChallenge
      vi.mocked(db.query).mockResolvedValueOnce([
        { challenge_id: chId, user_id: 10, attempts_used: 0, revoked: 0 },
      ]);
      const ch = await getChallenge(chId);
      expect(ch?.challenge_id).toBe(chId);

      // getChallenge no encontrado
      vi.mocked(db.query).mockResolvedValueOnce([]);
      expect(await getChallenge('not_found')).toBeNull();

      // recordFailedChallengeAttempt incrementa y auto-revoca en 5
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 });
      vi.mocked(db.query).mockResolvedValueOnce([
        { challenge_id: chId, user_id: 10, attempts_used: 5, revoked: 1 },
      ]);
      const attempts = await recordFailedChallengeAttempt(chId);
      expect(attempts).toBe(5);

      // revokeChallenge
      await revokeChallenge(chId);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE mfa_challenges SET revoked = 1'),
        [chId],
      );
    });

    it('resetMfaForUser debe limpiar todas las tablas de MFA y resetear users', async () => {
      vi.mocked(db.query).mockResolvedValue({ affectedRows: 1 });
      await resetMfaForUser(10);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM user_mfa_credentials'),
        [10],
      );
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM user_mfa_backup_codes'),
        [10],
      );
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE mfa_challenges SET revoked = 1'),
        [10],
      );
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users SET is_2fa_enabled = 0'),
        [10],
      );
    });
  });

  describe('MFA Service Orchestration', () => {
    it('evaluateLoginPolicy debe distinguir admin mandatorio, usuario con mfa y usuario estándar', async () => {
      // 1. Usuario con MFA confirmado -> mfa_required
      vi.mocked(db.query).mockResolvedValueOnce([{ id: 1, is_confirmed: 1, type: 'totp' }]);
      const resMfa = await evaluateLoginPolicy({
        id: 10,
        role: 'CLIENT',
        email: 'c@dreamtek.tech',
      });
      expect(resMfa.status).toBe('mfa_required');
      expect(resMfa.challengeId).toBeDefined();

      // 2. Administrador sin MFA -> mfa_setup_required
      vi.mocked(db.query).mockResolvedValueOnce([]);
      const resAdmin = await evaluateLoginPolicy({
        id: 2,
        role: 'ADMIN',
        email: 'admin@dreamtek.tech',
      });
      expect(resAdmin.status).toBe('mfa_setup_required');

      // 3. GrayMan Ω sin MFA -> mfa_setup_required
      vi.mocked(db.query).mockResolvedValueOnce([]);
      const resOwner = await evaluateLoginPolicy({
        id: 1,
        role: 'OWNER',
        email: 'grayman@dreamtek.tech',
      });
      expect(resOwner.status).toBe('mfa_setup_required');

      // 4. Cliente sin MFA -> session_ready
      vi.mocked(db.query).mockResolvedValueOnce([]);
      const resClient = await evaluateLoginPolicy({
        id: 20,
        role: 'CLIENT',
        email: 'client@normal.com',
      });
      expect(resClient.status).toBe('session_ready');
    });

    it('verifyMfaChallengeAttempt debe validar desafío efímero y rechazar desafíos inválidos/revocados', async () => {
      // Desafío inexistente o revocado
      vi.mocked(db.query).mockResolvedValueOnce([]);
      const r1 = await verifyMfaChallengeAttempt('bad_ch', 10, '123456');
      expect(r1.success).toBe(false);
      expect(r1.error).toContain('inválido, revocado o número de intentos excedido');

      // Desafío de otro usuario
      vi.mocked(db.query).mockResolvedValueOnce([
        { challenge_id: 'ch1', user_id: 99, attempts_used: 0, revoked: 0 },
      ]);
      const r2 = await verifyMfaChallengeAttempt('ch1', 10, '123456');
      expect(r2.success).toBe(false);
      expect(r2.error).toContain('no corresponde al usuario');

      // Método RECOVERY: éxito y fallo
      vi.mocked(db.query).mockResolvedValueOnce([
        { challenge_id: 'ch1', user_id: 10, attempts_used: 0, revoked: 0 },
      ]);
      const { plainCodes, hashedCodes } = generateBackupCodes(1);
      vi.mocked(db.query).mockResolvedValueOnce([{ id: 1, code_hash: hashedCodes[0] }]);
      const rRecov = await verifyMfaChallengeAttempt('ch1', 10, plainCodes[0], 'RECOVERY');
      expect(rRecov.success).toBe(true);

      // Método RECOVERY fallido
      vi.mocked(db.query).mockResolvedValueOnce([
        { challenge_id: 'ch1', user_id: 10, attempts_used: 0, revoked: 0 },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([]); // no match
      const rRecovFail = await verifyMfaChallengeAttempt('ch1', 10, 'BAD-CODE-01', 'RECOVERY');
      expect(rRecovFail.success).toBe(false);
    });

    it('startMfaSetup, confirmMfaSetup y disableMfaSecurity deben ejecutar el flujo completo de ciclo de vida', async () => {
      // startMfaSetup
      vi.mocked(db.query).mockResolvedValue({ affectedRows: 1 });
      const setupData = await startMfaSetup(10, 'user@dreamtek.tech');
      expect(setupData.secretBase32).toBeDefined();
      expect(setupData.otpauthUri).toContain('otpauth://totp/');

      // confirmMfaSetup sin inicio
      vi.mocked(db.query).mockResolvedValueOnce([]);
      const noStart = await confirmMfaSetup(10, '123456');
      expect(noStart.success).toBe(false);
      expect(noStart.error).toContain('No se ha iniciado la configuración');

      // confirmMfaSetup con código correcto
      const { secretBase32 } = generateTotpSecret();
      const code = computeTotpCode(secretBase32, Math.floor(Date.now() / 1000 / 30));
      // Cifrar secreto para mock de BD
      const { encryptTotpSecret } = await import('../../../server/src/utils/totp');
      const enc = encryptTotpSecret(secretBase32);

      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 1, secret_encrypted: enc, is_confirmed: 0 },
      ]);
      const confirmed = await confirmMfaSetup(10, code);
      expect(confirmed.success).toBe(true);
      expect(confirmed.backupCodes?.length).toBe(8);

      // disableMfaSecurity con contraseña incorrecta
      const pwHash = await bcrypt.hash('CorrectPassword123!', 10);
      vi.mocked(db.query).mockResolvedValueOnce([{ password_hash: pwHash }]);
      const badPw = await disableMfaSecurity(10, 'WrongPassword', '123456');
      expect(badPw.success).toBe(false);
      expect(badPw.error).toContain('Contraseña actual incorrecta');

      // disableMfaSecurity exitoso con TOTP
      vi.mocked(db.query).mockResolvedValueOnce([{ password_hash: pwHash }]);
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 1, secret_encrypted: enc, is_confirmed: 1, last_used_step: null },
      ]);
      const validDisable = await disableMfaSecurity(10, 'CorrectPassword123!', code);
      expect(validDisable.success).toBe(true);
    });
  });

  describe('Integration: Two-Step Login Challenge and HttpOnly Cookies', () => {
    it('POST /login debe exigir configuración mandatoria de MFA para administradores', async () => {
      const pwHash = await bcrypt.hash('AdminSecret123!', 10);
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 5,
          email: 'admin@dreamtek.tech',
          password_hash: pwHash,
          role: 'ADMIN',
          is_email_verified: 1,
          is_2fa_enabled: 0,
        },
      ]);
      // evaluateLoginPolicy lookup
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .post('/api/v1/auth/login')
        .send({ email: 'admin@dreamtek.tech', password: 'AdminSecret123!' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('mfa_setup_required');
      expect(res.body.mfa_setup_required).toBe(true);

      // Comprobar cookie HttpOnly dreamtek_setup_ticket
      const cookies = res.headers['set-cookie'] as unknown as string[];
      expect(cookies).toBeDefined();
      const setupCookie = cookies.find((c) => c.includes(SETUP_COOKIE_NAME));
      expect(setupCookie).toBeDefined();
      expect(setupCookie).toContain('HttpOnly');
    });

    it('POST /login debe exigir segundo factor con desafío efímero para cuentas con MFA confirmado', async () => {
      const pwHash = await bcrypt.hash('ClientSecret123!', 10);
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 15,
          email: 'client@dreamtek.tech',
          password_hash: pwHash,
          role: 'CLIENT',
          is_email_verified: 1,
          is_2fa_enabled: 1,
        },
      ]);
      // evaluateLoginPolicy lookup
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 1, user_id: 15, type: 'totp', is_confirmed: 1 },
      ]);
      // createChallenge insert
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 });

      const res = await supertest(app)
        .post('/api/v1/auth/login')
        .send({ email: 'client@dreamtek.tech', password: 'ClientSecret123!' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('2fa_required');
      expect(res.body.mfa_required).toBe(true);

      const cookies = res.headers['set-cookie'] as unknown as string[];
      expect(cookies).toBeDefined();
      const mfaCookie = cookies.find((c) => c.includes(MFA_COOKIE_NAME));
      expect(mfaCookie).toBeDefined();
      expect(mfaCookie).toContain('HttpOnly');
    });

    it('POST /2fa/verify debe verificar desafío efímero y entregar cookie de sesión', async () => {
      const { secretBase32 } = generateTotpSecret();
      const { encryptTotpSecret } = await import('../../../server/src/utils/totp');
      const enc = encryptTotpSecret(secretBase32);
      const code = computeTotpCode(secretBase32, Math.floor(Date.now() / 1000 / 30));

      const challengeId = 'ch-test-verify-123';
      const mfaTicket = jwt.sign(
        {
          userId: 15,
          email: 'client@dreamtek.tech',
          type: 'MFA_TICKET',
          stage: 'MFA_PENDING',
          challengeId,
        },
        TEST_SECRET,
        { algorithm: 'HS512', expiresIn: '5m' },
      );

      // getChallenge
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 15,
          email: 'client@dreamtek.tech',
          role: 'CLIENT',
          full_name: 'Client MFA',
          is_2fa_enabled: 1,
        },
      ]);
      // verifyMfaChallengeAttempt: getChallenge
      vi.mocked(db.query).mockResolvedValueOnce([
        { challenge_id: challengeId, user_id: 15, attempts_used: 0, revoked: 0 },
      ]);
      // findMfaCredential
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          user_id: 15,
          type: 'totp',
          secret_encrypted: enc,
          is_confirmed: 1,
          last_used_step: null,
        },
      ]);
      // updateLastUsedStep
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 });
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 });
      // revokeChallenge
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 });

      const res = await supertest(app)
        .post('/api/v1/auth/2fa/verify')
        .set('Cookie', `${MFA_COOKIE_NAME}=${mfaTicket}`)
        .send({ code, method: 'TOTP' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');

      // Debe entregar cookie de sesión
      const cookies = res.headers['set-cookie'] as unknown as string[];
      expect(cookies.some((c) => c.includes(COOKIE_NAME))).toBe(true);
    });

    it('POST /mfa/reset debe permitir el reseteo exclusivo para GrayMan (Ω) o ADMIN', async () => {
      // 1. Sin sesión -> 401
      const resUnauth = await supertest(app)
        .post('/api/v1/auth/mfa/reset')
        .send({ targetUserId: 15 });
      expect(resUnauth.status).toBe(401);

      // 2. Con rol CLIENT -> 403
      const clientToken = jwt.sign(
        { userId: 20, role: 'CLIENT', email: 'client@normal.com' },
        TEST_SECRET,
        { algorithm: 'HS512', expiresIn: '1h' },
      );
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 20, role: 'CLIENT', email: 'client@normal.com' },
      ]);
      const resForbidden = await supertest(app)
        .post('/api/v1/auth/mfa/reset')
        .set('Cookie', `${COOKIE_NAME}=${clientToken}`)
        .send({ targetUserId: 15 });
      expect(resForbidden.status).toBe(403);

      // 3. Con ADMIN sin targetUserId -> 400
      const adminToken = jwt.sign(
        { userId: 1, role: 'ADMIN', email: 'admin@dreamtek.tech' },
        TEST_SECRET,
        { algorithm: 'HS512', expiresIn: '1h' },
      );
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 1, role: 'ADMIN', email: 'admin@dreamtek.tech' },
      ]);
      const resMissingParam = await supertest(app)
        .post('/api/v1/auth/mfa/reset')
        .set('Cookie', `${COOKIE_NAME}=${adminToken}`)
        .send({});
      expect(resMissingParam.status).toBe(400);

      // 4. Con GrayMan Ω exitoso -> 200
      const ownerToken = jwt.sign(
        { userId: 1, role: 'OWNER', email: 'grayman@dreamtek.tech' },
        TEST_SECRET,
        { algorithm: 'HS512', expiresIn: '1h' },
      );
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 1, role: 'OWNER', email: 'grayman@dreamtek.tech' },
      ]);
      vi.mocked(db.query).mockResolvedValue({ affectedRows: 1 });

      const resSuccess = await supertest(app)
        .post('/api/v1/auth/mfa/reset')
        .set('Cookie', `${COOKIE_NAME}=${ownerToken}`)
        .send({ targetUserId: 15 });
      expect(resSuccess.status).toBe(200);
      expect(resSuccess.body.status).toBe('success');
      expect(resSuccess.body.message).toContain('reseteado exitosamente');

      // 5. Con error de base de datos -> 500
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 1, role: 'OWNER', email: 'grayman@dreamtek.tech' },
      ]);
      vi.mocked(db.query).mockRejectedValueOnce(new Error('DB Reset Error'));
      const resResetErr = await supertest(app)
        .post('/api/v1/auth/mfa/reset')
        .set('Cookie', `${COOKIE_NAME}=${ownerToken}`)
        .send({ targetUserId: 15 });
      expect(resResetErr.status).toBe(500);
      expect(resResetErr.body.message).toContain('Error interno al resetear MFA');
    });

    it('POST /logout debe limpiar todas las cookies de autenticación incluyendo dreamtek_setup_ticket', async () => {
      const res = await supertest(app).post('/api/v1/auth/logout');
      expect(res.status).toBe(200);
      const cookies = res.headers['set-cookie'] as unknown as string[];
      expect(cookies.some((c) => c.includes(COOKIE_NAME))).toBe(true);
      expect(cookies.some((c) => c.includes(MFA_COOKIE_NAME))).toBe(true);
      expect(cookies.some((c) => c.includes(SETUP_COOKIE_NAME))).toBe(true);
    });
  });

  describe('FC 052 Extended Edge Cases & Invariants Coverage', () => {
    it('totp.service: debe manejar buffers no múltiplos de 5 en Base32, entradas vacías y drift', () => {
      // Buffer con longitud no múltiplo de 5 (activa bits > 0 en encodeBase32)
      const b3 = Buffer.from([0x01, 0x02, 0x03]);
      const enc = encodeBase32(b3);
      expect(enc.length).toBeGreaterThan(0);
      expect(decodeBase32(enc)).toEqual(b3);

      // decodeBase32 con falsy/vacío
      expect(decodeBase32('').length).toBe(0);
      expect(decodeBase32(null as any).length).toBe(0);

      // hashBackupCode con falsy/vacío
      expect(hashBackupCode('')).toBeDefined();
      expect(hashBackupCode(null as any)).toBeDefined();

      // verifyBackupCode con parámetros faltantes
      expect(verifyBackupCode('', 'hash')).toBe(false);
      expect(verifyBackupCode('code', '')).toBe(false);

      // verifyTotpCode con código vacío o nulo
      const { secretBase32 } = generateTotpSecret();
      expect(verifyTotpCode(secretBase32, '').valid).toBe(false);
      expect(verifyTotpCode(secretBase32, null as any).valid).toBe(false);

      // verifyTotpCode con drift -1 y +1
      const step = 1000000n;
      const nowSec = Number(step * 30n);
      const codeMinus1 = computeTotpCode(secretBase32, step - 1n);
      const codePlus1 = computeTotpCode(secretBase32, step + 1n);
      expect(verifyTotpCode(secretBase32, codeMinus1, null, nowSec).valid).toBe(true);
      expect(verifyTotpCode(secretBase32, codePlus1, null, nowSec).valid).toBe(true);

      // verifyTotpCode replayed code
      const currentCode = computeTotpCode(secretBase32, step);
      const replayed = verifyTotpCode(secretBase32, currentCode, step, nowSec);
      expect(replayed.valid).toBe(false);
      expect(replayed.reason).toBe('CODE_REPLAYED');
    });

    it('mfa.service: casos borde de desafío, setup y disable', async () => {
      // 1. verifyMfaChallengeAttempt: sin secreto configurado
      vi.mocked(db.query).mockResolvedValueOnce([
        { challenge_id: 'ch-test', user_id: 10, attempts_used: 0, revoked: 0 },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([
        { user_id: 10, type: 'totp', secret_encrypted: null },
      ]);
      const noSecRes = await verifyMfaChallengeAttempt('ch-test', 10, '123456');
      expect(noSecRes.success).toBe(false);
      expect(noSecRes.error).toContain('Método TOTP no configurado');

      // 2. verifyMfaChallengeAttempt: código reusado (CODE_REPLAYED)
      const { secretBase32 } = generateTotpSecret();
      const { encryptTotpSecret } = await import('../../../server/src/utils/totp');
      const enc = encryptTotpSecret(secretBase32);
      const currentStep = BigInt(Math.floor(Date.now() / 1000 / 30));
      const code = computeTotpCode(secretBase32, currentStep);

      vi.mocked(db.query).mockResolvedValueOnce([
        { challenge_id: 'ch-test', user_id: 10, attempts_used: 0, revoked: 0 },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([
        { user_id: 10, type: 'totp', secret_encrypted: enc, last_used_step: currentStep },
      ]);
      vi.mocked(db.query).mockResolvedValue({ affectedRows: 1 }); // for recordFailedChallengeAttempt
      const replayRes = await verifyMfaChallengeAttempt('ch-test', 10, code);
      expect(replayRes.success).toBe(false);
      expect(replayRes.error).toContain('Código ya utilizado');

      // 3. verifyMfaChallengeAttempt: código inválido general
      vi.mocked(db.query).mockResolvedValueOnce([
        { challenge_id: 'ch-test', user_id: 10, attempts_used: 0, revoked: 0 },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([
        { user_id: 10, type: 'totp', secret_encrypted: enc, last_used_step: null },
      ]);
      const invalidRes = await verifyMfaChallengeAttempt('ch-test', 10, '000000');
      expect(invalidRes.success).toBe(false);
      expect(invalidRes.error).toContain('Código de autenticación inválido o expirado');

      // 4. confirmMfaSetup: código de verificación incorrecto
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 1, secret_encrypted: enc, is_confirmed: 0 },
      ]);
      const badSetup = await confirmMfaSetup(10, '000000');
      expect(badSetup.success).toBe(false);
      expect(badSetup.error).toContain('Código de verificación inicial incorrecto');

      // 5. disableMfaSecurity: usuario sin credencial confirmada
      const pwHash = await bcrypt.hash('CorrectPass!', 10);
      vi.mocked(db.query).mockResolvedValueOnce([{ password_hash: pwHash }]);
      vi.mocked(db.query).mockResolvedValueOnce([]); // no credential
      const noCred = await disableMfaSecurity(10, 'CorrectPass!', '123456');
      expect(noCred.success).toBe(false);
      expect(noCred.error).toContain('MFA no se encuentra habilitado');

      // 6. disableMfaSecurity: TOTP falla pero backup code es válido
      const { plainCodes, hashedCodes } = generateBackupCodes(1);
      vi.mocked(db.query).mockResolvedValueOnce([{ password_hash: pwHash }]);
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 1, secret_encrypted: enc, is_confirmed: 1, last_used_step: null },
      ]);
      // consumeBackupCode mock
      vi.mocked(db.query).mockResolvedValueOnce([{ id: 99, code_hash: hashedCodes[0] }]); // SELECT from backup codes
      vi.mocked(db.query).mockResolvedValue({ affectedRows: 1 }); // UPDATE and reset queries
      const backupDisable = await disableMfaSecurity(10, 'CorrectPass!', plainCodes[0]);
      expect(backupDisable.success).toBe(true);

      // 7. disableMfaSecurity: TOTP falla Y backup code falla
      vi.mocked(db.query).mockResolvedValueOnce([{ password_hash: pwHash }]);
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 1, secret_encrypted: enc, is_confirmed: 1, last_used_step: null },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([]); // consumeBackupCode fails
      const allFailDisable = await disableMfaSecurity(10, 'CorrectPass!', '999999');
      expect(allFailDisable.success).toBe(false);
      expect(allFailDisable.error).toContain('Código de confirmación inválido');
    });

    it('auth.ts: getAuthenticatedOrSetupUser casos borde y ciclo de vida de setup ticket', async () => {
      // 1. Ticket con type incorrecto
      const badTypeToken = jwt.sign(
        { userId: 10, type: 'OTHER_TICKET', stage: 'SETUP_PENDING' },
        TEST_SECRET,
        { algorithm: 'HS512', expiresIn: '15m' },
      );
      const resBadType = await supertest(app)
        .post('/api/v1/auth/mfa/setup')
        .set('Cookie', `${SETUP_COOKIE_NAME}=${badTypeToken}`);
      expect(resBadType.status).toBe(401);

      // 2. Ticket con stage incorrecto
      const badStageToken = jwt.sign(
        { userId: 10, type: 'SETUP_TICKET', stage: 'OTHER' },
        TEST_SECRET,
        { algorithm: 'HS512', expiresIn: '15m' },
      );
      const resBadStage = await supertest(app)
        .post('/api/v1/auth/mfa/setup')
        .set('Cookie', `${SETUP_COOKIE_NAME}=${badStageToken}`);
      expect(resBadStage.status).toBe(401);

      // 3. Ticket válido pero usuario no encontrado en BD
      const validTicket = jwt.sign(
        { userId: 999, type: 'SETUP_TICKET', stage: 'SETUP_PENDING' },
        TEST_SECRET,
        { algorithm: 'HS512', expiresIn: '15m' },
      );
      vi.mocked(db.query).mockResolvedValueOnce([]);
      const resNoUser = await supertest(app)
        .post('/api/v1/auth/mfa/setup')
        .set('Cookie', `${SETUP_COOKIE_NAME}=${validTicket}`);
      expect(resNoUser.status).toBe(401);

      // 4. Ticket con jwt malformado
      const resMalformed = await supertest(app)
        .post('/api/v1/auth/mfa/setup')
        .set('Cookie', `${SETUP_COOKIE_NAME}=not-a-valid-jwt`);
      expect(resMalformed.status).toBe(401);

      // 5. Completar setup como Admin vía SETUP_COOKIE_NAME: debe limpiar setup ticket y emitir sesión
      const adminSetupTicket = jwt.sign(
        { userId: 2, role: 'ADMIN', type: 'SETUP_TICKET', stage: 'SETUP_PENDING' },
        TEST_SECRET,
        { algorithm: 'HS512', expiresIn: '15m' },
      );
      const { secretBase32 } = generateTotpSecret();
      const code = computeTotpCode(secretBase32, Math.floor(Date.now() / 1000 / 30));
      const { encryptTotpSecret } = await import('../../../server/src/utils/totp');
      const enc = encryptTotpSecret(secretBase32);

      // Mock DB: getAuthenticatedOrSetupUser lookup
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 2,
          email: 'admin@dreamtek.tech',
          role: 'ADMIN',
          full_name: 'Admin User',
          password_hash: 'hash',
        },
      ]);
      // Mock confirmMfaSetup -> findMfaCredential
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 1, secret_encrypted: enc, is_confirmed: 0 },
      ]);
      vi.mocked(db.query).mockResolvedValue({ affectedRows: 1 });

      const resConfirmSetup = await supertest(app)
        .post('/api/v1/auth/mfa/confirm')
        .set('Cookie', `${SETUP_COOKIE_NAME}=${adminSetupTicket}`)
        .send({ code });

      expect(resConfirmSetup.status).toBe(200);
      expect(resConfirmSetup.body.status).toBe('success');
      const cookies = resConfirmSetup.headers['set-cookie'] as unknown as string[];
      expect(cookies.some((c) => c.includes(COOKIE_NAME))).toBe(true);
      expect(cookies.some((c) => c.includes(`${SETUP_COOKIE_NAME}=;`))).toBe(true);

      // 6. Confirmación con código inválido y sin secretBase32 -> 400
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 2,
          email: 'admin@dreamtek.tech',
          role: 'ADMIN',
          full_name: 'Admin User',
          password_hash: 'hash',
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([]); // no credential found
      const resBadConfirm = await supertest(app)
        .post('/api/v1/auth/mfa/confirm')
        .set('Cookie', `${SETUP_COOKIE_NAME}=${adminSetupTicket}`)
        .send({ code: '000000' });
      expect(resBadConfirm.status).toBe(400);
      expect(resBadConfirm.body.status).toBe('error');
    });

    it('auth.ts: 2fa/verify error de desafío, 2fa/status y 2fa/disable fallback a códigos de recuperación', async () => {
      // 1. /api/v1/auth/2fa/verify con desafío que falla
      const mfaChallengeToken = jwt.sign(
        {
          userId: 10,
          email: 'user@dreamtek.tech',
          challengeId: 'ch-fail',
          type: 'MFA_TICKET',
          stage: 'MFA_PENDING',
        },
        TEST_SECRET,
        { algorithm: 'HS512', expiresIn: '5m' },
      );
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 10,
          email: 'user@dreamtek.tech',
          role: 'CLIENT',
          full_name: 'User',
          is_2fa_enabled: 1,
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([]); // getChallenge fails
      const resVerifyFail = await supertest(app)
        .post('/api/v1/auth/2fa/verify')
        .set('Cookie', `${MFA_COOKIE_NAME}=${mfaChallengeToken}`)
        .send({ code: '000000', method: 'TOTP' });
      expect(resVerifyFail.status).toBe(400);
      expect(resVerifyFail.body.status).toBe('error');

      // 2. /api/v1/auth/mfa/status con usuario autenticado
      const sessionToken = jwt.sign(
        { userId: 10, role: 'CLIENT', email: 'user@dreamtek.tech' },
        TEST_SECRET,
        { algorithm: 'HS512', expiresIn: '1h' },
      );
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 10,
          role: 'CLIENT',
          email: 'user@dreamtek.tech',
          is_2fa_enabled: 1,
          mfa_enrolled_at: new Date(),
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([{ remaining: 7 }]); // recovery codes count
      const resStatus = await supertest(app)
        .get('/api/v1/auth/mfa/status')
        .set('Cookie', `${COOKIE_NAME}=${sessionToken}`);
      expect(resStatus.status).toBe(200);
      expect(resStatus.body.status).toBe('success');
      expect(resStatus.body.is_2fa_enabled).toBe(true);
      expect(resStatus.body.remaining_recovery_codes).toBe(7);

      // 3. /api/v1/auth/mfa/disable con contraseña correcta y código de recuperación
      const pwHash = await bcrypt.hash('Secret123!', 10);
      const { hashRecoveryCode } = await import('../../../server/src/utils/totp');
      const recHash = hashRecoveryCode('REC-CODE-01');

      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 10,
          role: 'CLIENT',
          email: 'user@dreamtek.tech',
          password_hash: pwHash,
          totp_secret_encrypted: null,
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([{ id: 1, code_hash: recHash }]);
      vi.mocked(db.query).mockResolvedValue({ affectedRows: 1 });

      const resDisableRecovery = await supertest(app)
        .post('/api/v1/auth/mfa/disable')
        .set('Cookie', `${COOKIE_NAME}=${sessionToken}`)
        .send({ password: 'Secret123!', code: 'REC-CODE-01' });
      expect(resDisableRecovery.status).toBe(200);
      expect(resDisableRecovery.body.message).toContain('desactivada exitosamente');

      // 4. /api/v1/auth/mfa/disable con código inválido (TOTP y recuperación fallan)
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 10,
          role: 'CLIENT',
          email: 'user@dreamtek.tech',
          password_hash: pwHash,
          totp_secret_encrypted: null,
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([]); // no recovery codes
      const resDisableFail = await supertest(app)
        .post('/api/v1/auth/mfa/disable')
        .set('Cookie', `${COOKIE_NAME}=${sessionToken}`)
        .send({ password: 'Secret123!', code: 'WRONG-CODE' });
      expect(resDisableFail.status).toBe(400);
      expect(resDisableFail.body.message).toContain('incorrecto');
    });
  });
});
