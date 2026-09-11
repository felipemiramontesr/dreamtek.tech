"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.taxInvoiceRateLimiter = exports.projectSettlementRateLimiter = exports.milestoneSignOffRateLimiter = exports.clientBriefingRateLimiter = exports.clientRouter = void 0;
exports.getArchonSsoSecret = getArchonSsoSecret;
const express_1 = require("express");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const crypto_1 = __importDefault(require("crypto"));
const db_js_1 = require("../db.js");
const auth_js_1 = require("../middleware/auth.js");
const project_schema_js_1 = require("../schemas/project.schema.js");
const handover_schema_js_1 = require("../schemas/handover.schema.js");
const crm_js_1 = require("../utils/crm.js");
const handoverVault_js_1 = require("../utils/handoverVault.js");
const checkout_js_1 = require("./checkout.js");
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
// Rate limiter for milestone sign-offs (FC 045 / C-045.5): 15 req/min per IP
exports.milestoneSignOffRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        status: 'error',
        error: 'Too Many Requests',
        message: 'Demasiadas solicitudes de visto bueno de hito. Intenta de nuevo en un momento.',
    },
});
// Rate limiter for project settlement sessions (FC 045 / C-045.5): 10 req/15 min per IP
exports.projectSettlementRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        status: 'error',
        error: 'Too Many Requests',
        message: 'Demasiadas solicitudes de liquidación de proyecto. Intenta de nuevo en un momento.',
    },
});
// Rate limiter for tax invoice requests (FC 046 / C-046.5): 15 req/min per IP
exports.taxInvoiceRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        status: 'error',
        error: 'Too Many Requests',
        message: 'Demasiadas solicitudes de facturación. Intenta de nuevo en un momento.',
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
                const milestones = await (0, db_js_1.query)(`SELECT id, project_id, milestone_index, title, description, target_week, status, completed_at, client_approved_at, client_feedback
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
        const milestones = await (0, db_js_1.query)(`SELECT id, project_id, milestone_index, title, description, target_week, status, completed_at, client_approved_at, client_feedback
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
 * POST /api/v1/client/projects/:id/milestones/:milestoneId/sign-off
 * Client formal sign-off on deliverable / milestone (FC 045 Phase 1 / Conditions C-045.1, C-045.2, C-045.5)
 */
exports.clientRouter.post('/projects/:id/milestones/:milestoneId/sign-off', exports.milestoneSignOffRateLimiter, async (req, res) => {
    try {
        const userId = req.user?.userId;
        const userRole = req.user?.role;
        const projectId = parseInt(req.params.id, 10);
        const milestoneId = parseInt(req.params.milestoneId, 10);
        if (isNaN(projectId) || projectId <= 0 || isNaN(milestoneId) || milestoneId <= 0) {
            res.status(400).json({ status: 'error', message: 'ID de proyecto o hito inválido.' });
            return;
        }
        const parsed = project_schema_js_1.milestoneSignOffSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({
                status: 'error',
                error: 'Validation Error',
                message: parsed.error.issues[0].message,
            });
            return;
        }
        // IDOR check: project belongs to user (C-045.1) or user is ADMIN
        const projectRows = await (0, db_js_1.query)('SELECT id, user_id, pending_balance_cents, status FROM client_projects WHERE id = ? LIMIT 1', [projectId]);
        if (!projectRows || projectRows.length === 0) {
            res.status(404).json({ status: 'error', message: 'Proyecto no encontrado.' });
            return;
        }
        const project = projectRows[0];
        if (project.user_id !== userId && userRole !== 'ADMIN') {
            res.status(403).json({
                status: 'error',
                message: 'No tienes permiso para aprobar hitos de este proyecto.',
            });
            return;
        }
        // Check milestone (C-045.2)
        const milestoneRows = await (0, db_js_1.query)('SELECT id, project_id, status FROM client_project_milestones WHERE id = ? AND project_id = ? LIMIT 1', [milestoneId, projectId]);
        if (!milestoneRows || milestoneRows.length === 0) {
            res.status(404).json({ status: 'error', message: 'Hito no encontrado en este proyecto.' });
            return;
        }
        const milestone = milestoneRows[0];
        if (milestone.status === 'COMPLETED') {
            res.status(400).json({
                status: 'error',
                message: 'El hito ya ha sido completado y aprobado previamente.',
            });
            return;
        }
        if (milestone.status !== 'REVIEW' && milestone.status !== 'IN_PROGRESS') {
            res.status(400).json({
                status: 'error',
                message: 'El hito debe estar en revisión o en progreso para otorgar visto bueno.',
            });
            return;
        }
        const safeFeedback = parsed.data.feedback ? (0, crm_js_1.escapeHtml)(parsed.data.feedback) : '';
        const clientIp = req.ip;
        await (0, db_js_1.withTransaction)(async (conn) => {
            await conn.query(`UPDATE client_project_milestones
           SET status = 'COMPLETED', completed_at = NOW(), client_approved_at = NOW(),
               client_approved_by = ?, client_feedback = ?, client_ip = ?
           WHERE id = ?`, [userId, safeFeedback, clientIp, milestoneId]);
            // Check if all milestones are completed
            const counts = await conn.query(`SELECT COUNT(*) as total, SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed
           FROM client_project_milestones WHERE project_id = ?`, [projectId]);
            const countsRow = counts[0];
            const total = Number(countsRow.total);
            const completed = Number(countsRow.completed);
            if (total > 0 && total === completed) {
                if (project.pending_balance_cents > 0) {
                    await conn.query("UPDATE client_projects SET status = 'SETTLEMENT_PENDING' WHERE id = ?", [projectId]);
                }
                else {
                    await conn.query("UPDATE client_projects SET status = 'COMPLETED_DELIVERED' WHERE id = ?", [projectId]);
                }
            }
        });
        console.log(`[SECURITY] MILESTONE_SIGNED_OFF: user ${userId} approved milestone ${milestoneId} of project ${projectId} from IP ${clientIp}`);
        res.json({
            status: 'success',
            message: 'Entregable aprobado con éxito.',
        });
    }
    catch (err) {
        res
            .status(500)
            .json({ status: 'error', message: err.message || 'Error al aprobar entregable.' });
    }
});
/**
 * POST /api/v1/client/projects/:id/settle-balance
 * Generates Stripe Checkout Session for final project settlement (FC 045 Phase 2 / Conditions C-045.1, C-045.3, C-045.5)
 */
