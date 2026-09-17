"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.REG_COOKIE_NAME = exports.MFA_COOKIE_NAME = exports.COOKIE_NAME = exports.authRouter = void 0;
exports.getJwtSecret = getJwtSecret;
exports.setAuthTransporterForTest = setAuthTransporterForTest;
exports.getAuthTransporter = getAuthTransporter;
/* eslint-disable @typescript-eslint/no-explicit-any */
const node_crypto_1 = __importDefault(require("node:crypto"));
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const nodemailer_1 = __importDefault(require("nodemailer"));
const db_js_1 = require("../db.js");
const auditLogger_js_1 = require("../middleware/auditLogger.js");
const validate_js_1 = require("../middleware/validate.js");
const auth_schema_js_1 = require("../schemas/auth.schema.js");
const totp_js_1 = require("../utils/totp.js");
const mailer_js_1 = require("../services/mailer.js");
function getJwtSecret() {
    if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
        throw new Error('FATAL SECURITY ERROR: JWT_SECRET environment variable is missing in production.');
    }
    return process.env.JWT_SECRET || 'dreamtek_dev_jwt_secret_key_2026';
}
let authTestTransporter = null;
function setAuthTransporterForTest(transporter) {
    authTestTransporter = transporter;
    (0, mailer_js_1.setMailerTransporterForTest)(transporter);
}
function getAuthTransporter() {
    if (authTestTransporter)
        return authTestTransporter;
    return nodemailer_1.default.createTransport({
        host: process.env.SMTP_HOST || 'smtp.hostinger.com',
        port: parseInt(process.env.SMTP_PORT || '465', 10),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
            user: process.env.SMTP_USER || mailer_js_1.OFFICIAL_SENDER,
            pass: process.env.SMTP_PASS || '',
        },
    });
}
exports.authRouter = (0, express_1.Router)();
exports.COOKIE_NAME = 'dreamtek_session';
exports.MFA_COOKIE_NAME = 'dreamtek_mfa_ticket';
exports.REG_COOKIE_NAME = 'dreamtek_reg_ticket';
/**
 * Helper to get authenticated user from session cookie
 */
async function getSessionUser(req) {
    const token = req.cookies?.[exports.COOKIE_NAME];
    if (!token)
        return null;
    try {
        const payload = jsonwebtoken_1.default.verify(token, getJwtSecret(), { algorithms: ['HS512'] });
        const userId = payload.userId ?? payload.uid;
        const users = await (0, db_js_1.query)('SELECT id, email, role, full_name, password_hash, is_2fa_enabled, totp_secret_encrypted, last_totp_timestep, mfa_enrolled_at FROM users WHERE id = ? LIMIT 1', [userId]);
        if (!users || users.length === 0)
            return null;
        return users[0];
    }
    catch {
        return null;
    }
}
/**
 * POST /api/v1/auth/register
 * Public client registration with email OTP verification (FC 049 / Condition C-049.2 & C-049.3)
 */
exports.authRouter.post('/register', (0, validate_js_1.validate)(auth_schema_js_1.registerSchema), async (req, res) => {
    try {
        const { email, password, full_name, phone } = req.body;
        const cleanEmail = String(email).trim().toLowerCase();
        const cleanName = String(full_name).trim();
        const existingUsers = await (0, db_js_1.query)('SELECT id FROM users WHERE email = ? LIMIT 1', [cleanEmail]);
        if (existingUsers && existingUsers.length > 0) {
            res.status(409).json({
                status: 'error',
                message: 'El correo electrónico ya se encuentra registrado.',
            });
            return;
        }
        const passwordHash = await bcryptjs_1.default.hash(password, 12);
        const result = await (0, db_js_1.query)('INSERT INTO users (email, password_hash, full_name, phone, role, is_email_verified) VALUES (?, ?, ?, ?, "CLIENT", 0)', [cleanEmail, passwordHash, cleanName, phone ? String(phone).trim() : null]);
        const userId = result.insertId;
        // Generate 6-digit numeric verification OTP
        const code = String(node_crypto_1.default.randomInt(100000, 1000000));
        const codeHash = node_crypto_1.default.createHash('sha256').update(code).digest('hex');
        await (0, db_js_1.query)('INSERT INTO user_email_verifications (user_id, code_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 15 MINUTE))', [userId, codeHash]);
        // Dispatch verification email via unified mailer service
        await (0, mailer_js_1.sendRegistrationVerificationOtp)(cleanEmail, code, cleanName);
        await (0, auditLogger_js_1.logSecurityEvent)(req, {
            eventType: 'USER_REGISTERED_PENDING_VERIFICATION',
            userId,
            status: 'SUCCESS',
            details: `Registration OTP dispatched to ${cleanEmail}`,
        });
        // Ephemeral registration ticket strictly via HttpOnly cookie (C-049.3)
        const regTicket = jsonwebtoken_1.default.sign({
            userId,
            uid: userId,
            email: cleanEmail,
            fullName: cleanName,
            type: 'REG_TICKET',
            stage: 'REGISTRATION_OTP_PENDING',
        }, getJwtSecret(), { algorithm: 'HS512', expiresIn: '15m' });
        res.cookie(exports.REG_COOKIE_NAME, regTicket, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 15 * 60 * 1000,
        });
        res.status(201).json({
            status: 'verification_required',
            message: 'Cuenta creada. Por favor ingresa el código de verificación enviado a tu correo.',
            user: {
                id: userId,
                email: cleanEmail,
                full_name: cleanName,
            },
        });
    }
    catch {
        res.status(500).json({ status: 'error', message: 'Error interno al registrar la cuenta.' });
    }
});
/**
 * POST /api/v1/auth/register/verify-otp
 * Validates registration OTP and issues official dreamtek_session cookie (Conditions C-049.2 & C-049.4)
 */
