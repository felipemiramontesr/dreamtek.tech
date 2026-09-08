"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRouter = void 0;
exports.getJwtSecret = getJwtSecret;
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const db_js_1 = require("../db.js");
const auditLogger_js_1 = require("../middleware/auditLogger.js");
const validate_js_1 = require("../middleware/validate.js");
const auth_schema_js_1 = require("../schemas/auth.schema.js");
function getJwtSecret() {
    if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
        throw new Error('FATAL SECURITY ERROR: JWT_SECRET environment variable is missing in production.');
    }
    return process.env.JWT_SECRET || 'dreamtek_dev_jwt_secret_key_2026';
}
exports.authRouter = (0, express_1.Router)();
const COOKIE_NAME = 'dreamtek_session';
/**
 * POST /api/v1/auth/login
 */
exports.authRouter.post('/login', (0, validate_js_1.validate)(auth_schema_js_1.loginSchema), async (req, res) => {
    try {
        const { email, password } = req.body;
        const identifier = String(email || '').trim();
        if (!identifier || !password) {
            res.status(400).json({ status: 'error', message: 'Email y contraseña requeridos.' });
            return;
        }
        const users = await (0, db_js_1.query)('SELECT id, username, email, password_hash, role, full_name FROM users WHERE (email = ? OR username = ?) LIMIT 1', [identifier, identifier]);
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
        res.cookie(COOKIE_NAME, token, {
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
    catch (err) {
        res
            .status(500)
            .json({ status: 'error', message: err.message || 'Error interno de autenticación.' });
    }
});
/**
 * POST /api/v1/auth/logout
 */
exports.authRouter.post('/logout', (_req, res) => {
    res.clearCookie(COOKIE_NAME);
    res.json({ status: 'success', message: 'Sesión cerrada exitosamente.' });
});
/**
 * GET /api/v1/auth/me
 */
exports.authRouter.get('/me', async (req, res) => {
    try {
        const token = req.cookies?.[COOKIE_NAME];
        if (!token) {
            res.status(401).json({ status: 'error', message: 'No autenticado.' });
            return;
        }
        const payload = jsonwebtoken_1.default.verify(token, getJwtSecret(), { algorithms: ['HS512'] });
        const users = await (0, db_js_1.query)('SELECT id, email, role, full_name FROM users WHERE id = ? LIMIT 1', [payload.uid]);
        const user = users[0];
        if (!user) {
            res.status(401).json({ status: 'error', message: 'Usuario no encontrado.' });
            return;
        }
        res.json({ status: 'success', user });
    }
    catch (_err) {
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
        });
    }
    catch (_err) {
        res.status(400).json({ status: 'error', valid: false, message: 'Token expirado o inválido.' });
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
        catch (_err) {
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
        res.cookie(COOKIE_NAME, sessionToken, {
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
