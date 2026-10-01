"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deliveriesQuerySchema = exports.webhookIdParamSchema = exports.updateWebhookSchema = exports.createWebhookSchema = exports.WebhookEventEnum = void 0;
const zod_1 = require("zod");
exports.WebhookEventEnum = zod_1.z.enum([
    'asset.created',
    'asset.updated',
    'asset.deleted',
    'version.created',
    'rights.updated',
    'job.completed',
    'asset.archived',
    'asset.restored',
    'asset.ai_analyzed',
    'asset.tags_updated',
    '*',
]);
exports.createWebhookSchema = zod_1.z.object({
    url: zod_1.z.string().url('URL de webhook inválida').max(2048),
    description: zod_1.z.string().max(255).optional(),
    events: zod_1.z.array(exports.WebhookEventEnum).min(1, 'Debe suscribirse al menos a un evento'),
    is_active: zod_1.z.boolean().optional().default(true),
});
exports.updateWebhookSchema = zod_1.z.object({
    url: zod_1.z.string().url('URL de webhook inválida').max(2048).optional(),
    description: zod_1.z.string().max(255).nullable().optional(),
    events: zod_1.z.array(exports.WebhookEventEnum).min(1, 'Debe suscribirse al menos a un evento').optional(),
    is_active: zod_1.z.boolean().optional(),
});
exports.webhookIdParamSchema = zod_1.z.object({
    id: zod_1.z.coerce.number().int().positive('ID de webhook inválido'),
});
exports.deliveriesQuerySchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().positive().optional().default(1),
    limit: zod_1.z.coerce.number().int().positive().max(100).optional().default(20),
    status: zod_1.z.enum(['PENDING', 'SUCCESS', 'FAILED', 'EXHAUSTED']).optional(),
});
