"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.healthRouter = void 0;
exports.setShuttingDownState = setShuttingDownState;
exports.isShuttingDown = isShuttingDown;
const express_1 = require("express");
const db_js_1 = require("../db.js");
exports.healthRouter = (0, express_1.Router)();
let isShuttingDownState = false;
function setShuttingDownState(state) {
    isShuttingDownState = state;
}
function isShuttingDown() {
    return isShuttingDownState;
}
/**
 * Legacy Health Endpoint (Condition C-J2)
 * GET /health
 */
exports.healthRouter.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        service: 'Dreamtek Node.js API',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        env: process.env.NODE_ENV || 'development',
    });
});
/**
 * Liveness Probe Endpoint (Condition C-J1)
 * GET /healthz
 */
exports.healthRouter.get('/healthz', (_req, res) => {
    if (isShuttingDownState) {
        res.status(503).json({
            status: 'shutting_down',
            service: 'Dreamtek Node.js API',
        });
        return;
    }
    res.json({
        status: 'ok',
        service: 'Dreamtek Node.js API',
        uptime: process.uptime(),
        timestamp: Date.now(),
    });
});
/**
 * Readiness Probe Endpoint (Condition C-J1)
 * GET /readyz
 * Checks active MariaDB database connectivity. Returns HTTP 503 if DB fails or shutting down.
 */
exports.healthRouter.get('/readyz', async (_req, res) => {
    if (isShuttingDownState) {
        res.status(503).json({
            status: 'not_ready',
            database: 'disconnected',
            reason: 'Server is shutting down',
        });
        return;
    }
    try {
        await (0, db_js_1.query)('SELECT 1');
        res.json({
            status: 'ready',
            service: 'Dreamtek Node.js API',
            database: 'connected',
            timestamp: Date.now(),
        });
    }
    catch (_err) {
        res.status(503).json({
            status: 'not_ready',
            service: 'Dreamtek Node.js API',
            database: 'disconnected',
        });
    }
});
