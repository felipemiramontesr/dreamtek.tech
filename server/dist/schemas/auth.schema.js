"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mfaDisableSchema = exports.mfaEnableSchema = exports.mfaVerifySchema = exports.registerSchema = exports.loginSchema = void 0;
const zod_1 = require("zod");
exports.loginSchema = zod_1.z.object({
    email: zod_1.z
        .string()
        .min(1, 'El correo electrónico o nombre de usuario es requerido.')
        .min(3, 'El identificador debe tener al menos 3 caracteres.'),
    password: zod_1.z
        .string()
        .min(1, 'La contraseña es requerida.')
        .min(8, 'La contraseña debe tener al menos 8 caracteres.'),
});
exports.registerSchema = zod_1.z.object({
    full_name: zod_1.z
        .string()
        .min(1, 'El nombre completo es requerido.')
        .min(2, 'El nombre debe tener al menos 2 caracteres.'),
    email: zod_1.z
        .string()
        .min(1, 'El email es requerido.')
        .email('El correo electrónico debe ser una dirección válida.'),
    password: zod_1.z
        .string()
        .min(1, 'La contraseña es requerida.')
        .min(8, 'La contraseña debe tener al menos 8 caracteres.'),
    phone: zod_1.z.string().optional(),
    confirmPassword: zod_1.z.string().optional(),
});
exports.mfaVerifySchema = zod_1.z.object({
    code: zod_1.z.string().min(1, 'El código es requerido.').max(32, 'El código no puede exceder 32 caracteres.'),
    method: zod_1.z.enum(['TOTP', 'EMAIL', 'RECOVERY'], {
        errorMap: () => ({ message: 'Método de verificación debe ser TOTP, EMAIL o RECOVERY.' }),
    }),
});
exports.mfaEnableSchema = zod_1.z.object({
    code: zod_1.z.string().min(6, 'El código debe tener 6 dígitos.').max(6, 'El código debe tener 6 dígitos.'),
    secretBase32: zod_1.z.string().min(16, 'El secreto TOTP es inválido.').optional(),
    recoveryCodes: zod_1.z.array(zod_1.z.string()).optional(),
});
exports.mfaDisableSchema = zod_1.z.object({
    password: zod_1.z.string().min(1, 'La contraseña actual es requerida.'),
    code: zod_1.z.string().min(1, 'El código de confirmación o recuperación es requerido.'),
});
