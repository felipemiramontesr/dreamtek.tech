"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getClientIp = exports.optionalAuthForAnalytics = exports.analyticsRouter = void 0;
const express_1 = require("express");
const auth_js_1 = require("../middleware/auth.js");
const validate_js_1 = require("../middleware/validate.js");
const rateLimiter_js_1 = require("../middleware/rateLimiter.js");
const acl_js_1 = require("../utils/acl.js");
const shares_js_1 = require("./shares.js");
const analytics_schema_js_1 = require("../schemas/analytics.schema.js");
const analyticsEngine_js_1 = require("../utils/analyticsEngine.js");
exports.analyticsRouter = (0, express_1.Router)();
/**
 * Helper middleware that enforces requireAuth unless actor_type === 'GUEST'
 */
const optionalAuthForAnalytics = (req, res, next) => {
    if (req.body?.actor_type === 'GUEST') {
        return next();
    }
    return (0, auth_js_1.requireAuth)(req, res, next);
};
exports.optionalAuthForAnalytics = optionalAuthForAnalytics;
/**
 * Helper to safely extract client IP behind proxies
 */
const getClientIp = (req) => {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
        return forwarded.split(',')[0].trim();
    }
    if (req.ip) {
        return req.ip;
    }
    if (req.socket?.remoteAddress) {
        return req.socket.remoteAddress;
    }
    return '127.0.0.1';
};
exports.getClientIp = getClientIp;
/**
 * POST /api/v1/analytics/events
 * Ingestion endpoint for client-side telemetries and guest interactions with anti-spoofing checks.
 */
exports.analyticsRouter.post('/events', rateLimiter_js_1.analyticsEventsRateLimiter, (0, validate_js_1.validate)(analytics_schema_js_1.recordEventBodySchema, 'body'), exports.optionalAuthForAnalytics, async (req, res) => {
    try {
        const { asset_id, event_type, actor_type, share_token, bytes_served, referer, } = req.body;
        let tenantId;
        let actorId = null;
        if (actor_type === 'GUEST') {
            // Condition C-018.3: Validate guest share token bind to asset
            const validShare = await (0, shares_js_1.resolveValidShare)(share_token);
            if (!validShare || Number(validShare.asset_id) !== Number(asset_id)) {
                res.status(403).json({
                    status: 403,
                    error: 'Forbidden',
                    message: 'El share_token no es válido, ha expirado o no coincide con el activo.',
                });
                return;
            }
            tenantId = validShare.tenant_id;
        }
        else { // Authenticated USER / SYSTEM flow
            const authUser = req.user;
            tenantId = Number(authUser.tenantId);
            actorId = Number(authUser.userId);
            // Check ACL VIEW permission on the asset
            const aclResult = await (0, acl_js_1.evaluateAclPermission)({
                id: Number(authUser.userId),
                role: String(authUser.role),
                tenantId: Number(authUser.tenantId),
            }, 'ASSET', asset_id, 'VIEW');
            if (!aclResult.allowed) {
                res.status(403).json({
                    status: 403,
                    error: 'Forbidden',
                    message: 'No posee permisos para registrar eventos sobre este activo.',
                });
                return;
            }
        }
        await (0, analyticsEngine_js_1.recordAnalyticsEvent)({
            tenant_id: tenantId,
            asset_id,
            event_type,
            actor_id: actorId,
            actor_type,
            bytes_served: bytes_served || 0,
            ip: req.ip,
            user_agent: req.headers['user-agent'],
            referer: req.headers['referer'],
        });
        res.status(201).json({
            status: 201,
            message: 'Evento de analíticas registrado exitosamente.',
            data: {
                asset_id,
                event_type,
                actor_type,
            },
        });
    }
    catch (err) {
        console.error('Record event error:', err);
        res.status(500).json({
            status: 500,
            error: 'Internal Server Error',
            message: 'Error al registrar el evento de analítica.',
        });
    }
});
/**
 * GET /api/v1/analytics/overview
 * Returns high-level telemetry and metrics for tenant (Admin only - Condition C-018.4).
 */
