import { Router, Request, Response } from 'express';
import { query } from '../db.js';
import { validate } from '../middleware/validate.js';
import { leadSchema, domainCheckSchema } from '../schemas/onboarding.schema.js';

export const onboardingRouter = Router();

/**
 * POST /api/v1/onboarding/lead
 */
onboardingRouter.post('/lead', validate(leadSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, full_name, phone, company, step_reached } = req.body;

    if (!email || !full_name || !phone) {
      res.status(400).json({ status: 'error', message: 'Nombre, email y teléfono son requeridos.' });
      return;
    }

    const existing = await query<any[]>('SELECT id FROM leads WHERE email = ? LIMIT 1', [email]);

    if (existing.length > 0) {
      await query('UPDATE leads SET full_name = ?, phone = ?, company = ?, step_reached = ? WHERE id = ?', [
        full_name,
        phone,
        company || '',
        step_reached || 1,
        existing[0].id,
      ]);
      res.json({ status: 'success', lead_id: existing[0].id, message: 'Prospecto actualizado.' });
    } else {
      const result = await query<any>('INSERT INTO leads (full_name, email, phone, company, step_reached) VALUES (?, ?, ?, ?, ?)', [
        full_name,
        email,
        phone,
        company || '',
        step_reached || 1,
      ]);
      res.json({ status: 'success', lead_id: result.insertId, message: 'Prospecto registrado.' });
    }
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message || 'Error al procesar el prospecto.' });
  }
});

/**
 * POST /api/v1/onboarding/domain
 */
onboardingRouter.post('/domain', validate(domainCheckSchema), (req: Request, res: Response) => {
  const { domain } = req.body;

  if (!domain || typeof domain !== 'string') {
    res.status(400).json({ status: 'error', message: 'Nombre de dominio requerido.' });
    return;
  }

  const cleanDomain = domain.trim().toLowerCase();
  const isAvailable = !cleanDomain.includes('reservado') && !cleanDomain.includes('google');

  res.json({
    status: 'success',
    available: isAvailable,
    domain: cleanDomain,
    message: isAvailable
      ? `El dominio ${cleanDomain} está disponible para registro.`
      : `El dominio ${cleanDomain} no está disponible. Te sugeriremos alternativas.`,
  });
});
