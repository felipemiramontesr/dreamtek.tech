import { z } from 'zod';

export const leadSchema = z.object({
  full_name: z
    .string()
    .min(1, 'El nombre es requerido.')
    .min(2, 'El nombre debe tener al menos 2 caracteres.')
    .optional(),
  name: z.string().optional(),
  email: z
    .string()
    .min(1, 'El email es requerido.')
    .email('El correo electrónico debe ser una dirección válida.'),
  phone: z.string().optional(),
  company: z.string().optional(),
  planId: z.string().optional(),
  step_reached: z.number().optional(),
});

export const domainCheckSchema = z.object({
  domain: z
    .string()
    .min(1, 'El nombre de dominio es requerido.')
    .min(3, 'El dominio debe tener al menos 3 caracteres.')
    .regex(/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, 'Formato de dominio inválido (ej. miempresa.com).'),
});

export type LeadInput = z.infer<typeof leadSchema>;
export type DomainCheckInput = z.infer<typeof domainCheckSchema>;
