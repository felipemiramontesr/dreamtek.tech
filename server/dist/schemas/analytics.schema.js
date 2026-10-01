"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assetAnalyticsQuerySchema = exports.roiReportQuerySchema = exports.topAssetsQuerySchema = exports.analyticsOverviewQuerySchema = exports.recordEventBodySchema = exports.actorTypeEnum = exports.eventTypeEnum = void 0;
const zod_1 = require("zod");
exports.eventTypeEnum = zod_1.z.enum([
    'VIEW',
    'DOWNLOAD',
    'STREAM',
    'SHARE_ACCESS',
    'TRANSCODE',
    'SEARCH_HIT',
]);
exports.actorTypeEnum = zod_1.z.enum(['USER', 'GUEST', 'SYSTEM']);
exports.recordEventBodySchema = zod_1.z
    .object({
    asset_id: zod_1.z.number().int().positive('El asset_id debe ser un entero positivo.'),
    event_type: exports.eventTypeEnum,
    actor_type: exports.actorTypeEnum.optional().default('USER'),
    share_token: zod_1.z.string().trim().max(128, 'El share_token no puede exceder 128 caracteres.').optional(),
    bytes_served: zod_1.z.number().int().nonnegative('Los bytes servidos no pueden ser negativos.').optional().default(0),
    referer: zod_1.z.string().trim().max(500, 'El referer no puede exceder 500 caracteres.').optional(),
})
    .refine((data) => {
    if (data.actor_type === 'GUEST' && (!data.share_token || data.share_token.trim().length === 0)) {
        return false;
    }
    return true;
}, {
    message: 'Los eventos con actor_type GUEST requieren un share_token válido.',
    path: ['share_token'],
});
exports.analyticsOverviewQuerySchema = zod_1.z.object({
    days: zod_1.z
        .string()
        .optional()
        .transform((val) => (val !== undefined ? parseInt(val, 10) : 30))
        .refine((val) => !isNaN(val) && val >= 1 && val <= 365, {
        message: 'days debe ser un entero entre 1 y 365',
    }),
});
exports.topAssetsQuerySchema = zod_1.z.object({
    metric: zod_1.z
        .enum(['views', 'downloads', 'streams', 'shares', 'bytes', 'roi'])
        .optional()
        .default('views'),
    days: zod_1.z
        .string()
        .optional()
        .transform((val) => (val !== undefined ? parseInt(val, 10) : 30))
        .refine((val) => !isNaN(val) && val >= 1 && val <= 365, {
        message: 'days debe ser un entero entre 1 y 365',
    }),
    limit: zod_1.z
        .string()
        .optional()
        .transform((val) => (val !== undefined ? parseInt(val, 10) : 10))
        .refine((val) => !isNaN(val) && val >= 1 && val <= 50, {
        message: 'limit debe ser un entero entre 1 y 50',
    }),
});
exports.roiReportQuerySchema = zod_1.z.object({
    days: zod_1.z
        .string()
        .optional()
        .transform((val) => (val !== undefined ? parseInt(val, 10) : 30))
        .refine((val) => !isNaN(val) && val >= 1 && val <= 365, {
        message: 'days debe ser un entero entre 1 y 365',
    }),
    dormant_threshold_days: zod_1.z
        .string()
        .optional()
        .transform((val) => (val !== undefined ? parseInt(val, 10) : 90))
        .refine((val) => !isNaN(val) && val >= 7 && val <= 365, {
        message: 'dormant_threshold_days debe ser un entero entre 7 y 365',
    }),
    limit: zod_1.z
        .string()
        .optional()
        .transform((val) => (val !== undefined ? parseInt(val, 10) : 50))
        .refine((val) => !isNaN(val) && val >= 1 && val <= 100, {
        message: 'limit debe ser un entero entre 1 y 100',
    }),
});
exports.assetAnalyticsQuerySchema = zod_1.z.object({
    days: zod_1.z
        .string()
        .optional()
        .transform((val) => (val !== undefined ? parseInt(val, 10) : 30))
        .refine((val) => !isNaN(val) && val >= 1 && val <= 365, {
        message: 'days debe ser un entero entre 1 y 365',
    }),
});
