import { z } from 'zod';

export const TargetFormatEnum = z.enum(['WEBP', 'AVIF', 'JPEG', 'PNG']);
export type TargetFormat = z.infer<typeof TargetFormatEnum>;

export const QualityPresetEnum = z.enum([
  'HIGH_FIDELITY',
  'BALANCED',
  'MAX_COMPRESSION',
  'LOSSLESS',
  'CUSTOM',
]);
export type QualityPreset = z.infer<typeof QualityPresetEnum>;

export const createCompressionBodySchema = z.object({
  target_format: TargetFormatEnum,
  quality_preset: QualityPresetEnum.optional().default('BALANCED'),
  quality: z.coerce.number().int().min(1).max(100).optional(),
  effort: z.coerce.number().int().min(1).max(6).optional(),
  strip_metadata: z.boolean().optional().default(true),
  lossless: z.boolean().optional().default(false),
});
export type CreateCompressionInput = z.infer<typeof createCompressionBodySchema>;

export const listCompressionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
  target_format: TargetFormatEnum.optional(),
  quality_preset: QualityPresetEnum.optional(),
});
export type ListCompressionsQuery = z.infer<typeof listCompressionsQuerySchema>;

export const compressionParamSchema = z.object({
  id: z.coerce.number().int().positive({ message: 'El ID de activo debe ser un entero positivo.' }),
  compressionId: z.coerce.number().int().positive({ message: 'El ID de compresión debe ser un entero positivo.' }),
});
