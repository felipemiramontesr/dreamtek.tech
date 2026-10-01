"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.compressionParamSchema = exports.listCompressionsQuerySchema = exports.createCompressionBodySchema = exports.QualityPresetEnum = exports.TargetFormatEnum = void 0;
const zod_1 = require("zod");
exports.TargetFormatEnum = zod_1.z.enum(['WEBP', 'AVIF', 'JPEG', 'PNG']);
exports.QualityPresetEnum = zod_1.z.enum([
    'HIGH_FIDELITY',
    'BALANCED',
    'MAX_COMPRESSION',
    'LOSSLESS',
    'CUSTOM',
]);
exports.createCompressionBodySchema = zod_1.z.object({
    target_format: exports.TargetFormatEnum,
    quality_preset: exports.QualityPresetEnum.optional().default('BALANCED'),
    quality: zod_1.z.coerce.number().int().min(1).max(100).optional(),
    effort: zod_1.z.coerce.number().int().min(1).max(6).optional(),
    strip_metadata: zod_1.z.boolean().optional().default(true),
    lossless: zod_1.z.boolean().optional().default(false),
});
exports.listCompressionsQuerySchema = zod_1.z.object({
    limit: zod_1.z.coerce.number().int().min(1).max(100).optional().default(50),
    offset: zod_1.z.coerce.number().int().min(0).optional().default(0),
    target_format: exports.TargetFormatEnum.optional(),
    quality_preset: exports.QualityPresetEnum.optional(),
});
exports.compressionParamSchema = zod_1.z.object({
    id: zod_1.z.coerce.number().int().positive({ message: 'El ID de activo debe ser un entero positivo.' }),
    compressionId: zod_1.z.coerce.number().int().positive({ message: 'El ID de compresión debe ser un entero positivo.' }),
});
