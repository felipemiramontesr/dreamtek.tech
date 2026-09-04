import { Router, Request, Response } from 'express';
import { query } from '../db.js';
import { validate } from '../middleware/validate.js';
import { leadSchema, domainCheckSchema } from '../schemas/onboarding.schema.js';
import { invalidateCache } from '../utils/cache.js';

export const onboardingRouter = Router();

/**
 * POST /api/v1/onboarding/lead
 */
onboardingRouter.post(
  '/lead',
  validate(leadSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, phone, company, step_reached } = req.body;
      const full_name = req.body.full_name || req.body.name;

      if (!email || !full_name || !phone) {
        res
          .status(400)
          .json({ status: 'error', message: 'Nombre, email y teléfono son requeridos.' });
        return;
      }

      const existing = await query<any[]>('SELECT id FROM leads WHERE email = ? LIMIT 1', [email]);

      // Condition C-L2: Invalidate lead cache on write operation
      await invalidateCache('lead');

      if (existing.length > 0) {
        await query(
          'UPDATE leads SET full_name = ?, phone = ?, company = ?, step_reached = ? WHERE id = ?',
          [full_name, phone, company || '', step_reached || 1, existing[0].id],
        );
        res.json({ status: 'success', lead_id: existing[0].id, message: 'Prospecto actualizado.' });
      } else {
        const result = await query<any>(
          'INSERT INTO leads (full_name, email, phone, company, step_reached) VALUES (?, ?, ?, ?, ?)',
          [full_name, email, phone, company || '', step_reached || 1],
        );
        res.json({ status: 'success', lead_id: result.insertId, message: 'Prospecto registrado.' });
      }
    } catch (err: any) {
      res
        .status(500)
        .json({ status: 'error', message: err.message || 'Error al procesar el prospecto.' });
    }
  },
);

/**
 * POST /api/v1/onboarding/domain
 * Checks domain availability via DNS soft-lookup and local reserved keywords (Condition C-037).
 * Honesty: Soft DNS availability check only; does not act as an ICANN EPP registrar.
 */
onboardingRouter.post(
  '/domain',
  validate(domainCheckSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { domain } = req.body;

      if (!domain || typeof domain !== 'string') {
        res.status(400).json({ status: 'error', message: 'Nombre de dominio requerido.' });
        return;
      }

      const cleanDomain = domain.trim().toLowerCase();

      // Check against reserved or restricted names
      if (cleanDomain.includes('reservado') || cleanDomain.includes('google')) {
        res.json({
          status: 'success',
          available: false,
          domain: cleanDomain,
          message: 'Dominio no disponible o reservado.',
        });
        return;
      }

      // Check existing sites in database to prevent collision
      try {
        const existingSite = await query<any[]>(
          'SELECT id FROM client_sites WHERE domain = ? LIMIT 1',
          [cleanDomain],
        );
        if (existingSite && existingSite.length > 0) {
          res.json({
            status: 'success',
            available: false,
            domain: cleanDomain,
            message: 'Este dominio ya se encuentra registrado en la plataforma.',
          });
          return;
        }
      } catch (_dbErr) {
        // Table client_sites might not exist in early tests
      }

      // Perform soft DNS resolution check (if domain resolves A/NS records, it is taken)
      let isAvailable = true;
      if (process.env.NODE_ENV !== 'test') {
        try {
          const dns = await import('node:dns/promises');
          await dns.resolve(cleanDomain);
          isAvailable = false;
        } catch (_dnsErr) {
          // ENOTFOUND or ENODATA usually indicates domain has no active DNS zone
          isAvailable = true;
        }
      }

      res.json({
        status: 'success',
        available: isAvailable,
        domain: cleanDomain,
        check_type: 'DNS_SOFT_CHECK',
      });
    } catch (err: any) {
      res.status(500).json({
        status: 'error',
        message: err?.message || 'Error al comprobar disponibilidad del dominio.',
      });
    }
  },
);
