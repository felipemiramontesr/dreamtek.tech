"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteAclEntryParamsSchema = exports.checkAclSchema = exports.queryAclSchema = exports.createAclEntrySchema = exports.PermissionEnum = exports.PrincipalTypeEnum = exports.ResourceTypeEnum = void 0;
const zod_1 = require("zod");
exports.ResourceTypeEnum = zod_1.z.enum(['WORKSPACE', 'COLLECTION', 'ASSET']);
exports.PrincipalTypeEnum = zod_1.z.enum(['USER', 'ROLE']);
exports.PermissionEnum = zod_1.z.enum(['VIEW', 'DOWNLOAD', 'EDIT', 'MANAGE', 'DELETE']);
exports.createAclEntrySchema = zod_1.z.object({
    resource_type: exports.ResourceTypeEnum,
    resource_id: zod_1.z.coerce.number().int().positive('resource_id debe ser un entero positivo'),
    principal_type: exports.PrincipalTypeEnum,
    principal_id: zod_1.z
        .string()
        .min(1, 'principal_id no puede estar vacío')
        .max(64, 'principal_id excede 64 caracteres'),
    permission: exports.PermissionEnum,
});
exports.queryAclSchema = zod_1.z.object({
    resource_type: exports.ResourceTypeEnum,
    resource_id: zod_1.z.coerce.number().int().positive('resource_id debe ser un entero positivo'),
});
exports.checkAclSchema = zod_1.z.object({
    resource_type: exports.ResourceTypeEnum,
    resource_id: zod_1.z.coerce.number().int().positive('resource_id debe ser un entero positivo'),
    permission: exports.PermissionEnum,
});
exports.deleteAclEntryParamsSchema = zod_1.z.object({
    id: zod_1.z.coerce.number().int().positive('id de entrada ACL debe ser un entero positivo'),
});
