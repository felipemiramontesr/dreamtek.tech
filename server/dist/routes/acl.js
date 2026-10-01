"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const acl_schema_1 = require("../schemas/acl.schema");
const acl_1 = require("../utils/acl");
const auditLogger_1 = require("../middleware/auditLogger");
const router = (0, express_1.Router)();
function extractActor(req) {
    return {
        id: req.user.userId,
        role: req.user.role,
        tenantId: Number(req.user?.tenantId || req.user?.userId),
    };
}
/**
 * GET /api/v1/acl/entries
 * Consulta las entradas de ACL asignadas a un recurso específico dentro del tenant.
 */
router.get('/entries', auth_1.requireAuth, (0, validate_1.validate)(acl_schema_1.queryAclSchema, 'query'), async (req, res) => {
    try {
        const authReq = req;
        const { resource_type, resource_id } = req.query;
        const actor = extractActor(authReq);
        // Verificar que el actor tenga al menos permiso VIEW sobre el recurso
        const evalResult = await (0, acl_1.evaluateAclPermission)(actor, resource_type, resource_id, 'VIEW');
        if (!evalResult.allowed) {
            await (0, auditLogger_1.logSecurityEvent)(req, {
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
        const entries = (await (0, db_1.query)(`SELECT id, tenant_id, resource_type, resource_id, principal_type, principal_id, permission, granted_by, created_at, updated_at
         FROM dam_acl_entries
         WHERE tenant_id = ? AND resource_type = ? AND resource_id = ?
         ORDER BY created_at ASC`, [actor.tenantId, resource_type, resource_id]));
        res.status(200).json({ entries: entries || [] });
    }
    catch (error) {
        console.error('Error al consultar entradas de ACL:', error);
        res.status(500).json({
            status: 500,
            error: 'Internal Server Error',
            message: 'Error al consultar entradas de ACL.',
        });
    }
});
/**
 * POST /api/v1/acl/entries
 * Otorga o actualiza un permiso granular en la ACL para un usuario o rol.
 * Requiere permiso 'MANAGE' o rol 'ADMIN'.
 */
router.post('/entries', auth_1.requireAuth, (0, validate_1.validate)(acl_schema_1.createAclEntrySchema, 'body'), async (req, res) => {
    try {
        const authReq = req;
        const { resource_type, resource_id, principal_type, principal_id, permission } = req.body;
        const actor = extractActor(authReq);
        // Verificar que el actor tenga permiso MANAGE sobre el recurso
        const evalResult = await (0, acl_1.evaluateAclPermission)(actor, resource_type, resource_id, 'MANAGE');
        if (!evalResult.allowed) {
            await (0, auditLogger_1.logSecurityEvent)(req, {
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
        await (0, db_1.query)(`INSERT INTO dam_acl_entries 
          (tenant_id, resource_type, resource_id, principal_type, principal_id, permission, granted_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE 
           permission = VALUES(permission),
           granted_by = VALUES(granted_by),
           updated_at = CURRENT_TIMESTAMP`, [
            actor.tenantId,
            resource_type,
            resource_id,
            principal_type,
            String(principal_id),
            permission,
            String(actor.id),
        ]);
        await (0, auditLogger_1.logSecurityEvent)(req, {
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
    }
    catch (error) {
        console.error('Error al otorgar permiso de ACL:', error);
        res.status(500).json({
            status: 500,
            error: 'Internal Server Error',
            message: 'Error al registrar permiso de ACL.',
        });
    }
});
/**
 * DELETE /api/v1/acl/entries/:id
 * Revoca una entrada de ACL específica.
 * Requiere permiso 'MANAGE' o rol 'ADMIN'.
 */
router.delete('/entries/:id', auth_1.requireAuth, (0, validate_1.validate)(acl_schema_1.deleteAclEntryParamsSchema, 'params'), async (req, res) => {
    try {
        const authReq = req;
        const entryId = Number(req.params.id);
        const actor = extractActor(authReq);
        // Consultar la entrada de ACL para verificar existencia y tenancy
        const rows = (await (0, db_1.query)(`SELECT id, tenant_id, resource_type, resource_id, principal_type, principal_id, permission
         FROM dam_acl_entries
         WHERE id = ? AND tenant_id = ?`, [entryId, actor.tenantId]));
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
        const evalResult = await (0, acl_1.evaluateAclPermission)(actor, targetEntry.resource_type, targetEntry.resource_id, 'MANAGE');
        if (!evalResult.allowed) {
            await (0, auditLogger_1.logSecurityEvent)(req, {
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
        await (0, db_1.query)('DELETE FROM dam_acl_entries WHERE id = ? AND tenant_id = ?', [
            entryId,
            actor.tenantId,
        ]);
        await (0, auditLogger_1.logSecurityEvent)(req, {
            eventType: 'ACL_REVOKE',
            userId: Number(actor.id),
            status: 'SUCCESS',
            details: `ACL_REVOKE entryId=${entryId} tenant=${actor.tenantId} resource=${targetEntry.resource_type}:${targetEntry.resource_id}`,
        });
        res.status(200).json({
            status: 200,
            message: 'Entrada de ACL revocada exitosamente.',
        });
    }
    catch (error) {
        console.error('Error al revocar entrada de ACL:', error);
        res.status(500).json({
            status: 500,
            error: 'Internal Server Error',
            message: 'Error al revocar entrada de ACL.',
        });
    }
});
/**
 * GET /api/v1/acl/check
 * Comprueba el permiso efectivo de un actor sobre un recurso específico.
 */
router.get('/check', auth_1.requireAuth, (0, validate_1.validate)(acl_schema_1.checkAclSchema, 'query'), async (req, res) => {
    try {
        const authReq = req;
        const { resource_type, resource_id, permission } = req.query;
        const actor = extractActor(authReq);
        const evalResult = await (0, acl_1.evaluateAclPermission)(actor, resource_type, resource_id, permission);
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
    }
    catch (error) {
        console.error('Error al comprobar permisos de ACL:', error);
        res.status(500).json({
            status: 500,
            error: 'Internal Server Error',
            message: 'Error al evaluar permisos de ACL.',
        });
    }
});
exports.default = router;
