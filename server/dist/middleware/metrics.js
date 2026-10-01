"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeRoutePath = normalizeRoutePath;
exports.metricsMiddleware = metricsMiddleware;
const metrics_1 = require("../utils/metrics");
/**
 * Normalizes dynamic URL path parameters to limit Prometheus metric label cardinality (Condition C-N3)
 */
function normalizeRoutePath(rawPath) {
    if (!rawPath)
        return '/';
    // Remove query strings
    const cleanPath = rawPath.split('?')[0];
    return (cleanPath
        // Replace UUIDs
        .replace(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g, ':id')
        // Replace numeric IDs (e.g. /users/123 -> /users/:id)
        .replace(/\/\d+/g, '/:id')
        // Replace hex tokens
        .replace(/\/[0-9a-fA-F]{16,}/g, '/:token'));
}
function metricsMiddleware(req, res, next) {
    const startTime = performance.now();
    res.on('finish', () => {
        const durationSeconds = (performance.now() - startTime) / 1000;
        const normalizedPath = normalizeRoutePath(req.baseUrl + (req.path || req.originalUrl || ''));
        metrics_1.metricsRegistry.recordHttpRequest(req.method, normalizedPath, res.statusCode, durationSeconds);
    });
    next();
}
