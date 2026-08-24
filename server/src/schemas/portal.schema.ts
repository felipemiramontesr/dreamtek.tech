import { z } from 'zod';

/**
 * Slug regex: alphanumeric lowercase and hyphens only (3-100 chars, no path traversal)
 */
export const slugRegex = /^[a-z0-9-]{3,100}$/;

/**
 * HEX Color regex: standard 6-digit hex (#RRGGBB)
 */
export const hexColorRegex = /^#[0-9A-Fa-f]{6}$/;

/**
 * Schema for creating a new brand portal
 */
export const createPortalBodySchema = z.object({
  name: z.string().trim().min(1, 'El nombre del portal es obligatorio.').max(255),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(slugRegex, 'El slug solo puede contener letras minúsculas, números y guiones (3-100 caracteres).'),
  description: z.string().trim().max(2000).optional(),
  brand_header_title: z.string().trim().max(255).optional(),
  brand_primary_color: z
    .string()
    .trim()
    .regex(hexColorRegex, 'El color primario debe tener formato HEX válido (ej. #00bfff).')
    .default('#00bfff'),
  brand_logo_asset_id: z.number().int().positive().nullable().optional(),
  brand_guidelines_markdown: z.string().max(50000).optional(),
  is_public: z.boolean().default(false),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres.').max(100).optional(),
  allowed_domains: z.array(z.string().trim().toLowerCase()).optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).default('DRAFT'),
  expires_at: z.string().datetime().nullable().optional(),
});

export type CreatePortalBody = z.infer<typeof createPortalBodySchema>;

/**
 * Schema for updating an existing brand portal
 */
export const updatePortalBodySchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(slugRegex, 'El slug solo puede contener letras minúsculas, números y guiones (3-100 caracteres).')
    .optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  brand_header_title: z.string().trim().max(255).optional().nullable(),
  brand_primary_color: z
    .string()
    .trim()
    .regex(hexColorRegex, 'El color primario debe tener formato HEX válido (ej. #00bfff).')
    .optional(),
  brand_logo_asset_id: z.number().int().positive().nullable().optional(),
  brand_guidelines_markdown: z.string().max(50000).optional().nullable(),
  is_public: z.boolean().optional(),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres.').max(100).optional(),
  remove_password: z.boolean().optional(),
  allowed_domains: z.array(z.string().trim().toLowerCase()).optional().nullable(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
  expires_at: z.string().datetime().nullable().optional(),
});

export type UpdatePortalBody = z.infer<typeof updatePortalBodySchema>;

/**
 * Schema for attaching a collection to a portal
 */
export const attachCollectionBodySchema = z.object({
  collection_id: z.number().int().positive('El id de la colección debe ser un entero positivo.'),
  display_order: z.number().int().min(0).default(0),
  allow_download: z.boolean().default(true),
});

export type AttachCollectionBody = z.infer<typeof attachCollectionBodySchema>;

/**
 * Schema for verifying password on a protected portal
 */
export const verifyPortalPasswordBodySchema = z.object({
  password: z.string().min(1, 'La contraseña es requerida.').max(100),
});

export type VerifyPortalPasswordBody = z.infer<typeof verifyPortalPasswordBodySchema>;

/**
 * Schema for querying assets in a public portal
 */
export const publicPortalAssetsQuerySchema = z.object({
  page: z.preprocess((val) => (val ? parseInt(val as string, 10) : 1), z.number().int().min(1).default(1)),
  limit: z.preprocess((val) => (val ? parseInt(val as string, 10) : 50), z.number().int().min(1).max(100).default(50)),
  mime_type: z.string().trim().optional(),
  collection_id: z.preprocess(
    (val) => (val ? parseInt(val as string, 10) : undefined),
    z.number().int().positive().optional(),
  ),
  token: z.string().optional(),
});

export type PublicPortalAssetsQuery = z.infer<typeof publicPortalAssetsQuerySchema>;