exports.analyticsRouter.get('/overview', rateLimiter_js_1.analyticsRateLimiter, auth_js_1.requireAuth, (0, auth_js_1.requireRole)(['ADMIN']), (0, validate_js_1.validate)(analytics_schema_js_1.analyticsOverviewQuerySchema, 'query'), async (req, res) => {
    try {
        const tenantId = Number(req.user.tenantId);
        const { days } = req.query;
        const data = await (0, analyticsEngine_js_1.getOverviewMetrics)(tenantId, Number(days));
        res.status(200).json({
            status: 200,
            message: 'Métricas generales obtenidas exitosamente.',
            data,
        });
    }
    catch (err) {
        console.error('Analytics overview error:', err);
        res.status(500).json({
            status: 500,
            error: 'Internal Server Error',
            message: 'Error al obtener las métricas generales de analíticas.',
        });
    }
});
/**
 * GET /api/v1/analytics/assets/:id
 * Detailed telemetry for a specific asset (Protected by asset VIEW ACL).
 */
exports.analyticsRouter.get('/assets/:id', rateLimiter_js_1.analyticsRateLimiter, auth_js_1.requireAuth, (0, validate_js_1.validate)(analytics_schema_js_1.assetAnalyticsQuerySchema, 'query'), async (req, res) => {
    try {
        const tenantId = Number(req.user.tenantId);
        const assetId = parseInt(String(req.params.id), 10);
        if (isNaN(assetId) || assetId <= 0) {
            res.status(400).json({
                status: 400,
                error: 'Bad Request',
                message: 'El id del activo debe ser un número entero válido.',
            });
            return;
        }
        // Check ACL VIEW permission
        const aclResult = await (0, acl_js_1.evaluateAclPermission)({
            id: Number(req.user.userId),
            role: String(req.user.role),
            tenantId: Number(req.user.tenantId),
        }, 'ASSET', assetId, 'VIEW');
        if (!aclResult.allowed) {
            res.status(403).json({
                status: 403,
                error: 'Forbidden',
                message: 'No posee permisos para visualizar analíticas de este activo.',
            });
            return;
        }
        const { days } = req.query;
        const data = await (0, analyticsEngine_js_1.getAssetMetrics)(tenantId, assetId, Number(days));
        if (!data) {
            res.status(404).json({
                status: 404,
                error: 'Not Found',
                message: 'Activo no encontrado en este tenant.',
            });
            return;
        }
        res.status(200).json({
            status: 200,
            message: 'Analíticas del activo obtenidas exitosamente.',
            data,
        });
    }
    catch (err) {
        console.error('Asset analytics error:', err);
        res.status(500).json({
            status: 500,
            error: 'Internal Server Error',
            message: 'Error al consultar las analíticas del activo.',
        });
    }
});
/**
 * GET /api/v1/analytics/top-assets
 * Returns top ranked assets by metric (Admin only - Condition C-018.4).
 */
exports.analyticsRouter.get('/top-assets', rateLimiter_js_1.analyticsRateLimiter, auth_js_1.requireAuth, (0, auth_js_1.requireRole)(['ADMIN']), (0, validate_js_1.validate)(analytics_schema_js_1.topAssetsQuerySchema, 'query'), async (req, res) => {
    try {
        const tenantId = Number(req.user.tenantId);
        const { metric, days, limit } = req.query;
        const data = await (0, analyticsEngine_js_1.getTopAssets)(tenantId, String(metric), Number(days), Number(limit));
        res.status(200).json({
            status: 200,
            message: 'Top de activos obtenido exitosamente.',
            data,
        });
    }
    catch (err) {
        console.error('Top assets error:', err);
        res.status(500).json({
            status: 500,
            error: 'Internal Server Error',
            message: 'Error al consultar el ranking de activos.',
        });
    }
});
/**
 * GET /api/v1/analytics/roi-report
 * Returns executive ROI report and dormant candidates (Admin only - Condition C-018.4).
 */
exports.analyticsRouter.get('/roi-report', rateLimiter_js_1.analyticsRateLimiter, auth_js_1.requireAuth, (0, auth_js_1.requireRole)(['ADMIN']), (0, validate_js_1.validate)(analytics_schema_js_1.roiReportQuerySchema, 'query'), async (req, res) => {
    try {
        const tenantId = Number(req.user.tenantId);
        const { days, dormant_threshold_days, limit } = req.query;
        const data = await (0, analyticsEngine_js_1.getRoiReport)(tenantId, Number(days), Number(dormant_threshold_days), Number(limit));
        res.status(200).json({
            status: 200,
            message: 'Reporte de ROI y activos dormantes generado exitosamente.',
            data,
        });
    }
    catch (err) {
        console.error('ROI report error:', err);
        res.status(500).json({
            status: 500,
            error: 'Internal Server Error',
            message: 'Error al generar el reporte de ROI.',
        });
    }
});
exports.default = exports.analyticsRouter;