exports.authRouter.post('/register/verify-otp', async (req, res) => {
    try {
        const ticket = req.cookies?.[exports.REG_COOKIE_NAME];
        if (!ticket) {
            res.status(401).json({
                status: 'error',
                message: 'Sesión de registro no encontrada o expirada. Por favor regístrate nuevamente.',
            });
            return;
        }
        let payload;
        try {
            payload = jsonwebtoken_1.default.verify(ticket, getJwtSecret(), { algorithms: ['HS512'] });
        }
        catch {
            res.status(401).json({
                status: 'error',
                message: 'Ticket de registro expirado o inválido.',
            });
            return;
        }
        if (payload.type !== 'REG_TICKET' || payload.stage !== 'REGISTRATION_OTP_PENDING') {
            res.status(401).json({
                status: 'error',
                message: 'Ticket de registro inválido.',
            });
            return;
        }
        const code = typeof req.body.code === 'string' ? req.body.code.trim() : '';
        if (code.length !== 6 || !/^\d{6}$/.test(code)) {
            res.status(400).json({
                status: 'error',
                message: 'El código debe ser de 6 dígitos numéricos.',
            });
            return;
        }
        const userId = payload.userId;
        const otps = await (0, db_js_1.query)('SELECT id, code_hash, attempts, max_attempts, expires_at FROM user_email_verifications WHERE user_id = ? AND used = 0 AND expires_at > NOW() ORDER BY id DESC LIMIT 1', [userId]);
        const otp = otps[0];
        if (!otp) {
            res.status(400).json({
                status: 'error',
                message: 'No hay código de verificación activo o ha expirado.',
            });
            return;
        }
        if (otp.attempts >= otp.max_attempts) {
            res.status(400).json({
                status: 'error',
                message: 'Número máximo de intentos excedido. Solicita un nuevo código.',
            });
            return;
        }
        // Timing-safe comparison using crypto.timingSafeEqual (Condition C-049.4)
        const candidateHash = node_crypto_1.default.createHash('sha256').update(code).digest('hex');
        const bufA = Buffer.from(candidateHash, 'hex');
        const bufB = Buffer.from(otp.code_hash, 'hex');
        const isValid = bufA.length === bufB.length && node_crypto_1.default.timingSafeEqual(bufA, bufB);
        if (!isValid) {
            await (0, db_js_1.query)('UPDATE user_email_verifications SET attempts = attempts + 1 WHERE id = ?', [
                otp.id,
            ]);
            res.status(400).json({
                status: 'error',
                message: 'Código de verificación incorrecto.',
            });
            return;
        }
        // Atomically mark OTP used and activate user email verification
        await (0, db_js_1.query)('UPDATE user_email_verifications SET used = 1 WHERE id = ?', [otp.id]);
        await (0, db_js_1.query)('UPDATE users SET is_email_verified = 1, email_verified_at = NOW() WHERE id = ?', [
            userId,
        ]);
        // Clear registration ticket
        res.clearCookie(exports.REG_COOKIE_NAME);
        // Issue permanent session cookie
        const sessionToken = jsonwebtoken_1.default.sign({
            userId,
            uid: userId,
            email: payload.email,
            role: 'CLIENT',
            name: payload.fullName,
        }, getJwtSecret(), { algorithm: 'HS512', expiresIn: '24h' });
        res.cookie(exports.COOKIE_NAME, sessionToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });
        await (0, auditLogger_js_1.logSecurityEvent)(req, {
            eventType: 'EMAIL_VERIFIED_SUCCESS',
            userId,
            status: 'SUCCESS',
            details: `Email successfully verified for ${payload.email}`,
        });
        res.json({
            status: 'success',
            message: 'Correo verificado y cuenta activada exitosamente.',
            user: {
                id: userId,
                email: payload.email,
                role: 'CLIENT',
                full_name: payload.fullName,
            },
        });
    }
    catch {
        res.status(500).json({ status: 'error', message: 'Error interno en la verificación de código.' });
    }
});
/**
 * POST /api/v1/auth/register/resend-otp
 * Resends registration OTP under rate limiting (Condition C-049.5)
 */
