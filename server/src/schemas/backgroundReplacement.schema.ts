import { z } from 'zod';

export const BackgroundReplacementModeEnum = z.enum([
  'SOLID_COLOR',
  'TRANSPARENT',
  'STUDIO_PRESET',
  'GRADIENT',
  'MASK_INPAINT',
]);
export type BackgroundReplacementMode = z.infer<typeof BackgroundReplacementModeEnum>;

export const BackgroundPresetEnum = z.enum([
  'STUDIO_WHITE',
  'STUDIO_DARK',
  'TRANSPARENT_ALPHA',
  'WARM_GRADIENT',
  'NEON_CYBERPUNK',
  'OFFICE_BLUR',
  'OUTDOOR_NATURE',
  'CUSTOM',
]);
export type BackgroundPreset = z.infer<typeof BackgroundPresetEnum>;

export const inpaintBoxSchema = z.object({
  left: z.number().int().min(0, 'La coordenada left debe ser >= 0.'),
  top: z.number().int().min(0, 'La coordenada top debe ser >= 0.'),
  width: z.number().int().positive('El ancho width debe ser > 0.'),
  height: z.number().int().positive('El alto height debe ser > 0.'),
});
export type InpaintBoxInput = z.infer<typeof inpaintBoxSchema>;

export const createBackgroundReplacementBodySchema = z.object({
  mode: BackgroundReplacementModeEnum.default('SOLID_COLOR'),
  preset: BackgroundPresetEnum.default('STUDIO_WHITE'),
  background_color_hex: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Formato de color HEX inválido (#RRGGBB).')
    .optional(),
  threshold: z.number().min(0.01).max(0.90).optional(),
  inpaint_box: inpaintBoxSchema.optional(),
});
export type CreateBackgroundReplacementBodyInput = z.infer<
  typeof createBackgroundReplacementBodySchema
>;

export const listBackgroundReplacementsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  mode: BackgroundReplacementModeEnum.optional(),
  preset: BackgroundPresetEnum.optional(),
});
export type ListBackgroundReplacementsQueryInput = z.infer<
  typeof listBackgroundReplacementsQuerySchema
>;

export const backgroundReplacementParamSchema = z.object({
  id: z.coerce.number().int().positive('ID de activo debe ser un entero positivo.'),
  replacementId: z
    .coerce
    .number()
    .int()
    .positive('ID de reemplazo de fondo debe ser un entero positivo.')
    .optional(),
});
export type BackgroundReplacementParamInput = z.infer<
  typeof backgroundReplacementParamSchema
>;
