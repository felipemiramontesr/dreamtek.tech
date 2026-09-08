"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.leadPaymentRateLimiter = exports.leadEmailRateLimiter = exports.getAdminEmailClientKey = exports.adminRouter = void 0;
const express_1 = require("express");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const db_js_1 = require("../db.js");
const auth_js_1 = require("../middleware/auth.js");
const crm_schema_js_1 = require("../schemas/crm.schema.js");
const project_schema_js_1 = require("../schemas/project.schema.js");
const crm_js_1 = require("../utils/crm.js");
const project_js_1 = require("../utils/project.js");
const contact_js_1 = require("./contact.js");
const checkout_js_1 = require("./checkout.js");
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
// Rate limiter for generating lead checkout payment sessions (Condition C-043): 10 req/min per admin/IP
exports.leadPaymentRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => (0, exports.getAdminEmailClientKey)(req),
    message: {
        status: 'error',
        error: 'Too Many Requests',
        message: 'Límite de generación de enlaces de pago alcanzado (máximo 10 por minuto). Intenta más tarde.',
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
                      estimated_weeks_min, estimated_weeks_max, deposit_status, currency, created_at, updated_at
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
        const payments = await (0, db_js_1.query)(`SELECT id, lead_id, stripe_session_id, stripe_payment_intent_id, payment_type,
              amount_cents, currency, status, notes, paid_at, created_at, updated_at
       FROM lead_payments
       WHERE lead_id = ?
       ORDER BY created_at DESC`, [leadId]);
        res.json({
            status: 'success',
            lead: {
                ...lead,
                activities,
                payments,
            },
        });
    }
    catch (err) {
        res
            .status(500)
            .json({
            status: 'error',
            message: err.message || 'Error al consultar expediente de prospecto.',
        });
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
            .json({
            status: 'error',
            message: err.message || 'Error al actualizar estado del prospecto.',
        });
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
        await (0, db_js_1.query)('UPDATE leads SET last_contacted_at = NOW(), updated_at = NOW() WHERE id = ?', [
            leadId,
        ]);
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
            res
                .status(400)
                .json({
                status: 'error',
                message: 'El prospecto no posee un correo electrónico válido.',
            });
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
            currency: lead.currency || 'MXN',
            locale: lead.locale || 'es',
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
 * POST /api/v1/admin/leads/:id/checkout-session
 * Generates a Stripe Checkout session for B2B deposit (FC 043 rev-2)
 */
exports.adminRouter.post('/leads/:id/checkout-session', exports.leadPaymentRateLimiter, async (req, res) => {
    try {
        const leadId = parseInt(req.params.id, 10);
        if (isNaN(leadId) || leadId <= 0) {
            res.status(400).json({ status: 'error', message: 'ID de prospecto inválido.' });
            return;
        }
        const parseResult = crm_schema_js_1.createLeadCheckoutSessionSchema.safeParse(req.body);
        if (!parseResult.success) {
            const errorMsg = parseResult.error.errors.map((e) => e.message).join(', ');
            res.status(400).json({ status: 'error', error: 'Validation Error', message: errorMsg });
            return;
        }
        const { payment_type, custom_amount, notes } = parseResult.data;
        const leadRows = await (0, db_js_1.query)('SELECT * FROM leads WHERE id = ?', [leadId]);
        if (!leadRows || leadRows.length === 0) {
            res.status(404).json({ status: 'error', message: 'Prospecto no encontrado.' });
            return;
        }
        const lead = leadRows[0];
        if (!lead.email || typeof lead.email !== 'string' || !lead.email.includes('@')) {
            res
                .status(400)
                .json({
                status: 'error',
                message: 'El prospecto no posee un correo electrónico válido.',
            });
            return;
        }
        // Calculate deposit amount (C-043.4, C-043.6)
        let amount;
        if (payment_type === 'DEPOSIT_50') {
            const budgetMin = Number(lead.estimated_budget_min);
            if (!budgetMin || isNaN(budgetMin) || budgetMin <= 0) {
                res.status(400).json({
                    status: 'error',
                    message: 'El prospecto no tiene un presupuesto mínimo estimado válido para calcular el 50%. Especifica un monto personalizado.',
                });
                return;
            }
            amount = Math.round(budgetMin * 0.5);
        }
        else {
            if (!custom_amount || custom_amount <= 0) {
                res.status(400).json({
                    status: 'error',
                    message: 'El monto personalizado debe ser mayor a cero.',
                });
                return;
            }
            amount = custom_amount;
        }
        const currency = (lead.currency || 'USD').toUpperCase();
        // Amount boundary checks (C-043.6)
        if (currency === 'USD') {
            if (amount < 50 || amount > 30000) {
                res.status(400).json({
                    status: 'error',
                    message: `Monto fuera de rango para USD ($50 - $30,000 USD). Monto solicitado: $${amount}`,
                });
                return;
            }
        }
        else if (currency === 'MXN') {
            if (amount < 500 || amount > 500000) {
                res.status(400).json({
                    status: 'error',
                    message: `Monto fuera de rango para MXN ($500 - $500,000 MXN). Monto solicitado: $${amount}`,
                });
                return;
            }
        }
        else {
            res.status(400).json({
                status: 'error',
                message: `Divisa no soportada: ${currency}. Solo se admite USD o MXN.`,
            });
            return;
        }
        const amountCents = Math.round(amount * 100);
        const currentKey = process.env.STRIPE_SECRET_KEY || 'sk_test_mock';
        // C-043.5: Disallow sk_test_mock in production
        if (process.env.NODE_ENV === 'production' &&
            (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY === 'sk_test_mock')) {
            res.status(503).json({
                status: 'error',
                message: 'Configuración de pasarela de pago Stripe no disponible en producción.',
            });
            return;
        }
        let session;
        const stripeInstance = (0, checkout_js_1.getStripe)(currentKey);
        if (currentKey === 'sk_test_mock' && !stripeInstance?.checkout?.sessions?.create) {
            const mockSessionId = `cs_test_b2b_${Date.now()}_${leadId}`;
            session = {
                id: mockSessionId,
                url: `https://checkout.stripe.com/c/pay/${mockSessionId}`,
                expires_at: Math.floor(Date.now() / 1000) + 72 * 3600,
            };
        }
        else {
            const clientName = lead.company || lead.full_name;
            const itemName = payment_type === 'DEPOSIT_50'
                ? `Anticipo de Proyecto (50%) — ${clientName}`
                : `Anticipo de Proyecto — ${clientName}`;
            const baseUrl = process.env.CORS_ORIGIN || 'https://dreamtek.tech';
            const stripeSession = await stripeInstance.checkout.sessions.create({
                payment_method_types: ['card'],
                customer_email: lead.email,
                client_reference_id: String(lead.id),
                metadata: {
                    tenant_type: 'B2B_LEAD',
                    lead_id: String(lead.id),
                    payment_type,
                    notes: notes || '',
                },
                line_items: [
                    {
                        price_data: {
                            currency: currency.toLowerCase(),
                            product_data: {
                                name: itemName,
                                description: 'Anticipo inicial para formalizar arquitectura técnica y reserva de sprints. Saldo restante sujeto a hitos.',
                            },
                            unit_amount: amountCents,
                        },
                        quantity: 1,
                    },
                ],
                mode: 'payment',
                success_url: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}&lead_id=${lead.id}&type=deposit`,
                cancel_url: `${baseUrl}/checkout/cancel?lead_id=${lead.id}`,
            });
            session = {
                id: stripeSession.id,
                url: stripeSession.url || `https://checkout.stripe.com/c/pay/${stripeSession.id}`,
                expires_at: stripeSession.expires_at,
            };
        }
        // Persist in lead_payments (DDL 041)
        const sanitizedNotes = notes ? (0, crm_js_1.escapeHtml)(notes) : null;
        await (0, db_js_1.query)(`INSERT INTO lead_payments (lead_id, stripe_session_id, payment_type, amount_cents, currency, status, notes)
         VALUES (?, ?, ?, ?, ?, 'PENDING', ?)`, [leadId, session.id, payment_type, amountCents, currency, sanitizedNotes]);
        // Update lead deposit_status
        await (0, db_js_1.query)(`UPDATE leads SET deposit_status = 'PENDING', updated_at = NOW() WHERE id = ?`, [
            leadId,
        ]);
        // Register activity
        const activityTitle = payment_type === 'DEPOSIT_50'
            ? `Enlace de anticipo 50% generado`
            : `Enlace de pago personalizado generado`;
        const activityDetails = `Monto: $${amount.toLocaleString()} ${currency}. Sesión: ${session.id}`;
        await (0, db_js_1.query)(`INSERT INTO lead_activities (lead_id, user_id, activity_type, title, details)
         VALUES (?, ?, 'NOTE', ?, ?)`, [leadId, req.user.userId, activityTitle, activityDetails]);
        res.status(201).json({
            status: 'success',
            message: 'Sesión de anticipo generada con éxito.',
            checkout_url: session.url,
            session_id: session.id,
            amount,
            amount_cents: amountCents,
            currency,
            expires_at: session.expires_at,
        });
    }
    catch (err) {
        res.status(500).json({
            status: 'error',
            message: err.message || 'Error al generar sesión de pago para el prospecto.',
        });
    }
});
/**
 * GET /api/v1/admin/leads/:id/payments
 * Returns payment history for a specific lead (FC 043 rev-2)
 */
exports.adminRouter.get('/leads/:id/payments', async (req, res) => {
    try {
        const leadId = parseInt(req.params.id, 10);
        if (isNaN(leadId) || leadId <= 0) {
            res.status(400).json({ status: 'error', message: 'ID de prospecto inválido.' });
            return;
        }
        const leadRows = await (0, db_js_1.query)('SELECT id FROM leads WHERE id = ?', [leadId]);
        if (!leadRows || leadRows.length === 0) {
            res.status(404).json({ status: 'error', message: 'Prospecto no encontrado.' });
            return;
        }
        const payments = await (0, db_js_1.query)(`SELECT id, lead_id, stripe_session_id, stripe_payment_intent_id, payment_type,
                amount_cents, currency, status, notes, paid_at, created_at, updated_at
         FROM lead_payments
         WHERE lead_id = ?
         ORDER BY created_at DESC`, [leadId]);
        res.json({
            status: 'success',
            payments,
        });
    }
    catch (err) {
        res
            .status(500)
            .json({
            status: 'error',
            message: err.message || 'Error al consultar pagos del prospecto.',
        });
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
/**
 * GET /api/v1/admin/projects
 * Lists all B2B projects with optional filters and pagination (FC 044)
 */
exports.adminRouter.get('/projects', async (req, res) => {
    try {
        const { status, vertical, search, page: rawPage, limit: rawLimit } = req.query;
        const page = Math.max(1, parseInt(String(rawPage || '1'), 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(String(rawLimit || '20'), 10) || 20));
        const offset = (page - 1) * limit;
        let sql = `
      SELECT p.id, p.tenant_id, p.user_id, p.lead_id, p.project_name, p.vertical, p.status,
             p.currency, p.budget_cents, p.paid_amount_cents, p.pending_balance_cents,
             p.estimated_weeks, p.briefing_data, p.staging_url, p.repository_url,
             p.created_at, p.updated_at,
             t.name as tenant_name,
             u.full_name as user_full_name, u.email as user_email
      FROM client_projects p
      LEFT JOIN tenants t ON p.tenant_id = t.id
      LEFT JOIN users u ON p.user_id = u.id
      WHERE 1=1
    `;
        const params = [];
        if (status && typeof status === 'string' && status.trim() !== '' && status !== 'ALL') {
            sql += ' AND p.status = ?';
            params.push(status.trim());
        }
        if (vertical && typeof vertical === 'string' && vertical.trim() !== '' && vertical !== 'ALL') {
            sql += ' AND p.vertical = ?';
            params.push(vertical.trim());
        }
        if (search && typeof search === 'string' && search.trim() !== '') {
            sql += ' AND (p.project_name LIKE ? OR t.name LIKE ? OR u.email LIKE ?)';
            const term = `%${(0, crm_js_1.escapeLikeWildcards)(search.trim())}%`;
            params.push(term, term, term);
        }
        // Count query
        const countSql = `SELECT COUNT(*) as total FROM (${sql}) as counted`;
        const countRes = await (0, db_js_1.query)(countSql, params).catch(() => [{ total: 0 }]);
        const total = countRes[0]?.total || 0;
        sql += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);
        const projectRows = await (0, db_js_1.query)(sql, params);
        // Attach milestones summary
        const projectsWithMilestones = [];
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
            projectsWithMilestones.push({
                ...proj,
                briefing_data: parsedBriefing,
                milestones,
                progress_percent: progressPercent,
            });
        }
        res.json({
            status: 'success',
            page,
            limit,
            total,
            projects: projectsWithMilestones,
        });
    }
    catch (err) {
        res
            .status(500)
            .json({ status: 'error', message: err.message || 'Error al consultar proyectos B2B.' });
    }
});
/**
 * POST /api/v1/admin/leads/:id/create-project
 * Manually provisions a B2B project for a lead (e.g. wire transfer / offline agreement) (FC 044)
 */
exports.adminRouter.post('/leads/:id/create-project', async (req, res) => {
    try {
        const leadId = parseInt(req.params.id, 10);
        if (isNaN(leadId) || leadId <= 0) {
            res.status(400).json({ status: 'error', message: 'ID de prospecto inválido.' });
            return;
        }
        const parsed = project_schema_js_1.adminCreateProjectFromLeadSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({
                status: 'error',
                error: 'Validation Error',
                details: parsed.error.format(),
            });
            return;
        }
        const leadRows = await (0, db_js_1.query)('SELECT * FROM leads WHERE id = ? LIMIT 1', [leadId]);
        if (!leadRows || leadRows.length === 0) {
            res.status(404).json({ status: 'error', message: 'Prospecto no encontrado.' });
            return;
        }
        const result = await (0, db_js_1.withTransaction)(async (conn) => {
            return await (0, project_js_1.provisionClientProjectForLead)(conn, leadId, parsed.data);
        });
        res.status(result.created ? 201 : 200).json({
            status: 'success',
            message: result.created
                ? 'Proyecto B2B e hitos aprovisionados con éxito.'
                : 'El proyecto ya existía para este prospecto (idempotente).',
            ...result,
        });
    }
    catch (err) {
        res
            .status(500)
            .json({ status: 'error', message: err.message || 'Error al aprovisionar proyecto B2B.' });
    }
});
/**
 * PUT /api/v1/admin/projects/:id
 * Updates B2B project status, name, or URLs with anti-SSRF protection (Conditions C-044.4, C-044.5)
 */
exports.adminRouter.put('/projects/:id', async (req, res) => {
    try {
        const projectId = parseInt(req.params.id, 10);
        if (isNaN(projectId) || projectId <= 0) {
            res.status(400).json({ status: 'error', message: 'ID de proyecto inválido.' });
            return;
        }
        const projectRows = await (0, db_js_1.query)('SELECT id FROM client_projects WHERE id = ? LIMIT 1', [projectId]);
        if (!projectRows || projectRows.length === 0) {
            res.status(404).json({ status: 'error', message: 'Proyecto no encontrado.' });
            return;
        }
        const parsed = project_schema_js_1.adminUpdateProjectSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({
                status: 'error',
                error: 'Validation Error',
                details: parsed.error.format(),
            });
            return;
        }
        const fields = [];
        const values = [];
        if (parsed.data.status !== undefined) {
            fields.push('status = ?');
            values.push(parsed.data.status);
        }
        if (parsed.data.staging_url !== undefined) {
            fields.push('staging_url = ?');
            values.push(parsed.data.staging_url);
        }
        if (parsed.data.repository_url !== undefined) {
            fields.push('repository_url = ?');
            values.push(parsed.data.repository_url);
        }
        if (parsed.data.project_name !== undefined) {
            fields.push('project_name = ?');
            values.push(parsed.data.project_name);
        }
        if (fields.length === 0) {
            res
                .status(400)
                .json({ status: 'error', message: 'No se enviaron campos válidos para actualizar.' });
            return;
        }
        fields.push('updated_at = NOW()');
        values.push(projectId);
        await (0, db_js_1.query)(`UPDATE client_projects SET ${fields.join(', ')} WHERE id = ?`, values);
        const updated = await (0, db_js_1.query)('SELECT * FROM client_projects WHERE id = ? LIMIT 1', [
            projectId,
        ]);
        res.json({
            status: 'success',
            message: 'Proyecto actualizado con éxito.',
            project: updated[0],
        });
    }
    catch (err) {
        res
            .status(500)
            .json({ status: 'error', message: err.message || 'Error al actualizar proyecto.' });
    }
});
/**
 * PUT /api/v1/admin/projects/:id/milestones/:milestoneId
 * Updates milestone status, title, description or target week (Condition C-044.4)
 */
