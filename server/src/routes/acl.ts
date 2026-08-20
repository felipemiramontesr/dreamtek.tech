import { Router, Request, Response } from 'express';
import { query } from '../db';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import {
  createAclEntrySchema,
  queryAclSchema,
  checkAclSchema,
  deleteAclEntryParamsSchema,
} from '../schemas/acl.schema';
import { evaluateAclPermission } from '../utils/acl';
import { logSecurityEvent } from '../middleware/auditLogger';

const router = Router();

function extractActor(req: AuthenticatedRequest) {
  return {
    id: req.user!.userId,
    role: req.user!.role,
    tenantId: Number((req.user as any)?.tenantId || req.user?.userId),
  };
}

/**
 * GET /api/v1/acl/entries
 * Consulta las entradas de ACL asignadas a un recurso específico dentro del tenant.
 */
router.get(
  '/entries',
  requireAuth,
  validate(queryAclSchema, 'query'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      const { resource_type, resource_id } = req.query as unknown as {
        resource_type: 'WORKSPACE' | 'COLLECTION' | 'ASSET';
        resource_id: number;
      };

      const actor = extractActor(authReq);

      // Verificar que el actor tenga al menos permiso VIEW sobre el recurso
      const evalResult = await evaluateAclPermission(actor, resource_type, resource_id, 'VIEW');
      if (!evalResult.allowed) {
        await logSecurityEvent(req, {
          eventType: 'ACL_DENIED',
          userId: Number(actor.id),
          status: 'BLOCKED',
          details: `ACL_DENIED reason=${evalResult.reason} resource_type=${resource_type} resource_id=${resource_id}`,
        });
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'No posee permisos para inspeccionar la ACL de este recurso.',
        });
        return;
      }

      const entries = (await query(
        `SELECT id, tenant_id, resource_type, resource_id, principal_type, principal_id, permission, granted_by, created_at, updated_at
         FROM dam_acl_entries
         WHERE tenant_id = ? AND resource_type = ? AND resource_id = ?
         ORDER BY created_at ASC`,
        [actor.tenantId, resource_type, resource_id],
      )) as Array<Record<string, unknown>>;

      res.status(200).json({ entries: entries || [] });
    } catch (error) {
      console.error('Error al consultar entradas de ACL:', error);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al consultar entradas de ACL.',
      });
    }
  },
);

/**
 * POST /api/v1/acl/entries
 * Otorga o actualiza un permiso granular en la ACL para un usuario o rol.
 * Requiere permiso 'MANAGE' o rol 'ADMIN'.
 */
router.post(
  '/entries',
  requireAuth,
  validate(createAclEntrySchema, 'body'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      const { resource_type, resource_id, principal_type, principal_id, permission } = req.body;

      const actor = extractActor(authReq);

      // Verificar que el actor tenga permiso MANAGE sobre el recurso
      const evalResult = await evaluateAclPermission(actor, resource_type, resource_id, 'MANAGE');
      if (!evalResult.allowed) {
        await logSecurityEvent(req, {
          eventType: 'ACL_DENIED',
          userId: Number(actor.id),
          status: 'BLOCKED',
          details: `ACL_DENIED operation=GRANT_ACL reason=${evalResult.reason} resource_type=${resource_type} resource_id=${resource_id}`,
        });
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Se requiere permiso MANAGE para otorgar permisos de acceso a este recurso.',
        });
        return;
      }

      await query(
        `INSERT INTO dam_acl_entries 
          (tenant_id, resource_type, resource_id, principal_type, principal_id, permission, granted_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE 
           permission = VALUES(permission),
           granted_by = VALUES(granted_by),
           updated_at = CURRENT_TIMESTAMP`,
        [
          actor.tenantId,
          resource_type,
          resource_id,
          principal_type,
          String(principal_id),
          permission,
          String(actor.id),
        ],
      );

      await logSecurityEvent(req, {
        eventType: 'ACL_GRANT',
        userId: Number(actor.id),
        status: 'SUCCESS',
        details: `ACL_GRANT tenant=${actor.tenantId} resource=${resource_type}:${resource_id} principal=${principal_type}:${principal_id} perm=${permission}`,
      });

      res.status(201).json({
        status: 201,
        message: 'Permiso de ACL registrado exitosamente.',
        entry: {
          tenant_id: actor.tenantId,
          resource_type,
          resource_id,
          principal_type,
          principal_id,
          permission,
          granted_by: actor.id,
        },
      });
    } catch (error) {
      console.error('Error al otorgar permiso de ACL:', error);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al registrar permiso de ACL.',
      });
    }
  },
);

