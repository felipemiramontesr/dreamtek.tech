"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bannerAdaptationParamSchema = exports.listBannerAdaptationsQuerySchema = exports.createBannerAdaptationBodySchema = exports.manualCropSchema = exports.BannerStrategyEnum = exports.BannerPresetEnum = void 0;
const zod_1 = require("zod");
exports.BannerPresetEnum = zod_1.z.enum([
    '16:9_LANDSCAPE',
    '1:1_SQUARE',
    '9:16_STORY',
    '4:5_PORTRAIT',
    '21:9_ULTRAWIDE',
    '4:3_STANDARD',
    'CUSTOM',
]);
exports.BannerStrategyEnum = zod_1.z.enum([
    'ENTROPY',
    'ATTENTION',
    'CENTER',
    'NORTH',
    'SOUTH',
    'EAST',
    'WEST',
    'MANUAL_COORDINATES',
]);
exports.manualCropSchema = zod_1.z.object({
    left: zod_1.z.coerce.number().int().nonnegative('Coordenada left debe ser no negativa'),
    top: zod_1.z.coerce.number().int().nonnegative('Coordenada top debe ser no negativa'),
    width: zod_1.z.coerce.number().int().positive('Ancho de recorte debe ser positivo'),
    height: zod_1.z.coerce.number().int().positive('Alto de recorte debe ser positivo'),
});
exports.createBannerAdaptationBodySchema = zod_1.z
    .object({
    preset: exports.BannerPresetEnum,
    strategy: exports.BannerStrategyEnum.default('ENTROPY'),
    target_width: zod_1.z
        .coerce
        .number()
        .int()
        .min(16, 'El ancho mínimo es 16 px')
        .max(8192, 'El ancho máximo es 8192 px')
        .optional(),
    target_height: zod_1.z
        .coerce
        .number()
        .int()
        .min(16, 'El alto mínimo es 16 px')
        .max(8192, 'El alto máximo es 8192 px')
        .optional(),
    manual_crop: exports.manualCropSchema.optional(),
})
    .superRefine((data, ctx) => {
    if (data.preset === 'CUSTOM' && (!data.target_width || !data.target_height)) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: 'target_width y target_height son obligatorios para el preset CUSTOM.',
            path: ['target_width'],
        });
    }
    if (data.strategy === 'MANUAL_COORDINATES' && !data.manual_crop) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: 'Las coordenadas manual_crop son obligatorias para la estrategia MANUAL_COORDINATES.',
            path: ['manual_crop'],
        });
    }
});
exports.listBannerAdaptationsQuerySchema = zod_1.z.object({
    limit: zod_1.z.coerce.number().int().positive().max(100).default(50),
    offset: zod_1.z.coerce.number().int().nonnegative().default(0),
    preset: exports.BannerPresetEnum.optional(),
    strategy: exports.BannerStrategyEnum.optional(),
});
exports.bannerAdaptationParamSchema = zod_1.z.object({
    id: zod_1.z.coerce.number().int().positive('ID de activo inválido'),
    adaptationId: zod_1.z.coerce.number().int().positive('ID de adaptación inválido'),
});
