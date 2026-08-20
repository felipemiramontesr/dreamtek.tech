import { z } from 'zod';

export const ResourceTypeEnum = z.enum(['WORKSPACE', 'COLLECTION', 'ASSET']);
export const PrincipalTypeEnum = z.enum(['USER', 'ROLE']);
export const PermissionEnum = z.enum(['VIEW', 'DOWNLOAD', 'EDIT', 'MANAGE', 'DELETE']);

export type ResourceType = z.infer<typeof ResourceTypeEnum>;
export type PrincipalType = z.infer<typeof PrincipalTypeEnum>;
export type Permission = z.infer<typeof PermissionEnum>;

export const createAclEntrySchema = z.object({
  resource_type: ResourceTypeEnum,
  resource_id: z.coerce.number().int().positive('resource_id debe ser un entero positivo'),
  principal_type: PrincipalTypeEnum,
  principal_id: z
    .string()
    .min(1, 'principal_id no puede estar vacío')
    .max(64, 'principal_id excede 64 caracteres'),
  permission: PermissionEnum,
});

export const queryAclSchema = z.object({
  resource_type: ResourceTypeEnum,
  resource_id: z.coerce.number().int().positive('resource_id debe ser un entero positivo'),
});

export const checkAclSchema = z.object({
  resource_type: ResourceTypeEnum,
  resource_id: z.coerce.number().int().positive('resource_id debe ser un entero positivo'),
  permission: PermissionEnum,
});

export const deleteAclEntryParamsSchema = z.object({
  id: z.coerce.number().int().positive('id de entrada ACL debe ser un entero positivo'),
});
