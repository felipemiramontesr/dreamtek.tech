import { z } from 'zod';

export const WebhookEventEnum = z.enum([
  'asset.created',
  'asset.updated',
  'asset.deleted',
  'version.created',
  'rights.updated',
  'job.completed',
  'asset.archived',
  'asset.restored',
  'asset.ai_analyzed',
  'asset.tags_updated',
  '*',
]);

export type WebhookEvent = z.infer<typeof WebhookEventEnum>;

export const createWebhookSchema = z.object({
  url: z.string().url('URL de webhook inválida').max(2048),
  description: z.string().max(255).optional(),
  events: z.array(WebhookEventEnum).min(1, 'Debe suscribirse al menos a un evento'),
  is_active: z.boolean().optional().default(true),
});

export type CreateWebhookInput = z.infer<typeof createWebhookSchema>;

export const updateWebhookSchema = z.object({
  url: z.string().url('URL de webhook inválida').max(2048).optional(),
  description: z.string().max(255).nullable().optional(),
  events: z.array(WebhookEventEnum).min(1, 'Debe suscribirse al menos a un evento').optional(),
  is_active: z.boolean().optional(),
});

export type UpdateWebhookInput = z.infer<typeof updateWebhookSchema>;

export const webhookIdParamSchema = z.object({
  id: z.coerce.number().int().positive('ID de webhook inválido'),
});

export const deliveriesQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  status: z.enum(['PENDING', 'SUCCESS', 'FAILED', 'EXHAUSTED']).optional(),
});

export type DeliveriesQueryInput = z.infer<typeof deliveriesQuerySchema>;
