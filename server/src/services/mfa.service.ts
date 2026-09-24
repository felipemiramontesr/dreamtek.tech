/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
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
} from '../repositories/mfa.repository.js';
import {
  generateTotpSecret,
  verifyTotpCode,
  generateBackupCodes,
} from './totp.service.js';
import { encryptTotpSecret, decryptTotpSecret } from '../utils/totp.js';

export interface LoginMfaDecision {
  status: 'session_ready' | 'mfa_required' | 'mfa_setup_required';
  challengeId?: string;
  reason?: string;
}

/**
 * Evaluates user login state against mandatory role policy and MFA enrollment.
 * ADMIN / Ω without confirmed MFA -> mfa_setup_required
 * Any user with confirmed MFA -> mfa_required (atomic challenge in DB)
 * Other users -> session_ready
 */
export async function evaluateLoginPolicy(user: any): Promise<LoginMfaDecision> {
  const role = String(user.role || '').toUpperCase();
  const isOwner = user.email === 'grayman@dreamtek.tech';
  const isMandatoryRole = role === 'ADMIN' || isOwner;

  const credential = await findMfaCredential(user.id, 'totp');
  const isConfirmed =
    credential?.is_confirmed === 1 || user.is_2fa_enabled === 1 || user.is_2fa_enabled === true;

  if (isConfirmed) {
    const challengeId = crypto.randomUUID();
    await createChallenge(challengeId, user.id);
    return {
      status: 'mfa_required',
      challengeId,
    };
  }

  if (isMandatoryRole) {
    return {
      status: 'mfa_setup_required',
      reason: 'MFA configuration is mandatory for administrative accounts.',
    };
  }

  return { status: 'session_ready' };
}

/**
 * Verifies a candidate code against the atomic ephemeral challenge.
 * Enforces:
 * 1. Challenge must exist, not be revoked, and attempts < 5.
 * 2. Method verification: TOTP (respecting anti-replay) or Backup Code.
 * 3. Atomic attempt count / revocation.
 */
export async function verifyMfaChallengeAttempt(
  challengeId: string,
  userId: number | string,
  code: string,
  method = 'TOTP',
): Promise<{ success: boolean; error?: string }> {
  const challenge = await getChallenge(challengeId);
  if (!challenge || challenge.revoked === 1 || challenge.attempts_used >= 5) {
    return {
      success: false,
      error: 'Desafío MFA inválido, revocado o número de intentos excedido.',
    };
  }

  if (Number(challenge.user_id) !== Number(userId)) {
    return { success: false, error: 'Desafío no corresponde al usuario.' };
  }

  if (method === 'RECOVERY') {
    const consumed = await consumeBackupCode(userId, code);
    if (!consumed) {
      await recordFailedChallengeAttempt(challengeId);
      return { success: false, error: 'Código de recuperación inválido o ya utilizado.' };
    }

    await revokeChallenge(challengeId);
    return { success: true };
  }

  // TOTP verification
  const credential = await findMfaCredential(userId, 'totp');
  const secretEncrypted = credential?.secret_encrypted;

  if (!secretEncrypted) {
    return { success: false, error: 'Método TOTP no configurado en este usuario.' };
  }

  const plainSecret = decryptTotpSecret(secretEncrypted);
  const verifyResult = verifyTotpCode(plainSecret, code, credential.last_used_step);

  if (!verifyResult.valid) {
    await recordFailedChallengeAttempt(challengeId);
    if (verifyResult.reason === 'CODE_REPLAYED') {
      return {
        success: false,
        error: 'Código ya utilizado. Espere al siguiente ciclo en su aplicación autenticadora.',
      };
    }
    return { success: false, error: 'Código de autenticación inválido o expirado.' };
  }

  // Atomically update last_used_step and revoke challenge
  await updateLastUsedStep(userId, 'totp', verifyResult.matchedStep!);
  await revokeChallenge(challengeId);

  return { success: true };
}

/**
 * Initializes MFA setup: generates fresh secret, stores unconfirmed credential.
 */
export async function startMfaSetup(
  userId: number | string,
  email: string,
): Promise<{ secretBase32: string; otpauthUri: string }> {
  const { secretBase32, otpauthUri } = generateTotpSecret(email);
  const encryptedSecret = encryptTotpSecret(secretBase32);

  await upsertMfaCredential(userId, 'totp', encryptedSecret);

  // Sync users table
  await query('UPDATE users SET totp_secret_encrypted = ? WHERE id = ?', [
    encryptedSecret,
    userId,
  ]);

  return { secretBase32, otpauthUri };
}

/**
 * Confirms setup with first proof code and generates 8 backup codes.
 */
export async function confirmMfaSetup(
  userId: number | string,
  candidateCode: string,
): Promise<{ success: boolean; backupCodes?: string[]; error?: string }> {
  const credential = await findMfaCredential(userId, 'totp');
  if (!credential || !credential.secret_encrypted) {
    return { success: false, error: 'No se ha iniciado la configuración de MFA.' };
  }

  const secretBase32 = decryptTotpSecret(credential.secret_encrypted);
  const verifyResult = verifyTotpCode(secretBase32, candidateCode);

  if (!verifyResult.valid || verifyResult.matchedStep === null) {
    return { success: false, error: 'Código de verificación inicial incorrecto.' };
  }

  await confirmMfaCredential(userId, 'totp', verifyResult.matchedStep);

  const { plainCodes, hashedCodes } = generateBackupCodes(8);
  await storeBackupCodes(userId, hashedCodes);

  return { success: true, backupCodes: plainCodes };
}

/**
 * Disables MFA requiring current password and proof code.
 */
export async function disableMfaSecurity(
  userId: number | string,
  passwordAttempt: string,
  code: string,
): Promise<{ success: boolean; error?: string }> {
  const users = await query<any[]>('SELECT password_hash FROM users WHERE id = ? LIMIT 1', [
    userId,
  ]);
  const user = users[0];
  if (!user || !(await bcrypt.compare(passwordAttempt, user.password_hash))) {
    return { success: false, error: 'Contraseña actual incorrecta.' };
  }

  const credential = await findMfaCredential(userId, 'totp');
  if (!credential || credential.is_confirmed !== 1) {
    return { success: false, error: 'MFA no se encuentra habilitado.' };
  }

  const secretBase32 = decryptTotpSecret(credential.secret_encrypted);
  const verifyResult = verifyTotpCode(secretBase32, code, credential.last_used_step);

  let isVerified = verifyResult.valid;
  if (!isVerified) {
    isVerified = await consumeBackupCode(userId, code);
  }

  if (!isVerified) {
    return { success: false, error: 'Código de confirmación inválido.' };
  }

  await resetMfaForUser(userId);
  return { success: true };
}
