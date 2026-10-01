"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.faceBlurringParamSchema = exports.listFaceBlurringsQuerySchema = exports.createFaceBlurringBodySchema = exports.boundingBoxSchema = exports.AnonymizationStrategyEnum = void 0;
const zod_1 = require("zod");
exports.AnonymizationStrategyEnum = zod_1.z.enum([
    'GAUSSIAN_BLUR',
    'PIXELATE_MOSAIC',
    'BLACK_BAR_CENSOR',
]);
exports.boundingBoxSchema = zod_1.z.object({
    left: zod_1.z.number().int().min(0, 'La coordenada left debe ser mayor o igual a 0'),
    top: zod_1.z.number().int().min(0, 'La coordenada top debe ser mayor o igual a 0'),
    width: zod_1.z.number().int().positive('El ancho (width) debe ser un entero positivo mayor a 0'),
    height: zod_1.z.number().int().positive('El alto (height) debe ser un entero positivo mayor a 0'),
    label: zod_1.z.string().max(50).optional(),
});
exports.createFaceBlurringBodySchema = zod_1.z.object({
    strategy: exports.AnonymizationStrategyEnum.default('GAUSSIAN_BLUR'),
    blur_intensity: zod_1.z
        .number()
        .int()
        .min(1, 'La intensidad de desenfoque mínima es 1')
        .max(50, 'La intensidad de desenfoque máxima es 50')
        .default(20),
    bounding_boxes: zod_1.z
        .array(exports.boundingBoxSchema)
        .min(1, 'Se requiere al menos una caja delimitadora para anonimizar')
        .max(50, 'El límite máximo es de 50 regiones de anonimización por solicitud'),
});
exports.listFaceBlurringsQuerySchema = zod_1.z.object({
    limit: zod_1.z.coerce.number().int().positive().max(100).default(50),
    offset: zod_1.z.coerce.number().int().min(0).default(0),
    strategy: exports.AnonymizationStrategyEnum.optional(),
});
exports.faceBlurringParamSchema = zod_1.z.object({
    id: zod_1.z.coerce.number().int().positive('ID de activo inválido'),
    anonymizationId: zod_1.z.coerce.number().int().positive('ID de anonimización inválido'),
});
