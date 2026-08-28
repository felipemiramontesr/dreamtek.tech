/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import express, { Express } from 'express';
import request from 'supertest';
import * as db from '../../../server/src/db';
import assetsRouter from '../../../server/src/routes/assets';
import { STORAGE_ROOT } from '../../../server/src/utils/storage';
import { evaluateAclPermission } from '../../../server/src/utils/acl';
import { dispatchWebhookEvent } from '../../../server/src/utils/webhookDispatcher';
import {
  VideoThumbnailTypeEnum,
  createVideoThumbnailBodySchema,
  listVideoThumbnailsQuerySchema,
  videoThumbnailParamSchema,
} from '../../../server/src/schemas/videoThumbnail.schema';
import {
  clampTimestampOffset,
  generateVttHoverScrubberContent,
  executeVideoThumbnailGeneration,
  createAssetVideoThumbnail,
  listAssetVideoThumbnails,
  getAssetVideoThumbnailById,
  deleteAssetVideoThumbnail,
  MAX_PIXELS,
} from '../../../server/src/utils/videoThumbnailEngine';
import { videoThumbnailRateLimiter } from '../../../server/src/middleware/rateLimiter';

// Mock database, ACL, and Webhooks
vi.mock('../../../server/src/db', () => ({
  query: vi.fn(),
}));

vi.mock('../../../server/src/utils/acl', () => ({
  evaluateAclPermission: vi.fn(),
}));

vi.mock('../../../server/src/utils/webhookDispatcher', () => ({
  dispatchWebhookEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../server/src/middleware/auditLogger', () => ({
  logSecurityEvent: vi.fn().mockResolvedValue(undefined),
}));

// Mock authentication middleware
vi.mock('../../../server/src/middleware/auth', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = {
      userId: 1,
      tenantId: 100,
      role: 'ADMIN',
    };
    next();
  },
  requireRole: () => (_req: any, _res: any, next: any) => next(),
}));

