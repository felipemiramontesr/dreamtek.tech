"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.audioSpectralParamSchema = exports.listAudioSpectralQuerySchema = exports.createAudioSpectralBodySchema = exports.AudioSpectralProfileTypeEnum = void 0;
const zod_1 = require("zod");
exports.AudioSpectralProfileTypeEnum = zod_1.z.enum([
    'MAINS_HUM_50HZ',
    'MAINS_HUM_60HZ',
    'BROADBAND_HISS',
    'HVAC_RUMBLE',
    'GROUND_LOOP',
    'CUSTOM',
]);
exports.createAudioSpectralBodySchema = zod_1.z.object({
    profile_type: exports.AudioSpectralProfileTypeEnum.optional().default('MAINS_HUM_60HZ'),
    base_frequency_hz: zod_1.z.coerce
        .number()
        .min(20, 'Frecuencia base mínima 20 Hz')
        .max(20000, 'Frecuencia base máxima 20000 Hz')
        .optional(),
    harmonic_count: zod_1.z.coerce
        .number()
        .int()
        .min(1, 'Mínimo 1 armónico')
        .max(10, 'Máximo 10 armónicos')
        .optional()
        .default(1),
    attenuation_db: zod_1.z.coerce
        .number()
        .min(1, 'Atenuación mínima 1 dB')
        .max(60, 'Atenuación máxima 60 dB')
        .optional()
        .default(12),
    spectral_noise_floor_db: zod_1.z.coerce
        .number()
        .min(-120, 'Piso de ruido mínimo -120 dB')
        .max(0, 'Piso de ruido máximo 0 dB')
        .optional()
        .default(-60),
    q_factor: zod_1.z.coerce
        .number()
        .min(0.1, 'Factor Q mínimo 0.1')
        .max(100, 'Factor Q máximo 100')
        .optional()
        .default(10),
    width: zod_1.z.coerce.number().int().min(128).max(2048).optional().default(800),
    height: zod_1.z.coerce.number().int().min(64).max(1024).optional().default(300),
});
exports.listAudioSpectralQuerySchema = zod_1.z.object({
    limit: zod_1.z.coerce.number().int().positive().max(100).optional().default(50),
    offset: zod_1.z.coerce.number().int().nonnegative().optional().default(0),
    profile_type: exports.AudioSpectralProfileTypeEnum.optional(),
});
exports.audioSpectralParamSchema = zod_1.z.object({
    id: zod_1.z.coerce.number().int().positive('ID de activo inválido'),
    profileId: zod_1.z.coerce.number().int().positive('ID de perfil inválido'),
});
