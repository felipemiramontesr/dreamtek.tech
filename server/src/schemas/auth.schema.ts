import { z } from 'zod';

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'El correo electrónico o nombre de usuario es requerido.')
    .min(3, 'El identificador debe tener al menos 3 caracteres.'),
  password: z
    .string()
    .min(1, 'La contraseña es requerida.')
    .min(8, 'La contraseña debe tener al menos 8 caracteres.'),
});

export const registerSchema = z.object({
  full_name: z
    .string()
    .min(1, 'El nombre completo es requerido.')
    .min(2, 'El nombre debe tener al menos 2 caracteres.'),
  email: z
    .string()
    .min(1, 'El email es requerido.')
    .email('El correo electrónico debe ser una dirección válida.'),
  password: z
    .string()
    .min(1, 'La contraseña es requerida.')
    .min(8, 'La contraseña debe tener al menos 8 caracteres.'),
  confirmPassword: z.string().optional(),
});

export const mfaVerifySchema = z.object({
  code: z.string().min(1, 'El código es requerido.').max(32, 'El código no puede exceder 32 caracteres.'),
  method: z.enum(['TOTP', 'EMAIL', 'RECOVERY'], {
    errorMap: () => ({ message: 'Método de verificación debe ser TOTP, EMAIL o RECOVERY.' }),
  }),
});

export const mfaEnableSchema = z.object({
  code: z.string().min(6, 'El código debe tener 6 dígitos.').max(6, 'El código debe tener 6 dígitos.'),
  secretBase32: z.string().min(16, 'El secreto TOTP es inválido.'),
  recoveryCodes: z.array(z.string()).optional(),
});

export const mfaDisableSchema = z.object({
  password: z.string().min(1, 'La contraseña actual es requerida.'),
  code: z.string().min(1, 'El código de confirmación o recuperación es requerido.'),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type MfaVerifyInput = z.infer<typeof mfaVerifySchema>;
export type MfaEnableInput = z.infer<typeof mfaEnableSchema>;
export type MfaDisableInput = z.infer<typeof mfaDisableSchema>;