describe('FC 033 — DAM AI Smart Video Thumbnail & Animated Preview Generation Suite (100% 4x100)', () => {
  const testTenantId = 100;
  const testAssetId = 80;
  const testVersionId = 1;
  const tempDir = path.join(STORAGE_ROOT, 'derivatives', `tenant_${testTenantId}`);
  const testVideoPath = path.join(tempDir, 'sample_video.mp4');

  let app: Express;
  let reqCount = 0;

  const nextIp = () => {
    reqCount++;
    return `10.60.${Math.floor(reqCount / 200)}.${(reqCount % 200) + 1}`;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.query).mockReset();
    vi.mocked(evaluateAclPermission).mockReset();
    fs.mkdirSync(tempDir, { recursive: true });
    fs.writeFileSync(testVideoPath, Buffer.from('FAKE_MP4_RAW_BYTES_FOR_THUMB'));

    app = express();
    app.set('trust proxy', true);
    app.use(express.json());
    app.use('/api/v1/assets', assetsRouter);
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore
    }
  });

  afterAll(() => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore
    }
  });

  describe('1. Zod Schemas Validation (videoThumbnail.schema.ts)', () => {
    it('VideoThumbnailTypeEnum debe validar tipos permitidos y rechazar inválidos', () => {
      expect(VideoThumbnailTypeEnum.safeParse('STATIC_POSTER').success).toBe(true);
      expect(VideoThumbnailTypeEnum.safeParse('ANIMATED_GIF').success).toBe(true);
      expect(VideoThumbnailTypeEnum.safeParse('ANIMATED_WEBP').success).toBe(true);
      expect(VideoThumbnailTypeEnum.safeParse('HOVER_SCRUBBER_VTT').success).toBe(true);
      expect(VideoThumbnailTypeEnum.safeParse('INVALID_TYPE').success).toBe(false);
    });

    it('createVideoThumbnailBodySchema debe validar cuerpo correcto y valores por defecto', () => {
      const parsedDefault = createVideoThumbnailBodySchema.safeParse({});
      expect(parsedDefault.success).toBe(true);
      if (parsedDefault.success) {
        expect(parsedDefault.data.thumbnail_type).toBe('STATIC_POSTER');
        expect(parsedDefault.data.timestamp_offset_seconds).toBe(0);
        expect(parsedDefault.data.duration_seconds).toBe(3);
        expect(parsedDefault.data.width).toBe(640);
        expect(parsedDefault.data.height).toBe(360);
        expect(parsedDefault.data.fps).toBe(10);
      }

      const parsedCustom = createVideoThumbnailBodySchema.safeParse({
        thumbnail_type: 'ANIMATED_GIF',
        timestamp_offset_seconds: 15.5,
        duration_seconds: 5,
        width: 1280,
        height: 720,
        fps: 24,
      });
      expect(parsedCustom.success).toBe(true);

      // Bounds validation
      expect(
        createVideoThumbnailBodySchema.safeParse({ timestamp_offset_seconds: -1 }).success,
      ).toBe(false);
      expect(createVideoThumbnailBodySchema.safeParse({ duration_seconds: 0 }).success).toBe(false);
      expect(createVideoThumbnailBodySchema.safeParse({ duration_seconds: 15 }).success).toBe(
        false,
      );
      expect(createVideoThumbnailBodySchema.safeParse({ fps: 0 }).success).toBe(false);
      expect(createVideoThumbnailBodySchema.safeParse({ fps: 40 }).success).toBe(false);
    });

    it('listVideoThumbnailsQuerySchema y videoThumbnailParamSchema deben validar parámetros', () => {
      const parsedQuery = listVideoThumbnailsQuerySchema.safeParse({
        limit: '25',
        offset: '10',
        thumbnail_type: 'ANIMATED_WEBP',
      });
      expect(parsedQuery.success).toBe(true);
      if (parsedQuery.success) {
        expect(parsedQuery.data.limit).toBe(25);
        expect(parsedQuery.data.thumbnail_type).toBe('ANIMATED_WEBP');
      }

      expect(listVideoThumbnailsQuerySchema.safeParse({ limit: '500' }).success).toBe(false);
      expect(listVideoThumbnailsQuerySchema.safeParse({ offset: '-1' }).success).toBe(false);

      expect(videoThumbnailParamSchema.safeParse({ id: '80', thumbnailId: '5' }).success).toBe(
        true,
      );
      expect(videoThumbnailParamSchema.safeParse({ id: '0', thumbnailId: '5' }).success).toBe(
        false,
      );
      expect(videoThumbnailParamSchema.safeParse({ id: '80', thumbnailId: '0' }).success).toBe(
        false,
      );
    });
  });

  describe('2. Helper Functions (videoThumbnailEngine.ts)', () => {
    it('clampTimestampOffset debe limitar y redondear los desplazamientos de tiempo', () => {
      expect(clampTimestampOffset(-5, 60)).toBe(0);
      expect(clampTimestampOffset(75, 60)).toBe(60);
      expect(clampTimestampOffset(12.3456, 60)).toBe(12.35);
      expect(clampTimestampOffset(10, 60)).toBe(10);
    });

    it('generateVttHoverScrubberContent debe generar estructura WebVTT con marcas de tiempo y sprites', () => {
      const vtt = generateVttHoverScrubberContent('sprite.webp', 160, 90, 10, 2);
      expect(vtt).toContain('WEBVTT');
      expect(vtt).toContain('00:00:00.000 --> 00:00:02.000');
      expect(vtt).toContain('sprite.webp#xywh=0,0,160,90');
      expect(vtt).toContain('00:00:08.000 --> 00:00:10.000');
    });
  });

  describe('3. Pipeline Execution (executeVideoThumbnailGeneration)', () => {
    it('executeVideoThumbnailGeneration debe generar STATIC_POSTER con Sharp', async () => {
      const result = await executeVideoThumbnailGeneration(
        testTenantId,
        testAssetId,
        testVersionId,
        {
          thumbnail_type: 'STATIC_POSTER',
          timestamp_offset_seconds: 5,
          duration_seconds: 3,
          width: 640,
          height: 360,
          fps: 10,
        },
        testVideoPath,
      );

      expect(fs.existsSync(result.outputDerivativePath)).toBe(true);
      expect(result.outputDerivativePath).toContain('poster_500.webp');
      expect(result.metadata.thumbnail_type).toBe('STATIC_POSTER');
    });

    it('executeVideoThumbnailGeneration debe generar ANIMATED_WEBP con Sharp', async () => {
      const result = await executeVideoThumbnailGeneration(
        testTenantId,
        testAssetId,
        testVersionId,
        {
          thumbnail_type: 'ANIMATED_WEBP',
          timestamp_offset_seconds: 0,
          duration_seconds: 4,
          width: 320,
          height: 180,
          fps: 15,
        },
        testVideoPath,
      );

      expect(fs.existsSync(result.outputDerivativePath)).toBe(true);
      expect(result.outputDerivativePath).toContain('animated_0.webp');
      expect(result.metadata.thumbnail_type).toBe('ANIMATED_WEBP');
    });

    it('executeVideoThumbnailGeneration debe generar ANIMATED_GIF con Sharp', async () => {
      const result = await executeVideoThumbnailGeneration(
        testTenantId,
        testAssetId,
        testVersionId,
        {
          thumbnail_type: 'ANIMATED_GIF',
          timestamp_offset_seconds: 2.5,
          duration_seconds: 3,
          width: 320,
          height: 180,
          fps: 12,
        },
        testVideoPath,
      );

      expect(fs.existsSync(result.outputDerivativePath)).toBe(true);
      expect(result.outputDerivativePath).toContain('animated_250.gif');
      expect(result.metadata.thumbnail_type).toBe('ANIMATED_GIF');
    });

    it('executeVideoThumbnailGeneration debe generar HOVER_SCRUBBER_VTT con sprite y manifest', async () => {
      const result = await executeVideoThumbnailGeneration(
        testTenantId,
        testAssetId,
        testVersionId,
        {
          thumbnail_type: 'HOVER_SCRUBBER_VTT',
          timestamp_offset_seconds: 0,
          duration_seconds: 3,
          width: 160,
          height: 90,
          fps: 10,
        },
        testVideoPath,
      );

      expect(fs.existsSync(result.outputDerivativePath)).toBe(true);
      expect(result.outputDerivativePath.endsWith('.vtt')).toBe(true);
      expect(result.metadata.sprite_filename).toBeDefined();

      const spritePath = path.join(tempDir, result.metadata.sprite_filename);
      expect(fs.existsSync(spritePath)).toBe(true);
    });

    it('executeVideoThumbnailGeneration debe fallar si archivo no existe o dimensiones exceden límite', async () => {
      const ghostVideo = path.join(tempDir, 'ghost.mp4');
      await expect(
        executeVideoThumbnailGeneration(
          testTenantId,
          testAssetId,
          testVersionId,
          {
            thumbnail_type: 'STATIC_POSTER',
            timestamp_offset_seconds: 0,
            duration_seconds: 3,
            width: 640,
            height: 360,
            fps: 10,
          },
          ghostVideo,
        ),
      ).rejects.toThrow('El archivo de video no existe');

      // Test dimensions > MAX_PIXELS
      const originalMaxPixels = MAX_PIXELS;
      await expect(
        executeVideoThumbnailGeneration(
          testTenantId,
          testAssetId,
          testVersionId,
          {
            thumbnail_type: 'STATIC_POSTER',
            timestamp_offset_seconds: 0,
            duration_seconds: 3,
            width: 10000,
            height: 10000,
            fps: 10,
          },
          testVideoPath,
        ),
      ).rejects.toThrow('exceden el límite máximo');
      expect(originalMaxPixels).toBe(16_000_000);
    });
  });

  describe('4. Engine Service Functions (videoThumbnailEngine.ts)', () => {
    it('createAssetVideoThumbnail debe retornar 404 si el activo no existe', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const result = await createAssetVideoThumbnail(testTenantId, testAssetId, 1, {
        thumbnail_type: 'STATIC_POSTER',
        timestamp_offset_seconds: 0,
        duration_seconds: 3,
        width: 640,
        height: 360,
        fps: 10,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.statusCode).toBe(404);
        expect(result.message).toContain('no encontrado');
      }
    });

    it('createAssetVideoThumbnail debe retornar 400 si el MIME no es video o es nulo', async () => {
      // Non-video MIME (image/png)
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: testAssetId,
          tenant_id: testTenantId,
          mime_type: 'image/png',
          current_version_id: 1,
          storage_path: testVideoPath,
        },
      ]);
      const resNonVideo = await createAssetVideoThumbnail(testTenantId, testAssetId, 1, {
        thumbnail_type: 'STATIC_POSTER',
        timestamp_offset_seconds: 0,
        duration_seconds: 3,
        width: 640,
        height: 360,
        fps: 10,
      });
      expect(resNonVideo.success).toBe(false);
      if (!resNonVideo.success) {
        expect(resNonVideo.statusCode).toBe(400);
        expect(resNonVideo.message).toContain('Solo se admiten formatos de video');
      }

      // Null MIME -> 'desconocido'
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: testAssetId,
          tenant_id: testTenantId,
          mime_type: null,
          current_version_id: 1,
          storage_path: testVideoPath,
        },
      ]);
      const resNull = await createAssetVideoThumbnail(testTenantId, testAssetId, 1, {
        thumbnail_type: 'STATIC_POSTER',
        timestamp_offset_seconds: 0,
        duration_seconds: 3,
        width: 640,
        height: 360,
        fps: 10,
      });
      expect(resNull.success).toBe(false);
      if (!resNull.success) {
        expect(resNull.statusCode).toBe(400);
        expect(resNull.message).toContain('desconocido');
      }
    });

    it('createAssetVideoThumbnail debe retornar 404 si el archivo físico no existe o fallback falla', async () => {
      const nonExistent = path.join(tempDir, 'missing.mp4');
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: testAssetId,
          tenant_id: testTenantId,
          mime_type: 'video/mp4',
          current_version_id: 1,
          storage_path: nonExistent,
        },
      ]);
      const resMissing = await createAssetVideoThumbnail(testTenantId, testAssetId, 1, {
        thumbnail_type: 'STATIC_POSTER',
        timestamp_offset_seconds: 0,
        duration_seconds: 3,
        width: 640,
        height: 360,
        fps: 10,
      });
      expect(resMissing.success).toBe(false);
      if (!resMissing.success) {
        expect(resMissing.statusCode).toBe(404);
        expect(resMissing.message).toContain('no se encuentra en el almacenamiento');
      }

      // Fallback query returns empty
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: testAssetId,
          tenant_id: testTenantId,
          mime_type: 'video/mp4',
          current_version_id: null,
          storage_path: null,
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([]); // empty fallback

      const resEmptyFb = await createAssetVideoThumbnail(testTenantId, testAssetId, 1, {
        thumbnail_type: 'STATIC_POSTER',
        timestamp_offset_seconds: 0,
        duration_seconds: 3,
        width: 640,
        height: 360,
        fps: 10,
      });
      expect(resEmptyFb.success).toBe(false);
      if (!resEmptyFb.success) {
        expect(resEmptyFb.statusCode).toBe(404);
      }
    });

    it('createAssetVideoThumbnail debe limpiar archivo previo, crear registro y despachar webhook', async () => {
      const oldThumbPath = path.join(tempDir, 'old_thumb.webp');
      fs.writeFileSync(oldThumbPath, 'OLD_THUMB_BYTES');

      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: testAssetId,
          tenant_id: testTenantId,
          mime_type: 'video/mp4',
          current_version_id: testVersionId,
          storage_path: testVideoPath,
        },
      ]);

      vi.mocked(db.query).mockResolvedValueOnce([{ id: 12, output_derivative_path: oldThumbPath }]);

      vi.mocked(db.query).mockResolvedValueOnce({ insertId: 55 });

      const result = await createAssetVideoThumbnail(testTenantId, testAssetId, testVersionId, {
        thumbnail_type: 'STATIC_POSTER',
        timestamp_offset_seconds: 1.0,
        duration_seconds: 3,
        width: 640,
        height: 360,
        fps: 10,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.statusCode).toBe(201);
        expect(result.thumbnail.id).toBe(55);
        expect(fs.existsSync(oldThumbPath)).toBe(false);
        expect(fs.existsSync(result.thumbnail.output_derivative_path)).toBe(true);
      }

      expect(dispatchWebhookEvent).toHaveBeenCalledWith(
        testTenantId,
        'asset.updated',
        expect.objectContaining({
          event_type: 'VIDEO_THUMBNAIL_GENERATED',
          thumbnail_id: 55,
          thumbnail_type: 'STATIC_POSTER',
        }),
      );
    });

    it('createAssetVideoThumbnail debe soportar fallback storage_path y capturar error de rmSync', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: testAssetId,
          tenant_id: testTenantId,
          mime_type: 'video/mp4',
          current_version_id: null,
          storage_path: null,
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([{ storage_path: testVideoPath }]);

      const oldPath = path.join(tempDir, 'old_throw.webp');
      fs.writeFileSync(oldPath, 'BYTES');

      vi.mocked(db.query).mockResolvedValueOnce([{ id: 13, output_derivative_path: oldPath }]);
      vi.mocked(db.query).mockResolvedValueOnce({ insertId: 56 });

      const rmSpy = vi.spyOn(fs, 'rmSync').mockImplementationOnce(() => {
        throw new Error('rmSync error');
      });

      const res = await createAssetVideoThumbnail(testTenantId, testAssetId, 1, {
        thumbnail_type: 'STATIC_POSTER',
        timestamp_offset_seconds: 0,
        duration_seconds: 3,
        width: 640,
        height: 360,
        fps: 10,
      });

      expect(res.success).toBe(true);
      rmSpy.mockRestore();
    });

    it('createAssetVideoThumbnail debe capturar excepciones en la ejecución', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: testAssetId,
          tenant_id: testTenantId,
          mime_type: 'video/mp4',
          current_version_id: 1,
          storage_path: testVideoPath,
        },
      ]);

      const res = await createAssetVideoThumbnail(testTenantId, testAssetId, 1, {
        thumbnail_type: 'STATIC_POSTER',
        timestamp_offset_seconds: 0,
        duration_seconds: 3,
        width: 10000,
        height: 10000,
        fps: 10,
      });

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.statusCode).toBe(400);
        expect(res.message).toContain('exceden el límite máximo');
      }
    });

    it('listAssetVideoThumbnails debe retornar lista paginada y filtrada', async () => {
      // 1. Filtered by type
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          thumbnail_type: 'STATIC_POSTER',
          timestamp_offset_seconds: '0.00',
          duration_seconds: '3.00',
          width: 640,
          height: 360,
          fps: 10,
          output_derivative_path: path.join(tempDir, 'thumb.webp'),
          thumbnail_metadata: JSON.stringify({ thumbnail_type: 'STATIC_POSTER' }),
          created_at: '2026-08-28T00:00:00Z',
        },
      ]);

      const filteredList = await listAssetVideoThumbnails(
        testTenantId,
        testAssetId,
        10,
        0,
        'STATIC_POSTER',
      );
      expect(filteredList).toHaveLength(1);
      expect(filteredList[0].thumbnail_type).toBe('STATIC_POSTER');

      // 2. Default without filter (object metadata)
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 2,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          thumbnail_type: 'ANIMATED_GIF',
          timestamp_offset_seconds: 2.0,
          duration_seconds: 4.0,
          width: 320,
          height: 180,
          fps: 12,
          output_derivative_path: path.join(tempDir, 'thumb.gif'),
          thumbnail_metadata: { thumbnail_type: 'ANIMATED_GIF' },
          created_at: '2026-08-28T00:00:00Z',
        },
      ]);

      const defaultList = await listAssetVideoThumbnails(testTenantId, testAssetId);
      expect(defaultList).toHaveLength(1);
      expect(defaultList[0].thumbnail_type).toBe('ANIMATED_GIF');
    });

    it('getAssetVideoThumbnailById debe retornar detalle o null', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          thumbnail_type: 'STATIC_POSTER',
          timestamp_offset_seconds: 0,
          duration_seconds: 3,
          width: 640,
          height: 360,
          fps: 10,
          output_derivative_path: path.join(tempDir, 'thumb.webp'),
          thumbnail_metadata: JSON.stringify({ thumbnail_type: 'STATIC_POSTER' }),
          created_at: '2026-08-28T00:00:00Z',
        },
      ]);

      const thumb = await getAssetVideoThumbnailById(testTenantId, testAssetId, 1);
      expect(thumb).not.toBeNull();
      expect(thumb?.id).toBe(1);

      // Parsed object metadata
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 2,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          thumbnail_type: 'ANIMATED_WEBP',
          timestamp_offset_seconds: 0,
          duration_seconds: 3,
          width: 320,
          height: 180,
          fps: 15,
          output_derivative_path: path.join(tempDir, 'thumb.webp'),
          thumbnail_metadata: {},
          created_at: '2026-08-28T00:00:00Z',
        },
      ]);
      const thumbObj = await getAssetVideoThumbnailById(testTenantId, testAssetId, 2);
      expect(thumbObj?.thumbnail_type).toBe('ANIMATED_WEBP');

      // Not found
      vi.mocked(db.query).mockResolvedValueOnce([]);
      const notFound = await getAssetVideoThumbnailById(testTenantId, testAssetId, 999);
      expect(notFound).toBeNull();
    });

    it('deleteAssetVideoThumbnail debe eliminar archivo y sprite VTT, borrar BD y despachar webhook', async () => {
      const vttPath = path.join(tempDir, 'test.vtt');
      const spritePath = path.join(tempDir, 'sprite.webp');
      fs.writeFileSync(vttPath, 'WEBVTT');
      fs.writeFileSync(spritePath, 'SPRITE_BYTES');

      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 20,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          thumbnail_type: 'HOVER_SCRUBBER_VTT',
          timestamp_offset_seconds: 0,
          duration_seconds: 3,
          width: 160,
          height: 90,
          fps: 10,
          output_derivative_path: vttPath,
          thumbnail_metadata: { sprite_filename: 'sprite.webp' },
          created_at: '2026-08-28T00:00:00Z',
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 });

      const deleted = await deleteAssetVideoThumbnail(testTenantId, testAssetId, 20);
      expect(deleted).toBe(true);
      expect(fs.existsSync(vttPath)).toBe(false);
      expect(fs.existsSync(spritePath)).toBe(false);

      expect(dispatchWebhookEvent).toHaveBeenCalledWith(
        testTenantId,
        'asset.updated',
        expect.objectContaining({
          event_type: 'VIDEO_THUMBNAIL_DELETED',
          thumbnail_id: 20,
        }),
      );

      // Normal single file delete
      const singlePath = path.join(tempDir, 'single.webp');
      fs.writeFileSync(singlePath, 'SINGLE_BYTES');

      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 21,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          thumbnail_type: 'STATIC_POSTER',
          timestamp_offset_seconds: 0,
          duration_seconds: 3,
          width: 640,
          height: 360,
          fps: 10,
          output_derivative_path: singlePath,
          thumbnail_metadata: {},
          created_at: '2026-08-28T00:00:00Z',
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 });
      const delSingle = await deleteAssetVideoThumbnail(testTenantId, testAssetId, 21);
      expect(delSingle).toBe(true);
      expect(fs.existsSync(singlePath)).toBe(false);

      // Empty output_derivative_path branch
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 22,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          thumbnail_type: 'STATIC_POSTER',
          timestamp_offset_seconds: 0,
          duration_seconds: 3,
          width: 640,
          height: 360,
          fps: 10,
          output_derivative_path: '',
          thumbnail_metadata: {},
          created_at: '2026-08-28T00:00:00Z',
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 });
      const delEmptyPath = await deleteAssetVideoThumbnail(testTenantId, testAssetId, 22);
      expect(delEmptyPath).toBe(true);

      // Not found
      vi.mocked(db.query).mockResolvedValueOnce([]);
      const delNotFound = await deleteAssetVideoThumbnail(testTenantId, testAssetId, 999);
      expect(delNotFound).toBe(false);
    });
  });

  describe('5. Endpoints REST Integration Tests (assets.ts)', () => {
    describe('POST /api/v1/assets/:id/video-thumbnail', () => {
      it('debe retornar 400 si el ID de activo es inválido', async () => {
        const res = await request(app)
          .post('/api/v1/assets/0/video-thumbnail')
          .set('X-Forwarded-For', nextIp())
          .send({});
        expect(res.status).toBe(400);
      });

      it('debe retornar 400 si el cuerpo tiene campos inválidos', async () => {
        const res = await request(app)
          .post('/api/v1/assets/80/video-thumbnail')
          .set('X-Forwarded-For', nextIp())
          .send({ thumbnail_type: 'INVALID' });
        expect(res.status).toBe(400);
      });

      it('debe retornar 404 si el activo no existe', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([]);
        const res = await request(app)
          .post('/api/v1/assets/80/video-thumbnail')
          .set('X-Forwarded-For', nextIp())
          .send({});
        expect(res.status).toBe(404);
      });

      it('debe retornar 403 si ACL deniega EDIT', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([
          { id: testAssetId, current_version_id: 1, mime_type: 'video/mp4' },
        ]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: false });

        const res = await request(app)
          .post('/api/v1/assets/80/video-thumbnail')
          .set('X-Forwarded-For', nextIp())
          .send({});
        expect(res.status).toBe(403);
      });

      it('debe retornar 400 o 404 si createAssetVideoThumbnail falla', async () => {
        // 400 branch
        vi.mocked(db.query).mockResolvedValueOnce([
          { id: testAssetId, current_version_id: 1, mime_type: 'image/png' },
        ]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([
          {
            id: testAssetId,
            tenant_id: testTenantId,
            mime_type: 'image/png',
            current_version_id: 1,
          },
        ]);

        const res400 = await request(app)
          .post('/api/v1/assets/80/video-thumbnail')
          .set('X-Forwarded-For', nextIp())
          .send({});
        expect(res400.status).toBe(400);
        expect(res400.body.error).toBe('Bad Request');

        // 404 branch
        vi.mocked(db.query).mockResolvedValueOnce([
          { id: testAssetId, current_version_id: 1, mime_type: 'video/mp4' },
        ]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([]); // not found in engine

        const res404 = await request(app)
          .post('/api/v1/assets/80/video-thumbnail')
          .set('X-Forwarded-For', nextIp())
          .send({});
        expect(res404.status).toBe(404);
        expect(res404.body.error).toBe('Not Found');
      });

      it('debe retornar 201 Created y data en caso exitoso', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([
          { id: testAssetId, current_version_id: null, mime_type: 'video/mp4' },
        ]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });

        // createAssetVideoThumbnail queries
        vi.mocked(db.query).mockResolvedValueOnce([
          {
            id: testAssetId,
            tenant_id: testTenantId,
            mime_type: 'video/mp4',
            current_version_id: 1,
            storage_path: testVideoPath,
          },
        ]);
        vi.mocked(db.query).mockResolvedValueOnce([]); // no existing
        vi.mocked(db.query).mockResolvedValueOnce({ insertId: 88 }); // insert

        const res = await request(app)
          .post('/api/v1/assets/80/video-thumbnail')
          .set('X-Forwarded-For', nextIp())
          .send({
            thumbnail_type: 'STATIC_POSTER',
            timestamp_offset_seconds: 0,
            duration_seconds: 3,
            width: 640,
            height: 360,
            fps: 10,
          });

        expect(res.status).toBe(201);
        expect(res.body.data.id).toBe(88);
        expect(res.body.data.thumbnail_type).toBe('STATIC_POSTER');
      });

      it('debe manejar excepciones inesperadas con status 500', async () => {
        vi.mocked(db.query).mockRejectedValueOnce(new Error('Unexpected DB Error'));
        const res = await request(app)
          .post('/api/v1/assets/80/video-thumbnail')
          .set('X-Forwarded-For', nextIp())
          .send({});
        expect(res.status).toBe(500);
        expect(res.body.error).toBe('Internal Server Error');
      });
    });

    describe('GET /api/v1/assets/:id/video-thumbnails', () => {
      it('debe retornar 400 si el ID es inválido', async () => {
        const res = await request(app)
          .get('/api/v1/assets/0/video-thumbnails')
          .set('X-Forwarded-For', nextIp());
        expect(res.status).toBe(400);
      });

      it('debe retornar 404 si el activo no existe', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([]);
        const res = await request(app)
          .get('/api/v1/assets/80/video-thumbnails')
          .set('X-Forwarded-For', nextIp());
        expect(res.status).toBe(404);
      });

      it('debe retornar 403 si ACL VIEW es denegado', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([{ id: testAssetId }]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: false });
        const res = await request(app)
          .get('/api/v1/assets/80/video-thumbnails')
          .set('X-Forwarded-For', nextIp());
        expect(res.status).toBe(403);
      });

      it('debe retornar 200 OK con la lista de miniaturas (con y sin query params)', async () => {
        // With query params
        vi.mocked(db.query).mockResolvedValueOnce([{ id: testAssetId }]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([]);

        const resWithQuery = await request(app)
          .get('/api/v1/assets/80/video-thumbnails?thumbnail_type=STATIC_POSTER&limit=10&offset=5')
          .set('X-Forwarded-For', nextIp());
        expect(resWithQuery.status).toBe(200);
        expect(resWithQuery.body.data).toEqual([]);

        // Without query params (defaults)
        vi.mocked(db.query).mockResolvedValueOnce([{ id: testAssetId }]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([]);

        const resWithoutQuery = await request(app)
          .get('/api/v1/assets/80/video-thumbnails')
          .set('X-Forwarded-For', nextIp());
        expect(resWithoutQuery.status).toBe(200);
        expect(resWithoutQuery.body.data).toEqual([]);
      });

      it('debe manejar excepciones inesperadas con status 500', async () => {
        vi.mocked(db.query).mockRejectedValueOnce(new Error('Unexpected Error'));
        const res = await request(app)
          .get('/api/v1/assets/80/video-thumbnails')
          .set('X-Forwarded-For', nextIp());
        expect(res.status).toBe(500);
        expect(res.body.error).toBe('Internal Server Error');
      });
    });

    describe('GET /api/v1/assets/:id/video-thumbnails/:thumbnailId', () => {
      it('debe retornar 400 si los IDs son inválidos', async () => {
        const res1 = await request(app)
          .get('/api/v1/assets/0/video-thumbnails/1')
          .set('X-Forwarded-For', nextIp());
        expect(res1.status).toBe(400);

        const res2 = await request(app)
          .get('/api/v1/assets/80/video-thumbnails/0')
          .set('X-Forwarded-For', nextIp());
        expect(res2.status).toBe(400);
      });

      it('debe retornar 403 si ACL VIEW es denegado', async () => {
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: false });
        const res = await request(app)
          .get('/api/v1/assets/80/video-thumbnails/1')
          .set('X-Forwarded-For', nextIp());
        expect(res.status).toBe(403);
      });

      it('debe retornar 404 si la miniatura no existe', async () => {
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([]);
        const res = await request(app)
          .get('/api/v1/assets/80/video-thumbnails/999')
          .set('X-Forwarded-For', nextIp());
        expect(res.status).toBe(404);
      });

      it('debe retornar 200 OK con el detalle de la miniatura', async () => {
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([
          {
            id: 1,
            tenant_id: testTenantId,
            asset_id: testAssetId,
            version_id: 1,
            thumbnail_type: 'STATIC_POSTER',
            timestamp_offset_seconds: 0,
            duration_seconds: 3,
            width: 640,
            height: 360,
            fps: 10,
            output_derivative_path: path.join(tempDir, 'thumb.webp'),
            thumbnail_metadata: {},
            created_at: '2026-08-28T00:00:00Z',
          },
        ]);
        const res = await request(app)
          .get('/api/v1/assets/80/video-thumbnails/1')
          .set('X-Forwarded-For', nextIp());
        expect(res.status).toBe(200);
        expect(res.body.data.id).toBe(1);
      });

      it('debe manejar excepciones inesperadas con status 500', async () => {
        vi.mocked(evaluateAclPermission).mockRejectedValueOnce(
          new Error('Unexpected Detail Error'),
        );
        const res = await request(app)
          .get('/api/v1/assets/80/video-thumbnails/1')
          .set('X-Forwarded-For', nextIp());
        expect(res.status).toBe(500);
        expect(res.body.error).toBe('Internal Server Error');
      });
    });

    describe('DELETE /api/v1/assets/:id/video-thumbnails/:thumbnailId', () => {
      it('debe retornar 400 si los IDs son inválidos', async () => {
        const res1 = await request(app)
          .delete('/api/v1/assets/0/video-thumbnails/1')
          .set('X-Forwarded-For', nextIp());
        expect(res1.status).toBe(400);

        const res2 = await request(app)
          .delete('/api/v1/assets/80/video-thumbnails/0')
          .set('X-Forwarded-For', nextIp());
        expect(res2.status).toBe(400);
      });

      it('debe retornar 403 si ACL EDIT es denegado', async () => {
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: false });
        const res = await request(app)
          .delete('/api/v1/assets/80/video-thumbnails/1')
          .set('X-Forwarded-For', nextIp());
        expect(res.status).toBe(403);
      });

      it('debe retornar 404 si la miniatura no existe', async () => {
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([]);
        const res = await request(app)
          .delete('/api/v1/assets/80/video-thumbnails/999')
          .set('X-Forwarded-For', nextIp());
        expect(res.status).toBe(404);
      });

      it('debe retornar 200 OK y registrar evento de seguridad en caso exitoso', async () => {
        const thumbPath = path.join(tempDir, 'del_thumb.webp');
        fs.writeFileSync(thumbPath, 'BYTES');

        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([
          {
            id: 1,
            tenant_id: testTenantId,
            asset_id: testAssetId,
            version_id: 1,
            thumbnail_type: 'STATIC_POSTER',
            timestamp_offset_seconds: 0,
            duration_seconds: 3,
            width: 640,
            height: 360,
            fps: 10,
            output_derivative_path: thumbPath,
            thumbnail_metadata: {},
            created_at: '2026-08-28T00:00:00Z',
          },
        ]);
        vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 });

        const res = await request(app)
          .delete('/api/v1/assets/80/video-thumbnails/1')
          .set('X-Forwarded-For', nextIp());
        expect(res.status).toBe(200);
        expect(res.body.message).toContain('eliminada exitosamente');
      });

      it('debe manejar excepciones inesperadas con status 500', async () => {
        vi.mocked(evaluateAclPermission).mockRejectedValueOnce(
          new Error('Unexpected Delete Error'),
        );
        const res = await request(app)
          .delete('/api/v1/assets/80/video-thumbnails/1')
          .set('X-Forwarded-For', nextIp());
        expect(res.status).toBe(500);
        expect(res.body.error).toBe('Internal Server Error');
      });
    });
  });

  describe('6. Rate Limiting Tests (videoThumbnailRateLimiter)', () => {
    it('videoThumbnailRateLimiter debe estar definido y configurado', () => {
      expect(videoThumbnailRateLimiter).toBeDefined();
    });

    it('videoThumbnailRateLimiter debe responder con 429 cuando se excede el límite de 30 solicitudes', async () => {
      const rateLimitApp = express();
      rateLimitApp.set('trust proxy', true);
      rateLimitApp.use(videoThumbnailRateLimiter);
      rateLimitApp.get('/test-thumb-limit', (_req, res) => {
        res.status(200).json({ ok: true });
      });

      const isolatedIp = '198.51.100.222';

      // 30 requests allowed
      for (let i = 0; i < 30; i++) {
        const res = await request(rateLimitApp)
          .get('/test-thumb-limit')
          .set('X-Forwarded-For', isolatedIp);
        expect(res.status).toBe(200);
      }

      // 31st request rejected with 429
      const res429 = await request(rateLimitApp)
        .get('/test-thumb-limit')
        .set('X-Forwarded-For', isolatedIp);
      expect(res429.status).toBe(429);
      expect(res429.body.error).toBe('Too Many Requests');
      expect(res429.body.message).toContain('Límite de operaciones de generación de miniaturas');
    });
  });
});
