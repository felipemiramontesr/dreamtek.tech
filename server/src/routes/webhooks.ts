/* eslint-disable @typescript-eslint/no-explicit-any */
import { Router, Request, Response } from 'express';
import { requireAuth, requireRole, type AuthenticatedRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { query } from '../db';
import {
  createWebhookSchema,
  updateWebhookSchema,
  webhookIdParamSchema,
  deliveriesQuerySchema,
} from '../schemas/webhook.schema';
import {
  validateWebhookUrl,
  generateWebhookSecret,
  deliverWebhook,
} from '../utils/webhookDispatcher';

const router = Router();

// Require Authentication & Admin Role for all webhook routes (OWASP A01)
router.use(requireAuth);
router.use(requireRole(['ADMIN']));

function parseEvents(events: any): string[] {
  if (Array.isArray(events)) {
    return events;
  }
  try {
    const parsed = JSON.parse(events);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // ignore
  }
  return [];
}

function parsePayload(payload: any): any {
  try {
    return typeof payload === 'string' ? JSON.parse(payload) : payload;
  } catch {
    return payload;
  }
}

/**
 * GET /api/v1/webhooks
 * List all webhook endpoints for the current tenant (secret is omitted).
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const tenantId = (req as AuthenticatedRequest).user!.tenantId;

  try {
    const endpoints = await query<any[]>(
      `SELECT id, tenant_id, url, description, events, is_active, created_at, updated_at
       FROM webhook_endpoints
       WHERE tenant_id = ?
       ORDER BY id DESC`,
      [tenantId],
    );

    const data = endpoints.map((ep) => ({
      id: ep.id,
      tenant_id: ep.tenant_id,
      url: ep.url,
      description: ep.description,
      events: parseEvents(ep.events),
      is_active: Boolean(ep.is_active),
      created_at: ep.created_at,
      updated_at: ep.updated_at,
    }));

    res.status(200).json({
      status: 200,
      data,
    });
  } catch (err: any) {
    console.error('List webhooks error:', err);
    res.status(500).json({
      status: 500,
      error: 'Internal Server Error',
      message: 'Error al obtener la lista de webhooks.',
    });
  }
});

/**
 * POST /api/v1/webhooks
 * Register a new webhook endpoint and generate HMAC secret (OWASP A02, A10).
 */
router.post(
  '/',
  validate(createWebhookSchema, 'body'),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as AuthenticatedRequest).user!.tenantId;
    const { url, description, events, is_active } = req.body;

    // SSRF Check
    const urlValidation = validateWebhookUrl(url);
    if (!urlValidation.valid) {
      res.status(400).json({
        status: 400,
        error: 'Bad Request',
        message: urlValidation.error,
      });
      return;
    }

    try {
      const secret = generateWebhookSecret();
      const eventsJson = JSON.stringify(events);
      const activeVal = Number(is_active !== false);

      const result = await query<any>(
        `INSERT INTO webhook_endpoints (tenant_id, url, secret, description, events, is_active)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [tenantId, url, secret, description ?? null, eventsJson, activeVal],
      );

      const endpointId = result.insertId;

      res.status(201).json({
        status: 201,
        message: 'Endpoint de webhook registrado con éxito.',
        data: {
          id: endpointId,
          tenant_id: tenantId,
          url,
          secret,
          description: description ?? null,
          events,
          is_active: Boolean(activeVal),
        },
      });
    } catch (err: any) {
      console.error('Create webhook error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al registrar el endpoint de webhook.',
      });
    }
  },
);

/**
 * GET /api/v1/webhooks/:id
 * Get details of a specific webhook endpoint (secret is omitted).
 */
router.get(
  '/:id',
  validate(webhookIdParamSchema, 'params'),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as AuthenticatedRequest).user!.tenantId;
    const webhookId = parseInt(String(req.params.id), 10);

    try {
      const rows = await query<any[]>(
        `SELECT id, tenant_id, url, description, events, is_active, created_at, updated_at
         FROM webhook_endpoints
         WHERE id = ? AND tenant_id = ?`,
        [webhookId, tenantId],
      );

      if (!rows || rows.length === 0) {
        res.status(404).json({
          status: 404,
          error: 'Not Found',
          message: 'Endpoint de webhook no encontrado.',
        });
        return;
      }

      const ep = rows[0];

      res.status(200).json({
        status: 200,
        data: {
          id: ep.id,
          tenant_id: ep.tenant_id,
          url: ep.url,
          description: ep.description,
          events: parseEvents(ep.events),
          is_active: Boolean(ep.is_active),
          created_at: ep.created_at,
          updated_at: ep.updated_at,
        },
      });
    } catch (err: any) {
      console.error('Get webhook error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al obtener los detalles del webhook.',
      });
    }
  },
);

/**
 * PUT /api/v1/webhooks/:id
 * Update an existing webhook endpoint.
 */
router.put(
  '/:id',
  validate(webhookIdParamSchema, 'params'),
  validate(updateWebhookSchema, 'body'),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as AuthenticatedRequest).user!.tenantId;
    const webhookId = parseInt(String(req.params.id), 10);
    const { url, description, events, is_active } = req.body;

    try {
      // 1. Verify existence and tenant ownership (Anti-IDOR)
      const existing = await query<any[]>(
        `SELECT id, url, description, events, is_active 
         FROM webhook_endpoints 
         WHERE id = ? AND tenant_id = ?`,
        [webhookId, tenantId],
      );

      if (!existing || existing.length === 0) {
        res.status(404).json({
          status: 404,
          error: 'Not Found',
          message: 'Endpoint de webhook no encontrado.',
        });
        return;
      }

      // 2. If URL is updated, validate against SSRF
      if (url && url !== existing[0].url) {
        const urlValidation = validateWebhookUrl(url);
        if (!urlValidation.valid) {
          res.status(400).json({
            status: 400,
            error: 'Bad Request',
            message: urlValidation.error,
          });
          return;
        }
      }

      const updatedUrl = url ?? existing[0].url;
      const updatedDesc = description !== undefined ? description : existing[0].description;
      const updatedEvents = events !== undefined ? JSON.stringify(events) : existing[0].events;
      const updatedActive = is_active !== undefined ? Number(is_active) : existing[0].is_active;

      await query(
        `UPDATE webhook_endpoints
         SET url = ?, description = ?, events = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND tenant_id = ?`,
        [updatedUrl, updatedDesc, updatedEvents, updatedActive, webhookId, tenantId],
      );

      res.status(200).json({
        status: 200,
        message: 'Endpoint de webhook actualizado exitosamente.',
        data: {
          id: webhookId,
          tenant_id: tenantId,
          url: updatedUrl,
          description: updatedDesc,
          events: parseEvents(updatedEvents),
          is_active: Boolean(updatedActive),
        },
      });
    } catch (err: any) {
      console.error('Update webhook error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al actualizar el endpoint de webhook.',
      });
    }
  },
);

/**
 * DELETE /api/v1/webhooks/:id
 * Delete a webhook endpoint and all associated deliveries (cascade).
 */
router.delete(
  '/:id',
  validate(webhookIdParamSchema, 'params'),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as AuthenticatedRequest).user!.tenantId;
    const webhookId = parseInt(String(req.params.id), 10);

    try {
      const existing = await query<any[]>(
        `SELECT id FROM webhook_endpoints WHERE id = ? AND tenant_id = ?`,
        [webhookId, tenantId],
      );

      if (!existing || existing.length === 0) {
        res.status(404).json({
          status: 404,
          error: 'Not Found',
          message: 'Endpoint de webhook no encontrado.',
        });
        return;
      }

      await query(`DELETE FROM webhook_endpoints WHERE id = ? AND tenant_id = ?`, [
        webhookId,
        tenantId,
      ]);

      res.status(200).json({
        status: 200,
        message: 'Endpoint de webhook eliminado exitosamente.',
      });
    } catch (err: any) {
      console.error('Delete webhook error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al eliminar el endpoint de webhook.',
      });
    }
  },
);

/**
 * POST /api/v1/webhooks/:id/rotate-secret
 * Rotate HMAC signing secret for a webhook endpoint (OWASP A02).
 */
router.post(
  '/:id/rotate-secret',
  validate(webhookIdParamSchema, 'params'),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as AuthenticatedRequest).user!.tenantId;
    const webhookId = parseInt(String(req.params.id), 10);

    try {
      const existing = await query<any[]>(
        `SELECT id FROM webhook_endpoints WHERE id = ? AND tenant_id = ?`,
        [webhookId, tenantId],
      );

      if (!existing || existing.length === 0) {
        res.status(404).json({
          status: 404,
          error: 'Not Found',
          message: 'Endpoint de webhook no encontrado.',
        });
        return;
      }

      const newSecret = generateWebhookSecret();

      await query(
        `UPDATE webhook_endpoints 
         SET secret = ?, updated_at = CURRENT_TIMESTAMP 
         WHERE id = ? AND tenant_id = ?`,
        [newSecret, webhookId, tenantId],
      );

      res.status(200).json({
        status: 200,
        message: 'Secreto de webhook rotado exitosamente.',
        data: {
          id: webhookId,
          secret: newSecret,
        },
      });
    } catch (err: any) {
      console.error('Rotate secret error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al rotar el secreto del webhook.',
      });
    }
  },
);

/**
 * POST /api/v1/webhooks/:id/test
 * Dispatch an immediate test ping event ('webhook.test').
 */
router.post(
  '/:id/test',
  validate(webhookIdParamSchema, 'params'),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as AuthenticatedRequest).user!.tenantId;
    const webhookId = parseInt(String(req.params.id), 10);

    try {
      const existing = await query<any[]>(
        `SELECT id, is_active FROM webhook_endpoints WHERE id = ? AND tenant_id = ?`,
        [webhookId, tenantId],
      );

      if (!existing || existing.length === 0) {
        res.status(404).json({
          status: 404,
          error: 'Not Found',
          message: 'Endpoint de webhook no encontrado.',
        });
        return;
      }

      const payloadObj = {
        id: `evt_test_${Date.now()}`,
        event: 'webhook.test',
        tenant_id: tenantId,
        timestamp: Math.floor(Date.now() / 1000),
        data: {
          message: 'Ping de prueba de conexión de webhook Dreamtek DAM',
          test: true,
        },
      };

      const result = await query<any>(
        `INSERT INTO webhook_deliveries (tenant_id, webhook_endpoint_id, event_type, payload, status, attempts, max_attempts)
         VALUES (?, ?, 'webhook.test', ?, 'PENDING', 0, 3)`,
        [tenantId, webhookId, JSON.stringify(payloadObj)],
      );

      const deliveryId = result.insertId;

      // Deliver synchronously or asynchronous
      const deliveryResult = await deliverWebhook(deliveryId);

      res.status(200).json({
        status: 200,
        message: 'Evento de prueba enviado.',
        data: {
          delivery_id: deliveryId,
          success: deliveryResult.success,
          status_code: deliveryResult.statusCode,
          error: deliveryResult.error,
        },
      });
    } catch (err: any) {
      console.error('Test webhook error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al enviar el evento de prueba de webhook.',
      });
    }
  },
);

/**
 * GET /api/v1/webhooks/:id/deliveries
 * Query delivery logs for a specific webhook endpoint with pagination.
 */
router.get(
  '/:id/deliveries',
  validate(webhookIdParamSchema, 'params'),
  validate(deliveriesQuerySchema, 'query'),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as AuthenticatedRequest).user!.tenantId;
    const webhookId = parseInt(String(req.params.id), 10);
    const page = Number(req.query.page);
    const limit = Number(req.query.limit);
    const status = req.query.status as string;
    const offset = (page - 1) * limit;

    try {
      // 1. Verify endpoint exists and belongs to tenant
      const existing = await query<any[]>(
        `SELECT id FROM webhook_endpoints WHERE id = ? AND tenant_id = ?`,
        [webhookId, tenantId],
      );

      if (!existing || existing.length === 0) {
        res.status(404).json({
          status: 404,
          error: 'Not Found',
          message: 'Endpoint de webhook no encontrado.',
        });
        return;
      }

      // 2. Count total deliveries
      let countSql = `SELECT COUNT(*) as total FROM webhook_deliveries WHERE tenant_id = ? AND webhook_endpoint_id = ?`;
      const countParams: any[] = [tenantId, webhookId];

      if (status) {
        countSql += ` AND status = ?`;
        countParams.push(status);
      }

      const countRows = await query<any[]>(countSql, countParams);
      const total = Number(countRows[0]?.total || 0);

      // 3. Query paginated deliveries
      let dataSql = `SELECT id, webhook_endpoint_id, event_type, payload, status, status_code, response_body, error_message, attempts, max_attempts, delivered_at, created_at
                     FROM webhook_deliveries
                     WHERE tenant_id = ? AND webhook_endpoint_id = ?`;
      const dataParams: any[] = [tenantId, webhookId];

      if (status) {
        dataSql += ` AND status = ?`;
        dataParams.push(status);
      }

      dataSql += ` ORDER BY id DESC LIMIT ? OFFSET ?`;
      dataParams.push(limit, offset);

      const rows = await query<any[]>(dataSql, dataParams);

      const data = rows.map((r) => ({
        id: r.id,
        webhook_endpoint_id: r.webhook_endpoint_id,
        event_type: r.event_type,
        payload: parsePayload(r.payload),
        status: r.status,
        status_code: r.status_code,
        response_body: r.response_body,
        error_message: r.error_message,
        attempts: r.attempts,
        max_attempts: r.max_attempts,
        delivered_at: r.delivered_at,
        created_at: r.created_at,
      }));

      const totalPages = total > 0 ? Math.ceil(total / limit) : 1;

      res.status(200).json({
        status: 200,
        data,
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      });
    } catch (err: any) {
      console.error('Get webhook deliveries error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al obtener las entregas del webhook.',
      });
    }
  },
);

export default router;
