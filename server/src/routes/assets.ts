import { Router, Response } from 'express';
import crypto from 'node:crypto';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { uploadRateLimiter } from '../middleware/rateLimiter';
import { validate } from '../middleware/validate';
import { createShareSchema } from '../schemas/share.schema';
import { logSecurityEvent } from '../middleware/auditLogger';
import { query } from '../db';
import { validateMagicBytes } from '../utils/magicBytes';
import {
  STORAGE_ROOT,
  assertPathContained,
  computeBufferSha256,
  getOrCreateDefaultWorkspace,
  generateWebPDerivatives,
} from '../utils/storage';

const router = Router();

// Configure multer memory storage with 50 MB limit
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB
  },
});

/**
 * Helper to get or assert tenantId for an authenticated user.
 * In AS-IS bridge, userId corresponds to the actor's primary tenant.
 */
export function getActorTenantId(req: AuthenticatedRequest): number {
  const userId = Number(req.user?.userId);
  if (!userId || isNaN(userId)) {
    throw new Error('Invalid authenticated user context.');
  }
  return userId;
}

/**
 * POST /api/v1/assets/upload
 * Secure asset ingestion endpoint backed by Hostinger NVMe storage.
 */
router.post(
  '/upload',
  uploadRateLimiter,
  requireAuth,
  upload.single('file'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.file || !req.file.buffer) {
        res.status(400).json({
          status: 400,
          error: 'Bad Request',
          message: 'No se proporcionó ningún archivo para la carga.',
        });
        return;
      }

      // 1. Magic Bytes & MIME Type Validation (OWASP A03/A05)
      const validatedMime = validateMagicBytes(req.file.buffer);
      if (!validatedMime) {
        await logSecurityEvent(req, {
          eventType: 'ASSET_UPLOAD_BLOCKED',
          userId: Number(req.user?.userId),
          status: 'BLOCKED',
          details: `Rejected disallowed magic bytes / MIME for file: ${req.file.originalname}`,
        });

        res.status(400).json({
          status: 400,
          error: 'Bad Request',
          message: 'Tipo de archivo no permitido o contenido malicioso detectado.',
        });
        return;
      }

      const tenantId = getActorTenantId(req);
      const actorId = Number(req.user?.userId);

      // 2. Auto-bootstrap Workspace and Collection
      const { workspaceId, collectionId } = await getOrCreateDefaultWorkspace(tenantId);

      // 3. Compute SHA-256 Checksum (OWASP A02)
      const sha256Hash = computeBufferSha256(req.file.buffer);
      const originalTitle = path.basename(req.file.originalname);

      // 4. Insert Asset Record
      const assetInsertRes = await query<any>(
        `INSERT INTO assets (tenant_id, workspace_id, collection_id, title, mime_type, status)
         VALUES (?, ?, ?, ?, ?, 'ACTIVE')`,
        [tenantId, workspaceId, collectionId, originalTitle, validatedMime.mime]
      );
      const assetId = assetInsertRes.insertId;

      // 5. Build Storage Path & Write Original Binary
      const assetDir = path.join(
        STORAGE_ROOT,
        'tenants',
        String(tenantId),
        'assets',
        String(assetId)
      );

      fs.mkdirSync(assetDir, { recursive: true });

      const originalFileName = `v1_${sha256Hash}.${validatedMime.ext}`;
      const originalFilePath = path.join(assetDir, originalFileName);
      assertPathContained(originalFilePath);

      fs.writeFileSync(originalFilePath, req.file.buffer);

      // 6. Insert Asset Version Record
      const versionInsertRes = await query<any>(
        `INSERT INTO asset_versions (asset_id, version_number, byte_size, sha256_hash, file_path, created_by)
         VALUES (?, 1, ?, ?, ?, ?)`,
        [assetId, req.file.buffer.length, sha256Hash, originalFilePath, actorId]
      );
      const versionId = versionInsertRes.insertId;

      // 7. Generate Derivatives (Thumbnails with sharp)
      const derivativesDir = path.join(assetDir, 'derivatives');
      const generatedDerivatives = await generateWebPDerivatives(
        req.file.buffer,
        validatedMime.mime,
        derivativesDir
      );

      for (const d of generatedDerivatives) {
        await query<any>(
          `INSERT INTO asset_derivatives (version_id, derivative_type, width, height, byte_size, file_path)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [versionId, d.derivativeType, d.width, d.height, d.byteSize, d.filePath]
        );
      }

      // 8. Audit Log Event (OWASP A09)
      await logSecurityEvent(req, {
        eventType: 'ASSET_UPLOAD',
        userId: actorId,
        status: 'SUCCESS',
        details: `Uploaded asset ID ${assetId} (${originalTitle}) [${sha256Hash}]`,
      });

      res.status(201).json({
        status: 201,
        message: 'Activo digital cargado exitosamente en almacenamiento NVMe.',
        data: {
          assetId,
          versionId,
          title: originalTitle,
          mimeType: validatedMime.mime,
          byteSize: req.file.buffer.length,
          sha256: sha256Hash,
          derivativesCount: generatedDerivatives.length,
        },
      });
    } catch (err: any) {
      console.error('Asset upload error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al procesar la carga del activo digital.',
      });
    }
  }
);

/**
 * GET /api/v1/assets
 * List paginated active assets for the authenticated tenant.
 */
router.get(
  '/',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = getActorTenantId(req);
      const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
      const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit || '20'), 10)));
      const offset = (page - 1) * limit;

      const assets = await query<any[]>(
        `SELECT a.id, a.tenant_id, a.workspace_id, a.collection_id, a.title, a.mime_type, a.created_at,
                v.id as current_version_id, v.version_number, v.byte_size, v.sha256_hash
         FROM assets a
         LEFT JOIN asset_versions v ON v.asset_id = a.id AND v.version_number = 1
         WHERE a.tenant_id = ? AND a.deleted_at IS NULL
         ORDER BY a.id DESC
         LIMIT ? OFFSET ?`,
        [tenantId, limit, offset]
      );

      const totalCountRes = await query<any[]>(
        `SELECT COUNT(*) as total FROM assets WHERE tenant_id = ? AND deleted_at IS NULL`,
        [tenantId]
      );
      const total = totalCountRes[0]?.total || 0;

      res.status(200).json({
        status: 200,
        data: {
          assets: assets,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          },
        },
      });
    } catch (err: any) {
      console.error('List assets error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al listar los activos digitales.',
      });
    }
  }
);

/**
 * GET /api/v1/assets/:id
 * Get asset metadata & versions with Anti-IDOR verification.
 */
router.get(
  '/:id',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = getActorTenantId(req);
      const assetId = parseInt(String(req.params.id), 10);

      if (isNaN(assetId)) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'ID de activo inválido.' });
        return;
      }

      const assets = await query<any[]>(
        `SELECT * FROM assets WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
        [assetId, tenantId]
      );

      if (!assets || assets.length === 0) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Activo digital no encontrado.' });
        return;
      }

      const asset = assets[0];
      const versions = await query<any[]>(
        `SELECT id, version_number, byte_size, sha256_hash, created_at FROM asset_versions WHERE asset_id = ? ORDER BY version_number DESC`,
        [assetId]
      );

      res.status(200).json({
        status: 200,
        data: {
          ...asset,
          versions: versions,
        },
      });
    } catch (err: any) {
      console.error('Get asset error:', err);
      res.status(500).json({ status: 500, error: 'Internal Server Error', message: 'Error al obtener el activo digital.' });
    }
  }
);

