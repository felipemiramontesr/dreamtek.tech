import { query } from '../db';
import type { ResourceType, Permission } from '../schemas/acl.schema';

export interface AclActor {
  id: string | number;
  role: string;
  tenantId: number;
}

export interface AclEvaluationResult {
  allowed: boolean;
  reason:
    | 'ADMIN_BYPASS'
    | 'ACL_GRANTED'
    | 'TENANT_MEMBER_DEFAULT_VIEW'
    | 'ASSET_DELETED'
    | 'NOT_FOUND_OR_CROSS_TENANT'
    | 'DEFAULT_DENY';
  grantedBy?: string;
}

export interface PreloadedResourceMetadata {
  tenantId?: number;
  workspaceId?: number | null;
  collectionId?: number | null;
  assetId?: number | null;
  status?: string;
  deletedAt?: Date | null;
}

/**
 * Celosía de implicación de permisos (Permission Implication Lattice):
 * - MANAGE  ⊃ { DELETE, EDIT, DOWNLOAD, VIEW }
 * - DELETE  ⊃ { VIEW }
 * - EDIT    ⊃ { DOWNLOAD, VIEW }
 * - DOWNLOAD⊃ { VIEW }
 * - VIEW    ⊃ { VIEW }
 */
export function hasPermission(granted: Permission, required: Permission): boolean {
  if (granted === required) return true;
  if (granted === 'MANAGE') return true;

  if (granted === 'DELETE') {
    return required === 'VIEW';
  }

  if (granted === 'EDIT') {
    return required === 'DOWNLOAD' || required === 'VIEW';
  }

  if (granted === 'DOWNLOAD') {
    return required === 'VIEW';
  }

  return false;
}

/**
 * Motor de evaluación jerárquica de permisos ACL:
 * 1. ADMIN Bypass -> Full Access ('MANAGE').
 * 2. Validación de existencia y tenant isolation (o uso de preloadedMetadata).
 * 3. Soft-delete guard: Si el recurso está DELETED, se deniega salvo que sea 'MANAGE'.
 * 4. Tenant Owner check: El propietario del tenant tiene control total ('MANAGE') sobre sus recursos.
 * 5. Búsqueda de entradas ACL directas e indirectas (ASSET -> COLLECTION -> WORKSPACE).
 * 6. Default-Deny con fallback documentado (VIEW para miembros del mismo tenant).
 */
