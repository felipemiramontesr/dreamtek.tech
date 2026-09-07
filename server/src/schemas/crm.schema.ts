import { z } from 'zod';

export const LEAD_STATUSES = [
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'PROPOSAL_SENT',
  'NEGOTIATION',
  'WON',
  'LOST',
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_ACTIVITY_TYPES = [
  'STATUS_CHANGE',
  'NOTE',
  'EMAIL_SENT',
  'CALL_LOG',
  'MEETING_SCHEDULED',
] as const;

export type LeadActivityType = (typeof LEAD_ACTIVITY_TYPES)[number];

export const updateLeadStatusSchema = z.object({
  status: z.enum(LEAD_STATUSES, {
    errorMap: () => ({ message: 'Estado comercial inválido.' }),
  }),
  note: z.string().max(1000, 'La nota no puede exceder 1000 caracteres.').optional(),
});

export const createLeadActivitySchema = z.object({
  activity_type: z.enum(LEAD_ACTIVITY_TYPES, {
    errorMap: () => ({ message: 'Tipo de actividad inválido.' }),
  }),
  title: z
    .string()
    .min(3, 'El título debe tener al menos 3 caracteres.')
    .max(128, 'El título no puede exceder 128 caracteres.'),
  details: z.string().max(4000, 'Los detalles no pueden exceder 4000 caracteres.').optional(),
});

export const FOLLOWUP_TEMPLATE_IDS = [
  'DIAGNOSTIC_INVITATION',
  'PROPOSAL_SUBMITTED',
  'CUSTOM_FOLLOWUP',
] as const;

export type FollowUpTemplateId = (typeof FOLLOWUP_TEMPLATE_IDS)[number];

export const sendLeadFollowUpEmailSchema = z.object({
  template_id: z.enum(FOLLOWUP_TEMPLATE_IDS, {
    errorMap: () => ({ message: 'Plantilla de correo inválida.' }),
  }),
  subject: z
    .string()
    .max(128, 'El asunto no puede exceder 128 caracteres.')
    .optional(),
  custom_message: z
    .string()
    .max(2000, 'El mensaje personalizado no puede exceder 2000 caracteres.')
    .optional(),
});

export type UpdateLeadStatusInput = z.infer<typeof updateLeadStatusSchema>;
export type CreateLeadActivityInput = z.infer<typeof createLeadActivitySchema>;
export type SendLeadFollowUpEmailInput = z.infer<typeof sendLeadFollowUpEmailSchema>;
