import { Router, Response } from 'express';
import crypto from 'node:crypto';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import * as archiver from 'archiver';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import {
  uploadRateLimiter,
  searchRateLimiter,
  tagsRateLimiter,
  versionsRateLimiter,
  batchRateLimiter,
  rightsRateLimiter,
  jobsRateLimiter,
  dedupRateLimiter,
  archivalRateLimiter,
  aiRateLimiter,
  semanticSearchRateLimiter,
} from '../middleware/rateLimiter';
import { validate } from '../middleware/validate';
import { createShareSchema } from '../schemas/share.schema';
import { assetSearchQuerySchema } from '../schemas/assetSearch.schema';
import { attachTagsSchema, assetMetadataSchema } from '../schemas/tag.schema';
import { moveAssetLocationSchema } from '../schemas/workspace.schema';
import { assetIdParamSchema, assetVersionParamsSchema } from '../schemas/assetVersion.schema';
import {
  batchAssetIdsSchema,
  batchRelocateSchema,
  batchTagsSchema,
  BatchAssetIdsInput,
  BatchRelocateInput,
  BatchTagsInput,
} from '../schemas/assetBatch.schema';
import { updateAssetRightsSchema, UpdateAssetRightsInput } from '../schemas/assetRights.schema';
import { retryJobsSchema, RetryJobsInput } from '../schemas/mediaJob.schema';
import { dedupQuerySchema, deduplicateBodySchema, DedupQueryInput } from '../schemas/assetDedup.schema';
import { archiveAssetBodySchema, restoreAssetBodySchema } from '../schemas/assetArchival.schema';
import { analyzeAssetBodySchema, applyAiTagsBodySchema } from '../schemas/assetAiMetadata.schema';
import {
  generateEmbeddingBodySchema,
  semanticSearchBodySchema,
  similarAssetsQuerySchema,
} from '../schemas/assetSemanticSearch.schema';
import { logSecurityEvent } from '../middleware/auditLogger';
import { query } from '../db';
import { validateMagicBytes } from '../utils/magicBytes';
import { evaluateAclPermission, AclActor } from '../utils/acl';
import { enqueueMediaJob, retryFailedJobsForAsset } from '../utils/mediaWorker';
import { dispatchWebhookEvent } from '../utils/webhookDispatcher';
import {
  findDuplicateClusters,
  checkExistingDuplicate,
  consolidateDuplicates,
} from '../utils/dedupEngine';
import {
  archiveAsset,
  requestAssetRestoration,
  getArchivalStatus,
} from '../utils/archivalEngine';
import {
  analyzeAssetVisuals,
  getAssetAiMetadata,
  applyAiLabelsAsTags,
} from '../utils/aiVisionEngine';
import {
  generateAssetEmbedding,
  searchSemantic,
  findSimilarAssets,
} from '../utils/vectorSearchEngine';
import { dispatchWorkflowsForEvent } from '../utils/workflowEngine';
import { recordAnalyticsEvent } from '../utils/analyticsEngine';
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
  const userId = Number((req.user as any)?.tenantId || req.user?.userId);
  if (!userId || isNaN(userId)) {
    throw new Error('Invalid authenticated user context.');
  }
  return userId;
}

/**
 * Helper to construct strongly-typed AclActor from AuthenticatedRequest.
 */
export function getAssetActor(req: AuthenticatedRequest): AclActor {
  return {
    id: req.user!.userId,
    role: req.user!.role,
    tenantId: getActorTenantId(req),
  };
}

export interface AssetRightsContext {
  embargo_until?: string | Date | null;
  expires_at?: string | Date | null;
}

/**
 * Helper to enforce embargo and license expiration on content delivery (FC 010).
 * ADMIN users bypass embargo & expiration restrictions.
 */
