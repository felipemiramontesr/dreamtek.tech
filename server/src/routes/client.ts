import { Router, Response } from 'express';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import { query } from '../db.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { clientBriefingSchema } from '../schemas/project.schema.js';
import { escapeHtml } from '../utils/crm.js';

export const clientRouter = Router();

// Rate limiter for briefing updates (15 req/min per IP)
export const clientBriefingRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    error: 'Too Many Requests',
    message: 'Demasiadas solicitudes de actualización de briefing. Intenta de nuevo en un momento.',
  },
});

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

    // Query client projects and milestones (FC 044 / Condition C-044)
    let projects: any[] = [];
    try {
      const projectRows = await query<any[]>(
        `SELECT id, tenant_id, user_id, lead_id, project_name, vertical, status,
                currency, budget_cents, paid_amount_cents, pending_balance_cents,
                estimated_weeks, briefing_data, staging_url, repository_url,
                created_at, updated_at
         FROM client_projects
         WHERE user_id = ?
         ORDER BY created_at DESC`,
        [userId],
      );

      for (const proj of projectRows) {
        const milestones = await query<any[]>(
          `SELECT id, project_id, milestone_index, title, description, target_week, status, completed_at
           FROM client_project_milestones
           WHERE project_id = ?
           ORDER BY milestone_index ASC`,
          [proj.id],
        ).catch(() => []);

        const completedCount = milestones.filter((m) => m.status === 'COMPLETED').length;
        const progressPercent =
          milestones.length > 0 ? Math.round((completedCount / milestones.length) * 100) : 0;

        let parsedBriefing = null;
        if (proj.briefing_data) {
          try {
            parsedBriefing =
              typeof proj.briefing_data === 'string'
                ? JSON.parse(proj.briefing_data)
                : proj.briefing_data;
          } catch {
            parsedBriefing = proj.briefing_data;
          }
        }

        projects.push({
          ...proj,
          briefing_data: parsedBriefing,
          milestones,
          progress_percent: progressPercent,
        });
      }
    } catch (projErr: any) {
      console.error('⚠️ client_projects DB query warning:', projErr?.message || projErr);
      projects = [];
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
      projects,
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

/**
 * GET /api/v1/client/projects/:id
 * Anti-IDOR: Returns B2B project detail with milestones and progress (Condition C-044.7)
 */
clientRouter.get(
  '/projects/:id',
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?.userId;
      const projectId = parseInt(req.params.id, 10);

      if (isNaN(projectId) || projectId <= 0) {
        res.status(400).json({ status: 'error', message: 'ID de proyecto inválido.' });
        return;
      }

      const projectRows = await query<any[]>(
        `SELECT id, tenant_id, user_id, lead_id, project_name, vertical, status,
              currency, budget_cents, paid_amount_cents, pending_balance_cents,
              estimated_weeks, briefing_data, staging_url, repository_url,
              created_at, updated_at
       FROM client_projects
       WHERE id = ? AND user_id = ?
       LIMIT 1`,
        [projectId, userId],
      );

      if (!projectRows || projectRows.length === 0) {
        res
          .status(404)
          .json({ status: 'error', error: 'Not Found', message: 'Proyecto no encontrado.' });
        return;
      }

      const proj = projectRows[0];
      const milestones = await query<any[]>(
        `SELECT id, project_id, milestone_index, title, description, target_week, status, completed_at
       FROM client_project_milestones
       WHERE project_id = ?
       ORDER BY milestone_index ASC`,
        [proj.id],
      ).catch(() => []);

      const completedCount = milestones.filter((m) => m.status === 'COMPLETED').length;
      const progressPercent =
        milestones.length > 0 ? Math.round((completedCount / milestones.length) * 100) : 0;

      let parsedBriefing = null;
      if (proj.briefing_data) {
        try {
          parsedBriefing =
            typeof proj.briefing_data === 'string'
              ? JSON.parse(proj.briefing_data)
              : proj.briefing_data;
        } catch {
          parsedBriefing = proj.briefing_data;
        }
      }

      res.json({
        status: 'success',
        project: {
          ...proj,
          briefing_data: parsedBriefing,
          milestones,
          progress_percent: progressPercent,
        },
      });
    } catch (err: any) {
      res
        .status(500)
        .json({ status: 'error', message: err.message || 'Error al consultar proyecto.' });
    }
  },
);

/**
 * PUT /api/v1/client/projects/:id/briefing
 * Anti-IDOR + Anti-XSS: Updates briefing data (Conditions C-044.4, C-044.7, OWASP A03)
 */
