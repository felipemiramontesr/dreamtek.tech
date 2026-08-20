import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { workspacesRateLimiter } from '../middleware/rateLimiter';
import { validate } from '../middleware/validate';
import {
  createWorkspaceSchema,
  updateWorkspaceSchema,
  workspaceIdParamSchema,
} from '../schemas/workspace.schema';
import { evaluateAclPermission, AclActor } from '../utils/acl';
import { logSecurityEvent } from '../middleware/auditLogger';
import { query } from '../db';

export const workspacesRouter = Router();

export function getWorkspaceActor(req: AuthenticatedRequest): AclActor {
  const tenantId = Number((req.user as any)?.tenantId || req.user?.userId);
  if (!tenantId || isNaN(tenantId)) {
    throw new Error('Invalid authenticated user context.');
  }
  return {
    id: req.user!.userId,
    role: req.user!.role,
    tenantId,
  };
}

/**
 * GET /api/v1/workspaces
 * List all workspaces for the authenticated tenant with collection and active asset count.
 */
workspacesRouter.get(
  '/',
  workspacesRateLimiter,
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const actor = getWorkspaceActor(req);

      const rows = (await query(
        `SELECT w.id, w.name, w.created_at,
                COUNT(DISTINCT c.id) as collection_count,
                COUNT(DISTINCT a.id) as asset_count
         FROM workspaces w
         LEFT JOIN collections c ON c.workspace_id = w.id
         LEFT JOIN assets a ON a.workspace_id = w.id AND a.deleted_at IS NULL AND a.status = 'ACTIVE'
         WHERE w.tenant_id = ?
         GROUP BY w.id, w.name, w.created_at
         ORDER BY w.name ASC`,
        [actor.tenantId],
      )) as Array<{
        id: number;
        name: string;
        created_at: string;
        collection_count: number | string;
        asset_count: number | string;
      }>;

      res.status(200).json({
        status: 200,
        data: (rows || []).map((w) => ({
          id: w.id,
          name: w.name,
          createdAt: w.created_at,
          collectionCount: Number(w.collection_count || 0),
          assetCount: Number(w.asset_count || 0),
        })),
      });
    } catch (err: any) {
      console.error('List workspaces error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al consultar los espacios de trabajo.',
      });
    }
  },
);

/**
 * POST /api/v1/workspaces
 * Create a new workspace for the authenticated tenant.
 * Requires ADMIN role or TENANT_OWNER.
 */
workspacesRouter.post(
  '/',
  workspacesRateLimiter,
  requireAuth,
  validate(createWorkspaceSchema, 'body'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const actor = getWorkspaceActor(req);
      const isOwner = Number(actor.id) === Number(actor.tenantId);
      const isAdmin = actor.role === 'ADMIN';

      if (!isAdmin && !isOwner) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message:
            'Solo el propietario del tenant o un administrador pueden crear espacios de trabajo.',
        });
        return;
      }

      const { name } = req.body;

      const insertRes = await query<any>('INSERT INTO workspaces (tenant_id, name) VALUES (?, ?)', [
        actor.tenantId,
        name,
      ]);

      const workspaceId = Number(insertRes.insertId);

      await logSecurityEvent(req, {
        eventType: 'WORKSPACE_CREATE',
        userId: Number(req.user?.userId),
        status: 'SUCCESS',
        details: `Created workspace ID ${workspaceId} (${name}) for tenant ${actor.tenantId}`,
      });

      res.status(201).json({
        status: 201,
        message: 'Espacio de trabajo creado exitosamente.',
        data: {
          id: workspaceId,
          name,
        },
      });
    } catch (err: any) {
      console.error('Create workspace error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al crear el espacio de trabajo.',
      });
    }
  },
);

/**
 * GET /api/v1/workspaces/:id
 * Get workspace details and statistics.
 * Requires VIEW permission on the workspace.
 */
workspacesRouter.get(
  '/:id',
  workspacesRateLimiter,
  requireAuth,
  validate(workspaceIdParamSchema, 'params'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const actor = getWorkspaceActor(req);
      const workspaceId = parseInt(String(req.params.id), 10);

      const rows = (await query(
        `SELECT w.id, w.name, w.created_at,
                COUNT(DISTINCT c.id) as collection_count,
                COUNT(DISTINCT a.id) as asset_count,
                COALESCE(SUM(v.byte_size), 0) as total_byte_size
         FROM workspaces w
         LEFT JOIN collections c ON c.workspace_id = w.id
         LEFT JOIN assets a ON a.workspace_id = w.id AND a.deleted_at IS NULL AND a.status = 'ACTIVE'
         LEFT JOIN asset_versions v ON v.asset_id = a.id
         WHERE w.id = ? AND w.tenant_id = ?
         GROUP BY w.id, w.name, w.created_at`,
        [workspaceId, actor.tenantId],
      )) as Array<{
        id: number;
        name: string;
        created_at: string;
        collection_count: number | string;
        asset_count: number | string;
        total_byte_size: number | string;
      }>;

      if (!rows || rows.length === 0) {
        res.status(404).json({
          status: 404,
          error: 'Not Found',
          message: 'Espacio de trabajo no encontrado.',
        });
        return;
      }

      const evalResult = await evaluateAclPermission(actor, 'WORKSPACE', workspaceId, 'VIEW', {
        tenantId: (rows[0] as any).tenant_id ?? actor.tenantId,
        workspaceId,
      });
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL).',
        });
        return;
      }

      const w = rows[0];
      res.status(200).json({
        status: 200,
        data: {
          id: w.id,
          name: w.name,
          createdAt: w.created_at,
          collectionCount: Number(w.collection_count || 0),
          assetCount: Number(w.asset_count || 0),
          totalByteSize: Number(w.total_byte_size || 0),
        },
      });
    } catch (err: any) {
      console.error('Get workspace error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al consultar el espacio de trabajo.',
      });
    }
  },
);

