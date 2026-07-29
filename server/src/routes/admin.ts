import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../db.js';

export const adminRouter = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dreamtek_secret_jwt_key_2026';
const COOKIE_NAME = 'dreamtek_session';

/**
 * Middleware para requerir rol ADMIN.
 */
function requireAdmin(req: Request, res: Response, next: () => void) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) {
    res.status(401).json({ status: 'error', message: 'No autenticado.' });
    return;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    if (payload.role !== 'ADMIN') {
      res.status(403).json({ status: 'error', message: 'Acceso denegado. Se requiere rol ADMIN.' });
      return;
    }
    (req as any).user = payload;
    next();
  } catch (_err) {
    res.status(401).json({ status: 'error', message: 'Sesión inválida.' });
  }
}

/**
 * GET /api/v1/admin/users (Read-Only list excluding password_hash)
 */
adminRouter.get('/users', requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  try {
    const sql = `
      SELECT id, email, role, full_name, phone, company, created_at, updated_at
      FROM users
      ORDER BY id ASC
    `;
    const users = await query<any[]>(sql);
    res.json({ status: 'success', users });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message || 'Error al listar usuarios.' });
  }
});

/**
 * GET /api/v1/admin/metrics (KPI Metrics)
 */
adminRouter.get('/metrics', requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  try {
    const totalUsers = await query<any[]>('SELECT COUNT(*) AS total FROM users');
    const activeSubs = await query<any[]>('SELECT COUNT(*) AS total FROM subscriptions WHERE status = "ACTIVE"');
    const totalRev = await query<any[]>('SELECT COALESCE(SUM(total_amount), 0) AS total FROM orders WHERE status = "COMPLETED"');
    const openTickets = await query<any[]>('SELECT COUNT(*) AS total FROM support_tickets WHERE status = "OPEN"');

    res.json({
      status: 'success',
      metrics: {
        total_users: Number(totalUsers[0].total),
        active_subscriptions: Number(activeSubs[0].total),
        total_revenue: Number(totalRev[0].total),
        open_tickets: Number(openTickets[0].total),
      },
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message || 'Error al obtener métricas.' });
  }
});