clientRouter.put(
  '/projects/:id/briefing',
  clientBriefingRateLimiter,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?.userId;
      const projectId = parseInt(req.params.id, 10);

      if (isNaN(projectId) || projectId <= 0) {
        res.status(400).json({ status: 'error', message: 'ID de proyecto inválido.' });
        return;
      }

      // Check project existence & ownership (Anti-IDOR)
      const projectRows = await query<any[]>(
        'SELECT id, status FROM client_projects WHERE id = ? AND user_id = ? LIMIT 1',
        [projectId, userId],
      );

      if (!projectRows || projectRows.length === 0) {
        res
          .status(404)
          .json({ status: 'error', error: 'Not Found', message: 'Proyecto no encontrado.' });
        return;
      }

      const parsed = clientBriefingSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          status: 'error',
          error: 'Validation Error',
          details: parsed.error.format(),
        });
        return;
      }

      const {
        business_goals,
        target_audience,
        technical_stack_preferences,
        infrastructure_notes,
        reference_urls,
        contact_lead_notes,
      } = parsed.data;

      // Sanitización anti-XSS (C-044 / A03)
      const sanitizedBriefing = {
        business_goals: escapeHtml(business_goals),
        target_audience: escapeHtml(target_audience || ''),
        technical_stack_preferences: escapeHtml(technical_stack_preferences || ''),
        infrastructure_notes: escapeHtml(infrastructure_notes || ''),
        reference_urls,
        contact_lead_notes: escapeHtml(contact_lead_notes || ''),
        submitted_at: new Date().toISOString(),
      };

      const currentStatus = projectRows[0].status;
      const newStatus =
        currentStatus === 'ONBOARDING_BRIEF' ? 'ARCHITECTURE_DESIGN' : currentStatus;

      await query(
        `UPDATE client_projects
         SET briefing_data = ?, status = ?, updated_at = NOW()
         WHERE id = ? AND user_id = ?`,
        [JSON.stringify(sanitizedBriefing), newStatus, projectId, userId],
      );

      res.json({
        status: 'success',
        message: 'Briefing técnico actualizado con éxito.',
        briefing: sanitizedBriefing,
        status_updated: newStatus,
      });
    } catch (err: any) {
      res
        .status(500)
        .json({ status: 'error', message: err.message || 'Error al actualizar el briefing.' });
    }
  },
);

/**
 * POST /api/v1/client/sso/archon
 * Generates an HMAC-SHA256 signed access link for ARCHON ERP Fleet Management
 * Condition C-038: dedicated ARCHON_SSO_SECRET, 300s TTL, strict allowlist against open-redirect
 */
export function getArchonSsoSecret(): string {
  const secret = process.env.ARCHON_SSO_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('ARCHON_SSO_SECRET must be explicitly set in production');
    }
    return 'dreamtek_archon_hmac_secret_2026';
  }
  return secret;
}

const ARCHON_ALLOWLIST = [
  'https://fleet.archon.dreamtek.tech',
  'https://archon.dreamtek.tech',
  'http://localhost:3001',
];

clientRouter.post(
  '/sso/archon',
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?.userId;
      const userRole = req.user?.role;

      // Check if user has active ARCHON subscription or is ADMIN
      let hasAccess = userRole === 'ADMIN';
      if (!hasAccess) {
        const subs = await query<any[]>(
          'SELECT id FROM subscriptions WHERE user_id = ? AND plan_id LIKE "%archon%" AND status = "active"',
          [userId],
        ).catch(() => []);
        hasAccess = subs.length > 0;
      }

      if (!hasAccess) {
        res.status(403).json({
          status: 'error',
          error: 'Forbidden',
          message: 'No cuenta con una suscripción activa a ARCHON Gestión de Flotas.',
        });
        return;
      }

      const baseUrl = process.env.ARCHON_BASE_URL || 'https://fleet.archon.dreamtek.tech';
      if (!ARCHON_ALLOWLIST.includes(baseUrl)) {
        res.status(400).json({
          status: 'error',
          error: 'Security Error',
          message: 'Base URL de destino no autorizada en allowlist.',
        });
        return;
      }

      const timestamp = Math.floor(Date.now() / 1000);
      const expiresAt = timestamp + 300; // 5 minutos
      const secret = getArchonSsoSecret();
      const payload = `${userId}:${userRole}:${expiresAt}`;
      const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

      const signedUrl = `${baseUrl}/auth/bridge?uid=${userId}&role=${userRole}&exp=${expiresAt}&sig=${signature}`;

      res.json({
        status: 'success',
        type: 'HMAC_LINK',
        url: signedUrl,
        expires_in: 300,
      });
    } catch (err: any) {
      res.status(500).json({
        status: 'error',
        message: err.message || 'Error al generar enlace seguro para ARCHON.',
      });
    }
  },
);
