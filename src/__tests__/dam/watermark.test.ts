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
  WatermarkTypeEnum,
  WatermarkPositionEnum,
  createWatermarkBodySchema,
  listWatermarksQuerySchema,
  watermarkParamSchema,
} from '../../../server/src/schemas/watermark.schema';
import {
  isRasterImage,
  escapeXml,
  calculateOverlayPosition,
  generateSvgTextOverlay,
  generateWatermarkDerivative,
  createAssetWatermark,
  listAssetWatermarks,
  getAssetWatermarkById,
  deleteAssetWatermark,
  ALLOWED_RASTER_MIMES,
} from '../../../server/src/utils/watermarkEngine';
import { watermarkRateLimiter } from '../../../server/src/middleware/rateLimiter';

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

describe('FC 030 — DAM AI Smart Watermarking & Copyright Protection Suite (100% 4x100)', () => {
  const testTenantId = 100;
  const testAssetId = 50;
  const testWmAssetId = 51;
  const testVersionId = 1;
  const tempDir = path.join(STORAGE_ROOT, 'derivatives', `tenant_${testTenantId}`);
  const testImagePath = path.join(tempDir, 'test_watermark_base.png');
  const testWmImagePath = path.join(tempDir, 'test_watermark_logo.png');

  let app: Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(db.query).mockReset();
    vi.mocked(evaluateAclPermission).mockReset();
    fs.mkdirSync(tempDir, { recursive: true });

    // Create a 200x200 RGB base image
    await sharp({
      create: {
        width: 200,
        height: 200,
        channels: 3,
        background: { r: 100, g: 150, b: 200 },
      },
    })
      .png()
      .toFile(testImagePath);

    // Create a 50x50 logo image
    await sharp({
      create: {
        width: 50,
        height: 50,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 0.8 },
      },
    })
      .png()
      .toFile(testWmImagePath);

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

  describe('1. Zod Schemas Validation (watermark.schema.ts)', () => {
    it('WatermarkTypeEnum y WatermarkPositionEnum deben validar tipos y posiciones soportados', () => {
      expect(WatermarkTypeEnum.safeParse('TEXT').success).toBe(true);
      expect(WatermarkTypeEnum.safeParse('IMAGE').success).toBe(true);
      expect(WatermarkTypeEnum.safeParse('AUDIO').success).toBe(false);

      expect(WatermarkPositionEnum.safeParse('CENTER').success).toBe(true);
      expect(WatermarkPositionEnum.safeParse('TOP_LEFT').success).toBe(true);
      expect(WatermarkPositionEnum.safeParse('TOP_RIGHT').success).toBe(true);
      expect(WatermarkPositionEnum.safeParse('BOTTOM_LEFT').success).toBe(true);
      expect(WatermarkPositionEnum.safeParse('BOTTOM_RIGHT').success).toBe(true);
      expect(WatermarkPositionEnum.safeParse('TILED_PATTERN').success).toBe(true);
      expect(WatermarkPositionEnum.safeParse('UNKNOWN').success).toBe(false);
    });

    it('createWatermarkBodySchema debe validar cuerpo correcto para tipo TEXT e IMAGE', () => {
      const parsedText = createWatermarkBodySchema.safeParse({
        watermark_type: 'TEXT',
        watermark_text: '© 2026 Dreamtek',
      });
      expect(parsedText.success).toBe(true);
      if (parsedText.success) {
        expect(parsedText.data.position).toBe('BOTTOM_RIGHT');
        expect(parsedText.data.opacity).toBe(0.5);
        expect(parsedText.data.rotation).toBe(0);
      }

      const parsedImage = createWatermarkBodySchema.safeParse({
        watermark_type: 'IMAGE',
        watermark_asset_id: 51,
        position: 'CENTER',
        opacity: 0.8,
        rotation: 45,
      });
      expect(parsedImage.success).toBe(true);
      if (parsedImage.success) {
        expect(parsedImage.data.watermark_asset_id).toBe(51);
        expect(parsedImage.data.position).toBe('CENTER');
        expect(parsedImage.data.opacity).toBe(0.8);
        expect(parsedImage.data.rotation).toBe(45);
      }
    });

    it('createWatermarkBodySchema debe fallar si falta texto en TEXT o asset_id en IMAGE', () => {
      // TEXT without text
      const emptyText = createWatermarkBodySchema.safeParse({
        watermark_type: 'TEXT',
      });
      expect(emptyText.success).toBe(false);

      const whitespaceText = createWatermarkBodySchema.safeParse({
        watermark_type: 'TEXT',
        watermark_text: '   ',
      });
      expect(whitespaceText.success).toBe(false);

      // IMAGE without asset_id
      const noAssetId = createWatermarkBodySchema.safeParse({
        watermark_type: 'IMAGE',
      });
      expect(noAssetId.success).toBe(false);

      const negativeAssetId = createWatermarkBodySchema.safeParse({
        watermark_type: 'IMAGE',
        watermark_asset_id: -5,
      });
      expect(negativeAssetId.success).toBe(false);
    });

    it('createWatermarkBodySchema debe rechazar opacidad y rotación fuera de límites', () => {
      expect(
        createWatermarkBodySchema.safeParse({
          watermark_type: 'TEXT',
          watermark_text: 'Test',
          opacity: 0.01,
        }).success,
      ).toBe(false);

      expect(
        createWatermarkBodySchema.safeParse({
          watermark_type: 'TEXT',
          watermark_text: 'Test',
          opacity: 1.5,
        }).success,
      ).toBe(false);

      expect(
        createWatermarkBodySchema.safeParse({
          watermark_type: 'TEXT',
          watermark_text: 'Test',
          rotation: -200,
        }).success,
      ).toBe(false);

      expect(
        createWatermarkBodySchema.safeParse({
          watermark_type: 'TEXT',
          watermark_text: 'Test',
          rotation: 200,
        }).success,
      ).toBe(false);
    });

    it('listWatermarksQuerySchema debe validar parámetros de consulta', () => {
      const parsedDefault = listWatermarksQuerySchema.safeParse({});
      expect(parsedDefault.success).toBe(true);
      if (parsedDefault.success) {
        expect(parsedDefault.data.limit).toBe(50);
        expect(parsedDefault.data.offset).toBe(0);
      }

      const parsedCustom = listWatermarksQuerySchema.safeParse({
        limit: '20',
        offset: '5',
        watermark_type: 'TEXT',
        position: 'CENTER',
      });
      expect(parsedCustom.success).toBe(true);
      if (parsedCustom.success) {
        expect(parsedCustom.data.limit).toBe(20);
        expect(parsedCustom.data.offset).toBe(5);
        expect(parsedCustom.data.watermark_type).toBe('TEXT');
      }

      expect(listWatermarksQuerySchema.safeParse({ limit: '150' }).success).toBe(false);
      expect(listWatermarksQuerySchema.safeParse({ offset: '-1' }).success).toBe(false);
    });

    it('watermarkParamSchema debe validar IDs numéricos positivos', () => {
      expect(watermarkParamSchema.safeParse({ id: '10', watermarkId: '5' }).success).toBe(true);
      expect(watermarkParamSchema.safeParse({ id: '0', watermarkId: '5' }).success).toBe(false);
      expect(watermarkParamSchema.safeParse({ id: '10', watermarkId: '-2' }).success).toBe(false);
      expect(watermarkParamSchema.safeParse({ id: 'abc', watermarkId: '5' }).success).toBe(false);
    });
  });

  describe('2. Helper Functions & XML Sanitization (watermarkEngine.ts)', () => {
    it('isRasterImage debe identificar formatos raster válidos y rechazar inválidos', () => {
      ALLOWED_RASTER_MIMES.forEach((mime) => {
        expect(isRasterImage(mime)).toBe(true);
      });
      expect(isRasterImage('image/svg+xml')).toBe(false);
      expect(isRasterImage('application/pdf')).toBe(false);
      expect(isRasterImage(null)).toBe(false);
      expect(isRasterImage(undefined)).toBe(false);
    });

    it('escapeXml debe sanitizar caracteres especiales contra inyecciones SVG/XSS', () => {
      const unsafe = `Dreamtek <Brand> & 'Co' "2026"`;
      const safe = escapeXml(unsafe);
      expect(safe).toBe('Dreamtek &lt;Brand&gt; &amp; &apos;Co&apos; &quot;2026&quot;');
    });

    it('calculateOverlayPosition debe calcular coordenadas para todas las posiciones', () => {
      // Base 1000x1000, Overlay 200x100, margin 24
      const center = calculateOverlayPosition(1000, 1000, 200, 100, 'CENTER', 24);
      expect(center.left).toBe(400);
      expect(center.top).toBe(450);

      const topLeft = calculateOverlayPosition(1000, 1000, 200, 100, 'TOP_LEFT', 24);
      expect(topLeft.left).toBe(24);
      expect(topLeft.top).toBe(24);

      const topRight = calculateOverlayPosition(1000, 1000, 200, 100, 'TOP_RIGHT', 24);
      expect(topRight.left).toBe(776);
      expect(topRight.top).toBe(24);

      const bottomLeft = calculateOverlayPosition(1000, 1000, 200, 100, 'BOTTOM_LEFT', 24);
      expect(bottomLeft.left).toBe(24);
      expect(bottomLeft.top).toBe(876);

      const bottomRight = calculateOverlayPosition(1000, 1000, 200, 100, 'BOTTOM_RIGHT', 24);
      expect(bottomRight.left).toBe(776);
      expect(bottomRight.top).toBe(876);
    });

    it('generateSvgTextOverlay debe generar SVG para posiciones estándar y TILED_PATTERN', () => {
      // Standard positions
      const svgCenter = generateSvgTextOverlay('Test Text', 800, 600, 0.5, 0, 'CENTER');
      expect(svgCenter.toString()).toContain('text-anchor="middle"');
      expect(svgCenter.toString()).toContain('fill-opacity="0.5"');

      const svgTopLeft = generateSvgTextOverlay('Test Text', 800, 600, 0.5, 15, 'TOP_LEFT');
      expect(svgTopLeft.toString()).toContain('text-anchor="start"');
      expect(svgTopLeft.toString()).toContain('transform="rotate(15');

      const svgTopRight = generateSvgTextOverlay('Test Text', 800, 600, 0.5, 0, 'TOP_RIGHT');
      expect(svgTopRight.toString()).toContain('text-anchor="end"');

      const svgBottomLeft = generateSvgTextOverlay('Test Text', 800, 600, 0.5, 0, 'BOTTOM_LEFT');
      expect(svgBottomLeft.toString()).toContain('text-anchor="start"');

      const svgBottomRight = generateSvgTextOverlay('Test Text', 800, 600, 0.5, 0, 'BOTTOM_RIGHT');
      expect(svgBottomRight.toString()).toContain('text-anchor="end"');

      // TILED_PATTERN with rotation != 0 and rotation === 0
      const svgTiled = generateSvgTextOverlay('Confidential', 800, 600, 0.3, -45, 'TILED_PATTERN');
      expect(svgTiled.toString()).toContain('transform="rotate(-45');

      const svgTiledDefaultRot = generateSvgTextOverlay(
        'Confidential',
        800,
        600,
        0.3,
        0,
        'TILED_PATTERN',
      );
      expect(svgTiledDefaultRot.toString()).toContain('transform="rotate(-30');
    });
  });

  describe('3. Derivative Generation Pipeline (generateWatermarkDerivative)', () => {
    it('generateWatermarkDerivative debe generar derivada de marca de agua tipo TEXT con rotación y posiciones', async () => {
      // TEXT BOTTOM_RIGHT
      const resText = await generateWatermarkDerivative(
        testTenantId,
        testAssetId,
        testVersionId,
        'TEXT',
        '© Dreamtek 2026',
        null,
        'BOTTOM_RIGHT',
        0.5,
        0,
        testImagePath,
      );

      expect(fs.existsSync(resText.derivativePath)).toBe(true);
      expect(resText.metadata.watermark_type).toBe('TEXT');

      // TEXT TILED_PATTERN con texto por defecto
      const resTextTiled = await generateWatermarkDerivative(
        testTenantId,
        testAssetId,
        testVersionId,
        'TEXT',
        null, // evaluates fallback '© Confidential'
        null,
        'TILED_PATTERN',
        0.3,
        -30,
        testImagePath,
      );
      expect(fs.existsSync(resTextTiled.derivativePath)).toBe(true);
    });

    it('generateWatermarkDerivative debe generar derivada de marca de agua tipo IMAGE (centrada y tiled)', async () => {
      // IMAGE CENTER con rotación
      const resImage = await generateWatermarkDerivative(
        testTenantId,
        testAssetId,
        testVersionId,
        'IMAGE',
        null,
        testWmImagePath,
        'CENTER',
        0.7,
        45,
        testImagePath,
      );

      expect(fs.existsSync(resImage.derivativePath)).toBe(true);
      expect(resImage.metadata.watermark_type).toBe('IMAGE');

      // IMAGE TILED_PATTERN con rotación 0
      const resImageTiled = await generateWatermarkDerivative(
        testTenantId,
        testAssetId,
        testVersionId,
        'IMAGE',
        null,
        testWmImagePath,
        'TILED_PATTERN',
        0.4,
        0,
        testImagePath,
      );
      expect(fs.existsSync(resImageTiled.derivativePath)).toBe(true);
    });

    it('generateWatermarkDerivative debe crear automáticamente el directorio de salida si no existe', async () => {
      const customTenantId = 888;
      const customTenantDir = path.join(STORAGE_ROOT, 'derivatives', `tenant_${customTenantId}`);
      if (fs.existsSync(customTenantDir)) {
        fs.rmSync(customTenantDir, { recursive: true, force: true });
      }

      const res = await generateWatermarkDerivative(
        customTenantId,
        testAssetId,
        testVersionId,
        'TEXT',
        'Test Auto Dir',
        null,
        'BOTTOM_RIGHT',
        0.5,
        0,
        testImagePath,
      );

      expect(fs.existsSync(res.derivativePath)).toBe(true);
      if (fs.existsSync(customTenantDir)) {
        fs.rmSync(customTenantDir, { recursive: true, force: true });
      }
    });

    it('generateWatermarkDerivative debe fallar si el archivo base o el logo no existen', async () => {
      const nonExistentBase = path.join(tempDir, 'ghost_base.png');
      await expect(
        generateWatermarkDerivative(
          testTenantId,
          testAssetId,
          testVersionId,
          'TEXT',
          'Test',
          null,
          'BOTTOM_RIGHT',
          0.5,
          0,
          nonExistentBase,
        ),
      ).rejects.toThrow('El archivo de origen no existe');

      const nonExistentLogo = path.join(tempDir, 'ghost_logo.png');
      await expect(
        generateWatermarkDerivative(
          testTenantId,
          testAssetId,
          testVersionId,
          'IMAGE',
          null,
          nonExistentLogo,
          'CENTER',
          0.5,
          0,
          testImagePath,
        ),
      ).rejects.toThrow('El archivo de imagen de marca de agua no existe');
    });

    it('generateWatermarkDerivative debe fallar si la imagen base o de marca de agua excede 16MP', async () => {
      const bigImg = path.join(tempDir, 'big_base.png');
      await sharp({
        create: {
          width: 5000,
          height: 4000,
          channels: 3,
          background: { r: 50, g: 50, b: 50 },
        },
      })
        .png()
        .toFile(bigImg);

      await expect(
        generateWatermarkDerivative(
          testTenantId,
          testAssetId,
          testVersionId,
          'TEXT',
          'Test',
          null,
          'BOTTOM_RIGHT',
          0.5,
          0,
          bigImg,
        ),
      ).rejects.toThrow('excede el límite máximo');

      await expect(
        generateWatermarkDerivative(
          testTenantId,
          testAssetId,
          testVersionId,
          'IMAGE',
          null,
          bigImg,
          'CENTER',
          0.5,
          0,
          testImagePath,
        ),
      ).rejects.toThrow('excede el límite máximo');
    });
  });

  describe('4. Engine Service Functions (watermarkEngine.ts)', () => {
    it('createAssetWatermark debe retornar 404 si el activo base no existe', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const result = await createAssetWatermark(testTenantId, testAssetId, 1, {
        watermark_type: 'TEXT',
        watermark_text: '© Dreamtek',
        position: 'BOTTOM_RIGHT',
        opacity: 0.5,
        rotation: 0,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.statusCode).toBe(404);
        expect(result.message).toContain('no encontrado');
      }
    });

    it('createAssetWatermark debe retornar 400 si el MIME del activo base no es raster o es nulo', async () => {
      // Non-raster SVG
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: testAssetId,
          tenant_id: testTenantId,
          mime_type: 'image/svg+xml',
          current_version_id: 1,
          storage_path: testImagePath,
        },
      ]);

      const resSvg = await createAssetWatermark(testTenantId, testAssetId, 1, {
        watermark_type: 'TEXT',
        watermark_text: '© Dreamtek',
        position: 'BOTTOM_RIGHT',
        opacity: 0.5,
        rotation: 0,
      });
      expect(resSvg.success).toBe(false);
      if (!resSvg.success) {
        expect(resSvg.statusCode).toBe(400);
        expect(resSvg.message).toContain('Solo se admiten formatos raster');
      }

      // Null MIME -> evaluates 'desconocido'
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: testAssetId,
          tenant_id: testTenantId,
          mime_type: null,
          current_version_id: 1,
          storage_path: testImagePath,
        },
      ]);

      const resNull = await createAssetWatermark(testTenantId, testAssetId, 1, {
        watermark_type: 'TEXT',
        watermark_text: '© Dreamtek',
        position: 'BOTTOM_RIGHT',
        opacity: 0.5,
        rotation: 0,
      });
      expect(resNull.success).toBe(false);
      if (!resNull.success) {
        expect(resNull.statusCode).toBe(400);
        expect(resNull.message).toContain('desconocido');
      }
    });

    it('createAssetWatermark debe retornar 404 si el archivo físico base no existe', async () => {
      const nonExistentPath = path.join(tempDir, 'ghost_base.png');
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: testAssetId,
          tenant_id: testTenantId,
          mime_type: 'image/png',
          current_version_id: 1,
          storage_path: nonExistentPath,
        },
      ]);

      const result = await createAssetWatermark(testTenantId, testAssetId, 1, {
        watermark_type: 'TEXT',
        watermark_text: '© Dreamtek',
        position: 'BOTTOM_RIGHT',
        opacity: 0.5,
        rotation: 0,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.statusCode).toBe(404);
        expect(result.message).toContain('no se encuentra en el almacenamiento');
      }
    });

    it('createAssetWatermark debe validar activo de marca de agua en tipo IMAGE', async () => {
      // 1. Watermark asset not found in same tenant
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: testAssetId,
          tenant_id: testTenantId,
          mime_type: 'image/png',
          current_version_id: 1,
          storage_path: testImagePath,
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([]); // wm asset not found

      const resWmNotFound = await createAssetWatermark(testTenantId, testAssetId, 1, {
        watermark_type: 'IMAGE',
        watermark_asset_id: testWmAssetId,
        position: 'CENTER',
        opacity: 0.5,
        rotation: 0,
      });
      expect(resWmNotFound.success).toBe(false);
      if (!resWmNotFound.success) {
        expect(resWmNotFound.statusCode).toBe(404);
        expect(resWmNotFound.message).toContain('mismo tenant requerido');
      }

      // 2. Watermark asset MIME non-raster
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: testAssetId,
          tenant_id: testTenantId,
          mime_type: 'image/png',
          current_version_id: 1,
          storage_path: testImagePath,
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: testWmAssetId,
          tenant_id: testTenantId,
          mime_type: 'image/svg+xml',
          storage_path: testWmImagePath,
        },
      ]);

      const resWmNonRaster = await createAssetWatermark(testTenantId, testAssetId, 1, {
        watermark_type: 'IMAGE',
        watermark_asset_id: testWmAssetId,
        position: 'CENTER',
        opacity: 0.5,
        rotation: 0,
      });
      expect(resWmNonRaster.success).toBe(false);
      if (!resWmNonRaster.success) {
        expect(resWmNonRaster.statusCode).toBe(400);
        expect(resWmNonRaster.message).toContain('no compatible');
      }

      // 3. Watermark asset null MIME
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: testAssetId,
          tenant_id: testTenantId,
          mime_type: 'image/png',
          current_version_id: 1,
          storage_path: testImagePath,
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: testWmAssetId,
          tenant_id: testTenantId,
          mime_type: null,
          storage_path: testWmImagePath,
        },
      ]);

      const resWmNullMime = await createAssetWatermark(testTenantId, testAssetId, 1, {
        watermark_type: 'IMAGE',
        watermark_asset_id: testWmAssetId,
        position: 'CENTER',
        opacity: 0.5,
        rotation: 0,
      });
      expect(resWmNullMime.success).toBe(false);
      if (!resWmNullMime.success) {
        expect(resWmNullMime.statusCode).toBe(400);
        expect(resWmNullMime.message).toContain('desconocido');
      }

      // 4. Watermark asset physical file missing
      const nonExistentWmPath = path.join(tempDir, 'ghost_wm.png');
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: testAssetId,
          tenant_id: testTenantId,
          mime_type: 'image/png',
          current_version_id: 1,
          storage_path: testImagePath,
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: testWmAssetId,
          tenant_id: testTenantId,
          mime_type: 'image/png',
          storage_path: nonExistentWmPath,
        },
      ]);

      const resWmGhost = await createAssetWatermark(testTenantId, testAssetId, 1, {
        watermark_type: 'IMAGE',
        watermark_asset_id: testWmAssetId,
        position: 'CENTER',
        opacity: 0.5,
        rotation: 0,
      });
      expect(resWmGhost.success).toBe(false);
      if (!resWmGhost.success) {
        expect(resWmGhost.statusCode).toBe(404);
        expect(resWmGhost.message).toContain('no se encuentra en el almacenamiento');
      }
    });

    it('createAssetWatermark debe retornar 400 si la imagen está corrupta o excede 16MP', async () => {
      const corruptedPath = path.join(tempDir, 'corrupted_base.png');
      fs.writeFileSync(corruptedPath, 'CORRUPTED');

      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: testAssetId,
          tenant_id: testTenantId,
          mime_type: 'image/png',
          current_version_id: 1,
          storage_path: corruptedPath,
        },
      ]);

      const resCorrupt = await createAssetWatermark(testTenantId, testAssetId, 1, {
        watermark_type: 'TEXT',
        watermark_text: 'Test',
        position: 'BOTTOM_RIGHT',
        opacity: 0.5,
        rotation: 0,
      });
      expect(resCorrupt.success).toBe(false);
      if (!resCorrupt.success) {
        expect(resCorrupt.statusCode).toBe(400);
        expect(resCorrupt.message).toContain('No se pudieron leer las dimensiones');
      }

      const bigImg = path.join(tempDir, 'big_engine_base.png');
      await sharp({
        create: {
          width: 5000,
          height: 4000,
          channels: 3,
          background: { r: 50, g: 50, b: 50 },
        },
      })
        .png()
        .toFile(bigImg);

      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: testAssetId,
          tenant_id: testTenantId,
          mime_type: 'image/png',
          current_version_id: 1,
          storage_path: bigImg,
        },
      ]);

      const resBig = await createAssetWatermark(testTenantId, testAssetId, 1, {
        watermark_type: 'TEXT',
        watermark_text: 'Test',
        position: 'BOTTOM_RIGHT',
        opacity: 0.5,
        rotation: 0,
      });
      expect(resBig.success).toBe(false);
      if (!resBig.success) {
        expect(resBig.statusCode).toBe(400);
        expect(resBig.message).toContain('excede el límite máximo');
      }
    });

    it('createAssetWatermark debe crear derivada, sobreescribir previa en disco y despachar webhook', async () => {
      const oldWmPath = path.join(tempDir, 'old_watermark.webp');
      fs.writeFileSync(oldWmPath, 'OLD_WM_BYTES');

      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: testAssetId,
          tenant_id: testTenantId,
          mime_type: 'image/png',
          current_version_id: testVersionId,
          storage_path: testImagePath,
        },
      ]);

      vi.mocked(db.query).mockResolvedValueOnce([{ id: 60, output_derivative_path: oldWmPath }]);

      vi.mocked(db.query).mockResolvedValueOnce({ insertId: 70 });

      const result = await createAssetWatermark(testTenantId, testAssetId, testVersionId, {
        watermark_type: 'TEXT',
        watermark_text: '© Dreamtek Confidential',
        position: 'BOTTOM_RIGHT',
        opacity: 0.6,
        rotation: 0,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.statusCode).toBe(201);
        expect(result.watermark.id).toBe(70);
        expect(result.watermark.watermark_type).toBe('TEXT');
        expect(fs.existsSync(oldWmPath)).toBe(false);
        expect(fs.existsSync(result.watermark.output_derivative_path)).toBe(true);
      }

      expect(dispatchWebhookEvent).toHaveBeenCalledWith(
        testTenantId,
        'asset.updated',
        expect.objectContaining({
          event_type: 'IMAGE_WATERMARKED',
          watermark_id: 70,
          watermark_type: 'TEXT',
        }),
      );
    });

    it('createAssetWatermark debe soportar fallback a latest version para base y watermark asset', async () => {
      // Base asset fallback
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

      // Watermark asset fallback
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: testWmAssetId,
          tenant_id: testTenantId,
          mime_type: 'image/png',
          current_version_id: null,
          storage_path: null,
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([{ storage_path: testWmImagePath }]);

      vi.mocked(db.query).mockResolvedValueOnce([]); // no existing
      vi.mocked(db.query).mockResolvedValueOnce({ insertId: 71 });

      const result = await createAssetWatermark(testTenantId, testAssetId, 1, {
        watermark_type: 'IMAGE',
        watermark_asset_id: testWmAssetId,
        position: 'CENTER',
        opacity: 0.5,
        rotation: 0,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.watermark.id).toBe(71);
        expect(result.watermark.watermark_type).toBe('IMAGE');
      }

      // Base asset fallback query returns empty array
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

      const resEmptyBaseFb = await createAssetWatermark(testTenantId, testAssetId, 1, {
        watermark_type: 'TEXT',
        watermark_text: 'Test',
        position: 'CENTER',
        opacity: 0.5,
        rotation: 0,
      });
      expect(resEmptyBaseFb.success).toBe(false);
      if (!resEmptyBaseFb.success) {
        expect(resEmptyBaseFb.statusCode).toBe(404);
        expect(resEmptyBaseFb.message).toContain('no se encuentra en el almacenamiento');
      }

      // Watermark asset fallback query returns empty array
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: testAssetId,
          tenant_id: testTenantId,
          mime_type: 'image/png',
          current_version_id: 1,
          storage_path: testImagePath,
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: testWmAssetId,
          tenant_id: testTenantId,
          mime_type: 'image/png',
          current_version_id: null,
          storage_path: null,
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([]); // empty fallback for watermark

      const resEmptyWmFb = await createAssetWatermark(testTenantId, testAssetId, 1, {
        watermark_type: 'IMAGE',
        watermark_asset_id: testWmAssetId,
        position: 'CENTER',
        opacity: 0.5,
        rotation: 0,
      });
      expect(resEmptyWmFb.success).toBe(false);
      if (!resEmptyWmFb.success) {
        expect(resEmptyWmFb.statusCode).toBe(404);
        expect(resEmptyWmFb.message).toContain('no se encuentra en el almacenamiento');
      }
    });

    it('createAssetWatermark debe manejar error en unlinkSync de derivada previa sin fallar', async () => {
      const oldWmPath = path.join(tempDir, 'old_watermark_throw.webp');
      fs.writeFileSync(oldWmPath, 'OLD_WM_BYTES');

      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: testAssetId,
          tenant_id: testTenantId,
          mime_type: 'image/png',
          current_version_id: testVersionId,
          storage_path: testImagePath,
        },
      ]);

      vi.mocked(db.query).mockResolvedValueOnce([{ id: 60, output_derivative_path: oldWmPath }]);

      vi.mocked(db.query).mockResolvedValueOnce({ insertId: 75 });

      const unlinkSpy = vi.spyOn(fs, 'unlinkSync').mockImplementationOnce(() => {
        throw new Error('EPERM: operation not permitted');
      });

      const result = await createAssetWatermark(testTenantId, testAssetId, testVersionId, {
        watermark_type: 'TEXT',
        watermark_text: '© Dreamtek Throw Test',
        position: 'BOTTOM_RIGHT',
        opacity: 0.6,
        rotation: 0,
      });

      expect(result.success).toBe(true);
      unlinkSpy.mockRestore();
    });

    it('createAssetWatermark debe manejar derivada previa inexistente o con path nulo', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: testAssetId,
          tenant_id: testTenantId,
          mime_type: 'image/png',
          current_version_id: testVersionId,
          storage_path: testImagePath,
        },
      ]);

      const nonExistentOld = path.join(tempDir, 'ghost_prev_wm.webp');
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 61, output_derivative_path: nonExistentOld },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce({ insertId: 72 });

      const res = await createAssetWatermark(testTenantId, testAssetId, testVersionId, {
        watermark_type: 'TEXT',
        watermark_text: 'Test',
        position: 'CENTER',
        opacity: 0.5,
        rotation: 0,
      });

      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.watermark.id).toBe(72);
      }
    });

    it('listAssetWatermarks debe retornar lista paginada y filtrada', async () => {
      // 1. With filters (watermark_type and position)
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          watermark_type: 'TEXT',
          watermark_text: '© Dreamtek',
          watermark_asset_id: null,
          position: 'BOTTOM_RIGHT',
          opacity: 0.5,
          rotation: 0,
          output_derivative_path: path.join(tempDir, 'wm1.webp'),
          watermark_metadata: JSON.stringify({ watermark_type: 'TEXT' }),
          created_at: '2026-08-28T00:00:00Z',
        },
      ]);

      const itemsFiltered = await listAssetWatermarks(
        testTenantId,
        testAssetId,
        10,
        0,
        'TEXT',
        'BOTTOM_RIGHT',
      );

      expect(itemsFiltered).toHaveLength(1);
      expect(itemsFiltered[0].id).toBe(1);

      // 2. Without filters (defaults)
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 2,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          watermark_type: 'IMAGE',
          watermark_text: null,
          watermark_asset_id: 51,
          position: 'CENTER',
          opacity: 0.7,
          rotation: 45,
          output_derivative_path: path.join(tempDir, 'wm2.webp'),
          watermark_metadata: { watermark_type: 'IMAGE' },
          created_at: '2026-08-28T00:05:00Z',
        },
      ]);

      const itemsDefault = await listAssetWatermarks(testTenantId, testAssetId);
      expect(itemsDefault).toHaveLength(1);
      expect(itemsDefault[0].id).toBe(2);

      // 3. With watermark_type only
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 3,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          watermark_type: 'TEXT',
          watermark_text: 'Confidential',
          watermark_asset_id: null,
          position: 'TILED_PATTERN',
          opacity: 0.3,
          rotation: -30,
          output_derivative_path: path.join(tempDir, 'wm3.webp'),
          watermark_metadata: {},
          created_at: '2026-08-28T00:10:00Z',
        },
      ]);
      const itemsTypeOnly = await listAssetWatermarks(testTenantId, testAssetId, 50, 0, 'TEXT');
      expect(itemsTypeOnly).toHaveLength(1);

      // 4. With position only
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 4,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          watermark_type: 'IMAGE',
          watermark_text: null,
          watermark_asset_id: 52,
          position: 'TOP_LEFT',
          opacity: 0.6,
          rotation: 0,
          output_derivative_path: path.join(tempDir, 'wm4.webp'),
          watermark_metadata: {},
          created_at: '2026-08-28T00:15:00Z',
        },
      ]);
      const itemsPosOnly = await listAssetWatermarks(
        testTenantId,
        testAssetId,
        50,
        0,
        undefined,
        'TOP_LEFT',
      );
      expect(itemsPosOnly).toHaveLength(1);
    });

    it('getAssetWatermarkById debe retornar registro o null', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          watermark_type: 'TEXT',
          watermark_text: '© Dreamtek',
          watermark_asset_id: null,
          position: 'BOTTOM_RIGHT',
          opacity: 0.5,
          rotation: 0,
          output_derivative_path: path.join(tempDir, 'wm1.webp'),
          watermark_metadata: JSON.stringify({ watermark_type: 'TEXT' }),
          created_at: '2026-08-28T00:00:00Z',
        },
      ]);

      const item = await getAssetWatermarkById(testTenantId, testAssetId, 1);
      expect(item).not.toBeNull();
      expect(item?.watermark_type).toBe('TEXT');

      // Parsed object metadata and watermark_asset_id
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 2,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          watermark_type: 'IMAGE',
          watermark_text: null,
          watermark_asset_id: 51,
          position: 'CENTER',
          opacity: 0.7,
          rotation: 0,
          output_derivative_path: null,
          watermark_metadata: { watermark_type: 'IMAGE' },
          created_at: '2026-08-28T00:00:00Z',
        },
      ]);
      const itemParsed = await getAssetWatermarkById(testTenantId, testAssetId, 2);
      expect(itemParsed?.watermark_type).toBe('IMAGE');
      expect(itemParsed?.watermark_asset_id).toBe(51);

      vi.mocked(db.query).mockResolvedValueOnce([]);
      const notFound = await getAssetWatermarkById(testTenantId, testAssetId, 999);
      expect(notFound).toBeNull();
    });

    it('deleteAssetWatermark debe eliminar registro, archivo físico y despachar webhook', async () => {
      // 1. Found with physical file
      const wmToDelete = path.join(tempDir, 'wm_to_delete.webp');
      fs.writeFileSync(wmToDelete, 'WM_BYTES');

      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 50,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          watermark_type: 'TEXT',
          watermark_text: 'Test',
          watermark_asset_id: null,
          position: 'CENTER',
          opacity: 0.5,
          rotation: 0,
          output_derivative_path: wmToDelete,
          watermark_metadata: {},
          created_at: '2026-08-28T00:00:00Z',
        },
      ]);

      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 });

      const deleted = await deleteAssetWatermark(testTenantId, testAssetId, 50);
      expect(deleted).toBe(true);
      expect(fs.existsSync(wmToDelete)).toBe(false);

      expect(dispatchWebhookEvent).toHaveBeenCalledWith(
        testTenantId,
        'asset.updated',
        expect.objectContaining({
          event_type: 'WATERMARK_DELETED',
          watermark_id: 50,
        }),
      );

      // 2. Found with non-existent disk file
      const nonExistentPath = path.join(tempDir, 'non_existent_wm.webp');
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 51,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          watermark_type: 'TEXT',
          watermark_text: 'Test',
          watermark_asset_id: null,
          position: 'CENTER',
          opacity: 0.5,
          rotation: 0,
          output_derivative_path: nonExistentPath,
          watermark_metadata: {},
          created_at: '2026-08-28T00:00:00Z',
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 });
      const deletedNoDisk = await deleteAssetWatermark(testTenantId, testAssetId, 51);
      expect(deletedNoDisk).toBe(true);

      // 3. Found without output_derivative_path (null)
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 52,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          watermark_type: 'TEXT',
          watermark_text: 'Test',
          watermark_asset_id: null,
          position: 'CENTER',
          opacity: 0.5,
          rotation: 0,
          output_derivative_path: null,
          watermark_metadata: {},
          created_at: '2026-08-28T00:00:00Z',
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 });
      const deletedNoPath = await deleteAssetWatermark(testTenantId, testAssetId, 52);
      expect(deletedNoPath).toBe(true);

      // 4. Return false if not found
      vi.mocked(db.query).mockResolvedValueOnce([]);
      const deletedNotFound = await deleteAssetWatermark(testTenantId, testAssetId, 999);
      expect(deletedNotFound).toBe(false);
    });
  });

  describe('5. Endpoints REST Integration Tests (assets.ts)', () => {
    describe('POST /api/v1/assets/:id/watermark', () => {
      it('debe retornar 400 si el ID de activo es inválido', async () => {
        const res = await request(app)
          .post('/api/v1/assets/0/watermark')
          .send({ watermark_type: 'TEXT', watermark_text: 'Test' });
        expect(res.status).toBe(400);
      });

      it('debe retornar 400 si el cuerpo tiene campos inválidos', async () => {
        const res = await request(app)
          .post('/api/v1/assets/50/watermark')
          .send({ watermark_type: 'INVALID' });
        expect(res.status).toBe(400);
      });

      it('debe retornar 404 si el activo no existe en el tenant', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([]);

        const res = await request(app)
          .post('/api/v1/assets/50/watermark')
          .send({ watermark_type: 'TEXT', watermark_text: 'Test' });

        expect(res.status).toBe(404);
        expect(res.body.message).toContain('no encontrado');
      });

      it('debe retornar 403 si la política ACL deniega EDIT', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([
          { id: testAssetId, current_version_id: 1, mime_type: 'image/png' },
        ]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({
          allowed: false,
          reason: 'Insufficient permissions',
        });

        const res = await request(app)
          .post('/api/v1/assets/50/watermark')
          .send({ watermark_type: 'TEXT', watermark_text: 'Test' });

        expect(res.status).toBe(403);
      });

      it('debe retornar 400 o 404 si createAssetWatermark falla', async () => {
        // 400 branch (non-raster SVG)
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
          .post('/api/v1/assets/50/watermark')
          .send({ watermark_type: 'TEXT', watermark_text: 'Test' });
        expect(res400.status).toBe(400);
        expect(res400.body.error).toBe('Bad Request');

        // 404 branch (asset not found in engine)
        vi.mocked(db.query).mockResolvedValueOnce([
          { id: testAssetId, current_version_id: 1, mime_type: 'image/png' },
        ]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([]);

        const res404 = await request(app)
          .post('/api/v1/assets/50/watermark')
          .send({ watermark_type: 'TEXT', watermark_text: 'Test' });
        expect(res404.status).toBe(404);
        expect(res404.body.error).toBe('Not Found');
      });

      it('debe retornar 201 Created y data en caso exitoso', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([
          { id: testAssetId, current_version_id: null, mime_type: 'image/png' },
        ]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });

        // createAssetWatermark queries
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
        vi.mocked(db.query).mockResolvedValueOnce({ insertId: 77 }); // insert

        const res = await request(app).post('/api/v1/assets/50/watermark').send({
          watermark_type: 'TEXT',
          watermark_text: '© Dreamtek',
          position: 'BOTTOM_RIGHT',
        });

        expect(res.status).toBe(201);
        expect(res.body.data.id).toBe(77);
        expect(res.body.data.watermark_type).toBe('TEXT');
      });
    });

    describe('GET /api/v1/assets/:id/watermarks', () => {
      it('debe retornar 400 si el ID de activo es inválido', async () => {
        const res = await request(app).get('/api/v1/assets/0/watermarks');
        expect(res.status).toBe(400);
      });

      it('debe retornar 404 si el activo no existe', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([]);
        const res = await request(app).get('/api/v1/assets/50/watermarks');
        expect(res.status).toBe(404);
      });

      it('debe retornar 403 si ACL VIEW es denegado', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([{ id: testAssetId }]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: false });
        const res = await request(app).get('/api/v1/assets/50/watermarks');
        expect(res.status).toBe(403);
      });

      it('debe retornar 200 OK con la lista de derivadas con marca de agua (con y sin query params)', async () => {
        // With query params
        vi.mocked(db.query).mockResolvedValueOnce([{ id: testAssetId }]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([]); // empty list

        const resWithQuery = await request(app).get(
          '/api/v1/assets/50/watermarks?watermark_type=TEXT&position=CENTER&limit=10&offset=5',
        );
        expect(resWithQuery.status).toBe(200);
        expect(resWithQuery.body.data).toEqual([]);

        // Without query params (defaults)
        vi.mocked(db.query).mockResolvedValueOnce([{ id: testAssetId }]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([]);

        const resWithoutQuery = await request(app).get('/api/v1/assets/50/watermarks');
        expect(resWithoutQuery.status).toBe(200);
        expect(resWithoutQuery.body.data).toEqual([]);
      });
    });

    describe('GET /api/v1/assets/:id/watermarks/:watermarkId', () => {
      it('debe retornar 400 si los IDs son inválidos', async () => {
        const res1 = await request(app).get('/api/v1/assets/0/watermarks/1');
        expect(res1.status).toBe(400);

        const res2 = await request(app).get('/api/v1/assets/50/watermarks/0');
        expect(res2.status).toBe(400);
      });

      it('debe retornar 403 si ACL VIEW es denegado', async () => {
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: false });
        const res = await request(app).get('/api/v1/assets/50/watermarks/1');
        expect(res.status).toBe(403);
      });

      it('debe retornar 404 si la derivada con marca de agua no existe', async () => {
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([]);
        const res = await request(app).get('/api/v1/assets/50/watermarks/999');
        expect(res.status).toBe(404);
      });

      it('debe retornar 200 OK con el detalle de la derivada con marca de agua', async () => {
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([
          {
            id: 1,
            tenant_id: testTenantId,
            asset_id: testAssetId,
            version_id: 1,
            watermark_type: 'TEXT',
            watermark_text: '© Dreamtek',
            watermark_asset_id: null,
            position: 'BOTTOM_RIGHT',
            opacity: 0.5,
            rotation: 0,
            output_derivative_path: path.join(tempDir, 'wm1.webp'),
            watermark_metadata: {},
            created_at: '2026-08-28T00:00:00Z',
          },
        ]);
        const res = await request(app).get('/api/v1/assets/50/watermarks/1');
        expect(res.status).toBe(200);
        expect(res.body.data.id).toBe(1);
      });
    });

    describe('DELETE /api/v1/assets/:id/watermarks/:watermarkId', () => {
      it('debe retornar 400 si los IDs son inválidos', async () => {
        const res1 = await request(app).delete('/api/v1/assets/0/watermarks/1');
        expect(res1.status).toBe(400);

        const res2 = await request(app).delete('/api/v1/assets/50/watermarks/0');
        expect(res2.status).toBe(400);
      });

      it('debe retornar 403 si ACL EDIT es denegado', async () => {
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: false });
        const res = await request(app).delete('/api/v1/assets/50/watermarks/1');
        expect(res.status).toBe(403);
      });

      it('debe retornar 404 si la derivada con marca de agua no existe', async () => {
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([]); // getAssetWatermarkById
        const res = await request(app).delete('/api/v1/assets/50/watermarks/999');
        expect(res.status).toBe(404);
      });

      it('debe retornar 200 OK y registrar evento de seguridad en caso exitoso', async () => {
        const wmToDelete = path.join(tempDir, 'wm_to_del.webp');
        fs.writeFileSync(wmToDelete, 'BYTES');

        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([
          {
            id: 1,
            tenant_id: testTenantId,
            asset_id: testAssetId,
            version_id: 1,
            watermark_type: 'TEXT',
            watermark_text: '© Dreamtek',
            watermark_asset_id: null,
            position: 'BOTTOM_RIGHT',
            opacity: 0.5,
            rotation: 0,
            output_derivative_path: wmToDelete,
            watermark_metadata: {},
            created_at: '2026-08-28T00:00:00Z',
          },
        ]);
        vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 });

        const res = await request(app).delete('/api/v1/assets/50/watermarks/1');
        expect(res.status).toBe(200);
        expect(res.body.message).toContain('eliminada exitosamente');
      });

      it('debe manejar excepciones inesperadas con status 500', async () => {
        vi.mocked(evaluateAclPermission).mockRejectedValueOnce(
          new Error('Unexpected Delete Error'),
        );
        const res = await request(app).delete('/api/v1/assets/50/watermarks/1');
        expect(res.status).toBe(500);
        expect(res.body.error).toBe('Internal Server Error');
      });
    });

    describe('500 Error Handlers for GET/POST routes', () => {
      it('POST /watermark debe manejar errores 500', async () => {
        vi.mocked(db.query).mockRejectedValueOnce(new Error('DB Error'));
        const res = await request(app)
          .post('/api/v1/assets/50/watermark')
          .send({ watermark_type: 'TEXT', watermark_text: 'Test' });
        expect(res.status).toBe(500);
        expect(res.body.error).toBe('Internal Server Error');
      });

      it('GET /watermarks debe manejar errores 500', async () => {
        vi.mocked(db.query).mockRejectedValueOnce(new Error('DB Error'));
        const res = await request(app).get('/api/v1/assets/50/watermarks');
        expect(res.status).toBe(500);
        expect(res.body.error).toBe('Internal Server Error');
      });

      it('GET /watermarks/:id debe manejar errores 500', async () => {
        vi.mocked(evaluateAclPermission).mockRejectedValueOnce(new Error('ACL Error'));
        const res = await request(app).get('/api/v1/assets/50/watermarks/1');
        expect(res.status).toBe(500);
        expect(res.body.error).toBe('Internal Server Error');
      });
    });
  });

  describe('6. Rate Limiting Tests (watermarkRateLimiter)', () => {
    it('watermarkRateLimiter debe estar definido y configurado', () => {
      expect(watermarkRateLimiter).toBeDefined();
    });

    it('watermarkRateLimiter debe responder con 429 cuando se excede el límite de 30 solicitudes', async () => {
      const rateLimitApp = express();
      rateLimitApp.set('trust proxy', true);
      rateLimitApp.use(watermarkRateLimiter);
      rateLimitApp.get('/test-wm-limit', (_req, res) => {
        res.status(200).json({ ok: true });
      });

      const isolatedIp = '198.51.100.99';

      // 30 requests allowed
      for (let i = 0; i < 30; i++) {
        const res = await request(rateLimitApp)
          .get('/test-wm-limit')
          .set('X-Forwarded-For', isolatedIp);
        expect(res.status).toBe(200);
      }

      // 31st request rejected with 429
      const res429 = await request(rateLimitApp)
        .get('/test-wm-limit')
        .set('X-Forwarded-For', isolatedIp);
      expect(res429.status).toBe(429);
      expect(res429.body.error).toBe('Too Many Requests');
      expect(res429.body.message).toContain('Límite de operaciones de marca de agua');
    });
  });
});
