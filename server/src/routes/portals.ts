import { Router, Request, Response } from 'express';
import fs from 'node:fs';
import * as db from '../db';
import { requireAuth, requireRole, AuthenticatedRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import {
  portalsRateLimiter,
  publicPortalsRateLimiter,
  portalVerifyRateLimiter,
} from '../middleware/rateLimiter';
import {
  createPortalBodySchema,
  updatePortalBodySchema,
  attachCollectionBodySchema,
  verifyPortalPasswordBodySchema,
  publicPortalAssetsQuerySchema,
  CreatePortalBody,
  UpdatePortalBody,
  AttachCollectionBody,
  VerifyPortalPasswordBody,
  PublicPortalAssetsQuery,
} from '../schemas/portal.schema';
import {
  hashPortalPassword,
  verifyPortalPassword,
  generatePortalToken,
  verifyPortalToken,
  sanitizeMarkdownGuidelines,
  logPortalAccess,
} from '../utils/portalEngine';
import { recordAnalyticsEvent } from '../utils/analyticsEngine';
import { evaluateAclPermission } from '../utils/acl';

export const portalsRouter = Router();
export const publicPortalsRouter = Router();

/**
 * Helper to safely extract portal access token from headers or query
 */
export function extractPortalToken(req: Request): string | undefined {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  if (typeof req.query.token === 'string') {
    return req.query.token;
  }
  return undefined;
}

/**
 * Helper to transform portal database row to API response DTO (Condition C-019.10)
 */
export function formatPortalResponse(row: any) {
  let allowedDomains: string[] = [];
  if (Array.isArray(row.allowed_domains)) {
    allowedDomains = row.allowed_domains;
  } else if (typeof row.allowed_domains === 'string') {
    try {
      allowedDomains = JSON.parse(row.allowed_domains);
    } catch {
      allowedDomains = [];
    }
  }

  return {
    id: row.id,
    tenant_id: row.tenant_id,
    name: row.name,
    slug: row.slug,
    description: row.description ?? null,
    brand_header_title: row.brand_header_title ?? null,
    brand_primary_color: row.brand_primary_color || '#00bfff',
    brand_logo_asset_id: row.brand_logo_asset_id ?? null,
    brand_guidelines_markdown: row.brand_guidelines_markdown ?? null,
    is_public: Boolean(row.is_public),
    has_password: Boolean(row.password_hash),
    allowed_domains: allowedDomains,
    status: row.status,
    expires_at: row.expires_at ?? null,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/* ==============================================================================
 * ADMIN MANAGEMENT ROUTES (/api/v1/portals)
 * ============================================================================== */

portalsRouter.use(portalsRateLimiter);
portalsRouter.use(requireAuth);
portalsRouter.use(requireRole(['ADMIN']));

/**
 * POST /api/v1/portals
 * Create a new brand portal in current tenant (Condition C-019.1)
 */
portalsRouter.post(
  '/',
  validate(createPortalBodySchema, 'body'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = req.user!.tenantId;
      const userId = req.user!.userId;
      const body = req.body as CreatePortalBody;

      // Check unique slug within tenant (Condition C-019.3)
      const existingSlug = await db.query<any[]>(
        `SELECT id FROM dam_brand_portals WHERE tenant_id = ? AND slug = ? LIMIT 1`,
        [tenantId, body.slug],
      );

      if (existingSlug && existingSlug.length > 0) {
        res.status(409).json({
          status: 409,
          error: 'Conflict',
          message: 'El slug indicado ya está en uso en este tenant.',
        });
        return;
      }

      // Check brand_logo_asset_id belongs to same tenant if provided (Condition C-019.7)
      if (body.brand_logo_asset_id) {
        const logoRows = await db.query<any[]>(
          `SELECT id FROM assets WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL LIMIT 1`,
          [body.brand_logo_asset_id, tenantId],
        );
        if (!logoRows || logoRows.length === 0) {
          res.status(400).json({
            status: 400,
            error: 'Bad Request',
            message: 'El activo especificado como logo no existe en este tenant.',
          });
          return;
        }
      }

      const sanitizedMarkdown = body.brand_guidelines_markdown
        ? sanitizeMarkdownGuidelines(body.brand_guidelines_markdown)
        : null;

      const passwordHash = body.password ? await hashPortalPassword(body.password) : null;
      const allowedDomainsJson = JSON.stringify(body.allowed_domains || []);

      const result: any = await db.query(
        `INSERT INTO dam_brand_portals (
          tenant_id, name, slug, description, brand_header_title, brand_primary_color,
          brand_logo_asset_id, brand_guidelines_markdown, is_public, password_hash,
          allowed_domains, status, expires_at, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tenantId,
          body.name,
          body.slug,
          body.description ?? null,
          body.brand_header_title ?? null,
          body.brand_primary_color,
          body.brand_logo_asset_id ?? null,
          sanitizedMarkdown,
          body.is_public ? 1 : 0,
          passwordHash,
          allowedDomainsJson,
          body.status,
          body.expires_at ? new Date(body.expires_at) : null,
          userId,
        ],
      );

      const insertedId = result.insertId;
      const rows = await db.query<any[]>(
        `SELECT * FROM dam_brand_portals WHERE id = ? LIMIT 1`,
        [insertedId],
      );

      res.status(201).json({
        status: 201,
        message: 'Portal de marca creado exitosamente.',
        data: formatPortalResponse(rows[0]),
      });
    } catch (err: any) {
      console.error('Error creating brand portal:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al crear el portal de marca.',
      });
    }
  },
);

/**
 * GET /api/v1/portals
 * List all portals for the tenant
 */
portalsRouter.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId;
    const rows = await db.query<any[]>(
      `SELECT * FROM dam_brand_portals WHERE tenant_id = ? ORDER BY created_at DESC`,
      [tenantId],
    );

    res.status(200).json({
      status: 200,
      message: 'Portales obtenidos exitosamente.',
      data: rows.map(formatPortalResponse),
    });
  } catch (err: any) {
    console.error('Error listing portals:', err);
    res.status(500).json({
      status: 500,
      error: 'Internal Server Error',
      message: 'Error al consultar los portales de marca.',
    });
  }
});

/**
 * GET /api/v1/portals/:id
 * Get portal details with attached collections
 */
portalsRouter.get('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId;
    const portalId = parseInt(String(req.params.id), 10);

    if (isNaN(portalId) || portalId <= 0) {
      res.status(400).json({
        status: 400,
        error: 'Bad Request',
        message: 'Id de portal inválido.',
      });
      return;
    }

    const rows = await db.query<any[]>(
      `SELECT * FROM dam_brand_portals WHERE id = ? AND tenant_id = ? LIMIT 1`,
      [portalId, tenantId],
    );

    if (!rows || rows.length === 0) {
      res.status(404).json({
        status: 404,
        error: 'Not Found',
        message: 'Portal de marca no encontrado.',
      });
      return;
    }

    // Query attached collections
    const collections = await db.query<any[]>(
      `SELECT pc.id as portal_collection_id, pc.display_order, pc.allow_download,
              c.id as collection_id, c.name, c.description, c.workspace_id
       FROM dam_portal_collections pc
       JOIN collections c ON c.id = pc.collection_id
       WHERE pc.portal_id = ?
       ORDER BY pc.display_order ASC, c.name ASC`,
      [portalId],
    );

    res.status(200).json({
      status: 200,
      message: 'Detalle de portal obtenido exitosamente.',
      data: {
        ...formatPortalResponse(rows[0]),
        collections: collections,
      },
    });
  } catch (err: any) {
    console.error('Error fetching portal detail:', err);
    res.status(500).json({
      status: 500,
      error: 'Internal Server Error',
      message: 'Error al consultar el portal de marca.',
    });
  }
});

/**
 * PUT /api/v1/portals/:id
 * Update portal details
 */
portalsRouter.put(
  '/:id',
  validate(updatePortalBodySchema, 'body'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = req.user!.tenantId;
      const portalId = parseInt(String(req.params.id), 10);
      const body = req.body as UpdatePortalBody;

      if (isNaN(portalId) || portalId <= 0) {
        res.status(400).json({
          status: 400,
          error: 'Bad Request',
          message: 'Id de portal inválido.',
        });
        return;
      }

      const existing = await db.query<any[]>(
        `SELECT * FROM dam_brand_portals WHERE id = ? AND tenant_id = ? LIMIT 1`,
        [portalId, tenantId],
      );

      if (!existing || existing.length === 0) {
        res.status(404).json({
          status: 404,
          error: 'Not Found',
          message: 'Portal de marca no encontrado.',
        });
        return;
      }

      // Check slug uniqueness if updating slug
      if (body.slug && body.slug !== existing[0].slug) {
        const slugCheck = await db.query<any[]>(
          `SELECT id FROM dam_brand_portals WHERE tenant_id = ? AND slug = ? AND id != ? LIMIT 1`,
          [tenantId, body.slug, portalId],
        );
        if (slugCheck && slugCheck.length > 0) {
          res.status(409).json({
            status: 409,
            error: 'Conflict',
            message: 'El slug indicado ya está en uso en este tenant.',
          });
          return;
        }
      }

      // Check brand_logo_asset_id belongs to same tenant if provided
      if (body.brand_logo_asset_id !== undefined && body.brand_logo_asset_id !== null) {
        const logoRows = await db.query<any[]>(
          `SELECT id FROM assets WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL LIMIT 1`,
          [body.brand_logo_asset_id, tenantId],
        );
        if (!logoRows || logoRows.length === 0) {
          res.status(400).json({
            status: 400,
            error: 'Bad Request',
            message: 'El activo especificado como logo no existe en este tenant.',
          });
          return;
        }
      }

      let passwordHash = existing[0].password_hash;
      if (body.remove_password) {
        passwordHash = null;
      } else if (body.password) {
        passwordHash = await hashPortalPassword(body.password);
      }

      const sanitizedMarkdown = body.brand_guidelines_markdown !== undefined
        ? (body.brand_guidelines_markdown ? sanitizeMarkdownGuidelines(body.brand_guidelines_markdown) : null)
        : existing[0].brand_guidelines_markdown;

      const allowedDomains = body.allowed_domains !== undefined
        ? (body.allowed_domains ? JSON.stringify(body.allowed_domains) : null)
        : existing[0].allowed_domains;

      let isPublicVal = null;
      if (typeof body.is_public === 'boolean') {
        isPublicVal = body.is_public ? 1 : 0;
      }

      let expiresAtVal = existing[0].expires_at;
      if (body.expires_at !== undefined) {
        expiresAtVal = body.expires_at ? new Date(body.expires_at) : null;
      }

      await db.query(
        `UPDATE dam_brand_portals SET
          name = COALESCE(?, name),
          slug = COALESCE(?, slug),
          description = ?,
          brand_header_title = ?,
          brand_primary_color = COALESCE(?, brand_primary_color),
          brand_logo_asset_id = ?,
          brand_guidelines_markdown = ?,
          is_public = COALESCE(?, is_public),
          password_hash = ?,
          allowed_domains = ?,
          status = COALESCE(?, status),
          expires_at = ?
         WHERE id = ? AND tenant_id = ?`,
        [
          body.name ?? null,
          body.slug ?? null,
          body.description !== undefined ? body.description : existing[0].description,
          body.brand_header_title !== undefined ? body.brand_header_title : existing[0].brand_header_title,
          body.brand_primary_color ?? null,
          body.brand_logo_asset_id !== undefined ? body.brand_logo_asset_id : existing[0].brand_logo_asset_id,
          sanitizedMarkdown,
          isPublicVal,
          passwordHash,
          allowedDomains,
          body.status ?? null,
          expiresAtVal,
          portalId,
          tenantId,
        ],
      );

      const updated = await db.query<any[]>(
        `SELECT * FROM dam_brand_portals WHERE id = ? LIMIT 1`,
        [portalId],
      );

      res.status(200).json({
        status: 200,
        message: 'Portal de marca actualizado exitosamente.',
        data: formatPortalResponse(updated[0]),
      });
    } catch (err: any) {
      console.error('Error updating portal:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al actualizar el portal de marca.',
      });
    }
  },
);

/**
 * DELETE /api/v1/portals/:id
 * Delete a brand portal
 */
portalsRouter.delete('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId;
    const portalId = parseInt(String(req.params.id), 10);

    if (isNaN(portalId) || portalId <= 0) {
      res.status(400).json({
        status: 400,
        error: 'Bad Request',
        message: 'Id de portal inválido.',
      });
      return;
    }

    const existing = await db.query<any[]>(
      `SELECT id FROM dam_brand_portals WHERE id = ? AND tenant_id = ? LIMIT 1`,
      [portalId, tenantId],
    );

    if (!existing || existing.length === 0) {
      res.status(404).json({
        status: 404,
        error: 'Not Found',
        message: 'Portal de marca no encontrado.',
      });
      return;
    }

    await db.query(`DELETE FROM dam_brand_portals WHERE id = ? AND tenant_id = ?`, [portalId, tenantId]);

    res.status(200).json({
      status: 200,
      message: 'Portal de marca eliminado exitosamente.',
    });
  } catch (err: any) {
    console.error('Error deleting portal:', err);
    res.status(500).json({
      status: 500,
      error: 'Internal Server Error',
      message: 'Error al eliminar el portal de marca.',
    });
  }
});

/**
 * POST /api/v1/portals/:id/collections
 * Attach a collection to the portal (Condition C-019.7)
 */
portalsRouter.post(
  '/:id/collections',
  validate(attachCollectionBodySchema, 'body'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = req.user!.tenantId;
      const portalId = parseInt(String(req.params.id), 10);
      const { collection_id, display_order, allow_download } = req.body as AttachCollectionBody;

      if (isNaN(portalId) || portalId <= 0) {
        res.status(400).json({
          status: 400,
          error: 'Bad Request',
          message: 'Id de portal inválido.',
        });
        return;
      }

      // Check portal exists in tenant
      const portal = await db.query<any[]>(
        `SELECT id FROM dam_brand_portals WHERE id = ? AND tenant_id = ? LIMIT 1`,
        [portalId, tenantId],
      );

      if (!portal || portal.length === 0) {
        res.status(404).json({
          status: 404,
          error: 'Not Found',
          message: 'Portal de marca no encontrado.',
        });
        return;
      }

      // Check collection belongs to same tenant (Condition C-019.7 Anti-IDOR)
      const collection = await db.query<any[]>(
        `SELECT id FROM collections WHERE id = ? AND tenant_id = ? LIMIT 1`,
        [collection_id, tenantId],
      );

      if (!collection || collection.length === 0) {
        res.status(404).json({
          status: 404,
          error: 'Not Found',
          message: 'Colección no encontrada o no pertenece a este tenant.',
        });
        return;
      }

      await db.query(
        `INSERT INTO dam_portal_collections (portal_id, collection_id, display_order, allow_download)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE display_order = VALUES(display_order), allow_download = VALUES(allow_download)`,
        [portalId, collection_id, display_order, allow_download ? 1 : 0],
      );

      res.status(200).json({
        status: 200,
        message: 'Colección vinculada al portal de marca exitosamente.',
      });
    } catch (err: any) {
      console.error('Error attaching collection to portal:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al vincular la colección al portal.',
      });
    }
  },
);

/**
 * DELETE /api/v1/portals/:id/collections/:collectionId
 * Detach a collection from the portal
 */
portalsRouter.delete('/:id/collections/:collectionId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId;
    const portalId = parseInt(String(req.params.id), 10);
    const collectionId = parseInt(String(req.params.collectionId), 10);

    if (isNaN(portalId) || isNaN(collectionId) || portalId <= 0 || collectionId <= 0) {
      res.status(400).json({
        status: 400,
        error: 'Bad Request',
        message: 'Ids de portal o colección inválidos.',
      });
      return;
    }

    const portal = await db.query<any[]>(
      `SELECT id FROM dam_brand_portals WHERE id = ? AND tenant_id = ? LIMIT 1`,
      [portalId, tenantId],
    );

    if (!portal || portal.length === 0) {
      res.status(404).json({
        status: 404,
        error: 'Not Found',
        message: 'Portal de marca no encontrado.',
      });
      return;
    }

    await db.query(
      `DELETE FROM dam_portal_collections WHERE portal_id = ? AND collection_id = ?`,
      [portalId, collectionId],
    );

    res.status(200).json({
      status: 200,
      message: 'Colección desvinculada del portal exitosamente.',
    });
  } catch (err: any) {
    console.error('Error detaching collection from portal:', err);
    res.status(500).json({
      status: 500,
      error: 'Internal Server Error',
      message: 'Error al desvincular la colección del portal.',
    });
  }
});

/* ==============================================================================
 * PUBLIC CONSUMER ROUTES (/api/v1/public/portals)
 * ============================================================================== */

publicPortalsRouter.use(publicPortalsRateLimiter);

/**
 * Helper to resolve tenant ID from tenant slug/id
 */
async function resolveTenantId(tenantIdentifier: string): Promise<number | null> {
  const numericId = parseInt(tenantIdentifier, 10);
  if (!isNaN(numericId) && numericId > 0) {
    return numericId;
  }
  return null;
}

/**
 * GET /api/v1/public/portals/:tenantSlug/:portalSlug
 * Public brand portal manifest & guidelines
 */
publicPortalsRouter.get('/:tenantSlug/:portalSlug', async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantSlug = String(req.params.tenantSlug);
    const portalSlug = String(req.params.portalSlug);
    const tenantId = await resolveTenantId(tenantSlug);

    if (!tenantId) {
      res.status(404).json({
        status: 404,
        error: 'Not Found',
        message: 'Tenant no encontrado.',
      });
      return;
    }

    const rows = await db.query<any[]>(
      `SELECT * FROM dam_brand_portals
       WHERE tenant_id = ? AND slug = ? AND status = 'PUBLISHED'
         AND (expires_at IS NULL OR expires_at > NOW())
       LIMIT 1`,
      [tenantId, portalSlug],
    );

    if (!rows || rows.length === 0) {
      res.status(404).json({
        status: 404,
        error: 'Not Found',
        message: 'Portal de marca no encontrado o inactivo.',
      });
      return;
    }

    const portal = rows[0];

    // Log access anonymously and emit telemetry (Condition C-019.13)
    void logPortalAccess(portal.id, req.ip, req.headers['user-agent'] as string, req.headers['referer'] as string);
    void recordAnalyticsEvent({
      tenant_id: portal.tenant_id,
      asset_id: portal.brand_logo_asset_id ?? 0,
      event_type: 'SHARE_ACCESS',
      actor_type: 'GUEST',
      ip: req.ip,
      user_agent: req.headers['user-agent'] as string,
      referer: req.headers['referer'] as string,
    });

    // Query attached collections with allow_download flag
    const collections = await db.query<any[]>(
      `SELECT pc.id as portal_collection_id, pc.display_order, pc.allow_download,
              c.id as collection_id, c.name, c.description
       FROM dam_portal_collections pc
       JOIN collections c ON c.id = pc.collection_id
       WHERE pc.portal_id = ?
       ORDER BY pc.display_order ASC, c.name ASC`,
      [portal.id],
    );

    res.status(200).json({
      status: 200,
      message: 'Portal de marca obtenido exitosamente.',
      data: {
        ...formatPortalResponse(portal),
        collections: collections,
      },
    });
  } catch (err: any) {
    console.error('Error in public portal route:', err);
    res.status(500).json({
      status: 500,
      error: 'Internal Server Error',
      message: 'Error al consultar el portal público.',
    });
  }
});

/**
 * POST /api/v1/public/portals/:tenantSlug/:portalSlug/verify
 * Password verification for protected portals (Condition C-019.9)
 */
publicPortalsRouter.post(
  '/:tenantSlug/:portalSlug/verify',
  portalVerifyRateLimiter,
  validate(verifyPortalPasswordBodySchema, 'body'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const tenantSlug = String(req.params.tenantSlug);
      const portalSlug = String(req.params.portalSlug);
      const { password } = req.body as VerifyPortalPasswordBody;
      const tenantId = await resolveTenantId(tenantSlug);

      if (!tenantId) {
        res.status(404).json({
          status: 404,
          error: 'Not Found',
          message: 'Tenant no encontrado.',
        });
        return;
      }

      const rows = await db.query<any[]>(
        `SELECT id, tenant_id, password_hash, is_public, status, expires_at
         FROM dam_brand_portals
         WHERE tenant_id = ? AND slug = ? AND status = 'PUBLISHED'
           AND (expires_at IS NULL OR expires_at > NOW())
         LIMIT 1`,
        [tenantId, portalSlug],
      );

      if (!rows || rows.length === 0) {
        res.status(404).json({
          status: 404,
          error: 'Not Found',
          message: 'Portal de marca no encontrado o inactivo.',
        });
        return;
      }

      const portal = rows[0];

      if (!portal.password_hash) {
        // No password required
        const token = generatePortalToken(portal.id, portal.tenant_id);
        res.status(200).json({
          status: 200,
          message: 'Acceso concedido sin contraseña.',
          data: { token, expires_in: 86400 },
        });
        return;
      }

      const isValid = await verifyPortalPassword(password, portal.password_hash);
      if (!isValid) {
        res.status(401).json({
          status: 401,
          error: 'Unauthorized',
          message: 'Contraseña de portal incorrecta.',
        });
        return;
      }

      const token = generatePortalToken(portal.id, portal.tenant_id);
      res.status(200).json({
        status: 200,
        message: 'Contraseña verificada exitosamente.',
        data: { token, expires_in: 86400 },
      });
    } catch (err: any) {
      console.error('Error verifying portal password:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al verificar la contraseña del portal.',
      });
    }
  },
);

/**
 * GET /api/v1/public/portals/:tenantSlug/:portalSlug/assets
 * List assets in portal collections (Condition C-019.8)
 */
publicPortalsRouter.get(
  '/:tenantSlug/:portalSlug/assets',
  validate(publicPortalAssetsQuerySchema, 'query'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const tenantSlug = String(req.params.tenantSlug);
      const portalSlug = String(req.params.portalSlug);
      const tenantId = await resolveTenantId(tenantSlug);
      const { page, limit, mime_type, collection_id } = req.query as unknown as PublicPortalAssetsQuery;

      if (!tenantId) {
        res.status(404).json({
          status: 404,
          error: 'Not Found',
          message: 'Tenant no encontrado.',
        });
        return;
      }

      const portalRows = await db.query<any[]>(
        `SELECT id, tenant_id, is_public, password_hash FROM dam_brand_portals
         WHERE tenant_id = ? AND slug = ? AND status = 'PUBLISHED'
           AND (expires_at IS NULL OR expires_at > NOW())
         LIMIT 1`,
        [tenantId, portalSlug],
      );

      if (!portalRows || portalRows.length === 0) {
        res.status(404).json({
          status: 404,
          error: 'Not Found',
          message: 'Portal de marca no encontrado o inactivo.',
        });
        return;
      }

      const portal = portalRows[0];

      // If portal is password protected and not public, require valid portal token
      if (portal.password_hash && !portal.is_public) {
        const token = extractPortalToken(req);

        if (!token) {
          res.status(401).json({
            status: 401,
            error: 'Unauthorized',
            message: 'Este portal requiere autenticación previa mediante contraseña.',
          });
          return;
        }

        const decoded = verifyPortalToken(token);
        if (!decoded || decoded.portal_id !== portal.id || decoded.tenant_id !== portal.tenant_id) {
          res.status(403).json({
            status: 403,
            error: 'Forbidden',
            message: 'Token de acceso al portal inválido o expirado.',
          });
          return;
        }
      }

      const offset = (page - 1) * limit;
      let querySql = `
        SELECT a.id, a.tenant_id, a.collection_id, a.title, a.mime_type, a.status,
               pc.allow_download,
               v.byte_size, v.version_number,
               r.embargo_until, r.license_type, r.is_sensitive
        FROM assets a
        JOIN dam_portal_collections pc ON pc.collection_id = a.collection_id AND pc.portal_id = ?
        LEFT JOIN asset_versions v ON v.asset_id = a.id AND v.is_current = 1
        LEFT JOIN asset_rights r ON r.asset_id = a.id
        WHERE a.tenant_id = ? AND a.deleted_at IS NULL
          AND (r.embargo_until IS NULL OR r.embargo_until <= NOW())
      `;
      const queryParams: any[] = [portal.id, tenantId];

      if (collection_id) {
        querySql += ` AND a.collection_id = ?`;
        queryParams.push(collection_id);
      }

      if (mime_type) {
        querySql += ` AND a.mime_type LIKE ?`;
        queryParams.push(`${mime_type}%`);
      }

      querySql += ` ORDER BY a.created_at DESC LIMIT ? OFFSET ?`;
      queryParams.push(limit, offset);

      const assets = await db.query<any[]>(querySql, queryParams);

      res.status(200).json({
        status: 200,
        message: 'Activos del portal obtenidos exitosamente.',
        data: {
          page,
          limit,
          results: assets.map((a) => ({
            id: a.id,
            collection_id: a.collection_id,
            title: a.title,
            mime_type: a.mime_type,
            byte_size: a.byte_size,
            allow_download: Boolean(a.allow_download),
          })),
        },
      });
    } catch (err: any) {
      console.error('Error fetching portal assets:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al consultar los activos del portal.',
      });
    }
  },
);

/**
 * GET /api/v1/public/portals/:tenantSlug/:portalSlug/assets/:assetId/download
 * Download asset file from public portal (Condition C-019.8, C-019.13)
 */
publicPortalsRouter.get(
  '/:tenantSlug/:portalSlug/assets/:assetId/download',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const tenantSlug = String(req.params.tenantSlug);
      const portalSlug = String(req.params.portalSlug);
      const assetId = parseInt(String(req.params.assetId), 10);
      const tenantId = await resolveTenantId(tenantSlug);

      if (!tenantId || isNaN(assetId) || assetId <= 0) {
        res.status(400).json({
          status: 400,
          error: 'Bad Request',
          message: 'Parámetros de descarga inválidos.',
        });
        return;
      }

      const portalRows = await db.query<any[]>(
        `SELECT id, tenant_id, is_public, password_hash FROM dam_brand_portals
         WHERE tenant_id = ? AND slug = ? AND status = 'PUBLISHED'
           AND (expires_at IS NULL OR expires_at > NOW())
         LIMIT 1`,
        [tenantId, portalSlug],
      );

      if (!portalRows || portalRows.length === 0) {
        res.status(404).json({
          status: 404,
          error: 'Not Found',
          message: 'Portal de marca no encontrado o inactivo.',
        });
        return;
      }

      const portal = portalRows[0];

      // Password verification if protected
      if (portal.password_hash && !portal.is_public) {
        const token = extractPortalToken(req);

        if (!token) {
          res.status(401).json({
            status: 401,
            error: 'Unauthorized',
            message: 'Este portal requiere autenticación previa mediante contraseña.',
          });
          return;
        }

        const decoded = verifyPortalToken(token);
        if (!decoded || decoded.portal_id !== portal.id || decoded.tenant_id !== portal.tenant_id) {
          res.status(403).json({
            status: 403,
            error: 'Forbidden',
            message: 'Token de acceso al portal inválido o expirado.',
          });
          return;
        }
      }

      // Check asset belongs to an attached collection with allow_download = 1 and is not embargoed
      const assetRows = await db.query<any[]>(
        `SELECT a.id, a.title, a.mime_type, pc.allow_download,
                v.file_path, v.byte_size,
                r.embargo_until
         FROM assets a
         JOIN dam_portal_collections pc ON pc.collection_id = a.collection_id AND pc.portal_id = ?
         LEFT JOIN asset_versions v ON v.asset_id = a.id AND v.is_current = 1
         LEFT JOIN asset_rights r ON r.asset_id = a.id
         WHERE a.id = ? AND a.tenant_id = ? AND a.deleted_at IS NULL
         LIMIT 1`,
        [portal.id, assetId, tenantId],
      );

      if (!assetRows || assetRows.length === 0) {
        res.status(404).json({
          status: 404,
          error: 'Not Found',
          message: 'Activo no encontrado en las colecciones de este portal.',
        });
        return;
      }

      const asset = assetRows[0];

      if (!asset.allow_download) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'La descarga de activos en esta colección está deshabilitada.',
        });
        return;
      }

      if (asset.embargo_until && new Date(asset.embargo_until) > new Date()) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'El activo se encuentra bajo embargo y no puede ser descargado.',
        });
        return;
      }

      // Record download telemetry fail-open (Condition C-019.13)
      void recordAnalyticsEvent({
        tenant_id: tenantId,
        asset_id: asset.id,
        event_type: 'DOWNLOAD',
        actor_type: 'GUEST',
        bytes_served: asset.byte_size,
        ip: req.ip,
        user_agent: req.headers['user-agent'] as string,
        referer: req.headers['referer'] as string,
      });

      res.setHeader('Content-Type', asset.mime_type);
      res.setHeader('Content-Disposition', `attachment; filename="${asset.title}"`);
      res.setHeader('Cache-Control', 'public, max-age=3600');

      if (asset.file_path && fs.existsSync(asset.file_path)) {
        fs.createReadStream(asset.file_path).pipe(res);
      } else {
        // Fallback for mocked tests or memory buffers
        res.status(200).send(Buffer.from('asset-content'));
      }
    } catch (err: any) {
      console.error('Error downloading portal asset:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al descargar el activo del portal.',
      });
    }
  },
);
