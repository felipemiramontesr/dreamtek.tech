import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { tagsRateLimiter } from '../middleware/rateLimiter';
import { validate } from '../middleware/validate';
import { createTagSchema } from '../schemas/tag.schema';
import { logSecurityEvent } from '../middleware/auditLogger';
import { query } from '../db';

export const tagsRouter = Router();

export function getActorTenantId(req: AuthenticatedRequest): number {
  const userId = Number(req.user?.userId);
  if (!userId || isNaN(userId)) {
    throw new Error('Invalid authenticated user context.');
  }
  return userId;
}

/**
 * GET /api/v1/tags
 * List all tags for the authenticated tenant with asset count.
 */
tagsRouter.get(
  '/',
  tagsRateLimiter,
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = getActorTenantId(req);

      const tags = await query<any[]>(
        `SELECT t.id, t.name, t.color, t.created_at,
                COUNT(DISTINCT at.asset_id) as asset_count
         FROM tags t
         LEFT JOIN asset_tags at ON at.tag_id = t.id
         LEFT JOIN assets a ON a.id = at.asset_id AND a.deleted_at IS NULL
         WHERE t.tenant_id = ?
         GROUP BY t.id, t.name, t.color, t.created_at
         ORDER BY t.name ASC`,
        [tenantId],
      );

      res.status(200).json({
        status: 200,
        data: tags.map((t) => ({
          id: t.id,
          name: t.name,
          color: t.color,
          createdAt: t.created_at,
          assetCount: Number(t.asset_count || 0),
        })),
      });
    } catch (err: any) {
      console.error('List tags error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al consultar las etiquetas.',
      });
    }
  },
);

/**
 * POST /api/v1/tags
 * Create a new tag for the authenticated tenant.
 */
tagsRouter.post(
  '/',
  tagsRateLimiter,
  requireAuth,
  validate(createTagSchema),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = getActorTenantId(req);
      const { name, color = '#00bfff' } = req.body;

      // Check unique constraint per tenant
      const existing = await query<any[]>('SELECT id FROM tags WHERE tenant_id = ? AND name = ?', [
        tenantId,
        name,
      ]);

      if (existing && existing.length > 0) {
        res.status(409).json({
          status: 409,
          error: 'Conflict',
          message: `La etiqueta "${name}" ya existe en este tenant.`,
        });
        return;
      }

      const insertRes = await query<any>(
        'INSERT INTO tags (tenant_id, name, color) VALUES (?, ?, ?)',
        [tenantId, name, color],
      );

      const tagId = Number(insertRes.insertId);

      await logSecurityEvent(req, {
        eventType: 'TAG_CREATED',
        userId: Number(req.user?.userId),
        status: 'SUCCESS',
        details: `Created tag ID ${tagId} (${name}) for tenant ${tenantId}`,
      });

      res.status(201).json({
        status: 201,
        message: 'Etiqueta creada exitosamente.',
        data: {
          id: tagId,
          name,
          color,
        },
      });
    } catch (err: any) {
      console.error('Create tag error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al crear la etiqueta.',
      });
    }
  },
);
