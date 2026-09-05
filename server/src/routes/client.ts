import { Router, Response } from 'express';
import { query } from '../db.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';

export const clientRouter = Router();

// Protect all client routes with requireAuth middleware
clientRouter.use(requireAuth);

/**
 * GET /api/v1/client/dashboard
 * Anti-IDOR Protected: Retrieves client profile and active services using req.user.userId from JWT (Condition C-M5)
 */
clientRouter.get('/dashboard', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;

    const users = await query<any[]>(
      'SELECT id, full_name, email, role, created_at FROM users WHERE id = ? LIMIT 1',
      [userId],
    );

    if (users.length === 0) {
      res
        .status(404)
        .json({ status: 404, error: 'Not Found', message: 'Perfil de cliente no encontrado.' });
      return;
    }

    const user = users[0];

    // Safely query user sites without fake demo fallbacks (Rule F01 / Condition 001m R3)
    let sites: any[] = [];
    try {
      sites = await query<any[]>(
        'SELECT id, domain, status, ssl FROM client_sites WHERE user_id = ?',
        [userId],
      );
    } catch (dbErr: any) {
      console.error('⚠️ client_sites DB query warning:', dbErr?.message || dbErr);
      sites = [];
    }

    // Query real client subscriptions without hardcoded mocks
    let services: any[] = [];
    try {
      const subRows = await query<any[]>(
        'SELECT id, plan_id, billing_cycle, status, amount, renews_at FROM subscriptions WHERE user_id = ? AND status = "active"',
        [userId],
      );
      services = subRows.map((sub) => ({
        id: String(sub.id),
        name:
          sub.plan_id === 'starterkit' || sub.plan_id.includes('escolta')
            ? 'Escolta WEB — Posicionamiento'
            : sub.plan_id,
        status: sub.status,
        billing_cycle: sub.billing_cycle,
        amount: sub.amount,
        renews_at: sub.renews_at,
      }));
    } catch (subErr: any) {
      console.error('⚠️ subscriptions DB query warning:', subErr?.message || subErr);
      services = [];
    }

    res.json({
      status: 'success',
      profile: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
        created_at: user.created_at,
      },
      services,
      sites,
    });
  } catch (err: any) {
    res
      .status(500)
      .json({ status: 'error', message: err.message || 'Error al obtener el panel de cliente.' });
  }
});

/**
 * GET /api/v1/client/sites
 * Returns client assigned web sites without fake fallbacks (Condition C-M3, Rule F01)
 */
clientRouter.get('/sites', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    let sites: any[] = [];
    try {
      sites = await query<any[]>(
        'SELECT id, domain, status, ssl FROM client_sites WHERE user_id = ?',
        [userId],
      );
    } catch (dbErr: any) {
      console.error('⚠️ client_sites DB query warning:', dbErr?.message || dbErr);
      sites = [];
    }

    res.json({
      status: 'success',
      sites,
    });
  } catch (err: any) {
    res.status(500).json({
      status: 'error',
      message: err.message || 'Error al obtener sitios web del cliente.',
    });
  }
});
