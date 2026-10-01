"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const rateLimiter_1 = require("../middleware/rateLimiter");
const auditLogger_1 = require("../middleware/auditLogger");
const workflow_schema_1 = require("../schemas/workflow.schema");
const workflowEngine_1 = require("../utils/workflowEngine");
const router = (0, express_1.Router)();
function parseWorkflowRow(row) {
    return {
        id: row.id,
        tenant_id: row.tenant_id,
        name: row.name,
        description: row.description,
        trigger_event: row.trigger_event,
        conditions: (0, workflowEngine_1.parseJsonArray)(row.conditions),
        actions: (0, workflowEngine_1.parseJsonArray)(row.actions),
        is_active: Boolean(row.is_active),
        created_by: row.created_by,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}
/**
 * POST /api/v1/workflows
 * Creates a new automation workflow.
 */
router.post('/', rateLimiter_1.workflowsRateLimiter, auth_1.requireAuth, (0, validate_1.validate)(workflow_schema_1.createWorkflowBodySchema, 'body'), async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const actorId = req.user.userId;
        const { name, description = null, trigger_event, conditions = [], actions, is_active = true } = req.body;
        const result = await (0, db_1.query)(`INSERT INTO dam_workflows
          (tenant_id, name, description, trigger_event, conditions, actions, is_active, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
            tenantId,
            name,
            description,
            trigger_event,
            JSON.stringify(conditions),
            JSON.stringify(actions),
            is_active,
            actorId,
        ]);
        const workflowId = result.insertId;
        await (0, auditLogger_1.logSecurityEvent)(req, {
            eventType: 'WORKFLOW_CREATED',
            userId: Number(req.user.userId),
            status: 'SUCCESS',
            details: `Workflow ${workflowId} (${name}) created for event ${trigger_event}`,
        });
        res.status(201).json({
            status: 201,
            message: 'Flujo de trabajo creado exitosamente.',
            data: {
                id: workflowId,
                tenant_id: tenantId,
                name,
                description,
                trigger_event,
                conditions,
                actions,
                is_active,
                created_by: actorId,
            },
        });
    }
    catch (error) {
        console.error('Create workflow error:', error);
        res.status(500).json({
            status: 500,
            error: 'Internal Server Error',
            message: 'Error al crear el flujo de trabajo.',
        });
    }
});
/**
 * GET /api/v1/workflows
 * Lists all workflows for the authenticated tenant.
 */
router.get('/', rateLimiter_1.workflowsRateLimiter, auth_1.requireAuth, async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const rows = await (0, db_1.query)('SELECT * FROM dam_workflows WHERE tenant_id = ? ORDER BY id DESC', [tenantId]);
        const workflows = rows.map(parseWorkflowRow);
        res.status(200).json({
            status: 200,
            message: 'Flujos de trabajo recuperados exitosamente.',
            data: {
                total: workflows.length,
                workflows,
            },
        });
    }
    catch (error) {
        console.error('List workflows error:', error);
        res.status(500).json({
            status: 500,
            error: 'Internal Server Error',
            message: 'Error al consultar los flujos de trabajo.',
        });
    }
});
/**
 * GET /api/v1/workflows/:id
 * Retrieves a single workflow by ID.
 */
router.get('/:id', rateLimiter_1.workflowsRateLimiter, auth_1.requireAuth, async (req, res) => {
    try {
        const workflowId = parseInt(String(req.params.id), 10);
        if (isNaN(workflowId)) {
            res.status(400).json({
                status: 400,
                error: 'Bad Request',
                message: 'ID de flujo de trabajo inválido.',
            });
            return;
        }
        const tenantId = req.user.tenantId;
        const rows = await (0, db_1.query)('SELECT * FROM dam_workflows WHERE id = ? AND tenant_id = ? LIMIT 1', [workflowId, tenantId]);
        if (!rows || rows.length === 0) {
            res.status(404).json({
                status: 404,
                error: 'Not Found',
                message: 'Flujo de trabajo no encontrado.',
            });
            return;
        }
        res.status(200).json({
            status: 200,
            message: 'Flujo de trabajo recuperado exitosamente.',
            data: parseWorkflowRow(rows[0]),
        });
    }
    catch (error) {
        console.error('Get workflow error:', error);
        res.status(500).json({
            status: 500,
            error: 'Internal Server Error',
            message: 'Error al consultar el flujo de trabajo.',
        });
    }
});
/**
 * PUT /api/v1/workflows/:id
 * Updates an existing workflow.
 */
router.put('/:id', rateLimiter_1.workflowsRateLimiter, auth_1.requireAuth, (0, validate_1.validate)(workflow_schema_1.updateWorkflowBodySchema, 'body'), async (req, res) => {
    try {
        const workflowId = parseInt(String(req.params.id), 10);
        if (isNaN(workflowId)) {
            res.status(400).json({
                status: 400,
                error: 'Bad Request',
                message: 'ID de flujo de trabajo inválido.',
            });
            return;
        }
        const tenantId = req.user.tenantId;
        const rows = await (0, db_1.query)('SELECT * FROM dam_workflows WHERE id = ? AND tenant_id = ? LIMIT 1', [workflowId, tenantId]);
        if (!rows || rows.length === 0) {
            res.status(404).json({
                status: 404,
                error: 'Not Found',
                message: 'Flujo de trabajo no encontrado.',
            });
            return;
        }
        const current = rows[0];
        const updates = req.body;
        const name = updates.name !== undefined ? updates.name : current.name;
        const description = updates.description !== undefined ? updates.description : current.description;
        const triggerEvent = updates.trigger_event !== undefined ? updates.trigger_event : current.trigger_event;
        const conditions = updates.conditions !== undefined
            ? JSON.stringify(updates.conditions)
            : current.conditions;
        const actions = updates.actions !== undefined ? JSON.stringify(updates.actions) : current.actions;
        const isActive = updates.is_active !== undefined ? updates.is_active : current.is_active;
        await (0, db_1.query)(`UPDATE dam_workflows
         SET name = ?, description = ?, trigger_event = ?, conditions = ?, actions = ?, is_active = ?
         WHERE id = ? AND tenant_id = ?`, [name, description, triggerEvent, conditions, actions, isActive, workflowId, tenantId]);
        await (0, auditLogger_1.logSecurityEvent)(req, {
            eventType: 'WORKFLOW_UPDATED',
            userId: Number(req.user.userId),
            status: 'SUCCESS',
            details: `Workflow ${workflowId} updated`,
        });
        res.status(200).json({
            status: 200,
            message: 'Flujo de trabajo actualizado exitosamente.',
            data: {
                id: workflowId,
                tenant_id: tenantId,
                name,
                description,
                trigger_event: triggerEvent,
                conditions: (0, workflowEngine_1.parseJsonArray)(conditions),
                actions: (0, workflowEngine_1.parseJsonArray)(actions),
                is_active: Boolean(isActive),
            },
        });
    }
    catch (error) {
        console.error('Update workflow error:', error);
        res.status(500).json({
            status: 500,
            error: 'Internal Server Error',
            message: 'Error al actualizar el flujo de trabajo.',
        });
    }
});
/**
 * DELETE /api/v1/workflows/:id
 * Deletes a workflow.
 */
router.delete('/:id', rateLimiter_1.workflowsRateLimiter, auth_1.requireAuth, async (req, res) => {
    try {
        const workflowId = parseInt(String(req.params.id), 10);
        if (isNaN(workflowId)) {
            res.status(400).json({
                status: 400,
                error: 'Bad Request',
                message: 'ID de flujo de trabajo inválido.',
            });
            return;
        }
        const tenantId = req.user.tenantId;
        const rows = await (0, db_1.query)('SELECT * FROM dam_workflows WHERE id = ? AND tenant_id = ? LIMIT 1', [workflowId, tenantId]);
        if (!rows || rows.length === 0) {
            res.status(404).json({
                status: 404,
                error: 'Not Found',
                message: 'Flujo de trabajo no encontrado.',
            });
            return;
        }
        await (0, db_1.query)('DELETE FROM dam_workflows WHERE id = ? AND tenant_id = ?', [
            workflowId,
            tenantId,
        ]);
        await (0, auditLogger_1.logSecurityEvent)(req, {
            eventType: 'WORKFLOW_DELETED',
            userId: Number(req.user.userId),
            status: 'SUCCESS',
            details: `Workflow ${workflowId} deleted`,
        });
        res.status(200).json({
            status: 200,
            message: 'Flujo de trabajo eliminado exitosamente.',
            data: { id: workflowId },
        });
    }
    catch (error) {
        console.error('Delete workflow error:', error);
        res.status(500).json({
            status: 500,
            error: 'Internal Server Error',
            message: 'Error al eliminar el flujo de trabajo.',
        });
    }
});
/**
 * POST /api/v1/workflows/:id/execute/:assetId
 * Manually executes a workflow on a specific asset.
 */
router.post('/:id/execute/:assetId', rateLimiter_1.workflowsRateLimiter, auth_1.requireAuth, async (req, res) => {
    try {
        const workflowId = parseInt(String(req.params.id), 10);
        const assetId = parseInt(String(req.params.assetId), 10);
        if (isNaN(workflowId) || isNaN(assetId)) {
            res.status(400).json({
                status: 400,
                error: 'Bad Request',
                message: 'ID de flujo de trabajo o activo inválido.',
            });
            return;
        }
        const tenantId = Number(req.user.tenantId);
        const actorId = Number(req.user.userId);
        const result = await (0, workflowEngine_1.executeWorkflow)(tenantId, workflowId, assetId, 'MANUAL', actorId);
        if (!result.success && result.status === 'FAILED') {
            res.status(400).json({
                status: 400,
                error: 'Bad Request',
                message: result.error || 'Error al ejecutar el flujo de trabajo.',
                logs: result.logs,
            });
            return;
        }
        await (0, auditLogger_1.logSecurityEvent)(req, {
            eventType: 'WORKFLOW_EXECUTED',
            userId: Number(req.user.userId),
            status: 'SUCCESS',
            details: `Workflow ${workflowId} executed for asset ${assetId} with status ${result.status}`,
        });
        res.status(200).json({
            status: 200,
            message: 'Flujo de trabajo ejecutado exitosamente.',
            data: {
                workflow_id: workflowId,
                asset_id: assetId,
                status: result.status,
                logs: result.logs,
            },
        });
    }
    catch (error) {
        console.error('Execute workflow error:', error);
        res.status(500).json({
            status: 500,
            error: 'Internal Server Error',
            message: 'Error al ejecutar el flujo de trabajo.',
        });
    }
});
/**
 * GET /api/v1/workflows/:id/executions
 * Retrieves execution history for a workflow.
 */
router.get('/:id/executions', rateLimiter_1.workflowsRateLimiter, auth_1.requireAuth, (0, validate_1.validate)(workflow_schema_1.workflowExecutionsQuerySchema, 'query'), async (req, res) => {
    try {
        const workflowId = parseInt(String(req.params.id), 10);
        if (isNaN(workflowId)) {
            res.status(400).json({
                status: 400,
                error: 'Bad Request',
                message: 'ID de flujo de trabajo inválido.',
            });
            return;
        }
        const tenantId = req.user.tenantId;
        const { limit, status } = req.query;
        let sql = `SELECT * FROM dam_workflow_executions
                 WHERE tenant_id = ? AND workflow_id = ?`;
        const params = [tenantId, workflowId];
        if (status) {
            sql += ' AND status = ?';
            params.push(status);
        }
        sql += ' ORDER BY id DESC LIMIT ?';
        params.push(limit);
        const rows = await (0, db_1.query)(sql, params);
        const executions = rows.map((r) => ({
            id: r.id,
            tenant_id: r.tenant_id,
            workflow_id: r.workflow_id,
            asset_id: r.asset_id,
            trigger_event: r.trigger_event,
            status: r.status,
            execution_logs: (0, workflowEngine_1.parseJsonArray)(r.execution_logs),
            executed_at: r.executed_at,
        }));
        res.status(200).json({
            status: 200,
            message: 'Historial de ejecuciones recuperado exitosamente.',
            data: {
                total: executions.length,
                executions,
            },
        });
    }
    catch (error) {
        console.error('List workflow executions error:', error);
        res.status(500).json({
            status: 500,
            error: 'Internal Server Error',
            message: 'Error al consultar el historial de ejecuciones.',
        });
    }
});
exports.default = router;
