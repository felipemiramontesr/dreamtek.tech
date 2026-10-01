"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.superResolutionParamSchema = exports.listSuperResolutionsQuerySchema = exports.createSuperResolutionBodySchema = exports.UpscaleAlgorithmEnum = exports.ScaleFactorEnum = void 0;
const zod_1 = require("zod");
exports.ScaleFactorEnum = zod_1.z.enum(['2x', '4x']);
exports.UpscaleAlgorithmEnum = zod_1.z.enum([
    'LANCZOS3_SHARP',
    'BICUBIC_SMOOTH',
    'EDGES_ENHANCED',
]);
exports.createSuperResolutionBodySchema = zod_1.z.object({
    scale_factor: exports.ScaleFactorEnum.default('2x'),
    algorithm: exports.UpscaleAlgorithmEnum.default('LANCZOS3_SHARP'),
    denoise_level: zod_1.z
        .number()
        .int()
        .min(0, 'El nivel de reducción de ruido debe ser mayor o igual a 0')
        .max(50, 'El nivel de reducción de ruido máximo es 50')
        .default(10),
    sharpness_boost: zod_1.z
        .number()
        .int()
        .min(0, 'El realce de nitidez debe ser mayor o igual a 0')
        .max(50, 'El realce de nitidez máximo es 50')
        .default(20),
});
exports.listSuperResolutionsQuerySchema = zod_1.z.object({
    limit: zod_1.z.coerce.number().int().positive().max(100).default(50),
    offset: zod_1.z.coerce.number().int().min(0).default(0),
    scale_factor: exports.ScaleFactorEnum.optional(),
    algorithm: exports.UpscaleAlgorithmEnum.optional(),
});
exports.superResolutionParamSchema = zod_1.z.object({
    id: zod_1.z.coerce.number().int().positive('ID de activo inválido'),
    upscaleId: zod_1.z.coerce.number().int().positive('ID de super-resolución inválido'),
});