exports.authRouter.post('/register/resend-otp', async (req, res) => {
    try {
        const ticket = req.cookies?.[exports.REG_COOKIE_NAME];
        if (!ticket) {
            res.status(401).json({
                status: 'error',
                message: 'Sesión de registro no encontrada o expirada. Por favor regístrate nuevamente.',
            });
            return;
        }
        let payload;
        try {
            payload = jsonwebtoken_1.default.verify(ticket, getJwtSecret(), { algorithms: ['HS512'] });
        }
        catch {
            res.status(401).json({
                status: 'error',
                message: 'Ticket de registro expirado o inválido.',
            });
            return;
        }
        const userId = payload.userId;
        // Rate limit: maximum 3 resend attempts per 15 minutes window (Condition C-049.5)
        const recentRequests = await (0, db_js_1.query)('SELECT COUNT(*) as count FROM user_email_verifications WHERE user_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 15 MINUTE)', [userId]);
        const count = recentRequests[0].count;
        if (count >= 3) {
            res.status(429).json({
                status: 'error',
                message: 'Demasiadas solicitudes de reenvío. Por favor espera 15 minutos.',
            });
            return;
        }
        // Invalidate previous OTPs
        await (0, db_js_1.query)('UPDATE user_email_verifications SET used = 1 WHERE user_id = ? AND used = 0', [userId]);
        const code = String(node_crypto_1.default.randomInt(100000, 1000000));
        const codeHash = node_crypto_1.default.createHash('sha256').update(code).digest('hex');
        await (0, db_js_1.query)('INSERT INTO user_email_verifications (user_id, code_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 15 MINUTE))', [userId, codeHash]);
        await (0, mailer_js_1.sendRegistrationVerificationOtp)(payload.email, code, payload.fullName);
        await (0, auditLogger_js_1.logSecurityEvent)(req, {
            eventType: 'REGISTRATION_OTP_RESENT',
            userId,
            status: 'SUCCESS',
            details: `New registration OTP dispatched to ${payload.email}`,
        });
        res.json({
            status: 'success',
            message: 'Nuevo código de verificación enviado a tu correo.',
        });
    }
    catch {
        res.status(500).json({ status: 'error', message: 'Error interno al reenviar código.' });
    }
});
/**
 * POST /api/v1/auth/login
 * Two-stage authentication entrypoint (Conditions C-047.1 & C-047.3)
 */
