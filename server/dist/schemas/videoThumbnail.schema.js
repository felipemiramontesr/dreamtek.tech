"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.videoThumbnailParamSchema = exports.listVideoThumbnailsQuerySchema = exports.createVideoThumbnailBodySchema = exports.VideoThumbnailTypeEnum = void 0;
const zod_1 = require("zod");
exports.VideoThumbnailTypeEnum = zod_1.z.enum([
    'STATIC_POSTER',
    'ANIMATED_GIF',
    'ANIMATED_WEBP',
    'HOVER_SCRUBBER_VTT',
]);
exports.createVideoThumbnailBodySchema = zod_1.z.object({
    thumbnail_type: exports.VideoThumbnailTypeEnum.default('STATIC_POSTER'),
    timestamp_offset_seconds: zod_1.z
        .coerce
        .number()
        .nonnegative('El desplazamiento de tiempo debe ser mayor o igual a 0')
        .default(0),
    duration_seconds: zod_1.z
        .coerce
        .number()
        .min(1, 'La duración mínima es 1s')
        .max(10, 'La duración máxima es 10s')
        .default(3),
    width: zod_1.z.coerce.number().int().positive().max(3840).default(640),
    height: zod_1.z.coerce.number().int().positive().max(2160).default(360),
    fps: zod_1.z
        .coerce
        .number()
        .int()
        .min(1, 'El valor mínimo de FPS es 1')
        .max(30, 'El valor máximo de FPS es 30')
        .default(10),
});
exports.listVideoThumbnailsQuerySchema = zod_1.z.object({
    limit: zod_1.z.coerce.number().int().positive().max(100).default(50),
    offset: zod_1.z.coerce.number().int().nonnegative().default(0),
    thumbnail_type: exports.VideoThumbnailTypeEnum.optional(),
});
exports.videoThumbnailParamSchema = zod_1.z.object({
    id: zod_1.z.coerce.number().int().positive('ID de activo inválido'),
    thumbnailId: zod_1.z.coerce.number().int().positive('ID de miniatura inválido'),
});
