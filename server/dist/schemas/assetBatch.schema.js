"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.batchTagsSchema = exports.batchRelocateSchema = exports.batchAssetIdsSchema = void 0;
const zod_1 = require("zod");
/**
 * Esquema para operaciones batch con solo lista de IDs de activos.
 * Utilizado por:
 * - POST /api/v1/assets/batch/download
 * - POST /api/v1/assets/batch/delete
 */
exports.batchAssetIdsSchema = zod_1.z.object({
    asset_ids: zod_1.z
        .array(zod_1.z.number().int().positive('ID de activo debe ser un número entero positivo.'))
        .min(1, 'El lote debe contener al menos 1 activo.')
        .max(50, 'El lote no puede exceder 50 activos.'),
});
/**
 * Esquema para reubicación masiva de activos entre workspaces y colecciones.
 * Utilizado por:
 * - POST /api/v1/assets/batch/relocate
 */
exports.batchRelocateSchema = zod_1.z.object({
    asset_ids: zod_1.z
        .array(zod_1.z.number().int().positive('ID de activo debe ser un número entero positivo.'))
        .min(1, 'El lote debe contener al menos 1 activo.')
        .max(50, 'El lote no puede exceder 50 activos.'),
    workspace_id: zod_1.z.number().int().positive('ID de espacio de trabajo debe ser un número positivo.'),
    collection_id: zod_1.z
        .number()
        .int()
        .positive('ID de colección debe ser un número positivo.')
        .nullable()
        .optional(),
});
/**
 * Esquema para asignación y desvinculación masiva de etiquetas en activos.
 * Utilizado por:
 * - POST /api/v1/assets/batch/tags/assign
 * - POST /api/v1/assets/batch/tags/remove
 */
exports.batchTagsSchema = zod_1.z.object({
    asset_ids: zod_1.z
        .array(zod_1.z.number().int().positive('ID de activo debe ser un número entero positivo.'))
        .min(1, 'El lote debe contener al menos 1 activo.')
        .max(50, 'El lote no puede exceder 50 activos.'),
    tag_ids: zod_1.z
        .array(zod_1.z.number().int().positive('ID de etiqueta debe ser un número positivo.'))
        .min(1, 'Debe especificar al menos una etiqueta.')
        .max(20, 'No puede procesar más de 20 etiquetas por lote.'),
});
