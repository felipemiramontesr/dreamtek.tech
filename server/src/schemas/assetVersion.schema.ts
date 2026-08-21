import { z } from 'zod';

/**
 * Route parameter validation schema for Asset ID.
 */
export const assetIdParamSchema = z.object({
  id: z.coerce.number().int().positive({ message: 'El ID de activo debe ser un entero positivo.' }),
});

/**
 * Route parameter validation schema for Asset ID and Version Number.
 */
export const assetVersionParamsSchema = z.object({
  id: z.coerce.number().int().positive({ message: 'El ID de activo debe ser un entero positivo.' }),
  versionNumber: z.coerce
    .number()
    .int()
    .positive({ message: 'El número de versión debe ser un entero positivo.' }),
});

export type AssetIdParam = z.infer<typeof assetIdParamSchema>;
export type AssetVersionParams = z.infer<typeof assetVersionParamsSchema>;
