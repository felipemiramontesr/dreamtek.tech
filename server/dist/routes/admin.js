"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.leadEmailRateLimiter = exports.getAdminEmailClientKey = exports.adminRouter = void 0;
const express_1 = require("express");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const db_js_1 = require("../db.js");
const auth_js_1 = require("../middleware/auth.js");
const crm_schema_js_1 = require("../schemas/crm.schema.js");
const crm_js_1 = require("../utils/crm.js");
const contact_js_1 = require("./contact.js");
exports.adminRouter = (0, express_1.Router)();
const getAdminEmailClientKey = (req) => {
    const authReq = req;
    if (authReq.user?.userId) {
        return `admin_${authReq.user.userId}`;
    }
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
        return forwarded.split(',')[0].trim();
    }
    if (req.socket?.remoteAddress) {
        return req.socket.remoteAddress;
    }
    return '127.0.0.1';
};
exports.getAdminEmailClientKey = getAdminEmailClientKey;
// Rate limiter for sending lead follow-up emails (Condition C-041.4): 10 req/min per admin/IP
exports.leadEmailRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => (0, exports.getAdminEmailClientKey)(req),
    message: {
        status: 'error',
        error: 'Too Many Requests',
        message: 'Límite de envío de correos alcanzado (máximo 10 por minuto). Intenta más tarde.',
    },
});
// Protect all admin routes with requireAuth and requireRole('ADMIN') (Condition C-M1)
exports.adminRouter.use(auth_js_1.requireAuth);
exports.adminRouter.use((0, auth_js_1.requireRole)(['ADMIN']));
/**
 * GET /api/v1/admin/leads
 * Returns filtered and searched list of leads (FC 041 rev-2)
 */
exports.adminRouter.get('/leads', async (req, res) => {
    try {
        const { status, vertical, search } = req.query;
        let sql = `SELECT id, email, full_name, phone, company, status, assigned_to, last_contacted_at,
                      project_vertical, complexity_level, estimated_budget_min, estimated_budget_max,
                      estimated_weeks_min, estimated_weeks_max, created_at, updated_at
               FROM leads WHERE 1=1`;
        const params = [];
        if (status && typeof status === 'string' && status.trim() !== '' && status !== 'ALL') {
            sql += ' AND status = ?';
            params.push(status.trim());
        }
        if (vertical && typeof vertical === 'string' && vertical.trim() !== '' && vertical !== 'ALL') {
            sql += ' AND project_vertical = ?';
            params.push(vertical.trim());
        }
        if (search && typeof search === 'string' && search.trim().length > 0) {
            const escaped = `%${(0, crm_js_1.escapeLikeWildcards)(search.trim())}%`;
            sql += ' AND (email LIKE ? OR full_name LIKE ? OR company LIKE ?)';
            params.push(escaped, escaped, escaped);
        }
        sql += ' ORDER BY created_at DESC LIMIT 100';
        const leads = await (0, db_js_1.query)(sql, params).catch(() => []);
        res.json({
            status: 'success',
            total: leads.length,
            leads,
        });
    }
    catch (err) {
        res
            .status(500)
            .json({ status: 'error', message: err.message || 'Error al consultar prospectos.' });
    }
});
/**
 * GET /api/v1/admin/leads/:id
 * Returns a specific lead with its complete activity timeline
 */
exports.adminRouter.get('/leads/:id', async (req, res) => {
    try {
        const leadId = parseInt(req.params.id, 10);
        if (isNaN(leadId) || leadId <= 0) {
            res.status(400).json({ status: 'error', message: 'ID de prospecto inválido.' });
            return;
        }
        const leadRows = await (0, db_js_1.query)('SELECT * FROM leads WHERE id = ?', [leadId]);
        if (!leadRows || leadRows.length === 0) {
            res.status(404).json({ status: 'error', message: 'Prospecto no encontrado.' });
            return;
        }
        const lead = leadRows[0];
        const activities = await (0, db_js_1.query)(`SELECT la.id, la.lead_id, la.user_id, la.activity_type, la.title, la.details, la.created_at,
              u.full_name as author_name, u.username as author_username
       FROM lead_activities la
       LEFT JOIN users u ON la.user_id = u.id
       WHERE la.lead_id = ?
       ORDER BY la.created_at DESC`, [leadId]);
        res.json({
            status: 'success',
            lead: {
                ...lead,
                activities,
            },
        });
    }
    catch (err) {
        res
            .status(500)
            .json({ status: 'error', message: err.message || 'Error al consultar expediente de prospecto.' });
    }
});
/**
 * PATCH /api/v1/admin/leads/:id/status
 * Updates lead status and logs STATUS_CHANGE in lead_activities
 */
