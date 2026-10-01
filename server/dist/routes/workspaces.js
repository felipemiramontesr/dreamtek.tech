"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.workspacesRouter = void 0;
exports.getWorkspaceActor = getWorkspaceActor;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const rateLimiter_1 = require("../middleware/rateLimiter");
const validate_1 = require("../middleware/validate");
const workspace_schema_1 = require("../schemas/workspace.schema");
const acl_1 = require("../utils/acl");
const auditLogger_1 = require("../middleware/auditLogger");
const db_1 = require("../db");
exports.workspacesRouter = (0, express_1.Router)();
function getWorkspaceActor(req) {
    const tenantId = Number(req.user?.tenantId || req.user?.userId);
    if (!tenantId || isNaN(tenantId)) {
        throw new Error('Invalid authenticated user context.');
    }
    return {
        id: req.user.userId,
        role: req.user.role,
        tenantId,
    };
}
/**
 * GET /api/v1/workspaces
 * List all workspaces for the authenticated tenant with collection and active asset count.
 */
exports.workspacesRouter.get('/', rateLimiter_1.workspacesRateLimiter, auth_1.requireAuth, async (req, res) => {
    try {
        const actor = getWorkspaceActor(req);
        const rows = (await (0, db_1.query)(`SELECT w.id, w.name, w.created_at,
                COUNT(DISTINCT c.id) as collection_count,
                COUNT(DISTINCT a.id) as asset_count
         FROM workspaces w
         LEFT JOIN collections c ON c.workspace_id = w.id
         LEFT JOIN assets a ON a.workspace_id = w.id AND a.deleted_at IS NULL AND a.status = 'ACTIVE'
         WHERE w.tenant_id = ?
         GROUP BY w.id, w.name, w.created_at
         ORDER BY w.name ASC`, [actor.tenantId]));
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
    }
    catch (err) {
        console.error('List workspaces error:', err);
        res.status(500).json({
            status: 500,
            error: 'Internal Server Error',
            message: 'Error al consultar los espacios de trabajo.',
        });
    }
});
/**
 * POST /api/v1/workspaces
 * Create a new workspace for the authenticated tenant.
 * Requires ADMIN role or TENANT_OWNER.
 */
