import { z } from 'zod';

export const AnonymizationStrategyEnum = z.enum([
  'GAUSSIAN_BLUR',
  'PIXELATE_MOSAIC',
  'BLACK_BAR_CENSOR',
]);

export type AnonymizationStrategy = z.infer<typeof AnonymizationStrategyEnum>;

export const boundingBoxSchema = z.object({
  left: z.number().int().min(0, 'La coordenada left debe ser mayor o igual a 0'),
  top: z.number().int().min(0, 'La coordenada top debe ser mayor o igual a 0'),
  width: z.number().int().positive('El ancho (width) debe ser un entero positivo mayor a 0'),
  height: z.number().int().positive('El alto (height) debe ser un entero positivo mayor a 0'),
  label: z.string().max(50).optional(),
});

export type BoundingBox = z.infer<typeof boundingBoxSchema>;

export const createFaceBlurringBodySchema = z.object({
  strategy: AnonymizationStrategyEnum.default('GAUSSIAN_BLUR'),
  blur_intensity: z
    .number()
    .int()
    .min(1, 'La intensidad de desenfoque mínima es 1')
    .max(50, 'La intensidad de desenfoque máxima es 50')
    .default(20),
  bounding_boxes: z
    .array(boundingBoxSchema)
    .min(1, 'Se requiere al menos una caja delimitadora para anonimizar')
    .max(50, 'El límite máximo es de 50 regiones de anonimización por solicitud'),
});

export type CreateFaceBlurringInput = z.infer<typeof createFaceBlurringBodySchema>;

export const listFaceBlurringsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  strategy: AnonymizationStrategyEnum.optional(),
});

export type ListFaceBlurringsQuery = z.infer<typeof listFaceBlurringsQuerySchema>;

export const faceBlurringParamSchema = z.object({
  id: z.coerce.number().int().positive('ID de activo inválido'),
  anonymizationId: z.coerce.number().int().positive('ID de anonimización inválido'),
});

export type FaceBlurringParams = z.infer<typeof faceBlurringParamSchema>;
