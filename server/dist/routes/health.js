"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.healthRouter = void 0;
const express_1 = require("express");
exports.healthRouter = (0, express_1.Router)();
exports.healthRouter.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        service: 'Dreamtek API v1',
        timestamp: new Date().toISOString(),
        env: process.env.NODE_ENV || 'development',
    });
});
