import { z } from 'zod';

export const leadSchema = z.object({
  name: z
    .string({ required_error: 'El nombre es requerido.' })
    .min(2, 'El nombre debe tener al menos 2 caracteres.'),
  email: z
    .string({ required_error: 'El email es requerido.' })
    .email('El correo electrónico debe ser una dirección válida.'),
  phone: z.string().optional(),
  company: z.string().optional(),
  planId: z.string().optional(),
});

export const domainCheckSchema = z.object({
  domain: z
    .string({ required_error: 'El nombre de dominio es requerido.' })
    .min(3, 'El dominio debe tener al menos 3 caracteres.')
    .regex(/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, 'Formato de dominio inválido (ej. miempresa.com).'),
});

export type LeadInput = z.infer<typeof leadSchema>;
export type DomainCheckInput = z.infer<typeof domainCheckSchema>;