exports.authRouter.post('/login', (0, validate_js_1.validate)(auth_schema_js_1.loginSchema), async (req, res) => {
    try {
        const { email, password } = req.body;
        const identifier = String(email || '').trim();
        if (!identifier || !password) {
            res.status(400).json({ status: 'error', message: 'Email y contraseña requeridos.' });
            return;
        }
        const users = await (0, db_js_1.query)('SELECT id, username, email, password_hash, role, full_name, is_2fa_enabled, totp_secret_encrypted, is_email_verified FROM users WHERE (email = ? OR username = ?) LIMIT 1', [identifier, identifier]);
        const user = users[0];
        if (!user || !(await bcryptjs_1.default.compare(password, user.password_hash))) {
            await (0, auditLogger_js_1.logSecurityEvent)(req, {
                eventType: 'LOGIN_FAILURE',
                status: 'FAILURE',
                details: `Failed login attempt for ${identifier}`,
            });
            res.status(401).json({ status: 'error', message: 'Credenciales inválidas.' });
            return;
        }
        // Check if user email has been verified (Condition C-049.2 & FC 049)
        if (user.is_email_verified === 0 || user.is_email_verified === false) {
            await (0, auditLogger_js_1.logSecurityEvent)(req, {
                eventType: 'LOGIN_UNVERIFIED_EMAIL',
                userId: user.id,
                status: 'FAILURE',
                details: `Login blocked for unverified email: ${user.email}`,
            });
            res.status(403).json({
                status: 'error',
                code: 'EMAIL_NOT_VERIFIED',
                message: 'Tu correo electrónico aún no ha sido verificado. Por favor confirma tu cuenta.',
            });
            return;
        }
        // Check if Multi-Factor Authentication (2FA) is active on this account
        if (user.is_2fa_enabled === 1 || user.is_2fa_enabled === true) {
            await (0, auditLogger_js_1.logSecurityEvent)(req, {
                eventType: 'LOGIN_MFA_CHALLENGE',
                userId: user.id,
                status: 'SUCCESS',
                details: `MFA challenge triggered for ${user.email}`,
            });
            // Condition C-047.1 & C-047.3: Ephemeral 5-minute ticket strictly via HttpOnly cookie.
            // NEVER set dreamtek_session cookie here.
            const mfaTicket = jsonwebtoken_1.default.sign({
                userId: user.id,
                uid: user.id,
                email: user.email,
                role: (user.role || 'CLIENT').toUpperCase(),
                type: 'MFA_TICKET',
                stage: 'MFA_PENDING',
            }, getJwtSecret(), { algorithm: 'HS512', expiresIn: '5m' });
            res.cookie(exports.MFA_COOKIE_NAME, mfaTicket, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 5 * 60 * 1000,
            });
            res.json({
                status: '2fa_required',
                message: 'Autenticación de dos factores requerida.',
                available_methods: ['TOTP', 'EMAIL', 'RECOVERY'],
                user: {
                    id: user.id,
                    email: user.email,
                },
            });
            return;
        }
        await (0, auditLogger_js_1.logSecurityEvent)(req, {
            eventType: 'LOGIN_SUCCESS',
            userId: user.id,
            status: 'SUCCESS',
        });
        const token = jsonwebtoken_1.default.sign({
            userId: user.id,
            uid: user.id,
            email: user.email,
            role: (user.role || 'CLIENT').toUpperCase(),
            name: user.full_name,
        }, getJwtSecret(), { algorithm: 'HS512', expiresIn: '24h' });
        res.cookie(exports.COOKIE_NAME, token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });
        res.json({
            status: 'success',
            user: {
                id: user.id,
                username: user.username || null,
                email: user.email,
                role: user.role,
                full_name: user.full_name,
            },
        });
    }
    catch {
        res.status(500).json({ status: 'error', message: 'Error interno de autenticación.' });
    }
});
/**
 * POST /api/v1/auth/2fa/verify
 * Validates candidate 2FA challenge and delivers final dreamtek_session cookie (Conditions C-047.1/3/5/6)
 */
