"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activeClients = exports.eventsRouter = void 0;
exports.sendSSEEventToUser = sendSSEEventToUser;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
exports.eventsRouter = (0, express_1.Router)();
// Mapa de clientes conectados activos: userId -> Set<Response>
exports.activeClients = new Map();
/**
 * Función para emitir eventos SSE a un usuario específico o a todos los clientes de un tenant
 */
function sendSSEEventToUser(userId, eventType, payload) {
    const userConnections = exports.activeClients.get(userId);
    if (!userConnections || userConnections.size === 0) {
        return false;
    }
    const message = `event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`;
    let sentCount = 0;
    for (const clientRes of Array.from(userConnections)) {
        try {
            clientRes.write(message);
            sentCount++;
        }
        catch {
            userConnections.delete(clientRes);
        }
    }
    if (userConnections.size === 0) {
        exports.activeClients.delete(userId);
    }
    return sentCount > 0;
}
/**
 * GET /api/v1/events - Stream SSE protegido
 */
exports.eventsRouter.get('/events', auth_1.requireAuth, (req, res) => {
    const userId = req.user?.userId ? String(req.user.userId) : '';
    if (!userId) {
        res.status(401).json({
            status: 401,
            error: 'Unauthorized',
            message: 'Autenticación requerida para stream SSE.',
        });
        return;
    }
    // Encabezados estándar de Server-Sent Events
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    // Enviar mensaje de bienvenida / handshake
    res.write(`event: connected\ndata: ${JSON.stringify({ message: 'SSE Stream Activo', userId, timestamp: new Date().toISOString() })}\n\n`);
    // Registrar cliente
    if (!exports.activeClients.has(userId)) {
        exports.activeClients.set(userId, new Set());
    }
    const userSet = exports.activeClients.get(userId);
    userSet.add(res);
    // Heartbeat periódico (cada 15 segundos)
    const heartbeatInterval = setInterval(() => {
        try {
            res.write(`:heartbeat ${new Date().toISOString()}\n\n`);
        }
        catch {
            clearInterval(heartbeatInterval);
        }
    }, 15000);
    // Limpieza al cerrar la conexión
    req.on('close', () => {
        clearInterval(heartbeatInterval);
        const set = exports.activeClients.get(userId);
        if (set) {
            set.delete(res);
            if (set.size === 0) {
                exports.activeClients.delete(userId);
            }
        }
    });
});
