import { z } from 'zod';

export const LicenseTypeEnum = z.enum([
  'PROPRIETARY',
  'CC_BY',
  'CC_BY_SA',
  'CC_BY_NC',
  'PUBLIC_DOMAIN',
  'CUSTOM',
]);

export type LicenseType = z.infer<typeof LicenseTypeEnum>;

/**
 * Esquema de validación para mutación de derechos, licencias y embargo (FC 010).
 * Utilizado por:
 * - PUT /api/v1/assets/:id/rights
 */
export const updateAssetRightsSchema = z.object({
  copyright_notice: z
    .string()
    .max(255, 'El aviso de derechos de autor no puede exceder 255 caracteres.')
    .nullable()
    .optional(),
  license_type: LicenseTypeEnum.optional().default('PROPRIETARY'),
  terms_of_use: z.string().nullable().optional(),
  expires_at: z
    .string()
    .datetime({ message: 'expires_at debe ser una fecha válida en formato ISO 8601.' })
    .nullable()
    .optional(),
  embargo_until: z
    .string()
    .datetime({ message: 'embargo_until debe ser una fecha válida en formato ISO 8601.' })
    .nullable()
    .optional(),
});

export type UpdateAssetRightsInput = z.infer<typeof updateAssetRightsSchema>;
