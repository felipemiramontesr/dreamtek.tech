"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findMfaCredential = findMfaCredential;
exports.upsertMfaCredential = upsertMfaCredential;
exports.confirmMfaCredential = confirmMfaCredential;
exports.updateLastUsedStep = updateLastUsedStep;
exports.storeBackupCodes = storeBackupCodes;
exports.consumeBackupCode = consumeBackupCode;
exports.createChallenge = createChallenge;
exports.getChallenge = getChallenge;
exports.recordFailedChallengeAttempt = recordFailedChallengeAttempt;
exports.revokeChallenge = revokeChallenge;
exports.resetMfaForUser = resetMfaForUser;
/* eslint-disable @typescript-eslint/no-explicit-any */
const db_js_1 = require("../db.js");
const totp_service_js_1 = require("../services/totp.service.js");
/**
 * Finds MFA credential for a given user and type.
 */
async function findMfaCredential(userId, type = 'totp') {
    const rows = await (0, db_js_1.query)('SELECT id, user_id, type, secret_encrypted, is_confirmed, last_used_step, created_at, updated_at FROM user_mfa_credentials WHERE user_id = ? AND type = ? LIMIT 1', [userId, type]);
    if (!rows || rows.length === 0)
        return null;
    return rows[0];
}
/**
 * Upserts unconfirmed MFA credential (ensures no orphaned rows on repeated setup).
 */
async function upsertMfaCredential(userId, type, secretEncrypted) {
    await (0, db_js_1.query)(`INSERT INTO user_mfa_credentials (user_id, type, secret_encrypted, is_confirmed, last_used_step)
     VALUES (?, ?, ?, 0, NULL)
     ON DUPLICATE KEY UPDATE
       secret_encrypted = VALUES(secret_encrypted),
       is_confirmed = 0,
       last_used_step = NULL,
       updated_at = NOW()`, [userId, type, secretEncrypted]);
}
/**
 * Confirms MFA credential upon proving first valid code.
 */
async function confirmMfaCredential(userId, type, step) {
    await (0, db_js_1.query)(`UPDATE user_mfa_credentials
     SET is_confirmed = 1,
         last_used_step = ?,
         updated_at = NOW()
     WHERE user_id = ? AND type = ?`, [step.toString(), userId, type]);
    // Sync users table for legacy compatibility
    await (0, db_js_1.query)(`UPDATE users
     SET is_2fa_enabled = 1,
         last_totp_timestep = ?,
         mfa_enrolled_at = NOW()
     WHERE id = ?`, [step.toString(), userId]);
}
/**
 * Updates last_used_step atomically for anti-replay prevention.
 */
async function updateLastUsedStep(userId, type, step) {
    await (0, db_js_1.query)('UPDATE user_mfa_credentials SET last_used_step = ?, updated_at = NOW() WHERE user_id = ? AND type = ?', [step.toString(), userId, type]);
    // Sync users table
    await (0, db_js_1.query)('UPDATE users SET last_totp_timestep = ? WHERE id = ?', [step.toString(), userId]);
}
/**
 * Stores hashed backup codes for a user.
 */
async function storeBackupCodes(userId, hashedCodes) {
    // Invalidate any prior backup codes
    await (0, db_js_1.query)('DELETE FROM user_mfa_backup_codes WHERE user_id = ?', [userId]);
    for (const hash of hashedCodes) {
        await (0, db_js_1.query)('INSERT INTO user_mfa_backup_codes (user_id, code_hash, used_at) VALUES (?, ?, NULL)', [userId, hash]);
    }
}
/**
 * Checks and consumes a candidate backup code atomically.
 */
async function consumeBackupCode(userId, plainCode) {
    const codes = await (0, db_js_1.query)('SELECT id, code_hash FROM user_mfa_backup_codes WHERE user_id = ? AND used_at IS NULL', [userId]);
    let matchedId = null;
    for (const item of codes) {
        if ((0, totp_service_js_1.verifyBackupCode)(plainCode, item.code_hash)) {
            matchedId = item.id;
            break;
        }
    }
    if (!matchedId)
        return false;
    await (0, db_js_1.query)('UPDATE user_mfa_backup_codes SET used_at = NOW() WHERE id = ? AND used_at IS NULL', [
        matchedId,
    ]);
    return true;
}
/**
 * Creates atomic ephemeral challenge record in DB.
 */
async function createChallenge(challengeId, userId) {
    await (0, db_js_1.query)('INSERT INTO mfa_challenges (challenge_id, user_id, attempts_used, revoked) VALUES (?, ?, 0, 0)', [challengeId, userId]);
}
/**
 * Fetches an active challenge by ID.
 */
async function getChallenge(challengeId) {
    const rows = await (0, db_js_1.query)('SELECT challenge_id, user_id, attempts_used, revoked, created_at FROM mfa_challenges WHERE challenge_id = ? LIMIT 1', [challengeId]);
    if (!rows || rows.length === 0)
        return null;
    return rows[0];
}
/**
 * Increments failed attempt count and revokes challenge if >= 5 attempts.
 */
async function recordFailedChallengeAttempt(challengeId) {
    await (0, db_js_1.query)('UPDATE mfa_challenges SET attempts_used = attempts_used + 1, revoked = IF(attempts_used + 1 >= 5, 1, revoked) WHERE challenge_id = ?', [challengeId]);
    const updated = await getChallenge(challengeId);
    return updated?.attempts_used ?? 5;
}
/**
 * Revokes challenge upon successful consumption or administrative invalidation.
 */
async function revokeChallenge(challengeId) {
    await (0, db_js_1.query)('UPDATE mfa_challenges SET revoked = 1 WHERE challenge_id = ?', [challengeId]);
}
/**
 * Administratively resets MFA for a user (Exclusive Ω / ADMIN).
 */
async function resetMfaForUser(userId) {
    await (0, db_js_1.query)('DELETE FROM user_mfa_credentials WHERE user_id = ?', [userId]);
    await (0, db_js_1.query)('DELETE FROM user_mfa_backup_codes WHERE user_id = ?', [userId]);
    await (0, db_js_1.query)('UPDATE mfa_challenges SET revoked = 1 WHERE user_id = ?', [userId]);
    await (0, db_js_1.query)('UPDATE users SET is_2fa_enabled = 0, totp_secret_encrypted = NULL, last_totp_timestep = NULL, mfa_enrolled_at = NULL WHERE id = ?', [userId]);
}
