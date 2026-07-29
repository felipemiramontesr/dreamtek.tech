"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.clientRouter = void 0;
const express_1 = require("express");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const db_js_1 = require("../db.js");
exports.clientRouter = (0, express_1.Router)();
const JWT_SECRET = process.env.JWT_SECRET || 'dreamtek_secret_jwt_key_2026';
const COOKIE_NAME = 'dreamtek_session';
/**
 * Middleware para validar autenticación y extraer usuario.
 */
function requireAuth(req, res, next) {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) {
        res.status(401).json({ status: 'error', message: 'Acceso no autorizado. Inicia sesión.' });
        return;
    }
    try {
        const payload = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        req.user = payload;
        next();
    }
    catch (_err) {
        res.status(401).json({ status: 'error', message: 'Sesión expirada o inválida.' });
    }
}
/**
 * GET /api/v1/client/sites
 * Devuelve los sitios del cliente autenticado usando la unión canónica:
 * sites ⋈ subscriptions ⋈ users WHERE sub.user_id = :uid
 */
exports.clientRouter.get('/sites', requireAuth, async (req, res) => {
    try {
        const userId = req.user.uid;
        const sql = `
      SELECT 
        s.id AS site_id,
        s.domain_name,
        s.template_id,
        s.status AS site_status,
        sub.status AS subscription_status,
        sub.plan_name,
        sub.billing_cycle
      FROM sites s
      INNER JOIN subscriptions sub ON s.subscription_id = sub.id
      WHERE sub.user_id = ?
      ORDER BY s.created_at DESC
    `;
        const sites = await (0, db_js_1.query)(sql, [userId]);
        res.json({ status: 'success', sites });
    }
    catch (err) {
        res.status(500).json({ status: 'error', message: err.message || 'Error al obtener sitios.' });
    }
});
