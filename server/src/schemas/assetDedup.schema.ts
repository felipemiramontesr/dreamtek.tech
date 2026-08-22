import { z } from 'zod';

export const dedupQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  workspace_id: z.coerce.number().int().positive().optional(),
  collection_id: z.coerce.number().int().positive().optional(),
  mime_category: z.enum(['image', 'video', 'audio', 'document']).optional(),
});

export type DedupQueryInput = z.infer<typeof dedupQuerySchema>;

export const deduplicateBodySchema = z.object({
  canonical_asset_id: z
    .number({ required_error: 'canonical_asset_id es obligatorio.' })
    .int('canonical_asset_id debe ser un número entero.')
    .positive('canonical_asset_id debe ser un entero positivo.'),
  duplicate_asset_ids: z
    .array(
      z
        .number()
        .int('Cada ID en duplicate_asset_ids debe ser un entero.')
        .positive('Cada ID en duplicate_asset_ids debe ser positivo.'),
    )
    .min(1, 'Debe incluir al menos un ID en duplicate_asset_ids.')
    .max(100, 'No puede consolidar más de 100 activos en una sola operación.'),
  reason: z.string().max(255, 'La razón no puede exceder 255 caracteres.').optional(),
});

export type DeduplicateBodyInput = z.infer<typeof deduplicateBodySchema>;

export const dedupPolicyEnum = z.enum(['ALLOW_DUPLICATE', 'REJECT_DUPLICATE', 'LINK_EXISTING']);
export type DedupPolicy = z.infer<typeof dedupPolicyEnum>;
