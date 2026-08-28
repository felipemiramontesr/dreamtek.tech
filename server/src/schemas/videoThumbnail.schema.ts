import { z } from 'zod';

export const VideoThumbnailTypeEnum = z.enum([
  'STATIC_POSTER',
  'ANIMATED_GIF',
  'ANIMATED_WEBP',
  'HOVER_SCRUBBER_VTT',
]);
export type VideoThumbnailType = z.infer<typeof VideoThumbnailTypeEnum>;

export const createVideoThumbnailBodySchema = z.object({
  thumbnail_type: VideoThumbnailTypeEnum.default('STATIC_POSTER'),
  timestamp_offset_seconds: z
    .coerce
    .number()
    .nonnegative('El desplazamiento de tiempo debe ser mayor o igual a 0')
    .default(0),
  duration_seconds: z
    .coerce
    .number()
    .min(1, 'La duración mínima es 1s')
    .max(10, 'La duración máxima es 10s')
    .default(3),
  width: z.coerce.number().int().positive().max(3840).default(640),
  height: z.coerce.number().int().positive().max(2160).default(360),
  fps: z
    .coerce
    .number()
    .int()
    .min(1, 'El valor mínimo de FPS es 1')
    .max(30, 'El valor máximo de FPS es 30')
    .default(10),
});
export type CreateVideoThumbnailInput = z.infer<typeof createVideoThumbnailBodySchema>;

export const listVideoThumbnailsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
  thumbnail_type: VideoThumbnailTypeEnum.optional(),
});
export type ListVideoThumbnailsQuery = z.infer<typeof listVideoThumbnailsQuerySchema>;

export const videoThumbnailParamSchema = z.object({
  id: z.coerce.number().int().positive('ID de activo inválido'),
  thumbnailId: z.coerce.number().int().positive('ID de miniatura inválido'),
});