exports.adminRouter.put('/projects/:id/milestones/:milestoneId', async (req, res) => {
    try {
        const projectId = parseInt(req.params.id, 10);
        const milestoneId = parseInt(req.params.milestoneId, 10);
        if (isNaN(projectId) || projectId <= 0 || isNaN(milestoneId) || milestoneId <= 0) {
            res.status(400).json({ status: 'error', message: 'IDs de proyecto o hito inválidos.' });
            return;
        }
        const milestoneRows = await (0, db_js_1.query)('SELECT id FROM client_project_milestones WHERE id = ? AND project_id = ? LIMIT 1', [milestoneId, projectId]);
        if (!milestoneRows || milestoneRows.length === 0) {
            res.status(404).json({ status: 'error', message: 'Hito no encontrado en este proyecto.' });
            return;
        }
        const parsed = project_schema_js_1.adminUpdateMilestoneSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({
                status: 'error',
                error: 'Validation Error',
                details: parsed.error.format(),
            });
            return;
        }
        const { status, title, description, target_week } = parsed.data;
        const fields = ['status = ?'];
        const values = [status];
        if (status === 'COMPLETED') {
            fields.push('completed_at = NOW()');
        }
        else {
            fields.push('completed_at = NULL');
        }
        if (title !== undefined) {
            fields.push('title = ?');
            values.push(title);
        }
        if (description !== undefined) {
            fields.push('description = ?');
            values.push(description);
        }
        if (target_week !== undefined) {
            fields.push('target_week = ?');
            values.push(target_week);
        }
        values.push(milestoneId, projectId);
        await (0, db_js_1.query)(`UPDATE client_project_milestones SET ${fields.join(', ')} WHERE id = ? AND project_id = ?`, values);
        const updated = await (0, db_js_1.query)('SELECT * FROM client_project_milestones WHERE id = ? LIMIT 1', [milestoneId]);
        res.json({
            status: 'success',
            message: 'Hito actualizado con éxito.',
            milestone: updated[0],
        });
    }
    catch (err) {
        res
            .status(500)
            .json({ status: 'error', message: err.message || 'Error al actualizar hito.' });
    }
});