exports.adminRouter.patch('/leads/:id/status', async (req, res) => {
    try {
        const leadId = parseInt(req.params.id, 10);
        if (isNaN(leadId) || leadId <= 0) {
            res.status(400).json({ status: 'error', message: 'ID de prospecto inválido.' });
            return;
        }
        const parseResult = crm_schema_js_1.updateLeadStatusSchema.safeParse(req.body);
        if (!parseResult.success) {
            const errorMsg = parseResult.error.errors.map((e) => e.message).join(', ');
            res.status(400).json({ status: 'error', error: 'Validation Error', message: errorMsg });
            return;
        }
        const { status: newStatus, note } = parseResult.data;
        const leadRows = await (0, db_js_1.query)('SELECT id, status, full_name, email FROM leads WHERE id = ?', [leadId]);
        if (!leadRows || leadRows.length === 0) {
            res.status(404).json({ status: 'error', message: 'Prospecto no encontrado.' });
            return;
        }
        const previousStatus = leadRows[0].status;
        // Update lead status
        await (0, db_js_1.query)('UPDATE leads SET status = ?, last_contacted_at = NOW(), updated_at = NOW() WHERE id = ?', [newStatus, leadId]);
        // Insert activity record
        const noteDetail = note ? ` Nota: ${(0, crm_js_1.escapeHtml)(note)}` : '';
        await (0, db_js_1.query)(`INSERT INTO lead_activities (lead_id, user_id, activity_type, title, details)
       VALUES (?, ?, 'STATUS_CHANGE', ?, ?)`, [
            leadId,
            req.user.userId,
            `Transición a ${newStatus}`,
            `Estado actualizado de ${previousStatus || 'NEW'} a ${newStatus}.${noteDetail}`,
        ]);
        res.json({
            status: 'success',
            message: 'Estado del prospecto actualizado con éxito.',
            previous_status: previousStatus,
            new_status: newStatus,
        });
    }
    catch (err) {
        res
            .status(500)
            .json({ status: 'error', message: err.message || 'Error al actualizar estado del prospecto.' });
    }
});
/**
 * POST /api/v1/admin/leads/:id/activities
 * Registers a manual note, call log, or meeting in lead_activities
 */
exports.adminRouter.post('/leads/:id/activities', async (req, res) => {
    try {
        const leadId = parseInt(req.params.id, 10);
        if (isNaN(leadId) || leadId <= 0) {
            res.status(400).json({ status: 'error', message: 'ID de prospecto inválido.' });
            return;
        }
        const parseResult = crm_schema_js_1.createLeadActivitySchema.safeParse(req.body);
        if (!parseResult.success) {
            const errorMsg = parseResult.error.errors.map((e) => e.message).join(', ');
            res.status(400).json({ status: 'error', error: 'Validation Error', message: errorMsg });
            return;
        }
        const { activity_type, title, details } = parseResult.data;
        const leadRows = await (0, db_js_1.query)('SELECT id FROM leads WHERE id = ?', [leadId]);
        if (!leadRows || leadRows.length === 0) {
            res.status(404).json({ status: 'error', message: 'Prospecto no encontrado.' });
            return;
        }
        const sanitizedDetails = details ? (0, crm_js_1.escapeHtml)(details) : null;
        const insertResult = await (0, db_js_1.query)(`INSERT INTO lead_activities (lead_id, user_id, activity_type, title, details)
       VALUES (?, ?, ?, ?, ?)`, [leadId, req.user.userId, activity_type, title, sanitizedDetails]);
        // Update last_contacted_at on lead
        await (0, db_js_1.query)('UPDATE leads SET last_contacted_at = NOW(), updated_at = NOW() WHERE id = ?', [leadId]);
        res.status(201).json({
            status: 'success',
            message: 'Actividad registrada con éxito.',
            activity_id: insertResult?.insertId || null,
        });
    }
    catch (err) {
        res
            .status(500)
            .json({ status: 'error', message: err.message || 'Error al registrar actividad.' });
    }
});
/**
 * POST /api/v1/admin/leads/:id/send-email
 * Dispatches a manual follow-up email template on-click with strict error handling (C-041.4)
 */
