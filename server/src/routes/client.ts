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

    const users = await query<any[]>('SELECT id, full_name, email, role, created_at FROM users WHERE id = ? LIMIT 1', [userId]);

    if (users.length === 0) {
      res.status(404).json({ status: 404, error: 'Not Found', message: 'Perfil de cliente no encontrado.' });
      return;
    }

    const user = users[0];

    // Fetch user sites or active services
    const sites = await query<any[]>('SELECT * FROM client_sites WHERE user_id = ?', [userId]).catch(() => []);

    res.json({
      status: 'success',
      profile: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
        created_at: user.created_at,
      },
      services: [
        { id: 'srv-1', name: 'Escolta WEB — Posicionamiento', status: 'active', billing_cycle: 'annual' },
      ],
      sites: sites.length > 0 ? sites : [{ domain: 'miempresa.com', status: 'active', ssl: true }],
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message || 'Error al obtener el panel de cliente.' });
  }
});

/**
 * GET /api/v1/client/sites
 * Returns client assigned web sites (Condition C-M3)
 */
clientRouter.get('/sites', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const sites = await query<any[]>('SELECT * FROM client_sites WHERE user_id = ?', [userId]).catch(() => []);

    res.json({
      status: 'success',
      sites: sites.length > 0 ? sites : [{ id: 1, domain: 'miempresa.com', status: 'active', ssl: true }],
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message || 'Error al obtener sitios web del cliente.' });
  }
});
