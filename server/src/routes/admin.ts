import { Router, Response } from 'express';
import { query } from '../db.js';
import { requireAuth, requireRole, AuthenticatedRequest } from '../middleware/auth.js';

export const adminRouter = Router();

// Protect all admin routes with requireAuth and requireRole('ADMIN') (Condition C-M1)
adminRouter.use(requireAuth);
adminRouter.use(requireRole(['ADMIN']));

/**
 * GET /api/v1/admin/leads
 * Returns list of onboarding leads (Condition C-M3)
 */
adminRouter.get('/leads', async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const leads = await query<any[]>('SELECT * FROM leads ORDER BY created_at DESC LIMIT 100').catch(() => []);
    res.json({
      status: 'success',
      total: leads.length,
      leads,
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message || 'Error al consultar prospectos.' });
  }
});

/**
 * GET /api/v1/admin/audit-logs
 * Returns paginated security audit logs omitting plain secrets (Condition C-M6)
 */
adminRouter.get('/audit-logs', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const page = parseInt((req.query.page as string) || '1', 10);
    const limit = parseInt((req.query.limit as string) || '20', 10);
    const offset = (page - 1) * limit;

    const logs = await query<any[]>(
      'SELECT id, event_type, ip_address, user_agent, payload_sha256, created_at FROM security_audit_logs ORDER BY id DESC LIMIT ? OFFSET ?',
      [limit, offset]
    ).catch(() => []);

    const countResult = await query<any[]>('SELECT COUNT(*) as total FROM security_audit_logs').catch(() => [{ total: 0 }]);
    const total = countResult[0]?.total || 0;

    res.json({
      status: 'success',
      page,
      limit,
      total,
      logs,
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message || 'Error al consultar logs de auditoría.' });
  }
});

/**
 * GET /api/v1/admin/metrics
 * Returns system administrative metrics (Condition C-M3)
 */
adminRouter.get('/metrics', async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const leadsCount = await query<any[]>('SELECT COUNT(*) as total FROM leads').catch(() => [{ total: 0 }]);
    const usersCount = await query<any[]>('SELECT COUNT(*) as total FROM users').catch(() => [{ total: 0 }]);

    res.json({
      status: 'success',
      metrics: {
        total_leads: leadsCount[0]?.total || 0,
        total_users: usersCount[0]?.total || 0,
        uptime_seconds: process.uptime(),
        timestamp: Date.now(),
      },
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message || 'Error al consultar métricas.' });
  }
});
