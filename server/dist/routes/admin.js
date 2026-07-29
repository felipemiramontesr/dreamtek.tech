"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminRouter = void 0;
const express_1 = require("express");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const db_js_1 = require("../db.js");
exports.adminRouter = (0, express_1.Router)();
const JWT_SECRET = process.env.JWT_SECRET || 'dreamtek_secret_jwt_key_2026';
const COOKIE_NAME = 'dreamtek_session';
/**
 * Middleware para requerir rol ADMIN.
 */
function requireAdmin(req, res, next) {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) {
        res.status(401).json({ status: 'error', message: 'No autenticado.' });
        return;
    }
    try {
        const payload = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        if (payload.role !== 'ADMIN') {
            res.status(403).json({ status: 'error', message: 'Acceso denegado. Se requiere rol ADMIN.' });
            return;
        }
        req.user = payload;
        next();
    }
    catch (_err) {
        res.status(401).json({ status: 'error', message: 'Sesión inválida.' });
    }
}
/**
 * GET /api/v1/admin/users (Read-Only list excluding password_hash)
 */
exports.adminRouter.get('/users', requireAdmin, async (_req, res) => {
    try {
        const sql = `
      SELECT id, email, role, full_name, phone, company, created_at, updated_at
      FROM users
      ORDER BY id ASC
    `;
        const users = await (0, db_js_1.query)(sql);
        res.json({ status: 'success', users });
    }
    catch (err) {
        res.status(500).json({ status: 'error', message: err.message || 'Error al listar usuarios.' });
    }
});
/**
 * GET /api/v1/admin/metrics (KPI Metrics)
 */
exports.adminRouter.get('/metrics', requireAdmin, async (_req, res) => {
    try {
        const totalUsers = await (0, db_js_1.query)('SELECT COUNT(*) AS total FROM users');
        const activeSubs = await (0, db_js_1.query)('SELECT COUNT(*) AS total FROM subscriptions WHERE status = "ACTIVE"');
        const totalRev = await (0, db_js_1.query)('SELECT COALESCE(SUM(total_amount), 0) AS total FROM orders WHERE status = "COMPLETED"');
        const openTickets = await (0, db_js_1.query)('SELECT COUNT(*) AS total FROM support_tickets WHERE status = "OPEN"');
        res.json({
            status: 'success',
            metrics: {
                total_users: Number(totalUsers[0].total),
                active_subscriptions: Number(activeSubs[0].total),
                total_revenue: Number(totalRev[0].total),
                open_tickets: Number(openTickets[0].total),
            },
        });
    }
    catch (err) {
        res.status(500).json({ status: 'error', message: err.message || 'Error al obtener métricas.' });
    }
});
