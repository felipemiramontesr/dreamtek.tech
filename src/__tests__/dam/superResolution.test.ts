import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express, { Express, Request, Response, NextFunction } from 'express';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import * as db from '../../../server/src/db';
import { STORAGE_ROOT } from '../../../server/src/utils/storage';
import { dispatchWebhookEvent } from '../../../server/src/utils/webhookDispatcher';
import { evaluateAclPermission } from '../../../server/src/utils/acl';
import { superResolutionRateLimiter } from '../../../server/src/middleware/rateLimiter';
import {
  createSuperResolutionBodySchema,
  listSuperResolutionsQuerySchema,
  superResolutionParamSchema,
  ScaleFactor,
  UpscaleAlgorithm,
} from '../../../server/src/schemas/superResolution.schema';
import {
  isRasterImage,
  generateSuperResolutionDerivative,
  createAssetSuperResolution,
  listAssetSuperResolutions,
  getAssetSuperResolutionById,
  deleteAssetSuperResolution,
} from '../../../server/src/utils/superResolutionEngine';
import assetsRouter from '../../../server/src/routes/assets';

// Mock dependencies
vi.mock('../../../server/src/db', () => ({
  query: vi.fn(),
  getConnection: vi.fn(),
}));

vi.mock('../../../server/src/utils/webhookDispatcher', () => ({
  dispatchWebhookEvent: vi.fn(),
}));

vi.mock('../../../server/src/utils/acl', () => ({
  evaluateAclPermission: vi.fn(),
}));

vi.mock('../../../server/src/middleware/auth', () => ({
  requireAuth: (
    req: Request & { user?: Record<string, unknown> },
    _res: Response,
    next: NextFunction,
  ) => {
    req.user = { userId: 1, tenantId: 100, role: 'ADMIN', email: 'admin@dreamtek.tech' };
    next();
  },
}));

vi.mock('../../../server/src/middleware/auditLogger', () => ({
  logSecurityEvent: vi.fn().mockResolvedValue(undefined),
}));