export function checkAssetEmbargoAndExpiration(
  rights: AssetRightsContext | null | undefined,
  actorRole: string,
): { allowed: boolean; reason?: string } {
  if (actorRole === 'ADMIN') {
    return { allowed: true };
  }
  if (!rights) {
    return { allowed: true };
  }
  const now = new Date();
  if (rights.embargo_until && new Date(rights.embargo_until) > now) {
    return {
      allowed: false,
      reason: `Activo bajo embargo hasta ${new Date(rights.embargo_until).toISOString()}.`,
    };
  }
  if (rights.expires_at && new Date(rights.expires_at) < now) {
    return {
      allowed: false,
      reason: 'La licencia del activo ha expirado.',
    };
  }
  return { allowed: true };
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

      // 2. Compute SHA-256 Checksum (OWASP A02)
      const sha256Hash = computeBufferSha256(req.file.buffer);
      const originalTitle = path.basename(req.file.originalname);

      // 3. Deduplication Policy Check (FC 013)
      const dedupPolicy = (
        (req.headers['x-deduplication-policy'] as string) ||
        (req.query.dedup_policy as string) ||
        req.body?.dedup_policy ||
        'ALLOW_DUPLICATE'
      ).toUpperCase();

      if (dedupPolicy === 'REJECT_DUPLICATE' || dedupPolicy === 'LINK_EXISTING') {
        const existingDuplicate = await checkExistingDuplicate(tenantId, sha256Hash);

        if (existingDuplicate) {
          if (dedupPolicy === 'REJECT_DUPLICATE') {
            res.status(409).json({
              status: 409,
              error: 'Conflict',
              message: 'Ya existe un activo idéntico con el mismo contenido (hash SHA-256).',
              data: {
                duplicate_asset_id: existingDuplicate.id,
                sha256_hash: sha256Hash,
                title: existingDuplicate.title,
                workspace_id: existingDuplicate.workspace_id,
                collection_id: existingDuplicate.collection_id,
                created_at: existingDuplicate.created_at,
              },
            });
            return;
          }

          // LINK_EXISTING
          await logSecurityEvent(req, {
            eventType: 'ASSET_UPLOAD_DEDUPLICATED',
            userId: actorId,
            status: 'SUCCESS',
            details: `Linked existing duplicate asset ID ${existingDuplicate.id} for upload ${originalTitle} [${sha256Hash}]`,
          });

          res.status(200).json({
            status: 200,
            message: 'Activo existente vinculado (deduplicado exitosamente).',
            data: {
              assetId: existingDuplicate.id,
              versionId: existingDuplicate.version_id,
              title: existingDuplicate.title,
              mimeType: existingDuplicate.mime_type,
              byteSize: existingDuplicate.byte_size,
              sha256: sha256Hash,
              workspaceId: existingDuplicate.workspace_id,
              collectionId: existingDuplicate.collection_id,
              linked: true,
            },
          });
          return;
        }
      }

      // 4. Auto-bootstrap Workspace and Collection
      const { workspaceId, collectionId } = await getOrCreateDefaultWorkspace(tenantId);

      // 5. Insert Asset Record
      const assetInsertRes = await query<any>(
        `INSERT INTO assets (tenant_id, workspace_id, collection_id, title, mime_type, status)
         VALUES (?, ?, ?, ?, ?, 'ACTIVE')`,
        [tenantId, workspaceId, collectionId, originalTitle, validatedMime.mime],
      );
      const assetId = assetInsertRes.insertId;

      // 5. Build Storage Path & Write Original Binary
      const assetDir = path.join(
        STORAGE_ROOT,
        'tenants',
        String(tenantId),
        'assets',
        String(assetId),
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
        [assetId, req.file.buffer.length, sha256Hash, originalFilePath, actorId],
      );
      const versionId = versionInsertRes.insertId;

      // 7. Generate Derivatives (Thumbnails with sharp)
      const derivativesDir = path.join(assetDir, 'derivatives');
      const generatedDerivatives = await generateWebPDerivatives(
        req.file.buffer,
        validatedMime.mime,
        derivativesDir,
      );

      for (const d of generatedDerivatives) {
        await query<any>(
          `INSERT INTO asset_derivatives (version_id, derivative_type, width, height, byte_size, file_path)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [versionId, d.derivativeType, d.width, d.height, d.byteSize, d.filePath],
        );
      }

      // 8. Enqueue Media Processing Job (FC 011)
      await enqueueMediaJob(tenantId, assetId, versionId, validatedMime.mime);

      // 9. Audit Log Event (OWASP A09)
      await logSecurityEvent(req, {
        eventType: 'ASSET_UPLOAD',
        userId: actorId,
        status: 'SUCCESS',
        details: `Uploaded asset ID ${assetId} (${originalTitle}) [${sha256Hash}]`,
      });

      // 10. Dispatch Webhook Event (FC 012 - fire-and-forget)
      void dispatchWebhookEvent(tenantId, 'asset.created', {
        asset_id: assetId,
        title: originalTitle,
        mime_type: validatedMime.mime,
        byte_size: req.file.buffer.length,
      });

      // 11. Dispatch Workflows for ASSET_CREATED (FC 017 - fire-and-forget)
      void dispatchWorkflowsForEvent(tenantId, assetId, 'ASSET_CREATED', actorId);

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
  },
);

/**
 * GET /api/v1/assets
 * List and search paginated active assets for the authenticated tenant.
 * Supports multi-variable filtering, full-text matching, tags, size and date ranges.
 */
router.get(
  '/',
  searchRateLimiter,
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = getActorTenantId(req);
      const parsed = assetSearchQuerySchema.safeParse(req.query);

      if (!parsed.success) {
        res.status(400).json({
          status: 400,
          error: 'Bad Request',
          message: 'Parámetros de búsqueda inválidos.',
          details: parsed.error.format(),
        });
        return;
      }

      const {
        q,
        workspace_id,
        collection_id,
        mime_type,
        tag,
        min_size,
        max_size,
        from_date,
        to_date,
        sort_by,
        sort_order,
        page,
        limit,
      } = parsed.data;

      const offset = (page - 1) * limit;

      const conditions: string[] = [
        'a.tenant_id = ?',
        "a.status = 'ACTIVE'",
        'a.deleted_at IS NULL',
      ];
      const params: any[] = [tenantId];

      // Text search in title or file_path (sanitizing LIKE special characters)
      if (q) {
        const escapedQ = q.replace(/[%_\\]/g, '\\$&');
        conditions.push('(a.title LIKE ? OR v.file_path LIKE ?)');
        params.push(`%${escapedQ}%`, `%${escapedQ}%`);
      }

      // Workspace and Collection filters
      if (workspace_id !== undefined) {
        conditions.push('a.workspace_id = ?');
        params.push(workspace_id);
      }

      if (collection_id !== undefined) {
        conditions.push('a.collection_id = ?');
        params.push(collection_id);
      }

      // MIME Type / Category Whitelist
      if (mime_type) {
        const lowerMime = mime_type.toLowerCase();
        if (lowerMime === 'image') {
          conditions.push("a.mime_type LIKE 'image/%'");
        } else if (lowerMime === 'video') {
          conditions.push("a.mime_type LIKE 'video/%'");
        } else if (lowerMime === 'document') {
          conditions.push(
            "a.mime_type IN ('application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain')",
          );
        } else if (lowerMime === 'audio') {
          conditions.push("a.mime_type LIKE 'audio/%'");
        } else {
          conditions.push('a.mime_type = ?');
          params.push(mime_type);
        }
      }

      // Tag filter
      if (tag) {
        conditions.push(
          'EXISTS (SELECT 1 FROM asset_tags at2 JOIN tags t2 ON t2.id = at2.tag_id WHERE at2.asset_id = a.id AND t2.name = ?)',
        );
        params.push(tag);
      }

      // Size range filter on current version
      if (min_size !== undefined) {
        conditions.push('v.byte_size >= ?');
        params.push(min_size);
      }

      if (max_size !== undefined) {
        conditions.push('v.byte_size <= ?');
        params.push(max_size);
      }

      // Date range filter
      if (from_date) {
        const parsedFrom = new Date(from_date);
        if (!isNaN(parsedFrom.getTime())) {
          conditions.push('a.created_at >= ?');
          params.push(parsedFrom);
        }
      }

      if (to_date) {
        const parsedTo = new Date(to_date);
        if (!isNaN(parsedTo.getTime())) {
          conditions.push('a.created_at <= ?');
          params.push(parsedTo);
        }
      }

      // Sort Column Whitelist
      let sortColumn = 'a.created_at';
      if (sort_by === 'title') {
        sortColumn = 'a.title';
      } else if (sort_by === 'byte_size') {
        sortColumn = 'v.byte_size';
      }

      const sortDir = sort_order === 'ASC' ? 'ASC' : 'DESC';

      const whereClause = conditions.join(' AND ');

      // Query paginated assets with tags
      const queryParams = [...params, limit, offset];
      const assets = await query<any[]>(
        `SELECT a.id, a.tenant_id, a.workspace_id, a.collection_id, a.title, a.mime_type, a.status, a.created_at,
                v.id as current_version_id, v.version_number, v.byte_size, v.sha256_hash,
                (
                  SELECT GROUP_CONCAT(t.name SEPARATOR ',')
                  FROM asset_tags at
                  JOIN tags t ON t.id = at.tag_id
                  WHERE at.asset_id = a.id
                ) as tags
         FROM assets a
         LEFT JOIN asset_versions v ON v.asset_id = a.id AND v.version_number = 1
         WHERE ${whereClause}
         ORDER BY ${sortColumn} ${sortDir}
         LIMIT ? OFFSET ?`,
        queryParams,
      );

      // Query total count
      const countRes = await query<any[]>(
        `SELECT COUNT(DISTINCT a.id) as total
         FROM assets a
         LEFT JOIN asset_versions v ON v.asset_id = a.id AND v.version_number = 1
         WHERE ${whereClause}`,
        [...params],
      );
      const total = Number(countRes[0]?.total || 0);

      res.status(200).json({
        status: 200,
        data: {
          assets: assets.map((row) => ({
            id: row.id,
            tenantId: row.tenant_id,
            workspaceId: row.workspace_id,
            collectionId: row.collection_id,
            title: row.title,
            mimeType: row.mime_type,
            status: row.status,
            createdAt: row.created_at,
            currentVersion: row.current_version_id
              ? {
                  id: row.current_version_id,
                  versionNumber: row.version_number,
                  byteSize: row.byte_size,
                  sha256: row.sha256_hash,
                }
              : null,
            tags: row.tags ? String(row.tags).split(',') : [],
          })),
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit) || 1,
          },
        },
      });
    } catch (err: any) {
      console.error('Search assets error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al consultar y filtrar los activos digitales.',
      });
    }
  },
);

/**
 * GET /api/v1/assets/duplicates
 * Lists clusters of duplicate assets sharing identical SHA-256 hashes for the tenant (FC 013).
 */
router.get(
  '/duplicates',
  dedupRateLimiter,
  requireAuth,
  validate(dedupQuerySchema, 'query'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = getActorTenantId(req);
      const queryOptions = req.query as unknown as DedupQueryInput;

      const result = await findDuplicateClusters(tenantId, queryOptions);

      res.status(200).json({
        status: 200,
        summary: result.summary,
        data: result.clusters,
        pagination: result.pagination,
      });
    } catch (err: any) {
      console.error('Find duplicate clusters error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al escanear y obtener los activos duplicados.',
      });
    }
  },
);

/**
 * POST /api/v1/assets/deduplicate
 * Consolidates redundant duplicate assets into a designated canonical asset (FC 013, OWASP A01/A09).
 */
router.post(
  '/deduplicate',
  dedupRateLimiter,
  requireAuth,
  validate(deduplicateBodySchema, 'body'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = getActorTenantId(req);
      const actor = getAssetActor(req);
      const actorId = Number(req.user?.userId);
      const { canonical_asset_id, duplicate_asset_ids, reason } = req.body;

      // 1. Validation: canonical cannot be in duplicate list
      if (duplicate_asset_ids.includes(canonical_asset_id)) {
        res.status(400).json({
          status: 400,
          error: 'Bad Request',
          message: 'El activo canónico no puede estar incluido en la lista de activos a consolidar.',
        });
        return;
      }

      // 2. ACL Verification on Canonical Asset (VIEW permission required)
      const isAllowed = (res: any) => Boolean(res?.allowed ?? res);

      const canonicalAllowed = await evaluateAclPermission(
        actor,
        'ASSET',
        canonical_asset_id,
        'VIEW',
      );

      if (!isAllowed(canonicalAllowed)) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por ACL sobre el activo canónico especificado.',
        });
        return;
      }

      // 3. ACL Verification on Duplicate Assets (DELETE permission required for each)
      for (const dupId of duplicate_asset_ids) {
        const dupAllowed = await evaluateAclPermission(
          actor,
          'ASSET',
          dupId,
          'DELETE',
        );

        if (!isAllowed(dupAllowed)) {
          res.status(403).json({
            status: 403,
            error: 'Forbidden',
            message: `Permisos insuficientes para consolidar y eliminar el activo duplicado ID ${dupId}.`,
          });
          return;
        }
      }

      // 4. Consolidate Duplicates via Engine
      const consolidateResult = await consolidateDuplicates(
        tenantId,
        canonical_asset_id,
        duplicate_asset_ids,
        actorId,
        reason,
      );

      if (!consolidateResult.success) {
        res.status(400).json({
          status: 400,
          error: 'Bad Request',
          message: consolidateResult.error,
        });
        return;
      }

      // 5. Security Audit Log (OWASP A09)
      await logSecurityEvent(req, {
        eventType: 'ASSET_DEDUPLICATE',
        userId: actorId,
        status: 'SUCCESS',
        details: `Consolidated ${duplicate_asset_ids.length} duplicates into canonical ID ${canonical_asset_id} (Reclaimed: ${consolidateResult.reclaimed_bytes} bytes)`,
      });

      // 6. Dispatch Webhooks for Soft-Deleted Duplicates (FC 012)
      for (const dupId of duplicate_asset_ids) {
        void dispatchWebhookEvent(tenantId, 'asset.deleted', {
          asset_id: dupId,
          reason: 'DEDUPLICATED',
          canonical_asset_id,
        });
      }

      res.status(200).json({
        status: 200,
        message: 'Activos duplicados consolidados con éxito.',
        data: {
          canonical_asset_id,
          consolidated_count: consolidateResult.consolidated_count,
          reclaimed_bytes: consolidateResult.reclaimed_bytes,
          consolidated_asset_ids: consolidateResult.consolidated_asset_ids,
        },
      });
    } catch (err: any) {
      console.error('Deduplicate assets error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error interno al consolidar los activos duplicados.',
      });
    }
  },
);

/**
 * POST /api/v1/assets/:id/archive
 * Transitions an active asset to cold cloud storage (S3 Glacier / Object Storage) (FC 014, OWASP A01/A04/A09).
 */
router.post(
  '/:id/archive',
  archivalRateLimiter,
  requireAuth,
  validate(archiveAssetBodySchema, 'body'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = getActorTenantId(req);
      const actor = getAssetActor(req);
      const actorId = Number(req.user?.userId);
      const assetId = parseInt(String(req.params.id), 10);

      if (isNaN(assetId)) {
        res
          .status(400)
          .json({ status: 400, error: 'Bad Request', message: 'ID de activo inválido.' });
        return;
      }

      // ACL check: MANAGE permission on asset
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'MANAGE');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message:
            'Acceso denegado por política de control de acceso (ACL) para archivar el activo.',
        });
        return;
      }

      const archiveResult = await archiveAsset(tenantId, assetId, actorId, req.body);

      if (!archiveResult.success) {
        res.status(400).json({
          status: 400,
          error: 'Bad Request',
          message: archiveResult.error,
        });
        return;
      }

      await logSecurityEvent(req, {
        eventType: 'ASSET_ARCHIVED',
        userId: actorId,
        status: 'SUCCESS',
        details: `Archived asset ID ${assetId} to ${archiveResult.archive_provider} (${archiveResult.archive_key})`,
      });

      void dispatchWebhookEvent(tenantId, 'asset.archived', {
        asset_id: assetId,
        archive_provider: archiveResult.archive_provider,
        archive_key: archiveResult.archive_key,
        storage_tier: 'ARCHIVED',
      });

      res.status(200).json({
        status: 200,
        message: 'Activo digital archivado exitosamente en almacenamiento frío.',
        data: archiveResult,
      });
    } catch (err: any) {
      console.error('Archive asset error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al archivar el activo digital.',
      });
    }
  },
);

/**
 * POST /api/v1/assets/:id/restore
 * Requests asynchronous restoration of an archived asset back to local NVMe hot cache (FC 014, OWASP A01/A04/A09).
 */
router.post(
  '/:id/restore',
  archivalRateLimiter,
  requireAuth,
  validate(restoreAssetBodySchema, 'body'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = getActorTenantId(req);
      const actor = getAssetActor(req);
      const actorId = Number(req.user?.userId);
      const assetId = parseInt(String(req.params.id), 10);

      if (isNaN(assetId)) {
        res
          .status(400)
          .json({ status: 400, error: 'Bad Request', message: 'ID de activo inválido.' });
        return;
      }

      // ACL check: EDIT permission on asset
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'EDIT');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message:
            'Acceso denegado por política de control de acceso (ACL) para restaurar el activo.',
        });
        return;
      }

      const restoreResult = await requestAssetRestoration(tenantId, assetId, actorId, req.body);

      if (!restoreResult.success) {
        res.status(400).json({
          status: 400,
          error: 'Bad Request',
          message: restoreResult.error,
        });
        return;
      }

      await logSecurityEvent(req, {
        eventType: 'ASSET_RESTORE_REQUESTED',
        userId: actorId,
        status: 'SUCCESS',
        details: `Restoration requested for asset ID ${assetId} (Tier: ${req.body.restoration_tier})`,
      });

      void dispatchWebhookEvent(tenantId, 'asset.restored', {
        asset_id: assetId,
        restoration_status: restoreResult.restoration_status,
        restoration_tier: restoreResult.restoration_tier,
      });

      res.status(200).json({
        status: 200,
        message: 'Solicitud de restauración de activo iniciada exitosamente.',
        data: restoreResult,
      });
    } catch (err: any) {
      console.error('Restore asset error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al solicitar la restauración del activo digital.',
      });
    }
  },
);

/**
 * GET /api/v1/assets/:id/archival-status
 * Retrieves cold storage and restoration status for an asset (FC 014, OWASP A01).
 */
router.get(
  '/:id/archival-status',
  archivalRateLimiter,
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = getActorTenantId(req);
      const actor = getAssetActor(req);
      const assetId = parseInt(String(req.params.id), 10);

      if (isNaN(assetId)) {
        res
          .status(400)
          .json({ status: 400, error: 'Bad Request', message: 'ID de activo inválido.' });
        return;
      }

      // ACL check: VIEW permission
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'VIEW');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL).',
        });
        return;
      }

      const status = await getArchivalStatus(tenantId, assetId);

      if (!status) {
        res.status(404).json({
          status: 404,
          error: 'Not Found',
          message: 'Activo digital no encontrado.',
        });
        return;
      }

      res.status(200).json({
        status: 200,
        data: status,
      });
    } catch (err: any) {
      console.error('Get archival status error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al obtener el estado de archivo del activo.',
      });
    }
  },
);

/**
 * POST /api/v1/assets/:id/ai-analyze
 * Triggers computer vision analysis, color extraction, and smart auto-tagging (FC 015, OWASP A01/A04/A09).
 */
router.post(
  '/:id/ai-analyze',
  aiRateLimiter,
  requireAuth,
  validate(analyzeAssetBodySchema, 'body'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = getActorTenantId(req);
      const actor = getAssetActor(req);
      const actorId = Number(req.user?.userId);
      const assetId = parseInt(String(req.params.id), 10);

      if (isNaN(assetId)) {
        res
          .status(400)
          .json({ status: 400, error: 'Bad Request', message: 'ID de activo inválido.' });
        return;
      }

      // ACL check: EDIT permission
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'EDIT');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message:
            'Acceso denegado por política de control de acceso (ACL) para analizar el activo.',
        });
        return;
      }

      const result = await analyzeAssetVisuals(tenantId, assetId, req.body);

      if (!result.success || !result.data) {
        res.status(400).json({
          status: 400,
          error: 'Bad Request',
          message: result.error || 'Error al analizar el activo digital.',
        });
        return;
      }

      await logSecurityEvent(req, {
        eventType: 'ASSET_AI_ANALYZED',
        userId: actorId,
        status: 'SUCCESS',
        details: `AI vision analysis executed on asset ID ${assetId} (Auto-tagged: ${result.data.auto_tagged}, Tags: ${result.data.tags_applied_count})`,
      });

      void dispatchWebhookEvent(tenantId, 'asset.ai_analyzed', {
        asset_id: assetId,
        labels_count: result.data.labels.length,
        auto_tagged: result.data.auto_tagged,
        dominant_colors: result.data.dominant_colors,
      });

      res.status(200).json({
        status: 200,
        message: 'Análisis de inteligencia visual completado exitosamente.',
        data: result.data,
      });
    } catch (err: any) {
      console.error('Analyze asset visual error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error interno al analizar el activo digital.',
      });
    }
  },
);

/**
 * GET /api/v1/assets/:id/ai-metadata
 * Retrieves AI vision labels, colors, and detection metadata (FC 015, OWASP A01).
 */
router.get(
  '/:id/ai-metadata',
  aiRateLimiter,
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = getActorTenantId(req);
      const actor = getAssetActor(req);
      const assetId = parseInt(String(req.params.id), 10);

      if (isNaN(assetId)) {
        res
          .status(400)
          .json({ status: 400, error: 'Bad Request', message: 'ID de activo inválido.' });
        return;
      }

      // ACL check: VIEW permission
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'VIEW');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL).',
        });
        return;
      }

      const metadata = await getAssetAiMetadata(tenantId, assetId);

      if (!metadata) {
        res.status(404).json({
          status: 404,
          error: 'Not Found',
          message: 'Metadatos de inteligencia artificial no encontrados para este activo.',
        });
        return;
      }

      res.status(200).json({
        status: 200,
        data: metadata,
      });
    } catch (err: any) {
      console.error('Get asset AI metadata error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al consultar los metadatos de inteligencia artificial.',
      });
    }
  },
);

/**
 * POST /api/v1/assets/:id/ai-tags/apply
 * Applies selected AI inferred labels directly as formal asset tags (FC 015, OWASP A01/A09).
 */
router.post(
  '/:id/ai-tags/apply',
  aiRateLimiter,
  requireAuth,
  validate(applyAiTagsBodySchema, 'body'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = getActorTenantId(req);
      const actor = getAssetActor(req);
      const actorId = Number(req.user?.userId);
      const assetId = parseInt(String(req.params.id), 10);

      if (isNaN(assetId)) {
        res
          .status(400)
          .json({ status: 400, error: 'Bad Request', message: 'ID de activo inválido.' });
        return;
      }

      // ACL check: EDIT permission
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'EDIT');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message:
            'Acceso denegado por política de control de acceso (ACL) para aplicar etiquetas.',
        });
        return;
      }

      const result = await applyAiLabelsAsTags(tenantId, assetId, req.body.labels);

      if (!result.success) {
        res.status(400).json({
          status: 400,
          error: 'Bad Request',
          message: result.error || 'Error al aplicar las etiquetas de IA.',
        });
        return;
      }

      await logSecurityEvent(req, {
        eventType: 'ASSET_AI_TAGS_APPLIED',
        userId: actorId,
        status: 'SUCCESS',
        details: `Applied AI tags [${result.tags_applied.join(', ')}] to asset ID ${assetId}`,
      });

      void dispatchWebhookEvent(tenantId, 'asset.tags_updated', {
        asset_id: assetId,
        tags: result.tags_applied,
        source: 'AI_AUTO_TAGGING',
      });

      res.status(200).json({
        status: 200,
        message: 'Etiquetas visuales aplicadas exitosamente al activo.',
        data: result,
      });
    } catch (err: any) {
      console.error('Apply AI tags error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al aplicar las etiquetas de inteligencia artificial.',
      });
    }
  },
);

/**
 * POST /api/v1/assets/search/semantic
 * Executes natural language semantic & vector similarity search across tenant assets (FC 016, OWASP A01/A04/A09).
 */
router.post(
  '/search/semantic',
  semanticSearchRateLimiter,
  requireAuth,
  validate(semanticSearchBodySchema, 'body'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = getActorTenantId(req);
      const actorId = Number(req.user?.userId);
      const { query: queryText, min_score, limit } = req.body;

      const response = await searchSemantic(tenantId, queryText, {
        min_score,
        limit,
      });

      await logSecurityEvent(req, {
        eventType: 'SEMANTIC_SEARCH_EXECUTED',
        userId: actorId,
        status: 'SUCCESS',
        details: `Executed semantic search for query "${queryText}" with ${response.total_matches} matches`,
      });

      res.status(200).json({
        status: 200,
        message: 'Búsqueda semántica ejecutada exitosamente.',
        data: response,
      });
    } catch (err: any) {
      console.error('Semantic search error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al ejecutar la búsqueda semántica.',
      });
    }
  },
);

/**
 * POST /api/v1/assets/:id/embedding
 * Generates or refreshes the multimodal semantic embedding vector for an asset (FC 016, OWASP A01/A04/A09).
 */
router.post(
  '/:id/embedding',
  semanticSearchRateLimiter,
  requireAuth,
  validate(generateEmbeddingBodySchema, 'body'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = getActorTenantId(req);
      const actor = getAssetActor(req);
      const actorId = Number(req.user?.userId);
      const assetId = parseInt(String(req.params.id), 10);

      if (isNaN(assetId)) {
        res
          .status(400)
          .json({ status: 400, error: 'Bad Request', message: 'ID de activo inválido.' });
        return;
      }

      // ACL check: EDIT permission
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'EDIT');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message:
            'Acceso denegado por política de control de acceso (ACL) para generar embeddings.',
        });
        return;
      }

      const result = await generateAssetEmbedding(tenantId, assetId, req.body);

      if (!result.success) {
        res.status(400).json({
          status: 400,
          error: 'Bad Request',
          message: result.error || 'Error al generar el vector de embedding.',
        });
        return;
      }

      await logSecurityEvent(req, {
        eventType: 'ASSET_EMBEDDING_GENERATED',
        userId: actorId,
        status: 'SUCCESS',
        details: `Generated embedding for asset ID ${assetId} using model ${result.data?.model_name}`,
      });

      res.status(200).json({
        status: 200,
        message: 'Vector de embedding generado exitosamente.',
        data: result.data,
      });
    } catch (err: any) {
      console.error('Generate asset embedding error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al generar el embedding del activo.',
      });
    }
  },
);

/**
 * GET /api/v1/assets/:id/similar
 * Finds visually and conceptually similar assets by calculating cosine distance (FC 016, OWASP A01/A04/A09).
 */
router.get(
  '/:id/similar',
  semanticSearchRateLimiter,
  requireAuth,
  validate(similarAssetsQuerySchema, 'query'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = getActorTenantId(req);
      const actor = getAssetActor(req);
      const actorId = Number(req.user?.userId);
      const assetId = parseInt(String(req.params.id), 10);

      if (isNaN(assetId)) {
        res
          .status(400)
          .json({ status: 400, error: 'Bad Request', message: 'ID de activo inválido.' });
        return;
      }

      // ACL check: VIEW permission
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'VIEW');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message:
            'Acceso denegado por política de control de acceso (ACL) para consultar similitud.',
        });
        return;
      }

      const { min_score, limit } = req.query as unknown as { min_score: number; limit: number };

      const result = await findSimilarAssets(tenantId, assetId, { min_score, limit });

      if (!result.success) {
        res.status(400).json({
          status: 400,
          error: 'Bad Request',
          message: result.error || 'Error al buscar activos similares.',
        });
        return;
      }

      await logSecurityEvent(req, {
        eventType: 'ASSET_SIMILARITY_SEARCH_EXECUTED',
        userId: actorId,
        status: 'SUCCESS',
        details: `Found ${result.total_matches} similar assets for asset ID ${assetId}`,
      });

      res.status(200).json({
        status: 200,
        message: 'Activos similares recuperados exitosamente.',
        data: result,
      });
    } catch (err: any) {
      console.error('Find similar assets error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al buscar activos similares.',
      });
    }
  },
);

/**
 * GET /api/v1/assets/:id
 * Get asset metadata & versions with Anti-IDOR verification.
 */
router.get('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const tenantId = getActorTenantId(req);
    const assetId = parseInt(String(req.params.id), 10);

    if (isNaN(assetId)) {
      res
        .status(400)
        .json({ status: 400, error: 'Bad Request', message: 'ID de activo inválido.' });
      return;
    }

    const assets = await query<any[]>(
      `SELECT * FROM assets WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
      [assetId, tenantId],
    );

    if (!assets || assets.length === 0) {
      res
        .status(404)
        .json({ status: 404, error: 'Not Found', message: 'Activo digital no encontrado.' });
      return;
    }

    const asset = assets[0];

    const actor = {
      id: req.user!.userId,
      role: req.user!.role,
      tenantId,
    };
    const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'VIEW', {
      tenantId: asset.tenant_id,
      workspaceId: asset.workspace_id,
      collectionId: asset.collection_id,
      status: asset.status,
      deletedAt: asset.deleted_at,
    });
    if (!evalResult.allowed) {
      res.status(403).json({
        status: 403,
        error: 'Forbidden',
        message: 'Acceso denegado por política de control de acceso (ACL).',
      });
      return;
    }
    const versions = await query<any[]>(
      `SELECT id, version_number, byte_size, sha256_hash, created_at FROM asset_versions WHERE asset_id = ? ORDER BY version_number DESC`,
      [assetId],
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
    res.status(500).json({
      status: 500,
      error: 'Internal Server Error',
      message: 'Error al obtener el activo digital.',
    });
  }
});

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
        res
          .status(400)
          .json({ status: 400, error: 'Bad Request', message: 'ID de activo inválido.' });
        return;
      }

      const rows = await query<any[]>(
        `SELECT a.mime_type, a.title, a.workspace_id, a.collection_id, a.status, a.deleted_at, a.storage_tier, v.file_path, v.byte_size,
                r.embargo_until, r.expires_at
         FROM assets a
         JOIN asset_versions v ON v.asset_id = a.id
         LEFT JOIN asset_rights r ON r.asset_id = a.id
         WHERE a.id = ? AND a.tenant_id = ? AND a.deleted_at IS NULL
         ORDER BY v.version_number DESC LIMIT 1`,
        [assetId, tenantId],
      );

      if (!rows || rows.length === 0) {
        res.status(404).json({
          status: 404,
          error: 'Not Found',
          message: 'Activo no encontrado o acceso denegado.',
        });
        return;
      }

      const {
        mime_type,
        title,
        file_path,
        byte_size,
        workspace_id,
        collection_id,
        status,
        deleted_at,
        storage_tier,
        embargo_until,
        expires_at,
      } = rows[0];

      if (storage_tier === 'ARCHIVED') {
        const archivalStatus = await getArchivalStatus(tenantId, assetId);
        if (archivalStatus && !archivalStatus.is_restored) {
          res.status(409).json({
            status: 409,
            error: 'Conflict',
            message:
              'El activo digital se encuentra archivado en almacenamiento frío (Glacier) y requiere ser restaurado previamente.',
            data: {
              storage_tier: 'ARCHIVED',
              restoration_status: archivalStatus.restoration_status,
            },
          });
          return;
        }
      }

      const actor = {
        id: req.user!.userId,
        role: req.user!.role,
        tenantId,
      };
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'DOWNLOAD', {
        tenantId,
        workspaceId: workspace_id,
        collectionId: collection_id,
        status,
        deletedAt: deleted_at,
      });
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL).',
        });
        return;
      }

      const embargoCheck = checkAssetEmbargoAndExpiration(
        { embargo_until, expires_at },
        actor.role,
      );
      if (!embargoCheck.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: embargoCheck.reason,
        });
        return;
      }

      assertPathContained(file_path);

      if (!fs.existsSync(file_path)) {
        res.status(404).json({
          status: 404,
          error: 'Not Found',
          message: 'Archivo físico no encontrado en almacenamiento NVMe.',
        });
        return;
      }

      res.setHeader('Content-Type', mime_type);
      res.setHeader('Content-Length', byte_size);
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(title)}"`);
      res.setHeader('Cache-Control', 'private, max-age=3600');

      void recordAnalyticsEvent({
        tenant_id: tenantId,
        asset_id: assetId,
        event_type: 'STREAM',
        actor_id: Number(req.user?.userId),
        actor_type: 'USER',
        bytes_served: byte_size,
        ip: req.ip,
        user_agent: req.headers['user-agent'] as string,
        referer: req.headers['referer'] as string,
      });

      const stream = fs.createReadStream(file_path);
      stream.pipe(res);
    } catch (err: any) {
      console.error('Stream asset error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al transmitir el activo digital.',
      });
    }
  },
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
        res
          .status(400)
          .json({ status: 400, error: 'Bad Request', message: 'ID de activo inválido.' });
        return;
      }

      const rows = await query<any[]>(
        `SELECT d.file_path, d.byte_size, a.workspace_id, a.collection_id, a.status, a.deleted_at, a.storage_tier,
                r.embargo_until, r.expires_at
         FROM assets a
         JOIN asset_versions v ON v.asset_id = a.id
         JOIN asset_derivatives d ON d.version_id = v.id
         LEFT JOIN asset_rights r ON r.asset_id = a.id
         WHERE a.id = ? AND a.tenant_id = ? AND a.deleted_at IS NULL AND d.derivative_type = 'THUMBNAIL_200W'
         LIMIT 1`,
        [assetId, tenantId],
      );

      if (rows && rows.length > 0) {
        const {
          file_path,
          byte_size,
          workspace_id,
          collection_id,
          status,
          deleted_at,
          storage_tier,
          embargo_until,
          expires_at,
        } = rows[0];

        if (storage_tier === 'ARCHIVED') {
          const archivalStatus = await getArchivalStatus(tenantId, assetId);
          if (archivalStatus && !archivalStatus.is_restored) {
            res.status(409).json({
              status: 409,
              error: 'Conflict',
              message:
                'El activo digital se encuentra archivado en almacenamiento frío (Glacier) y requiere ser restaurado previamente.',
              data: {
                storage_tier: 'ARCHIVED',
                restoration_status: archivalStatus.restoration_status,
              },
            });
            return;
          }
        }

        const actor = {
          id: req.user!.userId,
          role: req.user!.role,
          tenantId,
        };
        const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'VIEW', {
          tenantId,
          workspaceId: workspace_id,
          collectionId: collection_id,
          status,
          deletedAt: deleted_at,
        });
        if (!evalResult.allowed) {
          res.status(403).json({
            status: 403,
            error: 'Forbidden',
            message: 'Acceso denegado por política de control de acceso (ACL).',
          });
          return;
        }

        const embargoCheck = checkAssetEmbargoAndExpiration(
          { embargo_until, expires_at },
          actor.role,
        );
        if (!embargoCheck.allowed) {
          res.status(403).json({
            status: 403,
            error: 'Forbidden',
            message: embargoCheck.reason,
          });
          return;
        }

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
        `SELECT a.mime_type, a.workspace_id, a.collection_id, a.status, a.deleted_at, v.file_path, v.byte_size,
                r.embargo_until, r.expires_at
         FROM assets a
         JOIN asset_versions v ON v.asset_id = a.id
         LEFT JOIN asset_rights r ON r.asset_id = a.id
         WHERE a.id = ? AND a.tenant_id = ? AND a.deleted_at IS NULL
         ORDER BY v.version_number DESC LIMIT 1`,
        [assetId, tenantId],
      );

      if (!fallbackRows || fallbackRows.length === 0) {
        res
          .status(404)
          .json({ status: 404, error: 'Not Found', message: 'Miniatura no encontrada.' });
        return;
      }

      const {
        mime_type,
        file_path,
        byte_size,
        workspace_id,
        collection_id,
        status,
        deleted_at,
        embargo_until,
        expires_at,
      } = fallbackRows[0];

      const actor = {
        id: req.user!.userId,
        role: req.user!.role,
        tenantId,
      };
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'VIEW', {
        tenantId,
        workspaceId: workspace_id,
        collectionId: collection_id,
        status,
        deletedAt: deleted_at,
      });
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL).',
        });
        return;
      }

      const embargoCheck = checkAssetEmbargoAndExpiration(
        { embargo_until, expires_at },
        actor.role,
      );
      if (!embargoCheck.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: embargoCheck.reason,
        });
        return;
      }

      assertPathContained(file_path);
      res.setHeader('Content-Type', mime_type);
      res.setHeader('Content-Length', byte_size);
      res.setHeader('Cache-Control', 'private, max-age=86400');
      fs.createReadStream(file_path).pipe(res);
    } catch (err: any) {
      console.error('Thumbnail asset error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al entregar la miniatura.',
      });
    }
  },
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
        res
          .status(400)
          .json({ status: 400, error: 'Bad Request', message: 'ID de activo inválido.' });
        return;
      }

      const actor = {
        id: req.user!.userId,
        role: req.user!.role,
        tenantId,
      };

      // Check ACL for non-owner/non-admin
      if (actor.role !== 'ADMIN' && Number(actor.id) !== Number(tenantId)) {
        const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'DELETE');
        if (!evalResult.allowed) {
          res.status(403).json({
            status: 403,
            error: 'Forbidden',
            message: 'Acceso denegado por política de control de acceso (ACL).',
          });
          return;
        }
      }

      const result = await query<any>(
        `UPDATE assets SET deleted_at = NOW(), status = 'DELETED' WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
        [assetId, tenantId],
      );

      if (!result || result.affectedRows === 0) {
        res.status(404).json({
          status: 404,
          error: 'Not Found',
          message: 'Activo no encontrado o ya eliminado.',
        });
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
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al eliminar el activo digital.',
      });
    }
  },
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
        res
          .status(400)
          .json({ status: 400, error: 'Bad Request', message: 'ID de activo inválido.' });
        return;
      }

      // Verify asset exists and belongs to tenant
      const assets = await query<any[]>(
        `SELECT id, title FROM assets WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
        [assetId, tenantId],
      );

      if (!assets || assets.length === 0) {
        res
          .status(404)
          .json({ status: 404, error: 'Not Found', message: 'Activo digital no encontrado.' });
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
        [tenantId, assetId, tokenHash, validPermission, uses, expiresAt, req.user?.userId],
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
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al generar enlace de compartición.',
      });
    }
  },
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
        res
          .status(400)
          .json({ status: 400, error: 'Bad Request', message: 'ID de activo inválido.' });
        return;
      }

      const shares = await query<any[]>(
        `SELECT id, permission, max_uses, current_uses, expires_at, created_at, revoked_at
         FROM asset_shares
         WHERE asset_id = ? AND tenant_id = ?
         ORDER BY created_at DESC`,
        [assetId, tenantId],
      );

      res.status(200).json({
        status: 200,
        data: {
          shares: shares,
        },
      });
    } catch (err: any) {
      console.error('List shares error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al listar enlaces del activo.',
      });
    }
  },
);