/**
 * PUT /api/v1/workspaces/:id
 * Update workspace name.
 * Requires EDIT or MANAGE permission on the workspace.
 */
workspacesRouter.put(
  '/:id',
  workspacesRateLimiter,
  requireAuth,
  validate(workspaceIdParamSchema, 'params'),
  validate(updateWorkspaceSchema, 'body'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const actor = getWorkspaceActor(req);
      const workspaceId = parseInt(String(req.params.id), 10);
      const { name } = req.body;

      const rows = (await query(
        'SELECT id, tenant_id FROM workspaces WHERE id = ? AND tenant_id = ?',
        [workspaceId, actor.tenantId],
      )) as Array<{ id: number; tenant_id: number }>;

      if (!rows || rows.length === 0) {
        res.status(404).json({
          status: 404,
          error: 'Not Found',
          message: 'Espacio de trabajo no encontrado.',
        });
        return;
      }

      const evalResult = await evaluateAclPermission(actor, 'WORKSPACE', workspaceId, 'EDIT', {
        tenantId: rows[0].tenant_id,
        workspaceId,
      });
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL).',
        });
        return;
      }

      await query('UPDATE workspaces SET name = ? WHERE id = ? AND tenant_id = ?', [
        name,
        workspaceId,
        actor.tenantId,
      ]);

      await logSecurityEvent(req, {
        eventType: 'WORKSPACE_UPDATE',
        userId: Number(req.user?.userId),
        status: 'SUCCESS',
        details: `Updated workspace ID ${workspaceId} to name "${name}"`,
      });

      res.status(200).json({
        status: 200,
        message: 'Espacio de trabajo actualizado exitosamente.',
        data: {
          id: workspaceId,
          name,
        },
      });
    } catch (err: any) {
      console.error('Update workspace error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al actualizar el espacio de trabajo.',
      });
    }
  },
);

/**
 * DELETE /api/v1/workspaces/:id
 * Delete empty workspace (EMPTY-ONLY rule, soft-deleted assets excluded).
 * Requires DELETE or MANAGE permission on the workspace.
 */
workspacesRouter.delete(
  '/:id',
  workspacesRateLimiter,
  requireAuth,
  validate(workspaceIdParamSchema, 'params'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const actor = getWorkspaceActor(req);
      const workspaceId = parseInt(String(req.params.id), 10);

      const rows = (await query(
        'SELECT id, tenant_id FROM workspaces WHERE id = ? AND tenant_id = ?',
        [workspaceId, actor.tenantId],
      )) as Array<{ id: number; tenant_id: number }>;

      if (!rows || rows.length === 0) {
        res.status(404).json({
          status: 404,
          error: 'Not Found',
          message: 'Espacio de trabajo no encontrado.',
        });
        return;
      }

      const evalResult = await evaluateAclPermission(actor, 'WORKSPACE', workspaceId, 'DELETE', {
        tenantId: rows[0].tenant_id,
        workspaceId,
      });
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL).',
        });
        return;
      }

      // Empty-check: active collections or active assets
      const colCheck = (await query(
        'SELECT COUNT(*) as count FROM collections WHERE workspace_id = ?',
        [workspaceId],
      )) as Array<{ count: number | string }>;

      const assetCheck = (await query(
        `SELECT COUNT(*) as count FROM assets WHERE workspace_id = ? AND deleted_at IS NULL AND status = 'ACTIVE'`,
        [workspaceId],
      )) as Array<{ count: number | string }>;

      const collectionCount = Number(colCheck?.[0]?.count || 0);
      const assetCount = Number(assetCheck?.[0]?.count || 0);

      if (collectionCount > 0 || assetCount > 0) {
        res.status(409).json({
          status: 409,
          error: 'Conflict',
          message:
            'El espacio de trabajo contiene colecciones o activos activos. Debe vaciarlo antes de eliminarlo.',
        });
        return;
      }

      await query('DELETE FROM workspaces WHERE id = ? AND tenant_id = ?', [
        workspaceId,
        actor.tenantId,
      ]);

      await logSecurityEvent(req, {
        eventType: 'WORKSPACE_DELETE',
        userId: Number(req.user?.userId),
        status: 'SUCCESS',
        details: `Deleted workspace ID ${workspaceId}`,
      });

      res.status(200).json({
        status: 200,
        message: 'Espacio de trabajo eliminado exitosamente.',
        data: { workspaceId },
      });
    } catch (err: any) {
      console.error('Delete workspace error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al eliminar el espacio de trabajo.',
      });
    }
  },
);