exports.authRouter.post('/2fa/verify', (0, validate_js_1.validate)(auth_schema_js_1.mfaVerifySchema), async (req, res) => {
    try {
        const ticket = req.cookies?.[exports.MFA_COOKIE_NAME];
        if (!ticket) {
            res.status(401).json({
                status: 'error',
                message: 'Ticket de verificación 2FA no encontrado o expirado. Por favor inicie sesión nuevamente.',
            });
            return;
        }
        let payload;
        try {
            payload = jsonwebtoken_1.default.verify(ticket, getJwtSecret(), { algorithms: ['HS512'] });
        }
        catch {
            res.status(401).json({
                status: 'error',
                message: 'Ticket de verificación 2FA expirado o inválido. Por favor inicie sesión nuevamente.',
            });
            return;
        }
        if (payload.type !== 'MFA_TICKET' || payload.stage !== 'MFA_PENDING') {
            res.status(401).json({
                status: 'error',
                message: 'Ticket de autorización inválido para verificación 2FA.',
            });
            return;
        }
        const userId = payload.userId ?? payload.uid;
        const users = await (0, db_js_1.query)('SELECT id, email, role, full_name, is_2fa_enabled, totp_secret_encrypted, last_totp_timestep FROM users WHERE id = ? LIMIT 1', [userId]);
        const user = users[0];
        if (!user || !user.is_2fa_enabled) {
            res.status(400).json({ status: 'error', message: 'Usuario no válido o 2FA no habilitado.' });
            return;
        }
        const { code, method } = req.body;
        if (method === 'TOTP') {
            if (!user.totp_secret_encrypted) {
                res.status(400).json({
                    status: 'error',
                    message: 'Método TOTP no configurado en este usuario.',
                });
                return;
            }
            const secretBase32 = (0, totp_js_1.decryptTotpSecret)(user.totp_secret_encrypted);
            const verifyResult = (0, totp_js_1.verifyTotpCode)(secretBase32, code, {
                lastTimestep: user.last_totp_timestep,
            });
            if (!verifyResult.valid) {
                if (verifyResult.error === 'CODE_REPLAYED') {
                    res.status(400).json({
                        status: 'error',
                        message: 'Código ya utilizado. Espere al siguiente ciclo en su aplicación autenticadora.',
                    });
                    return;
                }
                res.status(400).json({
                    status: 'error',
                    message: 'Código de autenticación inválido o expirado.',
                });
                return;
            }
            // Persist last used timestep for anti-replay (C-047.5)
            await (0, db_js_1.query)('UPDATE users SET last_totp_timestep = ? WHERE id = ?', [
                verifyResult.matchedTimestep,
                user.id,
            ]);
        }
        else if (method === 'EMAIL') {
            const otps = await (0, db_js_1.query)('SELECT id, code_hash, attempts, max_attempts, expires_at FROM user_mfa_email_otps WHERE user_id = ? AND used = 0 AND expires_at > NOW() ORDER BY id DESC LIMIT 1', [user.id]);
            const otp = otps[0];
            if (!otp) {
                res.status(400).json({
                    status: 'error',
                    message: 'No hay código de verificación activo por correo o ha expirado.',
                });
                return;
            }
            if (otp.attempts >= otp.max_attempts) {
                res.status(400).json({
                    status: 'error',
                    message: 'Número máximo de intentos excedido para este código. Solicite un nuevo código.',
                });
                return;
            }
            const isValid = (0, totp_js_1.verifyEmailOtpHash)(code, otp.code_hash);
            if (!isValid) {
                await (0, db_js_1.query)('UPDATE user_mfa_email_otps SET attempts = attempts + 1 WHERE id = ?', [
                    otp.id,
                ]);
                res.status(400).json({
                    status: 'error',
                    message: 'Código de verificación por correo incorrecto.',
                });
                return;
            }
            // Mark OTP as used atomically
            await (0, db_js_1.query)('UPDATE user_mfa_email_otps SET used = 1 WHERE id = ?', [otp.id]);
        }
        else {
            const recoveryCodes = await (0, db_js_1.query)('SELECT id, code_hash FROM user_mfa_recovery_codes WHERE user_id = ? AND used = 0', [user.id]);
            let matchedRecoveryId = null;
            for (const item of recoveryCodes) {
                if ((0, totp_js_1.verifyRecoveryCodeHash)(code, item.code_hash)) {
                    matchedRecoveryId = item.id;
                    break;
                }
            }
            if (!matchedRecoveryId) {
                res.status(400).json({
                    status: 'error',
                    message: 'Código de recuperación inválido o ya utilizado.',
                });
                return;
            }
            // Consume one-time recovery code atomically (C-047.6)
            await (0, db_js_1.query)('UPDATE user_mfa_recovery_codes SET used = 1, used_at = NOW() WHERE id = ? AND used = 0', [matchedRecoveryId]);
        }
        // Successful verification: destroy ephemeral ticket cookie and issue session cookie
        res.clearCookie(exports.MFA_COOKIE_NAME);
        const sessionToken = jsonwebtoken_1.default.sign({
            userId: user.id,
            uid: user.id,
            email: user.email,
            role: (user.role || 'CLIENT').toUpperCase(),
            name: user.full_name,
        }, getJwtSecret(), { algorithm: 'HS512', expiresIn: '24h' });
        res.cookie(exports.COOKIE_NAME, sessionToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });
        await (0, auditLogger_js_1.logSecurityEvent)(req, {
            eventType: 'MFA_VERIFY_SUCCESS',
            userId: user.id,
            status: 'SUCCESS',
            details: `2FA verification completed via method ${method}`,
        });
        res.json({
            status: 'success',
            message: 'Autenticación de dos pasos completada exitosamente.',
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                full_name: user.full_name,
            },
        });
    }
    catch {
        res.status(500).json({ status: 'error', message: 'Error en la verificación 2FA.' });
    }
});
/**
 * POST /api/v1/auth/2fa/send-email-otp
 * Dispatches 6-digit numeric OTP email under rate limiting
 */
