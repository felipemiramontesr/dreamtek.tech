import { Router, Response, Request } from 'express';
import rateLimit from 'express-rate-limit';
import { query } from '../db.js';
import { requireAuth, requireRole, AuthenticatedRequest } from '../middleware/auth.js';
import {
  updateLeadStatusSchema,
  createLeadActivitySchema,
  sendLeadFollowUpEmailSchema,
  createLeadCheckoutSessionSchema,
} from '../schemas/crm.schema.js';
import {
  escapeHtml,
  escapeLikeWildcards,
  renderLeadFollowUpEmail,
} from '../utils/crm.js';
import { getTransporter } from './contact.js';
import { getStripe } from './checkout.js';

export const adminRouter = Router();

export const getAdminEmailClientKey = (req: Request): string => {
  const authReq = req as AuthenticatedRequest;
  if (authReq.user?.userId) {
    return `admin_${authReq.user.userId}`;
  }
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  if (req.socket?.remoteAddress) {
    return req.socket.remoteAddress;
  }
  return '127.0.0.1';
};

// Rate limiter for sending lead follow-up emails (Condition C-041.4): 10 req/min per admin/IP
export const leadEmailRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => getAdminEmailClientKey(req),
  message: {
    status: 'error',
    error: 'Too Many Requests',
    message: 'Límite de envío de correos alcanzado (máximo 10 por minuto). Intenta más tarde.',
  },
});

// Rate limiter for generating lead checkout payment sessions (Condition C-043): 10 req/min per admin/IP
export const leadPaymentRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => getAdminEmailClientKey(req),
  message: {
    status: 'error',
    error: 'Too Many Requests',
    message: 'Límite de generación de enlaces de pago alcanzado (máximo 10 por minuto). Intenta más tarde.',
  },
});

// Protect all admin routes with requireAuth and requireRole('ADMIN') (Condition C-M1)
adminRouter.use(requireAuth);
adminRouter.use(requireRole(['ADMIN']));

/**
 * GET /api/v1/admin/leads
 * Returns filtered and searched list of leads (FC 041 rev-2)
 */
adminRouter.get('/leads', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { status, vertical, search } = req.query;

    let sql = `SELECT id, email, full_name, phone, company, status, assigned_to, last_contacted_at,
                      project_vertical, complexity_level, estimated_budget_min, estimated_budget_max,
                      estimated_weeks_min, estimated_weeks_max, deposit_status, currency, created_at, updated_at
               FROM leads WHERE 1=1`;
    const params: any[] = [];

    if (status && typeof status === 'string' && status.trim() !== '' && status !== 'ALL') {
      sql += ' AND status = ?';
      params.push(status.trim());
    }

    if (vertical && typeof vertical === 'string' && vertical.trim() !== '' && vertical !== 'ALL') {
      sql += ' AND project_vertical = ?';
      params.push(vertical.trim());
    }

    if (search && typeof search === 'string' && search.trim().length > 0) {
      const escaped = `%${escapeLikeWildcards(search.trim())}%`;
      sql += ' AND (email LIKE ? OR full_name LIKE ? OR company LIKE ?)';
      params.push(escaped, escaped, escaped);
    }

    sql += ' ORDER BY created_at DESC LIMIT 100';

    const leads = await query<any[]>(sql, params).catch(() => []);
    res.json({
      status: 'success',
      total: leads.length,
      leads,
    });
  } catch (err: any) {
    res
      .status(500)
      .json({ status: 'error', message: err.message || 'Error al consultar prospectos.' });
  }
});

/**
 * GET /api/v1/admin/leads/:id
 * Returns a specific lead with its complete activity timeline
 */
adminRouter.get('/leads/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const leadId = parseInt(req.params.id, 10);
    if (isNaN(leadId) || leadId <= 0) {
      res.status(400).json({ status: 'error', message: 'ID de prospecto inválido.' });
      return;
    }

    const leadRows = await query<any[]>('SELECT * FROM leads WHERE id = ?', [leadId]);
    if (!leadRows || leadRows.length === 0) {
      res.status(404).json({ status: 'error', message: 'Prospecto no encontrado.' });
      return;
    }

    const lead = leadRows[0];
    const activities = await query<any[]>(
      `SELECT la.id, la.lead_id, la.user_id, la.activity_type, la.title, la.details, la.created_at,
              u.full_name as author_name, u.username as author_username
       FROM lead_activities la
       LEFT JOIN users u ON la.user_id = u.id
       WHERE la.lead_id = ?
       ORDER BY la.created_at DESC`,
      [leadId],
    );

    const payments = await query<any[]>(
      `SELECT id, lead_id, stripe_session_id, stripe_payment_intent_id, payment_type,
              amount_cents, currency, status, notes, paid_at, created_at, updated_at
       FROM lead_payments
       WHERE lead_id = ?
       ORDER BY created_at DESC`,
      [leadId],
    );

    res.json({
      status: 'success',
      lead: {
        ...lead,
        activities,
        payments,
      },
    });
  } catch (err: any) {
    res
      .status(500)
      .json({ status: 'error', message: err.message || 'Error al consultar expediente de prospecto.' });
  }
});

