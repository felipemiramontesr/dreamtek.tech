"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.quoteRateLimiter = exports.getQuoteClientIp = exports.quotesRouter = void 0;
const express_1 = require("express");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const quotes_schema_js_1 = require("../schemas/quotes.schema.js");
const db_js_1 = require("../db.js");
const auditLogger_js_1 = require("../middleware/auditLogger.js");
const contact_js_1 = require("./contact.js");
const mailer_js_1 = require("../services/mailer.js");
exports.quotesRouter = (0, express_1.Router)();
/**
 * Helper to safely extract client IP behind proxies
 */
const getQuoteClientIp = (req) => {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
        return forwarded.split(',')[0].trim();
    }
    if (req.ip) {
        return req.ip;
    }
    if (req.socket?.remoteAddress) {
        return req.socket.remoteAddress;
    }
    return '127.0.0.1';
};
exports.getQuoteClientIp = getQuoteClientIp;
/**
 * Dedicated rate limiter for quote diagnostic funnel (C-039.5)
 * 10 requests per 15 minutes per IP
 */
exports.quoteRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => (0, exports.getQuoteClientIp)(req),
    message: {
        status: 'error',
        error: 'Too Many Requests',
        message: 'Has alcanzado el límite de solicitudes de cotización. Intenta más tarde.',
    },
});
exports.quotesRouter.use(exports.quoteRateLimiter);
/**
 * POST /api/v1/quotes
 * Registers a qualified quote diagnostic lead with server-side SSOT matrix validation
 */
exports.quotesRouter.post('/', async (req, res) => {
    const parseResult = quotes_schema_js_1.createQuoteLeadSchema.safeParse(req.body);
    if (!parseResult.success) {
        const errorMessages = parseResult.error.errors.map((e) => e.message).join(', ');
        res.status(400).json({
            status: 'error',
            error: 'Validation Error',
            message: errorMessages,
        });
        return;
    }
    const data = parseResult.data;
    // Server-side SSOT matrix evaluation (C-039.2 & C-042.1)
    const matrixResult = (0, quotes_schema_js_1.evaluateQuoteMatrix)(data.vertical, data.scale, data.locale);
    if (!matrixResult) {
        res.status(400).json({
            status: 'error',
            error: 'Invalid Combination',
            message: 'La combinación de vertical y alcance seleccionada no es válida.',
        });
        return;
    }
    const clientIp = (0, exports.getQuoteClientIp)(req);
    const requirementsJson = data.requirements ? JSON.stringify(data.requirements) : null;
    try {
        // Atomic UPSERT on email per C-039.1 & C-042.2
        await (0, db_js_1.query)(`INSERT INTO \`leads\` (
        \`email\`, \`full_name\`, \`phone\`, \`company\`,
        \`project_vertical\`, \`complexity_level\`,
        \`currency\`, \`locale\`,
        \`estimated_budget_min\`, \`estimated_budget_max\`,
        \`estimated_weeks_min\`, \`estimated_weeks_max\`,
        \`requirements_payload\`, \`ip_address\`
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        \`full_name\` = VALUES(\`full_name\`),
        \`phone\` = VALUES(\`phone\`),
        \`company\` = VALUES(\`company\`),
        \`project_vertical\` = VALUES(\`project_vertical\`),
        \`complexity_level\` = VALUES(\`complexity_level\`),
        \`currency\` = VALUES(\`currency\`),
        \`locale\` = VALUES(\`locale\`),
        \`estimated_budget_min\` = VALUES(\`estimated_budget_min\`),
        \`estimated_budget_max\` = VALUES(\`estimated_budget_max\`),
        \`estimated_weeks_min\` = VALUES(\`estimated_weeks_min\`),
        \`estimated_weeks_max\` = VALUES(\`estimated_weeks_max\`),
        \`requirements_payload\` = VALUES(\`requirements_payload\`),
        \`ip_address\` = VALUES(\`ip_address\`),
        \`updated_at\` = NOW()`, [
            data.email,
            data.full_name,
            data.phone,
            data.company_name || null,
            data.vertical,
            data.scale,
            matrixResult.currency,
            matrixResult.locale,
            matrixResult.estimatedBudgetMin,
            matrixResult.estimatedBudgetMax,
            matrixResult.estimatedWeeksMin,
            matrixResult.estimatedWeeksMax,
            requirementsJson,
            clientIp,
        ]);
        // Security audit log with minimized PII (C-039.5)
        try {
            await (0, auditLogger_js_1.logSecurityEvent)(req, {
                eventType: 'QUOTE_LEAD_SUBMITTED',
                status: 'SUCCESS',
                details: `vertical=${data.vertical};scale=${data.scale};currency=${matrixResult.currency};locale=${matrixResult.locale}`,
            });
        }
        catch {
            // Non-blocking security audit failure
        }
        // Fail-open notification email dispatch (C-039.3 & C-042.5 & FC 050)
        if (process.env.NODE_ENV === 'production' && process.env.SMTP_PASS) {
            const mailContent = (0, mailer_js_1.buildQuoteNotificationEmail)({
                serviceLabel: matrixResult.serviceLabel,
                vertical: data.vertical,
                scaleLabel: matrixResult.scaleLabel,
                scale: data.scale,
                currency: matrixResult.currency,
                locale: matrixResult.locale,
                estimatedBudgetMin: matrixResult.estimatedBudgetMin,
                estimatedBudgetMax: matrixResult.estimatedBudgetMax,
                estimatedWeeksMin: matrixResult.estimatedWeeksMin,
                estimatedWeeksMax: matrixResult.estimatedWeeksMax,
                fullName: data.full_name,
                email: data.email,
                phone: data.phone,
                companyName: data.company_name,
                notes: data.notes,
            });
            (0, contact_js_1.getTransporter)()
                .sendMail({
                from: mailer_js_1.OFFICIAL_SOLUTIONS_FROM,
                to: mailer_js_1.OFFICIAL_SENDER,
                subject: mailContent.subject,
                text: mailContent.text,
                html: mailContent.html,
            })
                .catch((mailErr) => {
                console.warn('⚠️ Non-blocking email dispatch warning in quote lead:', mailErr);
            });
        }
        const isEn = matrixResult.locale === 'en';
        res.status(201).json({
            status: 'success',
            message: isEn
                ? 'Parametric estimation registered successfully. A Dreamtek solutions architect will review your technical requirements and contact you shortly.'
                : 'Estimación paramétrica registrada exitosamente. Un arquitecto de soluciones de Dreamtek revisará tus requerimientos y te contactará a la brevedad.',
            data: {
                vertical: data.vertical,
                scale: data.scale,
                service_label: matrixResult.serviceLabel,
                scale_label: matrixResult.scaleLabel,
                estimated_budget_min: matrixResult.estimatedBudgetMin,
                estimated_budget_max: matrixResult.estimatedBudgetMax,
                estimated_weeks_min: matrixResult.estimatedWeeksMin,
                estimated_weeks_max: matrixResult.estimatedWeeksMax,
                currency: matrixResult.currency,
                locale: matrixResult.locale,
                disclaimer: isEn
                    ? 'Orientative parametric estimation subject to detailed technical requirements review and formal contract agreement. List prices designed for international market; not a live financial exchange rate.'
                    : 'Estimación paramétrica orientativa sujeta a revisión de requerimientos técnicos detallados y formalización contractual. Precios de lista independientes por mercado; no constituye un tipo de cambio financiero en tiempo real.',
            },
        });
    }
    catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Error inesperado al registrar cotización.';
        res.status(500).json({
            status: 'error',
            message: errorMsg,
        });
    }
});
