import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { collectionsRateLimiter } from '../middleware/rateLimiter';
import { validate } from '../middleware/validate';
import {
  createCollectionSchema,
  updateCollectionSchema,
  collectionIdParamSchema,
  queryCollectionsSchema,
} from '../schemas/collection.schema';
import { evaluateAclPermission, AclActor } from '../utils/acl';
import { logSecurityEvent } from '../middleware/auditLogger';
import { query } from '../db';

export const collectionsRouter = Router();

export function getCollectionActor(req: AuthenticatedRequest): AclActor {
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
 * GET /api/v1/collections
 * List all collections for the authenticated tenant with asset count and aggregated byte size.
 * Optional filter by workspace_id.
 */
collectionsRouter.get(
  '/',
  collectionsRateLimiter,
  requireAuth,
  validate(queryCollectionsSchema, 'query'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const actor = getCollectionActor(req);
      const workspaceId = req.query.workspace_id
        ? parseInt(String(req.query.workspace_id), 10)
        : null;

      const rows = (await query(
        `SELECT c.id, c.workspace_id, c.name, c.created_at,
                w.name as workspace_name,
                COUNT(DISTINCT a.id) as asset_count,
                COALESCE(SUM(v.byte_size), 0) as total_byte_size
         FROM collections c
         JOIN workspaces w ON w.id = c.workspace_id
         LEFT JOIN assets a ON a.collection_id = c.id AND a.deleted_at IS NULL AND a.status = 'ACTIVE'
         LEFT JOIN asset_versions v ON v.asset_id = a.id
         WHERE w.tenant_id = ?
           AND (? IS NULL OR c.workspace_id = ?)
         GROUP BY c.id, c.workspace_id, c.name, c.created_at, w.name
         ORDER BY c.name ASC`,
        [actor.tenantId, workspaceId, workspaceId],
      )) as Array<{
        id: number;
        workspace_id: number;
        name: string;
        created_at: string;
        workspace_name: string;
        asset_count: number | string;
        total_byte_size: number | string;
      }>;

      res.status(200).json({
        status: 200,
        data: (rows || []).map((c) => ({
          id: c.id,
          workspaceId: c.workspace_id,
          workspaceName: c.workspace_name,
          name: c.name,
          createdAt: c.created_at,
          assetCount: Number(c.asset_count || 0),
          totalByteSize: Number(c.total_byte_size || 0),
        })),
      });
    } catch (err: any) {
      console.error('List collections error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al consultar las colecciones.',
      });
    }
  },
);

/**
 * POST /api/v1/collections
 * Create a new collection in a workspace.
 * Requires EDIT or MANAGE permission on the workspace.
 */
collectionsRouter.post(
  '/',
  collectionsRateLimiter,
  requireAuth,
  validate(createCollectionSchema, 'body'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const actor = getCollectionActor(req);
      const { workspace_id, name } = req.body;

      // Verify workspace belongs to tenant
      const wsRows = (await query(
        'SELECT id, tenant_id FROM workspaces WHERE id = ? AND tenant_id = ?',
        [workspace_id, actor.tenantId],
      )) as Array<{ id: number; tenant_id: number }>;

      if (!wsRows || wsRows.length === 0) {
        res.status(404).json({
          status: 404,
          error: 'Not Found',
          message: 'El espacio de trabajo especificado no existe o pertenece a otro tenant.',
        });
        return;
      }

      const evalResult = await evaluateAclPermission(actor, 'WORKSPACE', workspace_id, 'EDIT', {
        tenantId: wsRows[0].tenant_id,
        workspaceId: workspace_id,
      });
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL).',
        });
        return;
      }

      const insertRes = await query<any>(
        'INSERT INTO collections (workspace_id, name) VALUES (?, ?)',
        [workspace_id, name],
      );

      const collectionId = Number(insertRes.insertId);

      await logSecurityEvent(req, {
        eventType: 'COLLECTION_CREATE',
        userId: Number(req.user?.userId),
        status: 'SUCCESS',
        details: `Created collection ID ${collectionId} (${name}) in workspace ${workspace_id}`,
      });

      res.status(201).json({
        status: 201,
        message: 'Colección creada exitosamente.',
        data: {
          id: collectionId,
          workspaceId: workspace_id,
          name,
        },
      });
    } catch (err: any) {
      console.error('Create collection error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al crear la colección.',
      });
    }
  },
);

/**
 * GET /api/v1/collections/:id
 * Get collection details and statistics.
 * Requires VIEW permission on the collection.
 */
