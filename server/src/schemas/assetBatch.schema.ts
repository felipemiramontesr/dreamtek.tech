import { z } from 'zod';

/**
 * Esquema para operaciones batch con solo lista de IDs de activos.
 * Utilizado por:
 * - POST /api/v1/assets/batch/download
 * - POST /api/v1/assets/batch/delete
 */
export const batchAssetIdsSchema = z.object({
  asset_ids: z
    .array(z.number().int().positive('ID de activo debe ser un número entero positivo.'))
    .min(1, 'El lote debe contener al menos 1 activo.')
    .max(50, 'El lote no puede exceder 50 activos.'),
});

export type BatchAssetIdsInput = z.infer<typeof batchAssetIdsSchema>;

/**
 * Esquema para reubicación masiva de activos entre workspaces y colecciones.
 * Utilizado por:
 * - POST /api/v1/assets/batch/relocate
 */
export const batchRelocateSchema = z.object({
  asset_ids: z
    .array(z.number().int().positive('ID de activo debe ser un número entero positivo.'))
    .min(1, 'El lote debe contener al menos 1 activo.')
    .max(50, 'El lote no puede exceder 50 activos.'),
  workspace_id: z.number().int().positive('ID de espacio de trabajo debe ser un número positivo.'),
  collection_id: z
    .number()
    .int()
    .positive('ID de colección debe ser un número positivo.')
    .nullable()
    .optional(),
});

export type BatchRelocateInput = z.infer<typeof batchRelocateSchema>;

/**
 * Esquema para asignación y desvinculación masiva de etiquetas en activos.
 * Utilizado por:
 * - POST /api/v1/assets/batch/tags/assign
 * - POST /api/v1/assets/batch/tags/remove
 */
export const batchTagsSchema = z.object({
  asset_ids: z
    .array(z.number().int().positive('ID de activo debe ser un número entero positivo.'))
    .min(1, 'El lote debe contener al menos 1 activo.')
    .max(50, 'El lote no puede exceder 50 activos.'),
  tag_ids: z
    .array(z.number().int().positive('ID de etiqueta debe ser un número positivo.'))
    .min(1, 'Debe especificar al menos una etiqueta.')
    .max(20, 'No puede procesar más de 20 etiquetas por lote.'),
});

export type BatchTagsInput = z.infer<typeof batchTagsSchema>;
