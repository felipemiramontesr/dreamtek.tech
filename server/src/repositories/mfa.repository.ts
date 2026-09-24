/* eslint-disable @typescript-eslint/no-explicit-any */
import { query } from '../db.js';
import { verifyBackupCode } from '../services/totp.service.js';

export interface MfaCredentialRow {
  id: number;
  user_id: number;
  type: 'totp' | 'webauthn';
  secret_encrypted: string;
  is_confirmed: number;
  last_used_step: string | number | null;
  created_at: string;
  updated_at: string;
}

export interface MfaChallengeRow {
  challenge_id: string;
  user_id: number;
  attempts_used: number;
  revoked: number;
  created_at: string;
}

/**
 * Finds MFA credential for a given user and type.
 */
export async function findMfaCredential(
  userId: number | string,
  type = 'totp',
): Promise<MfaCredentialRow | null> {
  const rows = await query<any[]>(
    'SELECT id, user_id, type, secret_encrypted, is_confirmed, last_used_step, created_at, updated_at FROM user_mfa_credentials WHERE user_id = ? AND type = ? LIMIT 1',
    [userId, type],
  );
  if (!rows || rows.length === 0) return null;
  return rows[0] as MfaCredentialRow;
}

/**
 * Upserts unconfirmed MFA credential (ensures no orphaned rows on repeated setup).
 */
export async function upsertMfaCredential(
  userId: number | string,
  type: 'totp' | 'webauthn',
  secretEncrypted: string,
): Promise<void> {
  await query(
    `INSERT INTO user_mfa_credentials (user_id, type, secret_encrypted, is_confirmed, last_used_step)
     VALUES (?, ?, ?, 0, NULL)
     ON DUPLICATE KEY UPDATE
       secret_encrypted = VALUES(secret_encrypted),
       is_confirmed = 0,
       last_used_step = NULL,
       updated_at = NOW()`,
    [userId, type, secretEncrypted],
  );
}

/**
 * Confirms MFA credential upon proving first valid code.
 */
export async function confirmMfaCredential(
  userId: number | string,
  type: 'totp' | 'webauthn',
  step: bigint | number,
): Promise<void> {
  await query(
    `UPDATE user_mfa_credentials
     SET is_confirmed = 1,
         last_used_step = ?,
         updated_at = NOW()
     WHERE user_id = ? AND type = ?`,
    [step.toString(), userId, type],
  );

  // Sync users table for legacy compatibility
  await query(
    `UPDATE users
     SET is_2fa_enabled = 1,
         last_totp_timestep = ?,
         mfa_enrolled_at = NOW()
     WHERE id = ?`,
    [step.toString(), userId],
  );
}

/**
 * Updates last_used_step atomically for anti-replay prevention.
 */
export async function updateLastUsedStep(
  userId: number | string,
  type: 'totp' | 'webauthn',
  step: bigint | number,
): Promise<void> {
  await query(
    'UPDATE user_mfa_credentials SET last_used_step = ?, updated_at = NOW() WHERE user_id = ? AND type = ?',
    [step.toString(), userId, type],
  );

  // Sync users table
  await query('UPDATE users SET last_totp_timestep = ? WHERE id = ?', [step.toString(), userId]);
}

/**
 * Stores hashed backup codes for a user.
 */
export async function storeBackupCodes(
  userId: number | string,
  hashedCodes: string[],
): Promise<void> {
  // Invalidate any prior backup codes
  await query('DELETE FROM user_mfa_backup_codes WHERE user_id = ?', [userId]);

  for (const hash of hashedCodes) {
    await query(
      'INSERT INTO user_mfa_backup_codes (user_id, code_hash, used_at) VALUES (?, ?, NULL)',
      [userId, hash],
    );
  }
}

/**
 * Checks and consumes a candidate backup code atomically.
 */
export async function consumeBackupCode(
  userId: number | string,
  plainCode: string,
): Promise<boolean> {
  const codes = await query<any[]>(
    'SELECT id, code_hash FROM user_mfa_backup_codes WHERE user_id = ? AND used_at IS NULL',
    [userId],
  );

  let matchedId: number | null = null;
  for (const item of codes) {
    if (verifyBackupCode(plainCode, item.code_hash)) {
      matchedId = item.id;
      break;
    }
  }

  if (!matchedId) return false;

  await query('UPDATE user_mfa_backup_codes SET used_at = NOW() WHERE id = ? AND used_at IS NULL', [
    matchedId,
  ]);
  return true;
}

/**
 * Creates atomic ephemeral challenge record in DB.
 */
export async function createChallenge(
  challengeId: string,
  userId: number | string,
): Promise<void> {
  await query(
    'INSERT INTO mfa_challenges (challenge_id, user_id, attempts_used, revoked) VALUES (?, ?, 0, 0)',
    [challengeId, userId],
  );
}

/**
 * Fetches an active challenge by ID.
 */
export async function getChallenge(challengeId: string): Promise<MfaChallengeRow | null> {
  const rows = await query<any[]>(
    'SELECT challenge_id, user_id, attempts_used, revoked, created_at FROM mfa_challenges WHERE challenge_id = ? LIMIT 1',
    [challengeId],
  );
  if (!rows || rows.length === 0) return null;
  return rows[0] as MfaChallengeRow;
}

/**
 * Increments failed attempt count and revokes challenge if >= 5 attempts.
 */
export async function recordFailedChallengeAttempt(challengeId: string): Promise<number> {
  await query(
    'UPDATE mfa_challenges SET attempts_used = attempts_used + 1, revoked = IF(attempts_used + 1 >= 5, 1, revoked) WHERE challenge_id = ?',
    [challengeId],
  );
  const updated = await getChallenge(challengeId);
  return updated?.attempts_used ?? 5;
}

/**
 * Revokes challenge upon successful consumption or administrative invalidation.
 */
export async function revokeChallenge(challengeId: string): Promise<void> {
  await query('UPDATE mfa_challenges SET revoked = 1 WHERE challenge_id = ?', [challengeId]);
}

/**
 * Administratively resets MFA for a user (Exclusive Ω / ADMIN).
 */
export async function resetMfaForUser(userId: number | string): Promise<void> {
  await query('DELETE FROM user_mfa_credentials WHERE user_id = ?', [userId]);
  await query('DELETE FROM user_mfa_backup_codes WHERE user_id = ?', [userId]);
  await query('UPDATE mfa_challenges SET revoked = 1 WHERE user_id = ?', [userId]);
  await query(
    'UPDATE users SET is_2fa_enabled = 0, totp_secret_encrypted = NULL, last_totp_timestep = NULL, mfa_enrolled_at = NULL WHERE id = ?',
    [userId],
  );
}