exports.authRouter.post('/2fa/send-email-otp', async (req, res) => {
    try {
        const ticket = req.cookies?.[exports.MFA_COOKIE_NAME];
        if (!ticket) {
            res.status(401).json({
                status: 'error',
                message: 'Sesión temporal de 2FA no encontrada. Por favor inicie sesión nuevamente.',
            });
            return;
        }
        let payload;
        try {
            payload = jsonwebtoken_1.default.verify(ticket, getJwtSecret(), { algorithms: ['HS512'] });
        }
        catch {
            res.status(401).json({
                status: 'error',
                message: 'Ticket de 2FA expirado o inválido.',
            });
            return;
        }
        const userId = payload.userId ?? payload.uid;
        // Rate limiting: max 3 codes per 15 minutes window
        const recentRequests = await (0, db_js_1.query)('SELECT COUNT(*) as count FROM user_mfa_email_otps WHERE user_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 15 MINUTE)', [userId]);
        const count = recentRequests[0]?.count ?? 0;
        if (count >= 3) {
            res.status(429).json({
                status: 'error',
                message: 'Demasiadas solicitudes de código. Por favor espere 15 minutos.',
            });
            return;
        }
        const { code, codeHash, expiresAt } = (0, totp_js_1.generateEmailOtp)(10);
        await (0, db_js_1.query)('INSERT INTO user_mfa_email_otps (user_id, code_hash, expires_at) VALUES (?, ?, ?)', [userId, codeHash, expiresAt]);
        await (0, mailer_js_1.sendMfaEmailOtp)(payload.email, code);
        await (0, auditLogger_js_1.logSecurityEvent)(req, {
            eventType: 'MFA_EMAIL_OTP_SENT',
            userId,
            status: 'SUCCESS',
            details: `Email OTP dispatched to ${payload.email}`,
        });
        res.json({
            status: 'success',
            message: 'Código de verificación enviado al correo electrónico asociado.',
        });
    }
    catch {
        res.status(500).json({ status: 'error', message: 'Error al enviar código.' });
    }
});
/**
 * GET /api/v1/auth/2fa/status
 * Queries 2FA status for the current authenticated session
 */
exports.authRouter.get('/2fa/status', async (req, res) => {
    try {
        const user = await getSessionUser(req);
        if (!user) {
            res.status(401).json({ status: 'error', message: 'No autenticado.' });
            return;
        }
        const counts = await (0, db_js_1.query)('SELECT COUNT(*) as remaining FROM user_mfa_recovery_codes WHERE user_id = ? AND used = 0', [user.id]);
        const remainingRecoveryCodes = Number(counts[0]?.remaining ?? 0);
        res.json({
            status: 'success',
            is_2fa_enabled: Boolean(user.is_2fa_enabled),
            mfa_enrolled_at: user.mfa_enrolled_at ?? null,
            remaining_recovery_codes: remainingRecoveryCodes,
        });
    }
    catch {
        res.status(500).json({ status: 'error', message: 'Error al consultar estado 2FA.' });
    }
});
/**
 * POST /api/v1/auth/2fa/setup
 * Generates fresh TOTP enrollment secret and 8 recovery codes (Condition C-047.6/7/8)
 */
exports.authRouter.post('/2fa/setup', async (req, res) => {
    try {
        const user = await getSessionUser(req);
        if (!user) {
            res.status(401).json({ status: 'error', message: 'No autenticado.' });
            return;
        }
        const { secretBase32, otpauthUrl } = (0, totp_js_1.generateTotpSecret)(user.email, 'Dreamtek');
        const { plainCodes } = (0, totp_js_1.generateRecoveryCodes)(8);
        res.json({
            status: 'success',
            secretBase32,
            otpauthUrl,
            recoveryCodes: plainCodes,
        });
    }
    catch {
        res.status(500).json({ status: 'error', message: 'Error al generar configuración 2FA.' });
    }
});
/**
 * POST /api/v1/auth/2fa/enable
 * Validates initial TOTP code and activates is_2fa_enabled = 1
 */
