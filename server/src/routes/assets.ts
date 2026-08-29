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
  videoAiRateLimiter,
  videoHighlightsRateLimiter,
  audioCleaningRateLimiter,
  subtitlesRateLimiter,
  smartCropRateLimiter,
  imageEnhancementRateLimiter,
  backgroundReplacementRateLimiter,
  faceBlurringRateLimiter,
  superResolutionRateLimiter,
  compressionRateLimiter,
  watermarkRateLimiter,
  bannerAdaptationRateLimiter,
  videoTranscodingRateLimiter,
  videoThumbnailRateLimiter,
  videoChapterRateLimiter,
  audioSpectralRateLimiter,
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
import {
  videoAnalysisBodySchema,
  videoScenesQuerySchema,
  videoTranscriptQuerySchema,
  searchVideoScenesBodySchema,
} from '../schemas/videoScene.schema';
import {
  createVideoHighlightBodySchema,
  listVideoHighlightsQuerySchema,
} from '../schemas/videoHighlights.schema';
import {
  createAudioCleaningBodySchema,
  listAudioCleaningQuerySchema,
} from '../schemas/audioCleaning.schema';
import {
  createSubtitleBodySchema,
  listSubtitlesQuerySchema,
} from '../schemas/subtitle.schema';
import {
  createSmartCropBodySchema,
  listSmartCropsQuerySchema,
} from '../schemas/smartCrop.schema';
import {
  createImageEnhancementBodySchema,
  listImageEnhancementsQuerySchema,
} from '../schemas/imageEnhancement.schema';
import {
  createBackgroundReplacementBodySchema,
  listBackgroundReplacementsQuerySchema,
} from '../schemas/backgroundReplacement.schema';
import {
  createFaceBlurringBodySchema,
  listFaceBlurringsQuerySchema,
} from '../schemas/faceBlurring.schema';
import {
  createSuperResolutionBodySchema,
  listSuperResolutionsQuerySchema,
} from '../schemas/superResolution.schema';
import {
  createCompressionBodySchema,
  listCompressionsQuerySchema,
} from '../schemas/compression.schema';
import {
  createWatermarkBodySchema,
  listWatermarksQuerySchema,
} from '../schemas/watermark.schema';
import {
  createBannerAdaptationBodySchema,
  listBannerAdaptationsQuerySchema,
} from '../schemas/bannerAdaptation.schema';
import {
  createVideoTranscodingBodySchema,
  listVideoTranscodingsQuerySchema,
  streamFileParamSchema,
} from '../schemas/videoTranscoding.schema';
import {
  createVideoThumbnailBodySchema,
  listVideoThumbnailsQuerySchema,
  videoThumbnailParamSchema,
} from '../schemas/videoThumbnail.schema';
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
import {
  analyzeVideoAsset,
  getVideoScenes,
  getVideoTranscript,
  searchVideoContent,
} from '../utils/videoAiEngine';
import {
  createVideoHighlight,
  listVideoHighlights,
  getVideoHighlightById,
  deleteVideoHighlight,
} from '../utils/videoHighlightsEngine';
import {
  createAudioCleaningJob,
  listAudioCleaningJobs,
  getAudioCleaningJobById,
  deleteAudioCleaningJob,
} from '../utils/audioCleaningEngine';
import {
  createAssetSubtitles,
  listAssetSubtitles,
  getAssetSubtitleById,
  deleteAssetSubtitle,
} from '../utils/subtitleEngine';
import {
  createAssetSmartCrop,
  listAssetSmartCrops,
  getAssetSmartCropById,
  deleteAssetSmartCrop,
} from '../utils/smartCropEngine';
import {
  createAssetImageEnhancement,
  listAssetImageEnhancements,
  getAssetImageEnhancementById,
  deleteAssetImageEnhancement,
} from '../utils/imageEnhancementEngine';
import {
  createAssetBackgroundReplacement,
  listAssetBackgroundReplacements,
  getAssetBackgroundReplacementById,
  deleteAssetBackgroundReplacement,
} from '../utils/backgroundReplacementEngine';
import {
  createAssetFaceBlurring,
  listAssetFaceBlurrings,
  getAssetFaceBlurringById,
  deleteAssetFaceBlurring,
} from '../utils/faceBlurringEngine';
import {
  createAssetSuperResolution,
  listAssetSuperResolutions,
  getAssetSuperResolutionById,
  deleteAssetSuperResolution,
} from '../utils/superResolutionEngine';
import {
  createAssetCompression,
  listAssetCompressions,
  getAssetCompressionById,
  deleteAssetCompression,
} from '../utils/compressionEngine';
import {
  createAssetWatermark,
  listAssetWatermarks,
  getAssetWatermarkById,
  deleteAssetWatermark,
} from '../utils/watermarkEngine';
import {
  createAssetBannerAdaptation,
  listAssetBannerAdaptations,
  getAssetBannerAdaptationById,
  deleteAssetBannerAdaptation,
} from '../utils/bannerAdaptationEngine';
import {
  createAssetVideoTranscoding,
  listAssetVideoTranscodings,
  getAssetVideoTranscodingById,
  deleteAssetVideoTranscoding,
  getTranscodingStreamFilePath,
} from '../utils/videoTranscodingEngine';
import {
  createAssetVideoThumbnail,
  listAssetVideoThumbnails,
  getAssetVideoThumbnailById,
  deleteAssetVideoThumbnail,
} from '../utils/videoThumbnailEngine';
import {
  createVideoChaptersBodySchema,
  listVideoChaptersQuerySchema,
  getVideoSummaryQuerySchema,
  updateVideoChapterBodySchema,
  videoChapterParamSchema,
} from '../schemas/videoChapter.schema';
import {
  createAssetVideoChapters,
  listAssetVideoChapters,
  getAssetVideoSummary,
  updateAssetVideoChapter,
  deleteAssetVideoChapters,
} from '../utils/videoChapterEngine';
import {
  createAudioSpectralBodySchema,
  listAudioSpectralQuerySchema,
  audioSpectralParamSchema,
} from '../schemas/audioSpectral.schema';
import {
  createAssetAudioSpectralProfile,
  listAssetAudioSpectralProfiles,
  getAssetAudioSpectralProfileById,
  deleteAssetAudioSpectralProfile,
} from '../utils/audioSpectralEngine';
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
 * POST /api/v1/assets/search/video-scenes
 * Searches video scene visual descriptions and transcript dialogues across tenant assets (FC 020, OWASP A01/A03/A04).
 */
router.post(
  '/search/video-scenes',
  videoAiRateLimiter,
  requireAuth,
  validate(searchVideoScenesBodySchema, 'body'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const { query: queryText, search_type, limit, offset } = req.body;

      const rawResults = await searchVideoContent(
        tenantId,
        queryText,
        search_type,
        Number(limit),
        Number(offset),
      );

      // ACL VIEW filter on matched assets
      const filteredResults = [];
      const actor: AclActor = { id: actorId, role: String(req.user!.role), tenantId };

      for (const item of rawResults) {
        const evalResult = await evaluateAclPermission(actor, 'ASSET', item.asset_id, 'VIEW');
        if (evalResult.allowed) {
          filteredResults.push(item);
        }
      }

      await logSecurityEvent(req, {
        eventType: 'VIDEO_SCENE_SEARCH_EXECUTED',
        userId: actorId,
        status: 'SUCCESS',
        details: `Searched video content for query "${queryText}" with ${filteredResults.length} matches`,
      });

      res.status(200).json({
        status: 200,
        message: 'Búsqueda de escenas y diálogos de video ejecutada exitosamente.',
        data: {
          total_matches: filteredResults.length,
          matches: filteredResults,
        },
      });
    } catch (err: any) {
      console.error('Search video scenes error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al ejecutar la búsqueda de escenas de video.',
      });
    }
  },
);

/**
 * POST /api/v1/assets/:id/video-analysis
 * Triggers video scene segmentation and speech transcription (FC 020, OWASP A01/A04/A09).
 */
router.post(
  '/:id/video-analysis',
  videoAiRateLimiter,
  requireAuth,
  validate(videoAnalysisBodySchema, 'body'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const assetId = parseInt(String(req.params.id), 10);
      const actor: AclActor = {
        id: actorId,
        role: String(req.user!.role),
        tenantId,
      };

      if (isNaN(assetId) || assetId <= 0) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'ID de activo inválido.' });
        return;
      }

      // Check asset existence and type in tenant
      const assetRows: any[] = await query(
        'SELECT id, mime_type, current_version_id FROM assets WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL',
        [assetId, tenantId],
      );

      if (!assetRows.length) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Activo digital no encontrado.' });
        return;
      }

      const asset = assetRows[0];
      if (!String(asset.mime_type).startsWith('video/')) {
        res.status(400).json({
          status: 400,
          error: 'Bad Request',
          message: 'El activo especificado no es un archivo de video compatible para análisis.',
        });
        return;
      }

      // ACL check: EDIT permission required
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'EDIT');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL) para analizar el video.',
        });
        return;
      }

      const versionId = Number(asset.current_version_id);
      const { force_refresh, language_code, scene_duration_target_seconds } = req.body;

      const analysisResult = await analyzeVideoAsset(tenantId, assetId, versionId, {
        forceRefresh: force_refresh,
        languageCode: language_code,
        sceneDurationTargetSeconds: scene_duration_target_seconds,
      });

      await logSecurityEvent(req, {
        eventType: 'VIDEO_AI_ANALYSIS_EXECUTED',
        userId: actorId,
        status: 'SUCCESS',
        details: `Video analysis completed for asset ID ${assetId}: ${analysisResult.scene_count} scenes, ${analysisResult.transcript_count} transcripts`,
      });

      res.status(200).json({
        status: 200,
        message: 'Análisis de escenas y transcripción de video ejecutado exitosamente.',
        data: analysisResult,
      });
    } catch (err: any) {
      console.error('Video analysis error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al procesar el análisis de video.',
      });
    }
  },
);

/**
 * GET /api/v1/assets/:id/scenes
 * Retrieves chronological detected scenes and keyframes for a video asset (FC 020, OWASP A01/A04/A09).
 */
router.get(
  '/:id/scenes',
  videoAiRateLimiter,
  requireAuth,
  validate(videoScenesQuerySchema, 'query'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const assetId = parseInt(String(req.params.id), 10);
      const actor: AclActor = {
        id: actorId,
        role: String(req.user!.role),
        tenantId,
      };

      if (isNaN(assetId) || assetId <= 0) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'ID de activo inválido.' });
        return;
      }

      // Check asset in tenant
      const assetRows: any[] = await query(
        'SELECT id FROM assets WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL',
        [assetId, tenantId],
      );

      if (!assetRows.length) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Activo digital no encontrado.' });
        return;
      }

      // ACL check: VIEW permission required
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'VIEW');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL) para consultar escenas.',
        });
        return;
      }

      const { limit, offset } = req.query as any;
      const scenes = await getVideoScenes(tenantId, assetId, Number(limit), Number(offset));

      res.status(200).json({
        status: 200,
        message: 'Escenas de video recuperadas exitosamente.',
        data: scenes,
      });
    } catch (err: any) {
      console.error('Get video scenes error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al consultar las escenas de video.',
      });
    }
  },
);

/**
 * GET /api/v1/assets/:id/transcript
 * Retrieves speech-to-text transcript segments for a video asset (FC 020, OWASP A01/A04/A09).
 */
router.get(
  '/:id/transcript',
  videoAiRateLimiter,
  requireAuth,
  validate(videoTranscriptQuerySchema, 'query'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const assetId = parseInt(String(req.params.id), 10);
      const actor: AclActor = {
        id: actorId,
        role: String(req.user!.role),
        tenantId,
      };

      if (isNaN(assetId) || assetId <= 0) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'ID de activo inválido.' });
        return;
      }

      // Check asset in tenant
      const assetRows: any[] = await query(
        'SELECT id FROM assets WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL',
        [assetId, tenantId],
      );

      if (!assetRows.length) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Activo digital no encontrado.' });
        return;
      }

      // ACL check: VIEW permission required
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'VIEW');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL) para consultar la transcripción.',
        });
        return;
      }

      const { speaker, language_code } = req.query as any;
      const transcripts = await getVideoTranscript(tenantId, assetId, {
        speaker: speaker as string | undefined,
        languageCode: language_code as string | undefined,
      });

      res.status(200).json({
        status: 200,
        message: 'Transcripción de video recuperada exitosamente.',
        data: transcripts,
      });
    } catch (err: any) {
      console.error('Get video transcript error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al consultar la transcripción de video.',
      });
    }
  },
);

/**
 * POST /api/v1/assets/:id/highlights
 * Creates an automated highlight reel / storyboard derivative (FC 021, OWASP A01/A04/A09).
 */
