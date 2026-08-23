import { z } from 'zod';

export const eventTypeEnum = z.enum([
  'VIEW',
  'DOWNLOAD',
  'STREAM',
  'SHARE_ACCESS',
  'TRANSCODE',
  'SEARCH_HIT',
]);

export type AnalyticsEventType = z.infer<typeof eventTypeEnum>;

export const actorTypeEnum = z.enum(['USER', 'GUEST', 'SYSTEM']);
export type AnalyticsActorType = z.infer<typeof actorTypeEnum>;

export const recordEventBodySchema = z
  .object({
    asset_id: z.number().int().positive('El asset_id debe ser un entero positivo.'),
    event_type: eventTypeEnum,
    actor_type: actorTypeEnum.optional().default('USER'),
    share_token: z.string().trim().max(128, 'El share_token no puede exceder 128 caracteres.').optional(),
    bytes_served: z.number().int().nonnegative('Los bytes servidos no pueden ser negativos.').optional().default(0),
    referer: z.string().trim().max(500, 'El referer no puede exceder 500 caracteres.').optional(),
  })
  .refine(
    (data) => {
      if (data.actor_type === 'GUEST' && (!data.share_token || data.share_token.trim().length === 0)) {
        return false;
      }
      return true;
    },
    {
      message: 'Los eventos con actor_type GUEST requieren un share_token válido.',
      path: ['share_token'],
    },
  );

export type RecordEventBody = z.infer<typeof recordEventBodySchema>;

export const analyticsOverviewQuerySchema = z.object({
  days: z
    .string()
    .optional()
    .transform((val) => (val !== undefined ? parseInt(val, 10) : 30))
    .refine((val) => !isNaN(val) && val >= 1 && val <= 365, {
      message: 'days debe ser un entero entre 1 y 365',
    }),
});

export type AnalyticsOverviewQuery = z.infer<typeof analyticsOverviewQuerySchema>;

export const topAssetsQuerySchema = z.object({
  metric: z
    .enum(['views', 'downloads', 'streams', 'shares', 'bytes', 'roi'])
    .optional()
    .default('views'),
  days: z
    .string()
    .optional()
    .transform((val) => (val !== undefined ? parseInt(val, 10) : 30))
    .refine((val) => !isNaN(val) && val >= 1 && val <= 365, {
      message: 'days debe ser un entero entre 1 y 365',
    }),
  limit: z
    .string()
    .optional()
    .transform((val) => (val !== undefined ? parseInt(val, 10) : 10))
    .refine((val) => !isNaN(val) && val >= 1 && val <= 50, {
      message: 'limit debe ser un entero entre 1 y 50',
    }),
});

export type TopAssetsQuery = z.infer<typeof topAssetsQuerySchema>;

export const roiReportQuerySchema = z.object({
  days: z
    .string()
    .optional()
    .transform((val) => (val !== undefined ? parseInt(val, 10) : 30))
    .refine((val) => !isNaN(val) && val >= 1 && val <= 365, {
      message: 'days debe ser un entero entre 1 y 365',
    }),
  dormant_threshold_days: z
    .string()
    .optional()
    .transform((val) => (val !== undefined ? parseInt(val, 10) : 90))
    .refine((val) => !isNaN(val) && val >= 7 && val <= 365, {
      message: 'dormant_threshold_days debe ser un entero entre 7 y 365',
    }),
  limit: z
    .string()
    .optional()
    .transform((val) => (val !== undefined ? parseInt(val, 10) : 50))
    .refine((val) => !isNaN(val) && val >= 1 && val <= 100, {
      message: 'limit debe ser un entero entre 1 y 100',
    }),
});

export type RoiReportQuery = z.infer<typeof roiReportQuerySchema>;

export const assetAnalyticsQuerySchema = z.object({
  days: z
    .string()
    .optional()
    .transform((val) => (val !== undefined ? parseInt(val, 10) : 30))
    .refine((val) => !isNaN(val) && val >= 1 && val <= 365, {
      message: 'days debe ser un entero entre 1 y 365',
    }),
});

export type AssetAnalyticsQuery = z.infer<typeof assetAnalyticsQuerySchema>;