/**
 * GET /api/v1/assets/:id/stream
 * Secure binary streaming from NVMe with Anti-IDOR check.
 */
router.get(
  '/:id/stream',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = getActorTenantId(req);
      const assetId = parseInt(String(req.params.id), 10);

      if (isNaN(assetId)) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'ID de activo inválido.' });
        return;
      }

      const rows = await query<any[]>(
        `SELECT a.mime_type, a.title, v.file_path, v.byte_size
         FROM assets a
         JOIN asset_versions v ON v.asset_id = a.id
         WHERE a.id = ? AND a.tenant_id = ? AND a.deleted_at IS NULL
         ORDER BY v.version_number DESC LIMIT 1`,
        [assetId, tenantId]
      );

      if (!rows || rows.length === 0) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Activo no encontrado o acceso denegado.' });
        return;
      }

      const { mime_type, title, file_path, byte_size } = rows[0];
      assertPathContained(file_path);

      if (!fs.existsSync(file_path)) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Archivo físico no encontrado en almacenamiento NVMe.' });
        return;
      }

      res.setHeader('Content-Type', mime_type);
      res.setHeader('Content-Length', byte_size);
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(title)}"`);
      res.setHeader('Cache-Control', 'private, max-age=3600');

      const stream = fs.createReadStream(file_path);
      stream.pipe(res);
    } catch (err: any) {
      console.error('Stream asset error:', err);
      res.status(500).json({ status: 500, error: 'Internal Server Error', message: 'Error al transmitir el activo digital.' });
    }
  }
);

