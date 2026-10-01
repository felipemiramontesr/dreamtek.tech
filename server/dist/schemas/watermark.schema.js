"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.watermarkParamSchema = exports.listWatermarksQuerySchema = exports.createWatermarkBodySchema = exports.WatermarkPositionEnum = exports.WatermarkTypeEnum = void 0;
const zod_1 = require("zod");
exports.WatermarkTypeEnum = zod_1.z.enum(['TEXT', 'IMAGE']);
exports.WatermarkPositionEnum = zod_1.z.enum([
    'CENTER',
    'TOP_LEFT',
    'TOP_RIGHT',
    'BOTTOM_LEFT',
    'BOTTOM_RIGHT',
    'TILED_PATTERN',
]);
exports.createWatermarkBodySchema = zod_1.z
    .object({
    watermark_type: exports.WatermarkTypeEnum,
    watermark_text: zod_1.z.string().min(1, 'El texto no puede estar vacío').max(255, 'El texto excede 255 caracteres').optional(),
    watermark_asset_id: zod_1.z.coerce.number().int().positive('ID de activo de marca de agua inválido').optional(),
    position: exports.WatermarkPositionEnum.default('BOTTOM_RIGHT'),
    opacity: zod_1.z.coerce.number().min(0.05, 'La opacidad mínima es 0.05').max(1.0, 'La opacidad máxima es 1.0').default(0.5),
    rotation: zod_1.z.coerce.number().int().min(-180, 'La rotación mínima es -180').max(180, 'La rotación máxima es 180').default(0),
})
    .superRefine((data, ctx) => {
    if (data.watermark_type === 'TEXT' && (!data.watermark_text || data.watermark_text.trim().length === 0)) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: 'El texto de la marca de agua es obligatorio para el tipo TEXT.',
            path: ['watermark_text'],
        });
    }
    if (data.watermark_type === 'IMAGE' && (!data.watermark_asset_id || data.watermark_asset_id <= 0)) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: 'El ID del activo de la marca de agua es obligatorio para el tipo IMAGE.',
            path: ['watermark_asset_id'],
        });
    }
});
exports.listWatermarksQuerySchema = zod_1.z.object({
    limit: zod_1.z.coerce.number().int().positive().max(100).default(50),
    offset: zod_1.z.coerce.number().int().nonnegative().default(0),
    watermark_type: exports.WatermarkTypeEnum.optional(),
    position: exports.WatermarkPositionEnum.optional(),
});
exports.watermarkParamSchema = zod_1.z.object({
    id: zod_1.z.coerce.number().int().positive('ID de activo inválido'),
    watermarkId: zod_1.z.coerce.number().int().positive('ID de marca de agua inválido'),
});
