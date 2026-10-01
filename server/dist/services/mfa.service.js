"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateLoginPolicy = evaluateLoginPolicy;
exports.verifyMfaChallengeAttempt = verifyMfaChallengeAttempt;
exports.startMfaSetup = startMfaSetup;
exports.confirmMfaSetup = confirmMfaSetup;
exports.disableMfaSecurity = disableMfaSecurity;
/* eslint-disable @typescript-eslint/no-explicit-any */
const node_crypto_1 = __importDefault(require("node:crypto"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const db_js_1 = require("../db.js");
const mfa_repository_js_1 = require("../repositories/mfa.repository.js");
const totp_service_js_1 = require("./totp.service.js");
const totp_js_1 = require("../utils/totp.js");
/**
 * Evaluates user login state against mandatory role policy and MFA enrollment.
 * ADMIN / Ω without confirmed MFA -> mfa_setup_required
 * Any user with confirmed MFA -> mfa_required (atomic challenge in DB)
 * Other users -> session_ready
 */
async function evaluateLoginPolicy(user) {
    const role = String(user.role || '').toUpperCase();
    const isOwner = user.email === 'grayman@dreamtek.tech';
    const isMandatoryRole = role === 'ADMIN' || isOwner;
    const credential = await (0, mfa_repository_js_1.findMfaCredential)(user.id, 'totp');
    const isConfirmed = credential?.is_confirmed === 1 || user.is_2fa_enabled === 1 || user.is_2fa_enabled === true;
    if (isConfirmed) {
        const challengeId = node_crypto_1.default.randomUUID();
        await (0, mfa_repository_js_1.createChallenge)(challengeId, user.id);
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
async function verifyMfaChallengeAttempt(challengeId, userId, code, method = 'TOTP') {
    const challenge = await (0, mfa_repository_js_1.getChallenge)(challengeId);
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
        const consumed = await (0, mfa_repository_js_1.consumeBackupCode)(userId, code);
        if (!consumed) {
            await (0, mfa_repository_js_1.recordFailedChallengeAttempt)(challengeId);
            return { success: false, error: 'Código de recuperación inválido o ya utilizado.' };
        }
        await (0, mfa_repository_js_1.revokeChallenge)(challengeId);
        return { success: true };
    }
    // TOTP verification
    const credential = await (0, mfa_repository_js_1.findMfaCredential)(userId, 'totp');
    const secretEncrypted = credential?.secret_encrypted;
    if (!secretEncrypted) {
        return { success: false, error: 'Método TOTP no configurado en este usuario.' };
    }
    const plainSecret = (0, totp_js_1.decryptTotpSecret)(secretEncrypted);
    const verifyResult = (0, totp_service_js_1.verifyTotpCode)(plainSecret, code, credential.last_used_step);
    if (!verifyResult.valid) {
        await (0, mfa_repository_js_1.recordFailedChallengeAttempt)(challengeId);
        if (verifyResult.reason === 'CODE_REPLAYED') {
            return {
                success: false,
                error: 'Código ya utilizado. Espere al siguiente ciclo en su aplicación autenticadora.',
            };
        }
        return { success: false, error: 'Código de autenticación inválido o expirado.' };
    }
    // Atomically update last_used_step and revoke challenge
    await (0, mfa_repository_js_1.updateLastUsedStep)(userId, 'totp', verifyResult.matchedStep);
    await (0, mfa_repository_js_1.revokeChallenge)(challengeId);
    return { success: true };
}
/**
 * Initializes MFA setup: generates fresh secret, stores unconfirmed credential.
 */
async function startMfaSetup(userId, email) {
    const { secretBase32, otpauthUri } = (0, totp_service_js_1.generateTotpSecret)(email);
    const encryptedSecret = (0, totp_js_1.encryptTotpSecret)(secretBase32);
    await (0, mfa_repository_js_1.upsertMfaCredential)(userId, 'totp', encryptedSecret);
    // Sync users table
    await (0, db_js_1.query)('UPDATE users SET totp_secret_encrypted = ? WHERE id = ?', [
        encryptedSecret,
        userId,
    ]);
    return { secretBase32, otpauthUri };
}
/**
 * Confirms setup with first proof code and generates 8 backup codes.
 */
async function confirmMfaSetup(userId, candidateCode) {
    const credential = await (0, mfa_repository_js_1.findMfaCredential)(userId, 'totp');
    if (!credential || !credential.secret_encrypted) {
        return { success: false, error: 'No se ha iniciado la configuración de MFA.' };
    }
    const secretBase32 = (0, totp_js_1.decryptTotpSecret)(credential.secret_encrypted);
    const verifyResult = (0, totp_service_js_1.verifyTotpCode)(secretBase32, candidateCode);
    if (!verifyResult.valid || verifyResult.matchedStep === null) {
        return { success: false, error: 'Código de verificación inicial incorrecto.' };
    }
    await (0, mfa_repository_js_1.confirmMfaCredential)(userId, 'totp', verifyResult.matchedStep);
    const { plainCodes, hashedCodes } = (0, totp_service_js_1.generateBackupCodes)(8);
    await (0, mfa_repository_js_1.storeBackupCodes)(userId, hashedCodes);
    return { success: true, backupCodes: plainCodes };
}
/**
 * Disables MFA requiring current password and proof code.
 */
async function disableMfaSecurity(userId, passwordAttempt, code) {
    const users = await (0, db_js_1.query)('SELECT password_hash FROM users WHERE id = ? LIMIT 1', [
        userId,
    ]);
    const user = users[0];
    if (!user || !(await bcryptjs_1.default.compare(passwordAttempt, user.password_hash))) {
        return { success: false, error: 'Contraseña actual incorrecta.' };
    }
    const credential = await (0, mfa_repository_js_1.findMfaCredential)(userId, 'totp');
    if (!credential || credential.is_confirmed !== 1) {
        return { success: false, error: 'MFA no se encuentra habilitado.' };
    }
    const secretBase32 = (0, totp_js_1.decryptTotpSecret)(credential.secret_encrypted);
    const verifyResult = (0, totp_service_js_1.verifyTotpCode)(secretBase32, code, credential.last_used_step);
    let isVerified = verifyResult.valid;
    if (!isVerified) {
        isVerified = await (0, mfa_repository_js_1.consumeBackupCode)(userId, code);
    }
    if (!isVerified) {
        return { success: false, error: 'Código de confirmación inválido.' };
    }
    await (0, mfa_repository_js_1.resetMfaForUser)(userId);
    return { success: true };
}
