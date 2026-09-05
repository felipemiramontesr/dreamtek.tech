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
  VideoTranscodingProfileEnum,
  VideoTranscodingStatusEnum,
  createVideoTranscodingBodySchema,
  listVideoTranscodingsQuerySchema,
  videoTranscodingParamSchema,
  streamFileParamSchema,
} from '../../../server/src/schemas/videoTranscoding.schema';
import {
  isVideo,
  probeVideoFile,
  generateHlsMasterPlaylistContent,
  generateHlsVariantPlaylistContent,
  executeVideoTranscoding,
  createAssetVideoTranscoding,
  listAssetVideoTranscodings,
  getAssetVideoTranscodingById,
  deleteAssetVideoTranscoding,
  getTranscodingStreamFilePath,
  ALLOWED_VIDEO_MIMES,
  PROFILE_RENDITIONS_MAP,
  ExecFileFunction,
} from '../../../server/src/utils/videoTranscodingEngine';
import { videoTranscodingRateLimiter } from '../../../server/src/middleware/rateLimiter';

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

describe('FC 032 — DAM AI Video Transcoding & Adaptive Bitrate Streaming Suite (100% 4x100)', () => {
  const testTenantId = 100;
  const testAssetId = 70;
  const testVersionId = 1;
  const tempDir = path.join(STORAGE_ROOT, 'derivatives', `tenant_${testTenantId}`);
  const testVideoPath = path.join(tempDir, 'test_video_base.mp4');

  let app: Express;
  let reqCount = 0;

  const nextIp = () => {
    reqCount++;
    return `10.50.${Math.floor(reqCount / 200)}.${(reqCount % 200) + 1}`;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.query).mockReset();
    vi.mocked(evaluateAclPermission).mockReset();
    fs.mkdirSync(tempDir, { recursive: true });
    fs.writeFileSync(testVideoPath, Buffer.from('FAKE_MP4_RAW_BYTES_FOR_PROBE'));

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

  describe('1. Zod Schemas Validation (videoTranscoding.schema.ts)', () => {
    it('VideoTranscodingProfileEnum y VideoTranscodingStatusEnum deben validar perfiles y estados', () => {
      expect(VideoTranscodingProfileEnum.safeParse('HLS_MULTI_BITRATE').success).toBe(true);
      expect(VideoTranscodingProfileEnum.safeParse('HLS_1080P').success).toBe(true);
      expect(VideoTranscodingProfileEnum.safeParse('HLS_720P').success).toBe(true);
      expect(VideoTranscodingProfileEnum.safeParse('HLS_480P').success).toBe(true);
      expect(VideoTranscodingProfileEnum.safeParse('HLS_360P').success).toBe(true);
      expect(VideoTranscodingProfileEnum.safeParse('MP4_OPTIMIZED_WEB').success).toBe(true);
      expect(VideoTranscodingProfileEnum.safeParse('INVALID_PROFILE').success).toBe(false);

      expect(VideoTranscodingStatusEnum.safeParse('PENDING').success).toBe(true);
      expect(VideoTranscodingStatusEnum.safeParse('PROCESSING').success).toBe(true);
      expect(VideoTranscodingStatusEnum.safeParse('COMPLETED').success).toBe(true);
      expect(VideoTranscodingStatusEnum.safeParse('FAILED').success).toBe(true);
      expect(VideoTranscodingStatusEnum.safeParse('INVALID_STATUS').success).toBe(false);
    });

    it('createVideoTranscodingBodySchema debe validar cuerpo correcto y valores por defecto', () => {
      const parsedDefault = createVideoTranscodingBodySchema.safeParse({});
      expect(parsedDefault.success).toBe(true);
      if (parsedDefault.success) {
        expect(parsedDefault.data.profile).toBe('HLS_MULTI_BITRATE');
        expect(parsedDefault.data.segment_duration).toBe(4);
      }

      const parsedCustom = createVideoTranscodingBodySchema.safeParse({
        profile: 'HLS_720P',
        segment_duration: 6,
      });
      expect(parsedCustom.success).toBe(true);

      // Bounds validation
      expect(createVideoTranscodingBodySchema.safeParse({ segment_duration: 1 }).success).toBe(
        false,
      );
      expect(createVideoTranscodingBodySchema.safeParse({ segment_duration: 15 }).success).toBe(
        false,
      );
    });

    it('listVideoTranscodingsQuerySchema, videoTranscodingParamSchema y streamFileParamSchema deben validar parámetros', () => {
      const parsedQuery = listVideoTranscodingsQuerySchema.safeParse({
        limit: '20',
        offset: '5',
        profile: 'HLS_1080P',
        status: 'COMPLETED',
      });
      expect(parsedQuery.success).toBe(true);
      if (parsedQuery.success) {
        expect(parsedQuery.data.limit).toBe(20);
        expect(parsedQuery.data.profile).toBe('HLS_1080P');
      }

      expect(listVideoTranscodingsQuerySchema.safeParse({ limit: '200' }).success).toBe(false);
      expect(listVideoTranscodingsQuerySchema.safeParse({ offset: '-1' }).success).toBe(false);

      expect(videoTranscodingParamSchema.safeParse({ id: '10', transcodeId: '5' }).success).toBe(
        true,
      );
      expect(videoTranscodingParamSchema.safeParse({ id: '0', transcodeId: '5' }).success).toBe(
        false,
      );
      expect(videoTranscodingParamSchema.safeParse({ id: '10', transcodeId: '0' }).success).toBe(
        false,
      );

      expect(
        streamFileParamSchema.safeParse({ id: '10', transcodeId: '5', filename: 'master.m3u8' })
          .success,
      ).toBe(true);
      expect(
        streamFileParamSchema.safeParse({ id: '10', transcodeId: '5', filename: '' }).success,
      ).toBe(false);
    });
  });

  describe('2. Helper Functions & Playlist Generation (videoTranscodingEngine.ts)', () => {
    it('isVideo debe validar tipos de video y rechazar no compatibles', () => {
      ALLOWED_VIDEO_MIMES.forEach((mime) => {
        expect(isVideo(mime)).toBe(true);
      });
      expect(isVideo('video/custom-codec')).toBe(true);
      expect(isVideo('image/png')).toBe(false);
      expect(isVideo('application/pdf')).toBe(false);
      expect(isVideo(null)).toBe(false);
      expect(isVideo(undefined)).toBe(false);
    });

    it('generateHlsMasterPlaylistContent debe generar encabezados y streams de calidad HLS', () => {
      const renditions = PROFILE_RENDITIONS_MAP.HLS_MULTI_BITRATE;
      const masterContent = generateHlsMasterPlaylistContent(renditions);

      expect(masterContent).toContain('#EXTM3U');
      expect(masterContent).toContain('#EXT-X-VERSION:3');
      expect(masterContent).toContain('RESOLUTION=1920x1080');
      expect(masterContent).toContain('variant_1080p.m3u8');
      expect(masterContent).toContain('RESOLUTION=1280x720');
      expect(masterContent).toContain('variant_720p.m3u8');
    });

    it('generateHlsVariantPlaylistContent debe generar segmentos e información de duración', () => {
      const variantContent = generateHlsVariantPlaylistContent(10, 4, 'variant_720p');

      expect(variantContent).toContain('#EXTM3U');
      expect(variantContent).toContain('#EXT-X-TARGETDURATION:4');
      expect(variantContent).toContain('variant_720p_0.ts');
      expect(variantContent).toContain('variant_720p_1.ts');
      expect(variantContent).toContain('variant_720p_2.ts');
      expect(variantContent).toContain('#EXT-X-ENDLIST');
    });

    it('probeVideoFile debe ejecutar ffprobe o retornar fallback en entorno de prueba', async () => {
      // 1. Successful probe with mock execFn stdout
      const mockSuccessExec: ExecFileFunction = ((_cmd, _args, _opts, cb) => {
        cb(
          null,
          JSON.stringify({
            format: { duration: '120.5', bit_rate: '3500000' },
            streams: [{ width: 1920, height: 1080 }],
          }),
          '',
        );
      }) as any;

      const probeSuccess = await probeVideoFile(testVideoPath, mockSuccessExec);
      expect(probeSuccess.duration).toBe(121);
      expect(probeSuccess.width).toBe(1920);
      expect(probeSuccess.bitrate).toBe(3500000);

      // 2. ffprobe error / fallback branch
      const mockFailExec: ExecFileFunction = ((_cmd, _args, _opts, cb) => {
        cb(new Error('ffprobe not found'), '', '');
      }) as any;
      const probeFallback = await probeVideoFile(testVideoPath, mockFailExec);
      expect(probeFallback.duration).toBe(60);
      expect(probeFallback.width).toBe(1920);

      // 3. ffprobe JSON parse error fallback
      const mockJsonFailExec: ExecFileFunction = ((_cmd, _args, _opts, cb) => {
        cb(null, 'INVALID_JSON_STDOUT', '');
      }) as any;
      const probeJsonFail = await probeVideoFile(testVideoPath, mockJsonFailExec);
      expect(probeJsonFail.duration).toBe(60);

      // 4. Non-existent file throws
      const ghostVideo = path.join(tempDir, 'ghost_video.mp4');
      await expect(probeVideoFile(ghostVideo)).rejects.toThrow('El archivo de video no existe');
    });
  });

  describe('3. Transcoding Pipeline Execution (executeVideoTranscoding)', () => {
    it('executeVideoTranscoding debe generar listas de reproducción HLS y chunks .ts para HLS_MULTI_BITRATE', async () => {
      const result = await executeVideoTranscoding(
        testTenantId,
        testAssetId,
        testVersionId,
        'HLS_MULTI_BITRATE',
        4,
        testVideoPath,
      );

      expect(fs.existsSync(result.masterPlaylistPath)).toBe(true);
      expect(result.renditions).toHaveLength(4);
      expect(result.metadata.output_files_count).toBeGreaterThan(5);

      const masterContent = fs.readFileSync(result.masterPlaylistPath, 'utf-8');
      expect(masterContent).toContain('#EXTM3U');
    });

    it('executeVideoTranscoding debe soportar perfil MP4_OPTIMIZED_WEB', async () => {
      const result = await executeVideoTranscoding(
        testTenantId,
        testAssetId,
        testVersionId,
        'MP4_OPTIMIZED_WEB',
        4,
        testVideoPath,
      );

      expect(fs.existsSync(result.masterPlaylistPath)).toBe(true);
      expect(result.masterPlaylistPath).toContain('web_optimized.mp4');
      expect(result.metadata.profile).toBe('MP4_OPTIMIZED_WEB');
    });

    it('executeVideoTranscoding debe soportar perfiles individuales HLS_1080P, HLS_720P, HLS_480P, HLS_360P', async () => {
      const profiles: VideoTranscodingProfileEnum[] = [
        'HLS_1080P',
        'HLS_720P',
        'HLS_480P',
        'HLS_360P',
      ] as any[];

      for (const prof of profiles) {
        const res = await executeVideoTranscoding(
          testTenantId,
          testAssetId,
          testVersionId,
          prof as any,
          4,
          testVideoPath,
        );
        expect(fs.existsSync(res.masterPlaylistPath)).toBe(true);
      }
    });

    it('executeVideoTranscoding debe fallar si archivo no existe o duración excede MAX_VIDEO_DURATION_SECONDS', async () => {
      const ghostVideo = path.join(tempDir, 'ghost.mp4');
      await expect(
        executeVideoTranscoding(
          testTenantId,
          testAssetId,
          testVersionId,
          'HLS_720P',
          4,
          ghostVideo,
        ),
      ).rejects.toThrow('El archivo de video no existe');

      // Probe duration > 7200s
      const mockOverDurationExec: ExecFileFunction = ((_cmd, _args, _opts, cb) => {
        cb(
          null,
          JSON.stringify({
            format: { duration: '9000', bit_rate: '4500000' },
            streams: [{ width: 1920, height: 1080 }],
          }),
          '',
        );
      }) as any;

      await expect(
        executeVideoTranscoding(
          testTenantId,
          testAssetId,
          testVersionId,
          'HLS_720P',
          4,
          testVideoPath,
          mockOverDurationExec,
        ),
      ).rejects.toThrow('excede el límite máximo');
    });
  });

  describe('4. Engine Service Functions (videoTranscodingEngine.ts)', () => {
    it('createAssetVideoTranscoding debe retornar 404 si el activo no existe', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const result = await createAssetVideoTranscoding(testTenantId, testAssetId, 1, {
        profile: 'HLS_720P',
        segment_duration: 4,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.statusCode).toBe(404);
        expect(result.message).toContain('no encontrado');
      }
    });

    it('createAssetVideoTranscoding debe retornar 400 si el MIME no es video o es nulo', async () => {
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
      const resNonVideo = await createAssetVideoTranscoding(testTenantId, testAssetId, 1, {
        profile: 'HLS_720P',
        segment_duration: 4,
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
      const resNull = await createAssetVideoTranscoding(testTenantId, testAssetId, 1, {
        profile: 'HLS_720P',
        segment_duration: 4,
      });
      expect(resNull.success).toBe(false);
      if (!resNull.success) {
        expect(resNull.statusCode).toBe(400);
        expect(resNull.message).toContain('desconocido');
      }
    });

    it('createAssetVideoTranscoding debe retornar 404 si el archivo físico no existe o fallback falla', async () => {
      const nonExistent = path.join(tempDir, 'non_existent_video.mp4');
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: testAssetId,
          tenant_id: testTenantId,
          mime_type: 'video/mp4',
          current_version_id: 1,
          storage_path: nonExistent,
        },
      ]);
      const resMissing = await createAssetVideoTranscoding(testTenantId, testAssetId, 1, {
        profile: 'HLS_720P',
        segment_duration: 4,
      });
      expect(resMissing.success).toBe(false);
      if (!resMissing.success) {
        expect(resMissing.statusCode).toBe(404);
        expect(resMissing.message).toContain('no se encuentra en el almacenamiento');
      }

      // Fallback version query returns empty
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

      const resEmptyFb = await createAssetVideoTranscoding(testTenantId, testAssetId, 1, {
        profile: 'HLS_720P',
        segment_duration: 4,
      });
      expect(resEmptyFb.success).toBe(false);
      if (!resEmptyFb.success) {
        expect(resEmptyFb.statusCode).toBe(404);
      }
    });

    it('createAssetVideoTranscoding debe limpiar directorio previo, crear transcodificación y despachar webhook', async () => {
      const oldHlsDir = path.join(tempDir, 'old_hls_job');
      fs.mkdirSync(oldHlsDir, { recursive: true });
      const oldMasterPath = path.join(oldHlsDir, 'master.m3u8');
      fs.writeFileSync(oldMasterPath, '#EXTM3U');

      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: testAssetId,
          tenant_id: testTenantId,
          mime_type: 'video/mp4',
          current_version_id: testVersionId,
          storage_path: testVideoPath,
        },
      ]);

      vi.mocked(db.query).mockResolvedValueOnce([{ id: 10, master_playlist_path: oldMasterPath }]);

      vi.mocked(db.query).mockResolvedValueOnce({ insertId: 77 });

      const result = await createAssetVideoTranscoding(testTenantId, testAssetId, testVersionId, {
        profile: 'HLS_MULTI_BITRATE',
        segment_duration: 4,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.statusCode).toBe(201);
        expect(result.transcoding.id).toBe(77);
        expect(result.transcoding.status).toBe('COMPLETED');
        expect(fs.existsSync(oldHlsDir)).toBe(false);
        expect(fs.existsSync(result.transcoding.master_playlist_path!)).toBe(true);
      }

      expect(dispatchWebhookEvent).toHaveBeenCalledWith(
        testTenantId,
        'asset.updated',
        expect.objectContaining({
          event_type: 'VIDEO_TRANSCODED',
          transcoding_id: 77,
          profile: 'HLS_MULTI_BITRATE',
        }),
      );
    });

    it('createAssetVideoTranscoding debe soportar fallback storage_path y manejar error rmSync', async () => {
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

      const oldDir = path.join(tempDir, 'old_dir_throw');
      fs.mkdirSync(oldDir, { recursive: true });
      const oldMaster = path.join(oldDir, 'master.m3u8');
      fs.writeFileSync(oldMaster, '#EXTM3U');

      vi.mocked(db.query).mockResolvedValueOnce([{ id: 11, master_playlist_path: oldMaster }]);
      vi.mocked(db.query).mockResolvedValueOnce({ insertId: 78 });

      const rmSpy = vi.spyOn(fs, 'rmSync').mockImplementationOnce(() => {
        throw new Error('rmSync error');
      });

      const res = await createAssetVideoTranscoding(testTenantId, testAssetId, 1, {
        profile: 'HLS_720P',
        segment_duration: 4,
      });

      expect(res.success).toBe(true);
      rmSpy.mockRestore();
    });

    it('createAssetVideoTranscoding debe capturar errores al ejecutar la transcodificación', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: testAssetId,
          tenant_id: testTenantId,
          mime_type: 'video/mp4',
          current_version_id: testVersionId,
          storage_path: testVideoPath,
        },
      ]);

      vi.mocked(db.query).mockResolvedValueOnce([]); // no existing

      const mockOverDurationExec: ExecFileFunction = ((_cmd, _args, _opts, cb) => {
        cb(
          null,
          JSON.stringify({
            format: { duration: '9000', bit_rate: '4500000' },
            streams: [{ width: 1920, height: 1080 }],
          }),
          '',
        );
      }) as any;

      const res = await createAssetVideoTranscoding(
        testTenantId,
        testAssetId,
        testVersionId,
        {
          profile: 'HLS_720P',
          segment_duration: 4,
        },
        mockOverDurationExec,
      );

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.statusCode).toBe(400);
        expect(res.message).toContain('excede el límite máximo');
      }
    });

    it('listAssetVideoTranscodings debe retornar lista paginada y filtrada', async () => {
      // 1. With profile and status filters
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          profile: 'HLS_MULTI_BITRATE',
          status: 'COMPLETED',
          master_playlist_path: path.join(tempDir, 'master.m3u8'),
          renditions: JSON.stringify(PROFILE_RENDITIONS_MAP.HLS_MULTI_BITRATE),
          transcoding_metadata: JSON.stringify({ profile: 'HLS_MULTI_BITRATE' }),
          duration_seconds: 60,
          bitrate_kbps: 5000,
          error_message: null,
          created_at: '2026-08-28T00:00:00Z',
        },
      ]);

      const itemsFiltered = await listAssetVideoTranscodings(
        testTenantId,
        testAssetId,
        10,
        0,
        'HLS_MULTI_BITRATE',
        'COMPLETED',
      );
      expect(itemsFiltered).toHaveLength(1);
      expect(itemsFiltered[0].profile).toBe('HLS_MULTI_BITRATE');

      // 2. With profile only
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 2,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          profile: 'HLS_720P',
          status: 'COMPLETED',
          master_playlist_path: path.join(tempDir, 'master.m3u8'),
          renditions: PROFILE_RENDITIONS_MAP.HLS_720P,
          transcoding_metadata: { profile: 'HLS_720P' },
          duration_seconds: 60,
          bitrate_kbps: 2800,
          error_message: null,
          created_at: '2026-08-28T00:05:00Z',
        },
      ]);
      const itemsProfileOnly = await listAssetVideoTranscodings(
        testTenantId,
        testAssetId,
        50,
        0,
        'HLS_720P',
      );
      expect(itemsProfileOnly).toHaveLength(1);

      // 3. With status only
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 3,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          profile: 'HLS_1080P',
          status: 'PENDING',
          master_playlist_path: null,
          renditions: [],
          transcoding_metadata: {},
          duration_seconds: 0,
          bitrate_kbps: 0,
          error_message: null,
          created_at: '2026-08-28T00:10:00Z',
        },
      ]);
      const itemsStatusOnly = await listAssetVideoTranscodings(
        testTenantId,
        testAssetId,
        50,
        0,
        undefined,
        'PENDING',
      );
      expect(itemsStatusOnly).toHaveLength(1);

      // 4. Default without filters
      vi.mocked(db.query).mockResolvedValueOnce([]);
      const itemsDefault = await listAssetVideoTranscodings(testTenantId, testAssetId);
      expect(itemsDefault).toHaveLength(0);
    });

    it('getAssetVideoTranscodingById debe retornar detalle o null', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          profile: 'HLS_MULTI_BITRATE',
          status: 'COMPLETED',
          master_playlist_path: path.join(tempDir, 'master.m3u8'),
          renditions: JSON.stringify(PROFILE_RENDITIONS_MAP.HLS_MULTI_BITRATE),
          transcoding_metadata: JSON.stringify({ profile: 'HLS_MULTI_BITRATE' }),
          duration_seconds: 60,
          bitrate_kbps: 5000,
          error_message: null,
          created_at: '2026-08-28T00:00:00Z',
        },
      ]);
      const item = await getAssetVideoTranscodingById(testTenantId, testAssetId, 1);
      expect(item).not.toBeNull();
      expect(item?.profile).toBe('HLS_MULTI_BITRATE');

      // Parsed object JSON
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 2,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          profile: 'HLS_720P',
          status: 'COMPLETED',
          master_playlist_path: null,
          renditions: [],
          transcoding_metadata: {},
          duration_seconds: 0,
          bitrate_kbps: 0,
          error_message: null,
          created_at: '2026-08-28T00:00:00Z',
        },
      ]);
      const itemObj = await getAssetVideoTranscodingById(testTenantId, testAssetId, 2);
      expect(itemObj?.profile).toBe('HLS_720P');

      // Not found
      vi.mocked(db.query).mockResolvedValueOnce([]);
      const notFound = await getAssetVideoTranscodingById(testTenantId, testAssetId, 999);
      expect(notFound).toBeNull();
    });

    it('deleteAssetVideoTranscoding debe eliminar directorio, BD y despachar webhook', async () => {
      const transcodeDir = path.join(tempDir, 'transcode_del_dir');
      fs.mkdirSync(transcodeDir, { recursive: true });
      const masterPath = path.join(transcodeDir, 'master.m3u8');
      fs.writeFileSync(masterPath, '#EXTM3U');

      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 30,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          profile: 'HLS_720P',
          status: 'COMPLETED',
          master_playlist_path: masterPath,
          renditions: [],
          transcoding_metadata: {},
          duration_seconds: 60,
          bitrate_kbps: 2800,
          error_message: null,
          created_at: '2026-08-28T00:00:00Z',
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 });

      const deleted = await deleteAssetVideoTranscoding(testTenantId, testAssetId, 30);
      expect(deleted).toBe(true);
      expect(fs.existsSync(transcodeDir)).toBe(false);

      expect(dispatchWebhookEvent).toHaveBeenCalledWith(
        testTenantId,
        'asset.updated',
        expect.objectContaining({
          event_type: 'VIDEO_TRANSCODING_DELETED',
          transcoding_id: 30,
        }),
      );

      // Null master_playlist_path
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 31,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          profile: 'HLS_720P',
          status: 'PENDING',
          master_playlist_path: null,
          renditions: [],
          transcoding_metadata: {},
          duration_seconds: 0,
          bitrate_kbps: 0,
          error_message: null,
          created_at: '2026-08-28T00:00:00Z',
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 });
      const delNullPath = await deleteAssetVideoTranscoding(testTenantId, testAssetId, 31);
      expect(delNullPath).toBe(true);

      // Not found
      vi.mocked(db.query).mockResolvedValueOnce([]);
      const delNotFound = await deleteAssetVideoTranscoding(testTenantId, testAssetId, 999);
      expect(delNotFound).toBe(false);
    });

    it('getTranscodingStreamFilePath debe resolver ruta física de manifiesto o segmento', async () => {
      const hlsDir = path.join(tempDir, 'stream_dir');
      fs.mkdirSync(hlsDir, { recursive: true });
      const masterPath = path.join(hlsDir, 'master.m3u8');
      fs.writeFileSync(masterPath, '#EXTM3U');

      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 40,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          profile: 'HLS_720P',
          status: 'COMPLETED',
          master_playlist_path: masterPath,
          renditions: [],
          transcoding_metadata: {},
          duration_seconds: 60,
          bitrate_kbps: 2800,
          error_message: null,
          created_at: '2026-08-28T00:00:00Z',
        },
      ]);

      const foundPath = await getTranscodingStreamFilePath(
        testTenantId,
        testAssetId,
        40,
        'master.m3u8',
      );
      expect(foundPath).toBe(masterPath);

      // Target file not found
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 40,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          profile: 'HLS_720P',
          status: 'COMPLETED',
          master_playlist_path: masterPath,
          renditions: [],
          transcoding_metadata: {},
          duration_seconds: 60,
          bitrate_kbps: 2800,
          error_message: null,
          created_at: '2026-08-28T00:00:00Z',
        },
      ]);
      const notFoundFile = await getTranscodingStreamFilePath(
        testTenantId,
        testAssetId,
        40,
        'missing.ts',
      );
      expect(notFoundFile).toBeNull();

      // Record not found
      vi.mocked(db.query).mockResolvedValueOnce([]);
      const notFoundRecord = await getTranscodingStreamFilePath(
        testTenantId,
        testAssetId,
        999,
        'master.m3u8',
      );
      expect(notFoundRecord).toBeNull();

      // Null master_playlist_path
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 41,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          profile: 'HLS_720P',
          status: 'PENDING',
          master_playlist_path: null,
          renditions: [],
          transcoding_metadata: {},
          duration_seconds: 0,
          bitrate_kbps: 0,
          error_message: null,
          created_at: '2026-08-28T00:00:00Z',
        },
      ]);
      const nullMaster = await getTranscodingStreamFilePath(
        testTenantId,
        testAssetId,
        41,
        'master.m3u8',
      );
      expect(nullMaster).toBeNull();
    });
  });

  describe('5. Endpoints REST Integration Tests (assets.ts)', () => {
    describe('POST /api/v1/assets/:id/transcode', () => {
      it('debe retornar 400 si el ID de activo es inválido', async () => {
        const res = await request(app)
          .post('/api/v1/assets/0/transcode')
          .set('X-Forwarded-For', nextIp())
          .send({ profile: 'HLS_MULTI_BITRATE' });
        expect(res.status).toBe(400);
      });

      it('debe retornar 400 si el cuerpo tiene campos inválidos', async () => {
        const res = await request(app)
          .post('/api/v1/assets/70/transcode')
          .set('X-Forwarded-For', nextIp())
          .send({ profile: 'INVALID' });
        expect(res.status).toBe(400);
      });

      it('debe retornar 404 si el activo no existe', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([]);
        const res = await request(app)
          .post('/api/v1/assets/70/transcode')
          .set('X-Forwarded-For', nextIp())
          .send({ profile: 'HLS_MULTI_BITRATE' });
        expect(res.status).toBe(404);
      });

      it('debe retornar 403 si ACL deniega EDIT', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([
          { id: testAssetId, current_version_id: 1, mime_type: 'video/mp4' },
        ]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: false });

        const res = await request(app)
          .post('/api/v1/assets/70/transcode')
          .set('X-Forwarded-For', nextIp())
          .send({ profile: 'HLS_MULTI_BITRATE' });
        expect(res.status).toBe(403);
      });

      it('debe retornar 400 o 404 si createAssetVideoTranscoding falla', async () => {
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
          .post('/api/v1/assets/70/transcode')
          .set('X-Forwarded-For', nextIp())
          .send({ profile: 'HLS_MULTI_BITRATE' });
        expect(res400.status).toBe(400);
        expect(res400.body.error).toBe('Bad Request');

        // 404 branch
        vi.mocked(db.query).mockResolvedValueOnce([
          { id: testAssetId, current_version_id: 1, mime_type: 'video/mp4' },
        ]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([]); // not found in engine

        const res404 = await request(app)
          .post('/api/v1/assets/70/transcode')
          .set('X-Forwarded-For', nextIp())
          .send({ profile: 'HLS_MULTI_BITRATE' });
        expect(res404.status).toBe(404);
        expect(res404.body.error).toBe('Not Found');
      });

      it('debe retornar 201 Created y data en caso exitoso', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([
          { id: testAssetId, current_version_id: null, mime_type: 'video/mp4' },
        ]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });

        // createAssetVideoTranscoding queries
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
        vi.mocked(db.query).mockResolvedValueOnce({ insertId: 99 }); // insert

        const res = await request(app)
          .post('/api/v1/assets/70/transcode')
          .set('X-Forwarded-For', nextIp())
          .send({
            profile: 'HLS_MULTI_BITRATE',
            segment_duration: 4,
          });

        expect(res.status).toBe(201);
        expect(res.body.data.id).toBe(99);
        expect(res.body.data.profile).toBe('HLS_MULTI_BITRATE');
      });
    });

    describe('GET /api/v1/assets/:id/transcodings', () => {
      it('debe retornar 400 si el ID es inválido', async () => {
        const res = await request(app)
          .get('/api/v1/assets/0/transcodings')
          .set('X-Forwarded-For', nextIp());
        expect(res.status).toBe(400);
      });

      it('debe retornar 404 si el activo no existe', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([]);
        const res = await request(app)
          .get('/api/v1/assets/70/transcodings')
          .set('X-Forwarded-For', nextIp());
        expect(res.status).toBe(404);
      });

      it('debe retornar 403 si ACL VIEW es denegado', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([{ id: testAssetId }]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: false });
        const res = await request(app)
          .get('/api/v1/assets/70/transcodings')
          .set('X-Forwarded-For', nextIp());
        expect(res.status).toBe(403);
      });

      it('debe retornar 200 OK con la lista de transcodificaciones (con y sin query params)', async () => {
        // With query params
        vi.mocked(db.query).mockResolvedValueOnce([{ id: testAssetId }]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([]);

        const resWithQuery = await request(app)
          .get(
            '/api/v1/assets/70/transcodings?profile=HLS_1080P&status=COMPLETED&limit=10&offset=5',
          )
          .set('X-Forwarded-For', nextIp());
        expect(resWithQuery.status).toBe(200);
        expect(resWithQuery.body.data).toEqual([]);

        // Without query params (defaults)
        vi.mocked(db.query).mockResolvedValueOnce([{ id: testAssetId }]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([]);

        const resWithoutQuery = await request(app)
          .get('/api/v1/assets/70/transcodings')
          .set('X-Forwarded-For', nextIp());
        expect(resWithoutQuery.status).toBe(200);
        expect(resWithoutQuery.body.data).toEqual([]);
      });
    });

    describe('GET /api/v1/assets/:id/transcodings/:transcodeId', () => {
      it('debe retornar 400 si los IDs son inválidos', async () => {
        const res1 = await request(app)
          .get('/api/v1/assets/0/transcodings/1')
          .set('X-Forwarded-For', nextIp());
        expect(res1.status).toBe(400);

        const res2 = await request(app)
          .get('/api/v1/assets/70/transcodings/0')
          .set('X-Forwarded-For', nextIp());
        expect(res2.status).toBe(400);
      });

      it('debe retornar 403 si ACL VIEW es denegado', async () => {
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: false });
        const res = await request(app)
          .get('/api/v1/assets/70/transcodings/1')
          .set('X-Forwarded-For', nextIp());
        expect(res.status).toBe(403);
      });

      it('debe retornar 404 si la transcodificación no existe', async () => {
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([]);
        const res = await request(app)
          .get('/api/v1/assets/70/transcodings/999')
          .set('X-Forwarded-For', nextIp());
        expect(res.status).toBe(404);
      });

      it('debe retornar 200 OK con el detalle de la transcodificación', async () => {
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([
          {
            id: 1,
            tenant_id: testTenantId,
            asset_id: testAssetId,
            version_id: 1,
            profile: 'HLS_MULTI_BITRATE',
            status: 'COMPLETED',
            master_playlist_path: path.join(tempDir, 'master.m3u8'),
            renditions: [],
            transcoding_metadata: {},
            duration_seconds: 60,
            bitrate_kbps: 5000,
            error_message: null,
            created_at: '2026-08-28T00:00:00Z',
          },
        ]);
        const res = await request(app)
          .get('/api/v1/assets/70/transcodings/1')
          .set('X-Forwarded-For', nextIp());
        expect(res.status).toBe(200);
        expect(res.body.data.id).toBe(1);
      });
    });

    describe('DELETE /api/v1/assets/:id/transcodings/:transcodeId', () => {
      it('debe retornar 400 si los IDs son inválidos', async () => {
        const res1 = await request(app)
          .delete('/api/v1/assets/0/transcodings/1')
          .set('X-Forwarded-For', nextIp());
        expect(res1.status).toBe(400);

        const res2 = await request(app)
          .delete('/api/v1/assets/70/transcodings/0')
          .set('X-Forwarded-For', nextIp());
        expect(res2.status).toBe(400);
      });

      it('debe retornar 403 si ACL EDIT es denegado', async () => {
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: false });
        const res = await request(app)
          .delete('/api/v1/assets/70/transcodings/1')
          .set('X-Forwarded-For', nextIp());
        expect(res.status).toBe(403);
      });

      it('debe retornar 404 si la transcodificación no existe', async () => {
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([]);
        const res = await request(app)
          .delete('/api/v1/assets/70/transcodings/999')
          .set('X-Forwarded-For', nextIp());
        expect(res.status).toBe(404);
      });

      it('debe retornar 200 OK y registrar evento de seguridad en caso exitoso', async () => {
        const delDir = path.join(tempDir, 'del_api_dir');
        fs.mkdirSync(delDir, { recursive: true });
        const masterPath = path.join(delDir, 'master.m3u8');
        fs.writeFileSync(masterPath, '#EXTM3U');

        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([
          {
            id: 1,
            tenant_id: testTenantId,
            asset_id: testAssetId,
            version_id: 1,
            profile: 'HLS_MULTI_BITRATE',
            status: 'COMPLETED',
            master_playlist_path: masterPath,
            renditions: [],
            transcoding_metadata: {},
            duration_seconds: 60,
            bitrate_kbps: 5000,
            error_message: null,
            created_at: '2026-08-28T00:00:00Z',
          },
        ]);
        vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 });

        const res = await request(app)
          .delete('/api/v1/assets/70/transcodings/1')
          .set('X-Forwarded-For', nextIp());
        expect(res.status).toBe(200);
        expect(res.body.message).toContain('eliminada exitosamente');
      });

      it('debe manejar excepciones inesperadas con status 500', async () => {
        vi.mocked(evaluateAclPermission).mockRejectedValueOnce(
          new Error('Unexpected Delete Error'),
        );
        const res = await request(app)
          .delete('/api/v1/assets/70/transcodings/1')
          .set('X-Forwarded-For', nextIp());
        expect(res.status).toBe(500);
        expect(res.body.error).toBe('Internal Server Error');
      });
    });

    describe('GET /api/v1/assets/:id/transcodings/:transcodeId/stream/:filename', () => {
      it('debe retornar 403 si ACL VIEW es denegado', async () => {
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: false });
        const res = await request(app)
          .get('/api/v1/assets/70/transcodings/1/stream/master.m3u8')
          .set('X-Forwarded-For', nextIp());
        expect(res.status).toBe(403);
      });

      it('debe retornar 404 si el archivo físico de stream no existe', async () => {
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([]); // record not found

        const res = await request(app)
          .get('/api/v1/assets/70/transcodings/1/stream/master.m3u8')
          .set('X-Forwarded-For', nextIp());
        expect(res.status).toBe(404);
        expect(res.body.message).toContain('no encontrado');
      });

      it('debe servir archivos .m3u8, .ts, .mp4 y binarios con sus cabeceras Content-Type correspondientes', async () => {
        const streamDir = path.join(tempDir, 'stream_content_dir');
        fs.mkdirSync(streamDir, { recursive: true });

        const m3u8File = path.join(streamDir, 'master.m3u8');
        fs.writeFileSync(m3u8File, '#EXTM3U');
        const tsFile = path.join(streamDir, 'chunk_0.ts');
        fs.writeFileSync(tsFile, 'TS_BYTES');
        const mp4File = path.join(streamDir, 'web.mp4');
        fs.writeFileSync(mp4File, 'MP4_BYTES');
        const binFile = path.join(streamDir, 'data.bin');
        fs.writeFileSync(binFile, 'BIN_BYTES');

        const dbRecord = [
          {
            id: 1,
            tenant_id: testTenantId,
            asset_id: testAssetId,
            version_id: 1,
            profile: 'HLS_MULTI_BITRATE',
            status: 'COMPLETED',
            master_playlist_path: m3u8File,
            renditions: [],
            transcoding_metadata: {},
            duration_seconds: 60,
            bitrate_kbps: 5000,
            error_message: null,
            created_at: '2026-08-28T00:00:00Z',
          },
        ];

        // 1. .m3u8
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce(dbRecord);
        const resM3u8 = await request(app)
          .get('/api/v1/assets/70/transcodings/1/stream/master.m3u8')
          .set('X-Forwarded-For', nextIp());
        expect(resM3u8.status).toBe(200);
        expect(resM3u8.header['content-type']).toContain('application/vnd.apple.mpegurl');

        // 2. .ts
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce(dbRecord);
        const resTs = await request(app)
          .get('/api/v1/assets/70/transcodings/1/stream/chunk_0.ts')
          .set('X-Forwarded-For', nextIp());
        expect(resTs.status).toBe(200);
        expect(resTs.header['content-type']).toContain('video/mp2t');

        // 3. .mp4
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce(dbRecord);
        const resMp4 = await request(app)
          .get('/api/v1/assets/70/transcodings/1/stream/web.mp4')
          .set('X-Forwarded-For', nextIp());
        expect(resMp4.status).toBe(200);
        expect(resMp4.header['content-type']).toContain('video/mp4');

        // 4. other bin
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce(dbRecord);
        const resBin = await request(app)
          .get('/api/v1/assets/70/transcodings/1/stream/data.bin')
          .set('X-Forwarded-For', nextIp());
        expect(resBin.status).toBe(200);
        expect(resBin.header['content-type']).toContain('application/octet-stream');
      });

      it('debe manejar excepciones inesperadas en stream con status 500', async () => {
        vi.mocked(evaluateAclPermission).mockRejectedValueOnce(new Error('Stream ACL Error'));
        const res = await request(app)
          .get('/api/v1/assets/70/transcodings/1/stream/master.m3u8')
          .set('X-Forwarded-For', nextIp());
        expect(res.status).toBe(500);
        expect(res.body.error).toBe('Internal Server Error');
      });
    });

    describe('500 Error Handlers for GET/POST routes', () => {
      it('POST /transcode debe manejar errores 500', async () => {
        vi.mocked(db.query).mockRejectedValueOnce(new Error('DB Error'));
        const res = await request(app)
          .post('/api/v1/assets/70/transcode')
          .set('X-Forwarded-For', nextIp())
          .send({ profile: 'HLS_MULTI_BITRATE' });
        expect(res.status).toBe(500);
        expect(res.body.error).toBe('Internal Server Error');
      });

      it('GET /transcodings debe manejar errores 500', async () => {
        vi.mocked(db.query).mockRejectedValueOnce(new Error('DB Error'));
        const res = await request(app)
          .get('/api/v1/assets/70/transcodings')
          .set('X-Forwarded-For', nextIp());
        expect(res.status).toBe(500);
        expect(res.body.error).toBe('Internal Server Error');
      });

      it('GET /transcodings/:id debe manejar errores 500', async () => {
        vi.mocked(evaluateAclPermission).mockRejectedValueOnce(new Error('ACL Error'));
        const res = await request(app)
          .get('/api/v1/assets/70/transcodings/1')
          .set('X-Forwarded-For', nextIp());
        expect(res.status).toBe(500);
        expect(res.body.error).toBe('Internal Server Error');
      });
    });
  });

  describe('6. Rate Limiting Tests (videoTranscodingRateLimiter)', () => {
    it('videoTranscodingRateLimiter debe estar definido y configurado', () => {
      expect(videoTranscodingRateLimiter).toBeDefined();
    });

    it('videoTranscodingRateLimiter debe responder con 429 cuando se excede el límite de 30 solicitudes', async () => {
      const rateLimitApp = express();
      rateLimitApp.set('trust proxy', true);
      rateLimitApp.use(videoTranscodingRateLimiter);
      rateLimitApp.get('/test-transcode-limit', (_req, res) => {
        res.status(200).json({ ok: true });
      });

      const isolatedIp = '198.51.100.188';

      // 30 requests allowed
      for (let i = 0; i < 30; i++) {
        const res = await request(rateLimitApp)
          .get('/test-transcode-limit')
          .set('X-Forwarded-For', isolatedIp);
        expect(res.status).toBe(200);
      }

      // 31st request rejected with 429
      const res429 = await request(rateLimitApp)
        .get('/test-transcode-limit')
        .set('X-Forwarded-For', isolatedIp);
      expect(res429.status).toBe(429);
      expect(res429.body.error).toBe('Too Many Requests');
      expect(res429.body.message).toContain('Límite de operaciones de transcodificación');
    });
  });
});
