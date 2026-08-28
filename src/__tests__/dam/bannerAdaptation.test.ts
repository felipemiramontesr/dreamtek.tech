/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import express, { Express } from 'express';
import request from 'supertest';
import * as db from '../../../server/src/db';
import assetsRouter from '../../../server/src/routes/assets';
import { STORAGE_ROOT } from '../../../server/src/utils/storage';
import { evaluateAclPermission } from '../../../server/src/utils/acl';
import { dispatchWebhookEvent } from '../../../server/src/utils/webhookDispatcher';
import {
  BannerPresetEnum,
  BannerStrategyEnum,
  manualCropSchema,
  createBannerAdaptationBodySchema,
  listBannerAdaptationsQuerySchema,
  bannerAdaptationParamSchema,
} from '../../../server/src/schemas/bannerAdaptation.schema';
import {
  isRasterImage,
  calculatePresetDimensions,
  resolveSharpPosition,
  calculateCropCoordinates,
  generateBannerAdaptationDerivative,
  createAssetBannerAdaptation,
  listAssetBannerAdaptations,
  getAssetBannerAdaptationById,
  deleteAssetBannerAdaptation,
  ALLOWED_RASTER_MIMES,
  MAX_INPUT_PIXELS,
  MAX_OUTPUT_PIXELS,
} from '../../../server/src/utils/bannerAdaptationEngine';
import { bannerAdaptationRateLimiter } from '../../../server/src/middleware/rateLimiter';

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

