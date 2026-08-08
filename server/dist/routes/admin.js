"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminRouter = void 0;
const express_1 = require("express");
const db_js_1 = require("../db.js");
const auth_js_1 = require("../middleware/auth.js");
exports.adminRouter = (0, express_1.Router)();
// Protect all admin routes with requireAuth and requireRole('ADMIN') (Condition C-M1)
exports.adminRouter.use(auth_js_1.requireAuth);
exports.adminRouter.use((0, auth_js_1.requireRole)(['ADMIN']));
/**
 * GET /api/v1/admin/leads
 * Returns list of onboarding leads (Condition C-M3)
 */
exports.adminRouter.get('/leads', async (_req, res) => {
    try {
        const leads = await (0, db_js_1.query)('SELECT * FROM leads ORDER BY created_at DESC LIMIT 100').catch(() => []);
        res.json({
            status: 'success',
            total: leads.length,
            leads,
        });
    }
    catch (err) {
        res.status(500).json({ status: 'error', message: err.message || 'Error al consultar prospectos.' });
    }
});
/**
 * GET /api/v1/admin/audit-logs
 * Returns paginated security audit logs omitting plain secrets (Condition C-M6)
 */
exports.adminRouter.get('/audit-logs', async (req, res) => {
    try {
        const page = parseInt(req.query.page || '1', 10);
        const limit = parseInt(req.query.limit || '20', 10);
        const offset = (page - 1) * limit;
        const logs = await (0, db_js_1.query)('SELECT id, event_type, ip_address, user_agent, payload_sha256, created_at FROM security_audit_logs ORDER BY id DESC LIMIT ? OFFSET ?', [limit, offset]).catch(() => []);
        const countResult = await (0, db_js_1.query)('SELECT COUNT(*) as total FROM security_audit_logs').catch(() => [{ total: 0 }]);
        const total = countResult[0]?.total || 0;
        res.json({
            status: 'success',
            page,
            limit,
            total,
            logs,
        });
    }
    catch (err) {
        res.status(500).json({ status: 'error', message: err.message || 'Error al consultar logs de auditoría.' });
    }
});
/**
 * GET /api/v1/admin/metrics
 * Returns system administrative metrics (Condition C-M3)
 */
exports.adminRouter.get('/metrics', async (_req, res) => {
    try {
        const leadsCount = await (0, db_js_1.query)('SELECT COUNT(*) as total FROM leads').catch(() => [{ total: 0 }]);
        const usersCount = await (0, db_js_1.query)('SELECT COUNT(*) as total FROM users').catch(() => [{ total: 0 }]);
        res.json({
            status: 'success',
            metrics: {
                total_leads: leadsCount[0]?.total || 0,
                total_users: usersCount[0]?.total || 0,
                uptime_seconds: process.uptime(),
                timestamp: Date.now(),
            },
        });
    }
    catch (err) {
        res.status(500).json({ status: 'error', message: err.message || 'Error al consultar métricas.' });
    }
});
