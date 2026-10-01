"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.publicPortalAssetsQuerySchema = exports.verifyPortalPasswordBodySchema = exports.attachCollectionBodySchema = exports.updatePortalBodySchema = exports.createPortalBodySchema = exports.hexColorRegex = exports.slugRegex = void 0;
const zod_1 = require("zod");
/**
 * Slug regex: alphanumeric lowercase and hyphens only (3-100 chars, no path traversal)
 */
exports.slugRegex = /^[a-z0-9-]{3,100}$/;
/**
 * HEX Color regex: standard 6-digit hex (#RRGGBB)
 */
exports.hexColorRegex = /^#[0-9A-Fa-f]{6}$/;
/**
 * Schema for creating a new brand portal
 */
exports.createPortalBodySchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(1, 'El nombre del portal es obligatorio.').max(255),
    slug: zod_1.z
        .string()
        .trim()
        .toLowerCase()
        .regex(exports.slugRegex, 'El slug solo puede contener letras minúsculas, números y guiones (3-100 caracteres).'),
    description: zod_1.z.string().trim().max(2000).optional(),
    brand_header_title: zod_1.z.string().trim().max(255).optional(),
    brand_primary_color: zod_1.z
        .string()
        .trim()
        .regex(exports.hexColorRegex, 'El color primario debe tener formato HEX válido (ej. #00bfff).')
        .default('#00bfff'),
    brand_logo_asset_id: zod_1.z.number().int().positive().nullable().optional(),
    brand_guidelines_markdown: zod_1.z.string().max(50000).optional(),
    is_public: zod_1.z.boolean().default(false),
    password: zod_1.z.string().min(6, 'La contraseña debe tener al menos 6 caracteres.').max(100).optional(),
    allowed_domains: zod_1.z.array(zod_1.z.string().trim().toLowerCase()).optional(),
    status: zod_1.z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).default('DRAFT'),
    expires_at: zod_1.z.string().datetime().nullable().optional(),
});
/**
 * Schema for updating an existing brand portal
 */
exports.updatePortalBodySchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(1).max(255).optional(),
    slug: zod_1.z
        .string()
        .trim()
        .toLowerCase()
        .regex(exports.slugRegex, 'El slug solo puede contener letras minúsculas, números y guiones (3-100 caracteres).')
        .optional(),
    description: zod_1.z.string().trim().max(2000).optional().nullable(),
    brand_header_title: zod_1.z.string().trim().max(255).optional().nullable(),
    brand_primary_color: zod_1.z
        .string()
        .trim()
        .regex(exports.hexColorRegex, 'El color primario debe tener formato HEX válido (ej. #00bfff).')
        .optional(),
    brand_logo_asset_id: zod_1.z.number().int().positive().nullable().optional(),
    brand_guidelines_markdown: zod_1.z.string().max(50000).optional().nullable(),
    is_public: zod_1.z.boolean().optional(),
    password: zod_1.z.string().min(6, 'La contraseña debe tener al menos 6 caracteres.').max(100).optional(),
    remove_password: zod_1.z.boolean().optional(),
    allowed_domains: zod_1.z.array(zod_1.z.string().trim().toLowerCase()).optional().nullable(),
    status: zod_1.z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
    expires_at: zod_1.z.string().datetime().nullable().optional(),
});
/**
 * Schema for attaching a collection to a portal
 */
exports.attachCollectionBodySchema = zod_1.z.object({
    collection_id: zod_1.z.number().int().positive('El id de la colección debe ser un entero positivo.'),
    display_order: zod_1.z.number().int().min(0).default(0),
    allow_download: zod_1.z.boolean().default(true),
});
/**
 * Schema for verifying password on a protected portal
 */
exports.verifyPortalPasswordBodySchema = zod_1.z.object({
    password: zod_1.z.string().min(1, 'La contraseña es requerida.').max(100),
});
/**
 * Schema for querying assets in a public portal
 */
exports.publicPortalAssetsQuerySchema = zod_1.z.object({
    page: zod_1.z.preprocess((val) => (val ? parseInt(val, 10) : 1), zod_1.z.number().int().min(1).default(1)),
    limit: zod_1.z.preprocess((val) => (val ? parseInt(val, 10) : 50), zod_1.z.number().int().min(1).max(100).default(50)),
    mime_type: zod_1.z.string().trim().optional(),
    collection_id: zod_1.z.preprocess((val) => (val ? parseInt(val, 10) : undefined), zod_1.z.number().int().positive().optional()),
    token: zod_1.z.string().optional(),
});
