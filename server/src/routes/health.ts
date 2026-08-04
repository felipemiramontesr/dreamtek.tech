import { Router, Request, Response } from 'express';
import { query } from '../db.js';

export const healthRouter = Router();

let isShuttingDownState = false;

export function setShuttingDownState(state: boolean): void {
  isShuttingDownState = state;
}

export function isShuttingDown(): boolean {
  return isShuttingDownState;
}

/**
 * Legacy Health Endpoint (Condition C-J2)
 * GET /health
 */
healthRouter.get('/health', (_req: Request, res: Response) => {
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
healthRouter.get('/healthz', (_req: Request, res: Response) => {
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
healthRouter.get('/readyz', async (_req: Request, res: Response): Promise<void> => {
  if (isShuttingDownState) {
    res.status(503).json({
      status: 'not_ready',
      database: 'disconnected',
      reason: 'Server is shutting down',
    });
    return;
  }

  try {
    await query('SELECT 1');
    res.json({
      status: 'ready',
      service: 'Dreamtek Node.js API',
      database: 'connected',
      timestamp: Date.now(),
    });
  } catch (_err) {
    res.status(503).json({
      status: 'not_ready',
      service: 'Dreamtek Node.js API',
      database: 'disconnected',
    });
  }
});
