"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clientRouter = void 0;
const express_1 = require("express");
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