/**
 * POST /api/v1/assets/:id/tags
 * Attach tags to an asset with Anti-IDOR validation.
 */
router.post(
  '/:id/tags',
  tagsRateLimiter,
  requireAuth,
  validate(attachTagsSchema),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = getActorTenantId(req);
      const assetId = parseInt(String(req.params.id), 10);
      const { tag_ids } = req.body;

      if (isNaN(assetId)) {
        res
          .status(400)
          .json({ status: 400, error: 'Bad Request', message: 'ID de activo inválido.' });
        return;
      }

      // Anti-IDOR: Check asset exists and belongs to active tenant
      const assetRows = await query<any[]>(
        'SELECT id, tenant_id, workspace_id, collection_id, status, deleted_at FROM assets WHERE id = ? AND tenant_id = ? AND status = "ACTIVE" AND deleted_at IS NULL',
        [assetId, tenantId],
      );

      if (!assetRows || assetRows.length === 0) {
        res
          .status(404)
          .json({ status: 404, error: 'Not Found', message: 'Activo digital no encontrado.' });
        return;
      }

      const asset = assetRows[0];
      const actor = {
        id: req.user!.userId,
        role: req.user!.role,
        tenantId,
      };
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'EDIT', {
        tenantId: asset.tenant_id,
        workspaceId: asset.workspace_id,
        collectionId: asset.collection_id,
        status: asset.status,
        deletedAt: asset.deleted_at,
      });
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL).',
        });
        return;
      }

      // Verify all tags belong to tenant
      for (const tagId of tag_ids) {
        const tagRows = await query<any[]>('SELECT id FROM tags WHERE id = ? AND tenant_id = ?', [
          tagId,
          tenantId,
        ]);
        if (!tagRows || tagRows.length === 0) {
          res.status(400).json({
            status: 400,
            error: 'Bad Request',
            message: `La etiqueta ID ${tagId} no existe o no pertenece a este tenant.`,
          });
          return;
        }

        await query<any>('INSERT IGNORE INTO asset_tags (asset_id, tag_id) VALUES (?, ?)', [
          assetId,
          tagId,
        ]);
      }

      await logSecurityEvent(req, {
        eventType: 'ASSET_TAGS_ATTACHED',
        userId: Number(req.user?.userId),
        status: 'SUCCESS',
        details: `Attached tags [${tag_ids.join(', ')}] to asset ID ${assetId}`,
      });

      res.status(200).json({
        status: 200,
        message: 'Etiquetas vinculadas exitosamente al activo digital.',
        data: {
          assetId,
          tagIds: tag_ids,
        },
      });
    } catch (err: any) {
      console.error('Attach tags error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al vincular etiquetas.',
      });
    }
  },
);