router.post(
  '/:id/highlights',
  videoHighlightsRateLimiter,
  requireAuth,
  validate(createVideoHighlightBodySchema, 'body'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const assetId = parseInt(String(req.params.id), 10);
      const actor: AclActor = { id: actorId, role: String(req.user!.role), tenantId };

      if (isNaN(assetId) || assetId <= 0) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'ID de activo inválido.' });
        return;
      }

      // Check asset in tenant
      const assetRows: any[] = await query(
        'SELECT id, mime_type, current_version_id FROM assets WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL',
        [assetId, tenantId],
      );

      if (!assetRows.length) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Activo digital no encontrado.' });
        return;
      }

      const asset = assetRows[0];
      if (!String(asset.mime_type).startsWith('video/')) {
        res.status(400).json({
          status: 400,
          error: 'Bad Request',
          message: 'El activo especificado no es un archivo de video compatible para generar resúmenes.',
        });
        return;
      }

      // ACL check: EDIT permission required
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'EDIT');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL) para generar resúmenes del video.',
        });
        return;
      }

      const versionId = Number(asset.current_version_id);
      const { title, aspect_ratio, target_duration_seconds } = req.body;

      const result = await createVideoHighlight(
        tenantId,
        assetId,
        versionId,
        title,
        aspect_ratio,
        target_duration_seconds,
      );

      if (!result.success) {
        res.status(400).json({
          status: 400,
          error: 'Bad Request',
          message: result.message,
        });
        return;
      }

      await logSecurityEvent(req, {
        eventType: 'VIDEO_HIGHLIGHT_CREATED',
        userId: actorId,
        status: 'SUCCESS',
        details: `Created video highlight ID ${result.highlight!.id} for asset ${assetId} (${aspect_ratio}, ${result.highlight!.actual_duration_seconds}s)`,
      });

      res.status(201).json({
        status: 201,
        message: 'Resumen de video generado exitosamente.',
        data: result.highlight,
      });
    } catch (err: any) {
      console.error('Create video highlight error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al generar el resumen de video.',
      });
    }
  },
);

/**
 * GET /api/v1/assets/:id/highlights
 * Lists generated highlight reels for an asset (FC 021, OWASP A01/A04/A09).
 */
router.get(
  '/:id/highlights',
  videoHighlightsRateLimiter,
  requireAuth,
  validate(listVideoHighlightsQuerySchema, 'query'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const assetId = parseInt(String(req.params.id), 10);
      const actor: AclActor = { id: actorId, role: String(req.user!.role), tenantId };

      if (isNaN(assetId) || assetId <= 0) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'ID de activo inválido.' });
        return;
      }

      // Check asset in tenant
      const assetRows: any[] = await query(
        'SELECT id FROM assets WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL',
        [assetId, tenantId],
      );

      if (!assetRows.length) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Activo digital no encontrado.' });
        return;
      }

      // ACL check: VIEW permission required
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'VIEW');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL) para consultar los resúmenes.',
        });
        return;
      }

      const { limit, offset, aspect_ratio } = req.query as any;
      const highlights = await listVideoHighlights(
        tenantId,
        assetId,
        Number(limit),
        Number(offset),
        aspect_ratio as string | undefined,
      );

      res.status(200).json({
        status: 200,
        message: 'Resúmenes de video recuperados exitosamente.',
        data: highlights,
      });
    } catch (err: any) {
      console.error('List video highlights error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al consultar los resúmenes de video.',
      });
    }
  },
);

/**
 * GET /api/v1/assets/:id/highlights/:highlightId
 * Gets details of a specific highlight reel (FC 021, OWASP A01/A04/A09).
 */
router.get(
  '/:id/highlights/:highlightId',
  videoHighlightsRateLimiter,
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const assetId = parseInt(String(req.params.id), 10);
      const highlightId = parseInt(String(req.params.highlightId), 10);
      const actor: AclActor = { id: actorId, role: String(req.user!.role), tenantId };

      if (isNaN(assetId) || assetId <= 0 || isNaN(highlightId) || highlightId <= 0) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'Parámetros inválidos.' });
        return;
      }

      // ACL check: VIEW permission required
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'VIEW');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL) para consultar el resumen.',
        });
        return;
      }

      const highlight = await getVideoHighlightById(tenantId, assetId, highlightId);
      if (!highlight) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Resumen de video no encontrado.' });
        return;
      }

      res.status(200).json({
        status: 200,
        message: 'Detalle del resumen de video recuperado exitosamente.',
        data: highlight,
      });
    } catch (err: any) {
      console.error('Get video highlight detail error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al consultar el detalle del resumen de video.',
      });
    }
  },
);

/**
 * DELETE /api/v1/assets/:id/highlights/:highlightId
 * Deletes a highlight reel and unlinks its derivative from disk (FC 021, OWASP A01/A04/A09).
 */
router.delete(
  '/:id/highlights/:highlightId',
  videoHighlightsRateLimiter,
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const assetId = parseInt(String(req.params.id), 10);
      const highlightId = parseInt(String(req.params.highlightId), 10);
      const actor: AclActor = { id: actorId, role: String(req.user!.role), tenantId };

      if (isNaN(assetId) || assetId <= 0 || isNaN(highlightId) || highlightId <= 0) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'Parámetros inválidos.' });
        return;
      }

      // ACL check: EDIT permission required
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'EDIT');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL) para eliminar el resumen.',
        });
        return;
      }

      const deleted = await deleteVideoHighlight(tenantId, assetId, highlightId);
      if (!deleted) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Resumen de video no encontrado.' });
        return;
      }

      await logSecurityEvent(req, {
        eventType: 'VIDEO_HIGHLIGHT_DELETED',
        userId: actorId,
        status: 'SUCCESS',
        details: `Deleted video highlight ID ${highlightId} for asset ${assetId}`,
      });

      res.status(200).json({
        status: 200,
        message: 'Resumen de video eliminado exitosamente.',
      });
    } catch (err: any) {
      console.error('Delete video highlight error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al eliminar el resumen de video.',
      });
    }
  },
);

/**
 * POST /api/v1/assets/:id/audio-cleaning
 * Executes an acoustic cleaning job on an audio or video asset (FC 022, OWASP A01/A04/A09).
 */
router.post(
  '/:id/audio-cleaning',
  audioCleaningRateLimiter,
  requireAuth,
  validate(createAudioCleaningBodySchema, 'body'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const assetId = parseInt(String(req.params.id), 10);
      const actor: AclActor = { id: actorId, role: String(req.user!.role), tenantId };

      if (isNaN(assetId) || assetId <= 0) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'ID de activo inválido.' });
        return;
      }

      // Check asset in tenant
      const assetRows: any[] = await query(
        'SELECT id, mime_type, current_version_id FROM assets WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL',
        [assetId, tenantId],
      );

      if (!assetRows.length) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Activo digital no encontrado.' });
        return;
      }

      const asset = assetRows[0];
      const mimeType = String(asset.mime_type);
      if (!mimeType.startsWith('audio/') && !mimeType.startsWith('video/')) {
        res.status(400).json({
          status: 400,
          error: 'Bad Request',
          message: 'El activo especificado no es un archivo de audio o video compatible para limpieza acústica.',
        });
        return;
      }

      // ACL check: EDIT permission required
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'EDIT');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL) para ejecutar limpieza acústica.',
        });
        return;
      }

      const versionId = Number(asset.current_version_id);
      const { profile, noise_reduction_db } = req.body;

      const job = await createAudioCleaningJob(
        tenantId,
        assetId,
        versionId,
        profile,
        noise_reduction_db,
      );

      await logSecurityEvent(req, {
        eventType: 'AUDIO_CLEANING_CREATED',
        userId: actorId,
        status: 'SUCCESS',
        details: `Executed audio cleaning job ID ${job.id} for asset ${assetId} (${profile}, ${noise_reduction_db}dB)`,
      });

      res.status(201).json({
        status: 201,
        message: 'Trabajo de limpieza de audio procesado exitosamente.',
        data: job,
      });
    } catch (err: any) {
      console.error('Create audio cleaning job error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al procesar la limpieza de audio.',
      });
    }
  },
);

/**
 * GET /api/v1/assets/:id/audio-cleaning
 * Lists audio cleaning jobs for an asset (FC 022, OWASP A01/A04/A09).
 */
router.get(
  '/:id/audio-cleaning',
  audioCleaningRateLimiter,
  requireAuth,
  validate(listAudioCleaningQuerySchema, 'query'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const assetId = parseInt(String(req.params.id), 10);
      const actor: AclActor = { id: actorId, role: String(req.user!.role), tenantId };

      if (isNaN(assetId) || assetId <= 0) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'ID de activo inválido.' });
        return;
      }

      // Check asset in tenant
      const assetRows: any[] = await query(
        'SELECT id FROM assets WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL',
        [assetId, tenantId],
      );

      if (!assetRows.length) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Activo digital no encontrado.' });
        return;
      }

      // ACL check: VIEW permission required
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'VIEW');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL) para consultar tareas de limpieza.',
        });
        return;
      }

      const { limit, offset, profile } = req.query as any;
      const jobs = await listAudioCleaningJobs(
        tenantId,
        assetId,
        Number(limit),
        Number(offset),
        profile as string | undefined,
      );

      res.status(200).json({
        status: 200,
        message: 'Tareas de limpieza de audio recuperadas exitosamente.',
        data: jobs,
      });
    } catch (err: any) {
      console.error('List audio cleaning jobs error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al consultar las tareas de limpieza de audio.',
      });
    }
  },
);

/**
 * GET /api/v1/assets/:id/audio-cleaning/:jobId
 * Gets details of a specific audio cleaning job (FC 022, OWASP A01/A04/A09).
 */
router.get(
  '/:id/audio-cleaning/:jobId',
  audioCleaningRateLimiter,
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const assetId = parseInt(String(req.params.id), 10);
      const jobId = parseInt(String(req.params.jobId), 10);
      const actor: AclActor = { id: actorId, role: String(req.user!.role), tenantId };

      if (isNaN(assetId) || assetId <= 0 || isNaN(jobId) || jobId <= 0) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'Parámetros inválidos.' });
        return;
      }

      // ACL check: VIEW permission required
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'VIEW');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL) para consultar la tarea de limpieza.',
        });
        return;
      }

      const job = await getAudioCleaningJobById(tenantId, assetId, jobId);
      if (!job) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Tarea de limpieza de audio no encontrada.' });
        return;
      }

      res.status(200).json({
        status: 200,
        message: 'Detalle de la tarea de limpieza de audio recuperado exitosamente.',
        data: job,
      });
    } catch (err: any) {
      console.error('Get audio cleaning job detail error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al consultar el detalle de la tarea de limpieza de audio.',
      });
    }
  },
);

/**
 * DELETE /api/v1/assets/:id/audio-cleaning/:jobId
 * Deletes an audio cleaning job and unlinks its derivative from disk (FC 022, OWASP A01/A04/A09).
 */
router.delete(
  '/:id/audio-cleaning/:jobId',
  audioCleaningRateLimiter,
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const assetId = parseInt(String(req.params.id), 10);
      const jobId = parseInt(String(req.params.jobId), 10);
      const actor: AclActor = { id: actorId, role: String(req.user!.role), tenantId };

      if (isNaN(assetId) || assetId <= 0 || isNaN(jobId) || jobId <= 0) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'Parámetros inválidos.' });
        return;
      }

      // ACL check: EDIT permission required
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'EDIT');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL) para eliminar la tarea de limpieza.',
        });
        return;
      }

      const deleted = await deleteAudioCleaningJob(tenantId, assetId, jobId);
      if (!deleted) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Tarea de limpieza de audio no encontrada.' });
        return;
      }

      await logSecurityEvent(req, {
        eventType: 'AUDIO_CLEANING_DELETED',
        userId: actorId,
        status: 'SUCCESS',
        details: `Deleted audio cleaning job ID ${jobId} for asset ${assetId}`,
      });

      res.status(200).json({
        status: 200,
        message: 'Tarea de limpieza de audio eliminada exitosamente.',
      });
    } catch (err: any) {
      console.error('Delete audio cleaning job error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al eliminar la tarea de limpieza de audio.',
      });
    }
  },
);

/**
 * POST /api/v1/assets/:id/subtitles
 * Generates or translates subtitles (SRT, VTT, JSON) for a video or audio asset (FC 023, OWASP A01/A04/A09).
 */
router.post(
  '/:id/subtitles',
  subtitlesRateLimiter,
  requireAuth,
  validate(createSubtitleBodySchema, 'body'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const assetId = parseInt(String(req.params.id), 10);
      const actor: AclActor = { id: actorId, role: String(req.user!.role), tenantId };

      if (isNaN(assetId) || assetId <= 0) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'ID de activo inválido.' });
        return;
      }

      // Check asset in tenant
      const assetRows: any[] = await query(
        'SELECT id, mime_type, current_version_id FROM assets WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL',
        [assetId, tenantId],
      );

      if (!assetRows.length) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Activo digital no encontrado.' });
        return;
      }

      const asset = assetRows[0];
      const mimeType = String(asset.mime_type);
      if (!mimeType.startsWith('video/') && !mimeType.startsWith('audio/')) {
        res.status(400).json({
          status: 400,
          error: 'Bad Request',
          message: 'El activo especificado no es un archivo de video o audio compatible para generación de subtítulos.',
        });
        return;
      }

      // ACL check: EDIT permission required
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'EDIT');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL) para generar subtítulos.',
        });
        return;
      }

      const versionId = Number(asset.current_version_id);
      const { language_code, format, cues } = req.body;

      const result = await createAssetSubtitles(
        tenantId,
        assetId,
        versionId,
        language_code,
        format,
        cues,
      );

      if (!result.success) {
        res.status(400).json({
          status: 400,
          error: 'Bad Request',
          message: result.message,
        });
        return;
      }

      await logSecurityEvent(req, {
        eventType: 'SUBTITLE_CREATED',
        userId: actorId,
        status: 'SUCCESS',
        details: `Created subtitles ID ${result.subtitle!.id} for asset ${assetId} (${language_code}, ${format})`,
      });

      res.status(201).json({
        status: 201,
        message: 'Pista de subtítulos generada exitosamente.',
        data: result.subtitle,
      });
    } catch (err: any) {
      console.error('Create subtitles error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al generar la pista de subtítulos.',
      });
    }
  },
);

/**
 * GET /api/v1/assets/:id/subtitles
 * Lists subtitle tracks for an asset (FC 023, OWASP A01/A04/A09).
 */
