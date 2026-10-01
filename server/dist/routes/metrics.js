"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metricsRouter = void 0;
exports.getMetricsSecretToken = getMetricsSecretToken;
exports.isMetricsAuthorized = isMetricsAuthorized;
const express_1 = require("express");
const metrics_1 = require("../utils/metrics");
exports.metricsRouter = (0, express_1.Router)();
function getMetricsSecretToken() {
    if (process.env.METRICS_BEARER_TOKEN) {
        return process.env.METRICS_BEARER_TOKEN;
    }
    if (process.env.NODE_ENV === 'production') {
        return null; // Fail-closed: Never allow hardcoded secret in production (A02)
    }
    return 'dreamtek-metrics-secret-key';
}
function isMetricsAuthorized(req) {
    const secretToken = getMetricsSecretToken();
    const authHeader = req.headers.authorization;
    if (secretToken && authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7).trim();
        if (token === secretToken) {
            return true;
        }
    }
    // Check if authenticated user has ADMIN role
    const user = req.user;
    if (user && user.role === 'ADMIN') {
        return true;
    }
    return false;
}
exports.metricsRouter.get('/', (req, res) => {
    if (!isMetricsAuthorized(req)) {
        res.status(401).json({
            error: 'Unauthorized: Valid metrics token or admin authorization required',
        });
        return;
    }
    const metricsOutput = metrics_1.metricsRegistry.getPrometheusMetrics();
    res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(metricsOutput);
});