collectionsRouter.get(
  '/:id',
  collectionsRateLimiter,
  requireAuth,
  validate(collectionIdParamSchema, 'params'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const actor = getCollectionActor(req);
      const collectionId = parseInt(String(req.params.id), 10);

      const rows = (await query(
        `SELECT c.id, c.workspace_id, c.name, c.created_at,
                w.name as workspace_name, w.tenant_id,
                COUNT(DISTINCT a.id) as asset_count,
                COALESCE(SUM(v.byte_size), 0) as total_byte_size
         FROM collections c
         JOIN workspaces w ON w.id = c.workspace_id
         LEFT JOIN assets a ON a.collection_id = c.id AND a.deleted_at IS NULL AND a.status = 'ACTIVE'
         LEFT JOIN asset_versions v ON v.asset_id = a.id
         WHERE c.id = ? AND w.tenant_id = ?
         GROUP BY c.id, c.workspace_id, c.name, c.created_at, w.name, w.tenant_id`,
        [collectionId, actor.tenantId],
      )) as Array<{
        id: number;
        workspace_id: number;
        name: string;
        created_at: string;
        workspace_name: string;
        tenant_id: number;
        asset_count: number | string;
        total_byte_size: number | string;
      }>;

      if (!rows || rows.length === 0) {
        res.status(404).json({
          status: 404,
          error: 'Not Found',
          message: 'Colección no encontrada.',
        });
        return;
      }

      const evalResult = await evaluateAclPermission(actor, 'COLLECTION', collectionId, 'VIEW', {
        tenantId: rows[0].tenant_id,
        workspaceId: rows[0].workspace_id,
        collectionId,
      });
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL).',
        });
        return;
      }

      const c = rows[0];
      res.status(200).json({
        status: 200,
        data: {
          id: c.id,
          workspaceId: c.workspace_id,
          workspaceName: c.workspace_name,
          name: c.name,
          createdAt: c.created_at,
          assetCount: Number(c.asset_count || 0),
          totalByteSize: Number(c.total_byte_size || 0),
        },
      });
    } catch (err: any) {
      console.error('Get collection error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al consultar la colección.',
      });
    }
  },
);

/**
 * PUT /api/v1/collections/:id
 * Update collection name.
 * Requires EDIT or MANAGE permission on the collection.
 */
collectionsRouter.put(
  '/:id',
  collectionsRateLimiter,
  requireAuth,
  validate(collectionIdParamSchema, 'params'),
  validate(updateCollectionSchema, 'body'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const actor = getCollectionActor(req);
      const collectionId = parseInt(String(req.params.id), 10);
      const { name } = req.body;

      const rows = (await query(
        `SELECT c.id, c.workspace_id, w.tenant_id
         FROM collections c
         JOIN workspaces w ON w.id = c.workspace_id
         WHERE c.id = ? AND w.tenant_id = ?`,
        [collectionId, actor.tenantId],
      )) as Array<{ id: number; workspace_id: number; tenant_id: number }>;

      if (!rows || rows.length === 0) {
        res.status(404).json({
          status: 404,
          error: 'Not Found',
          message: 'Colección no encontrada.',
        });
        return;
      }

      const evalResult = await evaluateAclPermission(actor, 'COLLECTION', collectionId, 'EDIT', {
        tenantId: rows[0].tenant_id,
        workspaceId: rows[0].workspace_id,
        collectionId,
      });
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL).',
        });
        return;
      }

      await query('UPDATE collections SET name = ? WHERE id = ?', [name, collectionId]);

      await logSecurityEvent(req, {
        eventType: 'COLLECTION_UPDATE',
        userId: Number(req.user?.userId),
        status: 'SUCCESS',
        details: `Updated collection ID ${collectionId} to name "${name}"`,
      });

      res.status(200).json({
        status: 200,
        message: 'Colección actualizada exitosamente.',
        data: {
          id: collectionId,
          name,
        },
      });
    } catch (err: any) {
      console.error('Update collection error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al actualizar la colección.',
      });
    }
  },
);

/**
 * DELETE /api/v1/collections/:id
 * Delete empty collection (EMPTY-ONLY rule, soft-deleted assets excluded).
 * Requires DELETE or MANAGE permission on the collection.
 */
collectionsRouter.delete(
  '/:id',
  collectionsRateLimiter,
  requireAuth,
  validate(collectionIdParamSchema, 'params'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const actor = getCollectionActor(req);
      const collectionId = parseInt(String(req.params.id), 10);

      const rows = (await query(
        `SELECT c.id, c.workspace_id, w.tenant_id
         FROM collections c
         JOIN workspaces w ON w.id = c.workspace_id
         WHERE c.id = ? AND w.tenant_id = ?`,
        [collectionId, actor.tenantId],
      )) as Array<{ id: number; workspace_id: number; tenant_id: number }>;

      if (!rows || rows.length === 0) {
        res.status(404).json({
          status: 404,
          error: 'Not Found',
          message: 'Colección no encontrada.',
        });
        return;
      }

      const evalResult = await evaluateAclPermission(actor, 'COLLECTION', collectionId, 'DELETE', {
        tenantId: rows[0].tenant_id,
        workspaceId: rows[0].workspace_id,
        collectionId,
      });
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL).',
        });
        return;
      }

      // Empty-check: active assets
      const assetCheck = (await query(
        `SELECT COUNT(*) as count FROM assets WHERE collection_id = ? AND deleted_at IS NULL AND status = 'ACTIVE'`,
        [collectionId],
      )) as Array<{ count: number | string }>;

      const assetCount = Number(assetCheck?.[0]?.count || 0);

      if (assetCount > 0) {
        res.status(409).json({
          status: 409,
          error: 'Conflict',
          message:
            'La colección contiene activos activos. Debe moverlos o eliminarlos antes de eliminar la colección.',
        });
        return;
      }

      await query('DELETE FROM collections WHERE id = ?', [collectionId]);

      await logSecurityEvent(req, {
        eventType: 'COLLECTION_DELETE',
        userId: Number(req.user?.userId),
        status: 'SUCCESS',
        details: `Deleted collection ID ${collectionId}`,
      });

      res.status(200).json({
        status: 200,
        message: 'Colección eliminada exitosamente.',
        data: { collectionId },
      });
    } catch (err: any) {
      console.error('Delete collection error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al eliminar la colección.',
      });
    }
  },
);
