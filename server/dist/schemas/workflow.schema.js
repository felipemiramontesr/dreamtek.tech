"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.workflowExecutionsQuerySchema = exports.updateWorkflowBodySchema = exports.createWorkflowBodySchema = exports.workflowActionSchema = exports.actionTypeSchema = exports.actionTypeEnum = exports.workflowConditionSchema = exports.conditionOperatorSchema = exports.conditionOperatorEnum = exports.triggerEventSchema = exports.triggerEventEnum = void 0;
const zod_1 = require("zod");
exports.triggerEventEnum = [
    'ASSET_CREATED',
    'ASSET_UPDATED',
    'ASSET_TAGGED',
    'AI_ANALYZED',
    'RIGHTS_EXPIRED',
    'MANUAL',
];
exports.triggerEventSchema = zod_1.z.enum(exports.triggerEventEnum);
exports.conditionOperatorEnum = [
    'EQUALS',
    'NOT_EQUALS',
    'CONTAINS',
    'STARTS_WITH',
    'GREATER_THAN',
    'LESS_THAN',
    'IN_ARRAY',
];
exports.conditionOperatorSchema = zod_1.z.enum(exports.conditionOperatorEnum);
exports.workflowConditionSchema = zod_1.z.object({
    field: zod_1.z
        .string()
        .trim()
        .min(1, 'El campo de la condición es obligatorio.')
        .max(64, 'El campo no puede exceder 64 caracteres.'),
    operator: exports.conditionOperatorSchema,
    value: zod_1.z.union([zod_1.z.string(), zod_1.z.number(), zod_1.z.boolean(), zod_1.z.array(zod_1.z.string()), zod_1.z.array(zod_1.z.number())]),
});
exports.actionTypeEnum = [
    'APPLY_TAGS',
    'MOVE_TO_COLLECTION',
    'SET_RIGHTS',
    'ARCHIVE_ASSET',
    'TRIGGER_WEBHOOK',
    'TRIGGER_AI_ANALYSIS',
];
exports.actionTypeSchema = zod_1.z.enum(exports.actionTypeEnum);
exports.workflowActionSchema = zod_1.z.object({
    type: exports.actionTypeSchema,
    params: zod_1.z.record(zod_1.z.any()).optional().default({}),
});
exports.createWorkflowBodySchema = zod_1.z.object({
    name: zod_1.z
        .string()
        .trim()
        .min(2, 'El nombre del flujo de trabajo debe tener al menos 2 caracteres.')
        .max(128, 'El nombre no puede exceder 128 caracteres.'),
    description: zod_1.z
        .string()
        .trim()
        .max(500, 'La descripción no puede exceder 500 caracteres.')
        .optional()
        .nullable(),
    trigger_event: exports.triggerEventSchema,
    conditions: zod_1.z.array(exports.workflowConditionSchema).default([]),
    actions: zod_1.z
        .array(exports.workflowActionSchema)
        .min(1, 'El flujo de trabajo debe contener al menos una acción.'),
    is_active: zod_1.z.boolean().optional().default(true),
});
exports.updateWorkflowBodySchema = zod_1.z.object({
    name: zod_1.z
        .string()
        .trim()
        .min(2, 'El nombre del flujo de trabajo debe tener al menos 2 caracteres.')
        .max(128, 'El nombre no puede exceder 128 caracteres.')
        .optional(),
    description: zod_1.z
        .string()
        .trim()
        .max(500, 'La descripción no puede exceder 500 caracteres.')
        .optional()
        .nullable(),
    trigger_event: exports.triggerEventSchema.optional(),
    conditions: zod_1.z.array(exports.workflowConditionSchema).optional(),
    actions: zod_1.z
        .array(exports.workflowActionSchema)
        .min(1, 'El flujo de trabajo debe contener al menos una acción.')
        .optional(),
    is_active: zod_1.z.boolean().optional(),
});
exports.workflowExecutionsQuerySchema = zod_1.z.object({
    limit: zod_1.z
        .string()
        .optional()
        .transform((val) => (val !== undefined ? parseInt(val, 10) : 20))
        .refine((val) => !isNaN(val) && val >= 1 && val <= 50, {
        message: 'limit debe ser un entero entre 1 y 50',
    }),
    status: zod_1.z.enum(['SUCCESS', 'FAILED', 'SKIPPED']).optional(),
});
