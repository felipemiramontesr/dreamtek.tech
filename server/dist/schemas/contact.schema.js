"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendCodeSchema = exports.contactFormSchema = void 0;
const zod_1 = require("zod");
exports.contactFormSchema = zod_1.z.object({
    name: zod_1.z
        .string()
        .min(1, 'El nombre es requerido.')
        .min(2, 'El nombre debe tener al menos 2 caracteres.'),
    email: zod_1.z
        .string()
        .min(1, 'El email es requerido.')
        .email('El correo electrónico debe ser una dirección válida.'),
    subject: zod_1.z
        .string()
        .min(2, 'El asunto debe tener al menos 2 caracteres.')
        .max(200, 'El asunto no debe exceder 200 caracteres.')
        .optional(),
    message: zod_1.z
        .string()
        .min(1, 'El mensaje es requerido.')
        .min(5, 'El mensaje debe tener al menos 5 caracteres.')
        .max(2000, 'El mensaje no debe exceder 2000 caracteres.'),
    phone: zod_1.z.string().optional(),
    company: zod_1.z.string().optional(),
    service: zod_1.z.string().optional(),
    code: zod_1.z.string().optional(),
});
exports.sendCodeSchema = zod_1.z.object({
    email: zod_1.z
        .string()
        .min(1, 'El email es requerido.')
        .email('El correo electrónico debe ser una dirección válida.'),
    name: zod_1.z.string().optional(),
});
