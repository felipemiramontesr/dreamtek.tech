import { z } from 'zod';

export const assetSearchQuerySchema = z.object({
  q: z.string().trim().max(255).optional(),
  workspace_id: z.coerce.number().int().positive().optional(),
  collection_id: z.coerce.number().int().positive().optional(),
  mime_type: z.string().trim().max(100).optional(),
  tag: z.string().trim().max(64).optional(),
  min_size: z.coerce.number().int().nonnegative().optional(),
  max_size: z.coerce.number().int().positive().optional(),
  from_date: z.string().trim().optional(),
  to_date: z.string().trim().optional(),
  sort_by: z.enum(['created_at', 'title', 'byte_size']).default('created_at'),
  sort_order: z
    .enum(['ASC', 'DESC', 'asc', 'desc'])
    .default('DESC')
    .transform((val) => val.toUpperCase() as 'ASC' | 'DESC'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type AssetSearchQueryInput = z.infer<typeof assetSearchQuerySchema>;
