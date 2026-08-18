import { z } from 'zod';

export const createShareSchema = z.object({
  permission: z.enum(['VIEW', 'DOWNLOAD']).default('VIEW'),
  expires_in_days: z.number().int().min(1).max(30).default(7),
  max_uses: z.number().int().min(1).max(10000).optional(),
});

export const shareTokenParamSchema = z.object({
  token: z.string().min(16).max(128),
});

export type CreateShareInput = z.infer<typeof createShareSchema>;
