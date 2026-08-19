import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';

export const eventsRouter = Router();

// Mapa de clientes conectados activos: userId -> Set<Response>
export const activeClients = new Map<string, Set<Response>>();

/**
 * Función para emitir eventos SSE a un usuario específico o a todos los clientes de un tenant
 */
export function sendSSEEventToUser(userId: string, eventType: string, payload: unknown): boolean {
  const userConnections = activeClients.get(userId);
  if (!userConnections || userConnections.size === 0) {
    return false;
  }

  const message = `event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`;
  let sentCount = 0;

  for (const clientRes of Array.from(userConnections)) {
    try {
      clientRes.write(message);
      sentCount++;
    } catch {
      userConnections.delete(clientRes);
    }
  }

  if (userConnections.size === 0) {
    activeClients.delete(userId);
  }

  return sentCount > 0;
}

/**
 * GET /api/v1/events - Stream SSE protegido
 */
eventsRouter.get('/events', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.userId ? String(req.user.userId) : '';
  if (!userId) {
    res
      .status(401)
      .json({
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
  res.write(
    `event: connected\ndata: ${JSON.stringify({ message: 'SSE Stream Activo', userId, timestamp: new Date().toISOString() })}\n\n`,
  );

  // Registrar cliente
  if (!activeClients.has(userId)) {
    activeClients.set(userId, new Set());
  }
  const userSet = activeClients.get(userId)!;
  userSet.add(res);

  // Heartbeat periódico (cada 15 segundos)
  const heartbeatInterval = setInterval(() => {
    try {
      res.write(`:heartbeat ${new Date().toISOString()}\n\n`);
    } catch {
      clearInterval(heartbeatInterval);
    }
  }, 15000);

  // Limpieza al cerrar la conexión
  req.on('close', () => {
    clearInterval(heartbeatInterval);
    const set = activeClients.get(userId);
    if (set) {
      set.delete(res);
      if (set.size === 0) {
        activeClients.delete(userId);
      }
    }
  });
});
