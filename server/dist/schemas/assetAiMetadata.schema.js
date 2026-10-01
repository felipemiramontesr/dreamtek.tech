"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyAiTagsBodySchema = exports.analyzeAssetBodySchema = exports.aiVisionProviderEnum = exports.aiVisionStatusEnum = void 0;
const zod_1 = require("zod");
exports.aiVisionStatusEnum = zod_1.z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']);
exports.aiVisionProviderEnum = zod_1.z.enum([
    'BUILTIN_VISION',
    'AWS_REKOGNITION',
    'OPENAI_CLIP',
    'GOOGLE_VISION',
]);
exports.analyzeAssetBodySchema = zod_1.z.object({
    auto_tag: zod_1.z.boolean().optional().default(false),
    min_confidence: zod_1.z.number().min(0.0).max(1.0).optional().default(0.75),
    force_refresh: zod_1.z.boolean().optional().default(false),
});
exports.applyAiTagsBodySchema = zod_1.z.object({
    labels: zod_1.z
        .array(zod_1.z.string().trim().min(1, 'La etiqueta no puede estar vacía').max(50, 'Máximo 50 caracteres'))
        .min(1, 'Debe especificar al menos una etiqueta a aplicar')
        .max(50, 'Máximo 50 etiquetas por operación'),
});