/**
 * DELETE /api/v1/assets/:id/tags/:tagId
 * Detach a tag from an asset with Anti-IDOR validation.
 */
router.delete(
  '/:id/tags/:tagId',
  tagsRateLimiter,
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = getActorTenantId(req);
      const assetId = parseInt(String(req.params.id), 10);
      const tagId = parseInt(String(req.params.tagId), 10);

      if (isNaN(assetId) || isNaN(tagId)) {
        res
          .status(400)
          .json({ status: 400, error: 'Bad Request', message: 'Parámetros inválidos.' });
        return;
      }

      // Anti-IDOR: Check asset ownership
      const assetRows = await query<any[]>(
        'SELECT id, tenant_id, workspace_id, collection_id, status, deleted_at FROM assets WHERE id = ? AND tenant_id = ? AND status = "ACTIVE" AND deleted_at IS NULL',
        [assetId, tenantId],
      );

      if (!assetRows || assetRows.length === 0) {
        res
          .status(404)
          .json({ status: 404, error: 'Not Found', message: 'Activo digital no encontrado.' });
        return;
      }

      const asset = assetRows[0];
      const actor = {
        id: req.user!.userId,
        role: req.user!.role,
        tenantId,
      };
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'EDIT', {
        tenantId: asset.tenant_id,
        workspaceId: asset.workspace_id,
        collectionId: asset.collection_id,
        status: asset.status,
        deletedAt: asset.deleted_at,
      });
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL).',
        });
        return;
      }

      await query<any>('DELETE FROM asset_tags WHERE asset_id = ? AND tag_id = ?', [
        assetId,
        tagId,
      ]);

      await logSecurityEvent(req, {
        eventType: 'ASSET_TAG_DETACHED',
        userId: Number(req.user?.userId),
        status: 'SUCCESS',
        details: `Detached tag ID ${tagId} from asset ID ${assetId}`,
      });

      res.status(200).json({
        status: 200,
        message: 'Etiqueta desvinculada exitosamente.',
        data: {
          assetId,
          tagId,
        },
      });
    } catch (err: any) {
      console.error('Detach tag error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al desvincular etiqueta.',
      });
    }
  },
);

/**
 * GET /api/v1/assets/:id/metadata
 * Retrieve custom structured metadata for an asset.
 */
router.get(
  '/:id/metadata',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = getActorTenantId(req);
      const assetId = parseInt(String(req.params.id), 10);

      if (isNaN(assetId)) {
        res
          .status(400)
          .json({ status: 400, error: 'Bad Request', message: 'ID de activo inválido.' });
        return;
      }

      // Anti-IDOR
      const assetRows = await query<any[]>(
        'SELECT id, tenant_id, workspace_id, collection_id, status, deleted_at FROM assets WHERE id = ? AND tenant_id = ? AND status = "ACTIVE" AND deleted_at IS NULL',
        [assetId, tenantId],
      );

      if (!assetRows || assetRows.length === 0) {
        res
          .status(404)
          .json({ status: 404, error: 'Not Found', message: 'Activo digital no encontrado.' });
        return;
      }

      const asset = assetRows[0];
      const actor = {
        id: req.user!.userId,
        role: req.user!.role,
        tenantId,
      };
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'VIEW', {
        tenantId: asset.tenant_id,
        workspaceId: asset.workspace_id,
        collectionId: asset.collection_id,
        status: asset.status,
        deletedAt: asset.deleted_at,
      });
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL).',
        });
        return;
      }

      const metaRows = await query<any[]>(
        'SELECT id, meta_key, meta_value, data_type, created_at, updated_at FROM asset_metadata WHERE asset_id = ? ORDER BY meta_key ASC',
        [assetId],
      );

      res.status(200).json({
        status: 200,
        data: metaRows.map((m) => ({
          id: m.id,
          metaKey: m.meta_key,
          metaValue: m.meta_value,
          dataType: m.data_type,
          createdAt: m.created_at,
          updatedAt: m.updated_at,
        })),
      });
    } catch (err: any) {
      console.error('Get metadata error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al consultar metadatos.',
      });
    }
  },
);

/**
 * PUT /api/v1/assets/:id/metadata
 * Upsert structured metadata for an asset with JSON validation & anti-IDOR.
 */
router.put(
  '/:id/metadata',
  tagsRateLimiter,
  requireAuth,
  validate(assetMetadataSchema),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = getActorTenantId(req);
      const assetId = parseInt(String(req.params.id), 10);
      const { meta_key, meta_value, data_type = 'STRING' } = req.body;

      if (isNaN(assetId)) {
        res
          .status(400)
          .json({ status: 400, error: 'Bad Request', message: 'ID de activo inválido.' });
        return;
      }

      // Anti-IDOR
      const assetRows = await query<any[]>(
        'SELECT id, tenant_id, workspace_id, collection_id, status, deleted_at FROM assets WHERE id = ? AND tenant_id = ? AND status = "ACTIVE" AND deleted_at IS NULL',
        [assetId, tenantId],
      );

      if (!assetRows || assetRows.length === 0) {
        res
          .status(404)
          .json({ status: 404, error: 'Not Found', message: 'Activo digital no encontrado.' });
        return;
      }

      const asset = assetRows[0];
      const actor = {
        id: req.user!.userId,
        role: req.user!.role,
        tenantId,
      };
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'EDIT', {
        tenantId: asset.tenant_id,
        workspaceId: asset.workspace_id,
        collectionId: asset.collection_id,
        status: asset.status,
        deletedAt: asset.deleted_at,
      });
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL).',
        });
        return;
      }

      // Validate JSON data_type
      if (data_type === 'JSON') {
        try {
          JSON.parse(meta_value);
        } catch (_jsonErr) {
          res.status(400).json({
            status: 400,
            error: 'Bad Request',
            message: 'El valor no es un JSON válido para data_type=JSON.',
          });
          return;
        }
      }

      await query<any>(
        `INSERT INTO asset_metadata (asset_id, meta_key, meta_value, data_type)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE meta_value = VALUES(meta_value), data_type = VALUES(data_type), updated_at = NOW()`,
        [assetId, meta_key, meta_value, data_type],
      );

      await logSecurityEvent(req, {
        eventType: 'ASSET_METADATA_UPSERT',
        userId: Number(req.user?.userId),
        status: 'SUCCESS',
        details: `Upserted metadata key "${meta_key}" (${data_type}) on asset ID ${assetId}`,
      });

      res.status(200).json({
        status: 200,
        message: 'Metadatos guardados exitosamente.',
        data: {
          assetId,
          metaKey: meta_key,
          metaValue: meta_value,
          dataType: data_type,
        },
      });
    } catch (err: any) {
      console.error('Upsert metadata error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al guardar metadatos.',
      });
    }
  },
);

/**
 * DELETE /api/v1/assets/:id/metadata/:key
 * Delete a metadata key from an asset with anti-IDOR validation.
 */
router.delete(
  '/:id/metadata/:key',
  tagsRateLimiter,
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = getActorTenantId(req);
      const assetId = parseInt(String(req.params.id), 10);
      const key = String(req.params.key);

      if (isNaN(assetId) || !key) {
        res
          .status(400)
          .json({ status: 400, error: 'Bad Request', message: 'Parámetros inválidos.' });
        return;
      }

      // Anti-IDOR
      const assetRows = await query<any[]>(
        'SELECT id, tenant_id, workspace_id, collection_id, status, deleted_at FROM assets WHERE id = ? AND tenant_id = ? AND status = "ACTIVE" AND deleted_at IS NULL',
        [assetId, tenantId],
      );

      if (!assetRows || assetRows.length === 0) {
        res
          .status(404)
          .json({ status: 404, error: 'Not Found', message: 'Activo digital no encontrado.' });
        return;
      }

      const asset = assetRows[0];
      const actor = {
        id: req.user!.userId,
        role: req.user!.role,
        tenantId,
      };
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'EDIT', {
        tenantId: asset.tenant_id,
        workspaceId: asset.workspace_id,
        collectionId: asset.collection_id,
        status: asset.status,
        deletedAt: asset.deleted_at,
      });
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL).',
        });
        return;
      }

      await query<any>('DELETE FROM asset_metadata WHERE asset_id = ? AND meta_key = ?', [
        assetId,
        key,
      ]);

      await logSecurityEvent(req, {
        eventType: 'ASSET_METADATA_DELETED',
        userId: Number(req.user?.userId),
        status: 'SUCCESS',
        details: `Deleted metadata key "${key}" from asset ID ${assetId}`,
      });

      res.status(200).json({
        status: 200,
        message: 'Metadato eliminado exitosamente.',
        data: {
          assetId,
          metaKey: key,
        },
      });
    } catch (err: any) {
      console.error('Delete metadata error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al eliminar metadato.',
      });
    }
  },
);

/**
 * PATCH /api/v1/assets/:id/location
 * Relocate asset to a different collection and/or workspace within the same tenant.
 * Requires EDIT permission on source asset and EDIT permission on destination collection/workspace.
 */
