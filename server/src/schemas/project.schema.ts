import { z } from 'zod';

export const httpsUrlSchema = z
  .string()
  .url({ message: 'Debe ser una URL válida' })
  .refine((url) => url.startsWith('https://'), {
    message: 'La URL debe comenzar estrictamente con https://',
  });

export const clientBriefingSchema = z.object({
  business_goals: z
    .string()
    .min(5, { message: 'Los objetivos deben tener al menos 5 caracteres' })
    .max(4000, { message: 'Los objetivos no deben exceder 4000 caracteres' }),
  target_audience: z.string().max(2000).optional().default(''),
  technical_stack_preferences: z.string().max(2000).optional().default(''),
  infrastructure_notes: z.string().max(2000).optional().default(''),
  reference_urls: z
    .array(httpsUrlSchema)
    .max(10, { message: 'Máximo 10 URLs de referencia permitidas' })
    .optional()
    .default([]),
  contact_lead_notes: z.string().max(2000).optional().default(''),
});

export type ClientBriefingInput = z.infer<typeof clientBriefingSchema>;

export const adminUpdateProjectSchema = z.object({
  status: z
    .enum([
      'ONBOARDING_BRIEF',
      'ARCHITECTURE_DESIGN',
      'IN_DEVELOPMENT',
      'STAGING_REVIEW',
      'SETTLEMENT_PENDING',
      'COMPLETED_DELIVERED',
      'ON_HOLD',
    ])
    .optional(),
  staging_url: httpsUrlSchema.nullable().optional(),
  repository_url: httpsUrlSchema.nullable().optional(),
  project_name: z.string().min(1).max(255).optional(),
});

export type AdminUpdateProjectInput = z.infer<typeof adminUpdateProjectSchema>;

export const milestoneSignOffSchema = z.object({
  accepted: z.literal(true, {
    errorMap: () => ({ message: 'Debe aceptar formalmente el entregable' }),
  }),
  feedback: z.string().max(2000).optional().default(''),
});

export type MilestoneSignOffInput = z.infer<typeof milestoneSignOffSchema>;

export const adminUpdateMilestoneSchema = z.object({
  status: z.enum(['PENDING', 'IN_PROGRESS', 'REVIEW', 'COMPLETED']),
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).nullable().optional(),
  target_week: z.number().int().min(1).max(52).optional(),
});

export type AdminUpdateMilestoneInput = z.infer<typeof adminUpdateMilestoneSchema>;

export const adminCreateProjectFromLeadSchema = z.object({
  project_name: z.string().min(1).max(255).optional(),
  vertical: z.string().min(1).max(64).optional(),
  estimated_weeks: z.number().int().min(1).max(52).optional(),
  paid_amount_cents: z.number().int().min(0).optional(),
});

export type AdminCreateProjectFromLeadInput = z.infer<typeof adminCreateProjectFromLeadSchema>;
