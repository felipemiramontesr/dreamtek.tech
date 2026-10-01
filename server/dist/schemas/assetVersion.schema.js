"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assetVersionParamsSchema = exports.assetIdParamSchema = void 0;
const zod_1 = require("zod");
/**
 * Route parameter validation schema for Asset ID.
 */
exports.assetIdParamSchema = zod_1.z.object({
    id: zod_1.z.coerce.number().int().positive({ message: 'El ID de activo debe ser un entero positivo.' }),
});
/**
 * Route parameter validation schema for Asset ID and Version Number.
 */
exports.assetVersionParamsSchema = zod_1.z.object({
    id: zod_1.z.coerce.number().int().positive({ message: 'El ID de activo debe ser un entero positivo.' }),
    versionNumber: zod_1.z.coerce
        .number()
        .int()
        .positive({ message: 'El número de versión debe ser un entero positivo.' }),
});
