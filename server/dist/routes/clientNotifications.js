"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clientNotificationsRouter = void 0;
const express_1 = require("express");
const auth_js_1 = require("../middleware/auth.js");
const clientNotificationService_js_1 = require("../services/clientNotificationService.js");
exports.clientNotificationsRouter = (0, express_1.Router)();
// Todas las rutas de notificaciones requieren autenticación de cliente
exports.clientNotificationsRouter.use(auth_js_1.requireAuth);
/**
 * GET /api/v1/client/notifications
 * Listado paginado de notificaciones y conteo de no leídas para el tenant del usuario.
 */
exports.clientNotificationsRouter.get('/', async (req, res) => {
    try {
        const userId = req.user.userId;
        const tenantId = req.user.tenantId || (await (0, clientNotificationService_js_1.resolveTenantForUser)(userId));
        const isReadParam = req.query.is_read;
        const isRead = isReadParam === 'true' || isReadParam === '1'
            ? true
            : isReadParam === 'false' || isReadParam === '0'
                ? false
                : undefined;
        const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 20;
        const offset = req.query.offset ? parseInt(String(req.query.offset), 10) : 0;
        const result = await (0, clientNotificationService_js_1.getClientNotifications)({
            tenantId,
            userId,
            isRead,
            limit,
            offset,
        });
        res.json({
            status: 'success',
            data: result,
        });
    }
    catch (err) {
        if (err.statusCode === 400) {
            res.status(400).json({
                status: 'error',
                message: err.message,
            });
            return;
        }
        res.status(500).json({
            status: 'error',
            message: 'Error interno al consultar las notificaciones.',
        });
    }
});
/**
 * PATCH /api/v1/client/notifications/:id/read
 * Marca una notificación específica como leída con verificación estricta anti-IDOR (C-053.1).
 */
exports.clientNotificationsRouter.patch('/:id/read', async (req, res) => {
    try {
        const userId = req.user.userId;
        const tenantId = req.user.tenantId || (await (0, clientNotificationService_js_1.resolveTenantForUser)(userId));
        const notificationId = req.params.id;
        const updated = await (0, clientNotificationService_js_1.markNotificationAsRead)(notificationId, tenantId, userId);
        if (!updated) {
            res.status(404).json({
                status: 'error',
                message: 'Notificación no encontrada o no pertenece a la cuenta autenticada.',
            });
            return;
        }
        res.json({
            status: 'success',
            message: 'Notificación marcada como leída.',
        });
    }
    catch (err) {
        if (err.statusCode === 400) {
            res.status(400).json({
                status: 'error',
                message: err.message,
            });
            return;
        }
        res.status(500).json({
            status: 'error',
            message: 'Error al actualizar el estado de la notificación.',
        });
    }
});
/**
 * POST /api/v1/client/notifications/read-all
 * Marca todas las notificaciones pendientes del usuario como leídas.
 */
exports.clientNotificationsRouter.post('/read-all', async (req, res) => {
    try {
        const userId = req.user.userId;
        const tenantId = req.user.tenantId || (await (0, clientNotificationService_js_1.resolveTenantForUser)(userId));
        const affected = await (0, clientNotificationService_js_1.markAllNotificationsAsRead)(tenantId, userId);
        res.json({
            status: 'success',
            message: 'Todas las notificaciones han sido marcadas como leídas.',
            data: { markedCount: affected },
        });
    }
    catch (err) {
        if (err.statusCode === 400) {
            res.status(400).json({
                status: 'error',
                message: err.message,
            });
            return;
        }
        res.status(500).json({
            status: 'error',
            message: 'Error al marcar todas las notificaciones como leídas.',
        });
    }
});