export async function evaluateAclPermission(
  actor: AclActor,
  resourceType: ResourceType,
  resourceId: number,
  requiredPermission: Permission,
  preloadedMetadata?: PreloadedResourceMetadata,
): Promise<AclEvaluationResult> {
  // 1. ADMIN Bypass
  if (actor.role === 'ADMIN') {
    return { allowed: true, reason: 'ADMIN_BYPASS' };
  }

  let tenantId: number | null = null;
  let workspaceId: number | null = null;
  let collectionId: number | null = null;
  let isDeleted = false;

  // 2. Fetch and validate resource hierarchy & tenancy
  if (preloadedMetadata) {
    tenantId = preloadedMetadata.tenantId ?? actor.tenantId;
    if (tenantId !== actor.tenantId) {
      return { allowed: false, reason: 'NOT_FOUND_OR_CROSS_TENANT' };
    }
    workspaceId = preloadedMetadata.workspaceId || null;
    collectionId = preloadedMetadata.collectionId || null;
    isDeleted = preloadedMetadata.status === 'DELETED' || preloadedMetadata.deletedAt != null;
  } else if (resourceType === 'ASSET') {
    const rows = (await query(
      'SELECT id, tenant_id, workspace_id, collection_id, status, deleted_at FROM assets WHERE id = ?',
      [resourceId],
    )) as Array<{
      id: number;
      tenant_id: number;
      workspace_id: number;
      collection_id: number | null;
      status: string;
      deleted_at: Date | null;
    }>;

    if (!rows || rows.length === 0 || rows[0].tenant_id !== actor.tenantId) {
      return { allowed: false, reason: 'NOT_FOUND_OR_CROSS_TENANT' };
    }

    tenantId = rows[0].tenant_id;
    workspaceId = rows[0].workspace_id;
    collectionId = rows[0].collection_id;
    isDeleted = rows[0].status === 'DELETED' || rows[0].deleted_at !== null;
  } else if (resourceType === 'COLLECTION') {
    const rows = (await query(
      `SELECT c.id, c.workspace_id, w.tenant_id 
       FROM collections c 
       JOIN workspaces w ON w.id = c.workspace_id 
       WHERE c.id = ?`,
      [resourceId],
    )) as Array<{ id: number; workspace_id: number; tenant_id: number }>;

    if (!rows || rows.length === 0 || rows[0].tenant_id !== actor.tenantId) {
      return { allowed: false, reason: 'NOT_FOUND_OR_CROSS_TENANT' };
    }

    tenantId = rows[0].tenant_id;
    workspaceId = rows[0].workspace_id;
  } else if (resourceType === 'WORKSPACE') {
    const rows = (await query('SELECT id, tenant_id FROM workspaces WHERE id = ?', [
      resourceId,
    ])) as Array<{ id: number; tenant_id: number }>;

    if (!rows || rows.length === 0 || rows[0].tenant_id !== actor.tenantId) {
      return { allowed: false, reason: 'NOT_FOUND_OR_CROSS_TENANT' };
    }

    tenantId = rows[0].tenant_id;
    workspaceId = rows[0].id;
  }

  // 3. Soft-delete guard
  if (isDeleted && requiredPermission !== 'MANAGE') {
    return { allowed: false, reason: 'ASSET_DELETED' };
  }

  // 4. Tenant Owner check (Tenant Owner holds full MANAGE on their own tenant resources)
  if (tenantId !== null && Number(actor.id) === Number(tenantId)) {
    return { allowed: true, reason: 'ACL_GRANTED', grantedBy: 'TENANT_OWNER' };
  }

  // 5. Query applicable ACL entries for this actor and roles
  const principalIdStr = String(actor.id);
  const aclRows = (await query(
    `SELECT resource_type, resource_id, permission, granted_by 
     FROM dam_acl_entries 
     WHERE tenant_id = ? 
       AND (
         (principal_type = 'USER' AND principal_id = ?) 
         OR 
         (principal_type = 'ROLE' AND principal_id = ?)
       )`,
    [actor.tenantId, principalIdStr, actor.role],
  )) as Array<{
    resource_type: ResourceType;
    resource_id: number;
    permission: Permission;
    granted_by: string;
  }>;

  if (aclRows && aclRows.length > 0) {
    // 5a. Direct Asset check
    if (resourceType === 'ASSET') {
      const assetGrant = aclRows.find(
        (r) =>
          r.resource_type === 'ASSET' &&
          r.resource_id === resourceId &&
          hasPermission(r.permission, requiredPermission),
      );
      if (assetGrant) {
        return { allowed: true, reason: 'ACL_GRANTED', grantedBy: assetGrant.granted_by };
      }
    }

    // 5b. Inherited Collection check
    const targetColId = resourceType === 'COLLECTION' ? resourceId : collectionId;
    if (targetColId) {
      const collectionGrant = aclRows.find(
        (r) =>
          r.resource_type === 'COLLECTION' &&
          r.resource_id === targetColId &&
          hasPermission(r.permission, requiredPermission),
      );
      if (collectionGrant) {
        return { allowed: true, reason: 'ACL_GRANTED', grantedBy: collectionGrant.granted_by };
      }
    }

    // 5c. Inherited Workspace check
    const targetWsId = resourceType === 'WORKSPACE' ? resourceId : workspaceId;
    if (targetWsId) {
      const workspaceGrant = aclRows.find(
        (r) =>
          r.resource_type === 'WORKSPACE' &&
          r.resource_id === targetWsId &&
          hasPermission(r.permission, requiredPermission),
      );
      if (workspaceGrant) {
        return { allowed: true, reason: 'ACL_GRANTED', grantedBy: workspaceGrant.granted_by };
      }
    }
  }

  // 6. Default-Deny fallback
  // If required permission is VIEW and actor belongs to the same tenant, allow default tenant view
  if (requiredPermission === 'VIEW' && tenantId === actor.tenantId && !isDeleted) {
    return { allowed: true, reason: 'TENANT_MEMBER_DEFAULT_VIEW' };
  }

  return { allowed: false, reason: 'DEFAULT_DENY' };
}
