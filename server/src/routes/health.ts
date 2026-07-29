import { Router, Request, Response } from 'express';

export const healthRouter = Router();

healthRouter.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'Dreamtek API v1',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
  });
});
