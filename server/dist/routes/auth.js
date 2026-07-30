"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRouter = void 0;
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const db_js_1 = require("../db.js");
exports.authRouter = (0, express_1.Router)();
const JWT_SECRET = process.env.JWT_SECRET || 'dreamtek_secret_jwt_key_2026';
const COOKIE_NAME = 'dreamtek_session';
/**
 * POST /api/v1/auth/login
 */
exports.authRouter.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            res.status(400).json({ status: 'error', message: 'Email y contraseña requeridos.' });
            return;
        }
        const users = await (0, db_js_1.query)('SELECT id, email, password_hash, role, full_name FROM users WHERE email = ? LIMIT 1', [email]);
        const user = users[0];
        if (!user || !(await bcryptjs_1.default.compare(password, user.password_hash))) {
            res.status(401).json({ status: 'error', message: 'Credenciales inválidas.' });
            return;
        }
        const token = jsonwebtoken_1.default.sign({ uid: user.id, email: user.email, role: user.role, name: user.full_name }, JWT_SECRET, { algorithm: 'HS512', expiresIn: '7d' });
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
                email: user.email,
                role: user.role,
                full_name: user.full_name,
            },
        });
    }
    catch (err) {
        res.status(500).json({ status: 'error', message: err.message || 'Error interno de autenticación.' });
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
        const payload = jsonwebtoken_1.default.verify(token, JWT_SECRET, { algorithms: ['HS512'] });
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
