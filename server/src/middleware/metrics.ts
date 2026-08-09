import { Request, Response, NextFunction } from 'express';
import { metricsRegistry } from '../utils/metrics';

/**
 * Normalizes dynamic URL path parameters to limit Prometheus metric label cardinality (Condition C-N3)
 */
export function normalizeRoutePath(rawPath: string): string {
  if (!rawPath) return '/';
  
  // Remove query strings
  const cleanPath = rawPath.split('?')[0];

  return cleanPath
    // Replace UUIDs
    .replace(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g, ':id')
    // Replace numeric IDs (e.g. /users/123 -> /users/:id)
    .replace(/\/\d+/g, '/:id')
    // Replace hex tokens
    .replace(/\/[0-9a-fA-F]{16,}/g, '/:token');
}

export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startTime = performance.now();

  res.on('finish', () => {
    const durationSeconds = (performance.now() - startTime) / 1000;
    const normalizedPath = normalizeRoutePath(req.baseUrl + (req.path || req.originalUrl || ''));
    metricsRegistry.recordHttpRequest(req.method, normalizedPath, res.statusCode, durationSeconds);
  });

  next();
}
