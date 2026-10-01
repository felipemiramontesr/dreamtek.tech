"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.audioCleaningJobIdParamSchema = exports.listAudioCleaningQuerySchema = exports.createAudioCleaningBodySchema = exports.AudioCleaningProfileEnum = void 0;
const zod_1 = require("zod");
exports.AudioCleaningProfileEnum = zod_1.z.enum([
    'VOICE_ISOLATION',
    'NOISE_REDUCTION',
    'LOUDNESS_NORMALIZATION',
    'DE_HUM',
]);
exports.createAudioCleaningBodySchema = zod_1.z.object({
    profile: exports.AudioCleaningProfileEnum.optional().default('NOISE_REDUCTION'),
    noise_reduction_db: zod_1.z.coerce
        .number()
        .int()
        .min(3, 'La reducción mínima es de 3 dB')
        .max(40, 'La reducción máxima es de 40 dB')
        .optional()
        .default(12),
});
exports.listAudioCleaningQuerySchema = zod_1.z.object({
    limit: zod_1.z.coerce.number().int().positive().max(100).optional().default(50),
    offset: zod_1.z.coerce.number().int().nonnegative().optional().default(0),
    profile: exports.AudioCleaningProfileEnum.optional(),
});
exports.audioCleaningJobIdParamSchema = zod_1.z.object({
    id: zod_1.z.coerce.number().int().positive('ID de activo inválido'),
    jobId: zod_1.z.coerce.number().int().positive('ID de trabajo inválido'),
});
