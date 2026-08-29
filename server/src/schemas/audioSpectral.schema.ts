import { z } from 'zod';

export const AudioSpectralProfileTypeEnum = z.enum([
  'MAINS_HUM_50HZ',
  'MAINS_HUM_60HZ',
  'BROADBAND_HISS',
  'HVAC_RUMBLE',
  'GROUND_LOOP',
  'CUSTOM',
]);

export type AudioSpectralProfileType = z.infer<typeof AudioSpectralProfileTypeEnum>;

export const createAudioSpectralBodySchema = z.object({
  profile_type: AudioSpectralProfileTypeEnum.optional().default('MAINS_HUM_60HZ'),
  base_frequency_hz: z.coerce
    .number()
    .min(20, 'Frecuencia base mínima 20 Hz')
    .max(20000, 'Frecuencia base máxima 20000 Hz')
    .optional(),
  harmonic_count: z.coerce
    .number()
    .int()
    .min(1, 'Mínimo 1 armónico')
    .max(10, 'Máximo 10 armónicos')
    .optional()
    .default(1),
  attenuation_db: z.coerce
    .number()
    .min(1, 'Atenuación mínima 1 dB')
    .max(60, 'Atenuación máxima 60 dB')
    .optional()
    .default(12),
  spectral_noise_floor_db: z.coerce
    .number()
    .min(-120, 'Piso de ruido mínimo -120 dB')
    .max(0, 'Piso de ruido máximo 0 dB')
    .optional()
    .default(-60),
  q_factor: z.coerce
    .number()
    .min(0.1, 'Factor Q mínimo 0.1')
    .max(100, 'Factor Q máximo 100')
    .optional()
    .default(10),
  width: z.coerce.number().int().min(128).max(2048).optional().default(800),
  height: z.coerce.number().int().min(64).max(1024).optional().default(300),
});

export type CreateAudioSpectralBodyInput = z.infer<typeof createAudioSpectralBodySchema>;

export const listAudioSpectralQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional().default(50),
  offset: z.coerce.number().int().nonnegative().optional().default(0),
  profile_type: AudioSpectralProfileTypeEnum.optional(),
});

export type ListAudioSpectralQueryInput = z.infer<typeof listAudioSpectralQuerySchema>;

export const audioSpectralParamSchema = z.object({
  id: z.coerce.number().int().positive('ID de activo inválido'),
  profileId: z.coerce.number().int().positive('ID de perfil inválido'),
});

export type AudioSpectralParamInput = z.infer<typeof audioSpectralParamSchema>;
