"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLeadCheckoutSessionSchema = exports.LEAD_DEPOSIT_STATUSES = exports.LEAD_PAYMENT_STATUSES = exports.LEAD_PAYMENT_TYPES = exports.sendLeadFollowUpEmailSchema = exports.FOLLOWUP_TEMPLATE_IDS = exports.createLeadActivitySchema = exports.updateLeadStatusSchema = exports.LEAD_ACTIVITY_TYPES = exports.LEAD_STATUSES = void 0;
const zod_1 = require("zod");
exports.LEAD_STATUSES = [
    'NEW',
    'CONTACTED',
    'QUALIFIED',
    'PROPOSAL_SENT',
    'NEGOTIATION',
    'WON',
    'LOST',
];
exports.LEAD_ACTIVITY_TYPES = [
    'STATUS_CHANGE',
    'NOTE',
    'EMAIL_SENT',
    'CALL_LOG',
    'MEETING_SCHEDULED',
];
exports.updateLeadStatusSchema = zod_1.z.object({
    status: zod_1.z.enum(exports.LEAD_STATUSES, {
        errorMap: () => ({ message: 'Estado comercial inválido.' }),
    }),
    note: zod_1.z.string().max(1000, 'La nota no puede exceder 1000 caracteres.').optional(),
});
exports.createLeadActivitySchema = zod_1.z.object({
    activity_type: zod_1.z.enum(exports.LEAD_ACTIVITY_TYPES, {
        errorMap: () => ({ message: 'Tipo de actividad inválido.' }),
    }),
    title: zod_1.z
        .string()
        .min(3, 'El título debe tener al menos 3 caracteres.')
        .max(128, 'El título no puede exceder 128 caracteres.'),
    details: zod_1.z.string().max(4000, 'Los detalles no pueden exceder 4000 caracteres.').optional(),
});
exports.FOLLOWUP_TEMPLATE_IDS = [
    'DIAGNOSTIC_INVITATION',
    'PROPOSAL_SUBMITTED',
    'CUSTOM_FOLLOWUP',
    'PAYMENT_LINK_INVITATION',
];
exports.sendLeadFollowUpEmailSchema = zod_1.z.object({
    template_id: zod_1.z.enum(exports.FOLLOWUP_TEMPLATE_IDS, {
        errorMap: () => ({ message: 'Plantilla de correo inválida.' }),
    }),
    subject: zod_1.z
        .string()
        .max(128, 'El asunto no puede exceder 128 caracteres.')
        .optional(),
    custom_message: zod_1.z
        .string()
        .max(2000, 'El mensaje personalizado no puede exceder 2000 caracteres.')
        .optional(),
});
exports.LEAD_PAYMENT_TYPES = ['DEPOSIT_50', 'FULL_PAYMENT', 'CUSTOM', 'SETTLEMENT'];
exports.LEAD_PAYMENT_STATUSES = ['PENDING', 'PAID', 'EXPIRED', 'CANCELLED'];
exports.LEAD_DEPOSIT_STATUSES = ['UNPAID', 'PENDING', 'PAID'];
exports.createLeadCheckoutSessionSchema = zod_1.z.object({
    payment_type: zod_1.z.enum(exports.LEAD_PAYMENT_TYPES, {
        errorMap: () => ({ message: 'Tipo de pago de anticipo inválido.' }),
    }).default('DEPOSIT_50'),
    custom_amount: zod_1.z.number().positive('El monto personalizado debe ser positivo.').optional(),
    notes: zod_1.z.string().max(500, 'Las notas no pueden exceder 500 caracteres.').optional(),
    description: zod_1.z.string().max(500, 'La descripción no puede exceder 500 caracteres.').optional(),
});