exports.clientRouter.post('/projects/:id/settle-balance', exports.projectSettlementRateLimiter, async (req, res) => {
    try {
        const userId = req.user?.userId;
        const userRole = req.user?.role;
        const projectId = parseInt(req.params.id, 10);
        if (isNaN(projectId) || projectId <= 0) {
            res.status(400).json({ status: 'error', message: 'ID de proyecto inválido.' });
            return;
        }
        const projectRows = await (0, db_js_1.query)(`SELECT id, tenant_id, user_id, lead_id, project_name, currency, budget_cents,
                paid_amount_cents, pending_balance_cents, status
         FROM client_projects WHERE id = ? LIMIT 1`, [projectId]);
        if (!projectRows || projectRows.length === 0) {
            res.status(404).json({ status: 'error', message: 'Proyecto no encontrado.' });
            return;
        }
        const project = projectRows[0];
        if (project.user_id !== userId && userRole !== 'ADMIN') {
            res.status(403).json({
                status: 'error',
                message: 'No tienes permiso para liquidar este proyecto.',
            });
            return;
        }
        if (project.pending_balance_cents <= 0) {
            res.status(400).json({
                status: 'error',
                message: 'El proyecto no tiene saldo pendiente por liquidar.',
            });
            return;
        }
        const currentKey = process.env.STRIPE_SECRET_KEY || 'sk_test_mock';
        if (process.env.NODE_ENV === 'production' && (!currentKey || currentKey === 'sk_test_mock')) {
            res.status(503).json({
                status: 'error',
                message: 'Configuración de pasarela de pago Stripe no disponible en producción.',
            });
            return;
        }
        const stripeInstance = (0, checkout_js_1.getStripe)(currentKey);
        let session;
        if (currentKey === 'sk_test_mock' && !stripeInstance?.checkout?.sessions?.create) {
            const mockSessionId = `cs_test_settle_${Date.now()}_${projectId}`;
            session = {
                id: mockSessionId,
                url: `https://checkout.stripe.com/c/pay/${mockSessionId}`,
                expires_at: Math.floor(Date.now() / 1000) + 72 * 3600,
            };
        }
        else {
            const baseUrl = process.env.CORS_ORIGIN || process.env.FRONTEND_URL || 'https://dreamtek.tech';
            const userEmail = req.user?.email || 'client@dreamtek.tech';
            const currency = (project.currency || 'USD').toLowerCase();
            const stripeSession = await stripeInstance.checkout.sessions.create({
                payment_method_types: ['card'],
                customer_email: userEmail,
                client_reference_id: String(project.id),
                metadata: {
                    tenant_type: 'B2B_PROJECT_SETTLEMENT',
                    project_id: String(project.id),
                    lead_id: project.lead_id ? String(project.lead_id) : '',
                    tenant_id: String(project.tenant_id),
                },
                line_items: [
                    {
                        price_data: {
                            currency,
                            product_data: {
                                name: `Finiquito y Liquidación Final — ${project.project_name}`,
                                description: 'Liquidación final del 100% del balance de desarrollo y entrega de proyecto.',
                            },
                            unit_amount: project.pending_balance_cents,
                        },
                        quantity: 1,
                    },
                ],
                mode: 'payment',
                success_url: `${baseUrl}/client/dashboard?settlement=success&session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${baseUrl}/client/dashboard?settlement=cancelled`,
            });
            session = {
                id: stripeSession.id,
                url: stripeSession.url || '',
                expires_at: stripeSession.expires_at,
            };
        }
        // Persist PENDING row in lead_payments (Anti-TOCTOU Condition C-045.3)
        await (0, db_js_1.query)(`INSERT INTO lead_payments (project_id, lead_id, stripe_session_id, amount_cents, currency, payment_type, status, notes)
         VALUES (?, ?, ?, ?, ?, 'SETTLEMENT', 'PENDING', ?)`, [
            project.id,
            project.lead_id || null,
            session.id,
            project.pending_balance_cents,
            project.currency,
            `Liquidación final de proyecto ID ${project.id}`,
        ]);
        res.status(201).json({
            status: 'success',
            message: 'Sesión de finiquito generada con éxito.',
            checkout_url: session.url,
            session_id: session.id,
            amount_cents: project.pending_balance_cents,
            currency: project.currency,
        });
    }
    catch (err) {
        res.status(500).json({ status: 'error', message: err.message || 'Error al generar finiquito.' });
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
/**
 * GET /api/v1/client/projects/:id/handover
 * Fase 1 Handover Vault:
 * - Anti-IDOR: project.user_id === req.user.userId
 * - Fail-Closed: 403 unless project.status === 'COMPLETED_DELIVERED' and project.pending_balance_cents === 0
 * - Never returns decrypted credentials by default (Condition C-046.1)
 */
exports.clientRouter.get('/projects/:id/handover', async (req, res) => {
    try {
        const projectId = Number(req.params.id);
        const userId = req.user?.userId;
        const userRole = req.user?.role;
        if (!projectId || isNaN(projectId)) {
            res.status(400).json({ status: 'error', message: 'ID de proyecto inválido.' });
            return;
        }
        const projects = await (0, db_js_1.query)('SELECT id, user_id, status, pending_balance_cents FROM client_projects WHERE id = ? LIMIT 1', [projectId]);
        if (projects.length === 0) {
            res.status(404).json({ status: 'error', message: 'Proyecto no encontrado.' });
            return;
        }
        const project = projects[0];
        if (project.user_id !== userId && userRole !== 'ADMIN') {
            res.status(403).json({ status: 'error', message: 'Acceso no autorizado al proyecto.' });
            return;
        }
        if (project.status !== 'COMPLETED_DELIVERED' || project.pending_balance_cents > 0) {
            res.status(403).json({
                status: 'error',
                error: 'Forbidden',
                message: 'Bóveda de entrega bloqueada: el proyecto debe estar finalizado y con saldo completamente liquidado.',
            });
            return;
        }
        const handovers = await (0, db_js_1.query)('SELECT id, project_id, repository_url, deployment_url, documentation_url, handover_notes, certificate_sha256, access_credentials_encrypted, downloaded_at, download_count FROM client_project_handovers WHERE project_id = ? LIMIT 1', [projectId]);
        if (handovers.length === 0) {
            res.status(404).json({
                status: 'error',
                message: 'Bóveda de entrega no configurada aún por el equipo de ingeniería.',
            });
            return;
        }
        const row = handovers[0];
        res.json({
            status: 'success',
            handover: {
                project_id: row.project_id,
                repository_url: row.repository_url,
                deployment_url: row.deployment_url,
                documentation_url: row.documentation_url,
                handover_notes: row.handover_notes,
                certificate_sha256: row.certificate_sha256,
                has_credentials: Boolean(row.access_credentials_encrypted && row.access_credentials_encrypted.trim().length > 0),
                downloaded_at: row.downloaded_at,
                download_count: row.download_count,
            },
        });
    }
    catch (err) {
        res.status(500).json({ status: 'error', message: err.message || 'Error al consultar bóveda de entrega.' });
    }
});
/**
 * POST /api/v1/client/projects/:id/handover/reveal
 * Decrypts handover credentials on-demand with audit log (Condition C-046.1)
 */
exports.clientRouter.post('/projects/:id/handover/reveal', async (req, res) => {
    try {
        const projectId = Number(req.params.id);
        const userId = req.user?.userId;
        const userRole = req.user?.role;
        if (!projectId || isNaN(projectId)) {
            res.status(400).json({ status: 'error', message: 'ID de proyecto inválido.' });
            return;
        }
        const projects = await (0, db_js_1.query)('SELECT id, user_id, status, pending_balance_cents FROM client_projects WHERE id = ? LIMIT 1', [projectId]);
        if (projects.length === 0) {
            res.status(404).json({ status: 'error', message: 'Proyecto no encontrado.' });
            return;
        }
        const project = projects[0];
        if (project.user_id !== userId && userRole !== 'ADMIN') {
            res.status(403).json({ status: 'error', message: 'Acceso no autorizado al proyecto.' });
            return;
        }
        if (project.status !== 'COMPLETED_DELIVERED' || project.pending_balance_cents > 0) {
            res.status(403).json({
                status: 'error',
                error: 'Forbidden',
                message: 'Bóveda bloqueada: el proyecto debe estar finalizado y con saldo completamente liquidado.',
            });
            return;
        }
        const handovers = await (0, db_js_1.query)('SELECT access_credentials_encrypted FROM client_project_handovers WHERE project_id = ? LIMIT 1', [projectId]);
        if (handovers.length === 0 || !handovers[0].access_credentials_encrypted) {
            res.status(404).json({
                status: 'error',
                message: 'No existen credenciales configuradas para esta entrega.',
            });
            return;
        }
        const decrypted = (0, handoverVault_js_1.decryptVaultCredentials)(handovers[0].access_credentials_encrypted);
        console.log(JSON.stringify({
            event: 'HANDOVER_VAULT_REVEAL',
            project_id: projectId,
            user_id: userId,
            ip: req.ip,
            timestamp: new Date().toISOString(),
        }));
        res.json({
            status: 'success',
            credentials: decrypted,
        });
    }
    catch (err) {
        res.status(500).json({ status: 'error', message: err.message || 'Error al revelar credenciales de entrega.' });
    }
});
/**
 * GET /api/v1/client/projects/:id/settlement-certificate
 * Descarga y auditoría de la Constancia Oficial de Finiquito (Condition C-046.2)
 */
exports.clientRouter.get('/projects/:id/settlement-certificate', async (req, res) => {
    try {
        const projectId = Number(req.params.id);
        const userId = req.user?.userId;
        const userRole = req.user?.role;
        if (!projectId || isNaN(projectId)) {
            res.status(400).json({ status: 'error', message: 'ID de proyecto inválido.' });
            return;
        }
        const projects = await (0, db_js_1.query)('SELECT id, user_id, status, pending_balance_cents FROM client_projects WHERE id = ? LIMIT 1', [projectId]);
        if (projects.length === 0) {
            res.status(404).json({ status: 'error', message: 'Proyecto no encontrado.' });
            return;
        }
        const project = projects[0];
        if (project.user_id !== userId && userRole !== 'ADMIN') {
            res.status(403).json({ status: 'error', message: 'Acceso no autorizado al proyecto.' });
            return;
        }
        if (project.status !== 'COMPLETED_DELIVERED' || project.pending_balance_cents > 0) {
            res.status(403).json({
                status: 'error',
                error: 'Forbidden',
                message: 'Certificado bloqueado: requiere finiquito liquidado al 100%.',
            });
            return;
        }
        const handovers = await (0, db_js_1.query)('SELECT id, certificate_sha256, download_count FROM client_project_handovers WHERE project_id = ? LIMIT 1', [projectId]);
        if (handovers.length === 0) {
            res.status(404).json({ status: 'error', message: 'Certificado de finiquito no inicializado.' });
            return;
        }
        const handover = handovers[0];
        const paidPayments = await (0, db_js_1.query)('SELECT id, amount_cents, currency FROM lead_payments WHERE project_id = ? AND status = "PAID"', [projectId]);
        const certResult = (0, handoverVault_js_1.generateCanonicalCertificate)(project, paidPayments);
        await (0, db_js_1.query)('UPDATE client_project_handovers SET download_count = download_count + 1, downloaded_at = NOW() WHERE project_id = ?', [projectId]);
        res.json({
            status: 'success',
            certificate: {
                canonical_data: certResult.canonical_data,
                certificate_sha256: handover.certificate_sha256,
                downloaded_at: new Date().toISOString(),
                download_count: (handover.download_count || 0) + 1,
            },
        });
    }
    catch (err) {
        res.status(500).json({ status: 'error', message: err.message || 'Error al generar certificado de finiquito.' });
    }
});
/**
 * GET /api/v1/client/tax-profile
 * Consulta el expediente fiscal corporativo del cliente autenticado
 */
exports.clientRouter.get('/tax-profile', async (req, res) => {
    try {
        const userId = req.user?.userId;
        const profiles = await (0, db_js_1.query)('SELECT id, user_id, tenant_id, rfc, legal_name, tax_regime, cfdi_use, postal_code, invoice_email, created_at, updated_at FROM client_tax_profiles WHERE user_id = ? LIMIT 1', [userId]);
        if (profiles.length === 0) {
            res.json({ status: 'success', tax_profile: null });
            return;
        }
        res.json({ status: 'success', tax_profile: profiles[0] });
    }
    catch (err) {
        res.status(500).json({ status: 'error', message: err.message || 'Error al consultar perfil fiscal.' });
    }
});
/**
 * PUT /api/v1/client/tax-profile
 * Crea o actualiza el expediente fiscal con validación Zod y sanitización
 */
exports.clientRouter.put('/tax-profile', async (req, res) => {
    try {
        const userId = req.user?.userId;
        const userProjects = await (0, db_js_1.query)(`SELECT cp.tenant_id, cp.currency, l.locale 
         FROM client_projects cp 
         LEFT JOIN leads l ON cp.lead_id = l.id 
         WHERE cp.user_id = ? 
         ORDER BY cp.id DESC LIMIT 1`, [userId]);
        if (userProjects.length === 0 || !userProjects[0].tenant_id) {
            res.status(400).json({
                status: 'error',
                message: 'No se encontró un proyecto activo o tenant asociado para este usuario.',
            });
            return;
        }
        const tenantId = userProjects[0].tenant_id;
        const projectCurrency = (userProjects[0].currency || 'USD').toUpperCase();
        const projectLocale = (userProjects[0].locale || 'es').toLowerCase();
        const isDomestic = projectCurrency === 'MXN' || projectLocale === 'es';
        const isInternational = !isDomestic;
        const parseResult = handover_schema_js_1.clientTaxProfileSchema.safeParse({
            ...req.body,
            currency: projectCurrency,
            locale: projectLocale,
            is_international: isInternational,
            isInternational: isInternational,
        });
        if (!parseResult.success) {
            res.status(400).json({
                status: 'error',
                error: 'Validation Error',
                details: parseResult.error.errors,
            });
            return;
        }
        const data = parseResult.data;
        const safeLegalName = (0, crm_js_1.escapeHtml)(data.legal_name);
        await (0, db_js_1.query)(`INSERT INTO client_tax_profiles (user_id, tenant_id, rfc, legal_name, tax_regime, cfdi_use, postal_code, invoice_email)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           tenant_id = VALUES(tenant_id),
           rfc = VALUES(rfc),
           legal_name = VALUES(legal_name),
           tax_regime = VALUES(tax_regime),
           cfdi_use = VALUES(cfdi_use),
           postal_code = VALUES(postal_code),
           invoice_email = VALUES(invoice_email),
           updated_at = NOW()`, [
            userId,
            tenantId,
            data.rfc.toUpperCase(),
            safeLegalName,
            data.tax_regime,
            data.cfdi_use,
            data.postal_code,
            data.invoice_email.toLowerCase(),
        ]);
        const updated = await (0, db_js_1.query)('SELECT id, user_id, tenant_id, rfc, legal_name, tax_regime, cfdi_use, postal_code, invoice_email, created_at, updated_at FROM client_tax_profiles WHERE user_id = ? LIMIT 1', [userId]);
        res.json({
            status: 'success',
            message: 'Expediente fiscal actualizado con éxito.',
            tax_profile: updated[0],
        });
    }
    catch (err) {
        res.status(500).json({ status: 'error', message: err.message || 'Error al guardar perfil fiscal.' });
    }
});
/**
 * POST /api/v1/client/payments/:paymentId/request-invoice
 * Registra una solicitud de facturación vinculada a un pago liquidado
 */
exports.clientRouter.post('/payments/:paymentId/request-invoice', exports.taxInvoiceRateLimiter, async (req, res) => {
    try {
        const paymentId = Number(req.params.paymentId);
        const userId = req.user?.userId;
        const userRole = req.user?.role;
        if (!paymentId || isNaN(paymentId)) {
            res.status(400).json({ status: 'error', message: 'ID de pago inválido.' });
            return;
        }
        const parseResult = handover_schema_js_1.requestInvoiceSchema.safeParse(req.body);
        if (!parseResult.success) {
            res.status(400).json({
                status: 'error',
                error: 'Validation Error',
                details: parseResult.error.errors,
            });
            return;
        }
        const profiles = await (0, db_js_1.query)('SELECT id FROM client_tax_profiles WHERE user_id = ? LIMIT 1', [userId]);
        if (profiles.length === 0) {
            res.status(400).json({
                status: 'error',
                error: 'Missing Tax Profile',
                message: 'Debe configurar primero su expediente fiscal en el portal antes de solicitar facturación.',
            });
            return;
        }
        const taxProfileId = profiles[0].id;
        const payments = await (0, db_js_1.query)(`SELECT lp.id, lp.project_id, lp.lead_id, lp.status, lp.amount_cents, lp.currency,
                cp.user_id AS project_user_id
         FROM lead_payments lp
         LEFT JOIN client_projects cp ON lp.project_id = cp.id
         WHERE lp.id = ? LIMIT 1`, [paymentId]);
        if (payments.length === 0) {
            res.status(404).json({ status: 'error', message: 'Pago no encontrado.' });
            return;
        }
        const payment = payments[0];
        if (userRole !== 'ADMIN' && payment.project_user_id !== userId) {
            const userRows = await (0, db_js_1.query)('SELECT email FROM users WHERE id = ? LIMIT 1', [userId]);
            const userEmail = userRows[0]?.email;
            const leadRows = await (0, db_js_1.query)('SELECT id FROM leads WHERE id = ? AND email = ? LIMIT 1', [
                payment.lead_id,
                userEmail,
            ]);
            if (leadRows.length === 0) {
                res.status(403).json({ status: 'error', message: 'Acceso no autorizado al comprobante de pago.' });
                return;
            }
        }
        if (payment.status !== 'PAID') {
            res.status(400).json({
                status: 'error',
                message: 'Solo es posible solicitar facturación sobre pagos completados y confirmados (estado PAID).',
            });
            return;
        }
        const existing = await (0, db_js_1.query)('SELECT id, status, cfdi_uuid FROM tax_invoice_requests WHERE payment_id = ? LIMIT 1', [paymentId]);
        if (existing.length > 0) {
            res.status(409).json({
                status: 'error',
                error: 'Conflict',
                message: 'Ya existe una solicitud de factura registrada para este pago.',
                invoice_request: existing[0],
            });
            return;
        }
        const safeNotes = parseResult.data.invoice_notes ? (0, crm_js_1.escapeHtml)(parseResult.data.invoice_notes) : null;
        const result = await (0, db_js_1.query)(`INSERT INTO tax_invoice_requests (payment_id, project_id, tax_profile_id, status, invoice_notes)
         VALUES (?, ?, ?, 'REQUESTED', ?)`, [paymentId, payment.project_id || null, taxProfileId, safeNotes]);
        res.status(201).json({
            status: 'success',
            message: 'Solicitud de factura registrada exitosamente.',
            request_id: result.insertId,
        });
    }
    catch (err) {
        res.status(500).json({ status: 'error', message: err.message || 'Error al registrar solicitud de factura.' });
    }
});
