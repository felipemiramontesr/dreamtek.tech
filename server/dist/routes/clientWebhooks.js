"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.clientWebhooksRateLimiter = exports.clientWebhooksRouter = void 0;
/* eslint-disable @typescript-eslint/no-explicit-any */
const express_1 = require("express");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const crypto_1 = __importDefault(require("crypto"));
const db_js_1 = require("../db.js");
const auth_js_1 = require("../middleware/auth.js");
const validate_js_1 = require("../middleware/validate.js");
const notification_schema_js_1 = require("../schemas/notification.schema.js");
const crypto_js_1 = require("../utils/crypto.js");
const clientNotificationService_js_1 = require("../services/clientNotificationService.js");
const clientWebhookDispatcher_js_1 = require("../services/clientWebhookDispatcher.js");
exports.clientWebhooksRouter = (0, express_1.Router)();
// Rate limiter dedicado para gestión y tests de webhooks (30 req/min per IP) (C-053.6)
exports.clientWebhooksRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        status: 'error',
        error: 'Too Many Requests',
        message: 'Demasiadas solicitudes de webhooks. Intenta de nuevo en un momento.',
    },
});
exports.clientWebhooksRouter.use(auth_js_1.requireAuth);
exports.clientWebhooksRouter.use(exports.clientWebhooksRateLimiter);
/**
 * GET /api/v1/client/webhooks
 * Lista las suscripciones de webhooks del tenant.
 * NUNCA retorna el secreto en texto plano (C-053.3).
 */
exports.clientWebhooksRouter.get('/', async (req, res) => {
    try {
        const userId = req.user.userId;
        const tenantId = req.user.tenantId || (await (0, clientNotificationService_js_1.resolveTenantForUser)(userId));
        const subscriptions = await (0, db_js_1.query)(`SELECT id, tenant_id, name, target_url, events, is_active, created_at, updated_at
       FROM client_webhook_subscriptions
       WHERE tenant_id = ?
       ORDER BY created_at DESC`, [tenantId]);
        const formatted = subscriptions.map((s) => ({
            ...s,
            events: typeof s.events === 'string' ? JSON.parse(s.events) : s.events,
        }));
        res.json({
            status: 'success',
            data: formatted,
        });
    }
    catch (err) {
        if (err.statusCode === 400) {
            res.status(400).json({
                status: 'error',
                message: err.message,
            });
            return;
        }
        res.status(500).json({
            status: 'error',
            message: 'Error al consultar las suscripciones de webhooks.',
        });
    }
});
/**
 * POST /api/v1/client/webhooks
 * Registra una nueva suscripción de webhook con validación anti-SSRF y entrega única de secreto (C-053.2/3).
 */
exports.clientWebhooksRouter.post('/', (0, validate_js_1.validate)(notification_schema_js_1.createClientWebhookSchema), async (req, res) => {
    try {
        const userId = req.user.userId;
        const tenantId = req.user.tenantId || (await (0, clientNotificationService_js_1.resolveTenantForUser)(userId));
        const { name, target_url, events } = req.body;
        // Validación perimetral anti-SSRF fail-closed (C-053.2)
        const urlValidation = await (0, clientWebhookDispatcher_js_1.validateClientWebhookUrl)(target_url);
        if (!urlValidation.valid) {
            res.status(400).json({
                status: 'error',
                message: urlValidation.error,
            });
            return;
        }
        // Generar secreto criptográfico de 32 bytes de alta entropía (C-053.3)
        const plainSecret = crypto_1.default.randomBytes(32).toString('hex');
        const secretEncrypted = (0, crypto_js_1.encryptField)(plainSecret);
        const result = await (0, db_js_1.query)(`INSERT INTO client_webhook_subscriptions 
         (tenant_id, name, target_url, secret_encrypted, events, is_active, created_at)
         VALUES (?, ?, ?, ?, ?, 1, NOW())`, [tenantId, name, target_url, secretEncrypted, JSON.stringify(events)]);
        const createdId = Number(result.insertId);
        // El secreto en texto plano se entrega EXCLUSIVAMENTE en la respuesta de creación (C-053.3)
        res.status(201).json({
            status: 'success',
            message: 'Suscripción de webhook creada exitosamente. Guarda el secreto; no se mostrará de nuevo.',
            data: {
                id: createdId,
                name,
                target_url,
                events,
                is_active: 1,
                secret: plainSecret,
            },
        });
    }
    catch (err) {
        if (err.statusCode === 400) {
            res.status(400).json({
                status: 'error',
                message: err.message,
            });
            return;
        }
        res.status(500).json({
            status: 'error',
            message: 'Error al registrar la suscripción de webhook.',
        });
    }
});
/**
 * DELETE /api/v1/client/webhooks/:id
 * Elimina una suscripción de webhook con validación anti-IDOR (C-053.1).
 */
exports.clientWebhooksRouter.delete('/:id', async (req, res) => {
    try {
        const userId = req.user.userId;
        const tenantId = req.user.tenantId || (await (0, clientNotificationService_js_1.resolveTenantForUser)(userId));
        const webhookId = Number(req.params.id);
        const result = await (0, db_js_1.query)('DELETE FROM client_webhook_subscriptions WHERE id = ? AND tenant_id = ?', [webhookId, tenantId]);
        if (result.affectedRows === 0) {
            res.status(404).json({
                status: 'error',
                message: 'Webhook no encontrado o no pertenece a tu cuenta.',
            });
            return;
        }
        res.json({
            status: 'success',
            message: 'Suscripción de webhook eliminada exitosamente.',
        });
    }
    catch (err) {
        if (err.statusCode === 400) {
            res.status(400).json({
                status: 'error',
                message: err.message,
            });
            return;
        }
        res.status(500).json({
            status: 'error',
            message: 'Error al eliminar el webhook.',
        });
    }
});
/**
 * POST /api/v1/client/webhooks/:id/test
 * Despacha un evento de prueba 'ping' firmado criptográficamente para verificar conectividad.
 */
exports.clientWebhooksRouter.post('/:id/test', async (req, res) => {
    try {
        const userId = req.user.userId;
        const tenantId = req.user.tenantId || (await (0, clientNotificationService_js_1.resolveTenantForUser)(userId));
        const webhookId = Number(req.params.id);
        const delivery = await (0, clientWebhookDispatcher_js_1.dispatchTestWebhook)(webhookId, tenantId);
        res.json({
            status: 'success',
            message: delivery.success
                ? 'Prueba de webhook completada con éxito.'
                : 'La prueba de webhook fue despachada pero el servidor de destino respondió con error o no fue accesible.',
            data: delivery,
        });
    }
    catch (err) {
        if (err.statusCode === 400) {
            res.status(400).json({
                status: 'error',
                message: err.message,
            });
            return;
        }
        if (err.message && err.message.includes('no encontrada')) {
            res.status(404).json({
                status: 'error',
                message: 'Webhook no encontrado o no pertenece a tu cuenta.',
            });
            return;
        }
        res.status(500).json({
            status: 'error',
            message: 'Error al ejecutar la prueba de webhook.',
        });
    }
});