/**
 * DELETE /api/v1/acl/entries/:id
 * Revoca una entrada de ACL específica.
 * Requiere permiso 'MANAGE' o rol 'ADMIN'.
 */
router.delete(
  '/entries/:id',
  requireAuth,
  validate(deleteAclEntryParamsSchema, 'params'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      const entryId = Number(req.params.id);

      const actor = extractActor(authReq);

      // Consultar la entrada de ACL para verificar existencia y tenancy
      const rows = (await query(
        `SELECT id, tenant_id, resource_type, resource_id, principal_type, principal_id, permission
         FROM dam_acl_entries
         WHERE id = ? AND tenant_id = ?`,
        [entryId, actor.tenantId],
      )) as Array<{
        id: number;
        tenant_id: number;
        resource_type: 'WORKSPACE' | 'COLLECTION' | 'ASSET';
        resource_id: number;
        principal_type: string;
        principal_id: string;
        permission: string;
      }>;

      if (!rows || rows.length === 0) {
        res.status(404).json({
          status: 404,
          error: 'Not Found',
          message: 'Entrada de ACL no encontrada en su tenant.',
        });
        return;
      }

      const targetEntry = rows[0];

      // Verificar que el actor tenga permiso MANAGE sobre el recurso de la entrada
      const evalResult = await evaluateAclPermission(
        actor,
        targetEntry.resource_type,
        targetEntry.resource_id,
        'MANAGE',
      );

      if (!evalResult.allowed) {
        await logSecurityEvent(req, {
          eventType: 'ACL_DENIED',
          userId: Number(actor.id),
          status: 'BLOCKED',
          details: `ACL_DENIED operation=REVOKE_ACL reason=${evalResult.reason} entryId=${entryId}`,
        });
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Se requiere permiso MANAGE para revocar permisos de este recurso.',
        });
        return;
      }

      await query('DELETE FROM dam_acl_entries WHERE id = ? AND tenant_id = ?', [
        entryId,
        actor.tenantId,
      ]);

      await logSecurityEvent(req, {
        eventType: 'ACL_REVOKE',
        userId: Number(actor.id),
        status: 'SUCCESS',
        details: `ACL_REVOKE entryId=${entryId} tenant=${actor.tenantId} resource=${targetEntry.resource_type}:${targetEntry.resource_id}`,
      });

      res.status(200).json({
        status: 200,
        message: 'Entrada de ACL revocada exitosamente.',
      });
    } catch (error) {
      console.error('Error al revocar entrada de ACL:', error);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al revocar entrada de ACL.',
      });
    }
  },
);

/**
 * GET /api/v1/acl/check
 * Comprueba el permiso efectivo de un actor sobre un recurso específico.
 */
router.get(
  '/check',
  requireAuth,
  validate(checkAclSchema, 'query'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      const { resource_type, resource_id, permission } = req.query as unknown as {
        resource_type: 'WORKSPACE' | 'COLLECTION' | 'ASSET';
        resource_id: number;
        permission: 'VIEW' | 'DOWNLOAD' | 'EDIT' | 'MANAGE' | 'DELETE';
      };

      const actor = extractActor(authReq);

      const evalResult = await evaluateAclPermission(actor, resource_type, resource_id, permission);

      res.status(200).json({
        allowed: evalResult.allowed,
        reason: evalResult.reason,
        grantedBy: evalResult.grantedBy || null,
        actor: {
          id: actor.id,
          role: actor.role,
          tenantId: actor.tenantId,
        },
        resource: {
          type: resource_type,
          id: resource_id,
        },
        checkedPermission: permission,
      });
    } catch (error) {
      console.error('Error al comprobar permisos de ACL:', error);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al evaluar permisos de ACL.',
      });
    }
  },
);

export default router;