router.get(
  '/:id/subtitles',
  subtitlesRateLimiter,
  requireAuth,
  validate(listSubtitlesQuerySchema, 'query'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const assetId = parseInt(String(req.params.id), 10);
      const actor: AclActor = { id: actorId, role: String(req.user!.role), tenantId };

      if (isNaN(assetId) || assetId <= 0) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'ID de activo inválido.' });
        return;
      }

      // Check asset in tenant
      const assetRows: any[] = await query(
        'SELECT id FROM assets WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL',
        [assetId, tenantId],
      );

      if (!assetRows.length) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Activo digital no encontrado.' });
        return;
      }

      // ACL check: VIEW permission required
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'VIEW');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL) para consultar subtítulos.',
        });
        return;
      }

      const { limit, offset, language_code, format } = req.query as any;
      const subtitles = await listAssetSubtitles(
        tenantId,
        assetId,
        Number(limit),
        Number(offset),
        language_code as string | undefined,
        format as string | undefined,
      );

      res.status(200).json({
        status: 200,
        message: 'Pistas de subtítulos recuperadas exitosamente.',
        data: subtitles,
      });
    } catch (err: any) {
      console.error('List subtitles error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al consultar las pistas de subtítulos.',
      });
    }
  },
);

/**
 * GET /api/v1/assets/:id/subtitles/:subtitleId
 * Gets details and cues of a specific subtitle track (FC 023, OWASP A01/A04/A09).
 */
router.get(
  '/:id/subtitles/:subtitleId',
  subtitlesRateLimiter,
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const assetId = parseInt(String(req.params.id), 10);
      const subtitleId = parseInt(String(req.params.subtitleId), 10);
      const actor: AclActor = { id: actorId, role: String(req.user!.role), tenantId };

      if (isNaN(assetId) || assetId <= 0 || isNaN(subtitleId) || subtitleId <= 0) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'Parámetros inválidos.' });
        return;
      }

      // ACL check: VIEW permission required
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'VIEW');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL) para consultar el subtítulo.',
        });
        return;
      }

      const subtitle = await getAssetSubtitleById(tenantId, assetId, subtitleId);
      if (!subtitle) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Pista de subtítulos no encontrada.' });
        return;
      }

      res.status(200).json({
        status: 200,
        message: 'Detalle de la pista de subtítulos recuperado exitosamente.',
        data: subtitle,
      });
    } catch (err: any) {
      console.error('Get subtitle detail error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al consultar el detalle de la pista de subtítulos.',
      });
    }
  },
);

/**
 * DELETE /api/v1/assets/:id/subtitles/:subtitleId
 * Deletes a subtitle track and unlinks its derivative file (FC 023, OWASP A01/A04/A09).
 */
router.delete(
  '/:id/subtitles/:subtitleId',
  subtitlesRateLimiter,
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const assetId = parseInt(String(req.params.id), 10);
      const subtitleId = parseInt(String(req.params.subtitleId), 10);
      const actor: AclActor = { id: actorId, role: String(req.user!.role), tenantId };

      if (isNaN(assetId) || assetId <= 0 || isNaN(subtitleId) || subtitleId <= 0) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'Parámetros inválidos.' });
        return;
      }

      // ACL check: EDIT permission required
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'EDIT');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL) para eliminar la pista de subtítulos.',
        });
        return;
      }

      const deleted = await deleteAssetSubtitle(tenantId, assetId, subtitleId);
      if (!deleted) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Pista de subtítulos no encontrada.' });
        return;
      }

      await logSecurityEvent(req, {
        eventType: 'SUBTITLE_DELETED',
        userId: actorId,
        status: 'SUCCESS',
        details: `Deleted subtitle track ID ${subtitleId} for asset ${assetId}`,
      });

      res.status(200).json({
        status: 200,
        message: 'Pista de subtítulos eliminada exitosamente.',
      });
    } catch (err: any) {
      console.error('Delete subtitle error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al eliminar la pista de subtítulos.',
      });
    }
  },
);

/**
 * POST /api/v1/assets/:id/smart-crop
 * Generates an AI smart-cropped derivative with focal point detection (FC 024, OWASP A01/A03/A04/A07).
 */
router.post(
  '/:id/smart-crop',
  smartCropRateLimiter,
  requireAuth,
  validate(createSmartCropBodySchema, 'body'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const assetId = parseInt(String(req.params.id), 10);
      const actor: AclActor = { id: actorId, role: String(req.user!.role), tenantId };

      if (isNaN(assetId) || assetId <= 0) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'ID de activo inválido.' });
        return;
      }

      // Check asset in tenant
      const assetRows: any[] = await query(
        'SELECT id, mime_type, current_version_id FROM assets WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL',
        [assetId, tenantId],
      );

      if (!assetRows.length) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Activo digital no encontrado.' });
        return;
      }

      const asset = assetRows[0];

      // ACL check: EDIT permission required
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'EDIT');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL) para generar smart crop.',
        });
        return;
      }

      const versionId = Number(asset.current_version_id);
      const {
        aspect_ratio,
        strategy,
        focal_x,
        focal_y,
        target_width,
        target_height,
      } = req.body;

      const result = await createAssetSmartCrop(
        tenantId,
        assetId,
        versionId,
        aspect_ratio,
        strategy,
        focal_x,
        focal_y,
        target_width,
        target_height,
      );

      if (!result.success) {
        res.status(result.statusCode).json({
          status: result.statusCode,
          error: result.statusCode === 404 ? 'Not Found' : 'Bad Request',
          message: result.message,
        });
        return;
      }

      await logSecurityEvent(req, {
        eventType: 'SMART_CROP_CREATED',
        userId: actorId,
        status: 'SUCCESS',
        details: `Created smart crop ID ${result.smartCrop!.id} for asset ${assetId} (${aspect_ratio})`,
      });

      res.status(201).json({
        status: 201,
        message: 'Recorte inteligente generado exitosamente.',
        data: result.smartCrop,
      });
    } catch (err: any) {
      console.error('Create smart crop error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al generar el recorte inteligente.',
      });
    }
  },
);

/**
 * GET /api/v1/assets/:id/smart-crops
 * Lists smart crop derivatives for an asset (FC 024, OWASP A01/A04/A09).
 */
router.get(
  '/:id/smart-crops',
  smartCropRateLimiter,
  requireAuth,
  validate(listSmartCropsQuerySchema, 'query'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const assetId = parseInt(String(req.params.id), 10);
      const actor: AclActor = { id: actorId, role: String(req.user!.role), tenantId };

      if (isNaN(assetId) || assetId <= 0) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'ID de activo inválido.' });
        return;
      }

      // Check asset in tenant
      const assetRows: any[] = await query(
        'SELECT id FROM assets WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL',
        [assetId, tenantId],
      );

      if (!assetRows.length) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Activo digital no encontrado.' });
        return;
      }

      // ACL check: VIEW permission required
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'VIEW');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL) para consultar smart crops.',
        });
        return;
      }

      const { limit, offset, aspect_ratio } = req.query as any;
      const smartCrops = await listAssetSmartCrops(
        tenantId,
        assetId,
        Number(limit),
        Number(offset),
        aspect_ratio as string | undefined,
      );

      res.status(200).json({
        status: 200,
        message: 'Recortes inteligentes recuperados exitosamente.',
        data: smartCrops,
      });
    } catch (err: any) {
      console.error('List smart crops error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al consultar los recortes inteligentes.',
      });
    }
  },
);

/**
 * GET /api/v1/assets/:id/smart-crops/:cropId
 * Gets details of a specific smart crop derivative (FC 024, OWASP A01/A04/A09).
 */
router.get(
  '/:id/smart-crops/:cropId',
  smartCropRateLimiter,
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const assetId = parseInt(String(req.params.id), 10);
      const cropId = parseInt(String(req.params.cropId), 10);
      const actor: AclActor = { id: actorId, role: String(req.user!.role), tenantId };

      if (isNaN(assetId) || assetId <= 0 || isNaN(cropId) || cropId <= 0) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'Parámetros inválidos.' });
        return;
      }

      // ACL check: VIEW permission required
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'VIEW');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL) para consultar el smart crop.',
        });
        return;
      }

      const smartCrop = await getAssetSmartCropById(tenantId, assetId, cropId);
      if (!smartCrop) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Recorte inteligente no encontrado.' });
        return;
      }

      res.status(200).json({
        status: 200,
        message: 'Detalle del recorte inteligente recuperado exitosamente.',
        data: smartCrop,
      });
    } catch (err: any) {
      console.error('Get smart crop detail error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al consultar el detalle del recorte inteligente.',
      });
    }
  },
);

/**
 * DELETE /api/v1/assets/:id/smart-crops/:cropId
 * Deletes a smart crop derivative and unlinks its file from disk (FC 024, OWASP A01/A04/A09).
 */
router.delete(
  '/:id/smart-crops/:cropId',
  smartCropRateLimiter,
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const assetId = parseInt(String(req.params.id), 10);
      const cropId = parseInt(String(req.params.cropId), 10);
      const actor: AclActor = { id: actorId, role: String(req.user!.role), tenantId };

      if (isNaN(assetId) || assetId <= 0 || isNaN(cropId) || cropId <= 0) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'Parámetros inválidos.' });
        return;
      }

      // ACL check: EDIT permission required
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'EDIT');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL) para eliminar el smart crop.',
        });
        return;
      }

      const deleted = await deleteAssetSmartCrop(tenantId, assetId, cropId);
      if (!deleted) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Recorte inteligente no encontrado.' });
        return;
      }

      await logSecurityEvent(req, {
        eventType: 'SMART_CROP_DELETED',
        userId: actorId,
        status: 'SUCCESS',
        details: `Deleted smart crop derivative ID ${cropId} for asset ${assetId}`,
      });

      res.status(200).json({
        status: 200,
        message: 'Recorte inteligente eliminado exitosamente.',
      });
    } catch (err: any) {
      console.error('Delete smart crop error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al eliminar el recorte inteligente.',
      });
    }
  },
);

/**
 * POST /api/v1/assets/:id/enhance
 * Generates an enhanced/colorized derivative for an image asset (FC 025, OWASP A01/A03/A04/A07).
 */
router.post(
  '/:id/enhance',
  imageEnhancementRateLimiter,
  requireAuth,
  validate(createImageEnhancementBodySchema, 'body'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const assetId = parseInt(String(req.params.id), 10);
      const actor: AclActor = { id: actorId, role: String(req.user!.role), tenantId };

      if (isNaN(assetId) || assetId <= 0) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'ID de activo inválido.' });
        return;
      }

      // Check asset in tenant
      const assetRows: any[] = await query(
        'SELECT id, mime_type, current_version_id FROM assets WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL',
        [assetId, tenantId],
      );

      if (!assetRows.length) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Activo digital no encontrado.' });
        return;
      }

      const asset = assetRows[0];

      // ACL check: EDIT permission required
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'EDIT');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL) para generar realce de imagen.',
        });
        return;
      }

      const versionId = Number(asset.current_version_id);
      const {
        preset,
        brightness,
        contrast,
        saturation,
        sharpness,
        gamma,
        tint_hex,
      } = req.body;

      const result = await createAssetImageEnhancement(
        tenantId,
        assetId,
        versionId,
        preset,
        {
          brightness,
          contrast,
          saturation,
          sharpness,
          gamma,
          tint_hex,
        },
      );

      if (!result.success) {
        res.status(result.statusCode).json({
          status: result.statusCode,
          error: result.statusCode === 404 ? 'Not Found' : 'Bad Request',
          message: result.message,
        });
        return;
      }

      await logSecurityEvent(req, {
        eventType: 'IMAGE_ENHANCED',
        userId: actorId,
        status: 'SUCCESS',
        details: `Created image enhancement ID ${result.enhancement.id} for asset ${assetId} (preset ${result.enhancement.preset})`,
      });

      res.status(201).json({
        status: 201,
        message: 'Realce de imagen generado exitosamente.',
        data: result.enhancement,
      });
    } catch (err: any) {
      console.error('Create image enhancement error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al generar el realce de la imagen.',
      });
    }
  },
);

/**
 * GET /api/v1/assets/:id/enhancements
 * Lists all enhancement records for an asset (FC 025, OWASP A01/A04/A09).
 */
router.get(
  '/:id/enhancements',
  imageEnhancementRateLimiter,
  requireAuth,
  validate(listImageEnhancementsQuerySchema, 'query'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const assetId = parseInt(String(req.params.id), 10);
      const actor: AclActor = { id: actorId, role: String(req.user!.role), tenantId };

      if (isNaN(assetId) || assetId <= 0) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'ID de activo inválido.' });
        return;
      }

      // Check asset in tenant
      const assetRows: any[] = await query(
        'SELECT id FROM assets WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL',
        [assetId, tenantId],
      );

      if (!assetRows.length) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Activo digital no encontrado.' });
        return;
      }

      // ACL check: VIEW permission required
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'VIEW');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL) para consultar realces de imagen.',
        });
        return;
      }

      const { limit, offset, preset } = req.query as any;
      const enhancements = await listAssetImageEnhancements(
        tenantId,
        assetId,
        Number(limit),
        Number(offset),
        preset as string | undefined,
      );

      res.status(200).json({
        status: 200,
        message: 'Realces de imagen recuperados exitosamente.',
        data: enhancements,
      });
    } catch (err: any) {
      console.error('List image enhancements error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al consultar los realces de imagen.',
      });
    }
  },
);

/**
 * GET /api/v1/assets/:id/enhancements/:enhancementId
 * Gets details of a specific image enhancement derivative (FC 025, OWASP A01/A04/A09).
 */
