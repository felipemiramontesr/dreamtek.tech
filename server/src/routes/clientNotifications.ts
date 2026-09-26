import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import {
  resolveTenantForUser,
  getClientNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from '../services/clientNotificationService.js';

export const clientNotificationsRouter = Router();

// Todas las rutas de notificaciones requieren autenticación de cliente
clientNotificationsRouter.use(requireAuth);

/**
 * GET /api/v1/client/notifications
 * Listado paginado de notificaciones y conteo de no leídas para el tenant del usuario.
 */
clientNotificationsRouter.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const tenantId = req.user!.tenantId || (await resolveTenantForUser(userId));

    const isReadParam = req.query.is_read;
    const isRead =
      isReadParam === 'true' || isReadParam === '1'
        ? true
        : isReadParam === 'false' || isReadParam === '0'
          ? false
          : undefined;

    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 20;
    const offset = req.query.offset ? parseInt(String(req.query.offset), 10) : 0;

    const result = await getClientNotifications({
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
  } catch (err: any) {
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
clientNotificationsRouter.patch('/:id/read', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const tenantId = req.user!.tenantId || (await resolveTenantForUser(userId));
    const notificationId = req.params.id;

    const updated = await markNotificationAsRead(notificationId, tenantId, userId);

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
  } catch (err: any) {
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
clientNotificationsRouter.post('/read-all', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const tenantId = req.user!.tenantId || (await resolveTenantForUser(userId));

    const affected = await markAllNotificationsAsRead(tenantId, userId);

    res.json({
      status: 'success',
      message: 'Todas las notificaciones han sido marcadas como leídas.',
      data: { markedCount: affected },
    });
  } catch (err: any) {
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
