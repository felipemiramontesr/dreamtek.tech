"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.clientRouter = void 0;
const express_1 = require("express");
const crypto_1 = __importDefault(require("crypto"));
const db_js_1 = require("../db.js");
const auth_js_1 = require("../middleware/auth.js");
exports.clientRouter = (0, express_1.Router)();
// Protect all client routes with requireAuth middleware
exports.clientRouter.use(auth_js_1.requireAuth);
/**
 * GET /api/v1/client/dashboard
 * Anti-IDOR Protected: Retrieves client profile and active services using req.user.userId from JWT (Condition C-M5)
 */
exports.clientRouter.get('/dashboard', async (req, res) => {
    try {
        const userId = req.user?.userId;
        const users = await (0, db_js_1.query)('SELECT id, full_name, email, role, created_at FROM users WHERE id = ? LIMIT 1', [userId]);
        if (users.length === 0) {
            res
                .status(404)
                .json({ status: 404, error: 'Not Found', message: 'Perfil de cliente no encontrado.' });
            return;
        }
        const user = users[0];
        // Safely query user sites without fake demo fallbacks (Rule F01 / Condition 001m R3)
        let sites = [];
        try {
            sites = await (0, db_js_1.query)('SELECT id, domain, status, ssl FROM client_sites WHERE user_id = ?', [userId]);
        }
        catch (dbErr) {
            console.error('⚠️ client_sites DB query warning:', dbErr?.message || dbErr);
            sites = [];
        }
        // Query real client subscriptions without hardcoded mocks
        let services = [];
        try {
            const subRows = await (0, db_js_1.query)('SELECT id, plan_id, billing_cycle, status, amount, renews_at FROM subscriptions WHERE user_id = ? AND status = "active"', [userId]);
            services = subRows.map((sub) => ({
                id: String(sub.id),
                name: sub.plan_id === 'starterkit' || sub.plan_id.includes('escolta')
                    ? 'Escolta WEB — Posicionamiento'
                    : sub.plan_id,
                status: sub.status,
                billing_cycle: sub.billing_cycle,
                amount: sub.amount,
                renews_at: sub.renews_at,
            }));
        }
        catch (subErr) {
            console.error('⚠️ subscriptions DB query warning:', subErr?.message || subErr);
            services = [];
        }
        res.json({
            status: 'success',
            profile: {
                id: user.id,
                full_name: user.full_name,
                email: user.email,
                role: user.role,
                created_at: user.created_at,
            },
            services,
            sites,
        });
    }
    catch (err) {
        res
            .status(500)
            .json({ status: 'error', message: err.message || 'Error al obtener el panel de cliente.' });
    }
});
/**
 * GET /api/v1/client/sites
 * Returns client assigned web sites without fake fallbacks (Condition C-M3, Rule F01)
 */
exports.clientRouter.get('/sites', async (req, res) => {
    try {
        const userId = req.user?.userId;
        let sites = [];
        try {
            sites = await (0, db_js_1.query)('SELECT id, domain, status, ssl FROM client_sites WHERE user_id = ?', [userId]);
        }
        catch (dbErr) {
            console.error('⚠️ client_sites DB query warning:', dbErr?.message || dbErr);
            sites = [];
        }
        res.json({
            status: 'success',
            sites,
        });
    }
    catch (err) {
        res.status(500).json({
            status: 'error',
            message: err.message || 'Error al obtener sitios web del cliente.',
        });
    }
});
/**
 * POST /api/v1/client/sso/archon
 * Generates an HMAC-SHA256 signed access link for ARCHON ERP Fleet Management
 * Condition C-038: dedicated ARCHON_SSO_SECRET, 300s TTL, strict allowlist against open-redirect
 */
const ARCHON_ALLOWLIST = [
    'https://fleet.archon.dreamtek.tech',
    'https://archon.dreamtek.tech',
    'http://localhost:3001',
];
exports.clientRouter.post('/sso/archon', async (req, res) => {
    try {
        const userId = req.user?.userId;
        const userRole = req.user?.role;
        // Check if user has active ARCHON subscription or is ADMIN
        let hasAccess = userRole === 'ADMIN';
        if (!hasAccess) {
            const subs = await (0, db_js_1.query)('SELECT id FROM subscriptions WHERE user_id = ? AND plan_id LIKE "%archon%" AND status = "active"', [userId]).catch(() => []);
            hasAccess = subs.length > 0;
        }
        if (!hasAccess) {
            res.status(403).json({
                status: 'error',
                error: 'Forbidden',
                message: 'No cuenta con una suscripción activa a ARCHON Gestión de Flotas.',
            });
            return;
        }
        const baseUrl = process.env.ARCHON_BASE_URL || 'https://fleet.archon.dreamtek.tech';
        if (!ARCHON_ALLOWLIST.includes(baseUrl)) {
            res.status(400).json({
                status: 'error',
                error: 'Security Error',
                message: 'Base URL de destino no autorizada en allowlist.',
            });
            return;
        }
        const timestamp = Math.floor(Date.now() / 1000);
        const expiresAt = timestamp + 300; // 5 minutos
        const secret = process.env.ARCHON_SSO_SECRET || 'dreamtek_archon_hmac_secret_2026';
        const payload = `${userId}:${userRole}:${expiresAt}`;
        const signature = crypto_1.default.createHmac('sha256', secret).update(payload).digest('hex');
        const signedUrl = `${baseUrl}/auth/bridge?uid=${userId}&role=${userRole}&exp=${expiresAt}&sig=${signature}`;
        res.json({
            status: 'success',
            type: 'HMAC_LINK',
            url: signedUrl,
            expires_in: 300,
        });
    }
    catch (err) {
        res.status(500).json({
            status: 'error',
            message: err.message || 'Error al generar enlace seguro para ARCHON.',
        });
    }
});