exports.authRouter.post('/2fa/enable', (0, validate_js_1.validate)(auth_schema_js_1.mfaEnableSchema), async (req, res) => {
    try {
        const user = await getSessionUser(req);
        if (!user) {
            res.status(401).json({ status: 'error', message: 'No autenticado.' });
            return;
        }
        const { code, secretBase32, recoveryCodes } = req.body;
        const verifyResult = (0, totp_js_1.verifyTotpCode)(secretBase32, code);
        if (!verifyResult.valid) {
            res.status(400).json({
                status: 'error',
                message: 'Código de autenticación incorrecto. Verifique la hora de su dispositivo e intente de nuevo.',
            });
            return;
        }
        const encryptedSecret = (0, totp_js_1.encryptTotpSecret)(secretBase32);
        await (0, db_js_1.query)('UPDATE users SET is_2fa_enabled = 1, totp_secret_encrypted = ?, last_totp_timestep = ?, mfa_enrolled_at = NOW() WHERE id = ?', [encryptedSecret, verifyResult.matchedTimestep, user.id]);
        // Clean up previous recovery codes and insert new ones
        await (0, db_js_1.query)('DELETE FROM user_mfa_recovery_codes WHERE user_id = ?', [user.id]);
        let codesToStore = [];
        if (Array.isArray(recoveryCodes) && recoveryCodes.length > 0) {
            codesToStore = recoveryCodes;
        }
        else {
            const fresh = (0, totp_js_1.generateRecoveryCodes)(8);
            codesToStore = fresh.plainCodes;
        }
        for (const plain of codesToStore) {
            const hash = (0, totp_js_1.hashRecoveryCode)(plain);
            await (0, db_js_1.query)('INSERT INTO user_mfa_recovery_codes (user_id, code_hash, used) VALUES (?, ?, 0)', [user.id, hash]);
        }
        await (0, auditLogger_js_1.logSecurityEvent)(req, {
            eventType: 'MFA_ENABLED',
            userId: user.id,
            status: 'SUCCESS',
            details: `2FA successfully enabled for ${user.email}`,
        });
        res.json({
            status: 'success',
            message: 'Autenticación de dos pasos activada exitosamente.',
        });
    }
    catch {
        res.status(500).json({ status: 'error', message: 'Error al habilitar 2FA.' });
    }
});
/**
 * POST /api/v1/auth/2fa/disable
 * Disables 2FA requiring current password + valid TOTP/recovery code (Condition C-047.8)
 */
exports.authRouter.post('/2fa/disable', (0, validate_js_1.validate)(auth_schema_js_1.mfaDisableSchema), async (req, res) => {
    try {
        const user = await getSessionUser(req);
        if (!user) {
            res.status(401).json({ status: 'error', message: 'No autenticado.' });
            return;
        }
        const { password, code } = req.body;
        const passwordMatch = await bcryptjs_1.default.compare(password, user.password_hash);
        if (!passwordMatch) {
            res.status(401).json({ status: 'error', message: 'Contraseña incorrecta.' });
            return;
        }
        let codeValid = false;
        // 1. Try TOTP code
        if (user.totp_secret_encrypted) {
            try {
                const secretBase32 = (0, totp_js_1.decryptTotpSecret)(user.totp_secret_encrypted);
                const result = (0, totp_js_1.verifyTotpCode)(secretBase32, code, {
                    lastTimestep: user.last_totp_timestep,
                });
                if (result.valid) {
                    codeValid = true;
                }
            }
            catch {
                // Secret couldn't be decrypted, fallback to recovery check
            }
        }
        // 2. If TOTP wasn't valid, try recovery codes
        if (!codeValid) {
            const recoveryList = await (0, db_js_1.query)('SELECT id, code_hash FROM user_mfa_recovery_codes WHERE user_id = ? AND used = 0', [user.id]);
            for (const item of recoveryList) {
                if ((0, totp_js_1.verifyRecoveryCodeHash)(code, item.code_hash)) {
                    codeValid = true;
                    break;
                }
            }
        }
        if (!codeValid) {
            res.status(400).json({
                status: 'error',
                message: 'Código de autenticación 2FA o código de recuperación incorrecto.',
            });
            return;
        }
        // Reset 2FA state
        await (0, db_js_1.query)('UPDATE users SET is_2fa_enabled = 0, totp_secret_encrypted = NULL, last_totp_timestep = NULL, mfa_enrolled_at = NULL WHERE id = ?', [user.id]);
        // Clean up recovery codes and email OTPs
        await (0, db_js_1.query)('DELETE FROM user_mfa_recovery_codes WHERE user_id = ?', [user.id]);
        await (0, db_js_1.query)('DELETE FROM user_mfa_email_otps WHERE user_id = ?', [user.id]);
        await (0, auditLogger_js_1.logSecurityEvent)(req, {
            eventType: 'MFA_DISABLED',
            userId: user.id,
            status: 'SUCCESS',
            details: `2FA disabled for ${user.email}`,
        });
        res.json({
            status: 'success',
            message: 'Autenticación de dos pasos desactivada exitosamente.',
        });
    }
    catch {
        res.status(500).json({ status: 'error', message: 'Error al desactivar 2FA.' });
    }
});
/**
 * POST /api/v1/auth/logout
 */