describe('FC 031 — DAM AI Smart Semantic Auto-Cropping & Banner Adaptation Suite (100% 4x100)', () => {
  const testTenantId = 100;
  const testAssetId = 60;
  const testVersionId = 1;
  const tempDir = path.join(STORAGE_ROOT, 'derivatives', `tenant_${testTenantId}`);
  const testImagePath = path.join(tempDir, 'test_banner_base.png');

  let app: Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(db.query).mockReset();
    vi.mocked(evaluateAclPermission).mockReset();
    fs.mkdirSync(tempDir, { recursive: true });

    // Create a 800x600 RGB base image
    await sharp({
      create: {
        width: 800,
        height: 600,
        channels: 3,
        background: { r: 120, g: 180, b: 240 },
      },
    })
      .png()
      .toFile(testImagePath);

    app = express();
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

  describe('1. Zod Schemas Validation (bannerAdaptation.schema.ts)', () => {
    it('BannerPresetEnum y BannerStrategyEnum deben validar opciones soportadas', () => {
      expect(BannerPresetEnum.safeParse('16:9_LANDSCAPE').success).toBe(true);
      expect(BannerPresetEnum.safeParse('1:1_SQUARE').success).toBe(true);
      expect(BannerPresetEnum.safeParse('9:16_STORY').success).toBe(true);
      expect(BannerPresetEnum.safeParse('4:5_PORTRAIT').success).toBe(true);
      expect(BannerPresetEnum.safeParse('21:9_ULTRAWIDE').success).toBe(true);
      expect(BannerPresetEnum.safeParse('4:3_STANDARD').success).toBe(true);
      expect(BannerPresetEnum.safeParse('CUSTOM').success).toBe(true);
      expect(BannerPresetEnum.safeParse('INVALID_PRESET').success).toBe(false);

      expect(BannerStrategyEnum.safeParse('ENTROPY').success).toBe(true);
      expect(BannerStrategyEnum.safeParse('ATTENTION').success).toBe(true);
      expect(BannerStrategyEnum.safeParse('CENTER').success).toBe(true);
      expect(BannerStrategyEnum.safeParse('NORTH').success).toBe(true);
      expect(BannerStrategyEnum.safeParse('SOUTH').success).toBe(true);
      expect(BannerStrategyEnum.safeParse('EAST').success).toBe(true);
      expect(BannerStrategyEnum.safeParse('WEST').success).toBe(true);
      expect(BannerStrategyEnum.safeParse('MANUAL_COORDINATES').success).toBe(true);
      expect(BannerStrategyEnum.safeParse('INVALID_STRAT').success).toBe(false);
    });

    it('manualCropSchema debe validar coordenadas de recorte válidas e inválidas', () => {
      expect(
        manualCropSchema.safeParse({ left: 10, top: 10, width: 200, height: 150 }).success,
      ).toBe(true);
      expect(
        manualCropSchema.safeParse({ left: -1, top: 10, width: 200, height: 150 }).success,
      ).toBe(false);
      expect(
        manualCropSchema.safeParse({ left: 0, top: -5, width: 200, height: 150 }).success,
      ).toBe(false);
      expect(manualCropSchema.safeParse({ left: 0, top: 0, width: 0, height: 150 }).success).toBe(
        false,
      );
      expect(manualCropSchema.safeParse({ left: 0, top: 0, width: 200, height: -10 }).success).toBe(
        false,
      );
    });

    it('createBannerAdaptationBodySchema debe validar cuerpo correcto y defaults', () => {
      const parsedDefault = createBannerAdaptationBodySchema.safeParse({
        preset: '16:9_LANDSCAPE',
      });
      expect(parsedDefault.success).toBe(true);
      if (parsedDefault.success) {
        expect(parsedDefault.data.strategy).toBe('ENTROPY');
      }

      const parsedCustom = createBannerAdaptationBodySchema.safeParse({
        preset: 'CUSTOM',
        strategy: 'CENTER',
        target_width: 1200,
        target_height: 630,
      });
      expect(parsedCustom.success).toBe(true);

      const parsedManual = createBannerAdaptationBodySchema.safeParse({
        preset: '1:1_SQUARE',
        strategy: 'MANUAL_COORDINATES',
        manual_crop: { left: 0, top: 0, width: 300, height: 300 },
      });
      expect(parsedManual.success).toBe(true);
    });

    it('createBannerAdaptationBodySchema debe fallar si CUSTOM no tiene dimensiones o MANUAL no tiene crop', () => {
      // CUSTOM without target_width/height
      const customMissing = createBannerAdaptationBodySchema.safeParse({
        preset: 'CUSTOM',
      });
      expect(customMissing.success).toBe(false);

      const customMissingH = createBannerAdaptationBodySchema.safeParse({
        preset: 'CUSTOM',
        target_width: 500,
      });
      expect(customMissingH.success).toBe(false);

      // MANUAL without manual_crop
      const manualMissing = createBannerAdaptationBodySchema.safeParse({
        preset: '16:9_LANDSCAPE',
        strategy: 'MANUAL_COORDINATES',
      });
      expect(manualMissing.success).toBe(false);

      // Bounds validation
      expect(
        createBannerAdaptationBodySchema.safeParse({
          preset: 'CUSTOM',
          target_width: 10,
          target_height: 500,
        }).success,
      ).toBe(false);

      expect(
        createBannerAdaptationBodySchema.safeParse({
          preset: 'CUSTOM',
          target_width: 9000,
          target_height: 500,
        }).success,
      ).toBe(false);
    });

    it('listBannerAdaptationsQuerySchema y bannerAdaptationParamSchema deben validar parámetros', () => {
      const parsedQuery = listBannerAdaptationsQuerySchema.safeParse({
        limit: '25',
        offset: '10',
        preset: '9:16_STORY',
        strategy: 'ATTENTION',
      });
      expect(parsedQuery.success).toBe(true);
      if (parsedQuery.success) {
        expect(parsedQuery.data.limit).toBe(25);
        expect(parsedQuery.data.preset).toBe('9:16_STORY');
      }

      expect(listBannerAdaptationsQuerySchema.safeParse({ limit: '200' }).success).toBe(false);
      expect(listBannerAdaptationsQuerySchema.safeParse({ offset: '-1' }).success).toBe(false);

      expect(bannerAdaptationParamSchema.safeParse({ id: '10', adaptationId: '5' }).success).toBe(
        true,
      );
      expect(bannerAdaptationParamSchema.safeParse({ id: '0', adaptationId: '5' }).success).toBe(
        false,
      );
      expect(bannerAdaptationParamSchema.safeParse({ id: '10', adaptationId: '0' }).success).toBe(
        false,
      );
    });
  });

  describe('2. Helper Functions & Dimension Calculations (bannerAdaptationEngine.ts)', () => {
    it('isRasterImage debe validar tipos raster y rechazar no compatibles', () => {
      ALLOWED_RASTER_MIMES.forEach((mime) => {
        expect(isRasterImage(mime)).toBe(true);
      });
      expect(isRasterImage('image/svg+xml')).toBe(false);
      expect(isRasterImage('application/pdf')).toBe(false);
      expect(isRasterImage(null)).toBe(false);
      expect(isRasterImage(undefined)).toBe(false);
    });

    it('calculatePresetDimensions debe calcular dimensiones para presets y CUSTOM', () => {
      // CUSTOM with custom dimensions
      const customDims = calculatePresetDimensions(800, 600, 'CUSTOM', 1200, 630);
      expect(customDims.width).toBe(1200);
      expect(customDims.height).toBe(630);

      // CUSTOM fallback to original dimensions
      const customFallback = calculatePresetDimensions(800, 600, 'CUSTOM');
      expect(customFallback.width).toBe(800);
      expect(customFallback.height).toBe(600);

      // 16:9 Landscape on large image (e.g. 3000x2000)
      const landscapeLarge = calculatePresetDimensions(3000, 2000, '16:9_LANDSCAPE');
      expect(landscapeLarge.width).toBe(1920);
      expect(landscapeLarge.height).toBe(1080);

      // 16:9 Landscape on small image: origWidth / spec.ratio <= origHeight
      // origWidth = 800, spec.ratio = 16/9 (~1.777), 800 / 1.777 = 450 <= 600
      const landscapeSmall1 = calculatePresetDimensions(800, 600, '16:9_LANDSCAPE');
      expect(landscapeSmall1.width).toBe(800);
      expect(landscapeSmall1.height).toBe(450);

      // 16:9 Landscape on wide short image: origWidth / spec.ratio > origHeight
      // origWidth = 800, origHeight = 300, 800 / 1.777 = 450 > 300
      const landscapeSmall2 = calculatePresetDimensions(800, 300, '16:9_LANDSCAPE');
      expect(landscapeSmall2.height).toBe(300);
      expect(landscapeSmall2.width).toBe(Math.round(300 * (16 / 9)));

      // 1:1 Square
      const square = calculatePresetDimensions(800, 600, '1:1_SQUARE');
      expect(square.aspectRatio).toBe(1);

      // 9:16 Story
      const story = calculatePresetDimensions(800, 600, '9:16_STORY');
      expect(story.aspectRatio).toBeCloseTo(9 / 16, 2);

      // 4:5 Portrait
      const portrait = calculatePresetDimensions(800, 600, '4:5_PORTRAIT');
      expect(portrait.aspectRatio).toBeCloseTo(4 / 5, 2);

      // 21:9 Ultrawide
      const ultrawide = calculatePresetDimensions(800, 600, '21:9_ULTRAWIDE');
      expect(ultrawide.aspectRatio).toBeCloseTo(21 / 9, 2);

      // 4:3 Standard
      const standard = calculatePresetDimensions(800, 600, '4:3_STANDARD');
      expect(standard.aspectRatio).toBeCloseTo(4 / 3, 2);
    });

    it('resolveSharpPosition debe mapear estrategias a Sharp position/gravity', () => {
      expect(resolveSharpPosition('ENTROPY')).toBe(sharp.strategy.entropy);
      expect(resolveSharpPosition('ATTENTION')).toBe(sharp.strategy.attention);
      expect(resolveSharpPosition('NORTH')).toBe(sharp.gravity.north);
      expect(resolveSharpPosition('SOUTH')).toBe(sharp.gravity.south);
      expect(resolveSharpPosition('EAST')).toBe(sharp.gravity.east);
      expect(resolveSharpPosition('WEST')).toBe(sharp.gravity.west);
      expect(resolveSharpPosition('CENTER')).toBe(sharp.gravity.center);
      expect(resolveSharpPosition('MANUAL_COORDINATES')).toBe(sharp.gravity.center);
    });

    it('calculateCropCoordinates debe calcular coordenadas ROI para varias orientaciones y estrategias', () => {
      // Wider image than target (orig: 800x400 -> target: 400x400)
      const widerCenter = calculateCropCoordinates(800, 400, 400, 400, 'CENTER');
      expect(widerCenter.width).toBe(400);
      expect(widerCenter.height).toBe(400);
      expect(widerCenter.left).toBe(200);

      const widerWest = calculateCropCoordinates(800, 400, 400, 400, 'WEST');
      expect(widerWest.left).toBe(0);

      const widerEast = calculateCropCoordinates(800, 400, 400, 400, 'EAST');
      expect(widerEast.left).toBe(400);

      // Taller image than target (orig: 400x800 -> target: 400x400)
      const tallerNorth = calculateCropCoordinates(400, 800, 400, 400, 'NORTH');
      expect(tallerNorth.top).toBe(0);

      const tallerSouth = calculateCropCoordinates(400, 800, 400, 400, 'SOUTH');
      expect(tallerSouth.top).toBe(400);
    });
  });

  describe('3. Derivative Generation Pipeline (generateBannerAdaptationDerivative)', () => {
    it('generateBannerAdaptationDerivative debe generar derivadas de banner con estrategias automáticas', async () => {
      // ENTROPY
      const resEntropy = await generateBannerAdaptationDerivative(
        testTenantId,
        testAssetId,
        testVersionId,
        '16:9_LANDSCAPE',
        'ENTROPY',
        undefined,
        undefined,
        undefined,
        testImagePath,
      );
      expect(fs.existsSync(resEntropy.derivativePath)).toBe(true);
      expect(resEntropy.metadata.strategy).toBe('ENTROPY');

      // ATTENTION
      const resAttention = await generateBannerAdaptationDerivative(
        testTenantId,
        testAssetId,
        testVersionId,
        '1:1_SQUARE',
        'ATTENTION',
        undefined,
        undefined,
        undefined,
        testImagePath,
      );
      expect(fs.existsSync(resAttention.derivativePath)).toBe(true);

      // NORTH gravity
      const resNorth = await generateBannerAdaptationDerivative(
        testTenantId,
        testAssetId,
        testVersionId,
        '9:16_STORY',
        'NORTH',
        undefined,
        undefined,
        undefined,
        testImagePath,
      );
      expect(fs.existsSync(resNorth.derivativePath)).toBe(true);
    });

    it('generateBannerAdaptationDerivative debe soportar MANUAL_COORDINATES', async () => {
      const resManual = await generateBannerAdaptationDerivative(
        testTenantId,
        testAssetId,
        testVersionId,
        '1:1_SQUARE',
        'MANUAL_COORDINATES',
        undefined,
        undefined,
        { left: 50, top: 50, width: 300, height: 300 },
        testImagePath,
      );
      expect(fs.existsSync(resManual.derivativePath)).toBe(true);
      expect(resManual.cropCoordinates.left).toBe(50);
    });

    it('generateBannerAdaptationDerivative debe validar errores en MANUAL_COORDINATES', async () => {
      // Missing manual crop
      await expect(
        generateBannerAdaptationDerivative(
          testTenantId,
          testAssetId,
          testVersionId,
          '1:1_SQUARE',
          'MANUAL_COORDINATES',
          undefined,
          undefined,
          undefined,
          testImagePath,
        ),
      ).rejects.toThrow('Las coordenadas manual_crop son requeridas');

      // Out of bounds manual crop
      await expect(
        generateBannerAdaptationDerivative(
          testTenantId,
          testAssetId,
          testVersionId,
          '1:1_SQUARE',
          'MANUAL_COORDINATES',
          undefined,
          undefined,
          { left: 700, top: 500, width: 300, height: 300 },
          testImagePath,
        ),
      ).rejects.toThrow('exceden los límites');
    });

    it('generateBannerAdaptationDerivative debe crear directorio automáticamente si no existe', async () => {
      const customTenantId = 999;
      const customTenantDir = path.join(STORAGE_ROOT, 'derivatives', `tenant_${customTenantId}`);
      if (fs.existsSync(customTenantDir)) {
        fs.rmSync(customTenantDir, { recursive: true, force: true });
      }

      const res = await generateBannerAdaptationDerivative(
        customTenantId,
        testAssetId,
        testVersionId,
        '4:5_PORTRAIT',
        'CENTER',
        undefined,
        undefined,
        undefined,
        testImagePath,
      );

      expect(fs.existsSync(res.derivativePath)).toBe(true);
      if (fs.existsSync(customTenantDir)) {
        fs.rmSync(customTenantDir, { recursive: true, force: true });
      }
    });

    it('generateBannerAdaptationDerivative debe fallar si archivo no existe o dimensiones exceden 16MP', async () => {
      const ghostFile = path.join(tempDir, 'ghost.png');
      await expect(
        generateBannerAdaptationDerivative(
          testTenantId,
          testAssetId,
          testVersionId,
          '16:9_LANDSCAPE',
          'ENTROPY',
          undefined,
          undefined,
          undefined,
          ghostFile,
        ),
      ).rejects.toThrow('El archivo de origen no existe');

      const bigFile = path.join(tempDir, 'big_file.png');
      await sharp({
        create: {
          width: 5000,
          height: 4000,
          channels: 3,
          background: { r: 50, g: 50, b: 50 },
        },
      })
        .png()
        .toFile(bigFile);

      await expect(
        generateBannerAdaptationDerivative(
          testTenantId,
          testAssetId,
          testVersionId,
          '16:9_LANDSCAPE',
          'ENTROPY',
          undefined,
          undefined,
          undefined,
          bigFile,
        ),
      ).rejects.toThrow('excede el límite máximo');

      // Output pixels exceed 16MP in CUSTOM
      await expect(
        generateBannerAdaptationDerivative(
          testTenantId,
          testAssetId,
          testVersionId,
          'CUSTOM',
          'CENTER',
          5000,
          4000,
          undefined,
          testImagePath,
        ),
      ).rejects.toThrow('exceden el límite máximo');
    });
  });

  describe('4. Engine Service Functions (bannerAdaptationEngine.ts)', () => {
    it('createAssetBannerAdaptation debe retornar 404 si el activo no existe', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const result = await createAssetBannerAdaptation(testTenantId, testAssetId, 1, {
        preset: '16:9_LANDSCAPE',
        strategy: 'ENTROPY',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.statusCode).toBe(404);
        expect(result.message).toContain('no encontrado');
      }
    });

    it('createAssetBannerAdaptation debe retornar 400 si el MIME no es raster o es nulo', async () => {
      // SVG
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: testAssetId,
          tenant_id: testTenantId,
          mime_type: 'image/svg+xml',
          current_version_id: 1,
          storage_path: testImagePath,
        },
      ]);
      const resSvg = await createAssetBannerAdaptation(testTenantId, testAssetId, 1, {
        preset: '16:9_LANDSCAPE',
        strategy: 'ENTROPY',
      });
      expect(resSvg.success).toBe(false);
      if (!resSvg.success) {
        expect(resSvg.statusCode).toBe(400);
        expect(resSvg.message).toContain('Solo se admiten formatos raster');
      }

      // Null MIME -> 'desconocido'
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: testAssetId,
          tenant_id: testTenantId,
          mime_type: null,
          current_version_id: 1,
          storage_path: testImagePath,
        },
      ]);
      const resNull = await createAssetBannerAdaptation(testTenantId, testAssetId, 1, {
        preset: '16:9_LANDSCAPE',
        strategy: 'ENTROPY',
      });
      expect(resNull.success).toBe(false);
      if (!resNull.success) {
        expect(resNull.statusCode).toBe(400);
        expect(resNull.message).toContain('desconocido');
      }
    });

    it('createAssetBannerAdaptation debe retornar 404 si el archivo físico no existe o fallback falla', async () => {
      const nonExistent = path.join(tempDir, 'non_existent.png');
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: testAssetId,
          tenant_id: testTenantId,
          mime_type: 'image/png',
          current_version_id: 1,
          storage_path: nonExistent,
        },
      ]);
      const resMissing = await createAssetBannerAdaptation(testTenantId, testAssetId, 1, {
        preset: '16:9_LANDSCAPE',
        strategy: 'ENTROPY',
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
          mime_type: 'image/png',
          current_version_id: null,
          storage_path: null,
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([]); // empty fallback

      const resEmptyFb = await createAssetBannerAdaptation(testTenantId, testAssetId, 1, {
        preset: '16:9_LANDSCAPE',
        strategy: 'ENTROPY',
      });
      expect(resEmptyFb.success).toBe(false);
      if (!resEmptyFb.success) {
        expect(resEmptyFb.statusCode).toBe(404);
      }
    });

    it('createAssetBannerAdaptation debe retornar 400 si la imagen está corrupta o excede 16MP', async () => {
      const corruptPath = path.join(tempDir, 'corrupt.png');
      fs.writeFileSync(corruptPath, 'CORRUPTED');

      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: testAssetId,
          tenant_id: testTenantId,
          mime_type: 'image/png',
          current_version_id: 1,
          storage_path: corruptPath,
        },
      ]);
      const resCorrupt = await createAssetBannerAdaptation(testTenantId, testAssetId, 1, {
        preset: '16:9_LANDSCAPE',
        strategy: 'ENTROPY',
      });
      expect(resCorrupt.success).toBe(false);
      if (!resCorrupt.success) {
        expect(resCorrupt.statusCode).toBe(400);
        expect(resCorrupt.message).toContain('No se pudieron leer las dimensiones');
      }

      const bigFile = path.join(tempDir, 'big_file_engine.png');
      await sharp({
        create: {
          width: 5000,
          height: 4000,
          channels: 3,
          background: { r: 50, g: 50, b: 50 },
        },
      })
        .png()
        .toFile(bigFile);

      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: testAssetId,
          tenant_id: testTenantId,
          mime_type: 'image/png',
          current_version_id: 1,
          storage_path: bigFile,
        },
      ]);
      const resBig = await createAssetBannerAdaptation(testTenantId, testAssetId, 1, {
        preset: '16:9_LANDSCAPE',
        strategy: 'ENTROPY',
      });
      expect(resBig.success).toBe(false);
      if (!resBig.success) {
        expect(resBig.statusCode).toBe(400);
        expect(resBig.message).toContain('excede el límite máximo');
      }
    });

    it('createAssetBannerAdaptation debe manejar error de procesamiento de derivada', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: testAssetId,
          tenant_id: testTenantId,
          mime_type: 'image/png',
          current_version_id: 1,
          storage_path: testImagePath,
        },
      ]);

      // MANUAL_COORDINATES with out of bounds manual_crop
      const resError = await createAssetBannerAdaptation(testTenantId, testAssetId, 1, {
        preset: '1:1_SQUARE',
        strategy: 'MANUAL_COORDINATES',
        manual_crop: { left: 900, top: 900, width: 300, height: 300 },
      });

      expect(resError.success).toBe(false);
      if (!resError.success) {
        expect(resError.statusCode).toBe(400);
        expect(resError.message).toContain('exceden los límites');
      }
    });

    it('createAssetBannerAdaptation debe crear derivada, sobreescribir previa en disco y despachar webhook', async () => {
      const oldBannerPath = path.join(tempDir, 'old_banner.webp');
      fs.writeFileSync(oldBannerPath, 'OLD_BANNER_BYTES');

      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: testAssetId,
          tenant_id: testTenantId,
          mime_type: 'image/png',
          current_version_id: testVersionId,
          storage_path: testImagePath,
        },
      ]);

      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 10, output_derivative_path: oldBannerPath },
      ]);

      vi.mocked(db.query).mockResolvedValueOnce({ insertId: 88 });

      const result = await createAssetBannerAdaptation(testTenantId, testAssetId, testVersionId, {
        preset: '16:9_LANDSCAPE',
        strategy: 'ENTROPY',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.statusCode).toBe(201);
        expect(result.adaptation.id).toBe(88);
        expect(result.adaptation.preset).toBe('16:9_LANDSCAPE');
        expect(fs.existsSync(oldBannerPath)).toBe(false);
        expect(fs.existsSync(result.adaptation.output_derivative_path)).toBe(true);
      }

      expect(dispatchWebhookEvent).toHaveBeenCalledWith(
        testTenantId,
        'asset.updated',
        expect.objectContaining({
          event_type: 'BANNER_ADAPTED',
          adaptation_id: 88,
          preset: '16:9_LANDSCAPE',
        }),
      );
    });

    it('createAssetBannerAdaptation debe soportar fallback storage_path y manejar error unlinkSync', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: testAssetId,
          tenant_id: testTenantId,
          mime_type: 'image/png',
          current_version_id: null,
          storage_path: null,
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([{ storage_path: testImagePath }]);

      const oldBannerPath = path.join(tempDir, 'old_banner_throw.webp');
      fs.writeFileSync(oldBannerPath, 'OLD_BYTES');

      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 11, output_derivative_path: oldBannerPath },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce({ insertId: 89 });

      const unlinkSpy = vi.spyOn(fs, 'unlinkSync').mockImplementationOnce(() => {
        throw new Error('Unlink error');
      });

      const res = await createAssetBannerAdaptation(testTenantId, testAssetId, 1, {
        preset: '1:1_SQUARE',
        strategy: 'ATTENTION',
      });

      expect(res.success).toBe(true);
      unlinkSpy.mockRestore();
    });

    it('listAssetBannerAdaptations debe retornar lista paginada y filtrada', async () => {
      // 1. With preset and strategy filters
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          preset: '16:9_LANDSCAPE',
          strategy: 'ENTROPY',
          target_width: 800,
          target_height: 450,
          crop_coordinates: JSON.stringify({ left: 0, top: 75, width: 800, height: 450 }),
          output_derivative_path: path.join(tempDir, 'b1.webp'),
          adaptation_metadata: JSON.stringify({ preset: '16:9_LANDSCAPE' }),
          created_at: '2026-08-28T00:00:00Z',
        },
      ]);

      const itemsFiltered = await listAssetBannerAdaptations(
        testTenantId,
        testAssetId,
        10,
        0,
        '16:9_LANDSCAPE',
        'ENTROPY',
      );
      expect(itemsFiltered).toHaveLength(1);
      expect(itemsFiltered[0].preset).toBe('16:9_LANDSCAPE');

      // 2. With preset only
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 2,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          preset: '1:1_SQUARE',
          strategy: 'CENTER',
          target_width: 600,
          target_height: 600,
          crop_coordinates: { left: 100, top: 0, width: 600, height: 600 },
          output_derivative_path: path.join(tempDir, 'b2.webp'),
          adaptation_metadata: { preset: '1:1_SQUARE' },
          created_at: '2026-08-28T00:05:00Z',
        },
      ]);
      const itemsPresetOnly = await listAssetBannerAdaptations(
        testTenantId,
        testAssetId,
        50,
        0,
        '1:1_SQUARE',
      );
      expect(itemsPresetOnly).toHaveLength(1);

      // 3. With strategy only
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 3,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          preset: '9:16_STORY',
          strategy: 'NORTH',
          target_width: 338,
          target_height: 600,
          crop_coordinates: { left: 231, top: 0, width: 338, height: 600 },
          output_derivative_path: path.join(tempDir, 'b3.webp'),
          adaptation_metadata: {},
          created_at: '2026-08-28T00:10:00Z',
        },
      ]);
      const itemsStrategyOnly = await listAssetBannerAdaptations(
        testTenantId,
        testAssetId,
        50,
        0,
        undefined,
        'NORTH',
      );
      expect(itemsStrategyOnly).toHaveLength(1);

      // 4. Default without filters
      vi.mocked(db.query).mockResolvedValueOnce([]);
      const itemsDefault = await listAssetBannerAdaptations(testTenantId, testAssetId);
      expect(itemsDefault).toHaveLength(0);
    });

    it('getAssetBannerAdaptationById debe retornar detalle o null', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          preset: '16:9_LANDSCAPE',
          strategy: 'ENTROPY',
          target_width: 800,
          target_height: 450,
          crop_coordinates: JSON.stringify({ left: 0, top: 75, width: 800, height: 450 }),
          output_derivative_path: path.join(tempDir, 'b1.webp'),
          adaptation_metadata: JSON.stringify({ preset: '16:9_LANDSCAPE' }),
          created_at: '2026-08-28T00:00:00Z',
        },
      ]);
      const item = await getAssetBannerAdaptationById(testTenantId, testAssetId, 1);
      expect(item).not.toBeNull();
      expect(item?.preset).toBe('16:9_LANDSCAPE');

      // Parsed object JSON and null case
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 2,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          preset: '1:1_SQUARE',
          strategy: 'CENTER',
          target_width: 600,
          target_height: 600,
          crop_coordinates: { left: 100, top: 0, width: 600, height: 600 },
          output_derivative_path: null,
          adaptation_metadata: { preset: '1:1_SQUARE' },
          created_at: '2026-08-28T00:00:00Z',
        },
      ]);
      const itemObj = await getAssetBannerAdaptationById(testTenantId, testAssetId, 2);
      expect(itemObj?.preset).toBe('1:1_SQUARE');

      vi.mocked(db.query).mockResolvedValueOnce([]);
      const notFound = await getAssetBannerAdaptationById(testTenantId, testAssetId, 999);
      expect(notFound).toBeNull();
    });

    it('deleteAssetBannerAdaptation debe eliminar archivo físico, BD y despachar webhook', async () => {
      const bannerToDelete = path.join(tempDir, 'banner_del.webp');
      fs.writeFileSync(bannerToDelete, 'DEL_BYTES');

      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 20,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          preset: '16:9_LANDSCAPE',
          strategy: 'ENTROPY',
          target_width: 800,
          target_height: 450,
          crop_coordinates: {},
          output_derivative_path: bannerToDelete,
          adaptation_metadata: {},
          created_at: '2026-08-28T00:00:00Z',
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 });

      const deleted = await deleteAssetBannerAdaptation(testTenantId, testAssetId, 20);
      expect(deleted).toBe(true);
      expect(fs.existsSync(bannerToDelete)).toBe(false);

      expect(dispatchWebhookEvent).toHaveBeenCalledWith(
        testTenantId,
        'asset.updated',
        expect.objectContaining({
          event_type: 'BANNER_ADAPTATION_DELETED',
          adaptation_id: 20,
        }),
      );

      // Non-existent disk file
      const nonExistentPath = path.join(tempDir, 'ghost_del.webp');
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 21,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          preset: '16:9_LANDSCAPE',
          strategy: 'ENTROPY',
          target_width: 800,
          target_height: 450,
          crop_coordinates: {},
          output_derivative_path: nonExistentPath,
          adaptation_metadata: {},
          created_at: '2026-08-28T00:00:00Z',
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 });
      const delGhost = await deleteAssetBannerAdaptation(testTenantId, testAssetId, 21);
      expect(delGhost).toBe(true);

      // Null output_derivative_path in delete
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 22,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          preset: '16:9_LANDSCAPE',
          strategy: 'ENTROPY',
          target_width: 800,
          target_height: 450,
          crop_coordinates: {},
          output_derivative_path: null,
          adaptation_metadata: {},
          created_at: '2026-08-28T00:00:00Z',
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 });
      const delNullPath = await deleteAssetBannerAdaptation(testTenantId, testAssetId, 22);
      expect(delNullPath).toBe(true);

      // Not found
      vi.mocked(db.query).mockResolvedValueOnce([]);
      const delNotFound = await deleteAssetBannerAdaptation(testTenantId, testAssetId, 999);
      expect(delNotFound).toBe(false);
    });

    it('createAssetBannerAdaptation debe manejar derivada previa inexistente en disco', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: testAssetId,
          tenant_id: testTenantId,
          mime_type: 'image/png',
          current_version_id: testVersionId,
          storage_path: testImagePath,
        },
      ]);

      const ghostOld = path.join(tempDir, 'ghost_prev_banner.webp');
      vi.mocked(db.query).mockResolvedValueOnce([{ id: 15, output_derivative_path: ghostOld }]);
      vi.mocked(db.query).mockResolvedValueOnce({ insertId: 92 });

      const resGhost = await createAssetBannerAdaptation(testTenantId, testAssetId, testVersionId, {
        preset: '16:9_LANDSCAPE',
        strategy: 'ENTROPY',
      });
      expect(resGhost.success).toBe(true);
    });
  });

  describe('5. Endpoints REST Integration Tests (assets.ts)', () => {
    describe('POST /api/v1/assets/:id/banner-adapt', () => {
      it('debe retornar 400 si el ID de activo es inválido', async () => {
        const res = await request(app)
          .post('/api/v1/assets/0/banner-adapt')
          .send({ preset: '16:9_LANDSCAPE' });
        expect(res.status).toBe(400);
      });

      it('debe retornar 400 si el cuerpo tiene campos inválidos', async () => {
        const res = await request(app)
          .post('/api/v1/assets/60/banner-adapt')
          .send({ preset: 'INVALID' });
        expect(res.status).toBe(400);
      });

      it('debe retornar 404 si el activo no existe', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([]);
        const res = await request(app)
          .post('/api/v1/assets/60/banner-adapt')
          .send({ preset: '16:9_LANDSCAPE' });
        expect(res.status).toBe(404);
      });

      it('debe retornar 403 si ACL deniega EDIT', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([
          { id: testAssetId, current_version_id: 1, mime_type: 'image/png' },
        ]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: false });

        const res = await request(app)
          .post('/api/v1/assets/60/banner-adapt')
          .send({ preset: '16:9_LANDSCAPE' });
        expect(res.status).toBe(403);
      });

      it('debe retornar 400 o 404 si createAssetBannerAdaptation falla', async () => {
        // 400 branch
        vi.mocked(db.query).mockResolvedValueOnce([
          { id: testAssetId, current_version_id: 1, mime_type: 'image/svg+xml' },
        ]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([
          {
            id: testAssetId,
            tenant_id: testTenantId,
            mime_type: 'image/svg+xml',
            current_version_id: 1,
          },
        ]);

        const res400 = await request(app)
          .post('/api/v1/assets/60/banner-adapt')
          .send({ preset: '16:9_LANDSCAPE' });
        expect(res400.status).toBe(400);
        expect(res400.body.error).toBe('Bad Request');

        // 404 branch
        vi.mocked(db.query).mockResolvedValueOnce([
          { id: testAssetId, current_version_id: 1, mime_type: 'image/png' },
        ]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([]); // not found in engine

        const res404 = await request(app)
          .post('/api/v1/assets/60/banner-adapt')
          .send({ preset: '16:9_LANDSCAPE' });
        expect(res404.status).toBe(404);
        expect(res404.body.error).toBe('Not Found');
      });

      it('debe retornar 201 Created y data en caso exitoso', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([
          { id: testAssetId, current_version_id: null, mime_type: 'image/png' },
        ]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });

        // createAssetBannerAdaptation queries
        vi.mocked(db.query).mockResolvedValueOnce([
          {
            id: testAssetId,
            tenant_id: testTenantId,
            mime_type: 'image/png',
            current_version_id: 1,
            storage_path: testImagePath,
          },
        ]);
        vi.mocked(db.query).mockResolvedValueOnce([]); // no existing
        vi.mocked(db.query).mockResolvedValueOnce({ insertId: 99 }); // insert

        const res = await request(app).post('/api/v1/assets/60/banner-adapt').send({
          preset: '16:9_LANDSCAPE',
          strategy: 'ENTROPY',
        });

        expect(res.status).toBe(201);
        expect(res.body.data.id).toBe(99);
        expect(res.body.data.preset).toBe('16:9_LANDSCAPE');
      });
    });

    describe('GET /api/v1/assets/:id/banner-adaptations', () => {
      it('debe retornar 400 si el ID es inválido', async () => {
        const res = await request(app).get('/api/v1/assets/0/banner-adaptations');
        expect(res.status).toBe(400);
      });

      it('debe retornar 404 si el activo no existe', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([]);
        const res = await request(app).get('/api/v1/assets/60/banner-adaptations');
        expect(res.status).toBe(404);
      });

      it('debe retornar 403 si ACL VIEW es denegado', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([{ id: testAssetId }]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: false });
        const res = await request(app).get('/api/v1/assets/60/banner-adaptations');
        expect(res.status).toBe(403);
      });

      it('debe retornar 200 OK con la lista de adaptaciones (con y sin query params)', async () => {
        // With query params
        vi.mocked(db.query).mockResolvedValueOnce([{ id: testAssetId }]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([]);

        const resWithQuery = await request(app).get(
          '/api/v1/assets/60/banner-adaptations?preset=16:9_LANDSCAPE&strategy=ENTROPY&limit=10&offset=5',
        );
        expect(resWithQuery.status).toBe(200);
        expect(resWithQuery.body.data).toEqual([]);

        // Without query params (defaults)
        vi.mocked(db.query).mockResolvedValueOnce([{ id: testAssetId }]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([]);

        const resWithoutQuery = await request(app).get('/api/v1/assets/60/banner-adaptations');
        expect(resWithoutQuery.status).toBe(200);
        expect(resWithoutQuery.body.data).toEqual([]);
      });
    });

    describe('GET /api/v1/assets/:id/banner-adaptations/:adaptationId', () => {
      it('debe retornar 400 si los IDs son inválidos', async () => {
        const res1 = await request(app).get('/api/v1/assets/0/banner-adaptations/1');
        expect(res1.status).toBe(400);

        const res2 = await request(app).get('/api/v1/assets/60/banner-adaptations/0');
        expect(res2.status).toBe(400);
      });

      it('debe retornar 403 si ACL VIEW es denegado', async () => {
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: false });
        const res = await request(app).get('/api/v1/assets/60/banner-adaptations/1');
        expect(res.status).toBe(403);
      });

      it('debe retornar 404 si la adaptación no existe', async () => {
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([]);
        const res = await request(app).get('/api/v1/assets/60/banner-adaptations/999');
        expect(res.status).toBe(404);
      });

      it('debe retornar 200 OK con el detalle de la adaptación', async () => {
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([
          {
            id: 1,
            tenant_id: testTenantId,
            asset_id: testAssetId,
            version_id: 1,
            preset: '16:9_LANDSCAPE',
            strategy: 'ENTROPY',
            target_width: 800,
            target_height: 450,
            crop_coordinates: {},
            output_derivative_path: path.join(tempDir, 'b1.webp'),
            adaptation_metadata: {},
            created_at: '2026-08-28T00:00:00Z',
          },
        ]);
        const res = await request(app).get('/api/v1/assets/60/banner-adaptations/1');
        expect(res.status).toBe(200);
        expect(res.body.data.id).toBe(1);
      });
    });

    describe('DELETE /api/v1/assets/:id/banner-adaptations/:adaptationId', () => {
      it('debe retornar 400 si los IDs son inválidos', async () => {
        const res1 = await request(app).delete('/api/v1/assets/0/banner-adaptations/1');
        expect(res1.status).toBe(400);

        const res2 = await request(app).delete('/api/v1/assets/60/banner-adaptations/0');
        expect(res2.status).toBe(400);
      });

      it('debe retornar 403 si ACL EDIT es denegado', async () => {
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: false });
        const res = await request(app).delete('/api/v1/assets/60/banner-adaptations/1');
        expect(res.status).toBe(403);
      });

      it('debe retornar 404 si la adaptación no existe', async () => {
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([]);
        const res = await request(app).delete('/api/v1/assets/60/banner-adaptations/999');
        expect(res.status).toBe(404);
      });

      it('debe retornar 200 OK y registrar evento de seguridad en caso exitoso', async () => {
        const bannerToDelete = path.join(tempDir, 'banner_to_del.webp');
        fs.writeFileSync(bannerToDelete, 'BYTES');

        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([
          {
            id: 1,
            tenant_id: testTenantId,
            asset_id: testAssetId,
            version_id: 1,
            preset: '16:9_LANDSCAPE',
            strategy: 'ENTROPY',
            target_width: 800,
            target_height: 450,
            crop_coordinates: {},
            output_derivative_path: bannerToDelete,
            adaptation_metadata: {},
            created_at: '2026-08-28T00:00:00Z',
          },
        ]);
        vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 });

        const res = await request(app).delete('/api/v1/assets/60/banner-adaptations/1');
        expect(res.status).toBe(200);
        expect(res.body.message).toContain('eliminada exitosamente');
      });

      it('debe manejar excepciones inesperadas con status 500', async () => {
        vi.mocked(evaluateAclPermission).mockRejectedValueOnce(
          new Error('Unexpected Delete Error'),
        );
        const res = await request(app).delete('/api/v1/assets/60/banner-adaptations/1');
        expect(res.status).toBe(500);
        expect(res.body.error).toBe('Internal Server Error');
      });
    });

    describe('500 Error Handlers for GET/POST routes', () => {
      it('POST /banner-adapt debe manejar errores 500', async () => {
        vi.mocked(db.query).mockRejectedValueOnce(new Error('DB Error'));
        const res = await request(app)
          .post('/api/v1/assets/60/banner-adapt')
          .send({ preset: '16:9_LANDSCAPE' });
        expect(res.status).toBe(500);
        expect(res.body.error).toBe('Internal Server Error');
      });

      it('GET /banner-adaptations debe manejar errores 500', async () => {
        vi.mocked(db.query).mockRejectedValueOnce(new Error('DB Error'));
        const res = await request(app).get('/api/v1/assets/60/banner-adaptations');
        expect(res.status).toBe(500);
        expect(res.body.error).toBe('Internal Server Error');
      });

      it('GET /banner-adaptations/:id debe manejar errores 500', async () => {
        vi.mocked(evaluateAclPermission).mockRejectedValueOnce(new Error('ACL Error'));
        const res = await request(app).get('/api/v1/assets/60/banner-adaptations/1');
        expect(res.status).toBe(500);
        expect(res.body.error).toBe('Internal Server Error');
      });
    });
  });

  describe('6. Rate Limiting Tests (bannerAdaptationRateLimiter)', () => {
    it('bannerAdaptationRateLimiter debe estar definido y configurado', () => {
      expect(bannerAdaptationRateLimiter).toBeDefined();
    });

    it('bannerAdaptationRateLimiter debe responder con 429 cuando se excede el límite de 30 solicitudes', async () => {
      const rateLimitApp = express();
      rateLimitApp.set('trust proxy', true);
      rateLimitApp.use(bannerAdaptationRateLimiter);
      rateLimitApp.get('/test-banner-limit', (_req, res) => {
        res.status(200).json({ ok: true });
      });

      const isolatedIp = '198.51.100.101';

      // 30 requests allowed
      for (let i = 0; i < 30; i++) {
        const res = await request(rateLimitApp)
          .get('/test-banner-limit')
          .set('X-Forwarded-For', isolatedIp);
        expect(res.status).toBe(200);
      }

      // 31st request rejected with 429
      const res429 = await request(rateLimitApp)
        .get('/test-banner-limit')
        .set('X-Forwarded-For', isolatedIp);
      expect(res429.status).toBe(429);
      expect(res429.body.error).toBe('Too Many Requests');
      expect(res429.body.message).toContain('Límite de operaciones de adaptación de banners');
    });
  });
});
