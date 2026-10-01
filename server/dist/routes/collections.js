"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.collectionsRouter = void 0;
exports.getCollectionActor = getCollectionActor;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const rateLimiter_1 = require("../middleware/rateLimiter");
const validate_1 = require("../middleware/validate");
const collection_schema_1 = require("../schemas/collection.schema");
const acl_1 = require("../utils/acl");
const auditLogger_1 = require("../middleware/auditLogger");
const db_1 = require("../db");
exports.collectionsRouter = (0, express_1.Router)();
function getCollectionActor(req) {
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
 * GET /api/v1/collections
 * List all collections for the authenticated tenant with asset count and aggregated byte size.
 * Optional filter by workspace_id.
 */
exports.collectionsRouter.get('/', rateLimiter_1.collectionsRateLimiter, auth_1.requireAuth, (0, validate_1.validate)(collection_schema_1.queryCollectionsSchema, 'query'), async (req, res) => {
    try {
        const actor = getCollectionActor(req);
        const workspaceId = req.query.workspace_id
            ? parseInt(String(req.query.workspace_id), 10)
            : null;
        const rows = (await (0, db_1.query)(`SELECT c.id, c.workspace_id, c.name, c.created_at,
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
         ORDER BY c.name ASC`, [actor.tenantId, workspaceId, workspaceId]));
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
    }
    catch (err) {
        console.error('List collections error:', err);
        res.status(500).json({
            status: 500,
            error: 'Internal Server Error',
            message: 'Error al consultar las colecciones.',
        });
    }
});
/**
 * POST /api/v1/collections
 * Create a new collection in a workspace.
 * Requires EDIT or MANAGE permission on the workspace.
 */
exports.collectionsRouter.post('/', rateLimiter_1.collectionsRateLimiter, auth_1.requireAuth, (0, validate_1.validate)(collection_schema_1.createCollectionSchema, 'body'), async (req, res) => {
    try {
        const actor = getCollectionActor(req);
        const { workspace_id, name } = req.body;
        // Verify workspace belongs to tenant
        const wsRows = (await (0, db_1.query)('SELECT id, tenant_id FROM workspaces WHERE id = ? AND tenant_id = ?', [workspace_id, actor.tenantId]));
        if (!wsRows || wsRows.length === 0) {
            res.status(404).json({
                status: 404,
                error: 'Not Found',
                message: 'El espacio de trabajo especificado no existe o pertenece a otro tenant.',
            });
            return;
        }
        const evalResult = await (0, acl_1.evaluateAclPermission)(actor, 'WORKSPACE', workspace_id, 'EDIT', {
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
        const insertRes = await (0, db_1.query)('INSERT INTO collections (workspace_id, name) VALUES (?, ?)', [workspace_id, name]);
        const collectionId = Number(insertRes.insertId);
        await (0, auditLogger_1.logSecurityEvent)(req, {
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
    }
    catch (err) {
        console.error('Create collection error:', err);
        res.status(500).json({
            status: 500,
            error: 'Internal Server Error',
            message: 'Error al crear la colección.',
        });
    }
});
/**
 * GET /api/v1/collections/:id
 * Get collection details and statistics.
 * Requires VIEW permission on the collection.
 */
exports.collectionsRouter.get('/:id', rateLimiter_1.collectionsRateLimiter, auth_1.requireAuth, (0, validate_1.validate)(collection_schema_1.collectionIdParamSchema, 'params'), async (req, res) => {
    try {
        const actor = getCollectionActor(req);
        const collectionId = parseInt(String(req.params.id), 10);
        const rows = (await (0, db_1.query)(`SELECT c.id, c.workspace_id, c.name, c.created_at,
                w.name as workspace_name, w.tenant_id,
                COUNT(DISTINCT a.id) as asset_count,
                COALESCE(SUM(v.byte_size), 0) as total_byte_size
         FROM collections c
         JOIN workspaces w ON w.id = c.workspace_id
         LEFT JOIN assets a ON a.collection_id = c.id AND a.deleted_at IS NULL AND a.status = 'ACTIVE'
         LEFT JOIN asset_versions v ON v.asset_id = a.id
         WHERE c.id = ? AND w.tenant_id = ?
         GROUP BY c.id, c.workspace_id, c.name, c.created_at, w.name, w.tenant_id`, [collectionId, actor.tenantId]));
        if (!rows || rows.length === 0) {
            res.status(404).json({
                status: 404,
                error: 'Not Found',
                message: 'Colección no encontrada.',
            });
            return;
        }
        const evalResult = await (0, acl_1.evaluateAclPermission)(actor, 'COLLECTION', collectionId, 'VIEW', {
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
    }
    catch (err) {
        console.error('Get collection error:', err);
        res.status(500).json({
            status: 500,
            error: 'Internal Server Error',
            message: 'Error al consultar la colección.',
        });
    }
});
/**
 * PUT /api/v1/collections/:id
 * Update collection name.
 * Requires EDIT or MANAGE permission on the collection.
 */
exports.collectionsRouter.put('/:id', rateLimiter_1.collectionsRateLimiter, auth_1.requireAuth, (0, validate_1.validate)(collection_schema_1.collectionIdParamSchema, 'params'), (0, validate_1.validate)(collection_schema_1.updateCollectionSchema, 'body'), async (req, res) => {
    try {
        const actor = getCollectionActor(req);
        const collectionId = parseInt(String(req.params.id), 10);
        const { name } = req.body;
        const rows = (await (0, db_1.query)(`SELECT c.id, c.workspace_id, w.tenant_id
         FROM collections c
         JOIN workspaces w ON w.id = c.workspace_id
         WHERE c.id = ? AND w.tenant_id = ?`, [collectionId, actor.tenantId]));
        if (!rows || rows.length === 0) {
            res.status(404).json({
                status: 404,
                error: 'Not Found',
                message: 'Colección no encontrada.',
            });
            return;
        }
        const evalResult = await (0, acl_1.evaluateAclPermission)(actor, 'COLLECTION', collectionId, 'EDIT', {
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
        await (0, db_1.query)('UPDATE collections SET name = ? WHERE id = ?', [name, collectionId]);
        await (0, auditLogger_1.logSecurityEvent)(req, {
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
    }
    catch (err) {
        console.error('Update collection error:', err);
        res.status(500).json({
            status: 500,
            error: 'Internal Server Error',
            message: 'Error al actualizar la colección.',
        });
    }
});
/**
 * DELETE /api/v1/collections/:id
 * Delete empty collection (EMPTY-ONLY rule, soft-deleted assets excluded).
 * Requires DELETE or MANAGE permission on the collection.
 */
exports.collectionsRouter.delete('/:id', rateLimiter_1.collectionsRateLimiter, auth_1.requireAuth, (0, validate_1.validate)(collection_schema_1.collectionIdParamSchema, 'params'), async (req, res) => {
    try {
        const actor = getCollectionActor(req);
        const collectionId = parseInt(String(req.params.id), 10);
        const rows = (await (0, db_1.query)(`SELECT c.id, c.workspace_id, w.tenant_id
         FROM collections c
         JOIN workspaces w ON w.id = c.workspace_id
         WHERE c.id = ? AND w.tenant_id = ?`, [collectionId, actor.tenantId]));
        if (!rows || rows.length === 0) {
            res.status(404).json({
                status: 404,
                error: 'Not Found',
                message: 'Colección no encontrada.',
            });
            return;
        }
        const evalResult = await (0, acl_1.evaluateAclPermission)(actor, 'COLLECTION', collectionId, 'DELETE', {
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
        const assetCheck = (await (0, db_1.query)(`SELECT COUNT(*) as count FROM assets WHERE collection_id = ? AND deleted_at IS NULL AND status = 'ACTIVE'`, [collectionId]));
        const assetCount = Number(assetCheck?.[0]?.count || 0);
        if (assetCount > 0) {
            res.status(409).json({
                status: 409,
                error: 'Conflict',
                message: 'La colección contiene activos activos. Debe moverlos o eliminarlos antes de eliminar la colección.',
            });
            return;
        }
        await (0, db_1.query)('DELETE FROM collections WHERE id = ?', [collectionId]);
        await (0, auditLogger_1.logSecurityEvent)(req, {
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
    }
    catch (err) {
        console.error('Delete collection error:', err);
        res.status(500).json({
            status: 500,
            error: 'Internal Server Error',
            message: 'Error al eliminar la colección.',
        });
    }
});
