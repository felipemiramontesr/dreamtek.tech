import { z } from 'zod';

export const ImageEnhancementPresetEnum = z.enum([
  'NATURAL_RESTORE',
  'VIBRANT',
  'WARM',
  'COOL',
  'VINTAGE_COLORIZED',
  'CINEMATIC',
  'HIGH_CONTRAST_BW',
  'CUSTOM',
]);
export type ImageEnhancementPreset = z.infer<typeof ImageEnhancementPresetEnum>;

export const createImageEnhancementBodySchema = z.object({
  preset: ImageEnhancementPresetEnum.default('NATURAL_RESTORE'),
  brightness: z.number().min(0.1).max(3.0).optional(),
  contrast: z.number().min(0.1).max(3.0).optional(),
  saturation: z.number().min(0.0).max(3.0).optional(),
  sharpness: z.number().min(0.0).max(5.0).optional(),
  gamma: z.number().min(0.1).max(3.0).optional(),
  tint_hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Formato de color HEX inválido (#RRGGBB).').optional(),
});
export type CreateImageEnhancementBodyInput = z.infer<typeof createImageEnhancementBodySchema>;

export const listImageEnhancementsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  preset: ImageEnhancementPresetEnum.optional(),
});
export type ListImageEnhancementsQueryInput = z.infer<typeof listImageEnhancementsQuerySchema>;

export const imageEnhancementParamSchema = z.object({
  id: z.coerce.number().int().positive('ID de activo debe ser un entero positivo.'),
  enhancementId: z.coerce.number().int().positive('ID de realce debe ser un entero positivo.').optional(),
});
export type ImageEnhancementParamInput = z.infer<typeof imageEnhancementParamSchema>;
