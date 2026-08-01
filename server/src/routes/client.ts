import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../db.js';
import { getJwtSecret } from '../utils/crypto.js';

export const clientRouter = Router();
const COOKIE_NAME = 'dreamtek_session';

/**
 * Middleware para validar autenticación y extraer usuario.
 */
function requireAuth(req: Request, res: Response, next: () => void) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) {
    res.status(401).json({ status: 'error', message: 'Acceso no autorizado. Inicia sesión.' });
    return;
  }

  try {
    const payload = jwt.verify(token, getJwtSecret(), { algorithms: ['HS512'] }) as any;
    (req as any).user = payload;
    next();
  } catch (_err) {
    res.status(401).json({ status: 'error', message: 'Sesión expirada o inválida.' });
  }
}

/**
 * GET /api/v1/client/sites
 * Devuelve los sitios del cliente autenticado usando la unión canónica:
 * sites ⋈ subscriptions ⋈ users WHERE sub.user_id = :uid
 */
clientRouter.get('/sites', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.uid;

    const sql = `
      SELECT 
        s.id AS site_id,
        s.domain_name,
        s.template_id,
        s.status AS site_status,
        sub.status AS subscription_status,
        sub.plan_name,
        sub.billing_cycle
      FROM sites s
      INNER JOIN subscriptions sub ON s.subscription_id = sub.id
      WHERE sub.user_id = ?
      ORDER BY s.created_at DESC
    `;

    const sites = await query<any[]>(sql, [userId]);
    res.json({ status: 'success', sites });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message || 'Error al obtener sitios.' });
  }
});
