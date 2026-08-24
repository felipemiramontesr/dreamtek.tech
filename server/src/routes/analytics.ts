import { Router, Request, Response } from 'express';
import { query } from '../db.js';
import { requireAuth, requireRole, AuthenticatedRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  analyticsRateLimiter,
  analyticsEventsRateLimiter,
} from '../middleware/rateLimiter.js';
import { evaluateAclPermission } from '../utils/acl.js';
import { resolveValidShare } from './shares.js';
import {
  recordEventBodySchema,
  analyticsOverviewQuerySchema,
  topAssetsQuerySchema,
  roiReportQuerySchema,
  assetAnalyticsQuerySchema,
} from '../schemas/analytics.schema.js';
import {
  recordAnalyticsEvent,
  getOverviewMetrics,
  getAssetMetrics,
  getTopAssets,
  getRoiReport,
} from '../utils/analyticsEngine.js';

export const analyticsRouter = Router();

/**
 * Helper middleware that enforces requireAuth unless actor_type === 'GUEST'
 */
export const optionalAuthForAnalytics = (
  req: Request,
  res: Response,
  next: (err?: any) => void,
) => {
  if (req.body?.actor_type === 'GUEST') {
    return next();
  }
  return requireAuth(req, res, next);
};

/**
 * Helper to safely extract client IP behind proxies
 */
export const getClientIp = (req: Request): string => {
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

/**
 * POST /api/v1/analytics/events
 * Ingestion endpoint for client-side telemetries and guest interactions with anti-spoofing checks.
 */
analyticsRouter.post(
  '/events',
  analyticsEventsRateLimiter,
  validate(recordEventBodySchema, 'body'),
  optionalAuthForAnalytics,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        asset_id,
        event_type,
        actor_type,
        share_token,
        bytes_served,
        referer,
      } = req.body;

      let tenantId: number;
      let actorId: number | null = null;

      if (actor_type === 'GUEST') {
        // Condition C-018.3: Validate guest share token bind to asset
        const validShare = await resolveValidShare(share_token);
        if (!validShare || Number(validShare.asset_id) !== Number(asset_id)) {
          res.status(403).json({
            status: 403,
            error: 'Forbidden',
            message: 'El share_token no es válido, ha expirado o no coincide con el activo.',
          });
          return;
        }

        tenantId = validShare.tenant_id;
      } else {        // Authenticated USER / SYSTEM flow
        const authUser = (req as AuthenticatedRequest).user!;
        tenantId = Number(authUser.tenantId);
        actorId = Number(authUser.userId);

        // Check ACL VIEW permission on the asset
        const aclResult = await evaluateAclPermission(
          {
            id: Number(authUser.userId),
            role: String(authUser.role),
            tenantId: Number(authUser.tenantId),
          },
          'ASSET',
          asset_id,
          'VIEW',
        );

        if (!aclResult.allowed) {
          res.status(403).json({
            status: 403,
            error: 'Forbidden',
            message: 'No posee permisos para registrar eventos sobre este activo.',
          });
          return;
        }
      }

      await recordAnalyticsEvent({
        tenant_id: tenantId,
        asset_id,
        event_type,
        actor_id: actorId,
        actor_type,
        bytes_served: bytes_served || 0,
        ip: req.ip,
        user_agent: req.headers['user-agent'],
        referer: req.headers['referer'] as string | undefined,
      });

      res.status(201).json({
        status: 201,
        message: 'Evento de analítica registrado exitosamente.',
      });
    } catch (err: any) {
      console.error('Record event error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al registrar el evento de analítica.',
      });
    }
  },
);

/**
 * GET /api/v1/analytics/overview
 * Returns high-level telemetry and metrics for tenant (Admin only - Condition C-018.4).
 */
analyticsRouter.get(
  '/overview',
  analyticsRateLimiter,
  requireAuth,
  requireRole(['ADMIN']),
  validate(analyticsOverviewQuerySchema, 'query'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const { days } = req.query as any;

      const data = await getOverviewMetrics(tenantId, Number(days || 30));

      res.status(200).json({
        status: 200,
        message: 'Métricas generales obtenidas exitosamente.',
        data,
      });
    } catch (err: any) {
      console.error('Analytics overview error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al obtener las métricas generales de analíticas.',
      });
    }
  },
);

/**
 * GET /api/v1/analytics/assets/:id
 * Detailed telemetry for a specific asset (Protected by asset VIEW ACL).
 */
analyticsRouter.get(
  '/assets/:id',
  analyticsRateLimiter,
  requireAuth,
  validate(assetAnalyticsQuerySchema, 'query'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
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
      const aclResult = await evaluateAclPermission(
        {
          id: Number(req.user!.userId),
          role: String(req.user!.role),
          tenantId: Number(req.user!.tenantId),
        },
        'ASSET',
        assetId,
        'VIEW',
      );

      if (!aclResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'No posee permisos para visualizar analíticas de este activo.',
        });
        return;
      }

      const { days } = req.query as any;
      const data = await getAssetMetrics(tenantId, assetId, Number(days));

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
    } catch (err: any) {
      console.error('Asset analytics error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al consultar las analíticas del activo.',
      });
    }
  },
);

/**
 * GET /api/v1/analytics/top-assets
 * Returns top ranked assets by metric (Admin only - Condition C-018.4).
 */
analyticsRouter.get(
  '/top-assets',
  analyticsRateLimiter,
  requireAuth,
  requireRole(['ADMIN']),
  validate(topAssetsQuerySchema, 'query'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const { metric, days, limit } = req.query as any;

      const data = await getTopAssets(
        tenantId,
        String(metric || 'views'),
        Number(days || 30),
        Number(limit || 10),
      );

      res.status(200).json({
        status: 200,
        message: 'Top de activos obtenido exitosamente.',
        data,
      });
    } catch (err: any) {
      console.error('Top assets error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al consultar el ranking de activos.',
      });
    }
  },
);

/**
 * GET /api/v1/analytics/roi-report
 * Returns executive ROI report and dormant candidates (Admin only - Condition C-018.4).
 */
analyticsRouter.get(
  '/roi-report',
  analyticsRateLimiter,
  requireAuth,
  requireRole(['ADMIN']),
  validate(roiReportQuerySchema, 'query'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const { days, dormant_threshold_days, limit } = req.query as any;

      const data = await getRoiReport(
        tenantId,
        Number(days || 90),
        Number(dormant_threshold_days || 180),
        Number(limit || 50),
      );

      res.status(200).json({
        status: 200,
        message: 'Reporte de ROI y activos dormantes generado exitosamente.',
        data,
      });
    } catch (err: any) {
      console.error('ROI report error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al generar el reporte de ROI.',
      });
    }
  },
);

export default analyticsRouter;
