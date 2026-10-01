"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.domainCheckSchema = exports.leadSchema = void 0;
const zod_1 = require("zod");
exports.leadSchema = zod_1.z.object({
    full_name: zod_1.z
        .string()
        .min(1, 'El nombre es requerido.')
        .min(2, 'El nombre debe tener al menos 2 caracteres.')
        .optional(),
    name: zod_1.z.string().optional(),
    email: zod_1.z
        .string()
        .min(1, 'El email es requerido.')
        .email('El correo electrónico debe ser una dirección válida.'),
    phone: zod_1.z.string().optional(),
    company: zod_1.z.string().optional(),
    planId: zod_1.z.string().optional(),
    step_reached: zod_1.z.number().optional(),
});
exports.domainCheckSchema = zod_1.z.object({
    domain: zod_1.z
        .string()
        .min(1, 'El nombre de dominio es requerido.')
        .min(3, 'El dominio debe tener al menos 3 caracteres.')
        .regex(/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, 'Formato de dominio inválido (ej. miempresa.com).'),
});