router.patch(
  '/:id/location',
  requireAuth,
  validate(moveAssetLocationSchema, 'body'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = getActorTenantId(req);
      const assetId = parseInt(String(req.params.id), 10);

      if (isNaN(assetId)) {
        res
          .status(400)
          .json({ status: 400, error: 'Bad Request', message: 'ID de activo inválido.' });
        return;
      }

      const { workspace_id: destWorkspaceId, collection_id: destCollectionId = null } = req.body;

      // 1. Fetch source asset and anti-IDOR check
      const assetRows = await query<any[]>(
        'SELECT id, tenant_id, workspace_id, collection_id, status, deleted_at FROM assets WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL',
        [assetId, tenantId],
      );

      if (!assetRows || assetRows.length === 0) {
        res.status(404).json({
          status: 404,
          error: 'Not Found',
          message: 'Activo no encontrado o ya eliminado.',
        });
        return;
      }

      const asset = assetRows[0];
      const actor = {
        id: req.user!.userId,
        role: req.user!.role,
        tenantId,
      };

      // 2. ACL check on source asset ('EDIT')
      const sourceEval = await evaluateAclPermission(actor, 'ASSET', assetId, 'EDIT', {
        tenantId: asset.tenant_id,
        workspaceId: asset.workspace_id,
        collectionId: asset.collection_id,
        status: asset.status,
        deletedAt: asset.deleted_at,
      });

      if (!sourceEval.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message:
            'Acceso denegado por política de control de acceso (ACL) en el activo de origen.',
        });
        return;
      }

      // 3. Validate destination workspace
      const wsRows = await query<any[]>(
        'SELECT id, tenant_id FROM workspaces WHERE id = ? AND tenant_id = ?',
        [destWorkspaceId, tenantId],
      );

      if (!wsRows || wsRows.length === 0) {
        res.status(400).json({
          status: 400,
          error: 'Bad Request',
          message: 'El espacio de trabajo de destino no existe o pertenece a otro tenant.',
        });
        return;
      }

      // 4. Validate destination collection (if specified) and check ACL
      if (destCollectionId !== null) {
        const colRows = await query<any[]>(
          `SELECT c.id, c.workspace_id, w.tenant_id 
           FROM collections c 
           JOIN workspaces w ON w.id = c.workspace_id 
           WHERE c.id = ? AND w.tenant_id = ? AND c.workspace_id = ?`,
          [destCollectionId, tenantId, destWorkspaceId],
        );

        if (!colRows || colRows.length === 0) {
          res.status(400).json({
            status: 400,
            error: 'Bad Request',
            message:
              'La colección de destino no existe, no pertenece al workspace indicado o es de otro tenant.',
          });
          return;
        }

        const destColEval = await evaluateAclPermission(
          actor,
          'COLLECTION',
          destCollectionId,
          'EDIT',
          {
            tenantId: colRows[0].tenant_id,
            workspaceId: colRows[0].workspace_id,
            collectionId: destCollectionId,
          },
        );
        if (!destColEval.allowed) {
          res.status(403).json({
            status: 403,
            error: 'Forbidden',
            message:
              'Acceso denegado por política de control de acceso (ACL) en la colección de destino.',
          });
          return;
        }
      } else {
        // Root workspace placement: evaluate ACL on destination workspace
        const destWsEval = await evaluateAclPermission(
          actor,
          'WORKSPACE',
          destWorkspaceId,
          'EDIT',
          {
            tenantId: wsRows[0].tenant_id,
            workspaceId: destWorkspaceId,
          },
        );
        if (!destWsEval.allowed) {
          res.status(403).json({
            status: 403,
            error: 'Forbidden',
            message:
              'Acceso denegado por política de control de acceso (ACL) en el espacio de trabajo de destino.',
          });
          return;
        }
      }

      // 5. Update asset location
      await query(
        'UPDATE assets SET workspace_id = ?, collection_id = ? WHERE id = ? AND tenant_id = ?',
        [destWorkspaceId, destCollectionId, assetId, tenantId],
      );

      await logSecurityEvent(req, {
        eventType: 'ASSET_RELOCATED',
        userId: Number(req.user?.userId),
        status: 'SUCCESS',
        details: `Relocated asset ID ${assetId} from ws:${asset.workspace_id}/col:${asset.collection_id} to ws:${destWorkspaceId}/col:${destCollectionId}`,
      });

      res.status(200).json({
        status: 200,
        message: 'Activo reubicado exitosamente.',
        data: {
          assetId,
          previousWorkspaceId: asset.workspace_id,
          previousCollectionId: asset.collection_id,
          newWorkspaceId: destWorkspaceId,
          newCollectionId: destCollectionId,
        },
      });
    } catch (err: any) {
      console.error('Relocate asset error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al reubicar el activo digital.',
      });
    }
  },
);

/**
 * POST /api/v1/assets/:id/versions
 * Upload a new version for an existing asset.
 */
router.post(
  '/:id/versions',
  versionsRateLimiter,
  requireAuth,
  validate(assetIdParamSchema, 'params'),
  upload.single('file'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const assetId = Number(req.params.id);
      const tenantId = getActorTenantId(req);
      const actor = getAssetActor(req);
      const actorId = Number(actor.id);

      if (!req.file || !req.file.buffer) {
        res.status(400).json({
          status: 400,
          error: 'Bad Request',
          message: 'No se proporcionó ningún archivo para la nueva versión.',
        });
        return;
      }

      // 1. Magic bytes validation
      const validatedMime = validateMagicBytes(req.file.buffer);
      if (!validatedMime) {
        await logSecurityEvent(req, {
          eventType: 'ASSET_VERSION_UPLOAD_BLOCKED',
          userId: actorId,
          status: 'BLOCKED',
          details: `Rejected disallowed magic bytes for asset ID ${assetId} version upload: ${req.file.originalname}`,
        });

        res.status(400).json({
          status: 400,
          error: 'Bad Request',
          message: 'Tipo de archivo no permitido o contenido malicioso detectado.',
        });
        return;
      }

      // 2. Fetch parent asset & assert tenant isolation & not deleted
      const assetRows = await query<
        Array<{
          id: number;
          tenant_id: number;
          workspace_id: number;
          collection_id: number;
          title: string;
          status: string;
          deleted_at: string | null;
        }>
      >(
        'SELECT id, tenant_id, workspace_id, collection_id, title, status, deleted_at FROM assets WHERE id = ? AND tenant_id = ?',
        [assetId, tenantId],
      );

      if (
        !assetRows ||
        assetRows.length === 0 ||
        assetRows[0].deleted_at !== null ||
        assetRows[0].status === 'DELETED'
      ) {
        res.status(404).json({
          status: 404,
          error: 'Not Found',
          message: 'Activo digital no encontrado.',
        });
        return;
      }

      const asset = assetRows[0];

      // 3. ACL permission evaluation (requires EDIT on the asset)
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'EDIT', {
        tenantId: asset.tenant_id,
        workspaceId: asset.workspace_id,
        collectionId: asset.collection_id,
        assetId,
      });

      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL).',
        });
        return;
      }

      // 4. Calculate SHA-256 and determine atomic next version number
      const sha256Hash = computeBufferSha256(req.file.buffer);

      const maxVerRows = await query<Array<{ max_version: number | null }>>(
        'SELECT MAX(version_number) AS max_version FROM asset_versions WHERE asset_id = ?',
        [assetId],
      );
      const nextVersion = Number(maxVerRows?.[0]?.max_version || 0) + 1;

      // 5. Store file on NVMe storage
      const assetDir = path.join(
        STORAGE_ROOT,
        'tenants',
        String(tenantId),
        'assets',
        String(assetId),
      );
      fs.mkdirSync(assetDir, { recursive: true });

      const fileName = `v${nextVersion}_${sha256Hash}.${validatedMime.ext}`;
      const filePath = path.join(assetDir, fileName);
      assertPathContained(filePath);

      fs.writeFileSync(filePath, req.file.buffer);

      // 6. Insert new asset version record
      const versionInsertRes = await query<any>(
        `INSERT INTO asset_versions (asset_id, version_number, byte_size, sha256_hash, file_path, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [assetId, nextVersion, req.file.buffer.length, sha256Hash, filePath, actorId],
      );
      const versionId = versionInsertRes.insertId;

      // 7. Generate Derivatives for image files
      const derivativesDir = path.join(assetDir, 'derivatives', `v${nextVersion}`);
      const generatedDerivatives = await generateWebPDerivatives(
        req.file.buffer,
        validatedMime.mime,
        derivativesDir,
      );

      for (const d of generatedDerivatives) {
        await query<any>(
          `INSERT INTO asset_derivatives (version_id, derivative_type, width, height, byte_size, file_path)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [versionId, d.derivativeType, d.width, d.height, d.byteSize, d.filePath],
        );
      }

      // 8. Enqueue Media Processing Job (FC 011)
      await enqueueMediaJob(tenantId, assetId, versionId, validatedMime.mime);

      // 9. Audit log
      await logSecurityEvent(req, {
        eventType: 'ASSET_VERSION_UPLOAD',
        userId: actorId,
        status: 'SUCCESS',
        details: `Uploaded new version v${nextVersion} for asset ID ${assetId} (${asset.title}) [${sha256Hash}]`,
      });

      // 10. Dispatch Webhook Event (FC 012 - fire-and-forget)
      void dispatchWebhookEvent(tenantId, 'version.created', {
        asset_id: assetId,
        version_id: versionId,
        version_number: nextVersion,
        mime_type: validatedMime.mime,
        byte_size: req.file.buffer.length,
      });

      res.status(201).json({
        status: 201,
        message: 'Nueva versión de activo cargada exitosamente.',
        data: {
          versionId,
          versionNumber: nextVersion,
          byteSize: req.file.buffer.length,
          sha256Hash,
          mimeType: validatedMime.mime,
        },
      });
    } catch (err: any) {
      console.error('Upload asset version error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al cargar la nueva versión del activo.',
      });
    }
  },
);

/**
 * GET /api/v1/assets/:id/versions
 * List all versions of an asset ordered by version_number DESC.
 */
router.get(
  '/:id/versions',
  versionsRateLimiter,
  requireAuth,
  validate(assetIdParamSchema, 'params'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const assetId = Number(req.params.id);
      const tenantId = getActorTenantId(req);
      const actor = getAssetActor(req);

      // 1. Fetch parent asset
      const assetRows = await query<
        Array<{
          id: number;
          tenant_id: number;
          workspace_id: number;
          collection_id: number;
          status: string;
          deleted_at: string | null;
        }>
      >(
        'SELECT id, tenant_id, workspace_id, collection_id, status, deleted_at FROM assets WHERE id = ? AND tenant_id = ?',
        [assetId, tenantId],
      );

      if (
        !assetRows ||
        assetRows.length === 0 ||
        assetRows[0].deleted_at !== null ||
        assetRows[0].status === 'DELETED'
      ) {
        res.status(404).json({
          status: 404,
          error: 'Not Found',
          message: 'Activo digital no encontrado.',
        });
        return;
      }

      const asset = assetRows[0];

      // 2. ACL check (VIEW)
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'VIEW', {
        tenantId: asset.tenant_id,
        workspaceId: asset.workspace_id,
        collectionId: asset.collection_id,
        assetId,
      });

      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL).',
        });
        return;
      }

      // 3. Query versions
      const versions = await query<
        Array<{
          id: number;
          version_number: number;
          byte_size: number | string;
          sha256_hash: string;
          created_by: number;
          created_at: string;
        }>
      >(
        'SELECT id, version_number, byte_size, sha256_hash, created_by, created_at FROM asset_versions WHERE asset_id = ? ORDER BY version_number DESC',
        [assetId],
      );

      res.status(200).json({
        status: 200,
        data: (versions || []).map((v) => ({
          id: v.id,
          versionNumber: v.version_number,
          byteSize: Number(v.byte_size || 0),
          sha256Hash: v.sha256_hash,
          createdBy: v.created_by,
          createdAt: v.created_at,
        })),
      });
    } catch (err: any) {
      console.error('List asset versions error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al consultar el historial de versiones del activo.',
      });
    }
  },
);

/**
 * GET /api/v1/assets/:id/versions/:versionNumber/stream
 * Stream or download a specific historical version binary.
 */
router.get(
  '/:id/versions/:versionNumber/stream',
  versionsRateLimiter,
  requireAuth,
  validate(assetVersionParamsSchema, 'params'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const assetId = Number(req.params.id);
      const versionNumber = Number(req.params.versionNumber);
      const tenantId = getActorTenantId(req);
      const actor = getAssetActor(req);

      // 1. Fetch parent asset
      const assetRows = await query<
        Array<{
          id: number;
          tenant_id: number;
          workspace_id: number;
          collection_id: number;
          title: string;
          mime_type: string;
          status: string;
          deleted_at: string | null;
          storage_tier: 'HOT' | 'ARCHIVED';
          embargo_until: string | Date | null;
          expires_at: string | Date | null;
        }>
      >(
        'SELECT a.id, a.tenant_id, a.workspace_id, a.collection_id, a.title, a.mime_type, a.status, a.deleted_at, a.storage_tier, r.embargo_until, r.expires_at FROM assets a LEFT JOIN asset_rights r ON r.asset_id = a.id WHERE a.id = ? AND a.tenant_id = ?',
        [assetId, tenantId],
      );

      if (
        !assetRows ||
        assetRows.length === 0 ||
        assetRows[0].deleted_at !== null ||
        assetRows[0].status === 'DELETED'
      ) {
        res.status(404).json({
          status: 404,
          error: 'Not Found',
          message: 'Activo digital no encontrado.',
        });
        return;
      }

      const asset = assetRows[0];

      if (asset.storage_tier === 'ARCHIVED') {
        const archivalStatus = await getArchivalStatus(tenantId, assetId);
        if (archivalStatus && !archivalStatus.is_restored) {
          res.status(409).json({
            status: 409,
            error: 'Conflict',
            message:
              'El activo digital se encuentra archivado en almacenamiento frío (Glacier) y requiere ser restaurado previamente.',
            data: {
              storage_tier: 'ARCHIVED',
              restoration_status: archivalStatus.restoration_status,
            },
          });
          return;
        }
      }

      // 2. ACL check (DOWNLOAD)
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'DOWNLOAD', {
        tenantId: asset.tenant_id,
        workspaceId: asset.workspace_id,
        collectionId: asset.collection_id,
        assetId,
      });

      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL).',
        });
        return;
      }

      const embargoCheck = checkAssetEmbargoAndExpiration(
        { embargo_until: asset.embargo_until, expires_at: asset.expires_at },
        actor.role,
      );
      if (!embargoCheck.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: embargoCheck.reason,
        });
        return;
      }

      // 3. Fetch version record
      const versionRows = await query<
        Array<{
          id: number;
          version_number: number;
          byte_size: number | string;
          sha256_hash: string;
          file_path: string;
        }>
      >(
        'SELECT id, version_number, byte_size, sha256_hash, file_path FROM asset_versions WHERE asset_id = ? AND version_number = ?',
        [assetId, versionNumber],
      );

      if (!versionRows || versionRows.length === 0) {
        res.status(404).json({
          status: 404,
          error: 'Not Found',
          message: 'Versión de activo no encontrada.',
        });
        return;
      }

      const version = versionRows[0];

      // 4. Assert path containment & file existence
      assertPathContained(version.file_path);

      if (!fs.existsSync(version.file_path)) {
        res.status(404).json({
          status: 404,
          error: 'Not Found',
          message: 'Archivo físico de versión no encontrado.',
        });
        return;
      }

      // 5. Audit log
      await logSecurityEvent(req, {
        eventType: 'ASSET_VERSION_STREAM',
        userId: Number(actor.id),
        status: 'SUCCESS',
        details: `Streamed version v${versionNumber} for asset ID ${assetId} (${asset.title}) [${version.sha256_hash}]`,
      });

      // 6. Set response headers & stream
      res.setHeader('Content-Type', asset.mime_type);
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(asset.title)}"`);
      res.setHeader('Content-Length', version.byte_size);
      res.setHeader('ETag', `"${version.sha256_hash}"`);
      res.setHeader('Cache-Control', 'private, max-age=3600');

      void recordAnalyticsEvent({
        tenant_id: asset.tenant_id,
        asset_id: assetId,
        event_type: 'STREAM',
        actor_id: Number(actor.id),
        actor_type: 'USER',
        bytes_served: Number(version.byte_size),
        ip: req.ip,
        user_agent: req.headers['user-agent'],
        referer: req.headers['referer'] as string | undefined,
      });

      fs.createReadStream(version.file_path).pipe(res);
    } catch (err: any) {
      console.error('Stream asset version error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al transmitir la versión del activo.',
      });
    }
  },
);