/**
 * PATCH /api/v1/admin/leads/:id/status
 * Updates lead status and logs STATUS_CHANGE in lead_activities
 */
adminRouter.patch('/leads/:id/status', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const leadId = parseInt(req.params.id, 10);
    if (isNaN(leadId) || leadId <= 0) {
      res.status(400).json({ status: 'error', message: 'ID de prospecto inválido.' });
      return;
    }

    const parseResult = updateLeadStatusSchema.safeParse(req.body);
    if (!parseResult.success) {
      const errorMsg = parseResult.error.errors.map((e) => e.message).join(', ');
      res.status(400).json({ status: 'error', error: 'Validation Error', message: errorMsg });
      return;
    }

    const { status: newStatus, note } = parseResult.data;

    const leadRows = await query<any[]>('SELECT id, status, full_name, email FROM leads WHERE id = ?', [leadId]);
    if (!leadRows || leadRows.length === 0) {
      res.status(404).json({ status: 'error', message: 'Prospecto no encontrado.' });
      return;
    }

    const previousStatus = leadRows[0].status;

    // Update lead status
    await query(
      'UPDATE leads SET status = ?, last_contacted_at = NOW(), updated_at = NOW() WHERE id = ?',
      [newStatus, leadId],
    );

    // Insert activity record
    const noteDetail = note ? ` Nota: ${escapeHtml(note)}` : '';
    await query(
      `INSERT INTO lead_activities (lead_id, user_id, activity_type, title, details)
       VALUES (?, ?, 'STATUS_CHANGE', ?, ?)`,
      [
        leadId,
        req.user!.userId,
        `Transición a ${newStatus}`,
        `Estado actualizado de ${previousStatus || 'NEW'} a ${newStatus}.${noteDetail}`,
      ],
    );

    res.json({
      status: 'success',
      message: 'Estado del prospecto actualizado con éxito.',
      previous_status: previousStatus,
      new_status: newStatus,
    });
  } catch (err: any) {
    res
      .status(500)
      .json({ status: 'error', message: err.message || 'Error al actualizar estado del prospecto.' });
  }
});

/**
 * POST /api/v1/admin/leads/:id/activities
 * Registers a manual note, call log, or meeting in lead_activities
 */
adminRouter.post('/leads/:id/activities', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const leadId = parseInt(req.params.id, 10);
    if (isNaN(leadId) || leadId <= 0) {
      res.status(400).json({ status: 'error', message: 'ID de prospecto inválido.' });
      return;
    }

    const parseResult = createLeadActivitySchema.safeParse(req.body);
    if (!parseResult.success) {
      const errorMsg = parseResult.error.errors.map((e) => e.message).join(', ');
      res.status(400).json({ status: 'error', error: 'Validation Error', message: errorMsg });
      return;
    }

    const { activity_type, title, details } = parseResult.data;

    const leadRows = await query<any[]>('SELECT id FROM leads WHERE id = ?', [leadId]);
    if (!leadRows || leadRows.length === 0) {
      res.status(404).json({ status: 'error', message: 'Prospecto no encontrado.' });
      return;
    }

    const sanitizedDetails = details ? escapeHtml(details) : null;

    const insertResult = await query<any>(
      `INSERT INTO lead_activities (lead_id, user_id, activity_type, title, details)
       VALUES (?, ?, ?, ?, ?)`,
      [leadId, req.user!.userId, activity_type, title, sanitizedDetails],
    );

    // Update last_contacted_at on lead
    await query('UPDATE leads SET last_contacted_at = NOW(), updated_at = NOW() WHERE id = ?', [leadId]);

    res.status(201).json({
      status: 'success',
      message: 'Actividad registrada con éxito.',
      activity_id: insertResult?.insertId || null,
    });
  } catch (err: any) {
    res
      .status(500)
      .json({ status: 'error', message: err.message || 'Error al registrar actividad.' });
  }
});

