import { z } from 'zod';

export const AudioCleaningProfileEnum = z.enum([
  'VOICE_ISOLATION',
  'NOISE_REDUCTION',
  'LOUDNESS_NORMALIZATION',
  'DE_HUM',
]);
export type AudioCleaningProfile = z.infer<typeof AudioCleaningProfileEnum>;

export const createAudioCleaningBodySchema = z.object({
  profile: AudioCleaningProfileEnum.optional().default('NOISE_REDUCTION'),
  noise_reduction_db: z.coerce
    .number()
    .int()
    .min(3, 'La reducción mínima es de 3 dB')
    .max(40, 'La reducción máxima es de 40 dB')
    .optional()
    .default(12),
});

export type CreateAudioCleaningBodyInput = z.infer<typeof createAudioCleaningBodySchema>;

export const listAudioCleaningQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional().default(50),
  offset: z.coerce.number().int().nonnegative().optional().default(0),
  profile: AudioCleaningProfileEnum.optional(),
});

export type ListAudioCleaningQueryInput = z.infer<typeof listAudioCleaningQuerySchema>;

export const audioCleaningJobIdParamSchema = z.object({
  id: z.coerce.number().int().positive('ID de activo inválido'),
  jobId: z.coerce.number().int().positive('ID de trabajo inválido'),
});

export type AudioCleaningJobIdParamInput = z.infer<typeof audioCleaningJobIdParamSchema>;
