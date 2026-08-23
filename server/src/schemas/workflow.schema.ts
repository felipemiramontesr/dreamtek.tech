import { z } from 'zod';

export const triggerEventEnum = [
  'ASSET_CREATED',
  'ASSET_UPDATED',
  'ASSET_TAGGED',
  'AI_ANALYZED',
  'RIGHTS_EXPIRED',
  'MANUAL',
] as const;

export const triggerEventSchema = z.enum(triggerEventEnum);
export type TriggerEvent = z.infer<typeof triggerEventSchema>;

export const conditionOperatorEnum = [
  'EQUALS',
  'NOT_EQUALS',
  'CONTAINS',
  'STARTS_WITH',
  'GREATER_THAN',
  'LESS_THAN',
  'IN_ARRAY',
] as const;

export const conditionOperatorSchema = z.enum(conditionOperatorEnum);
export type ConditionOperator = z.infer<typeof conditionOperatorSchema>;

export const workflowConditionSchema = z.object({
  field: z
    .string()
    .trim()
    .min(1, 'El campo de la condición es obligatorio.')
    .max(64, 'El campo no puede exceder 64 caracteres.'),
  operator: conditionOperatorSchema,
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.array(z.number())]),
});

export type WorkflowCondition = z.infer<typeof workflowConditionSchema>;

export const actionTypeEnum = [
  'APPLY_TAGS',
  'MOVE_TO_COLLECTION',
  'SET_RIGHTS',
  'ARCHIVE_ASSET',
  'TRIGGER_WEBHOOK',
  'TRIGGER_AI_ANALYSIS',
] as const;

export const actionTypeSchema = z.enum(actionTypeEnum);
export type ActionType = z.infer<typeof actionTypeSchema>;

export const workflowActionSchema = z.object({
  type: actionTypeSchema,
  params: z.record(z.any()).optional().default({}),
});

export type WorkflowAction = z.infer<typeof workflowActionSchema>;

export const createWorkflowBodySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'El nombre del flujo de trabajo debe tener al menos 2 caracteres.')
    .max(128, 'El nombre no puede exceder 128 caracteres.'),
  description: z
    .string()
    .trim()
    .max(500, 'La descripción no puede exceder 500 caracteres.')
    .optional()
    .nullable(),
  trigger_event: triggerEventSchema,
  conditions: z.array(workflowConditionSchema).default([]),
  actions: z
    .array(workflowActionSchema)
    .min(1, 'El flujo de trabajo debe contener al menos una acción.'),
  is_active: z.boolean().optional().default(true),
});

export type CreateWorkflowBody = z.infer<typeof createWorkflowBodySchema>;

export const updateWorkflowBodySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'El nombre del flujo de trabajo debe tener al menos 2 caracteres.')
    .max(128, 'El nombre no puede exceder 128 caracteres.')
    .optional(),
  description: z
    .string()
    .trim()
    .max(500, 'La descripción no puede exceder 500 caracteres.')
    .optional()
    .nullable(),
  trigger_event: triggerEventSchema.optional(),
  conditions: z.array(workflowConditionSchema).optional(),
  actions: z
    .array(workflowActionSchema)
    .min(1, 'El flujo de trabajo debe contener al menos una acción.')
    .optional(),
  is_active: z.boolean().optional(),
});

export type UpdateWorkflowBody = z.infer<typeof updateWorkflowBodySchema>;

export const workflowExecutionsQuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((val) => (val !== undefined ? parseInt(val, 10) : 20))
    .refine((val) => !isNaN(val) && val >= 1 && val <= 50, {
      message: 'limit debe ser un entero entre 1 y 50',
    }),
  status: z.enum(['SUCCESS', 'FAILED', 'SKIPPED']).optional(),
});

export type WorkflowExecutionsQuery = z.infer<typeof workflowExecutionsQuerySchema>;

export interface WorkflowRecord {
  id: number;
  tenant_id: number;
  name: string;
  description: string | null;
  trigger_event: TriggerEvent;
  conditions: WorkflowCondition[];
  actions: WorkflowAction[];
  is_active: boolean | number;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface WorkflowExecutionRecord {
  id: number;
  tenant_id: number;
  workflow_id: number;
  asset_id: number;
  trigger_event: string;
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  execution_logs: any;
  executed_at: string;
}