/**
 * GET /api/v1/assets/:id/thumbnail
 * Deliver WebP thumbnail derivative with Anti-IDOR check.
 */
router.get(
  '/:id/thumbnail',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = getActorTenantId(req);
      const assetId = parseInt(String(req.params.id), 10);

      if (isNaN(assetId)) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'ID de activo inválido.' });
        return;
      }

      const rows = await query<any[]>(
        `SELECT d.file_path, d.byte_size
         FROM assets a
         JOIN asset_versions v ON v.asset_id = a.id
         JOIN asset_derivatives d ON d.version_id = v.id
         WHERE a.id = ? AND a.tenant_id = ? AND a.deleted_at IS NULL AND d.derivative_type = 'THUMBNAIL_200W'
         LIMIT 1`,
        [assetId, tenantId]
      );

      if (rows && rows.length > 0) {
        const { file_path, byte_size } = rows[0];
        assertPathContained(file_path);
        if (fs.existsSync(file_path)) {
          res.setHeader('Content-Type', 'image/webp');
          res.setHeader('Content-Length', byte_size);
          res.setHeader('Cache-Control', 'private, max-age=86400');
          fs.createReadStream(file_path).pipe(res);
          return;
        }
      }

      // Fallback to original stream if image without derivative
      const fallbackRows = await query<any[]>(
        `SELECT a.mime_type, v.file_path, v.byte_size
         FROM assets a
         JOIN asset_versions v ON v.asset_id = a.id
         WHERE a.id = ? AND a.tenant_id = ? AND a.deleted_at IS NULL
         ORDER BY v.version_number DESC LIMIT 1`,
        [assetId, tenantId]
      );

      if (!fallbackRows || fallbackRows.length === 0) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Miniatura no encontrada.' });
        return;
      }

      const { mime_type, file_path, byte_size } = fallbackRows[0];
      assertPathContained(file_path);
      res.setHeader('Content-Type', mime_type);
      res.setHeader('Content-Length', byte_size);
      res.setHeader('Cache-Control', 'private, max-age=86400');
      fs.createReadStream(file_path).pipe(res);
    } catch (err: any) {
      console.error('Thumbnail asset error:', err);
      res.status(500).json({ status: 500, error: 'Internal Server Error', message: 'Error al entregar la miniatura.' });
    }
  }
);

/**
 * DELETE /api/v1/assets/:id
 * Soft-delete an asset with audit log.
 */
