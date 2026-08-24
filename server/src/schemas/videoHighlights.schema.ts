import { z } from 'zod';

export const AspectRatioEnum = z.enum(['16:9', '9:16', '1:1']);
export type AspectRatio = z.infer<typeof AspectRatioEnum>;

export const createVideoHighlightBodySchema = z.object({
  title: z.string().min(1, 'El título es obligatorio').max(255),
  aspect_ratio: AspectRatioEnum.optional().default('9:16'),
  target_duration_seconds: z.coerce
    .number()
    .int()
    .min(5, 'La duración mínima es de 5 segundos')
    .max(180, 'La duración máxima es de 180 segundos')
    .optional()
    .default(30),
});

export type CreateVideoHighlightBodyInput = z.infer<typeof createVideoHighlightBodySchema>;

export const listVideoHighlightsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional().default(50),
  offset: z.coerce.number().int().nonnegative().optional().default(0),
  aspect_ratio: AspectRatioEnum.optional(),
});

export type ListVideoHighlightsQueryInput = z.infer<typeof listVideoHighlightsQuerySchema>;

export const highlightIdParamSchema = z.object({
  id: z.coerce.number().int().positive('ID de activo inválido'),
  highlightId: z.coerce.number().int().positive('ID de highlight inválido'),
});

export type HighlightIdParamInput = z.infer<typeof highlightIdParamSchema>;
