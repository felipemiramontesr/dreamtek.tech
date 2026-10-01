"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createClientWebhookSchema = exports.WEBHOOK_EVENT_TYPES = exports.createNotificationSchema = exports.NOTIFICATION_SEVERITIES = exports.NOTIFICATION_TYPES = void 0;
const zod_1 = require("zod");
exports.NOTIFICATION_TYPES = ['SECURITY_ALERT', 'PROJECT_UPDATE', 'BILLING_EVENT'];
exports.NOTIFICATION_SEVERITIES = ['INFO', 'WARNING', 'CRITICAL'];
exports.createNotificationSchema = zod_1.z.object({
    type: zod_1.z.enum(exports.NOTIFICATION_TYPES),
    severity: zod_1.z.enum(exports.NOTIFICATION_SEVERITIES).default('INFO'),
    title: zod_1.z.string().trim().min(1, 'El título es requerido').max(255),
    message: zod_1.z.string().trim().min(1, 'El mensaje es requerido'),
    action_url: zod_1.z
        .string()
        .trim()
        .max(255)
        .regex(/^\/client\/dashboard(\/[a-zA-Z0-9_\-./]*)?$/, {
        message: 'action_url debe ser una ruta interna segura que inicie con /client/dashboard',
    })
        .optional()
        .nullable(),
});
exports.WEBHOOK_EVENT_TYPES = [
    'auth.login',
    'mfa.challenge',
    'mfa.enabled',
    'mfa.disabled',
    'project.created',
    'project.milestone_updated',
    'project.settlement_completed',
    'billing.deposit_paid',
    'billing.invoice_requested',
];
exports.createClientWebhookSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(1, 'El nombre es requerido').max(128),
    target_url: zod_1.z.string().trim().url('Debe ser una URL válida').max(1024),
    events: zod_1.z.array(zod_1.z.enum(exports.WEBHOOK_EVENT_TYPES)).min(1, 'Debes seleccionar al menos un evento'),
});