/**
 * GET /api/v1/assets/:id/versions/:versionNumber/thumbnail
 * Stream thumbnail for a specific historical version.
 */
router.get(
  '/:id/versions/:versionNumber/thumbnail',
  versionsRateLimiter,
  requireAuth,
  validate(assetVersionParamsSchema, 'params'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const assetId = Number(req.params.id);
      const versionNumber = Number(req.params.versionNumber);
      const tenantId = getActorTenantId(req);
      const actor = getAssetActor(req);

      // 1. Fetch parent asset
      const assetRows = await query<
        Array<{
          id: number;
          tenant_id: number;
          workspace_id: number;
          collection_id: number;
          status: string;
          deleted_at: string | null;
          storage_tier: 'HOT' | 'ARCHIVED';
          embargo_until: string | Date | null;
          expires_at: string | Date | null;
        }>
      >(
        'SELECT a.id, a.tenant_id, a.workspace_id, a.collection_id, a.status, a.deleted_at, a.storage_tier, r.embargo_until, r.expires_at FROM assets a LEFT JOIN asset_rights r ON r.asset_id = a.id WHERE a.id = ? AND a.tenant_id = ?',
        [assetId, tenantId],
      );

      if (
        !assetRows ||
        assetRows.length === 0 ||
        assetRows[0].deleted_at !== null ||
        assetRows[0].status === 'DELETED'
      ) {
        res.status(404).json({
          status: 404,
          error: 'Not Found',
          message: 'Activo digital no encontrado.',
        });
        return;
      }

      const asset = assetRows[0];

      if (asset.storage_tier === 'ARCHIVED') {
        const archivalStatus = await getArchivalStatus(tenantId, assetId);
        if (archivalStatus && !archivalStatus.is_restored) {
          res.status(409).json({
            status: 409,
            error: 'Conflict',
            message:
              'El activo digital se encuentra archivado en almacenamiento frío (Glacier) y requiere ser restaurado previamente.',
            data: {
              storage_tier: 'ARCHIVED',
              restoration_status: archivalStatus.restoration_status,
            },
          });
          return;
        }
      }

      // 2. ACL check (VIEW)
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'VIEW', {
        tenantId: asset.tenant_id,
        workspaceId: asset.workspace_id,
        collectionId: asset.collection_id,
        assetId,
      });

      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL).',
        });
        return;
      }

      const embargoCheck = checkAssetEmbargoAndExpiration(
        { embargo_until: asset.embargo_until, expires_at: asset.expires_at },
        actor.role,
      );
      if (!embargoCheck.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: embargoCheck.reason,
        });
        return;
      }

      // 3. Fetch version derivative
      const derivativeRows = await query<
        Array<{
          file_path: string;
          byte_size: number | string;
        }>
      >(
        `SELECT d.file_path, d.byte_size
         FROM asset_versions v
         JOIN asset_derivatives d ON d.version_id = v.id AND d.derivative_type = 'THUMBNAIL_200W'
         WHERE v.asset_id = ? AND v.version_number = ?`,
        [assetId, versionNumber],
      );

      if (!derivativeRows || derivativeRows.length === 0) {
        res.status(404).json({
          status: 404,
          error: 'Not Found',
          message: 'Miniatura no disponible para esta versión.',
        });
        return;
      }

      const derivative = derivativeRows[0];
      assertPathContained(derivative.file_path);

      if (!fs.existsSync(derivative.file_path)) {
        res.status(404).json({
          status: 404,
          error: 'Not Found',
          message: 'Archivo de miniatura no encontrado en almacenamiento.',
        });
        return;
      }

      res.setHeader('Content-Type', 'image/webp');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      fs.createReadStream(derivative.file_path).pipe(res);
    } catch (err: any) {
      console.error('Stream asset version thumbnail error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al consultar la miniatura de la versión.',
      });
    }
  },
);

/**
 * POST /api/v1/assets/:id/versions/:versionNumber/promote
 * Promote an existing historical version to a new HEAD version.
 * (Preserves immutability: copies payload/hash to a new version record MAX + 1).
 */
router.post(
  '/:id/versions/:versionNumber/promote',
  versionsRateLimiter,
  requireAuth,
  validate(assetVersionParamsSchema, 'params'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const assetId = Number(req.params.id);
      const versionNumber = Number(req.params.versionNumber);
      const tenantId = getActorTenantId(req);
      const actor = getAssetActor(req);
      const actorId = Number(actor.id);

      // 1. Fetch parent asset
      const assetRows = await query<
        Array<{
          id: number;
          tenant_id: number;
          workspace_id: number;
          collection_id: number;
          title: string;
          status: string;
          deleted_at: string | null;
        }>
      >(
        'SELECT id, tenant_id, workspace_id, collection_id, title, status, deleted_at FROM assets WHERE id = ? AND tenant_id = ?',
        [assetId, tenantId],
      );

      if (
        !assetRows ||
        assetRows.length === 0 ||
        assetRows[0].deleted_at !== null ||
        assetRows[0].status === 'DELETED'
      ) {
        res.status(404).json({
          status: 404,
          error: 'Not Found',
          message: 'Activo digital no encontrado.',
        });
        return;
      }

      const asset = assetRows[0];

      // 2. ACL check (requires EDIT on asset)
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'EDIT', {
        tenantId: asset.tenant_id,
        workspaceId: asset.workspace_id,
        collectionId: asset.collection_id,
        assetId,
      });

      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL).',
        });
        return;
      }

      // 3. Fetch source version to promote
      const sourceVerRows = await query<
        Array<{
          id: number;
          version_number: number;
          byte_size: number | string;
          sha256_hash: string;
          file_path: string;
        }>
      >(
        'SELECT id, version_number, byte_size, sha256_hash, file_path FROM asset_versions WHERE asset_id = ? AND version_number = ?',
        [assetId, versionNumber],
      );

      if (!sourceVerRows || sourceVerRows.length === 0) {
        res.status(404).json({
          status: 404,
          error: 'Not Found',
          message: 'Versión de activo a promover no encontrada.',
        });
        return;
      }

      const sourceVersion = sourceVerRows[0];

      // 4. Determine new HEAD version number
      const maxVerRows = await query<Array<{ max_version: number | null }>>(
        'SELECT MAX(version_number) AS max_version FROM asset_versions WHERE asset_id = ?',
        [assetId],
      );
      const nextVersion = Number(maxVerRows?.[0]?.max_version || 0) + 1;

      // 5. Insert new version copying physical path and hash (Invariante 2: inmutabilidad)
      const newVerInsertRes = await query<any>(
        `INSERT INTO asset_versions (asset_id, version_number, byte_size, sha256_hash, file_path, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          assetId,
          nextVersion,
          sourceVersion.byte_size,
          sourceVersion.sha256_hash,
          sourceVersion.file_path,
          actorId,
        ],
      );
      const newVersionId = newVerInsertRes.insertId;

      // 6. Copy any existing derivatives to link to new version
      await query(
        `INSERT INTO asset_derivatives (version_id, derivative_type, width, height, byte_size, file_path)
         SELECT ?, derivative_type, width, height, byte_size, file_path
         FROM asset_derivatives
         WHERE version_id = ?`,
        [newVersionId, sourceVersion.id],
      );

      // 7. Audit log
      await logSecurityEvent(req, {
        eventType: 'ASSET_VERSION_PROMOTE',
        userId: actorId,
        status: 'SUCCESS',
        details: `Promoted version v${versionNumber} to new HEAD v${nextVersion} for asset ID ${assetId} (${asset.title})`,
      });

      res.status(200).json({
        status: 200,
        message: 'Versión promovida exitosamente como nueva versión activa.',
        data: {
          promotedFromVersion: versionNumber,
          newHeadVersionNumber: nextVersion,
          versionId: newVersionId,
          sha256Hash: sourceVersion.sha256_hash,
          byteSize: Number(sourceVersion.byte_size),
        },
      });
    } catch (err: any) {
      console.error('Promote asset version error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al promover la versión del activo.',
      });
    }
  },
);

/**
 * POST /api/v1/assets/batch/download
 * Download multiple selected assets in an on-the-fly compressed ZIP archive.
 */
router.post(
  '/batch/download',
  batchRateLimiter,
  requireAuth,
  validate(batchAssetIdsSchema, 'body'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { asset_ids } = req.body as BatchAssetIdsInput;
      const tenantId = getActorTenantId(req);
      const actor = getAssetActor(req);

      // 1. Fetch active assets for this tenant
      const placeholders = asset_ids.map(() => '?').join(',');
      const rows = await query<
        Array<{
          id: number;
          tenant_id: number;
          workspace_id: number;
          collection_id: number;
          title: string;
          mime_type: string;
          status: string;
          deleted_at: string | null;
          file_path: string;
          sha256_hash: string;
          byte_size: number | string;
          embargo_until: string | Date | null;
          expires_at: string | Date | null;
        }>
      >(
        `SELECT a.id, a.tenant_id, a.workspace_id, a.collection_id, a.title, a.mime_type, a.status, a.deleted_at,
                v.file_path, v.sha256_hash, v.byte_size,
                r.embargo_until, r.expires_at
         FROM assets a
         JOIN asset_versions v ON v.asset_id = a.id AND v.version_number = (
           SELECT MAX(v2.version_number) FROM asset_versions v2 WHERE v2.asset_id = a.id
         )
         LEFT JOIN asset_rights r ON r.asset_id = a.id
         WHERE a.id IN (${placeholders}) AND a.tenant_id = ? AND a.deleted_at IS NULL AND a.status = 'ACTIVE'`,
        [...asset_ids, tenantId],
      );

      if (!rows || rows.length === 0) {
        res.status(404).json({
          status: 404,
          error: 'Not Found',
          message: 'Ningún activo válido encontrado para descargar.',
        });
        return;
      }

      // 2. Evaluate ACL DOWNLOAD permission and embargo/expiration for each asset
      const authorizedAssets: typeof rows = [];
      for (const asset of rows) {
        const evalResult = await evaluateAclPermission(actor, 'ASSET', asset.id, 'DOWNLOAD', {
          tenantId: asset.tenant_id,
          workspaceId: asset.workspace_id,
          collectionId: asset.collection_id,
          assetId: asset.id,
        });

        const rightsCheck = checkAssetEmbargoAndExpiration(
          { embargo_until: asset.embargo_until, expires_at: asset.expires_at },
          actor.role,
        );

        if (evalResult.allowed && rightsCheck.allowed && fs.existsSync(asset.file_path)) {
          assertPathContained(asset.file_path);
          authorizedAssets.push(asset);
        }
      }

      if (authorizedAssets.length === 0) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message:
            'Acceso denegado por política de control de acceso (ACL) para todos los activos solicitados.',
        });
        return;
      }

      // 3. Create ZIP archive and append files with deduplication
      const archive = new archiver.ZipArchive({
        zlib: { level: 6 },
      });

      const usedNames = new Set<string>();
      for (const asset of authorizedAssets) {
        let sanitizedName = path.basename(asset.title).replace(/[/\\?%*:|"<>]/g, '_');
        if (!sanitizedName) sanitizedName = `asset_${asset.id}`;

        let finalName = sanitizedName;
        let counter = 1;
        const ext = path.extname(sanitizedName);
        const nameWithoutExt = ext ? sanitizedName.slice(0, -ext.length) : sanitizedName;

        while (usedNames.has(finalName)) {
          finalName = `${nameWithoutExt} (${counter})${ext}`;
          counter++;
        }
        usedNames.add(finalName);

        archive.append(fs.readFileSync(asset.file_path), { name: finalName });
      }

      await logSecurityEvent(req, {
        eventType: 'ASSET_BATCH_DOWNLOAD',
        userId: Number(actor.id),
        status: 'SUCCESS',
        details: `Batch downloaded ${authorizedAssets.length} assets in ZIP: [${authorizedAssets.map((a) => a.id).join(', ')}]`,
      });

      // 4. Set headers, pipe to response, and finalize
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="assets_export_${timestamp}.zip"`,
      );

      archive.pipe(res);
      await archive.finalize();
    } catch (err: any) {
      console.error('Batch download error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al procesar la descarga masiva de activos.',
      });
    }
  },
);