exports.authRouter.post('/logout', (_req, res) => {
    res.clearCookie(exports.COOKIE_NAME);
    res.clearCookie(exports.MFA_COOKIE_NAME);
    res.json({ status: 'success', message: 'Sesión cerrada exitosamente.' });
});
/**
 * GET /api/v1/auth/me
 */
exports.authRouter.get('/me', async (req, res) => {
    try {
        const token = req.cookies?.[exports.COOKIE_NAME];
        if (!token) {
            res.status(401).json({ status: 'error', message: 'No autenticado.' });
            return;
        }
        const payload = jsonwebtoken_1.default.verify(token, getJwtSecret(), { algorithms: ['HS512'] });
        const userId = payload.userId ?? payload.uid;
        const users = await (0, db_js_1.query)('SELECT id, email, role, full_name FROM users WHERE id = ? LIMIT 1', [userId]);
        const user = users[0];
        if (!user) {
            res.status(401).json({ status: 'error', message: 'Usuario no encontrado.' });
            return;
        }
        res.json({ status: 'success', user });
    }
    catch {
        res.status(401).json({ status: 'error', message: 'Sesión expirada o inválida.' });
    }
});
/**
 * GET /api/v1/auth/invite/verify
 * Validates an onboarding invite token (Condition C-044.1 / FC 044)
 */
exports.authRouter.get('/invite/verify', async (req, res) => {
    try {
        const { token } = req.query;
        if (!token || typeof token !== 'string') {
            res
                .status(400)
                .json({ status: 'error', valid: false, message: 'Token de invitación requerido.' });
            return;
        }
        const payload = jsonwebtoken_1.default.verify(token, getJwtSecret(), { algorithms: ['HS512'] });
        if (payload.action !== 'B2B_PORTAL_INVITE') {
            res
                .status(400)
                .json({ status: 'error', valid: false, message: 'Token de invitación inválido.' });
            return;
        }
        res.json({
            status: 'success',
            valid: true,
            email: payload.email,
            userId: payload.userId,
            fullName: payload.fullName,
            tenantId: payload.tenantId,
        });
    }
    catch {
        res
            .status(400)
            .json({ status: 'error', valid: false, message: 'Token de invitación inválido o expirado.' });
    }
});
/**
 * POST /api/v1/auth/activate
 * Sets initial password for invited B2B client and authenticates (Condition C-044.1 / FC 044)
 */
exports.authRouter.post('/activate', async (req, res) => {
    try {
        const { token, password } = req.body;
        if (!token || typeof token !== 'string' || !password || typeof password !== 'string') {
            res.status(400).json({ status: 'error', message: 'Token y contraseña requeridos.' });
            return;
        }
        if (password.length < 8) {
            res
                .status(400)
                .json({ status: 'error', message: 'La contraseña debe tener al menos 8 caracteres.' });
            return;
        }
        let payload;
        try {
            payload = jsonwebtoken_1.default.verify(token, getJwtSecret(), { algorithms: ['HS512'] });
        }
        catch {
            res
                .status(400)
                .json({ status: 'error', message: 'Token de invitación expirado o inválido.' });
            return;
        }
        if (payload.action !== 'B2B_PORTAL_INVITE') {
            res.status(400).json({ status: 'error', message: 'Tipo de token inválido para activación.' });
            return;
        }
        const users = await (0, db_js_1.query)('SELECT id, email, role, full_name FROM users WHERE id = ? LIMIT 1', [payload.userId]);
        const user = users[0];
        if (!user) {
            res.status(404).json({ status: 'error', message: 'Usuario no encontrado.' });
            return;
        }
        const passwordHash = await bcryptjs_1.default.hash(password, 12);
        await (0, db_js_1.query)('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, user.id]);
        await (0, auditLogger_js_1.logSecurityEvent)(req, {
            eventType: 'CLIENT_INVITE_ACTIVATED',
            userId: user.id,
            status: 'SUCCESS',
            details: `B2B Client account activated for ${user.email}`,
        });
        const sessionToken = jsonwebtoken_1.default.sign({
            userId: user.id,
            uid: user.id,
            email: user.email,
            role: (user.role || 'CLIENT').toUpperCase(),
            name: user.full_name,
        }, getJwtSecret(), { algorithm: 'HS512', expiresIn: '24h' });
        res.cookie(exports.COOKIE_NAME, sessionToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });
        res.json({
            status: 'success',
            message: 'Cuenta activada y contraseña configurada exitosamente.',
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                full_name: user.full_name,
            },
        });
    }
    catch (err) {
        res.status(500).json({ status: 'error', message: err.message || 'Error al activar cuenta.' });
    }
});