router.get(
  '/:id/enhancements/:enhancementId',
  imageEnhancementRateLimiter,
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const assetId = parseInt(String(req.params.id), 10);
      const enhancementId = parseInt(String(req.params.enhancementId), 10);
      const actor: AclActor = { id: actorId, role: String(req.user!.role), tenantId };

      if (isNaN(assetId) || assetId <= 0 || isNaN(enhancementId) || enhancementId <= 0) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'Parámetros inválidos.' });
        return;
      }

      // ACL check: VIEW permission required
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'VIEW');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL) para consultar el realce de imagen.',
        });
        return;
      }

      const enhancement = await getAssetImageEnhancementById(tenantId, assetId, enhancementId);
      if (!enhancement) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Realce de imagen no encontrado.' });
        return;
      }

      res.status(200).json({
        status: 200,
        message: 'Detalle del realce de imagen recuperado exitosamente.',
        data: enhancement,
      });
    } catch (err: any) {
      console.error('Get image enhancement detail error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al consultar el detalle del realce de imagen.',
      });
    }
  },
);

/**
 * DELETE /api/v1/assets/:id/enhancements/:enhancementId
 * Deletes an image enhancement derivative and unlinks its file from disk (FC 025, OWASP A01/A04/A09).
 */
router.delete(
  '/:id/enhancements/:enhancementId',
  imageEnhancementRateLimiter,
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const assetId = parseInt(String(req.params.id), 10);
      const enhancementId = parseInt(String(req.params.enhancementId), 10);
      const actor: AclActor = { id: actorId, role: String(req.user!.role), tenantId };

      if (isNaN(assetId) || assetId <= 0 || isNaN(enhancementId) || enhancementId <= 0) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'Parámetros inválidos.' });
        return;
      }

      // ACL check: EDIT permission required
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'EDIT');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL) para eliminar el realce de imagen.',
        });
        return;
      }

      const deleted = await deleteAssetImageEnhancement(tenantId, assetId, enhancementId);
      if (!deleted) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Realce de imagen no encontrado.' });
        return;
      }

      await logSecurityEvent(req, {
        eventType: 'IMAGE_ENHANCEMENT_DELETED',
        userId: actorId,
        status: 'SUCCESS',
        details: `Deleted image enhancement derivative ID ${enhancementId} for asset ${assetId}`,
      });

      res.status(200).json({
        status: 200,
        message: 'Realce de imagen eliminado exitosamente.',
      });
    } catch (err: any) {
      console.error('Delete image enhancement error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al eliminar el realce de imagen.',
      });
    }
  },
);

/**
 * POST /api/v1/assets/:id/background-replace
 * Generates an automated background replacement or inpaint derivative for a raster image (FC 026, OWASP A01/A04/A07/A09).
 */
router.post(
  '/:id/background-replace',
  backgroundReplacementRateLimiter,
  requireAuth,
  validate(createBackgroundReplacementBodySchema, 'body'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const assetId = parseInt(String(req.params.id), 10);
      const actor: AclActor = { id: actorId, role: String(req.user!.role), tenantId };

      if (isNaN(assetId) || assetId <= 0) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'ID de activo inválido.' });
        return;
      }

      // Verify asset exists and belongs to tenant
      const assetRows = (await query(
        `SELECT id, mime_type, current_version_id FROM assets WHERE id = ? AND tenant_id = ? LIMIT 1`,
        [assetId, tenantId],
      )) as any[];

      if (!assetRows || assetRows.length === 0) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Activo digital no encontrado.' });
        return;
      }

      const asset = assetRows[0];

      // ACL check: EDIT permission required
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'EDIT');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL) para reemplazar el fondo del activo.',
        });
        return;
      }

      const { mode, preset, background_color_hex, threshold, inpaint_box } = req.body;

      const result = await createAssetBackgroundReplacement(
        tenantId,
        assetId,
        asset.current_version_id || 1,
        mode,
        preset,
        {
          background_color_hex,
          threshold,
          inpaint_box,
        },
      );

      if (!result.success) {
        res.status(result.statusCode).json({
          status: result.statusCode,
          error: result.statusCode === 404 ? 'Not Found' : 'Bad Request',
          message: result.message,
        });
        return;
      }

      await logSecurityEvent(req, {
        eventType: 'BACKGROUND_REPLACED',
        userId: actorId,
        status: 'SUCCESS',
        details: `Created background replacement derivative ID ${result.replacement.id} for asset ${assetId} (mode ${result.replacement.mode}, preset ${result.replacement.preset})`,
      });

      res.status(201).json({
        status: 201,
        message: 'Reemplazo de fondo generado exitosamente.',
        data: result.replacement,
      });
    } catch (err: any) {
      console.error('Create background replacement error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al generar el reemplazo de fondo de la imagen.',
      });
    }
  },
);

/**
 * GET /api/v1/assets/:id/background-replacements
 * Lists generated background replacement derivatives for an asset (FC 026, OWASP A01/A04/A09).
 */
router.get(
  '/:id/background-replacements',
  backgroundReplacementRateLimiter,
  requireAuth,
  validate(listBackgroundReplacementsQuerySchema, 'query'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const assetId = parseInt(String(req.params.id), 10);
      const actor: AclActor = { id: actorId, role: String(req.user!.role), tenantId };

      if (isNaN(assetId) || assetId <= 0) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'ID de activo inválido.' });
        return;
      }

      // Verify asset exists in tenant
      const assetRows = (await query(
        `SELECT id FROM assets WHERE id = ? AND tenant_id = ? LIMIT 1`,
        [assetId, tenantId],
      )) as any[];

      if (!assetRows || assetRows.length === 0) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Activo digital no encontrado.' });
        return;
      }

      // ACL check: VIEW permission required
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'VIEW');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL) para consultar reemplazos de fondo.',
        });
        return;
      }

      const { limit, offset, mode, preset } = req.query as any;
      const replacements = await listAssetBackgroundReplacements(
        tenantId,
        assetId,
        Number(limit),
        Number(offset),
        mode as any,
        preset as any,
      );

      res.status(200).json({
        status: 200,
        message: 'Reemplazos de fondo recuperados exitosamente.',
        data: replacements,
      });
    } catch (err: any) {
      console.error('List background replacements error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al consultar los reemplazos de fondo.',
      });
    }
  },
);

/**
 * GET /api/v1/assets/:id/background-replacements/:replacementId
 * Gets details of a specific background replacement derivative (FC 026, OWASP A01/A04/A09).
 */
router.get(
  '/:id/background-replacements/:replacementId',
  backgroundReplacementRateLimiter,
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const assetId = parseInt(String(req.params.id), 10);
      const replacementId = parseInt(String(req.params.replacementId), 10);
      const actor: AclActor = { id: actorId, role: String(req.user!.role), tenantId };

      if (isNaN(assetId) || assetId <= 0 || isNaN(replacementId) || replacementId <= 0) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'Parámetros inválidos.' });
        return;
      }

      // ACL check: VIEW permission required
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'VIEW');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL) para consultar el reemplazo de fondo.',
        });
        return;
      }

      const replacement = await getAssetBackgroundReplacementById(tenantId, assetId, replacementId);
      if (!replacement) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Reemplazo de fondo no encontrado.' });
        return;
      }

      res.status(200).json({
        status: 200,
        message: 'Detalle del reemplazo de fondo recuperado exitosamente.',
        data: replacement,
      });
    } catch (err: any) {
      console.error('Get background replacement detail error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al consultar el detalle del reemplazo de fondo.',
      });
    }
  },
);

/**
 * DELETE /api/v1/assets/:id/background-replacements/:replacementId
 * Deletes a background replacement derivative and unlinks its file from disk (FC 026, OWASP A01/A04/A09).
 */
router.delete(
  '/:id/background-replacements/:replacementId',
  backgroundReplacementRateLimiter,
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const assetId = parseInt(String(req.params.id), 10);
      const replacementId = parseInt(String(req.params.replacementId), 10);
      const actor: AclActor = { id: actorId, role: String(req.user!.role), tenantId };

      if (isNaN(assetId) || assetId <= 0 || isNaN(replacementId) || replacementId <= 0) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'Parámetros inválidos.' });
        return;
      }

      // ACL check: EDIT permission required
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'EDIT');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL) para eliminar el reemplazo de fondo.',
        });
        return;
      }

      const deleted = await deleteAssetBackgroundReplacement(tenantId, assetId, replacementId);
      if (!deleted) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Reemplazo de fondo no encontrado.' });
        return;
      }

      await logSecurityEvent(req, {
        eventType: 'BACKGROUND_REPLACEMENT_DELETED',
        userId: actorId,
        status: 'SUCCESS',
        details: `Deleted background replacement derivative ID ${replacementId} for asset ${assetId}`,
      });

      res.status(200).json({
        status: 200,
        message: 'Reemplazo de fondo eliminado exitosamente.',
      });
    } catch (err: any) {
      console.error('Delete background replacement error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al eliminar el reemplazo de fondo.',
      });
    }
  },
);

/**
 * POST /api/v1/assets/:id/anonymize
 * Generates an anonymized image derivative with face/ROI blurring, pixelation, or censoring (FC 027, OWASP A01/A03/A04/A07).
 */
router.post(
  '/:id/anonymize',
  faceBlurringRateLimiter,
  requireAuth,
  validate(createFaceBlurringBodySchema, 'body'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const assetId = parseInt(String(req.params.id), 10);
      const actor: AclActor = { id: actorId, role: String(req.user!.role), tenantId };

      if (isNaN(assetId) || assetId <= 0) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'ID de activo inválido.' });
        return;
      }

      // Verify asset exists in tenant
      const assetRows = (await query(
        `SELECT id, current_version_id, mime_type FROM assets WHERE id = ? AND tenant_id = ? LIMIT 1`,
        [assetId, tenantId],
      )) as any[];

      if (!assetRows || assetRows.length === 0) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Activo digital no encontrado.' });
        return;
      }

      // ACL check: EDIT permission required
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'EDIT');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL) para anonimizar el activo.',
        });
        return;
      }

      const versionId = Number(assetRows[0].current_version_id) || 1;
      const input = req.body;

      const result = await createAssetFaceBlurring(tenantId, assetId, versionId, input);

      if (!result.success) {
        res.status(result.statusCode).json({
          status: result.statusCode,
          error: result.statusCode === 404 ? 'Not Found' : 'Bad Request',
          message: result.message,
        });
        return;
      }

      await logSecurityEvent(req, {
        eventType: 'ASSET_ANONYMIZED',
        userId: actorId,
        status: 'SUCCESS',
        details: `Created face blurring / anonymization derivative for asset ${assetId}, strategy ${input.strategy}`,
      });

      res.status(201).json({
        status: 201,
        message: 'Derivada de anonimización visual creada exitosamente.',
        data: result.anonymization,
      });
    } catch (err: any) {
      console.error('Create face blurring error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al procesar la anonimización visual del activo.',
      });
    }
  },
);

/**
 * GET /api/v1/assets/:id/anonymizations
 * Lists all anonymization derivatives for an asset (FC 027, OWASP A01/A04/A09).
 */
router.get(
  '/:id/anonymizations',
  faceBlurringRateLimiter,
  requireAuth,
  validate(listFaceBlurringsQuerySchema, 'query'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const assetId = parseInt(String(req.params.id), 10);
      const actor: AclActor = { id: actorId, role: String(req.user!.role), tenantId };

      if (isNaN(assetId) || assetId <= 0) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'ID de activo inválido.' });
        return;
      }

      // Verify asset exists in tenant
      const assetRows = (await query(
        `SELECT id FROM assets WHERE id = ? AND tenant_id = ? LIMIT 1`,
        [assetId, tenantId],
      )) as any[];

      if (!assetRows || assetRows.length === 0) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Activo digital no encontrado.' });
        return;
      }

      // ACL check: VIEW permission required
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'VIEW');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL) para consultar anonimizaciones.',
        });
        return;
      }

      const { limit, offset, strategy } = req.query as any;
      const anonymizations = await listAssetFaceBlurrings(
        tenantId,
        assetId,
        Number(limit),
        Number(offset),
        strategy,
      );

      res.status(200).json({
        status: 200,
        message: 'Derivadas de anonimización recuperadas exitosamente.',
        data: anonymizations,
      });
    } catch (err: any) {
      console.error('List face blurrings error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al consultar las anonimizaciones visuales.',
      });
    }
  },
);

/**
 * GET /api/v1/assets/:id/anonymizations/:anonymizationId
 * Gets details of a specific anonymization derivative (FC 027, OWASP A01/A04/A09).
 */
router.get(
  '/:id/anonymizations/:anonymizationId',
  faceBlurringRateLimiter,
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const assetId = parseInt(String(req.params.id), 10);
      const anonymizationId = parseInt(String(req.params.anonymizationId), 10);
      const actor: AclActor = { id: actorId, role: String(req.user!.role), tenantId };

      if (isNaN(assetId) || assetId <= 0 || isNaN(anonymizationId) || anonymizationId <= 0) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'Parámetros inválidos.' });
        return;
      }

      // ACL check: VIEW permission required
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'VIEW');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL) para consultar la anonimización.',
        });
        return;
      }

      const anonymization = await getAssetFaceBlurringById(tenantId, assetId, anonymizationId);
      if (!anonymization) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Anonimización no encontrada.' });
        return;
      }

      res.status(200).json({
        status: 200,
        message: 'Detalle de anonimización recuperado exitosamente.',
        data: anonymization,
      });
    } catch (err: any) {
      console.error('Get face blurring detail error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al consultar el detalle de la anonimización.',
      });
    }
  },
);