describe('FC 028 — DAM AI Image Super-Resolution & Smart Upscaling Suite', () => {
  const testTenantId = 100;
  const testAssetId = 42;
  const testVersionId = 1;
  const tempDir = path.join(STORAGE_ROOT, 'derivatives', `tenant_${testTenantId}`);
  const testImagePath = path.join(tempDir, 'test_input.png');

  let app: Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(db.query).mockReset();
    vi.mocked(evaluateAclPermission).mockReset();
    fs.mkdirSync(tempDir, { recursive: true });

    // Create a 100x100 RGB image for testing
    await sharp({
      create: {
        width: 100,
        height: 100,
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
      // Ignore cleanup error
    }
  });

  describe('1. Zod Schemas Validation (superResolution.schema.ts)', () => {
    it('createSuperResolutionBodySchema debe aceptar valores válidos y asignar defaults', () => {
      const defaultParsed = createSuperResolutionBodySchema.parse({});
      expect(defaultParsed.scale_factor).toBe('2x');
      expect(defaultParsed.algorithm).toBe('LANCZOS3_SHARP');
      expect(defaultParsed.denoise_level).toBe(10);
      expect(defaultParsed.sharpness_boost).toBe(20);

      const customParsed = createSuperResolutionBodySchema.parse({
        scale_factor: '4x',
        algorithm: 'BICUBIC_SMOOTH',
        denoise_level: 30,
        sharpness_boost: 40,
      });
      expect(customParsed.scale_factor).toBe('4x');
      expect(customParsed.algorithm).toBe('BICUBIC_SMOOTH');
      expect(customParsed.denoise_level).toBe(30);
      expect(customParsed.sharpness_boost).toBe(40);
    });

    it('createSuperResolutionBodySchema debe rechazar valores fuera de rango o factores inválidos', () => {
      expect(() =>
        createSuperResolutionBodySchema.parse({
          scale_factor: '8x' as unknown as ScaleFactor,
        }),
      ).toThrow();

      expect(() =>
        createSuperResolutionBodySchema.parse({
          algorithm: 'NEAREST_NEIGHBOR' as unknown as UpscaleAlgorithm,
        }),
      ).toThrow();

      expect(() =>
        createSuperResolutionBodySchema.parse({
          denoise_level: -5,
        }),
      ).toThrow();

      expect(() =>
        createSuperResolutionBodySchema.parse({
          denoise_level: 100,
        }),
      ).toThrow();

      expect(() =>
        createSuperResolutionBodySchema.parse({
          sharpness_boost: -1,
        }),
      ).toThrow();

      expect(() =>
        createSuperResolutionBodySchema.parse({
          sharpness_boost: 60,
        }),
      ).toThrow();
    });

    it('listSuperResolutionsQuerySchema debe parsear y validar query params', () => {
      const parsedDefault = listSuperResolutionsQuerySchema.parse({});
      expect(parsedDefault.limit).toBe(50);
      expect(parsedDefault.offset).toBe(0);
      expect(parsedDefault.scale_factor).toBeUndefined();
      expect(parsedDefault.algorithm).toBeUndefined();

      const parsedCustom = listSuperResolutionsQuerySchema.parse({
        limit: '25',
        offset: '10',
        scale_factor: '4x',
        algorithm: 'EDGES_ENHANCED',
      });
      expect(parsedCustom.limit).toBe(25);
      expect(parsedCustom.offset).toBe(10);
      expect(parsedCustom.scale_factor).toBe('4x');
      expect(parsedCustom.algorithm).toBe('EDGES_ENHANCED');
    });

    it('superResolutionParamSchema debe validar parámetros id y upscaleId', () => {
      const valid = superResolutionParamSchema.parse({ id: '42', upscaleId: '7' });
      expect(valid.id).toBe(42);
      expect(valid.upscaleId).toBe(7);

      expect(() => superResolutionParamSchema.parse({ id: '0', upscaleId: '7' })).toThrow();
      expect(() => superResolutionParamSchema.parse({ id: '42', upscaleId: '-1' })).toThrow();
    });
  });

  describe('2. Helpers & Raster Validation (superResolutionEngine.ts)', () => {
    it('isRasterImage debe identificar formatos raster válidos y rechazar vectoriales/nulos', () => {
      expect(isRasterImage('image/jpeg')).toBe(true);
      expect(isRasterImage('image/png')).toBe(true);
      expect(isRasterImage('image/webp')).toBe(true);
      expect(isRasterImage('image/gif')).toBe(true);

      expect(isRasterImage('image/svg+xml')).toBe(false);
      expect(isRasterImage('application/pdf')).toBe(false);
      expect(isRasterImage('video/mp4')).toBe(false);
      expect(isRasterImage('')).toBe(false);
      expect(isRasterImage(null as unknown as string)).toBe(false);
    });
  });

  describe('3. Derivative Generation Pipeline with Sharp', () => {
    it('generateSuperResolutionDerivative debe generar derivada 2x con LANCZOS3_SHARP', async () => {
      const result = await generateSuperResolutionDerivative(
        testTenantId,
        testAssetId,
        testVersionId,
        '2x',
        'LANCZOS3_SHARP',
        15,
        25,
        testImagePath,
      );

      expect(result.derivativePath).toContain('upscale_42_v1_2x_lanczos3_sharp');
      expect(fs.existsSync(result.derivativePath)).toBe(true);
      expect(result.outputWidth).toBe(200);
      expect(result.outputHeight).toBe(200);
      expect(result.metadata.scale_factor).toBe('2x');
      expect(result.metadata.multiplier).toBe(2);
      expect(result.metadata.algorithm).toBe('LANCZOS3_SHARP');

      const meta = await sharp(result.derivativePath).metadata();
      expect(meta.width).toBe(200);
      expect(meta.height).toBe(200);
      expect(meta.format).toBe('webp');
    });

    it('generateSuperResolutionDerivative debe generar derivada 4x con BICUBIC_SMOOTH', async () => {
      const result = await generateSuperResolutionDerivative(
        testTenantId,
        testAssetId,
        testVersionId,
        '4x',
        'BICUBIC_SMOOTH',
        20,
        10,
        testImagePath,
      );

      expect(result.derivativePath).toContain('upscale_42_v1_4x_bicubic_smooth');
      expect(fs.existsSync(result.derivativePath)).toBe(true);
      expect(result.outputWidth).toBe(400);
      expect(result.outputHeight).toBe(400);
      expect(result.metadata.scale_factor).toBe('4x');
      expect(result.metadata.multiplier).toBe(4);
    });

    it('generateSuperResolutionDerivative debe generar derivada 2x con LANCZOS3_SHARP sin sharpness ni denoise', async () => {
      const result = await generateSuperResolutionDerivative(
        testTenantId,
        testAssetId,
        testVersionId,
        '2x',
        'LANCZOS3_SHARP',
        0,
        0,
        testImagePath,
      );

      expect(result.derivativePath).toContain('upscale_42_v1_2x_lanczos3_sharp');
      expect(fs.existsSync(result.derivativePath)).toBe(true);
      expect(result.outputWidth).toBe(200);
      expect(result.outputHeight).toBe(200);
    });

    it('generateSuperResolutionDerivative debe generar derivada 4x con BICUBIC_SMOOTH sin sharpness ni denoise', async () => {
      const result = await generateSuperResolutionDerivative(
        testTenantId,
        testAssetId,
        testVersionId,
        '4x',
        'BICUBIC_SMOOTH',
        0,
        0,
        testImagePath,
      );

      expect(result.derivativePath).toContain('upscale_42_v1_4x_bicubic_smooth');
      expect(fs.existsSync(result.derivativePath)).toBe(true);
      expect(result.outputWidth).toBe(400);
      expect(result.outputHeight).toBe(400);
    });

    it('generateSuperResolutionDerivative debe generar derivada 2x con EDGES_ENHANCED sin sharpness ni denoise', async () => {
      const result = await generateSuperResolutionDerivative(
        testTenantId,
        testAssetId,
        testVersionId,
        '2x',
        'EDGES_ENHANCED',
        0,
        0,
        testImagePath,
      );

      expect(result.derivativePath).toContain('upscale_42_v1_2x_edges_enhanced');
      expect(fs.existsSync(result.derivativePath)).toBe(true);
      expect(result.outputWidth).toBe(200);
      expect(result.outputHeight).toBe(200);
    });

    it('generateSuperResolutionDerivative debe generar derivada 2x con EDGES_ENHANCED con sharpness custom', async () => {
      const result = await generateSuperResolutionDerivative(
        testTenantId,
        testAssetId,
        testVersionId,
        '2x',
        'EDGES_ENHANCED',
        0,
        35,
        testImagePath,
      );

      expect(result.derivativePath).toContain('upscale_42_v1_2x_edges_enhanced');
      expect(fs.existsSync(result.derivativePath)).toBe(true);
      expect(result.outputWidth).toBe(200);
      expect(result.outputHeight).toBe(200);
    });

    it('generateSuperResolutionDerivative debe fallar si la resolución escalada excede 16MP', async () => {
      const bigImagePath = path.join(tempDir, 'big_image.png');
      await sharp({
        create: {
          width: 3000,
          height: 3000,
          channels: 3,
          background: { r: 100, g: 100, b: 100 },
        },
      })
        .png()
        .toFile(bigImagePath);

      // 3000x3000 * 2x = 6000x6000 = 36MP > 16MP
      await expect(
        generateSuperResolutionDerivative(
          testTenantId,
          testAssetId,
          testVersionId,
          '2x',
          'LANCZOS3_SHARP',
          10,
          20,
          bigImagePath,
        ),
      ).rejects.toThrow('excede el límite máximo permitido de 16 Megapíxeles');
    });
  });

  describe('4. Engine Service Functions (superResolutionEngine.ts)', () => {
    it('createAssetSuperResolution debe retornar 404 si el activo no existe en el tenant', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const result = await createAssetSuperResolution(testTenantId, testAssetId, testVersionId, {
        scale_factor: '2x',
        algorithm: 'LANCZOS3_SHARP',
        denoise_level: 10,
        sharpness_boost: 20,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.statusCode).toBe(404);
        expect(result.message).toContain('no encontrado');
      }
    });

    it('createAssetSuperResolution debe retornar 400 si el MIME no es raster', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: testAssetId,
          tenant_id: testTenantId,
          mime_type: 'image/svg+xml',
          current_version_id: testVersionId,
          storage_path: testImagePath,
        },
      ]);

      const result = await createAssetSuperResolution(testTenantId, testAssetId, testVersionId, {
        scale_factor: '2x',
        algorithm: 'LANCZOS3_SHARP',
        denoise_level: 10,
        sharpness_boost: 20,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.statusCode).toBe(400);
        expect(result.message).toContain('Solo se admiten formatos raster');
      }
    });

    it('createAssetSuperResolution debe retornar 404 si el archivo físico no existe', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: testAssetId,
          tenant_id: testTenantId,
          mime_type: 'image/png',
          current_version_id: testVersionId,
          storage_path: path.join(tempDir, 'non_existent_file.png'),
        },
      ]);

      const result = await createAssetSuperResolution(testTenantId, testAssetId, testVersionId, {
        scale_factor: '2x',
        algorithm: 'LANCZOS3_SHARP',
        denoise_level: 10,
        sharpness_boost: 20,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.statusCode).toBe(404);
        expect(result.message).toContain('no se encuentra en el almacenamiento');
      }
    });

    it('createAssetSuperResolution debe retornar 400 si falla al leer dimensiones con sharp', async () => {
      const corruptedPath = path.join(tempDir, 'corrupted.png');
      fs.writeFileSync(corruptedPath, 'NOT AN IMAGE CONTENT');

      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: testAssetId,
          tenant_id: testTenantId,
          mime_type: 'image/png',
          current_version_id: testVersionId,
          storage_path: corruptedPath,
        },
      ]);

      const result = await createAssetSuperResolution(testTenantId, testAssetId, testVersionId, {
        scale_factor: '2x',
        algorithm: 'LANCZOS3_SHARP',
        denoise_level: 10,
        sharpness_boost: 20,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.statusCode).toBe(400);
        expect(result.message).toContain('No se pudieron determinar las dimensiones');
      }
    });

    it('createAssetSuperResolution debe retornar 400 si la resolución escalada excede 16MP', async () => {
      const bigImagePath = path.join(tempDir, 'big_image.png');
      await sharp({
        create: {
          width: 3000,
          height: 3000,
          channels: 3,
          background: { r: 100, g: 100, b: 100 },
        },
      })
        .png()
        .toFile(bigImagePath);

      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: testAssetId,
          tenant_id: testTenantId,
          mime_type: 'image/png',
          current_version_id: testVersionId,
          storage_path: bigImagePath,
        },
      ]);

      const result = await createAssetSuperResolution(testTenantId, testAssetId, testVersionId, {
        scale_factor: '2x',
        algorithm: 'LANCZOS3_SHARP',
        denoise_level: 10,
        sharpness_boost: 20,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.statusCode).toBe(400);
        expect(result.message).toContain('excede el límite máximo permitido de 16 Megapíxeles');
      }
    });

    it('createAssetSuperResolution debe crear derivada, sobreescribir previa en disco y despachar webhook', async () => {
      const oldDerivativePath = path.join(tempDir, 'old_upscale.webp');
      fs.writeFileSync(oldDerivativePath, 'OLD_DERIVATIVE_CONTENT');

      // 1. Asset query
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: testAssetId,
          tenant_id: testTenantId,
          mime_type: 'image/png',
          current_version_id: testVersionId,
          storage_path: testImagePath,
        },
      ]);

      // 2. Existing derivative query
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 77, output_derivative_path: oldDerivativePath },
      ]);

      // 3. Upsert query
      vi.mocked(db.query).mockResolvedValueOnce({ insertId: 88 });

      const result = await createAssetSuperResolution(testTenantId, testAssetId, testVersionId, {
        scale_factor: '2x',
        algorithm: 'LANCZOS3_SHARP',
        denoise_level: 10,
        sharpness_boost: 20,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.statusCode).toBe(201);
        expect(result.upscale.id).toBe(88);
        expect(result.upscale.scale_factor).toBe('2x');
        expect(fs.existsSync(oldDerivativePath)).toBe(false);
        expect(fs.existsSync(result.upscale.output_derivative_path)).toBe(true);
      }

      expect(dispatchWebhookEvent).toHaveBeenCalledWith(
        testTenantId,
        'asset.updated',
        expect.objectContaining({
          event_type: 'IMAGE_UPSCALED',
          upscale_id: 88,
          scale_factor: '2x',
        }),
      );
    });

    it('createAssetSuperResolution debe hacer fallback a latest version si storage_path es nulo', async () => {
      // 1. Asset query without storage_path
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: testAssetId,
          tenant_id: testTenantId,
          mime_type: 'image/png',
          current_version_id: null,
          storage_path: null,
        },
      ]);

      // 2. Fallback version query
      vi.mocked(db.query).mockResolvedValueOnce([{ storage_path: testImagePath }]);

      // 3. Existing derivative query (none)
      vi.mocked(db.query).mockResolvedValueOnce([]);

      // 4. Upsert query
      vi.mocked(db.query).mockResolvedValueOnce({ insertId: 89 });

      const result = await createAssetSuperResolution(testTenantId, testAssetId, 1, {
        scale_factor: '4x',
        algorithm: 'BICUBIC_SMOOTH',
        denoise_level: 20,
        sharpness_boost: 10,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.upscale.id).toBe(89);
        expect(result.upscale.scale_factor).toBe('4x');
      }
    });

    it('createAssetSuperResolution debe retornar 404 si storage_path y fallbackVersion son nulos', async () => {
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

      const result = await createAssetSuperResolution(testTenantId, testAssetId, 1, {
        scale_factor: '2x',
        algorithm: 'LANCZOS3_SHARP',
        denoise_level: 10,
        sharpness_boost: 20,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.statusCode).toBe(404);
        expect(result.message).toContain('no se encuentra en el almacenamiento');
      }
    });

    it('createAssetSuperResolution debe manejar derivada previa que no existe en disco', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: testAssetId,
          tenant_id: testTenantId,
          mime_type: 'image/png',
          current_version_id: testVersionId,
          storage_path: testImagePath,
        },
      ]);
      const nonExistentOldPath = path.join(tempDir, 'ghost_upscale.webp');
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 78, output_derivative_path: nonExistentOldPath },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce({ insertId: 90 });

      const result = await createAssetSuperResolution(testTenantId, testAssetId, testVersionId, {
        scale_factor: '2x',
        algorithm: 'EDGES_ENHANCED',
        denoise_level: 0,
        sharpness_boost: 10,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.upscale.id).toBe(90);
      }
    });

    it('listAssetSuperResolutions debe retornar lista paginada y filtrada', async () => {
      // 1. With filters
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          scale_factor: '2x',
          algorithm: 'LANCZOS3_SHARP',
          denoise_level: 10,
          sharpness_boost: 20,
          output_width: 200,
          output_height: 200,
          output_derivative_path: path.join(tempDir, 'upscale1.webp'),
          upscale_metadata: JSON.stringify({ scale_factor: '2x' }),
          created_at: '2026-08-27T10:00:00Z',
        },
      ]);

      const itemsFiltered = await listAssetSuperResolutions(
        testTenantId,
        testAssetId,
        10,
        0,
        '2x',
        'LANCZOS3_SHARP',
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
          scale_factor: '4x',
          algorithm: 'BICUBIC_SMOOTH',
          denoise_level: 15,
          sharpness_boost: 25,
          output_width: 400,
          output_height: 400,
          output_derivative_path: path.join(tempDir, 'upscale2.webp'),
          upscale_metadata: { scale_factor: '4x' },
          created_at: '2026-08-27T10:05:00Z',
        },
      ]);

      // 3. With scaleFactor only
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 3,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          scale_factor: '2x',
          algorithm: 'EDGES_ENHANCED',
          denoise_level: 5,
          sharpness_boost: 15,
          output_width: 200,
          output_height: 200,
          output_derivative_path: path.join(tempDir, 'upscale3.webp'),
          upscale_metadata: { scale_factor: '2x' },
          created_at: '2026-08-27T10:10:00Z',
        },
      ]);
      const itemsScaleOnly = await listAssetSuperResolutions(
        testTenantId,
        testAssetId,
        50,
        0,
        '2x',
      );
      expect(itemsScaleOnly).toHaveLength(1);

      // 4. With algorithm only
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 4,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          scale_factor: '4x',
          algorithm: 'BICUBIC_SMOOTH',
          denoise_level: 5,
          sharpness_boost: 15,
          output_width: 400,
          output_height: 400,
          output_derivative_path: path.join(tempDir, 'upscale4.webp'),
          upscale_metadata: { scale_factor: '4x' },
          created_at: '2026-08-27T10:15:00Z',
        },
      ]);
      const itemsAlgoOnly = await listAssetSuperResolutions(
        testTenantId,
        testAssetId,
        50,
        0,
        undefined,
        'BICUBIC_SMOOTH',
      );
      expect(itemsAlgoOnly).toHaveLength(1);
    });

    it('getAssetSuperResolutionById debe retornar registro o null', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          scale_factor: '2x',
          algorithm: 'LANCZOS3_SHARP',
          denoise_level: 10,
          sharpness_boost: 20,
          output_width: 200,
          output_height: 200,
          output_derivative_path: path.join(tempDir, 'upscale1.webp'),
          upscale_metadata: JSON.stringify({ scale_factor: '2x' }),
          created_at: '2026-08-27T10:00:00Z',
        },
      ]);

      const item = await getAssetSuperResolutionById(testTenantId, testAssetId, 1);
      expect(item).not.toBeNull();
      expect(item?.scale_factor).toBe('2x');

      // Test with parsed object fields
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 2,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          scale_factor: '4x',
          algorithm: 'EDGES_ENHANCED',
          denoise_level: 10,
          sharpness_boost: 20,
          output_width: 400,
          output_height: 400,
          output_derivative_path: null,
          upscale_metadata: { scale_factor: '4x' },
          created_at: '2026-08-27T10:00:00Z',
        },
      ]);
      const itemParsed = await getAssetSuperResolutionById(testTenantId, testAssetId, 2);
      expect(itemParsed?.scale_factor).toBe('4x');

      vi.mocked(db.query).mockResolvedValueOnce([]);
      const notFound = await getAssetSuperResolutionById(testTenantId, testAssetId, 999);
      expect(notFound).toBeNull();
    });

    it('deleteAssetSuperResolution debe eliminar registro, archivo físico y despachar webhook', async () => {
      // 1. Found with physical file
      const derivativeToDelete = path.join(tempDir, 'upscale_to_delete.webp');
      fs.writeFileSync(derivativeToDelete, 'DERIVATIVE_BYTES');

      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 55,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          scale_factor: '2x',
          algorithm: 'LANCZOS3_SHARP',
          denoise_level: 10,
          sharpness_boost: 20,
          output_width: 200,
          output_height: 200,
          output_derivative_path: derivativeToDelete,
          upscale_metadata: {},
          created_at: '2026-08-27T10:00:00Z',
        },
      ]);

      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 });

      const deleted = await deleteAssetSuperResolution(testTenantId, testAssetId, 55);
      expect(deleted).toBe(true);
      expect(fs.existsSync(derivativeToDelete)).toBe(false);

      expect(dispatchWebhookEvent).toHaveBeenCalledWith(
        testTenantId,
        'asset.updated',
        expect.objectContaining({
          event_type: 'UPSCALING_DELETED',
          upscale_id: 55,
        }),
      );

      // 2. Found with non-existent disk file
      const nonExistentPath = path.join(tempDir, 'non_existent_upscale.webp');
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 56,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          scale_factor: '2x',
          algorithm: 'LANCZOS3_SHARP',
          denoise_level: 10,
          sharpness_boost: 20,
          output_width: 200,
          output_height: 200,
          output_derivative_path: nonExistentPath,
          upscale_metadata: {},
          created_at: '2026-08-27T10:00:00Z',
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 });
      const deletedNoDisk = await deleteAssetSuperResolution(testTenantId, testAssetId, 56);
      expect(deletedNoDisk).toBe(true);

      // 3. Found without output_derivative_path (null)
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 57,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          scale_factor: '2x',
          algorithm: 'LANCZOS3_SHARP',
          denoise_level: 10,
          sharpness_boost: 20,
          output_width: 200,
          output_height: 200,
          output_derivative_path: null,
          upscale_metadata: {},
          created_at: '2026-08-27T10:00:00Z',
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 });
      const deletedNoPath = await deleteAssetSuperResolution(testTenantId, testAssetId, 57);
      expect(deletedNoPath).toBe(true);

      // 4. Return false if not found
      vi.mocked(db.query).mockResolvedValueOnce([]);
      const deletedNotFound = await deleteAssetSuperResolution(testTenantId, testAssetId, 999);
      expect(deletedNotFound).toBe(false);
    });
  });

  describe('5. Endpoints REST Integration Tests (assets.ts)', () => {
    describe('POST /api/v1/assets/:id/upscale', () => {
      it('debe retornar 400 si el ID de activo es inválido', async () => {
        const res = await request(app)
          .post('/api/v1/assets/0/upscale')
          .send({ scale_factor: '2x', algorithm: 'LANCZOS3_SHARP' });
        expect(res.status).toBe(400);
      });

      it('debe retornar 400 si el cuerpo tiene campos inválidos', async () => {
        const res = await request(app).post('/api/v1/assets/42/upscale').send({
          scale_factor: '8x',
        });
        expect(res.status).toBe(400);
      });

      it('debe retornar 404 si el activo no existe en el tenant', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([]);

        const res = await request(app).post('/api/v1/assets/42/upscale').send({
          scale_factor: '2x',
          algorithm: 'LANCZOS3_SHARP',
        });

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

        const res = await request(app).post('/api/v1/assets/42/upscale').send({
          scale_factor: '2x',
          algorithm: 'LANCZOS3_SHARP',
        });

        expect(res.status).toBe(403);
        expect(res.body.message).toContain('Acceso denegado por política de control de acceso');
      });

      it('debe retornar 400 o 404 si createAssetSuperResolution falla', async () => {
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

        const res400 = await request(app).post('/api/v1/assets/42/upscale').send({
          scale_factor: '2x',
          algorithm: 'LANCZOS3_SHARP',
        });
        expect(res400.status).toBe(400);
        expect(res400.body.error).toBe('Bad Request');
        expect(res400.body.message).toContain('Solo se admiten formatos raster');

        // 404 branch (version not found in engine)
        vi.mocked(db.query).mockResolvedValueOnce([
          { id: testAssetId, current_version_id: 1, mime_type: 'image/png' },
        ]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([]);

        const res404 = await request(app).post('/api/v1/assets/42/upscale').send({
          scale_factor: '2x',
          algorithm: 'LANCZOS3_SHARP',
        });
        expect(res404.status).toBe(404);
        expect(res404.body.error).toBe('Not Found');
      });

      it('debe retornar 201 Created y data en caso exitoso (incluyendo versionId fallback si current_version_id es null)', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([
          { id: testAssetId, current_version_id: null, mime_type: 'image/png' },
        ]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });

        // createAssetSuperResolution queries
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

        const res = await request(app).post('/api/v1/assets/42/upscale').send({
          scale_factor: '2x',
          algorithm: 'LANCZOS3_SHARP',
          denoise_level: 10,
          sharpness_boost: 20,
        });

        expect(res.status).toBe(201);
        expect(res.body.data.id).toBe(99);
        expect(res.body.data.scale_factor).toBe('2x');
      });
    });

    describe('GET /api/v1/assets/:id/upscales', () => {
      it('debe retornar 400 si el ID de activo es inválido', async () => {
        const res = await request(app).get('/api/v1/assets/0/upscales');
        expect(res.status).toBe(400);
      });

      it('debe retornar 404 si el activo no existe', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([]);
        const res = await request(app).get('/api/v1/assets/42/upscales');
        expect(res.status).toBe(404);
      });

      it('debe retornar 403 si ACL VIEW es denegado', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([{ id: testAssetId }]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: false });
        const res = await request(app).get('/api/v1/assets/42/upscales');
        expect(res.status).toBe(403);
      });

      it('debe retornar 200 OK con la lista de super-resoluciones (con y sin query params)', async () => {
        // With query params
        vi.mocked(db.query).mockResolvedValueOnce([{ id: testAssetId }]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([]); // empty list

        const resWithQuery = await request(app).get(
          '/api/v1/assets/42/upscales?scale_factor=2x&algorithm=LANCZOS3_SHARP&limit=10&offset=5',
        );
        expect(resWithQuery.status).toBe(200);
        expect(resWithQuery.body.data).toEqual([]);

        // Without query params (default limit 50, offset 0)
        vi.mocked(db.query).mockResolvedValueOnce([{ id: testAssetId }]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([]);

        const resWithoutQuery = await request(app).get('/api/v1/assets/42/upscales');
        expect(resWithoutQuery.status).toBe(200);
        expect(resWithoutQuery.body.data).toEqual([]);
      });
    });

    describe('GET /api/v1/assets/:id/upscales/:upscaleId', () => {
      it('debe retornar 400 si los IDs son inválidos', async () => {
        const res = await request(app).get('/api/v1/assets/42/upscales/0');
        expect(res.status).toBe(400);
      });

      it('debe retornar 403 si ACL VIEW es denegado', async () => {
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: false });
        const res = await request(app).get('/api/v1/assets/42/upscales/1');
        expect(res.status).toBe(403);
      });

      it('debe retornar 404 si la super-resolución no existe', async () => {
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([]);
        const res = await request(app).get('/api/v1/assets/42/upscales/999');
        expect(res.status).toBe(404);
      });

      it('debe retornar 200 OK con el detalle de la super-resolución', async () => {
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([
          {
            id: 1,
            tenant_id: testTenantId,
            asset_id: testAssetId,
            version_id: 1,
            scale_factor: '2x',
            algorithm: 'LANCZOS3_SHARP',
            denoise_level: 10,
            sharpness_boost: 20,
            output_width: 200,
            output_height: 200,
            output_derivative_path: path.join(tempDir, 'upscale.webp'),
            upscale_metadata: JSON.stringify({}),
            created_at: '2026-08-27T10:00:00Z',
          },
        ]);
        const res = await request(app).get('/api/v1/assets/42/upscales/1');
        expect(res.status).toBe(200);
        expect(res.body.data.id).toBe(1);
      });
    });

    describe('DELETE /api/v1/assets/:id/upscales/:upscaleId', () => {
      it('debe retornar 400 si los IDs son inválidos', async () => {
        const res = await request(app).delete('/api/v1/assets/42/upscales/0');
        expect(res.status).toBe(400);
      });

      it('debe retornar 403 si ACL EDIT es denegado', async () => {
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: false });
        const res = await request(app).delete('/api/v1/assets/42/upscales/1');
        expect(res.status).toBe(403);
      });

      it('debe retornar 404 si la super-resolución no existe', async () => {
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([]); // getAssetSuperResolutionById returns null
        const res = await request(app).delete('/api/v1/assets/42/upscales/999');
        expect(res.status).toBe(404);
      });

      it('debe retornar 200 OK y registrar evento de seguridad en caso exitoso', async () => {
        const derivativeToDelete = path.join(tempDir, 'upscale_del.webp');
        fs.writeFileSync(derivativeToDelete, 'test_delete');

        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([
          {
            id: 1,
            tenant_id: testTenantId,
            asset_id: testAssetId,
            version_id: 1,
            scale_factor: '2x',
            algorithm: 'LANCZOS3_SHARP',
            denoise_level: 10,
            sharpness_boost: 20,
            output_width: 200,
            output_height: 200,
            output_derivative_path: derivativeToDelete,
            upscale_metadata: {},
            created_at: '2026-08-27T10:00:00Z',
          },
        ]);
        vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 });

        const res = await request(app).delete('/api/v1/assets/42/upscales/1');
        expect(res.status).toBe(200);
        expect(res.body.message).toContain('eliminada exitosamente');
      });

      it('debe manejar excepciones inesperadas con status 500', async () => {
        vi.mocked(evaluateAclPermission).mockRejectedValueOnce(
          new Error('Unexpected Delete Error'),
        );
        const res = await request(app).delete('/api/v1/assets/42/upscales/1');
        expect(res.status).toBe(500);
        expect(res.body.error).toBe('Internal Server Error');
      });
    });

    describe('500 Error Handlers for GET/POST routes', () => {
      it('POST /upscale debe manejar errores 500', async () => {
        vi.mocked(db.query).mockRejectedValueOnce(new Error('DB Error'));
        const res = await request(app).post('/api/v1/assets/42/upscale').send({
          scale_factor: '2x',
          algorithm: 'LANCZOS3_SHARP',
        });
        expect(res.status).toBe(500);
        expect(res.body.error).toBe('Internal Server Error');
      });

      it('GET /upscales debe manejar errores 500', async () => {
        vi.mocked(db.query).mockRejectedValueOnce(new Error('DB Error'));
        const res = await request(app).get('/api/v1/assets/42/upscales');
        expect(res.status).toBe(500);
      });

      it('GET /upscales/:id debe manejar errores 500', async () => {
        vi.mocked(evaluateAclPermission).mockRejectedValueOnce(new Error('ACL Error'));
        const res = await request(app).get('/api/v1/assets/42/upscales/1');
        expect(res.status).toBe(500);
      });
    });
  });

  describe('6. Rate Limiting Tests (superResolutionRateLimiter)', () => {
    it('superResolutionRateLimiter debe estar definido y configurado', () => {
      expect(superResolutionRateLimiter).toBeDefined();
      expect(typeof superResolutionRateLimiter).toBe('function');
    });

    it('superResolutionRateLimiter debe responder con 429 cuando se excede el límite de 30 solicitudes', async () => {
      const rateLimitApp = express();
      rateLimitApp.set('trust proxy', true);
      rateLimitApp.use(superResolutionRateLimiter);
      rateLimitApp.get('/test-limit', (_req: Request, res: Response) => {
        res.status(200).json({ ok: true });
      });

      const isolatedIp = '198.51.100.77';
      for (let i = 0; i < 30; i++) {
        const res = await request(rateLimitApp)
          .get('/test-limit')
          .set('X-Forwarded-For', isolatedIp);
        expect(res.status).toBe(200);
      }

      const blockedRes = await request(rateLimitApp)
        .get('/test-limit')
        .set('X-Forwarded-For', isolatedIp);
      expect(blockedRes.status).toBe(429);
      expect(blockedRes.body.error).toBe('Too Many Requests');
      expect(blockedRes.body.message).toContain('Límite de operaciones de super-resolución');
    });
  });
});
