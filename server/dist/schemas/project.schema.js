"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminCreateProjectFromLeadSchema = exports.adminUpdateMilestoneSchema = exports.milestoneSignOffSchema = exports.adminUpdateProjectSchema = exports.clientBriefingSchema = exports.httpsUrlSchema = void 0;
const zod_1 = require("zod");
exports.httpsUrlSchema = zod_1.z
    .string()
    .url({ message: 'Debe ser una URL válida' })
    .refine((url) => url.startsWith('https://'), {
    message: 'La URL debe comenzar estrictamente con https://',
});
exports.clientBriefingSchema = zod_1.z.object({
    business_goals: zod_1.z
        .string()
        .min(5, { message: 'Los objetivos deben tener al menos 5 caracteres' })
        .max(4000, { message: 'Los objetivos no deben exceder 4000 caracteres' }),
    target_audience: zod_1.z.string().max(2000).optional().default(''),
    technical_stack_preferences: zod_1.z.string().max(2000).optional().default(''),
    infrastructure_notes: zod_1.z.string().max(2000).optional().default(''),
    reference_urls: zod_1.z
        .array(exports.httpsUrlSchema)
        .max(10, { message: 'Máximo 10 URLs de referencia permitidas' })
        .optional()
        .default([]),
    contact_lead_notes: zod_1.z.string().max(2000).optional().default(''),
});
exports.adminUpdateProjectSchema = zod_1.z.object({
    status: zod_1.z
        .enum([
        'ONBOARDING_BRIEF',
        'ARCHITECTURE_DESIGN',
        'IN_DEVELOPMENT',
        'STAGING_REVIEW',
        'SETTLEMENT_PENDING',
        'COMPLETED_DELIVERED',
        'ON_HOLD',
    ])
        .optional(),
    staging_url: exports.httpsUrlSchema.nullable().optional(),
    repository_url: exports.httpsUrlSchema.nullable().optional(),
    project_name: zod_1.z.string().min(1).max(255).optional(),
});
exports.milestoneSignOffSchema = zod_1.z.object({
    accepted: zod_1.z.literal(true, {
        errorMap: () => ({ message: 'Debe aceptar formalmente el entregable' }),
    }),
    feedback: zod_1.z.string().max(2000).optional().default(''),
});
exports.adminUpdateMilestoneSchema = zod_1.z.object({
    status: zod_1.z.enum(['PENDING', 'IN_PROGRESS', 'REVIEW', 'COMPLETED']),
    title: zod_1.z.string().min(1).max(255).optional(),
    description: zod_1.z.string().max(1000).nullable().optional(),
    target_week: zod_1.z.number().int().min(1).max(52).optional(),
});
exports.adminCreateProjectFromLeadSchema = zod_1.z.object({
    project_name: zod_1.z.string().min(1).max(255).optional(),
    vertical: zod_1.z.string().min(1).max(64).optional(),
    estimated_weeks: zod_1.z.number().int().min(1).max(52).optional(),
    paid_amount_cents: zod_1.z.number().int().min(0).optional(),
});