/**
 * DELETE /api/v1/assets/:id/anonymizations/:anonymizationId
 * Deletes an anonymization derivative and unlinks its physical file from disk (FC 027, OWASP A01/A04/A09).
 */
router.delete(
  '/:id/anonymizations/:anonymizationId',
  faceBlurringRateLimiter,
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const assetId = parseInt(String(req.params.id), 10);
      const anonymizationId = parseInt(String(req.params.anonymizationId), 10);
      const actor: AclActor = { id: actorId, role: String(req.user!.role), tenantId };

      if (isNaN(assetId) || assetId <= 0 || isNaN(anonymizationId) || anonymizationId <= 0) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'Parámetros inválidos.' });
        return;
      }

      // ACL check: EDIT permission required
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'EDIT');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL) para eliminar la anonimización.',
        });
        return;
      }

      const deleted = await deleteAssetFaceBlurring(tenantId, assetId, anonymizationId);
      if (!deleted) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Anonimización no encontrada.' });
        return;
      }

      await logSecurityEvent(req, {
        eventType: 'ASSET_ANONYMIZATION_DELETED',
        userId: actorId,
        status: 'SUCCESS',
        details: `Deleted face blurring derivative ID ${anonymizationId} for asset ${assetId}`,
      });

      res.status(200).json({
        status: 200,
        message: 'Anonimización visual eliminada exitosamente.',
      });
    } catch (err: any) {
      console.error('Delete face blurring error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al eliminar la anonimización visual.',
      });
    }
  },
);

/**
 * POST /api/v1/assets/:id/upscale
 * Creates a super-resolution / smart upscaled derivative for an asset (FC 028, OWASP A01/A04/A09).
 */
router.post(
  '/:id/upscale',
  superResolutionRateLimiter,
  requireAuth,
  validate(createSuperResolutionBodySchema, 'body'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const assetId = parseInt(String(req.params.id), 10);
      const actor: AclActor = { id: actorId, role: String(req.user!.role), tenantId };

      if (isNaN(assetId) || assetId <= 0) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'ID de activo inválido.' });
        return;
      }

      // Verify asset exists in tenant
      const assetRows = (await query(
        `SELECT id, current_version_id, mime_type FROM assets WHERE id = ? AND tenant_id = ? LIMIT 1`,
        [assetId, tenantId],
      )) as any[];

      if (!assetRows || assetRows.length === 0) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Activo digital no encontrado.' });
        return;
      }

      // ACL check: EDIT permission required
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'EDIT');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL) para escalar este activo.',
        });
        return;
      }

      const versionId = Number(assetRows[0].current_version_id) || 1;
      const input = req.body;

      const result = await createAssetSuperResolution(tenantId, assetId, versionId, input);

      if (!result.success) {
        res.status(result.statusCode).json({
          status: result.statusCode,
          error: result.statusCode === 404 ? 'Not Found' : 'Bad Request',
          message: result.message,
        });
        return;
      }

      await logSecurityEvent(req, {
        eventType: 'ASSET_UPSCALED',
        userId: actorId,
        status: 'SUCCESS',
        details: `Created super-resolution derivative for asset ${assetId}, scale ${input.scale_factor}, algorithm ${input.algorithm}`,
      });

      res.status(201).json({
        status: 201,
        message: 'Derivada de super-resolución creada exitosamente.',
        data: result.upscale,
      });
    } catch (err: any) {
      console.error('Create super resolution error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al procesar la super-resolución del activo.',
      });
    }
  },
);

/**
 * GET /api/v1/assets/:id/upscales
 * Lists all super-resolution derivatives for an asset (FC 028, OWASP A01/A04/A09).
 */
router.get(
  '/:id/upscales',
  superResolutionRateLimiter,
  requireAuth,
  validate(listSuperResolutionsQuerySchema, 'query'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const assetId = parseInt(String(req.params.id), 10);
      const actor: AclActor = { id: actorId, role: String(req.user!.role), tenantId };

      if (isNaN(assetId) || assetId <= 0) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'ID de activo inválido.' });
        return;
      }

      // Verify asset exists in tenant
      const assetRows = (await query(
        `SELECT id FROM assets WHERE id = ? AND tenant_id = ? LIMIT 1`,
        [assetId, tenantId],
      )) as any[];

      if (!assetRows || assetRows.length === 0) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Activo digital no encontrado.' });
        return;
      }

      // ACL check: VIEW permission required
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'VIEW');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL) para consultar derivadas de super-resolución.',
        });
        return;
      }

      const { limit, offset, scale_factor, algorithm } = req.query as any;
      const upscales = await listAssetSuperResolutions(
        tenantId,
        assetId,
        Number(limit),
        Number(offset),
        scale_factor,
        algorithm,
      );

      res.status(200).json({
        status: 200,
        message: 'Derivadas de super-resolución recuperadas exitosamente.',
        data: upscales,
      });
    } catch (err: any) {
      console.error('List super resolutions error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al consultar las derivadas de super-resolución.',
      });
    }
  },
);

/**
 * GET /api/v1/assets/:id/upscales/:upscaleId
 * Gets details of a specific super-resolution derivative (FC 028, OWASP A01/A04/A09).
 */
router.get(
  '/:id/upscales/:upscaleId',
  superResolutionRateLimiter,
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const assetId = parseInt(String(req.params.id), 10);
      const upscaleId = parseInt(String(req.params.upscaleId), 10);
      const actor: AclActor = { id: actorId, role: String(req.user!.role), tenantId };

      if (isNaN(assetId) || assetId <= 0 || isNaN(upscaleId) || upscaleId <= 0) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'Parámetros inválidos.' });
        return;
      }

      // ACL check: VIEW permission required
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'VIEW');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL) para consultar la super-resolución.',
        });
        return;
      }

      const upscale = await getAssetSuperResolutionById(tenantId, assetId, upscaleId);
      if (!upscale) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Super-resolución no encontrada.' });
        return;
      }

      res.status(200).json({
        status: 200,
        message: 'Detalle de super-resolución recuperado exitosamente.',
        data: upscale,
      });
    } catch (err: any) {
      console.error('Get super resolution detail error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al consultar el detalle de la super-resolución.',
      });
    }
  },
);

/**
 * DELETE /api/v1/assets/:id/upscales/:upscaleId
 * Deletes a super-resolution derivative and unlinks its physical file from disk (FC 028, OWASP A01/A04/A09).
 */
router.delete(
  '/:id/upscales/:upscaleId',
  superResolutionRateLimiter,
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const assetId = parseInt(String(req.params.id), 10);
      const upscaleId = parseInt(String(req.params.upscaleId), 10);
      const actor: AclActor = { id: actorId, role: String(req.user!.role), tenantId };

      if (isNaN(assetId) || assetId <= 0 || isNaN(upscaleId) || upscaleId <= 0) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'Parámetros inválidos.' });
        return;
      }

      // ACL check: EDIT permission required
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'EDIT');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL) para eliminar la super-resolución.',
        });
        return;
      }

      const deleted = await deleteAssetSuperResolution(tenantId, assetId, upscaleId);
      if (!deleted) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Super-resolución no encontrada.' });
        return;
      }

      await logSecurityEvent(req, {
        eventType: 'ASSET_UPSCALING_DELETED',
        userId: actorId,
        status: 'SUCCESS',
        details: `Deleted super-resolution derivative ID ${upscaleId} for asset ${assetId}`,
      });

      res.status(200).json({
        status: 200,
        message: 'Derivada de super-resolución eliminada exitosamente.',
      });
    } catch (err: any) {
      console.error('Delete super resolution error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al eliminar la super-resolución.',
      });
    }
  },
);

/**
 * POST /api/v1/assets/:id/compress
 * Creates an optimized, compressed image derivative for an asset (FC 029, OWASP A01/A04/A09).
 */
router.post(
  '/:id/compress',
  compressionRateLimiter,
  requireAuth,
  validate(createCompressionBodySchema, 'body'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const assetId = parseInt(String(req.params.id), 10);
      const actor: AclActor = { id: actorId, role: String(req.user!.role), tenantId };

      if (isNaN(assetId) || assetId <= 0) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'ID de activo inválido.' });
        return;
      }

      // Verify asset exists in tenant
      const assetRows = (await query(
        `SELECT id, current_version_id, mime_type FROM assets WHERE id = ? AND tenant_id = ? LIMIT 1`,
        [assetId, tenantId],
      )) as any[];

      if (!assetRows || assetRows.length === 0) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Activo digital no encontrado.' });
        return;
      }

      // ACL check: EDIT permission required
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'EDIT');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL) para comprimir este activo.',
        });
        return;
      }

      const versionId = Number(assetRows[0].current_version_id) || 1;
      const input = req.body;

      const result = await createAssetCompression(tenantId, assetId, versionId, input);

      if (!result.success) {
        res.status(result.statusCode).json({
          status: result.statusCode,
          error: result.statusCode === 404 ? 'Not Found' : 'Bad Request',
          message: result.message,
        });
        return;
      }

      await logSecurityEvent(req, {
        eventType: 'ASSET_COMPRESSED',
        userId: actorId,
        status: 'SUCCESS',
        details: `Created compressed derivative for asset ${assetId}, format ${input.target_format}, preset ${result.compression.quality_preset}`,
      });

      res.status(201).json({
        status: 201,
        message: 'Derivada comprimida optimizada creada exitosamente.',
        data: result.compression,
      });
    } catch (err: any) {
      console.error('Create compression error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al procesar la compresión y optimización del activo.',
      });
    }
  },
);

/**
 * GET /api/v1/assets/:id/compressions
 * Lists all compressed derivatives for an asset (FC 029, OWASP A01/A04/A09).
 */
router.get(
  '/:id/compressions',
  compressionRateLimiter,
  requireAuth,
  validate(listCompressionsQuerySchema, 'query'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const assetId = parseInt(String(req.params.id), 10);
      const actor: AclActor = { id: actorId, role: String(req.user!.role), tenantId };

      if (isNaN(assetId) || assetId <= 0) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'ID de activo inválido.' });
        return;
      }

      // Verify asset exists in tenant
      const assetRows = (await query(
        `SELECT id FROM assets WHERE id = ? AND tenant_id = ? LIMIT 1`,
        [assetId, tenantId],
      )) as any[];

      if (!assetRows || assetRows.length === 0) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Activo digital no encontrado.' });
        return;
      }

      // ACL check: VIEW permission required
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'VIEW');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL) para consultar derivadas comprimidas.',
        });
        return;
      }

      const { limit, offset, target_format, quality_preset } = req.query as any;
      const compressions = await listAssetCompressions(
        tenantId,
        assetId,
        Number(limit),
        Number(offset),
        target_format,
        quality_preset,
      );

      res.status(200).json({
        status: 200,
        message: 'Derivadas comprimidas recuperadas exitosamente.',
        data: compressions,
      });
    } catch (err: any) {
      console.error('List compressions error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al listar las derivadas comprimidas del activo.',
      });
    }
  },
);

/**
 * GET /api/v1/assets/:id/compressions/:compressionId
 * Gets details of a specific compressed derivative (FC 029, OWASP A01/A04/A09).
 */
router.get(
  '/:id/compressions/:compressionId',
  compressionRateLimiter,
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const assetId = parseInt(String(req.params.id), 10);
      const compressionId = parseInt(String(req.params.compressionId), 10);
      const actor: AclActor = { id: actorId, role: String(req.user!.role), tenantId };

      if (isNaN(assetId) || assetId <= 0 || isNaN(compressionId) || compressionId <= 0) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'Parámetros inválidos.' });
        return;
      }

      // ACL check: VIEW permission required
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'VIEW');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL) para consultar la derivada comprimida.',
        });
        return;
      }

      const compression = await getAssetCompressionById(tenantId, assetId, compressionId);
      if (!compression) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Derivada comprimida no encontrada.' });
        return;
      }

      res.status(200).json({
        status: 200,
        message: 'Detalle de derivada comprimida recuperado exitosamente.',
        data: compression,
      });
    } catch (err: any) {
      console.error('Get compression detail error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al consultar el detalle de la derivada comprimida.',
      });
    }
  },
);

/**
 * DELETE /api/v1/assets/:id/compressions/:compressionId
 * Deletes a compressed derivative and unlinks its physical file from disk (FC 029, OWASP A01/A04/A09).
 */
router.delete(
  '/:id/compressions/:compressionId',
  compressionRateLimiter,
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const assetId = parseInt(String(req.params.id), 10);
      const compressionId = parseInt(String(req.params.compressionId), 10);
      const actor: AclActor = { id: actorId, role: String(req.user!.role), tenantId };

      if (isNaN(assetId) || assetId <= 0 || isNaN(compressionId) || compressionId <= 0) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'Parámetros inválidos.' });
        return;
      }

      // ACL check: EDIT permission required
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'EDIT');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL) para eliminar la derivada comprimida.',
        });
        return;
      }

      const deleted = await deleteAssetCompression(tenantId, assetId, compressionId);
      if (!deleted) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Derivada comprimida no encontrada.' });
        return;
      }

      await logSecurityEvent(req, {
        eventType: 'ASSET_COMPRESSION_DELETED',
        userId: actorId,
        status: 'SUCCESS',
        details: `Deleted compressed derivative ID ${compressionId} for asset ${assetId}`,
      });

      res.status(200).json({
        status: 200,
        message: 'Derivada comprimida eliminada exitosamente.',
      });
    } catch (err: any) {
      console.error('Delete compression error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al eliminar la derivada comprimida.',
      });
    }
  },
);

/**
 * POST /api/v1/assets/:id/watermark
 * Creates a watermarked derivative for an asset (FC 030, OWASP A01/A03/A04/A09).
 */
