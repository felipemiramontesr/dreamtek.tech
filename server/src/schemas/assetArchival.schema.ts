import { z } from 'zod';

export const archiveProviderEnum = z.enum([
  'AWS_GLACIER',
  'AWS_S3_STANDARD',
  'AZURE_BLOB_ARCHIVE',
  'GCS_COLDLINE',
  'CUSTOM_OBJECT_STORAGE',
]);

export const restorationTierEnum = z.enum(['EXPEDITED', 'STANDARD', 'BULK']);

export const restorationStatusEnum = z.enum([
  'NONE',
  'REQUESTED',
  'IN_PROGRESS',
  'RESTORED',
  'EXPIRED',
]);

export const archiveAssetBodySchema = z.object({
  archive_provider: archiveProviderEnum.default('AWS_GLACIER'),
  reason: z.string().trim().max(500, 'El motivo no puede exceder los 500 caracteres').optional(),
});

export const restoreAssetBodySchema = z.object({
  restoration_tier: restorationTierEnum.default('STANDARD'),
  days_valid: z
    .number()
    .int('Los días de validez deben ser un entero')
    .min(1, 'Mínimo 1 día de validez')
    .max(30, 'Máximo 30 días de validez')
    .default(7),
});

export type ArchiveAssetInput = z.infer<typeof archiveAssetBodySchema>;
export type RestoreAssetInput = z.infer<typeof restoreAssetBodySchema>;
