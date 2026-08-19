import { z } from 'zod';

export const checkoutSessionSchema = z.object({
  planId: z.string().min(1, 'El identificador de plan es requerido.'),
  billingCycle: z.enum(['monthly', 'annual']).default('monthly'),
  currency: z.string().optional().default('mxn'),
});

export type CheckoutSessionInput = z.infer<typeof checkoutSessionSchema>;
