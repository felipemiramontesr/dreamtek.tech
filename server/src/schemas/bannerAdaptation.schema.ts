import { z } from 'zod';

export const BannerPresetEnum = z.enum([
  '16:9_LANDSCAPE',
  '1:1_SQUARE',
  '9:16_STORY',
  '4:5_PORTRAIT',
  '21:9_ULTRAWIDE',
  '4:3_STANDARD',
  'CUSTOM',
]);
export type BannerPreset = z.infer<typeof BannerPresetEnum>;

export const BannerStrategyEnum = z.enum([
  'ENTROPY',
  'ATTENTION',
  'CENTER',
  'NORTH',
  'SOUTH',
  'EAST',
  'WEST',
  'MANUAL_COORDINATES',
]);
export type BannerStrategy = z.infer<typeof BannerStrategyEnum>;

export const manualCropSchema = z.object({
  left: z.coerce.number().int().nonnegative('Coordenada left debe ser no negativa'),
  top: z.coerce.number().int().nonnegative('Coordenada top debe ser no negativa'),
  width: z.coerce.number().int().positive('Ancho de recorte debe ser positivo'),
  height: z.coerce.number().int().positive('Alto de recorte debe ser positivo'),
});
export type ManualCropCoordinates = z.infer<typeof manualCropSchema>;

export const createBannerAdaptationBodySchema = z
  .object({
    preset: BannerPresetEnum,
    strategy: BannerStrategyEnum.default('ENTROPY'),
    target_width: z
      .coerce
      .number()
      .int()
      .min(16, 'El ancho mínimo es 16 px')
      .max(8192, 'El ancho máximo es 8192 px')
      .optional(),
    target_height: z
      .coerce
      .number()
      .int()
      .min(16, 'El alto mínimo es 16 px')
      .max(8192, 'El alto máximo es 8192 px')
      .optional(),
    manual_crop: manualCropSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.preset === 'CUSTOM' && (!data.target_width || !data.target_height)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'target_width y target_height son obligatorios para el preset CUSTOM.',
        path: ['target_width'],
      });
    }
    if (data.strategy === 'MANUAL_COORDINATES' && !data.manual_crop) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Las coordenadas manual_crop son obligatorias para la estrategia MANUAL_COORDINATES.',
        path: ['manual_crop'],
      });
    }
  });

export type CreateBannerAdaptationInput = z.infer<typeof createBannerAdaptationBodySchema>;

export const listBannerAdaptationsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
  preset: BannerPresetEnum.optional(),
  strategy: BannerStrategyEnum.optional(),
});

export type ListBannerAdaptationsQuery = z.infer<typeof listBannerAdaptationsQuerySchema>;

export const bannerAdaptationParamSchema = z.object({
  id: z.coerce.number().int().positive('ID de activo inválido'),
  adaptationId: z.coerce.number().int().positive('ID de adaptación inválido'),
});
