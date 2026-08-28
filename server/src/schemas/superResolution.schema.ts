import { z } from 'zod';

export const ScaleFactorEnum = z.enum(['2x', '4x']);

export type ScaleFactor = z.infer<typeof ScaleFactorEnum>;

export const UpscaleAlgorithmEnum = z.enum([
  'LANCZOS3_SHARP',
  'BICUBIC_SMOOTH',
  'EDGES_ENHANCED',
]);

export type UpscaleAlgorithm = z.infer<typeof UpscaleAlgorithmEnum>;

export const createSuperResolutionBodySchema = z.object({
  scale_factor: ScaleFactorEnum.default('2x'),
  algorithm: UpscaleAlgorithmEnum.default('LANCZOS3_SHARP'),
  denoise_level: z
    .number()
    .int()
    .min(0, 'El nivel de reducción de ruido debe ser mayor o igual a 0')
    .max(50, 'El nivel de reducción de ruido máximo es 50')
    .default(10),
  sharpness_boost: z
    .number()
    .int()
    .min(0, 'El realce de nitidez debe ser mayor o igual a 0')
    .max(50, 'El realce de nitidez máximo es 50')
    .default(20),
});

export type CreateSuperResolutionInput = z.infer<typeof createSuperResolutionBodySchema>;

export const listSuperResolutionsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  scale_factor: ScaleFactorEnum.optional(),
  algorithm: UpscaleAlgorithmEnum.optional(),
});

export type ListSuperResolutionsQuery = z.infer<typeof listSuperResolutionsQuerySchema>;

export const superResolutionParamSchema = z.object({
  id: z.coerce.number().int().positive('ID de activo inválido'),
  upscaleId: z.coerce.number().int().positive('ID de super-resolución inválido'),
});

export type SuperResolutionParams = z.infer<typeof superResolutionParamSchema>;
