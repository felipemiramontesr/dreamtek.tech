"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.imageEnhancementParamSchema = exports.listImageEnhancementsQuerySchema = exports.createImageEnhancementBodySchema = exports.ImageEnhancementPresetEnum = void 0;
const zod_1 = require("zod");
exports.ImageEnhancementPresetEnum = zod_1.z.enum([
    'NATURAL_RESTORE',
    'VIBRANT',
    'WARM',
    'COOL',
    'VINTAGE_COLORIZED',
    'CINEMATIC',
    'HIGH_CONTRAST_BW',
    'CUSTOM',
]);
exports.createImageEnhancementBodySchema = zod_1.z.object({
    preset: exports.ImageEnhancementPresetEnum.default('NATURAL_RESTORE'),
    brightness: zod_1.z.number().min(0.1).max(3.0).optional(),
    contrast: zod_1.z.number().min(0.1).max(3.0).optional(),
    saturation: zod_1.z.number().min(0.0).max(3.0).optional(),
    sharpness: zod_1.z.number().min(0.0).max(5.0).optional(),
    gamma: zod_1.z.number().min(0.1).max(3.0).optional(),
    tint_hex: zod_1.z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Formato de color HEX inválido (#RRGGBB).').optional(),
});
exports.listImageEnhancementsQuerySchema = zod_1.z.object({
    limit: zod_1.z.coerce.number().int().min(1).max(100).default(50),
    offset: zod_1.z.coerce.number().int().min(0).default(0),
    preset: exports.ImageEnhancementPresetEnum.optional(),
});
exports.imageEnhancementParamSchema = zod_1.z.object({
    id: zod_1.z.coerce.number().int().positive('ID de activo debe ser un entero positivo.'),
    enhancementId: zod_1.z.coerce.number().int().positive('ID de realce debe ser un entero positivo.').optional(),
});
