import { z } from 'zod';

export const WatermarkTypeEnum = z.enum(['TEXT', 'IMAGE']);
export type WatermarkType = z.infer<typeof WatermarkTypeEnum>;

export const WatermarkPositionEnum = z.enum([
  'CENTER',
  'TOP_LEFT',
  'TOP_RIGHT',
  'BOTTOM_LEFT',
  'BOTTOM_RIGHT',
  'TILED_PATTERN',
]);
export type WatermarkPosition = z.infer<typeof WatermarkPositionEnum>;

export const createWatermarkBodySchema = z
  .object({
    watermark_type: WatermarkTypeEnum,
    watermark_text: z.string().min(1, 'El texto no puede estar vacío').max(255, 'El texto excede 255 caracteres').optional(),
    watermark_asset_id: z.coerce.number().int().positive('ID de activo de marca de agua inválido').optional(),
    position: WatermarkPositionEnum.default('BOTTOM_RIGHT'),
    opacity: z.coerce.number().min(0.05, 'La opacidad mínima es 0.05').max(1.0, 'La opacidad máxima es 1.0').default(0.5),
    rotation: z.coerce.number().int().min(-180, 'La rotación mínima es -180').max(180, 'La rotación máxima es 180').default(0),
  })
  .superRefine((data, ctx) => {
    if (data.watermark_type === 'TEXT' && (!data.watermark_text || data.watermark_text.trim().length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'El texto de la marca de agua es obligatorio para el tipo TEXT.',
        path: ['watermark_text'],
      });
    }
    if (data.watermark_type === 'IMAGE' && (!data.watermark_asset_id || data.watermark_asset_id <= 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'El ID del activo de la marca de agua es obligatorio para el tipo IMAGE.',
        path: ['watermark_asset_id'],
      });
    }
  });

export type CreateWatermarkInput = z.infer<typeof createWatermarkBodySchema>;

export const listWatermarksQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
  watermark_type: WatermarkTypeEnum.optional(),
  position: WatermarkPositionEnum.optional(),
});

export type ListWatermarksQuery = z.infer<typeof listWatermarksQuerySchema>;

export const watermarkParamSchema = z.object({
  id: z.coerce.number().int().positive('ID de activo inválido'),
  watermarkId: z.coerce.number().int().positive('ID de marca de agua inválido'),
});
