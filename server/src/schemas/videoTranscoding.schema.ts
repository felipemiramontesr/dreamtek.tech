import { z } from 'zod';

export const VideoTranscodingProfileEnum = z.enum([
  'HLS_MULTI_BITRATE',
  'HLS_1080P',
  'HLS_720P',
  'HLS_480P',
  'HLS_360P',
  'MP4_OPTIMIZED_WEB',
]);
export type VideoTranscodingProfile = z.infer<typeof VideoTranscodingProfileEnum>;

export const VideoTranscodingStatusEnum = z.enum([
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
]);
export type VideoTranscodingStatus = z.infer<typeof VideoTranscodingStatusEnum>;

export const createVideoTranscodingBodySchema = z.object({
  profile: VideoTranscodingProfileEnum.default('HLS_MULTI_BITRATE'),
  segment_duration: z
    .coerce
    .number()
    .int()
    .min(2, 'La duración mínima de segmento es 2s')
    .max(10, 'La duración máxima de segmento es 10s')
    .default(4),
});
export type CreateVideoTranscodingInput = z.infer<typeof createVideoTranscodingBodySchema>;

export const listVideoTranscodingsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
  profile: VideoTranscodingProfileEnum.optional(),
  status: VideoTranscodingStatusEnum.optional(),
});
export type ListVideoTranscodingsQuery = z.infer<typeof listVideoTranscodingsQuerySchema>;

export const videoTranscodingParamSchema = z.object({
  id: z.coerce.number().int().positive('ID de activo inválido'),
  transcodeId: z.coerce.number().int().positive('ID de transcodificación inválido'),
});

export const streamFileParamSchema = z.object({
  id: z.coerce.number().int().positive('ID de activo inválido'),
  transcodeId: z.coerce.number().int().positive('ID de transcodificación inválido'),
  filename: z.string().min(1, 'Nombre de archivo requerido'),
});