router.delete(
  '/:id',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = getActorTenantId(req);
      const assetId = parseInt(String(req.params.id), 10);

      if (isNaN(assetId)) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'ID de activo inválido.' });
        return;
      }

      const result = await query<any>(
        `UPDATE assets SET deleted_at = NOW(), status = 'DELETED' WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
        [assetId, tenantId]
      );

      if (!result || result.affectedRows === 0) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Activo no encontrado o ya eliminado.' });
        return;
      }

      await logSecurityEvent(req, {
        eventType: 'ASSET_DELETE',
        userId: Number(req.user?.userId),
        status: 'SUCCESS',
        details: `Soft-deleted asset ID ${assetId}`,
      });

      res.status(200).json({
        status: 200,
        message: 'Activo digital marcado como eliminado exitosamente.',
        data: { assetId },
      });
    } catch (err: any) {
      console.error('Delete asset error:', err);
      res.status(500).json({ status: 500, error: 'Internal Server Error', message: 'Error al eliminar el activo digital.' });
    }
  }
);

/**
 * POST /api/v1/assets/:id/share
 * Generate cryptographic share link (FC 004)
 */
router.post(
  '/:id/share',
  requireAuth,
  validate(createShareSchema),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = getActorTenantId(req);
      const assetId = parseInt(String(req.params.id), 10);

      if (isNaN(assetId)) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'ID de activo inválido.' });
        return;
      }

      // Verify asset exists and belongs to tenant
      const assets = await query<any[]>(
        `SELECT id, title FROM assets WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
        [assetId, tenantId]
      );

      if (!assets || assets.length === 0) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Activo digital no encontrado.' });
        return;
      }

      const { permission, expires_in_days, max_uses } = req.body;
      const validPermission = permission === 'DOWNLOAD' ? 'DOWNLOAD' : 'VIEW';
      const days = Number(expires_in_days);
      const uses = max_uses ? Number(max_uses) : null;

      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

      const insertResult = await query<any>(
        `INSERT INTO asset_shares (tenant_id, asset_id, share_token_hash, permission, max_uses, expires_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [tenantId, assetId, tokenHash, validPermission, uses, expiresAt, req.user?.userId]
      );

      await logSecurityEvent(req, {
        eventType: 'SHARE_CREATED',
        userId: Number(req.user?.userId),
        status: 'SUCCESS',
        details: `Created share link for asset ${assetId} with permission ${validPermission}`,
      });

      const origin = process.env.CORS_ORIGIN || 'https://dreamtek.tech';
      const shareUrl = `${origin}/share/${rawToken}`;

      res.status(201).json({
        status: 201,
        message: 'Enlace de compartición generado exitosamente.',
        data: {
          shareId: insertResult.insertId,
          token: rawToken,
          shareUrl,
          permission: validPermission,
          expiresAt: expiresAt.toISOString(),
          maxUses: uses,
        },
      });
    } catch (err: any) {
      console.error('Create share error:', err);
      res.status(500).json({ status: 500, error: 'Internal Server Error', message: 'Error al generar enlace de compartición.' });
    }
  }
);

/**
 * GET /api/v1/assets/:id/shares
 * List active & historical shares for an asset
 */
router.get(
  '/:id/shares',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = getActorTenantId(req);
      const assetId = parseInt(String(req.params.id), 10);

      if (isNaN(assetId)) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'ID de activo inválido.' });
        return;
      }

      const shares = await query<any[]>(
        `SELECT id, permission, max_uses, current_uses, expires_at, created_at, revoked_at
         FROM asset_shares
         WHERE asset_id = ? AND tenant_id = ?
         ORDER BY created_at DESC`,
        [assetId, tenantId]
      );

      res.status(200).json({
        status: 200,
        data: {
          shares: shares,
        },
      });
    } catch (err: any) {
      console.error('List shares error:', err);
      res.status(500).json({ status: 500, error: 'Internal Server Error', message: 'Error al listar enlaces del activo.' });
    }
  }
);

export default router;