/**
 * POST /api/v1/admin/leads/:id/send-email
 * Dispatches a manual follow-up email template on-click with strict error handling (C-041.4)
 */
adminRouter.post(
  '/leads/:id/send-email',
  leadEmailRateLimiter,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const leadId = parseInt(req.params.id, 10);
      if (isNaN(leadId) || leadId <= 0) {
        res.status(400).json({ status: 'error', message: 'ID de prospecto inválido.' });
        return;
      }

      const parseResult = sendLeadFollowUpEmailSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errorMsg = parseResult.error.errors.map((e) => e.message).join(', ');
        res.status(400).json({ status: 'error', error: 'Validation Error', message: errorMsg });
        return;
      }

      const { template_id, subject, custom_message } = parseResult.data;

      const leadRows = await query<any[]>('SELECT * FROM leads WHERE id = ?', [leadId]);
      if (!leadRows || leadRows.length === 0) {
        res.status(404).json({ status: 'error', message: 'Prospecto no encontrado.' });
        return;
      }

      const lead = leadRows[0];
      if (!lead.email || typeof lead.email !== 'string' || !lead.email.includes('@')) {
        res.status(400).json({ status: 'error', message: 'El prospecto no posee un correo electrónico válido.' });
        return;
      }

      const rendered = renderLeadFollowUpEmail(
        {
          fullName: lead.full_name || lead.name || 'Estimado/a',
          email: lead.email,
          company: lead.company || lead.company_name || null,
          projectVertical: lead.project_vertical || null,
          estimatedBudgetMin: lead.estimated_budget_min,
          estimatedBudgetMax: lead.estimated_budget_max,
          estimatedWeeksMin: lead.estimated_weeks_min,
          estimatedWeeksMax: lead.estimated_weeks_max,
          currency: lead.currency || 'MXN',
          locale: lead.locale || 'es',
        },
        template_id,
        subject,
        custom_message,
      );

      // Attempt SMTP dispatch with strict fail-open / 502 error handling (C-041.4)
      try {
        await getTransporter().sendMail({
          from: '"Dreamtek Dirección Comercial" <hola@dreamtek.tech>',
          to: lead.email,
          subject: rendered.subject,
          text: rendered.text,
          html: rendered.html,
        });
      } catch (smtpErr: any) {
        // C-041.4: Return 502 Bad Gateway and DO NOT record EMAIL_SENT in lead_activities
        console.warn(`[CRM_SMTP_ERROR] Error al enviar correo a lead ${leadId}:`, smtpErr?.message);
        res.status(502).json({
          status: 'error',
          error: 'Bad Gateway',
          message: 'Error en el servidor de correo SMTP. No se pudo enviar el correo de seguimiento.',
        });
        return;
      }

      // Record activity only on successful SMTP delivery
      const detailMsg = `Plantilla: ${template_id}.${custom_message ? ' Mensaje: ' + escapeHtml(custom_message) : ''}`;
      await query(
        `INSERT INTO lead_activities (lead_id, user_id, activity_type, title, details)
         VALUES (?, ?, 'EMAIL_SENT', ?, ?)`,
        [leadId, req.user!.userId, `Correo enviado: ${rendered.subject}`, detailMsg],
      );

      // Advance status from NEW to CONTACTED if applicable and update last_contacted_at
      await query(
        `UPDATE leads
         SET last_contacted_at = NOW(),
             updated_at = NOW(),
             status = CASE WHEN status = 'NEW' THEN 'CONTACTED' ELSE status END
         WHERE id = ?`,
        [leadId],
      );

      res.json({
        status: 'success',
        message: 'Correo de seguimiento manual enviado con éxito.',
        template_id,
        subject: rendered.subject,
      });
    } catch (err: any) {
      res
        .status(500)
        .json({ status: 'error', message: err.message || 'Error al procesar envío de correo.' });
    }
  },
);

/**
 * POST /api/v1/admin/leads/:id/checkout-session
 * Generates a Stripe Checkout session for B2B deposit (FC 043 rev-2)
 */
