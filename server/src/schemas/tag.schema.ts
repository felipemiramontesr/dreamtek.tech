import { z } from 'zod';

export const createTagSchema = z.object({
  name: z.string().trim().min(1).max(64),
  color: z
    .string()
    .regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/, {
      message: 'Color must be a valid hex color code (e.g. #00bfff)',
    })
    .default('#00bfff')
    .optional(),
});

export const attachTagsSchema = z.object({
  tag_ids: z.array(z.number().int().positive()).min(1),
});

export const assetMetadataSchema = z.object({
  meta_key: z.string().trim().min(1).max(64),
  meta_value: z.string().max(2000),
  data_type: z.enum(['STRING', 'NUMBER', 'BOOLEAN', 'JSON']).default('STRING'),
});

export type CreateTagInput = z.infer<typeof createTagSchema>;
export type AttachTagsInput = z.infer<typeof attachTagsSchema>;
export type AssetMetadataInput = z.infer<typeof assetMetadataSchema>;