router.post(
  '/:id/watermark',
  watermarkRateLimiter,
  requireAuth,
  validate(createWatermarkBodySchema, 'body'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const assetId = parseInt(String(req.params.id), 10);
      const actor: AclActor = { id: actorId, role: String(req.user!.role), tenantId };

      if (isNaN(assetId) || assetId <= 0) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'ID de activo inválido.' });
        return;
      }

      // Verify asset exists in tenant
      const assetRows = (await query(
        `SELECT id, current_version_id, mime_type FROM assets WHERE id = ? AND tenant_id = ? LIMIT 1`,
        [assetId, tenantId],
      )) as any[];

      if (!assetRows || assetRows.length === 0) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Activo digital no encontrado.' });
        return;
      }

      // ACL check: EDIT permission required
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'EDIT');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL) para aplicar marca de agua a este activo.',
        });
        return;
      }

      const versionId = Number(assetRows[0].current_version_id) || 1;
      const input = req.body;

      const result = await createAssetWatermark(tenantId, assetId, versionId, input);

      if (!result.success) {
        res.status(result.statusCode).json({
          status: result.statusCode,
          error: result.statusCode === 404 ? 'Not Found' : 'Bad Request',
          message: result.message,
        });
        return;
      }

      await logSecurityEvent(req, {
        eventType: 'ASSET_WATERMARKED',
        userId: actorId,
        status: 'SUCCESS',
        details: `Applied watermark to asset ${assetId}, type ${input.watermark_type}, position ${result.watermark.position}`,
      });

      res.status(201).json({
        status: 201,
        message: 'Derivada con marca de agua creada exitosamente.',
        data: result.watermark,
      });
    } catch (err: any) {
      console.error('Create watermark error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al procesar la aplicación de marca de agua al activo.',
      });
    }
  },
);

/**
 * GET /api/v1/assets/:id/watermarks
 * Lists all watermarked derivatives for an asset (FC 030, OWASP A01/A04/A09).
 */
router.get(
  '/:id/watermarks',
  watermarkRateLimiter,
  requireAuth,
  validate(listWatermarksQuerySchema, 'query'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const assetId = parseInt(String(req.params.id), 10);
      const actor: AclActor = { id: actorId, role: String(req.user!.role), tenantId };

      if (isNaN(assetId) || assetId <= 0) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'ID de activo inválido.' });
        return;
      }

      // Verify asset exists in tenant
      const assetRows = (await query(
        `SELECT id FROM assets WHERE id = ? AND tenant_id = ? LIMIT 1`,
        [assetId, tenantId],
      )) as any[];

      if (!assetRows || assetRows.length === 0) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Activo digital no encontrado.' });
        return;
      }

      // ACL check: VIEW permission required
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'VIEW');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL) para consultar derivadas con marca de agua.',
        });
        return;
      }

      const { limit, offset, watermark_type, position } = req.query as any;
      const watermarks = await listAssetWatermarks(
        tenantId,
        assetId,
        Number(limit),
        Number(offset),
        watermark_type,
        position,
      );

      res.status(200).json({
        status: 200,
        message: 'Derivadas con marca de agua recuperadas exitosamente.',
        data: watermarks,
      });
    } catch (err: any) {
      console.error('List watermarks error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al listar las derivadas con marca de agua del activo.',
      });
    }
  },
);

/**
 * GET /api/v1/assets/:id/watermarks/:watermarkId
 * Gets details of a specific watermarked derivative (FC 030, OWASP A01/A04/A09).
 */
router.get(
  '/:id/watermarks/:watermarkId',
  watermarkRateLimiter,
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const assetId = parseInt(String(req.params.id), 10);
      const watermarkId = parseInt(String(req.params.watermarkId), 10);
      const actor: AclActor = { id: actorId, role: String(req.user!.role), tenantId };

      if (isNaN(assetId) || assetId <= 0 || isNaN(watermarkId) || watermarkId <= 0) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'Parámetros inválidos.' });
        return;
      }

      // ACL check: VIEW permission required
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'VIEW');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL) para consultar la derivada con marca de agua.',
        });
        return;
      }

      const watermark = await getAssetWatermarkById(tenantId, assetId, watermarkId);
      if (!watermark) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Derivada con marca de agua no encontrada.' });
        return;
      }

      res.status(200).json({
        status: 200,
        message: 'Detalle de derivada con marca de agua recuperado exitosamente.',
        data: watermark,
      });
    } catch (err: any) {
      console.error('Get watermark detail error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al consultar el detalle de la derivada con marca de agua.',
      });
    }
  },
);

/**
 * DELETE /api/v1/assets/:id/watermarks/:watermarkId
 * Deletes a watermarked derivative and unlinks its physical file from disk (FC 030, OWASP A01/A04/A09).
 */
router.delete(
  '/:id/watermarks/:watermarkId',
  watermarkRateLimiter,
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const assetId = parseInt(String(req.params.id), 10);
      const watermarkId = parseInt(String(req.params.watermarkId), 10);
      const actor: AclActor = { id: actorId, role: String(req.user!.role), tenantId };

      if (isNaN(assetId) || assetId <= 0 || isNaN(watermarkId) || watermarkId <= 0) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'Parámetros inválidos.' });
        return;
      }

      // ACL check: EDIT permission required
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'EDIT');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL) para eliminar la derivada con marca de agua.',
        });
        return;
      }

      const deleted = await deleteAssetWatermark(tenantId, assetId, watermarkId);
      if (!deleted) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Derivada con marca de agua no encontrada.' });
        return;
      }

      await logSecurityEvent(req, {
        eventType: 'ASSET_WATERMARK_DELETED',
        userId: actorId,
        status: 'SUCCESS',
        details: `Deleted watermarked derivative ID ${watermarkId} for asset ${assetId}`,
      });

      res.status(200).json({
        status: 200,
        message: 'Derivada con marca de agua eliminada exitosamente.',
      });
    } catch (err: any) {
      console.error('Delete watermark error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al eliminar la derivada con marca de agua.',
      });
    }
  },
);

/**
 * POST /api/v1/assets/:id/banner-adapt
 * Creates an adapted banner derivative for an asset (FC 031, OWASP A01/A03/A04/A09).
 */
router.post(
  '/:id/banner-adapt',
  bannerAdaptationRateLimiter,
  requireAuth,
  validate(createBannerAdaptationBodySchema, 'body'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const assetId = parseInt(String(req.params.id), 10);
      const actor: AclActor = { id: actorId, role: String(req.user!.role), tenantId };

      if (isNaN(assetId) || assetId <= 0) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'ID de activo inválido.' });
        return;
      }

      // Verify asset exists in tenant
      const assetRows = (await query(
        `SELECT id, current_version_id, mime_type FROM assets WHERE id = ? AND tenant_id = ? LIMIT 1`,
        [assetId, tenantId],
      )) as any[];

      if (!assetRows || assetRows.length === 0) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Activo digital no encontrado.' });
        return;
      }

      // ACL check: EDIT permission required
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'EDIT');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL) para adaptar banner a este activo.',
        });
        return;
      }

      const versionId = Number(assetRows[0].current_version_id) || 1;
      const input = req.body;

      const result = await createAssetBannerAdaptation(tenantId, assetId, versionId, input);

      if (!result.success) {
        res.status(result.statusCode).json({
          status: result.statusCode,
          error: result.statusCode === 404 ? 'Not Found' : 'Bad Request',
          message: result.message,
        });
        return;
      }

      await logSecurityEvent(req, {
        eventType: 'ASSET_BANNER_ADAPTED',
        userId: actorId,
        status: 'SUCCESS',
        details: `Adapted banner for asset ${assetId}, preset ${input.preset}, strategy ${input.strategy}`,
      });

      res.status(201).json({
        status: 201,
        message: 'Derivada de banner adaptada exitosamente.',
        data: result.adaptation,
      });
    } catch (err: any) {
      console.error('Create banner adaptation error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al procesar la adaptación de banner al activo.',
      });
    }
  },
);

/**
 * GET /api/v1/assets/:id/banner-adaptations
 * Lists all banner adaptations for an asset (FC 031, OWASP A01/A04/A09).
 */
router.get(
  '/:id/banner-adaptations',
  bannerAdaptationRateLimiter,
  requireAuth,
  validate(listBannerAdaptationsQuerySchema, 'query'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const assetId = parseInt(String(req.params.id), 10);
      const actor: AclActor = { id: actorId, role: String(req.user!.role), tenantId };

      if (isNaN(assetId) || assetId <= 0) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'ID de activo inválido.' });
        return;
      }

      // Verify asset exists in tenant
      const assetRows = (await query(
        `SELECT id FROM assets WHERE id = ? AND tenant_id = ? LIMIT 1`,
        [assetId, tenantId],
      )) as any[];

      if (!assetRows || assetRows.length === 0) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Activo digital no encontrado.' });
        return;
      }

      // ACL check: VIEW permission required
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'VIEW');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL) para consultar derivadas de banners adaptados.',
        });
        return;
      }

      const { limit, offset, preset, strategy } = req.query as any;
      const adaptations = await listAssetBannerAdaptations(
        tenantId,
        assetId,
        Number(limit),
        Number(offset),
        preset,
        strategy,
      );

      res.status(200).json({
        status: 200,
        message: 'Derivadas de banner recuperadas exitosamente.',
        data: adaptations,
      });
    } catch (err: any) {
      console.error('List banner adaptations error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al listar las adaptaciones de banner del activo.',
      });
    }
  },
);

/**
 * GET /api/v1/assets/:id/banner-adaptations/:adaptationId
 * Gets details of a specific banner adaptation (FC 031, OWASP A01/A04/A09).
 */
router.get(
  '/:id/banner-adaptations/:adaptationId',
  bannerAdaptationRateLimiter,
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const assetId = parseInt(String(req.params.id), 10);
      const adaptationId = parseInt(String(req.params.adaptationId), 10);
      const actor: AclActor = { id: actorId, role: String(req.user!.role), tenantId };

      if (isNaN(assetId) || assetId <= 0 || isNaN(adaptationId) || adaptationId <= 0) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'Parámetros inválidos.' });
        return;
      }

      // ACL check: VIEW permission required
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'VIEW');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL) para consultar la derivada de banner.',
        });
        return;
      }

      const adaptation = await getAssetBannerAdaptationById(tenantId, assetId, adaptationId);
      if (!adaptation) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Derivada de banner no encontrada.' });
        return;
      }

      res.status(200).json({
        status: 200,
        message: 'Detalle de derivada de banner recuperado exitosamente.',
        data: adaptation,
      });
    } catch (err: any) {
      console.error('Get banner adaptation detail error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al consultar el detalle de la derivada de banner.',
      });
    }
  },
);

/**
 * DELETE /api/v1/assets/:id/banner-adaptations/:adaptationId
 * Deletes a banner adaptation and unlinks its physical file from disk (FC 031, OWASP A01/A04/A09).
 */
router.delete(
  '/:id/banner-adaptations/:adaptationId',
  bannerAdaptationRateLimiter,
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const assetId = parseInt(String(req.params.id), 10);
      const adaptationId = parseInt(String(req.params.adaptationId), 10);
      const actor: AclActor = { id: actorId, role: String(req.user!.role), tenantId };

      if (isNaN(assetId) || assetId <= 0 || isNaN(adaptationId) || adaptationId <= 0) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'Parámetros inválidos.' });
        return;
      }

      // ACL check: EDIT permission required
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'EDIT');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL) para eliminar la derivada de banner.',
        });
        return;
      }

      const deleted = await deleteAssetBannerAdaptation(tenantId, assetId, adaptationId);
      if (!deleted) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Derivada de banner no encontrada.' });
        return;
      }

      await logSecurityEvent(req, {
        eventType: 'ASSET_BANNER_ADAPTATION_DELETED',
        userId: actorId,
        status: 'SUCCESS',
        details: `Deleted banner adaptation ID ${adaptationId} for asset ${assetId}`,
      });

      res.status(200).json({
        status: 200,
        message: 'Derivada de banner eliminada exitosamente.',
      });
    } catch (err: any) {
      console.error('Delete banner adaptation error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al eliminar la derivada de banner.',
      });
    }
  },
);

/**
 * POST /api/v1/assets/:id/transcode
 * Creates an adaptive bitrate video transcoding job/renditions (FC 032, OWASP A01/A03/A04/A09).
 */
router.post(
  '/:id/transcode',
  videoTranscodingRateLimiter,
  requireAuth,
  validate(createVideoTranscodingBodySchema, 'body'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const assetId = parseInt(String(req.params.id), 10);
      const actor: AclActor = { id: actorId, role: String(req.user!.role), tenantId };

      if (isNaN(assetId) || assetId <= 0) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'ID de activo inválido.' });
        return;
      }

      // Verify asset exists in tenant
      const assetRows = (await query(
        `SELECT id, current_version_id, mime_type FROM assets WHERE id = ? AND tenant_id = ? LIMIT 1`,
        [assetId, tenantId],
      )) as any[];

      if (!assetRows || assetRows.length === 0) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Activo digital no encontrado.' });
        return;
      }

      // ACL check: EDIT permission required
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'EDIT');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL) para transcodificar este video.',
        });
        return;
      }

      const versionId = Number(assetRows[0].current_version_id) || 1;
      const input = req.body;

      const result = await createAssetVideoTranscoding(tenantId, assetId, versionId, input);

      if (!result.success) {
        res.status(result.statusCode).json({
          status: result.statusCode,
          error: result.statusCode === 404 ? 'Not Found' : 'Bad Request',
          message: result.message,
        });
        return;
      }

      await logSecurityEvent(req, {
        eventType: 'ASSET_VIDEO_TRANSCODED',
        userId: actorId,
        status: 'SUCCESS',
        details: `Transcoded video for asset ${assetId}, profile ${input.profile}`,
      });

      res.status(201).json({
        status: 201,
        message: 'Video transcodificado exitosamente para streaming adaptativo.',
        data: result.transcoding,
      });
    } catch (err: any) {
      console.error('Create video transcoding error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al procesar la transcodificación de video.',
      });
    }
  },
);

