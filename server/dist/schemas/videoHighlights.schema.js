"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.highlightIdParamSchema = exports.listVideoHighlightsQuerySchema = exports.createVideoHighlightBodySchema = exports.AspectRatioEnum = void 0;
const zod_1 = require("zod");
exports.AspectRatioEnum = zod_1.z.enum(['16:9', '9:16', '1:1']);
exports.createVideoHighlightBodySchema = zod_1.z.object({
    title: zod_1.z.string().min(1, 'El título es obligatorio').max(255),
    aspect_ratio: exports.AspectRatioEnum.optional().default('9:16'),
    target_duration_seconds: zod_1.z.coerce
        .number()
        .int()
        .min(5, 'La duración mínima es de 5 segundos')
        .max(180, 'La duración máxima es de 180 segundos')
        .optional()
        .default(30),
});
exports.listVideoHighlightsQuerySchema = zod_1.z.object({
    limit: zod_1.z.coerce.number().int().positive().max(100).optional().default(50),
    offset: zod_1.z.coerce.number().int().nonnegative().optional().default(0),
    aspect_ratio: exports.AspectRatioEnum.optional(),
});
exports.highlightIdParamSchema = zod_1.z.object({
    id: zod_1.z.coerce.number().int().positive('ID de activo inválido'),
    highlightId: zod_1.z.coerce.number().int().positive('ID de highlight inválido'),
});
