import { z } from 'zod';

export const createCollectionSchema = z
  .object({
    workspace_id: z.coerce
      .number({ required_error: 'El workspace_id es requerido.' })
      .int('El workspace_id debe ser un entero.')
      .positive('El workspace_id debe ser mayor a 0.'),
    name: z
      .string({ required_error: 'El nombre de la colección es requerido.' })
      .trim()
      .min(1, 'El nombre debe tener al menos 1 caracter.')
      .max(100, 'El nombre no puede exceder los 100 caracteres.'),
  })
  .strict();

export const updateCollectionSchema = z
  .object({
    name: z
      .string({ required_error: 'El nombre de la colección es requerido.' })
      .trim()
      .min(1, 'El nombre debe tener al menos 1 caracter.')
      .max(100, 'El nombre no puede exceder los 100 caracteres.'),
  })
  .strict();

export const collectionIdParamSchema = z
  .object({
    id: z.coerce
      .number({ invalid_type_error: 'ID de colección inválido.' })
      .int('El ID debe ser un número entero.')
      .positive('El ID debe ser mayor a 0.'),
  })
  .strict();

export const queryCollectionsSchema = z
  .object({
    workspace_id: z.coerce
      .number()
      .int('El workspace_id debe ser un entero.')
      .positive('El workspace_id debe ser mayor a 0.')
      .optional(),
  })
  .strict();

export type CreateCollectionInput = z.infer<typeof createCollectionSchema>;
export type UpdateCollectionInput = z.infer<typeof updateCollectionSchema>;
export type QueryCollectionsInput = z.infer<typeof queryCollectionsSchema>;
