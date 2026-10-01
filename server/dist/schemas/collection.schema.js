"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.queryCollectionsSchema = exports.collectionIdParamSchema = exports.updateCollectionSchema = exports.createCollectionSchema = void 0;
const zod_1 = require("zod");
exports.createCollectionSchema = zod_1.z
    .object({
    workspace_id: zod_1.z.coerce
        .number({ required_error: 'El workspace_id es requerido.' })
        .int('El workspace_id debe ser un entero.')
        .positive('El workspace_id debe ser mayor a 0.'),
    name: zod_1.z
        .string({ required_error: 'El nombre de la colección es requerido.' })
        .trim()
        .min(1, 'El nombre debe tener al menos 1 caracter.')
        .max(100, 'El nombre no puede exceder los 100 caracteres.'),
})
    .strict();
exports.updateCollectionSchema = zod_1.z
    .object({
    name: zod_1.z
        .string({ required_error: 'El nombre de la colección es requerido.' })
        .trim()
        .min(1, 'El nombre debe tener al menos 1 caracter.')
        .max(100, 'El nombre no puede exceder los 100 caracteres.'),
})
    .strict();
exports.collectionIdParamSchema = zod_1.z
    .object({
    id: zod_1.z.coerce
        .number({ invalid_type_error: 'ID de colección inválido.' })
        .int('El ID debe ser un número entero.')
        .positive('El ID debe ser mayor a 0.'),
})
    .strict();
exports.queryCollectionsSchema = zod_1.z
    .object({
    workspace_id: zod_1.z.coerce
        .number()
        .int('El workspace_id debe ser un entero.')
        .positive('El workspace_id debe ser mayor a 0.')
        .optional(),
})
    .strict();