exports.workspacesRouter.post('/', rateLimiter_1.workspacesRateLimiter, auth_1.requireAuth, (0, validate_1.validate)(workspace_schema_1.createWorkspaceSchema, 'body'), async (req, res) => {
    try {
        const actor = getWorkspaceActor(req);
        const isOwner = Number(actor.id) === Number(actor.tenantId);
        const isAdmin = actor.role === 'ADMIN';
        if (!isAdmin && !isOwner) {
            res.status(403).json({
                status: 403,
                error: 'Forbidden',
                message: 'Solo el propietario del tenant o un administrador pueden crear espacios de trabajo.',
            });
            return;
        }
        const { name } = req.body;
        const insertRes = await (0, db_1.query)('INSERT INTO workspaces (tenant_id, name) VALUES (?, ?)', [
            actor.tenantId,
            name,
        ]);
        const workspaceId = Number(insertRes.insertId);
        await (0, auditLogger_1.logSecurityEvent)(req, {
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
    }
    catch (err) {
        console.error('Create workspace error:', err);
        res.status(500).json({
            status: 500,
            error: 'Internal Server Error',
            message: 'Error al crear el espacio de trabajo.',
        });
    }
});
/**
 * GET /api/v1/workspaces/:id
 * Get workspace details and statistics.
 * Requires VIEW permission on the workspace.
 */
exports.workspacesRouter.get('/:id', rateLimiter_1.workspacesRateLimiter, auth_1.requireAuth, (0, validate_1.validate)(workspace_schema_1.workspaceIdParamSchema, 'params'), async (req, res) => {
    try {
        const actor = getWorkspaceActor(req);
        const workspaceId = parseInt(String(req.params.id), 10);
        const rows = (await (0, db_1.query)(`SELECT w.id, w.name, w.created_at,
                COUNT(DISTINCT c.id) as collection_count,
                COUNT(DISTINCT a.id) as asset_count,
                COALESCE(SUM(v.byte_size), 0) as total_byte_size
         FROM workspaces w
         LEFT JOIN collections c ON c.workspace_id = w.id
         LEFT JOIN assets a ON a.workspace_id = w.id AND a.deleted_at IS NULL AND a.status = 'ACTIVE'
         LEFT JOIN asset_versions v ON v.asset_id = a.id
         WHERE w.id = ? AND w.tenant_id = ?
         GROUP BY w.id, w.name, w.created_at`, [workspaceId, actor.tenantId]));
        if (!rows || rows.length === 0) {
            res.status(404).json({
                status: 404,
                error: 'Not Found',
                message: 'Espacio de trabajo no encontrado.',
            });
            return;
        }
        const evalResult = await (0, acl_1.evaluateAclPermission)(actor, 'WORKSPACE', workspaceId, 'VIEW', {
            tenantId: rows[0].tenant_id ?? actor.tenantId,
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
    }
    catch (err) {
        console.error('Get workspace error:', err);
        res.status(500).json({
            status: 500,
            error: 'Internal Server Error',
            message: 'Error al consultar el espacio de trabajo.',
        });
    }
});
/**
 * PUT /api/v1/workspaces/:id
 * Update workspace name.
 * Requires EDIT or MANAGE permission on the workspace.
 */
exports.workspacesRouter.put('/:id', rateLimiter_1.workspacesRateLimiter, auth_1.requireAuth, (0, validate_1.validate)(workspace_schema_1.workspaceIdParamSchema, 'params'), (0, validate_1.validate)(workspace_schema_1.updateWorkspaceSchema, 'body'), async (req, res) => {
    try {
        const actor = getWorkspaceActor(req);
        const workspaceId = parseInt(String(req.params.id), 10);
        const { name } = req.body;
        const rows = (await (0, db_1.query)('SELECT id, tenant_id FROM workspaces WHERE id = ? AND tenant_id = ?', [workspaceId, actor.tenantId]));
        if (!rows || rows.length === 0) {
            res.status(404).json({
                status: 404,
                error: 'Not Found',
                message: 'Espacio de trabajo no encontrado.',
            });
            return;
        }
        const evalResult = await (0, acl_1.evaluateAclPermission)(actor, 'WORKSPACE', workspaceId, 'EDIT', {
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
        await (0, db_1.query)('UPDATE workspaces SET name = ? WHERE id = ? AND tenant_id = ?', [
            name,
            workspaceId,
            actor.tenantId,
        ]);
        await (0, auditLogger_1.logSecurityEvent)(req, {
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
    }
    catch (err) {
        console.error('Update workspace error:', err);
        res.status(500).json({
            status: 500,
            error: 'Internal Server Error',
            message: 'Error al actualizar el espacio de trabajo.',
        });
    }
});
/**
 * DELETE /api/v1/workspaces/:id
 * Delete empty workspace (EMPTY-ONLY rule, soft-deleted assets excluded).
 * Requires DELETE or MANAGE permission on the workspace.
 */
exports.workspacesRouter.delete('/:id', rateLimiter_1.workspacesRateLimiter, auth_1.requireAuth, (0, validate_1.validate)(workspace_schema_1.workspaceIdParamSchema, 'params'), async (req, res) => {
    try {
        const actor = getWorkspaceActor(req);
        const workspaceId = parseInt(String(req.params.id), 10);
        const rows = (await (0, db_1.query)('SELECT id, tenant_id FROM workspaces WHERE id = ? AND tenant_id = ?', [workspaceId, actor.tenantId]));
        if (!rows || rows.length === 0) {
            res.status(404).json({
                status: 404,
                error: 'Not Found',
                message: 'Espacio de trabajo no encontrado.',
            });
            return;
        }
        const evalResult = await (0, acl_1.evaluateAclPermission)(actor, 'WORKSPACE', workspaceId, 'DELETE', {
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
        const colCheck = (await (0, db_1.query)('SELECT COUNT(*) as count FROM collections WHERE workspace_id = ?', [workspaceId]));
        const assetCheck = (await (0, db_1.query)(`SELECT COUNT(*) as count FROM assets WHERE workspace_id = ? AND deleted_at IS NULL AND status = 'ACTIVE'`, [workspaceId]));
        const collectionCount = Number(colCheck?.[0]?.count || 0);
        const assetCount = Number(assetCheck?.[0]?.count || 0);
        if (collectionCount > 0 || assetCount > 0) {
            res.status(409).json({
                status: 409,
                error: 'Conflict',
                message: 'El espacio de trabajo contiene colecciones o activos activos. Debe vaciarlo antes de eliminarlo.',
            });
            return;
        }
        await (0, db_1.query)('DELETE FROM workspaces WHERE id = ? AND tenant_id = ?', [
            workspaceId,
            actor.tenantId,
        ]);
        await (0, auditLogger_1.logSecurityEvent)(req, {
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
    }
    catch (err) {
        console.error('Delete workspace error:', err);
        res.status(500).json({
            status: 500,
            error: 'Internal Server Error',
            message: 'Error al eliminar el espacio de trabajo.',
        });
    }
});
