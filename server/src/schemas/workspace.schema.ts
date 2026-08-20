import { z } from 'zod';

export const createWorkspaceSchema = z
  .object({
    name: z
      .string({ required_error: 'El nombre del espacio de trabajo es requerido.' })
      .trim()
      .min(1, 'El nombre debe tener al menos 1 caracter.')
      .max(100, 'El nombre no puede exceder los 100 caracteres.'),
  })
  .strict();

export const updateWorkspaceSchema = z
  .object({
    name: z
      .string({ required_error: 'El nombre del espacio de trabajo es requerido.' })
      .trim()
      .min(1, 'El nombre debe tener al menos 1 caracter.')
      .max(100, 'El nombre no puede exceder los 100 caracteres.'),
  })
  .strict();

export const workspaceIdParamSchema = z
  .object({
    id: z.coerce
      .number({ invalid_type_error: 'ID de espacio de trabajo inválido.' })
      .int('El ID debe ser un número entero.')
      .positive('El ID debe ser mayor a 0.'),
  })
  .strict();

export const moveAssetLocationSchema = z
  .object({
    workspace_id: z.coerce
      .number({ required_error: 'El workspace_id de destino es requerido.' })
      .int('El workspace_id debe ser un entero.')
      .positive('El workspace_id debe ser mayor a 0.'),
    collection_id: z.coerce
      .number()
      .int('El collection_id debe ser un entero.')
      .positive('El collection_id debe ser mayor a 0.')
      .nullable()
      .optional(),
  })
  .strict();

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceSchema>;
export type MoveAssetLocationInput = z.infer<typeof moveAssetLocationSchema>;
