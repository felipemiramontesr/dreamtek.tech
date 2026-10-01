"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.restoreAssetBodySchema = exports.archiveAssetBodySchema = exports.restorationStatusEnum = exports.restorationTierEnum = exports.archiveProviderEnum = void 0;
const zod_1 = require("zod");
exports.archiveProviderEnum = zod_1.z.enum([
    'AWS_GLACIER',
    'AWS_S3_STANDARD',
    'AZURE_BLOB_ARCHIVE',
    'GCS_COLDLINE',
    'CUSTOM_OBJECT_STORAGE',
]);
exports.restorationTierEnum = zod_1.z.enum(['EXPEDITED', 'STANDARD', 'BULK']);
exports.restorationStatusEnum = zod_1.z.enum([
    'NONE',
    'REQUESTED',
    'IN_PROGRESS',
    'RESTORED',
    'EXPIRED',
]);
exports.archiveAssetBodySchema = zod_1.z.object({
    archive_provider: exports.archiveProviderEnum.default('AWS_GLACIER'),
    reason: zod_1.z.string().trim().max(500, 'El motivo no puede exceder los 500 caracteres').optional(),
});
exports.restoreAssetBodySchema = zod_1.z.object({
    restoration_tier: exports.restorationTierEnum.default('STANDARD'),
    days_valid: zod_1.z
        .number()
        .int('Los días de validez deben ser un entero')
        .min(1, 'Mínimo 1 día de validez')
        .max(30, 'Máximo 30 días de validez')
        .default(7),
});