/**
 * GET /api/v1/assets/:id/transcodings
 * Lists all video transcodings for an asset (FC 032, OWASP A01/A04/A09).
 */
router.get(
  '/:id/transcodings',
  videoTranscodingRateLimiter,
  requireAuth,
  validate(listVideoTranscodingsQuerySchema, 'query'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const assetId = parseInt(String(req.params.id), 10);
      const actor: AclActor = { id: actorId, role: String(req.user!.role), tenantId };

      if (isNaN(assetId) || assetId <= 0) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'ID de activo inválido.' });
        return;
      }

      // Verify asset exists in tenant
      const assetRows = (await query(
        `SELECT id FROM assets WHERE id = ? AND tenant_id = ? LIMIT 1`,
        [assetId, tenantId],
      )) as any[];

      if (!assetRows || assetRows.length === 0) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Activo digital no encontrado.' });
        return;
      }

      // ACL check: VIEW permission required
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'VIEW');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL) para consultar transcodificaciones.',
        });
        return;
      }

      const { limit, offset, profile, status } = req.query as any;
      const transcodings = await listAssetVideoTranscodings(
        tenantId,
        assetId,
        Number(limit),
        Number(offset),
        profile,
        status,
      );

      res.status(200).json({
        status: 200,
        message: 'Transcodificaciones de video recuperadas exitosamente.',
        data: transcodings,
      });
    } catch (err: any) {
      console.error('List video transcodings error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al listar las transcodificaciones de video del activo.',
      });
    }
  },
);

/**
 * GET /api/v1/assets/:id/transcodings/:transcodeId
 * Gets details and manifest of a specific video transcoding (FC 032, OWASP A01/A04/A09).
 */
router.get(
  '/:id/transcodings/:transcodeId',
  videoTranscodingRateLimiter,
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const assetId = parseInt(String(req.params.id), 10);
      const transcodeId = parseInt(String(req.params.transcodeId), 10);
      const actor: AclActor = { id: actorId, role: String(req.user!.role), tenantId };

      if (isNaN(assetId) || assetId <= 0 || isNaN(transcodeId) || transcodeId <= 0) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'Parámetros inválidos.' });
        return;
      }

      // ACL check: VIEW permission required
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'VIEW');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL) para consultar la transcodificación.',
        });
        return;
      }

      const transcoding = await getAssetVideoTranscodingById(tenantId, assetId, transcodeId);
      if (!transcoding) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Transcodificación de video no encontrada.' });
        return;
      }

      res.status(200).json({
        status: 200,
        message: 'Detalle de transcodificación de video recuperado exitosamente.',
        data: transcoding,
      });
    } catch (err: any) {
      console.error('Get video transcoding detail error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al consultar el detalle de la transcodificación de video.',
      });
    }
  },
);

/**
 * DELETE /api/v1/assets/:id/transcodings/:transcodeId
 * Deletes a video transcoding and recursively unlinks its manifest and segment chunks (FC 032, OWASP A01/A04/A09).
 */
router.delete(
  '/:id/transcodings/:transcodeId',
  videoTranscodingRateLimiter,
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const assetId = parseInt(String(req.params.id), 10);
      const transcodeId = parseInt(String(req.params.transcodeId), 10);
      const actor: AclActor = { id: actorId, role: String(req.user!.role), tenantId };

      if (isNaN(assetId) || assetId <= 0 || isNaN(transcodeId) || transcodeId <= 0) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'Parámetros inválidos.' });
        return;
      }

      // ACL check: EDIT permission required
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'EDIT');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL) para eliminar la transcodificación.',
        });
        return;
      }

      const deleted = await deleteAssetVideoTranscoding(tenantId, assetId, transcodeId);
      if (!deleted) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Transcodificación de video no encontrada.' });
        return;
      }

      await logSecurityEvent(req, {
        eventType: 'ASSET_VIDEO_TRANSCODING_DELETED',
        userId: actorId,
        status: 'SUCCESS',
        details: `Deleted video transcoding ID ${transcodeId} for asset ${assetId}`,
      });

      res.status(200).json({
        status: 200,
        message: 'Transcodificación de video eliminada exitosamente.',
      });
    } catch (err: any) {
      console.error('Delete video transcoding error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al eliminar la transcodificación de video.',
      });
    }
  },
);

/**
 * GET /api/v1/assets/:id/transcodings/:transcodeId/stream/:filename
 * Auth-gated delivery of HLS playlists (.m3u8), media segments (.ts) or web MP4 (FC 032, OWASP A01/A04/A07).
 */
router.get(
  '/:id/transcodings/:transcodeId/stream/:filename',
  videoTranscodingRateLimiter,
  requireAuth,
  validate(streamFileParamSchema, 'params'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const assetId = parseInt(String(req.params.id), 10);
      const transcodeId = parseInt(String(req.params.transcodeId), 10);
      const filename = String(req.params.filename);
      const actor: AclActor = { id: actorId, role: String(req.user!.role), tenantId };

      // ACL check: VIEW permission required
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'VIEW');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL) para reproducir el flujo de streaming.',
        });
        return;
      }

      const filePath = await getTranscodingStreamFilePath(tenantId, assetId, transcodeId, filename);
      if (!filePath) {
        res.status(404).json({
          status: 404,
          error: 'Not Found',
          message: 'Archivo de streaming o segmento no encontrado.',
        });
        return;
      }

      if (filename.endsWith('.m3u8')) {
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      } else if (filename.endsWith('.ts')) {
        res.setHeader('Content-Type', 'video/mp2t');
      } else if (filename.endsWith('.mp4')) {
        res.setHeader('Content-Type', 'video/mp4');
      } else {
        res.setHeader('Content-Type', 'application/octet-stream');
      }

      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
    } catch (err: any) {
      console.error('Stream video transcoding file error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al servir el segmento de streaming de video.',
      });
    }
  },
);

/**
 * POST /api/v1/assets/:id/video-thumbnail
 * Generates a static poster or animated preview (GIF/WebP/VTT) (FC 033, OWASP A01/A03/A04/A09).
 */
router.post(
  '/:id/video-thumbnail',
  videoThumbnailRateLimiter,
  requireAuth,
  validate(createVideoThumbnailBodySchema, 'body'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const assetId = parseInt(String(req.params.id), 10);
      const actor: AclActor = { id: actorId, role: String(req.user!.role), tenantId };

      if (isNaN(assetId) || assetId <= 0) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'ID de activo inválido.' });
        return;
      }

      // Verify asset exists in tenant
      const assetRows = (await query(
        `SELECT id, current_version_id, mime_type FROM assets WHERE id = ? AND tenant_id = ? LIMIT 1`,
        [assetId, tenantId],
      )) as any[];

      if (!assetRows || assetRows.length === 0) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Activo digital no encontrado.' });
        return;
      }

      // ACL check: EDIT permission required
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'EDIT');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL) para generar miniaturas de este video.',
        });
        return;
      }

      const versionId = Number(assetRows[0].current_version_id) || 1;
      const input = req.body;

      const result = await createAssetVideoThumbnail(tenantId, assetId, versionId, input);

      if (!result.success) {
        res.status(result.statusCode).json({
          status: result.statusCode,
          error: result.statusCode === 404 ? 'Not Found' : 'Bad Request',
          message: result.message,
        });
        return;
      }

      await logSecurityEvent(req, {
        eventType: 'ASSET_VIDEO_THUMBNAIL_CREATED',
        userId: actorId,
        status: 'SUCCESS',
        details: `Generated video thumbnail for asset ${assetId}, type ${input.thumbnail_type}`,
      });

      res.status(201).json({
        status: 201,
        message: 'Miniatura o vista previa de video generada exitosamente.',
        data: result.thumbnail,
      });
    } catch (err: any) {
      console.error('Create video thumbnail error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al generar la miniatura o vista previa de video.',
      });
    }
  },
);

/**
 * GET /api/v1/assets/:id/video-thumbnails
 * Lists all video thumbnails and animated previews for an asset (FC 033, OWASP A01/A04/A09).
 */
router.get(
  '/:id/video-thumbnails',
  videoThumbnailRateLimiter,
  requireAuth,
  validate(listVideoThumbnailsQuerySchema, 'query'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const assetId = parseInt(String(req.params.id), 10);
      const actor: AclActor = { id: actorId, role: String(req.user!.role), tenantId };

      if (isNaN(assetId) || assetId <= 0) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'ID de activo inválido.' });
        return;
      }

      // Verify asset exists in tenant
      const assetRows = (await query(
        `SELECT id FROM assets WHERE id = ? AND tenant_id = ? LIMIT 1`,
        [assetId, tenantId],
      )) as any[];

      if (!assetRows || assetRows.length === 0) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Activo digital no encontrado.' });
        return;
      }

      // ACL check: VIEW permission required
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'VIEW');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL) para consultar miniaturas.',
        });
        return;
      }

      const { limit, offset, thumbnail_type } = req.query as any;
      const thumbnails = await listAssetVideoThumbnails(
        tenantId,
        assetId,
        Number(limit),
        Number(offset),
        thumbnail_type,
      );

      res.status(200).json({
        status: 200,
        message: 'Miniaturas y vistas previas de video recuperadas exitosamente.',
        data: thumbnails,
      });
    } catch (err: any) {
      console.error('List video thumbnails error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al listar las miniaturas de video del activo.',
      });
    }
  },
);

/**
 * GET /api/v1/assets/:id/video-thumbnails/:thumbnailId
 * Gets details of a specific video thumbnail or animated preview (FC 033, OWASP A01/A04/A09).
 */
router.get(
  '/:id/video-thumbnails/:thumbnailId',
  videoThumbnailRateLimiter,
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const assetId = parseInt(String(req.params.id), 10);
      const thumbnailId = parseInt(String(req.params.thumbnailId), 10);
      const actor: AclActor = { id: actorId, role: String(req.user!.role), tenantId };

      if (isNaN(assetId) || assetId <= 0 || isNaN(thumbnailId) || thumbnailId <= 0) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'Parámetros inválidos.' });
        return;
      }

      // ACL check: VIEW permission required
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'VIEW');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL) para consultar la miniatura.',
        });
        return;
      }

      const thumbnail = await getAssetVideoThumbnailById(tenantId, assetId, thumbnailId);
      if (!thumbnail) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Miniatura de video no encontrada.' });
        return;
      }

      res.status(200).json({
        status: 200,
        message: 'Detalle de miniatura de video recuperado exitosamente.',
        data: thumbnail,
      });
    } catch (err: any) {
      console.error('Get video thumbnail detail error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al consultar el detalle de la miniatura de video.',
      });
    }
  },
);

/**
 * DELETE /api/v1/assets/:id/video-thumbnails/:thumbnailId
 * Deletes a video thumbnail and physically unlinks its file from storage (FC 033, OWASP A01/A04/A09).
 */
router.delete(
  '/:id/video-thumbnails/:thumbnailId',
  videoThumbnailRateLimiter,
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const assetId = parseInt(String(req.params.id), 10);
      const thumbnailId = parseInt(String(req.params.thumbnailId), 10);
      const actor: AclActor = { id: actorId, role: String(req.user!.role), tenantId };

      if (isNaN(assetId) || assetId <= 0 || isNaN(thumbnailId) || thumbnailId <= 0) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'Parámetros inválidos.' });
        return;
      }

      // ACL check: EDIT permission required
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'EDIT');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL) para eliminar la miniatura.',
        });
        return;
      }

      const deleted = await deleteAssetVideoThumbnail(tenantId, assetId, thumbnailId);
      if (!deleted) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Miniatura de video no encontrada.' });
        return;
      }

      await logSecurityEvent(req, {
        eventType: 'ASSET_VIDEO_THUMBNAIL_DELETED',
        userId: actorId,
        status: 'SUCCESS',
        details: `Deleted video thumbnail ID ${thumbnailId} for asset ${assetId}`,
      });

      res.status(200).json({
        status: 200,
        message: 'Miniatura de video eliminada exitosamente.',
      });
    } catch (err: any) {
      console.error('Delete video thumbnail error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al eliminar la miniatura de video.',
      });
    }
  },
);

/**
 * POST /api/v1/assets/:id/video-chapters
 * Automatically creates/regenerates video chapters and structured summary (FC 034, OWASP A01/A03/A04/A09).
 */
router.post(
  '/:id/video-chapters',
  videoChapterRateLimiter,
  requireAuth,
  validate(createVideoChaptersBodySchema, 'body'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const assetId = parseInt(String(req.params.id), 10);
      const actor: AclActor = { id: actorId, role: String(req.user!.role), tenantId };

      if (isNaN(assetId) || assetId <= 0) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'ID de activo inválido.' });
        return;
      }

      // Verify asset exists in tenant
      const assetRows = (await query(
        `SELECT id, current_version_id FROM assets WHERE id = ? AND tenant_id = ? LIMIT 1`,
        [assetId, tenantId],
      )) as any[];

      if (!assetRows || assetRows.length === 0) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Activo digital no encontrado.' });
        return;
      }

      // ACL check: EDIT permission required
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'EDIT');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL) para generar capítulos de este video.',
        });
        return;
      }

      const versionId = Number(assetRows[0].current_version_id) || 1;
      const input = req.body;

      const result = await createAssetVideoChapters(tenantId, assetId, versionId, input);

      if (!result.success) {
        res.status(result.statusCode).json({
          status: result.statusCode,
          error: result.statusCode === 404 ? 'Not Found' : 'Bad Request',
          message: result.message,
        });
        return;
      }

      await logSecurityEvent(req, {
        eventType: 'ASSET_VIDEO_CHAPTERS_CREATED',
        userId: actorId,
        status: 'SUCCESS',
        details: `Generated ${result.chapters.length} chapters and ${input.summary_type} summary for asset ${assetId}`,
      });

      res.status(201).json({
        status: 201,
        message: 'Capítulos y resumen estructurado de video generados exitosamente.',
        data: {
          chapters: result.chapters,
          summary: result.summary,
        },
      });
    } catch (err: any) {
      console.error('Create video chapters error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al generar los capítulos y resumen de video.',
      });
    }
  },
);

