"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.clientBriefingRateLimiter = exports.clientRouter = void 0;
exports.getArchonSsoSecret = getArchonSsoSecret;
const express_1 = require("express");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const crypto_1 = __importDefault(require("crypto"));
const db_js_1 = require("../db.js");
const auth_js_1 = require("../middleware/auth.js");
const project_schema_js_1 = require("../schemas/project.schema.js");
const crm_js_1 = require("../utils/crm.js");
exports.clientRouter = (0, express_1.Router)();
// Rate limiter for briefing updates (15 req/min per IP)
exports.clientBriefingRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        status: 'error',
        error: 'Too Many Requests',
        message: 'Demasiadas solicitudes de actualización de briefing. Intenta de nuevo en un momento.',
    },
});
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
        // Query client projects and milestones (FC 044 / Condition C-044)
        let projects = [];
        try {
            const projectRows = await (0, db_js_1.query)(`SELECT id, tenant_id, user_id, lead_id, project_name, vertical, status,
                currency, budget_cents, paid_amount_cents, pending_balance_cents,
                estimated_weeks, briefing_data, staging_url, repository_url,
                created_at, updated_at
         FROM client_projects
         WHERE user_id = ?
         ORDER BY created_at DESC`, [userId]);
            for (const proj of projectRows) {
                const milestones = await (0, db_js_1.query)(`SELECT id, project_id, milestone_index, title, description, target_week, status, completed_at
           FROM client_project_milestones
           WHERE project_id = ?
           ORDER BY milestone_index ASC`, [proj.id]).catch(() => []);
                const completedCount = milestones.filter((m) => m.status === 'COMPLETED').length;
                const progressPercent = milestones.length > 0 ? Math.round((completedCount / milestones.length) * 100) : 0;
                let parsedBriefing = null;
                if (proj.briefing_data) {
                    try {
                        parsedBriefing =
                            typeof proj.briefing_data === 'string'
                                ? JSON.parse(proj.briefing_data)
                                : proj.briefing_data;
                    }
                    catch {
                        parsedBriefing = proj.briefing_data;
                    }
                }
                projects.push({
                    ...proj,
                    briefing_data: parsedBriefing,
                    milestones,
                    progress_percent: progressPercent,
                });
            }
        }
        catch (projErr) {
            console.error('⚠️ client_projects DB query warning:', projErr?.message || projErr);
            projects = [];
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
            projects,
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
 * GET /api/v1/client/projects/:id
 * Anti-IDOR: Returns B2B project detail with milestones and progress (Condition C-044.7)
 */
exports.clientRouter.get('/projects/:id', async (req, res) => {
    try {
        const userId = req.user?.userId;
        const projectId = parseInt(req.params.id, 10);
        if (isNaN(projectId) || projectId <= 0) {
            res.status(400).json({ status: 'error', message: 'ID de proyecto inválido.' });
            return;
        }
        const projectRows = await (0, db_js_1.query)(`SELECT id, tenant_id, user_id, lead_id, project_name, vertical, status,
              currency, budget_cents, paid_amount_cents, pending_balance_cents,
              estimated_weeks, briefing_data, staging_url, repository_url,
              created_at, updated_at
       FROM client_projects
       WHERE id = ? AND user_id = ?
       LIMIT 1`, [projectId, userId]);
        if (!projectRows || projectRows.length === 0) {
            res
                .status(404)
                .json({ status: 'error', error: 'Not Found', message: 'Proyecto no encontrado.' });
            return;
        }
        const proj = projectRows[0];
        const milestones = await (0, db_js_1.query)(`SELECT id, project_id, milestone_index, title, description, target_week, status, completed_at
       FROM client_project_milestones
       WHERE project_id = ?
       ORDER BY milestone_index ASC`, [proj.id]).catch(() => []);
        const completedCount = milestones.filter((m) => m.status === 'COMPLETED').length;
        const progressPercent = milestones.length > 0 ? Math.round((completedCount / milestones.length) * 100) : 0;
        let parsedBriefing = null;
        if (proj.briefing_data) {
            try {
                parsedBriefing =
                    typeof proj.briefing_data === 'string'
                        ? JSON.parse(proj.briefing_data)
                        : proj.briefing_data;
            }
            catch {
                parsedBriefing = proj.briefing_data;
            }
        }
        res.json({
            status: 'success',
            project: {
                ...proj,
                briefing_data: parsedBriefing,
                milestones,
                progress_percent: progressPercent,
            },
        });
    }
    catch (err) {
        res
            .status(500)
            .json({ status: 'error', message: err.message || 'Error al consultar proyecto.' });
    }
});
/**
 * PUT /api/v1/client/projects/:id/briefing
 * Anti-IDOR + Anti-XSS: Updates briefing data (Conditions C-044.4, C-044.7, OWASP A03)
 */
exports.clientRouter.put('/projects/:id/briefing', exports.clientBriefingRateLimiter, async (req, res) => {
    try {
        const userId = req.user?.userId;
        const projectId = parseInt(req.params.id, 10);
        if (isNaN(projectId) || projectId <= 0) {
            res.status(400).json({ status: 'error', message: 'ID de proyecto inválido.' });
            return;
        }
        // Check project existence & ownership (Anti-IDOR)
        const projectRows = await (0, db_js_1.query)('SELECT id, status FROM client_projects WHERE id = ? AND user_id = ? LIMIT 1', [projectId, userId]);
        if (!projectRows || projectRows.length === 0) {
            res
                .status(404)
                .json({ status: 'error', error: 'Not Found', message: 'Proyecto no encontrado.' });
            return;
        }
        const parsed = project_schema_js_1.clientBriefingSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({
                status: 'error',
                error: 'Validation Error',
                details: parsed.error.format(),
            });
            return;
        }
        const { business_goals, target_audience, technical_stack_preferences, infrastructure_notes, reference_urls, contact_lead_notes, } = parsed.data;
        // Sanitización anti-XSS (C-044 / A03)
        const sanitizedBriefing = {
            business_goals: (0, crm_js_1.escapeHtml)(business_goals),
            target_audience: (0, crm_js_1.escapeHtml)(target_audience || ''),
            technical_stack_preferences: (0, crm_js_1.escapeHtml)(technical_stack_preferences || ''),
            infrastructure_notes: (0, crm_js_1.escapeHtml)(infrastructure_notes || ''),
            reference_urls,
            contact_lead_notes: (0, crm_js_1.escapeHtml)(contact_lead_notes || ''),
            submitted_at: new Date().toISOString(),
        };
        const currentStatus = projectRows[0].status;
        const newStatus = currentStatus === 'ONBOARDING_BRIEF' ? 'ARCHITECTURE_DESIGN' : currentStatus;
        await (0, db_js_1.query)(`UPDATE client_projects
         SET briefing_data = ?, status = ?, updated_at = NOW()
         WHERE id = ? AND user_id = ?`, [JSON.stringify(sanitizedBriefing), newStatus, projectId, userId]);
        res.json({
            status: 'success',
            message: 'Briefing técnico actualizado con éxito.',
            briefing: sanitizedBriefing,
            status_updated: newStatus,
        });
    }
    catch (err) {
        res
            .status(500)
            .json({ status: 'error', message: err.message || 'Error al actualizar el briefing.' });
    }
});
/**
 * POST /api/v1/client/sso/archon
 * Generates an HMAC-SHA256 signed access link for ARCHON ERP Fleet Management
 * Condition C-038: dedicated ARCHON_SSO_SECRET, 300s TTL, strict allowlist against open-redirect
 */
function getArchonSsoSecret() {
    const secret = process.env.ARCHON_SSO_SECRET;
    if (!secret) {
        if (process.env.NODE_ENV === 'production') {
            throw new Error('ARCHON_SSO_SECRET must be explicitly set in production');
        }
        return 'dreamtek_archon_hmac_secret_2026';
    }
    return secret;
}
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
        const secret = getArchonSsoSecret();
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
