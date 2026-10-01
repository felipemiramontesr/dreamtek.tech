"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dedupPolicyEnum = exports.deduplicateBodySchema = exports.dedupQuerySchema = void 0;
const zod_1 = require("zod");
exports.dedupQuerySchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().min(1).default(1),
    limit: zod_1.z.coerce.number().int().min(1).max(100).default(20),
    workspace_id: zod_1.z.coerce.number().int().positive().optional(),
    collection_id: zod_1.z.coerce.number().int().positive().optional(),
    mime_category: zod_1.z.enum(['image', 'video', 'audio', 'document']).optional(),
});
exports.deduplicateBodySchema = zod_1.z.object({
    canonical_asset_id: zod_1.z
        .number({ required_error: 'canonical_asset_id es obligatorio.' })
        .int('canonical_asset_id debe ser un número entero.')
        .positive('canonical_asset_id debe ser un entero positivo.'),
    duplicate_asset_ids: zod_1.z
        .array(zod_1.z
        .number()
        .int('Cada ID en duplicate_asset_ids debe ser un entero.')
        .positive('Cada ID en duplicate_asset_ids debe ser positivo.'))
        .min(1, 'Debe incluir al menos un ID en duplicate_asset_ids.')
        .max(100, 'No puede consolidar más de 100 activos en una sola operación.'),
    reason: zod_1.z.string().max(255, 'La razón no puede exceder 255 caracteres.').optional(),
});
exports.dedupPolicyEnum = zod_1.z.enum(['ALLOW_DUPLICATE', 'REJECT_DUPLICATE', 'LINK_EXISTING']);