adminRouter.post(
  '/leads/:id/checkout-session',
  leadPaymentRateLimiter,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const leadId = parseInt(req.params.id, 10);
      if (isNaN(leadId) || leadId <= 0) {
        res.status(400).json({ status: 'error', message: 'ID de prospecto inválido.' });
        return;
      }

      const parseResult = createLeadCheckoutSessionSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errorMsg = parseResult.error.errors.map((e) => e.message).join(', ');
        res.status(400).json({ status: 'error', error: 'Validation Error', message: errorMsg });
        return;
      }

      const { payment_type, custom_amount, notes } = parseResult.data;

      const leadRows = await query<any[]>('SELECT * FROM leads WHERE id = ?', [leadId]);
      if (!leadRows || leadRows.length === 0) {
        res.status(404).json({ status: 'error', message: 'Prospecto no encontrado.' });
        return;
      }

      const lead = leadRows[0];
      if (!lead.email || typeof lead.email !== 'string' || !lead.email.includes('@')) {
        res.status(400).json({ status: 'error', message: 'El prospecto no posee un correo electrónico válido.' });
        return;
      }

      // Calculate deposit amount (C-043.4, C-043.6)
      let amount: number;
      if (payment_type === 'DEPOSIT_50') {
        const budgetMin = Number(lead.estimated_budget_min);
        if (!budgetMin || isNaN(budgetMin) || budgetMin <= 0) {
          res.status(400).json({
            status: 'error',
            message: 'El prospecto no tiene un presupuesto mínimo estimado válido para calcular el 50%. Especifica un monto personalizado.',
          });
          return;
        }
        amount = Math.round(budgetMin * 0.5);
      } else {
        if (!custom_amount || custom_amount <= 0) {
          res.status(400).json({
            status: 'error',
            message: 'El monto personalizado debe ser mayor a cero.',
          });
          return;
        }
        amount = custom_amount;
      }

      const currency = (lead.currency || 'USD').toUpperCase() as 'USD' | 'MXN';

      // Amount boundary checks (C-043.6)
      if (currency === 'USD') {
        if (amount < 50 || amount > 30000) {
          res.status(400).json({
            status: 'error',
            message: `Monto fuera de rango para USD ($50 - $30,000 USD). Monto solicitado: $${amount}`,
          });
          return;
        }
      } else if (currency === 'MXN') {
        if (amount < 500 || amount > 500000) {
          res.status(400).json({
            status: 'error',
            message: `Monto fuera de rango para MXN ($500 - $500,000 MXN). Monto solicitado: $${amount}`,
          });
          return;
        }
      } else {
        res.status(400).json({
          status: 'error',
          message: `Divisa no soportada: ${currency}. Solo se admite USD o MXN.`,
        });
        return;
      }

      const amountCents = Math.round(amount * 100);
      const currentKey = process.env.STRIPE_SECRET_KEY || 'sk_test_mock';

      // C-043.5: Disallow sk_test_mock in production
      if (
        process.env.NODE_ENV === 'production' &&
        (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY === 'sk_test_mock')
      ) {
        res.status(503).json({
          status: 'error',
          message: 'Configuración de pasarela de pago Stripe no disponible en producción.',
        });
        return;
      }

      let session: { id: string; url: string; expires_at?: number };

      const stripeInstance = getStripe(currentKey);

      if (currentKey === 'sk_test_mock' && !stripeInstance?.checkout?.sessions?.create) {
        const mockSessionId = `cs_test_b2b_${Date.now()}_${leadId}`;
        session = {
          id: mockSessionId,
          url: `https://checkout.stripe.com/c/pay/${mockSessionId}`,
          expires_at: Math.floor(Date.now() / 1000) + 72 * 3600,
        };
      } else {
        const clientName = lead.company || lead.full_name;
        const itemName =
          payment_type === 'DEPOSIT_50'
            ? `Anticipo de Proyecto (50%) — ${clientName}`
            : `Anticipo de Proyecto — ${clientName}`;

        const baseUrl = process.env.CORS_ORIGIN || 'https://dreamtek.tech';

        const stripeSession = await stripeInstance.checkout.sessions.create({
          payment_method_types: ['card'],
          customer_email: lead.email,
          client_reference_id: String(lead.id),
          metadata: {
            tenant_type: 'B2B_LEAD',
            lead_id: String(lead.id),
            payment_type,
            notes: notes || '',
          },
          line_items: [
            {
              price_data: {
                currency: currency.toLowerCase(),
                product_data: {
                  name: itemName,
                  description:
                    'Anticipo inicial para formalizar arquitectura técnica y reserva de sprints. Saldo restante sujeto a hitos.',
                },
                unit_amount: amountCents,
              },
              quantity: 1,
            },
          ],
          mode: 'payment',
          success_url: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}&lead_id=${lead.id}&type=deposit`,
          cancel_url: `${baseUrl}/checkout/cancel?lead_id=${lead.id}`,
        });

        session = {
          id: stripeSession.id,
          url: stripeSession.url || `https://checkout.stripe.com/c/pay/${stripeSession.id}`,
          expires_at: stripeSession.expires_at,
        };
      }

      // Persist in lead_payments (DDL 041)
      const sanitizedNotes = notes ? escapeHtml(notes) : null;
      await query(
        `INSERT INTO lead_payments (lead_id, stripe_session_id, payment_type, amount_cents, currency, status, notes)
         VALUES (?, ?, ?, ?, ?, 'PENDING', ?)`,
        [leadId, session.id, payment_type, amountCents, currency, sanitizedNotes],
      );

      // Update lead deposit_status
      await query(
        `UPDATE leads SET deposit_status = 'PENDING', updated_at = NOW() WHERE id = ?`,
        [leadId],
      );

      // Register activity
      const activityTitle =
        payment_type === 'DEPOSIT_50'
          ? `Enlace de anticipo 50% generado`
          : `Enlace de pago personalizado generado`;
      const activityDetails = `Monto: $${amount.toLocaleString()} ${currency}. Sesión: ${session.id}`;

      await query(
        `INSERT INTO lead_activities (lead_id, user_id, activity_type, title, details)
         VALUES (?, ?, 'NOTE', ?, ?)`,
        [leadId, req.user!.userId, activityTitle, activityDetails],
      );

      res.status(201).json({
        status: 'success',
        message: 'Sesión de anticipo generada con éxito.',
        checkout_url: session.url,
        session_id: session.id,
        amount,
        amount_cents: amountCents,
        currency,
        expires_at: session.expires_at,
      });
    } catch (err: any) {
      res
        .status(500)
        .json({
          status: 'error',
          message: err.message || 'Error al generar sesión de pago para el prospecto.',
        });
    }
  },
);