/**
 * POST /api/v1/assets/batch/relocate
 * Relocate multiple assets to a destination workspace/collection.
 */
router.post(
  '/batch/relocate',
  batchRateLimiter,
  requireAuth,
  validate(batchRelocateSchema, 'body'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { asset_ids, workspace_id, collection_id } = req.body as BatchRelocateInput;
      const tenantId = getActorTenantId(req);
      const actor = getAssetActor(req);

      const destWorkspaceId = Number(workspace_id);
      const destCollectionId =
        collection_id !== undefined && collection_id !== null ? Number(collection_id) : null;

      // 1. Validate destination workspace
      const wsRows = await query<Array<{ id: number; tenant_id: number }>>(
        'SELECT id, tenant_id FROM workspaces WHERE id = ? AND tenant_id = ?',
        [destWorkspaceId, tenantId],
      );

      if (!wsRows || wsRows.length === 0) {
        res.status(404).json({
          status: 404,
          error: 'Not Found',
          message: 'Espacio de trabajo de destino no encontrado.',
        });
        return;
      }

      // 2. Validate destination collection if provided
      if (destCollectionId !== null) {
        const colRows = await query<Array<{ id: number; workspace_id: number }>>(
          'SELECT id, workspace_id FROM collections WHERE id = ? AND workspace_id = ?',
          [destCollectionId, destWorkspaceId],
        );
        if (!colRows || colRows.length === 0) {
          res.status(400).json({
            status: 400,
            error: 'Bad Request',
            message: 'La colección de destino no pertenece al espacio de trabajo especificado.',
          });
          return;
        }

        const destColEval = await evaluateAclPermission(
          actor,
          'COLLECTION',
          destCollectionId,
          'EDIT',
          {
            tenantId,
            workspaceId: destWorkspaceId,
            collectionId: destCollectionId,
          },
        );
        if (!destColEval.allowed) {
          res.status(403).json({
            status: 403,
            error: 'Forbidden',
            message:
              'Acceso denegado por política de control de acceso (ACL) en la colección de destino.',
          });
          return;
        }
      } else {
        const destWsEval = await evaluateAclPermission(
          actor,
          'WORKSPACE',
          destWorkspaceId,
          'EDIT',
          {
            tenantId,
            workspaceId: destWorkspaceId,
          },
        );
        if (!destWsEval.allowed) {
          res.status(403).json({
            status: 403,
            error: 'Forbidden',
            message:
              'Acceso denegado por política de control de acceso (ACL) en el espacio de trabajo de destino.',
          });
          return;
        }
      }

      // 3. Fetch candidate assets within tenant
      const placeholders = asset_ids.map(() => '?').join(',');
      const candidateAssets = await query<
        Array<{
          id: number;
          tenant_id: number;
          workspace_id: number;
          collection_id: number | null;
          status: string;
          deleted_at: string | null;
        }>
      >(
        `SELECT id, tenant_id, workspace_id, collection_id, status, deleted_at
         FROM assets
         WHERE id IN (${placeholders}) AND tenant_id = ? AND deleted_at IS NULL AND status = 'ACTIVE'`,
        [...asset_ids, tenantId],
      );

      const relocatedAssetIds: number[] = [];
      const failedAssetIds: number[] = [];

      for (const asset of candidateAssets) {
        const evalResult = await evaluateAclPermission(actor, 'ASSET', asset.id, 'EDIT', {
          tenantId: asset.tenant_id,
          workspaceId: asset.workspace_id,
          collectionId: asset.collection_id,
          assetId: asset.id,
        });
        if (evalResult.allowed) {
          relocatedAssetIds.push(asset.id);
        } else {
          failedAssetIds.push(asset.id);
        }
      }

      for (const reqId of asset_ids) {
        if (!relocatedAssetIds.includes(reqId) && !failedAssetIds.includes(reqId)) {
          failedAssetIds.push(reqId);
        }
      }

      if (relocatedAssetIds.length > 0) {
        const updatePlaceholders = relocatedAssetIds.map(() => '?').join(',');
        await query(
          `UPDATE assets SET workspace_id = ?, collection_id = ? WHERE id IN (${updatePlaceholders}) AND tenant_id = ?`,
          [destWorkspaceId, destCollectionId, ...relocatedAssetIds, tenantId],
        );
      }

      await logSecurityEvent(req, {
        eventType: 'ASSET_BATCH_RELOCATE',
        userId: Number(actor.id),
        status: 'SUCCESS',
        details: `Batch relocated ${relocatedAssetIds.length} assets to ws:${destWorkspaceId}/col:${destCollectionId}`,
      });

      res.status(200).json({
        status: 200,
        message: 'Operación de reubicación masiva completada.',
        data: {
          relocated_count: relocatedAssetIds.length,
          relocated_asset_ids: relocatedAssetIds,
          failed_asset_ids: failedAssetIds,
          destination_workspace_id: destWorkspaceId,
          destination_collection_id: destCollectionId,
        },
      });
    } catch (err: any) {
      console.error('Batch relocate error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al procesar la reubicación masiva de activos.',
      });
    }
  },
);

/**
 * POST /api/v1/assets/batch/tags/assign
 * Bulk assign tags to multiple assets.
 */
router.post(
  '/batch/tags/assign',
  batchRateLimiter,
  requireAuth,
  validate(batchTagsSchema, 'body'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { asset_ids, tag_ids } = req.body as BatchTagsInput;
      const tenantId = getActorTenantId(req);
      const actor = getAssetActor(req);

      // 1. Verify tag ownership
      const tagPlaceholders = tag_ids.map(() => '?').join(',');
      const validTags = await query<Array<{ id: number }>>(
        `SELECT id FROM tags WHERE id IN (${tagPlaceholders}) AND tenant_id = ?`,
        [...tag_ids, tenantId],
      );
      const validTagIds = validTags.map((t) => t.id);

      if (validTagIds.length === 0) {
        res.status(404).json({
          status: 404,
          error: 'Not Found',
          message: 'Ninguna de las etiquetas especificadas fue encontrada.',
        });
        return;
      }

      // 2. Fetch candidate assets
      const assetPlaceholders = asset_ids.map(() => '?').join(',');
      const candidateAssets = await query<
        Array<{
          id: number;
          tenant_id: number;
          workspace_id: number;
          collection_id: number;
        }>
      >(
        `SELECT id, tenant_id, workspace_id, collection_id
         FROM assets
         WHERE id IN (${assetPlaceholders}) AND tenant_id = ? AND deleted_at IS NULL AND status = 'ACTIVE'`,
        [...asset_ids, tenantId],
      );

      const processedAssetIds: number[] = [];
      const failedAssetIds: number[] = [];

      for (const asset of candidateAssets) {
        const evalResult = await evaluateAclPermission(actor, 'ASSET', asset.id, 'EDIT', {
          tenantId: asset.tenant_id,
          workspaceId: asset.workspace_id,
          collectionId: asset.collection_id,
          assetId: asset.id,
        });
        if (evalResult.allowed) {
          processedAssetIds.push(asset.id);
        } else {
          failedAssetIds.push(asset.id);
        }
      }

      for (const reqId of asset_ids) {
        if (!processedAssetIds.includes(reqId) && !failedAssetIds.includes(reqId)) {
          failedAssetIds.push(reqId);
        }
      }

      // 3. Batch insert ignore into asset_tags
      if (processedAssetIds.length > 0) {
        const insertValues: string[] = [];
        const insertParams: any[] = [];
        for (const aId of processedAssetIds) {
          for (const tId of validTagIds) {
            insertValues.push('(?, ?)');
            insertParams.push(aId, tId);
          }
        }
        await query(
          `INSERT IGNORE INTO asset_tags (asset_id, tag_id) VALUES ${insertValues.join(', ')}`,
          insertParams,
        );
      }

      await logSecurityEvent(req, {
        eventType: 'ASSET_BATCH_TAGS_ASSIGN',
        userId: Number(actor.id),
        status: 'SUCCESS',
        details: `Batch assigned ${validTagIds.length} tags to ${processedAssetIds.length} assets`,
      });

      res.status(200).json({
        status: 200,
        message: 'Asignación masiva de etiquetas completada.',
        data: {
          assigned_count: processedAssetIds.length,
          processed_asset_ids: processedAssetIds,
          failed_asset_ids: failedAssetIds,
          tag_ids: validTagIds,
        },
      });
    } catch (err: any) {
      console.error('Batch tags assign error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al procesar la asignación masiva de etiquetas.',
      });
    }
  },
);

/**
 * POST /api/v1/assets/batch/tags/remove
 * Bulk remove tags from multiple assets.
 */
router.post(
  '/batch/tags/remove',
  batchRateLimiter,
  requireAuth,
  validate(batchTagsSchema, 'body'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { asset_ids, tag_ids } = req.body as BatchTagsInput;
      const tenantId = getActorTenantId(req);
      const actor = getAssetActor(req);

      // 1. Fetch candidate assets
      const assetPlaceholders = asset_ids.map(() => '?').join(',');
      const candidateAssets = await query<
        Array<{
          id: number;
          tenant_id: number;
          workspace_id: number;
          collection_id: number;
        }>
      >(
        `SELECT id, tenant_id, workspace_id, collection_id
         FROM assets
         WHERE id IN (${assetPlaceholders}) AND tenant_id = ? AND deleted_at IS NULL AND status = 'ACTIVE'`,
        [...asset_ids, tenantId],
      );

      const processedAssetIds: number[] = [];
      const failedAssetIds: number[] = [];

      for (const asset of candidateAssets) {
        const evalResult = await evaluateAclPermission(actor, 'ASSET', asset.id, 'EDIT', {
          tenantId: asset.tenant_id,
          workspaceId: asset.workspace_id,
          collectionId: asset.collection_id,
          assetId: asset.id,
        });
        if (evalResult.allowed) {
          processedAssetIds.push(asset.id);
        } else {
          failedAssetIds.push(asset.id);
        }
      }

      for (const reqId of asset_ids) {
        if (!processedAssetIds.includes(reqId) && !failedAssetIds.includes(reqId)) {
          failedAssetIds.push(reqId);
        }
      }

      if (processedAssetIds.length > 0 && tag_ids.length > 0) {
        const delAssetPlaceholders = processedAssetIds.map(() => '?').join(',');
        const delTagPlaceholders = tag_ids.map(() => '?').join(',');
        await query(
          `DELETE FROM asset_tags WHERE asset_id IN (${delAssetPlaceholders}) AND tag_id IN (${delTagPlaceholders})`,
          [...processedAssetIds, ...tag_ids],
        );
      }

      await logSecurityEvent(req, {
        eventType: 'ASSET_BATCH_TAGS_REMOVE',
        userId: Number(actor.id),
        status: 'SUCCESS',
        details: `Batch removed ${tag_ids.length} tags from ${processedAssetIds.length} assets`,
      });

      res.status(200).json({
        status: 200,
        message: 'Desvinculación masiva de etiquetas completada.',
        data: {
          removed_count: processedAssetIds.length,
          processed_asset_ids: processedAssetIds,
          failed_asset_ids: failedAssetIds,
          tag_ids,
        },
      });
    } catch (err: any) {
      console.error('Batch tags remove error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al procesar la desvinculación masiva de etiquetas.',
      });
    }
  },
);

/**
 * POST /api/v1/assets/batch/delete
 * Bulk soft-delete multiple assets.
 */
router.post(
  '/batch/delete',
  batchRateLimiter,
  requireAuth,
  validate(batchAssetIdsSchema, 'body'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { asset_ids } = req.body as BatchAssetIdsInput;
      const tenantId = getActorTenantId(req);
      const actor = getAssetActor(req);

      // 1. Fetch candidate assets
      const assetPlaceholders = asset_ids.map(() => '?').join(',');
      const candidateAssets = await query<
        Array<{
          id: number;
          tenant_id: number;
          workspace_id: number;
          collection_id: number;
        }>
      >(
        `SELECT id, tenant_id, workspace_id, collection_id
         FROM assets
         WHERE id IN (${assetPlaceholders}) AND tenant_id = ? AND deleted_at IS NULL AND status = 'ACTIVE'`,
        [...asset_ids, tenantId],
      );

      const deletedAssetIds: number[] = [];
      const failedAssetIds: number[] = [];

      for (const asset of candidateAssets) {
        const evalResult = await evaluateAclPermission(actor, 'ASSET', asset.id, 'DELETE', {
          tenantId: asset.tenant_id,
          workspaceId: asset.workspace_id,
          collectionId: asset.collection_id,
          assetId: asset.id,
        });
        if (evalResult.allowed) {
          deletedAssetIds.push(asset.id);
        } else {
          failedAssetIds.push(asset.id);
        }
      }

      for (const reqId of asset_ids) {
        if (!deletedAssetIds.includes(reqId) && !failedAssetIds.includes(reqId)) {
          failedAssetIds.push(reqId);
        }
      }

      if (deletedAssetIds.length > 0) {
        const delPlaceholders = deletedAssetIds.map(() => '?').join(',');
        await query(
          `UPDATE assets SET status = 'DELETED', deleted_at = NOW() WHERE id IN (${delPlaceholders}) AND tenant_id = ?`,
          [...deletedAssetIds, tenantId],
        );

        // Dispatch Webhook Events (FC 012 - fire-and-forget)
        for (const dId of deletedAssetIds) {
          void dispatchWebhookEvent(tenantId, 'asset.deleted', { asset_id: dId });
        }
      }

      await logSecurityEvent(req, {
        eventType: 'ASSET_BATCH_DELETE',
        userId: Number(actor.id),
        status: 'SUCCESS',
        details: `Batch soft-deleted ${deletedAssetIds.length} assets: [${deletedAssetIds.join(', ')}]`,
      });

      res.status(200).json({
        status: 200,
        message: 'Eliminación masiva completada.',
        data: {
          deleted_count: deletedAssetIds.length,
          deleted_asset_ids: deletedAssetIds,
          failed_asset_ids: failedAssetIds,
        },
      });
    } catch (err: any) {
      console.error('Batch delete error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al procesar la eliminación masiva de activos.',
      });
    }
  },
);