/**
 * GET /api/v1/assets/:id/video-chapters
 * Lists all chapters for a video asset (FC 034, OWASP A01/A04/A09).
 */
router.get(
  '/:id/video-chapters',
  videoChapterRateLimiter,
  requireAuth,
  validate(listVideoChaptersQuerySchema, 'query'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const assetId = parseInt(String(req.params.id), 10);
      const actor: AclActor = { id: actorId, role: String(req.user!.role), tenantId };

      if (isNaN(assetId) || assetId <= 0) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'ID de activo inválido.' });
        return;
      }

      // Verify asset exists in tenant
      const assetRows = (await query(
        `SELECT id FROM assets WHERE id = ? AND tenant_id = ? LIMIT 1`,
        [assetId, tenantId],
      )) as any[];

      if (!assetRows || assetRows.length === 0) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Activo digital no encontrado.' });
        return;
      }

      // ACL check: VIEW permission required
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'VIEW');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL) para consultar capítulos.',
        });
        return;
      }

      const { limit, offset } = req.query as any;
      const chapters = await listAssetVideoChapters(
        tenantId,
        assetId,
        Number(limit),
        Number(offset),
      );

      res.status(200).json({
        status: 200,
        message: 'Capítulos de video recuperados exitosamente.',
        data: chapters,
      });
    } catch (err: any) {
      console.error('List video chapters error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al listar los capítulos de video del activo.',
      });
    }
  },
);

/**
 * GET /api/v1/assets/:id/video-summary
 * Gets structured summary for a video asset (FC 034, OWASP A01/A04/A09).
 */
router.get(
  '/:id/video-summary',
  videoChapterRateLimiter,
  requireAuth,
  validate(getVideoSummaryQuerySchema, 'query'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const assetId = parseInt(String(req.params.id), 10);
      const actor: AclActor = { id: actorId, role: String(req.user!.role), tenantId };

      if (isNaN(assetId) || assetId <= 0) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'ID de activo inválido.' });
        return;
      }

      // Verify asset exists in tenant
      const assetRows = (await query(
        `SELECT id FROM assets WHERE id = ? AND tenant_id = ? LIMIT 1`,
        [assetId, tenantId],
      )) as any[];

      if (!assetRows || assetRows.length === 0) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Activo digital no encontrado.' });
        return;
      }

      // ACL check: VIEW permission required
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'VIEW');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL) para consultar el resumen.',
        });
        return;
      }

      const { summary_type } = req.query as any;
      const summary = await getAssetVideoSummary(tenantId, assetId, summary_type);

      if (!summary) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Resumen de video no encontrado.' });
        return;
      }

      res.status(200).json({
        status: 200,
        message: 'Resumen estructurado de video recuperado exitosamente.',
        data: summary,
      });
    } catch (err: any) {
      console.error('Get video summary error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al consultar el resumen estructurado de video.',
      });
    }
  },
);

/**
 * PUT /api/v1/assets/:id/video-chapters/:chapterId
 * Manually updates a chapter title, description, or timestamps (FC 034, OWASP A01/A04/A09).
 */
router.put(
  '/:id/video-chapters/:chapterId',
  videoChapterRateLimiter,
  requireAuth,
  validate(updateVideoChapterBodySchema, 'body'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const assetId = parseInt(String(req.params.id), 10);
      const chapterId = parseInt(String(req.params.chapterId), 10);
      const actor: AclActor = { id: actorId, role: String(req.user!.role), tenantId };

      if (isNaN(assetId) || assetId <= 0 || isNaN(chapterId) || chapterId <= 0) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'Parámetros inválidos.' });
        return;
      }

      // ACL check: EDIT permission required
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'EDIT');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL) para actualizar el capítulo.',
        });
        return;
      }

      const updated = await updateAssetVideoChapter(tenantId, assetId, chapterId, req.body);
      if (!updated) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Capítulo de video no encontrado.' });
        return;
      }

      await logSecurityEvent(req, {
        eventType: 'ASSET_VIDEO_CHAPTER_UPDATED',
        userId: actorId,
        status: 'SUCCESS',
        details: `Updated video chapter ID ${chapterId} for asset ${assetId}`,
      });

      res.status(200).json({
        status: 200,
        message: 'Capítulo de video actualizado exitosamente.',
        data: updated,
      });
    } catch (err: any) {
      console.error('Update video chapter error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al actualizar el capítulo de video.',
      });
    }
  },
);

/**
 * DELETE /api/v1/assets/:id/video-chapters
 * Deletes all chapters and summaries for an asset (FC 034, OWASP A01/A04/A09).
 */
router.delete(
  '/:id/video-chapters',
  videoChapterRateLimiter,
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const assetId = parseInt(String(req.params.id), 10);
      const actor: AclActor = { id: actorId, role: String(req.user!.role), tenantId };

      if (isNaN(assetId) || assetId <= 0) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'ID de activo inválido.' });
        return;
      }

      // ACL check: EDIT permission required
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'EDIT');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL) para eliminar capítulos.',
        });
        return;
      }

      const deleted = await deleteAssetVideoChapters(tenantId, assetId);
      if (!deleted) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'No se encontraron capítulos ni resúmenes para eliminar.' });
        return;
      }

      await logSecurityEvent(req, {
        eventType: 'ASSET_VIDEO_CHAPTERS_DELETED',
        userId: actorId,
        status: 'SUCCESS',
        details: `Deleted all chapters and summaries for asset ${assetId}`,
      });

      res.status(200).json({
        status: 200,
        message: 'Capítulos y resúmenes de video eliminados exitosamente.',
      });
    } catch (err: any) {
      console.error('Delete video chapters error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al eliminar los capítulos de video.',
      });
    }
  },
);

/**
 * POST /api/v1/assets/:id/audio-spectral-profile
 * Creates or updates an audio spectral profile and generates spectrogram visualization derivative (FC 035, OWASP A01/A03/A04/A09).
 */
router.post(
  '/:id/audio-spectral-profile',
  audioSpectralRateLimiter,
  requireAuth,
  validate(createAudioSpectralBodySchema, 'body'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const assetId = parseInt(String(req.params.id), 10);
      const actor: AclActor = { id: actorId, role: String(req.user!.role), tenantId };

      if (isNaN(assetId) || assetId <= 0) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'ID de activo inválido.' });
        return;
      }

      // Verify asset exists in tenant
      const assetRows = (await query(
        `SELECT id, current_version_id, mime_type FROM assets WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL LIMIT 1`,
        [assetId, tenantId],
      )) as any[];

      if (!assetRows || assetRows.length === 0) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Activo digital no encontrado.' });
        return;
      }

      const mimeType = String(assetRows[0].mime_type || '');
      if (!mimeType.startsWith('audio/') && !mimeType.startsWith('video/')) {
        res.status(400).json({
          status: 400,
          error: 'Bad Request',
          message: 'Solo activos de audio o video pueden ser perfilados espectralmente.',
        });
        return;
      }

      // ACL check: EDIT permission required
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'EDIT');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL) para generar perfiles espectrales de este activo.',
        });
        return;
      }

      const versionId = Number(assetRows[0].current_version_id) || 1;
      const input = req.body;

      const profile = await createAssetAudioSpectralProfile(tenantId, assetId, versionId, input);

      await logSecurityEvent(req, {
        eventType: 'ASSET_AUDIO_SPECTRAL_PROFILE_CREATED',
        userId: actorId,
        status: 'SUCCESS',
        details: `Created audio spectral profile ${profile.profile_type} (${profile.base_frequency_hz}Hz) for asset ${assetId}`,
      });

      res.status(201).json({
        status: 201,
        message: 'Perfil espectral de audio generado exitosamente.',
        data: profile,
      });
    } catch (err: any) {
      console.error('Create audio spectral profile error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al generar el perfil espectral de audio.',
      });
    }
  },
);

/**
 * GET /api/v1/assets/:id/audio-spectral-profiles
 * Lists all audio spectral profiles for an asset (FC 035, OWASP A01/A03/A04).
 */
router.get(
  '/:id/audio-spectral-profiles',
  audioSpectralRateLimiter,
  requireAuth,
  validate(listAudioSpectralQuerySchema, 'query'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const assetId = parseInt(String(req.params.id), 10);
      const actor: AclActor = { id: actorId, role: String(req.user!.role), tenantId };

      if (isNaN(assetId) || assetId <= 0) {
        res.status(400).json({ status: 400, error: 'Bad Request', message: 'ID de activo inválido.' });
        return;
      }

      // Verify asset exists in tenant
      const assetRows = (await query(
        `SELECT id FROM assets WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL LIMIT 1`,
        [assetId, tenantId],
      )) as any[];

      if (!assetRows || assetRows.length === 0) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Activo digital no encontrado.' });
        return;
      }

      // ACL check: VIEW permission required
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'VIEW');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL) para consultar perfiles espectrales de este activo.',
        });
        return;
      }

      const limit = Number(req.query.limit);
      const offset = Number(req.query.offset);
      const profileType = req.query.profile_type ? String(req.query.profile_type) : undefined;

      const profiles = await listAssetAudioSpectralProfiles(tenantId, assetId, limit, offset, profileType);

      res.status(200).json({
        status: 200,
        data: profiles,
      });
    } catch (err: any) {
      console.error('List audio spectral profiles error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al listar los perfiles espectrales de audio.',
      });
    }
  },
);

/**
 * GET /api/v1/assets/:id/audio-spectral-profiles/:profileId
 * Gets details of a specific audio spectral profile (FC 035, OWASP A01/A03/A04).
 */
router.get(
  '/:id/audio-spectral-profiles/:profileId',
  audioSpectralRateLimiter,
  requireAuth,
  validate(audioSpectralParamSchema, 'params'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const assetId = parseInt(String(req.params.id), 10);
      const profileId = parseInt(String(req.params.profileId), 10);
      const actor: AclActor = { id: actorId, role: String(req.user!.role), tenantId };

      // Verify asset exists in tenant
      const assetRows = (await query(
        `SELECT id FROM assets WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL LIMIT 1`,
        [assetId, tenantId],
      )) as any[];

      if (!assetRows || assetRows.length === 0) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Activo digital no encontrado.' });
        return;
      }

      // ACL check: VIEW permission required
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'VIEW');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL) para consultar este perfil espectral.',
        });
        return;
      }

      const profile = await getAssetAudioSpectralProfileById(tenantId, assetId, profileId);

      if (!profile) {
        res.status(404).json({
          status: 404,
          error: 'Not Found',
          message: 'Perfil espectral no encontrado.',
        });
        return;
      }

      res.status(200).json({
        status: 200,
        data: profile,
      });
    } catch (err: any) {
      console.error('Get audio spectral profile error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al consultar el perfil espectral de audio.',
      });
    }
  },
);

/**
 * DELETE /api/v1/assets/:id/audio-spectral-profiles/:profileId
 * Deletes an audio spectral profile and removes physical derivative (FC 035, OWASP A01/A03/A04/A09).
 */
router.delete(
  '/:id/audio-spectral-profiles/:profileId',
  audioSpectralRateLimiter,
  requireAuth,
  validate(audioSpectralParamSchema, 'params'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = Number(req.user!.tenantId);
      const actorId = Number(req.user!.userId);
      const assetId = parseInt(String(req.params.id), 10);
      const profileId = parseInt(String(req.params.profileId), 10);
      const actor: AclActor = { id: actorId, role: String(req.user!.role), tenantId };

      // Verify asset exists in tenant
      const assetRows = (await query(
        `SELECT id FROM assets WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL LIMIT 1`,
        [assetId, tenantId],
      )) as any[];

      if (!assetRows || assetRows.length === 0) {
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Activo digital no encontrado.' });
        return;
      }

      // ACL check: EDIT permission required
      const evalResult = await evaluateAclPermission(actor, 'ASSET', assetId, 'EDIT');
      if (!evalResult.allowed) {
        res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Acceso denegado por política de control de acceso (ACL) para eliminar este perfil espectral.',
        });
        return;
      }

      const deleted = await deleteAssetAudioSpectralProfile(tenantId, assetId, profileId);

      if (!deleted) {
        res.status(404).json({
          status: 404,
          error: 'Not Found',
          message: 'Perfil espectral no encontrado para eliminar.',
        });
        return;
      }

      await logSecurityEvent(req, {
        eventType: 'ASSET_AUDIO_SPECTRAL_PROFILE_DELETED',
        userId: actorId,
        status: 'SUCCESS',
        details: `Deleted audio spectral profile ${profileId} for asset ${assetId}`,
      });

      res.status(200).json({
        status: 200,
        message: 'Perfil espectral de audio eliminado exitosamente.',
      });
    } catch (err: any) {
      console.error('Delete audio spectral profile error:', err);
      res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'Error al eliminar el perfil espectral de audio.',
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



