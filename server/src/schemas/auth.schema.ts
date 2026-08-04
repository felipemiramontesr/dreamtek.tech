import { z } from 'zod';

export const loginSchema = z.object({
  email: z
    .string({ required_error: 'El email es requerido.' })
    .email('El correo electrónico debe ser una dirección válida.'),
  password: z
    .string({ required_error: 'La contraseña es requerida.' })
    .min(8, 'La contraseña debe tener al menos 8 caracteres.'),
});

export const registerSchema = z
  .object({
    full_name: z
      .string({ required_error: 'El nombre completo es requerido.' })
      .min(2, 'El nombre debe tener al menos 2 caracteres.'),
    email: z
      .string({ required_error: 'El email es requerido.' })
      .email('El correo electrónico debe ser una dirección válida.'),
    password: z
      .string({ required_error: 'La contraseña es requerida.' })
      .min(8, 'La contraseña debe tener al menos 8 caracteres.'),
    confirmPassword: z
      .string()
      .optional(),
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
