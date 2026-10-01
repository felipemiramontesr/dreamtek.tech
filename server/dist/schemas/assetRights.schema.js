"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateAssetRightsSchema = exports.LicenseTypeEnum = void 0;
const zod_1 = require("zod");
exports.LicenseTypeEnum = zod_1.z.enum([
    'PROPRIETARY',
    'CC_BY',
    'CC_BY_SA',
    'CC_BY_NC',
    'PUBLIC_DOMAIN',
    'CUSTOM',
]);
/**
 * Esquema de validación para mutación de derechos, licencias y embargo (FC 010).
 * Utilizado por:
 * - PUT /api/v1/assets/:id/rights
 */
exports.updateAssetRightsSchema = zod_1.z.object({
    copyright_notice: zod_1.z
        .string()
        .max(255, 'El aviso de derechos de autor no puede exceder 255 caracteres.')
        .nullable()
        .optional(),
    license_type: exports.LicenseTypeEnum.optional().default('PROPRIETARY'),
    terms_of_use: zod_1.z.string().nullable().optional(),
    expires_at: zod_1.z
        .string()
        .datetime({ message: 'expires_at debe ser una fecha válida en formato ISO 8601.' })
        .nullable()
        .optional(),
    embargo_until: zod_1.z
        .string()
        .datetime({ message: 'embargo_until debe ser una fecha válida en formato ISO 8601.' })
        .nullable()
        .optional(),
});
