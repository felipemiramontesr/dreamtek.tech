"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.moveAssetLocationSchema = exports.workspaceIdParamSchema = exports.updateWorkspaceSchema = exports.createWorkspaceSchema = void 0;
const zod_1 = require("zod");
exports.createWorkspaceSchema = zod_1.z
    .object({
    name: zod_1.z
        .string({ required_error: 'El nombre del espacio de trabajo es requerido.' })
        .trim()
        .min(1, 'El nombre debe tener al menos 1 caracter.')
        .max(100, 'El nombre no puede exceder los 100 caracteres.'),
})
    .strict();
exports.updateWorkspaceSchema = zod_1.z
    .object({
    name: zod_1.z
        .string({ required_error: 'El nombre del espacio de trabajo es requerido.' })
        .trim()
        .min(1, 'El nombre debe tener al menos 1 caracter.')
        .max(100, 'El nombre no puede exceder los 100 caracteres.'),
})
    .strict();
exports.workspaceIdParamSchema = zod_1.z
    .object({
    id: zod_1.z.coerce
        .number({ invalid_type_error: 'ID de espacio de trabajo inválido.' })
        .int('El ID debe ser un número entero.')
        .positive('El ID debe ser mayor a 0.'),
})
    .strict();
exports.moveAssetLocationSchema = zod_1.z
    .object({
    workspace_id: zod_1.z.coerce
        .number({ required_error: 'El workspace_id de destino es requerido.' })
        .int('El workspace_id debe ser un entero.')
        .positive('El workspace_id debe ser mayor a 0.'),
    collection_id: zod_1.z.coerce
        .number()
        .int('El collection_id debe ser un entero.')
        .positive('El collection_id debe ser mayor a 0.')
        .nullable()
        .optional(),
})
    .strict();
