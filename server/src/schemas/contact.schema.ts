import { z } from 'zod';

export const contactFormSchema = z.object({
  name: z
    .string()
    .min(1, 'El nombre es requerido.')
    .min(2, 'El nombre debe tener al menos 2 caracteres.'),
  email: z
    .string()
    .min(1, 'El email es requerido.')
    .email('El correo electrónico debe ser una dirección válida.'),
  subject: z
    .string()
    .min(1, 'El asunto es requerido.')
    .min(2, 'El asunto debe tener al menos 2 caracteres.')
    .max(200, 'El asunto no debe exceder 200 caracteres.'),
  message: z
    .string()
    .min(1, 'El mensaje es requerido.')
    .min(5, 'El mensaje debe tener al menos 5 caracteres.')
    .max(2000, 'El mensaje no debe exceder 2000 caracteres.'),
  phone: z.string().optional(),
});

export const sendCodeSchema = z.object({
  email: z
    .string()
    .min(1, 'El email es requerido.')
    .email('El correo electrónico debe ser una dirección válida.'),
  name: z.string().optional(),
});

export type ContactFormInput = z.infer<typeof contactFormSchema>;
export type SendCodeInput = z.infer<typeof sendCodeSchema>;