/**
 * GET /api/v1/admin/leads/:id/payments
 * Returns payment history for a specific lead (FC 043 rev-2)
 */
adminRouter.get(
  '/leads/:id/payments',
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const leadId = parseInt(req.params.id, 10);
      if (isNaN(leadId) || leadId <= 0) {
        res.status(400).json({ status: 'error', message: 'ID de prospecto inválido.' });
        return;
      }

      const leadRows = await query<any[]>('SELECT id FROM leads WHERE id = ?', [leadId]);
      if (!leadRows || leadRows.length === 0) {
        res.status(404).json({ status: 'error', message: 'Prospecto no encontrado.' });
        return;
      }

      const payments = await query<any[]>(
        `SELECT id, lead_id, stripe_session_id, stripe_payment_intent_id, payment_type,
                amount_cents, currency, status, notes, paid_at, created_at, updated_at
         FROM lead_payments
         WHERE lead_id = ?
         ORDER BY created_at DESC`,
        [leadId],
      );

      res.json({
        status: 'success',
        payments,
      });
    } catch (err: any) {
      res
        .status(500)
        .json({ status: 'error', message: err.message || 'Error al consultar pagos del prospecto.' });
    }
  },
);

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
      [limit, offset],
    ).catch(() => []);

    const countResult = await query<any[]>(
      'SELECT COUNT(*) as total FROM security_audit_logs',
    ).catch(() => [{ total: 0 }]);
    const total = countResult[0]?.total || 0;

    res.json({
      status: 'success',
      page,
      limit,
      total,
      logs,
    });
  } catch (err: any) {
    res
      .status(500)
      .json({ status: 'error', message: err.message || 'Error al consultar logs de auditoría.' });
  }
});

/**
 * GET /api/v1/admin/metrics
 * Returns system administrative metrics (Condition C-M3)
 */
adminRouter.get('/metrics', async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const leadsCount = await query<any[]>('SELECT COUNT(*) as total FROM leads').catch(() => [
      { total: 0 },
    ]);
    const usersCount = await query<any[]>('SELECT COUNT(*) as total FROM users').catch(() => [
      { total: 0 },
    ]);

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
    res
      .status(500)
      .json({ status: 'error', message: err.message || 'Error al consultar métricas.' });
  }
});
