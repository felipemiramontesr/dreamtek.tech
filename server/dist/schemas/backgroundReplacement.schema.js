"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.backgroundReplacementParamSchema = exports.listBackgroundReplacementsQuerySchema = exports.createBackgroundReplacementBodySchema = exports.inpaintBoxSchema = exports.BackgroundPresetEnum = exports.BackgroundReplacementModeEnum = void 0;
const zod_1 = require("zod");
exports.BackgroundReplacementModeEnum = zod_1.z.enum([
    'SOLID_COLOR',
    'TRANSPARENT',
    'STUDIO_PRESET',
    'GRADIENT',
    'MASK_INPAINT',
]);
exports.BackgroundPresetEnum = zod_1.z.enum([
    'STUDIO_WHITE',
    'STUDIO_DARK',
    'TRANSPARENT_ALPHA',
    'WARM_GRADIENT',
    'NEON_CYBERPUNK',
    'OFFICE_BLUR',
    'OUTDOOR_NATURE',
    'CUSTOM',
]);
exports.inpaintBoxSchema = zod_1.z.object({
    left: zod_1.z.number().int().min(0, 'La coordenada left debe ser >= 0.'),
    top: zod_1.z.number().int().min(0, 'La coordenada top debe ser >= 0.'),
    width: zod_1.z.number().int().positive('El ancho width debe ser > 0.'),
    height: zod_1.z.number().int().positive('El alto height debe ser > 0.'),
});
exports.createBackgroundReplacementBodySchema = zod_1.z.object({
    mode: exports.BackgroundReplacementModeEnum.default('SOLID_COLOR'),
    preset: exports.BackgroundPresetEnum.default('STUDIO_WHITE'),
    background_color_hex: zod_1.z
        .string()
        .regex(/^#[0-9A-Fa-f]{6}$/, 'Formato de color HEX inválido (#RRGGBB).')
        .optional(),
    threshold: zod_1.z.number().min(0.01).max(0.90).optional(),
    inpaint_box: exports.inpaintBoxSchema.optional(),
});
exports.listBackgroundReplacementsQuerySchema = zod_1.z.object({
    limit: zod_1.z.coerce.number().int().min(1).max(100).default(50),
    offset: zod_1.z.coerce.number().int().min(0).default(0),
    mode: exports.BackgroundReplacementModeEnum.optional(),
    preset: exports.BackgroundPresetEnum.optional(),
});
exports.backgroundReplacementParamSchema = zod_1.z.object({
    id: zod_1.z.coerce.number().int().positive('ID de activo debe ser un entero positivo.'),
    replacementId: zod_1.z
        .coerce
        .number()
        .int()
        .positive('ID de reemplazo de fondo debe ser un entero positivo.')
        .optional(),
});
