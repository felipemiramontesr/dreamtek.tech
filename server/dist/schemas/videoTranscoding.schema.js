"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.streamFileParamSchema = exports.videoTranscodingParamSchema = exports.listVideoTranscodingsQuerySchema = exports.createVideoTranscodingBodySchema = exports.VideoTranscodingStatusEnum = exports.VideoTranscodingProfileEnum = void 0;
const zod_1 = require("zod");
exports.VideoTranscodingProfileEnum = zod_1.z.enum([
    'HLS_MULTI_BITRATE',
    'HLS_1080P',
    'HLS_720P',
    'HLS_480P',
    'HLS_360P',
    'MP4_OPTIMIZED_WEB',
]);
exports.VideoTranscodingStatusEnum = zod_1.z.enum([
    'PENDING',
    'PROCESSING',
    'COMPLETED',
    'FAILED',
]);
exports.createVideoTranscodingBodySchema = zod_1.z.object({
    profile: exports.VideoTranscodingProfileEnum.default('HLS_MULTI_BITRATE'),
    segment_duration: zod_1.z
        .coerce
        .number()
        .int()
        .min(2, 'La duración mínima de segmento es 2s')
        .max(10, 'La duración máxima de segmento es 10s')
        .default(4),
});
exports.listVideoTranscodingsQuerySchema = zod_1.z.object({
    limit: zod_1.z.coerce.number().int().positive().max(100).default(50),
    offset: zod_1.z.coerce.number().int().nonnegative().default(0),
    profile: exports.VideoTranscodingProfileEnum.optional(),
    status: exports.VideoTranscodingStatusEnum.optional(),
});
exports.videoTranscodingParamSchema = zod_1.z.object({
    id: zod_1.z.coerce.number().int().positive('ID de activo inválido'),
    transcodeId: zod_1.z.coerce.number().int().positive('ID de transcodificación inválido'),
});
exports.streamFileParamSchema = zod_1.z.object({
    id: zod_1.z.coerce.number().int().positive('ID de activo inválido'),
    transcodeId: zod_1.z.coerce.number().int().positive('ID de transcodificación inválido'),
    filename: zod_1.z.string().min(1, 'Nombre de archivo requerido'),
});
