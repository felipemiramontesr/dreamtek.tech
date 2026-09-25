import { z } from 'zod';

export const NOTIFICATION_TYPES = ['SECURITY_ALERT', 'PROJECT_UPDATE', 'BILLING_EVENT'] as const;
export const NOTIFICATION_SEVERITIES = ['INFO', 'WARNING', 'CRITICAL'] as const;

export const createNotificationSchema = z.object({
  type: z.enum(NOTIFICATION_TYPES),
  severity: z.enum(NOTIFICATION_SEVERITIES).default('INFO'),
  title: z.string().trim().min(1, 'El título es requerido').max(255),
  message: z.string().trim().min(1, 'El mensaje es requerido'),
  action_url: z
    .string()
    .trim()
    .max(255)
    .regex(/^\/client\/dashboard(\/[a-zA-Z0-9_\-./]*)?$/, {
      message: 'action_url debe ser una ruta interna segura que inicie con /client/dashboard',
    })
    .optional()
    .nullable(),
});

export const WEBHOOK_EVENT_TYPES = [
  'auth.login',
  'mfa.challenge',
  'mfa.enabled',
  'mfa.disabled',
  'project.created',
  'project.milestone_updated',
  'project.settlement_completed',
  'billing.deposit_paid',
  'billing.invoice_requested',
] as const;

export const createClientWebhookSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es requerido').max(128),
  target_url: z.string().trim().url('Debe ser una URL válida').max(1024),
  events: z.array(z.enum(WEBHOOK_EVENT_TYPES)).min(1, 'Debes seleccionar al menos un evento'),
});

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export type NotificationSeverity = (typeof NOTIFICATION_SEVERITIES)[number];
export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];