/**
 * GET /api/v1/assets/:id/rights
 * Consult asset rights, license and embargo information (FC 010).
 */
router.get(
  '/:id/rights',
  rightsRateLimiter,
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = getActorTenantId(req);
      const assetId = parseInt(String(req.params.id), 10);

      if (isNaN(assetId)) {
        res
          .status(400)
          .json({ status: 400, error: 'Bad Request', message: 'ID de activo inválido.' });
        return;
      }

      const assetRows = await query<
        Array<{
          id: number;
          tenant_id: number;
          workspace_id: number;
          collection_id: number;
          status: string;
          deleted_at: string | null;
        }>
      >(
        'SELECT id, tenant_id, workspace_id, collection_id, status, deleted_at FROM assets WHERE id = ? AND tenant_id = ?',
        [assetId, tenantId],
      );

      if (
        !assetRows ||
        assetRows.length === 0 ||
        assetRows[0].deleted_at !== null ||
        assetRows[0].status === 'DELETED'
      ) {
        res.status(404).json({
          status: 404,
          error: 'Not Found',
          message: 'Activo no encontrado o acceso denegado.',
        });
        return;
      }

      const asset = assetRows[0];
      const actor = getAssetActor(req);

      // ACL check (VIEW)
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'VIEW', {
        tenantId: asset.tenant_id,
        workspaceId: asset.workspace_id,
        collectionId: asset.collection_id,
        assetId,
      });

      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL).',
        });
        return;
      }

      const rightsRows = await query<
        Array<{
          id: number;
          tenant_id: number;
          asset_id: number;
          copyright_notice: string | null;
          license_type: string;
          terms_of_use: string | null;
          expires_at: string | Date | null;
          embargo_until: string | Date | null;
        }>
      >(
        'SELECT id, tenant_id, asset_id, copyright_notice, license_type, terms_of_use, expires_at, embargo_until FROM asset_rights WHERE asset_id = ? AND tenant_id = ?',
        [assetId, tenantId],
      );

      const now = new Date();
      if (!rightsRows || rightsRows.length === 0) {
        res.status(200).json({
          status: 200,
          data: {
            asset_id: assetId,
            copyright_notice: null,
            license_type: 'PROPRIETARY',
            terms_of_use: null,
            expires_at: null,
            embargo_until: null,
            is_embargoed: false,
            is_expired: false,
          },
        });
        return;
      }

      const row = rightsRows[0];
      const isEmbargoed = Boolean(row.embargo_until && new Date(row.embargo_until) > now);
      const isExpired = Boolean(row.expires_at && new Date(row.expires_at) < now);

      res.status(200).json({
        status: 200,
        data: {
          asset_id: assetId,
          copyright_notice: row.copyright_notice ?? null,
          license_type: row.license_type,
          terms_of_use: row.terms_of_use ?? null,
          expires_at: row.expires_at ? new Date(row.expires_at).toISOString() : null,
          embargo_until: row.embargo_until ? new Date(row.embargo_until).toISOString() : null,
          is_embargoed: isEmbargoed,
          is_expired: isExpired,
        },
      });
    } catch (err: any) {
      console.error('Get asset rights error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al obtener los derechos y licencias del activo.',
      });
    }
  },
);

/**
 * PUT /api/v1/assets/:id/rights
 * Update or assign asset rights, license and embargo information (FC 010).
 */
router.put(
  '/:id/rights',
  rightsRateLimiter,
  requireAuth,
  validate(updateAssetRightsSchema, 'body'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = getActorTenantId(req);
      const assetId = parseInt(String(req.params.id), 10);

      if (isNaN(assetId)) {
        res
          .status(400)
          .json({ status: 400, error: 'Bad Request', message: 'ID de activo inválido.' });
        return;
      }

      const assetRows = await query<
        Array<{
          id: number;
          tenant_id: number;
          workspace_id: number;
          collection_id: number;
          status: string;
          deleted_at: string | null;
        }>
      >(
        'SELECT id, tenant_id, workspace_id, collection_id, status, deleted_at FROM assets WHERE id = ? AND tenant_id = ?',
        [assetId, tenantId],
      );

      if (
        !assetRows ||
        assetRows.length === 0 ||
        assetRows[0].deleted_at !== null ||
        assetRows[0].status === 'DELETED'
      ) {
        res.status(404).json({
          status: 404,
          error: 'Not Found',
          message: 'Activo no encontrado o acceso denegado.',
        });
        return;
      }

      const asset = assetRows[0];
      const actor = getAssetActor(req);

      // ACL check (EDIT)
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'EDIT', {
        tenantId: asset.tenant_id,
        workspaceId: asset.workspace_id,
        collectionId: asset.collection_id,
        assetId,
      });

      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL).',
        });
        return;
      }

      const {
        copyright_notice,
        license_type = 'PROPRIETARY',
        terms_of_use,
        expires_at,
        embargo_until,
      } = req.body as UpdateAssetRightsInput;

      const formattedExpiresAt = expires_at ? new Date(expires_at) : null;
      const formattedEmbargoUntil = embargo_until ? new Date(embargo_until) : null;

      await query(
        `INSERT INTO asset_rights (tenant_id, asset_id, copyright_notice, license_type, terms_of_use, expires_at, embargo_until)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           copyright_notice = VALUES(copyright_notice),
           license_type = VALUES(license_type),
           terms_of_use = VALUES(terms_of_use),
           expires_at = VALUES(expires_at),
           embargo_until = VALUES(embargo_until),
           updated_at = CURRENT_TIMESTAMP`,
        [
          tenantId,
          assetId,
          copyright_notice ?? null,
          license_type,
          terms_of_use ?? null,
          formattedExpiresAt,
          formattedEmbargoUntil,
        ],
      );

      await logSecurityEvent(req, {
        eventType: 'ASSET_RIGHTS_UPDATE',
        userId: Number(actor.id),
        status: 'SUCCESS',
        details: `Updated rights for asset ID ${assetId}: license=${license_type}, embargo=${embargo_until || 'none'}, expires=${expires_at || 'none'}`,
      });

      // Dispatch Webhook Event (FC 012 - fire-and-forget)
      void dispatchWebhookEvent(tenantId, 'rights.updated', {
        asset_id: assetId,
      });

      const now = new Date();
      const isEmbargoed = Boolean(formattedEmbargoUntil && formattedEmbargoUntil > now);
      const isExpired = Boolean(formattedExpiresAt && formattedExpiresAt < now);

      res.status(200).json({
        status: 200,
        message: 'Derechos y licencias del activo actualizados exitosamente.',
        data: {
          asset_id: assetId,
          copyright_notice: copyright_notice ?? null,
          license_type,
          terms_of_use: terms_of_use ?? null,
          expires_at: formattedExpiresAt ? formattedExpiresAt.toISOString() : null,
          embargo_until: formattedEmbargoUntil ? formattedEmbargoUntil.toISOString() : null,
          is_embargoed: isEmbargoed,
          is_expired: isExpired,
        },
      });
    } catch (err: any) {
      console.error('Update asset rights error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al actualizar los derechos y licencias del activo.',
      });
    }
  },
);

/**
 * GET /api/v1/assets/:id/jobs
 * List processing jobs and their technical status for an asset (FC 011).
 */
router.get(
  '/:id/jobs',
  jobsRateLimiter,
  requireAuth,
  validate(assetIdParamSchema, 'params'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const assetId = Number(req.params.id);
      const tenantId = getActorTenantId(req);
      const actor = getAssetActor(req);

      // 1. Fetch parent asset & anti-IDOR check
      const assetRows = await query<any[]>(
        'SELECT id, tenant_id, workspace_id, collection_id, status, deleted_at FROM assets WHERE id = ? AND tenant_id = ?',
        [assetId, tenantId],
      );

      if (
        !assetRows ||
        assetRows.length === 0 ||
        assetRows[0].deleted_at !== null ||
        assetRows[0].status === 'DELETED'
      ) {
        res.status(404).json({
          status: 404,
          error: 'Not Found',
          message: 'Activo digital no encontrado.',
        });
        return;
      }

      const asset = assetRows[0];

      // 2. ACL check (VIEW)
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'VIEW', {
        tenantId: asset.tenant_id,
        workspaceId: asset.workspace_id,
        collectionId: asset.collection_id,
        assetId,
      });

      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL).',
        });
        return;
      }

      // 3. Query processing jobs
      const jobRows = await query<any[]>(
        `SELECT id, asset_id, version_id, job_type, status, attempts, max_attempts, error_message, metadata_payload, created_at, updated_at
         FROM processing_jobs
         WHERE tenant_id = ? AND asset_id = ?
         ORDER BY id DESC`,
        [tenantId, assetId],
      );

      const data = jobRows.map((j) => {
        let meta = j.metadata_payload;
        if (typeof meta === 'string') {
          try {
            meta = JSON.parse(meta);
          } catch {
            // Keep raw if parse fails
          }
        }
        return {
          id: j.id,
          asset_id: j.asset_id,
          version_id: j.version_id,
          job_type: j.job_type,
          status: j.status,
          attempts: j.attempts,
          max_attempts: j.max_attempts,
          error_message: j.error_message,
          metadata_payload: meta ?? null,
          created_at: j.created_at,
          updated_at: j.updated_at,
        };
      });

      res.status(200).json({
        status: 200,
        data,
      });
    } catch (err: any) {
      console.error('Get asset processing jobs error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al obtener los trabajos de procesamiento del activo.',
      });
    }
  },
);

/**
 * POST /api/v1/assets/:id/jobs/retry
 * Manually retry failed processing jobs for an asset (FC 011).
 */
router.post(
  '/:id/jobs/retry',
  jobsRateLimiter,
  requireAuth,
  validate(assetIdParamSchema, 'params'),
  validate(retryJobsSchema, 'body'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const assetId = Number(req.params.id);
      const tenantId = getActorTenantId(req);
      const actor = getAssetActor(req);

      // 1. Fetch parent asset & anti-IDOR check
      const assetRows = await query<any[]>(
        'SELECT id, tenant_id, workspace_id, collection_id, status, deleted_at FROM assets WHERE id = ? AND tenant_id = ?',
        [assetId, tenantId],
      );

      if (
        !assetRows ||
        assetRows.length === 0 ||
        assetRows[0].deleted_at !== null ||
        assetRows[0].status === 'DELETED'
      ) {
        res.status(404).json({
          status: 404,
          error: 'Not Found',
          message: 'Activo digital no encontrado.',
        });
        return;
      }

      const asset = assetRows[0];

      // 2. ACL check (EDIT)
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'EDIT', {
        tenantId: asset.tenant_id,
        workspaceId: asset.workspace_id,
        collectionId: asset.collection_id,
        assetId,
      });

      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL).',
        });
        return;
      }

      const { job_ids } = req.body as RetryJobsInput;

      // 3. Retry failed jobs
      const result = await retryFailedJobsForAsset(tenantId, assetId, job_ids);

      // 4. Audit Log Event (OWASP A09)
      await logSecurityEvent(req, {
        eventType: 'ASSET_JOB_RETRY',
        userId: Number(actor.id),
        status: 'SUCCESS',
        details: `Retried ${result.retriedCount} failed jobs for asset ID ${assetId} (job IDs: [${result.jobIds.join(', ')}])`,
      });

      res.status(200).json({
        status: 200,
        message: 'Trabajos fallidos reencolados exitosamente.',
        data: {
          retried_count: result.retriedCount,
          job_ids: result.jobIds,
        },
      });
    } catch (err: any) {
      console.error('Retry asset processing jobs error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al reintentar los trabajos de procesamiento.',
      });
    }
  },
);

/**
 * GET /api/v1/assets/:id/derivatives
 * List all generated derivatives across versions for an asset (FC 011).
 */
router.get(
  '/:id/derivatives',
  jobsRateLimiter,
  requireAuth,
  validate(assetIdParamSchema, 'params'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const assetId = Number(req.params.id);
      const tenantId = getActorTenantId(req);
      const actor = getAssetActor(req);

      // 1. Fetch parent asset & anti-IDOR check
      const assetRows = await query<any[]>(
        'SELECT id, tenant_id, workspace_id, collection_id, status, deleted_at FROM assets WHERE id = ? AND tenant_id = ?',
        [assetId, tenantId],
      );

      if (
        !assetRows ||
        assetRows.length === 0 ||
        assetRows[0].deleted_at !== null ||
        assetRows[0].status === 'DELETED'
      ) {
        res.status(404).json({
          status: 404,
          error: 'Not Found',
          message: 'Activo digital no encontrado.',
        });
        return;
      }

      const asset = assetRows[0];

      // 2. ACL check (VIEW)
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'VIEW', {
        tenantId: asset.tenant_id,
        workspaceId: asset.workspace_id,
        collectionId: asset.collection_id,
        assetId,
      });

      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL).',
        });
        return;
      }

      // 3. Query derivatives
      const derivativeRows = await query<any[]>(
        `SELECT d.id, d.version_id, d.derivative_type, d.width, d.height, d.byte_size, d.created_at
         FROM asset_derivatives d
         JOIN asset_versions v ON v.id = d.version_id
         WHERE v.asset_id = ?
         ORDER BY d.id ASC`,
        [assetId],
      );

      const data = derivativeRows.map((d) => ({
        id: d.id,
        version_id: d.version_id,
        derivative_type: d.derivative_type,
        width: d.width,
        height: d.height,
        byte_size: Number(d.byte_size),
        created_at: d.created_at,
      }));

      res.status(200).json({
        status: 200,
        data,
      });
    } catch (err: any) {
      console.error('Get asset derivatives error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al obtener las derivadas del activo.',
      });
    }
  },
);

export default router;