exports.adminRouter.post('/leads/:id/send-email', exports.leadEmailRateLimiter, async (req, res) => {
    try {
        const leadId = parseInt(req.params.id, 10);
        if (isNaN(leadId) || leadId <= 0) {
            res.status(400).json({ status: 'error', message: 'ID de prospecto inválido.' });
            return;
        }
        const parseResult = crm_schema_js_1.sendLeadFollowUpEmailSchema.safeParse(req.body);
        if (!parseResult.success) {
            const errorMsg = parseResult.error.errors.map((e) => e.message).join(', ');
            res.status(400).json({ status: 'error', error: 'Validation Error', message: errorMsg });
            return;
        }
        const { template_id, subject, custom_message } = parseResult.data;
        const leadRows = await (0, db_js_1.query)('SELECT * FROM leads WHERE id = ?', [leadId]);
        if (!leadRows || leadRows.length === 0) {
            res.status(404).json({ status: 'error', message: 'Prospecto no encontrado.' });
            return;
        }
        const lead = leadRows[0];
        if (!lead.email || typeof lead.email !== 'string' || !lead.email.includes('@')) {
            res.status(400).json({ status: 'error', message: 'El prospecto no posee un correo electrónico válido.' });
            return;
        }
        const rendered = (0, crm_js_1.renderLeadFollowUpEmail)({
            fullName: lead.full_name || lead.name || 'Estimado/a',
            email: lead.email,
            company: lead.company || lead.company_name || null,
            projectVertical: lead.project_vertical || null,
            estimatedBudgetMin: lead.estimated_budget_min,
            estimatedBudgetMax: lead.estimated_budget_max,
            estimatedWeeksMin: lead.estimated_weeks_min,
            estimatedWeeksMax: lead.estimated_weeks_max,
        }, template_id, subject, custom_message);
        // Attempt SMTP dispatch with strict fail-open / 502 error handling (C-041.4)
        try {
            await (0, contact_js_1.getTransporter)().sendMail({
                from: '"Dreamtek Dirección Comercial" <hola@dreamtek.tech>',
                to: lead.email,
                subject: rendered.subject,
                text: rendered.text,
                html: rendered.html,
            });
        }
        catch (smtpErr) {
            // C-041.4: Return 502 Bad Gateway and DO NOT record EMAIL_SENT in lead_activities
            console.warn(`[CRM_SMTP_ERROR] Error al enviar correo a lead ${leadId}:`, smtpErr?.message);
            res.status(502).json({
                status: 'error',
                error: 'Bad Gateway',
                message: 'Error en el servidor de correo SMTP. No se pudo enviar el correo de seguimiento.',
            });
            return;
        }
        // Record activity only on successful SMTP delivery
        const detailMsg = `Plantilla: ${template_id}.${custom_message ? ' Mensaje: ' + (0, crm_js_1.escapeHtml)(custom_message) : ''}`;
        await (0, db_js_1.query)(`INSERT INTO lead_activities (lead_id, user_id, activity_type, title, details)
         VALUES (?, ?, 'EMAIL_SENT', ?, ?)`, [leadId, req.user.userId, `Correo enviado: ${rendered.subject}`, detailMsg]);
        // Advance status from NEW to CONTACTED if applicable and update last_contacted_at
        await (0, db_js_1.query)(`UPDATE leads
         SET last_contacted_at = NOW(),
             updated_at = NOW(),
             status = CASE WHEN status = 'NEW' THEN 'CONTACTED' ELSE status END
         WHERE id = ?`, [leadId]);
        res.json({
            status: 'success',
            message: 'Correo de seguimiento manual enviado con éxito.',
            template_id,
            subject: rendered.subject,
        });
    }
    catch (err) {
        res
            .status(500)
            .json({ status: 'error', message: err.message || 'Error al procesar envío de correo.' });
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
        res
            .status(500)
            .json({ status: 'error', message: err.message || 'Error al consultar logs de auditoría.' });
    }
});
/**
 * GET /api/v1/admin/metrics
 * Returns system administrative metrics (Condition C-M3)
 */
exports.adminRouter.get('/metrics', async (_req, res) => {
    try {
        const leadsCount = await (0, db_js_1.query)('SELECT COUNT(*) as total FROM leads').catch(() => [
            { total: 0 },
        ]);
        const usersCount = await (0, db_js_1.query)('SELECT COUNT(*) as total FROM users').catch(() => [
            { total: 0 },
        ]);
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
        res
            .status(500)
            .json({ status: 'error', message: err.message || 'Error al consultar métricas.' });
    }
});
