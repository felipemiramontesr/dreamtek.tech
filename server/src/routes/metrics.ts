import { Router, Request, Response } from 'express';
import { metricsRegistry } from '../utils/metrics';

export const metricsRouter = Router();

export const METRICS_SECRET_TOKEN = process.env.METRICS_BEARER_TOKEN || 'dreamtek-metrics-secret-key';

export function isMetricsAuthorized(req: Request): boolean {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    if (token === METRICS_SECRET_TOKEN) {
      return true;
    }
  }

  // Check if authenticated user has ADMIN role
  const user = (req as Request & { user?: { role?: string } }).user;
  if (user && user.role === 'ADMIN') {
    return true;
  }

  return false;
}

metricsRouter.get('/', (req: Request, res: Response) => {
  if (!isMetricsAuthorized(req)) {
    res.status(401).json({
      error: 'Unauthorized: Valid metrics token or admin authorization required',
    });
    return;
  }

  const metricsOutput = metricsRegistry.getPrometheusMetrics();
  res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.send(metricsOutput);
});
