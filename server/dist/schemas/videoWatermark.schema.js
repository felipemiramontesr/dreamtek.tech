"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.videoWatermarkParamSchema = exports.listVideoWatermarkQuerySchema = exports.createVideoWatermarkBodySchema = exports.VideoWatermarkPositionStrategyEnum = exports.VideoWatermarkTypeEnum = void 0;
const zod_1 = require("zod");
exports.VideoWatermarkTypeEnum = zod_1.z.enum([
    'DYNAMIC_OVERLAY',
    'FORENSIC_STEGANOGRAPHIC',
    'BURNED_TIMECODE',
    'USER_IDENTIFIER_STAMP',
]);
exports.VideoWatermarkPositionStrategyEnum = zod_1.z.enum([
    'STATIC_CORNER',
    'FLOATING_BOUNCE',
    'RANDOM_INTERVALS',
    'CENTER_TILED',
]);
exports.createVideoWatermarkBodySchema = zod_1.z.object({
    watermark_type: exports.VideoWatermarkTypeEnum.optional().default('DYNAMIC_OVERLAY'),
    position_strategy: exports.VideoWatermarkPositionStrategyEnum.optional().default('STATIC_CORNER'),
    opacity: zod_1.z.coerce
        .number()
        .min(0.05, 'Opacidad mínima 0.05')
        .max(1.0, 'Opacidad máxima 1.00')
        .optional()
        .default(0.5),
    user_identifier: zod_1.z.string().max(255, 'Máximo 255 caracteres').optional(),
    tracking_payload: zod_1.z.record(zod_1.z.string(), zod_1.z.any()).optional(),
    text_overlay: zod_1.z.string().max(255, 'Máximo 255 caracteres').optional(),
    font_size: zod_1.z.coerce
        .number()
        .int()
        .min(10, 'Tamaño mínimo de fuente 10px')
        .max(120, 'Tamaño máximo de fuente 120px')
        .optional()
        .default(24),
    font_color: zod_1.z
        .string()
        .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Color HEX inválido')
        .optional()
        .default('#FFFFFF'),
    interval_seconds: zod_1.z.coerce
        .number()
        .min(1, 'Intervalo mínimo 1 segundo')
        .max(300, 'Intervalo máximo 300 segundos')
        .optional()
        .default(10),
    width: zod_1.z.coerce
        .number()
        .int()
        .min(128)
        .max(3840)
        .optional()
        .default(1280),
    height: zod_1.z.coerce
        .number()
        .int()
        .min(72)
        .max(2160)
        .optional()
        .default(720),
});
exports.listVideoWatermarkQuerySchema = zod_1.z.object({
    limit: zod_1.z.coerce.number().int().positive().max(100).optional().default(50),
    offset: zod_1.z.coerce.number().int().nonnegative().optional().default(0),
    watermark_type: exports.VideoWatermarkTypeEnum.optional(),
});
exports.videoWatermarkParamSchema = zod_1.z.object({
    id: zod_1.z.coerce.number().int().positive('ID de activo inválido'),
    watermarkId: zod_1.z.coerce.number().int().positive('ID de marca de agua inválido'),
});
