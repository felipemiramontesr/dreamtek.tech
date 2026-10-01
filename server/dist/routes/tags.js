"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tagsRouter = void 0;
exports.getActorTenantId = getActorTenantId;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const rateLimiter_1 = require("../middleware/rateLimiter");
const validate_1 = require("../middleware/validate");
const tag_schema_1 = require("../schemas/tag.schema");
const auditLogger_1 = require("../middleware/auditLogger");
const db_1 = require("../db");
exports.tagsRouter = (0, express_1.Router)();
function getActorTenantId(req) {
    const userId = Number(req.user?.tenantId || req.user?.userId);
    if (!userId || isNaN(userId)) {
        throw new Error('Invalid authenticated user context.');
    }
    return userId;
}
/**
 * GET /api/v1/tags
 * List all tags for the authenticated tenant with asset count.
 */
exports.tagsRouter.get('/', rateLimiter_1.tagsRateLimiter, auth_1.requireAuth, async (req, res) => {
    try {
        const tenantId = getActorTenantId(req);
        const tags = await (0, db_1.query)(`SELECT t.id, t.name, t.color, t.created_at,
                COUNT(DISTINCT at.asset_id) as asset_count
         FROM tags t
         LEFT JOIN asset_tags at ON at.tag_id = t.id
         LEFT JOIN assets a ON a.id = at.asset_id AND a.deleted_at IS NULL
         WHERE t.tenant_id = ?
         GROUP BY t.id, t.name, t.color, t.created_at
         ORDER BY t.name ASC`, [tenantId]);
        res.status(200).json({
            status: 200,
            data: tags.map((t) => ({
                id: t.id,
                name: t.name,
                color: t.color,
                createdAt: t.created_at,
                assetCount: Number(t.asset_count || 0),
            })),
        });
    }
    catch (err) {
        console.error('List tags error:', err);
        res.status(500).json({
            status: 500,
            error: 'Internal Server Error',
            message: 'Error al consultar las etiquetas.',
        });
    }
});
/**
 * POST /api/v1/tags
 * Create a new tag for the authenticated tenant.
 */
exports.tagsRouter.post('/', rateLimiter_1.tagsRateLimiter, auth_1.requireAuth, (0, validate_1.validate)(tag_schema_1.createTagSchema), async (req, res) => {
    try {
        const tenantId = getActorTenantId(req);
        const { name, color = '#00bfff' } = req.body;
        // Check unique constraint per tenant
        const existing = await (0, db_1.query)('SELECT id FROM tags WHERE tenant_id = ? AND name = ?', [
            tenantId,
            name,
        ]);
        if (existing && existing.length > 0) {
            res.status(409).json({
                status: 409,
                error: 'Conflict',
                message: `La etiqueta "${name}" ya existe en este tenant.`,
            });
            return;
        }
        const insertRes = await (0, db_1.query)('INSERT INTO tags (tenant_id, name, color) VALUES (?, ?, ?)', [tenantId, name, color]);
        const tagId = Number(insertRes.insertId);
        await (0, auditLogger_1.logSecurityEvent)(req, {
            eventType: 'TAG_CREATED',
            userId: Number(req.user?.userId),
            status: 'SUCCESS',
            details: `Created tag ID ${tagId} (${name}) for tenant ${tenantId}`,
        });
        res.status(201).json({
            status: 201,
            message: 'Etiqueta creada exitosamente.',
            data: {
                id: tagId,
                name,
                color,
            },
        });
    }
    catch (err) {
        console.error('Create tag error:', err);
        res.status(500).json({
            status: 500,
            error: 'Internal Server Error',
            message: 'Error al crear la etiqueta.',
        });
    }
});
