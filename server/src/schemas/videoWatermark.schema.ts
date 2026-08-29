import { z } from 'zod';

export const VideoWatermarkTypeEnum = z.enum([
  'DYNAMIC_OVERLAY',
  'FORENSIC_STEGANOGRAPHIC',
  'BURNED_TIMECODE',
  'USER_IDENTIFIER_STAMP',
]);

export type VideoWatermarkType = z.infer<typeof VideoWatermarkTypeEnum>;

export const VideoWatermarkPositionStrategyEnum = z.enum([
  'STATIC_CORNER',
  'FLOATING_BOUNCE',
  'RANDOM_INTERVALS',
  'CENTER_TILED',
]);

export type VideoWatermarkPositionStrategy = z.infer<
  typeof VideoWatermarkPositionStrategyEnum
>;

export const createVideoWatermarkBodySchema = z.object({
  watermark_type: VideoWatermarkTypeEnum.optional().default('DYNAMIC_OVERLAY'),
  position_strategy: VideoWatermarkPositionStrategyEnum.optional().default(
    'STATIC_CORNER',
  ),
  opacity: z.coerce
    .number()
    .min(0.05, 'Opacidad mínima 0.05')
    .max(1.0, 'Opacidad máxima 1.00')
    .optional()
    .default(0.5),
  user_identifier: z.string().max(255, 'Máximo 255 caracteres').optional(),
  tracking_payload: z.record(z.string(), z.any()).optional(),
  text_overlay: z.string().max(255, 'Máximo 255 caracteres').optional(),
  font_size: z.coerce
    .number()
    .int()
    .min(10, 'Tamaño mínimo de fuente 10px')
    .max(120, 'Tamaño máximo de fuente 120px')
    .optional()
    .default(24),
  font_color: z
    .string()
    .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Color HEX inválido')
    .optional()
    .default('#FFFFFF'),
  interval_seconds: z.coerce
    .number()
    .min(1, 'Intervalo mínimo 1 segundo')
    .max(300, 'Intervalo máximo 300 segundos')
    .optional()
    .default(10),
  width: z.coerce
    .number()
    .int()
    .min(128)
    .max(3840)
    .optional()
    .default(1280),
  height: z.coerce
    .number()
    .int()
    .min(72)
    .max(2160)
    .optional()
    .default(720),
});

export type CreateVideoWatermarkBodyInput = z.infer<
  typeof createVideoWatermarkBodySchema
>;

export const listVideoWatermarkQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional().default(50),
  offset: z.coerce.number().int().nonnegative().optional().default(0),
  watermark_type: VideoWatermarkTypeEnum.optional(),
});

export type ListVideoWatermarkQueryInput = z.infer<
  typeof listVideoWatermarkQuerySchema
>;

export const videoWatermarkParamSchema = z.object({
  id: z.coerce.number().int().positive('ID de activo inválido'),
  watermarkId: z.coerce.number().int().positive('ID de marca de agua inválido'),
});

export type VideoWatermarkParamInput = z.infer<
  typeof videoWatermarkParamSchema
>;
