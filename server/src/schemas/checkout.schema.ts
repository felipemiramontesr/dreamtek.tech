import { z } from 'zod';

export const checkoutSessionSchema = z.object({
  planId: z
    .string({ required_error: 'El identificador de plan es requerido.' })
    .min(1, 'Plan inválido.'),
  billingCycle: z
    .enum(['monthly', 'annual'], {
      invalid_type_error: 'El ciclo de facturación debe ser monthly o annual.',
    })
    .default('monthly'),
  currency: z.string().optional().default('mxn'),
});

export type CheckoutSessionInput = z.infer<typeof checkoutSessionSchema>;
