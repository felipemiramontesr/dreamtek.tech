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
  TargetFormatEnum,
  QualityPresetEnum,
  createCompressionBodySchema,
  listCompressionsQuerySchema,
  compressionParamSchema,
} from '../../../server/src/schemas/compression.schema';
import {
  isRasterImage,
  resolveCompressionParameters,
  calculateSavingsPercentage,
  generateCompressionDerivative,
  createAssetCompression,
  listAssetCompressions,
  getAssetCompressionById,
  deleteAssetCompression,
  ALLOWED_RASTER_MIMES,
  MAX_INPUT_PIXELS,
  PRESET_DEFAULTS,
} from '../../../server/src/utils/compressionEngine';
import { compressionRateLimiter } from '../../../server/src/middleware/rateLimiter';

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

describe('FC 029 — DAM AI Semantic Image Compression & Web Optimization Suite (100% 4x100)', () => {
  const testTenantId = 100;
  const testAssetId = 42;
  const testVersionId = 1;
  const tempDir = path.join(STORAGE_ROOT, 'derivatives', `tenant_${testTenantId}`);
  const testImagePath = path.join(tempDir, 'test_compression_input.png');

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

  afterAll(() => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore
    }
  });

  describe('1. Zod Schemas Validation (compression.schema.ts)', () => {
    it('TargetFormatEnum y QualityPresetEnum deben validar formatos y presets soportados', () => {
      expect(TargetFormatEnum.safeParse('WEBP').success).toBe(true);
      expect(TargetFormatEnum.safeParse('AVIF').success).toBe(true);
      expect(TargetFormatEnum.safeParse('JPEG').success).toBe(true);
      expect(TargetFormatEnum.safeParse('PNG').success).toBe(true);
      expect(TargetFormatEnum.safeParse('BMP').success).toBe(false);

      expect(QualityPresetEnum.safeParse('HIGH_FIDELITY').success).toBe(true);
      expect(QualityPresetEnum.safeParse('BALANCED').success).toBe(true);
      expect(QualityPresetEnum.safeParse('MAX_COMPRESSION').success).toBe(true);
      expect(QualityPresetEnum.safeParse('LOSSLESS').success).toBe(true);
      expect(QualityPresetEnum.safeParse('CUSTOM').success).toBe(true);
      expect(QualityPresetEnum.safeParse('INVALID').success).toBe(false);
    });

    it('createCompressionBodySchema debe validar cuerpo correcto y aplicar valores por defecto', () => {
      const parsedDefault = createCompressionBodySchema.safeParse({
        target_format: 'WEBP',
      });
      expect(parsedDefault.success).toBe(true);
      if (parsedDefault.success) {
        expect(parsedDefault.data.quality_preset).toBe('BALANCED');
        expect(parsedDefault.data.strip_metadata).toBe(true);
        expect(parsedDefault.data.lossless).toBe(false);
      }

      const parsedFull = createCompressionBodySchema.safeParse({
        target_format: 'AVIF',
        quality_preset: 'CUSTOM',
        quality: 75,
        effort: 5,
        strip_metadata: false,
        lossless: true,
      });
      expect(parsedFull.success).toBe(true);
      if (parsedFull.success) {
        expect(parsedFull.data.target_format).toBe('AVIF');
        expect(parsedFull.data.quality).toBe(75);
        expect(parsedFull.data.effort).toBe(5);
        expect(parsedFull.data.strip_metadata).toBe(false);
        expect(parsedFull.data.lossless).toBe(true);
      }
    });

    it('createCompressionBodySchema debe rechazar campos inválidos o fuera de rango', () => {
      expect(createCompressionBodySchema.safeParse({ target_format: 'GIF' }).success).toBe(false);
      expect(
        createCompressionBodySchema.safeParse({
          target_format: 'WEBP',
          quality: 0,
        }).success,
      ).toBe(false);
      expect(
        createCompressionBodySchema.safeParse({
          target_format: 'WEBP',
          quality: 101,
        }).success,
      ).toBe(false);
      expect(
        createCompressionBodySchema.safeParse({
          target_format: 'WEBP',
          effort: 0,
        }).success,
      ).toBe(false);
      expect(
        createCompressionBodySchema.safeParse({
          target_format: 'WEBP',
          effort: 7,
        }).success,
      ).toBe(false);
    });

    it('listCompressionsQuerySchema debe validar parámetros de consulta y límites', () => {
      const parsedDefault = listCompressionsQuerySchema.safeParse({});
      expect(parsedDefault.success).toBe(true);
      if (parsedDefault.success) {
        expect(parsedDefault.data.limit).toBe(50);
        expect(parsedDefault.data.offset).toBe(0);
      }

      const parsedCustom = listCompressionsQuerySchema.safeParse({
        limit: '25',
        offset: '10',
        target_format: 'PNG',
        quality_preset: 'HIGH_FIDELITY',
      });
      expect(parsedCustom.success).toBe(true);
      if (parsedCustom.success) {
        expect(parsedCustom.data.limit).toBe(25);
        expect(parsedCustom.data.offset).toBe(10);
        expect(parsedCustom.data.target_format).toBe('PNG');
      }

      expect(listCompressionsQuerySchema.safeParse({ limit: '150' }).success).toBe(false);
      expect(listCompressionsQuerySchema.safeParse({ offset: '-1' }).success).toBe(false);
    });

    it('compressionParamSchema debe validar IDs positivos', () => {
      expect(compressionParamSchema.safeParse({ id: '10', compressionId: '5' }).success).toBe(true);
      expect(compressionParamSchema.safeParse({ id: '0', compressionId: '5' }).success).toBe(false);
      expect(compressionParamSchema.safeParse({ id: '10', compressionId: '-2' }).success).toBe(
        false,
      );
      expect(compressionParamSchema.safeParse({ id: 'abc', compressionId: '5' }).success).toBe(
        false,
      );
    });
  });

  describe('2. Helper Functions & Presets (compressionEngine.ts)', () => {
    it('isRasterImage debe identificar correctamente los formatos raster soportados', () => {
      ALLOWED_RASTER_MIMES.forEach((mime) => {
        expect(isRasterImage(mime)).toBe(true);
      });
      expect(isRasterImage('image/svg+xml')).toBe(false);
      expect(isRasterImage('application/pdf')).toBe(false);
      expect(isRasterImage(null)).toBe(false);
      expect(isRasterImage(undefined)).toBe(false);
    });

    it('resolveCompressionParameters debe resolver valores por defecto de cada preset y sobreescrituras', () => {
      // Default when quality_preset is undefined
      const defaultPreset = resolveCompressionParameters({ target_format: 'WEBP' });
      expect(defaultPreset.quality).toBe(PRESET_DEFAULTS.BALANCED.quality);
      expect(defaultPreset.effort).toBe(PRESET_DEFAULTS.BALANCED.effort);
      expect(defaultPreset.lossless).toBe(false);
      expect(defaultPreset.strip_metadata).toBe(true);

      // HIGH_FIDELITY
      const high = resolveCompressionParameters({
        target_format: 'WEBP',
        quality_preset: 'HIGH_FIDELITY',
      });
      expect(high.quality).toBe(PRESET_DEFAULTS.HIGH_FIDELITY.quality);
      expect(high.effort).toBe(PRESET_DEFAULTS.HIGH_FIDELITY.effort);
      expect(high.lossless).toBe(false);
      expect(high.strip_metadata).toBe(true);

      // BALANCED
      const balanced = resolveCompressionParameters({
        target_format: 'AVIF',
        quality_preset: 'BALANCED',
      });
      expect(balanced.quality).toBe(PRESET_DEFAULTS.BALANCED.quality);

      // MAX_COMPRESSION
      const maxComp = resolveCompressionParameters({
        target_format: 'JPEG',
        quality_preset: 'MAX_COMPRESSION',
      });
      expect(maxComp.quality).toBe(PRESET_DEFAULTS.MAX_COMPRESSION.quality);
      expect(maxComp.effort).toBe(PRESET_DEFAULTS.MAX_COMPRESSION.effort);

      // LOSSLESS
      const lossless = resolveCompressionParameters({
        target_format: 'PNG',
        quality_preset: 'LOSSLESS',
      });
      expect(lossless.quality).toBe(100);
      expect(lossless.lossless).toBe(true);
      expect(lossless.strip_metadata).toBe(false);

      // CUSTOM with overrides
      const custom = resolveCompressionParameters({
        target_format: 'WEBP',
        quality_preset: 'CUSTOM',
        quality: 65,
        effort: 2,
        lossless: false,
        strip_metadata: true,
      });
      expect(custom.quality).toBe(65);
      expect(custom.effort).toBe(2);
      expect(custom.lossless).toBe(false);
      expect(custom.strip_metadata).toBe(true);
    });

    it('calculateSavingsPercentage debe calcular ratio de compresión determinista', () => {
      // Normal reduction: 1000B to 400B = 60%
      expect(calculateSavingsPercentage(1000, 400)).toBe(60);

      // Zero bytes fallback
      expect(calculateSavingsPercentage(0, 400)).toBe(0);
      expect(calculateSavingsPercentage(-10, 400)).toBe(0);

      // Negative savings (file grew larger): 100B to 150B = -50%
      expect(calculateSavingsPercentage(100, 150)).toBe(-50);

      // Clamped limits [-100, 100]
      expect(calculateSavingsPercentage(100, 500)).toBe(-100);
      expect(calculateSavingsPercentage(1000, 0)).toBe(100);
    });
  });

  describe('3. Derivative Generation Pipeline (generateCompressionDerivative)', () => {
    it('generateCompressionDerivative debe generar derivada WEBP con BALANCED y HIGH_FIDELITY (nearLossless)', async () => {
      const resWebp = await generateCompressionDerivative(
        testTenantId,
        testAssetId,
        testVersionId,
        'WEBP',
        'BALANCED',
        80,
        4,
        false,
        true,
        testImagePath,
      );

      expect(resWebp.derivativePath).toContain('compression_42_v1_webp_balanced');
      expect(fs.existsSync(resWebp.derivativePath)).toBe(true);
      expect(resWebp.metadata.target_format).toBe('WEBP');
      expect(resWebp.compressedBytes).toBeGreaterThan(0);

      const meta = await sharp(resWebp.derivativePath).metadata();
      expect(meta.format).toBe('webp');

      // High fidelity (nearLossless branch quality >= 90)
      const resWebpHigh = await generateCompressionDerivative(
        testTenantId,
        testAssetId,
        testVersionId,
        'WEBP',
        'HIGH_FIDELITY',
        92,
        4,
        false,
        true,
        testImagePath,
      );
      expect(fs.existsSync(resWebpHigh.derivativePath)).toBe(true);
    });

    it('generateCompressionDerivative debe generar derivada AVIF (lossless y lossy)', async () => {
      // Lossy AVIF
      const resAvifLossy = await generateCompressionDerivative(
        testTenantId,
        testAssetId,
        testVersionId,
        'AVIF',
        'BALANCED',
        80,
        4,
        false,
        true,
        testImagePath,
      );
      expect(fs.existsSync(resAvifLossy.derivativePath)).toBe(true);

      // Lossless AVIF
      const resAvifLossless = await generateCompressionDerivative(
        testTenantId,
        testAssetId,
        testVersionId,
        'AVIF',
        'LOSSLESS',
        100,
        4,
        true,
        false,
        testImagePath,
      );
      expect(fs.existsSync(resAvifLossless.derivativePath)).toBe(true);
      expect(resAvifLossless.metadata.lossless).toBe(true);
    });

    it('generateCompressionDerivative debe generar derivada JPEG (con MozJPEG y chroma 4:4:4 / 4:2:0)', async () => {
      // JPEG quality < 90 (4:2:0)
      const resJpeg = await generateCompressionDerivative(
        testTenantId,
        testAssetId,
        testVersionId,
        'JPEG',
        'BALANCED',
        80,
        4,
        false,
        true,
        testImagePath,
      );
      expect(resJpeg.derivativePath).toContain('.jpg');
      expect(fs.existsSync(resJpeg.derivativePath)).toBe(true);

      // JPEG quality >= 90 (4:4:4)
      const resJpegHigh = await generateCompressionDerivative(
        testTenantId,
        testAssetId,
        testVersionId,
        'JPEG',
        'HIGH_FIDELITY',
        95,
        4,
        false,
        false, // preserve metadata
        testImagePath,
      );
      expect(fs.existsSync(resJpegHigh.derivativePath)).toBe(true);
    });

    it('generateCompressionDerivative debe generar derivada PNG (cuantizada y lossless)', async () => {
      // PNG with palette
      const resPngPalette = await generateCompressionDerivative(
        testTenantId,
        testAssetId,
        testVersionId,
        'PNG',
        'BALANCED',
        80,
        4,
        false,
        true,
        testImagePath,
      );
      expect(fs.existsSync(resPngPalette.derivativePath)).toBe(true);

      // PNG Lossless (no palette)
      const resPngLossless = await generateCompressionDerivative(
        testTenantId,
        testAssetId,
        testVersionId,
        'PNG',
        'LOSSLESS',
        100,
        4,
        true,
        false,
        testImagePath,
      );
      expect(fs.existsSync(resPngLossless.derivativePath)).toBe(true);
    });

    it('generateCompressionDerivative debe crear automáticamente el directorio de salida si no existe', async () => {
      const customTenantId = 999;
      const customTenantDir = path.join(STORAGE_ROOT, 'derivatives', `tenant_${customTenantId}`);
      if (fs.existsSync(customTenantDir)) {
        fs.rmSync(customTenantDir, { recursive: true, force: true });
      }

      const res = await generateCompressionDerivative(
        customTenantId,
        testAssetId,
        testVersionId,
        'WEBP',
        'BALANCED',
        80,
        4,
        false,
        true,
        testImagePath,
      );

      expect(fs.existsSync(res.derivativePath)).toBe(true);
      if (fs.existsSync(customTenantDir)) {
        fs.rmSync(customTenantDir, { recursive: true, force: true });
      }
    });

    it('generateCompressionDerivative debe fallar si el archivo de origen no existe', async () => {
      const nonExistent = path.join(tempDir, 'non_existent.png');
      await expect(
        generateCompressionDerivative(
          testTenantId,
          testAssetId,
          testVersionId,
          'WEBP',
          'BALANCED',
          80,
          4,
          false,
          true,
          nonExistent,
        ),
      ).rejects.toThrow('El archivo de origen no existe');
    });

    it('generateCompressionDerivative debe fallar si la imagen excede MAX_INPUT_PIXELS (16MP)', async () => {
      const bigImagePath = path.join(tempDir, 'big_input.png');
      await sharp({
        create: {
          width: 5000,
          height: 4000, // 20 MPx > 16 MPx
          channels: 3,
          background: { r: 100, g: 100, b: 100 },
        },
      })
        .png()
        .toFile(bigImagePath);

      await expect(
        generateCompressionDerivative(
          testTenantId,
          testAssetId,
          testVersionId,
          'WEBP',
          'BALANCED',
          80,
          4,
          false,
          true,
          bigImagePath,
        ),
      ).rejects.toThrow('excede el límite máximo');
    });
  });

  describe('4. Engine Service Functions (compressionEngine.ts)', () => {
    it('createAssetCompression debe retornar 404 si el activo no existe en el tenant', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const result = await createAssetCompression(testTenantId, testAssetId, 1, {
        target_format: 'WEBP',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.statusCode).toBe(404);
        expect(result.message).toContain('no encontrado');
      }
    });

    it('createAssetCompression debe retornar 400 si el MIME no es raster', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: testAssetId,
          tenant_id: testTenantId,
          mime_type: 'image/svg+xml',
          current_version_id: 1,
          storage_path: testImagePath,
        },
      ]);

      const result = await createAssetCompression(testTenantId, testAssetId, 1, {
        target_format: 'WEBP',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.statusCode).toBe(400);
        expect(result.message).toContain('Solo se admiten formatos raster');
      }

      // mime_type null -> evaluates 'desconocido'
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: testAssetId,
          tenant_id: testTenantId,
          mime_type: null,
          current_version_id: 1,
          storage_path: testImagePath,
        },
      ]);

      const resultNullMime = await createAssetCompression(testTenantId, testAssetId, 1, {
        target_format: 'WEBP',
      });
      expect(resultNullMime.success).toBe(false);
      if (!resultNullMime.success) {
        expect(resultNullMime.statusCode).toBe(400);
        expect(resultNullMime.message).toContain('desconocido');
      }
    });

    it('createAssetCompression debe retornar 404 si el archivo físico no existe en disco', async () => {
      const nonExistentPath = path.join(tempDir, 'ghost.png');
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: testAssetId,
          tenant_id: testTenantId,
          mime_type: 'image/png',
          current_version_id: 1,
          storage_path: nonExistentPath,
        },
      ]);

      const result = await createAssetCompression(testTenantId, testAssetId, 1, {
        target_format: 'WEBP',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.statusCode).toBe(404);
        expect(result.message).toContain('no se encuentra en el almacenamiento');
      }
    });

    it('createAssetCompression debe retornar 400 si falla al leer dimensiones con sharp (archivo corrupto)', async () => {
      const corruptedPath = path.join(tempDir, 'corrupted.png');
      fs.writeFileSync(corruptedPath, 'CORRUPTED_BYTES');

      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: testAssetId,
          tenant_id: testTenantId,
          mime_type: 'image/png',
          current_version_id: 1,
          storage_path: corruptedPath,
        },
      ]);

      const result = await createAssetCompression(testTenantId, testAssetId, 1, {
        target_format: 'WEBP',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.statusCode).toBe(400);
        expect(result.message).toContain('No se pudieron leer las dimensiones');
      }
    });

    it('createAssetCompression debe retornar 400 si la imagen excede el límite de 16MP', async () => {
      const bigImg = path.join(tempDir, 'big_engine.png');
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

      const result = await createAssetCompression(testTenantId, testAssetId, 1, {
        target_format: 'WEBP',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.statusCode).toBe(400);
        expect(result.message).toContain('excede el límite máximo');
      }
    });

    it('createAssetCompression debe crear derivada, sobreescribir previa en disco y despachar webhook', async () => {
      const oldDerivativePath = path.join(tempDir, 'old_compressed.webp');
      fs.writeFileSync(oldDerivativePath, 'OLD_COMPRESSED_DATA');

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
        { id: 77, output_derivative_path: oldDerivativePath },
      ]);

      vi.mocked(db.query).mockResolvedValueOnce({ insertId: 88 });

      const result = await createAssetCompression(testTenantId, testAssetId, testVersionId, {
        target_format: 'WEBP',
        quality_preset: 'BALANCED',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.statusCode).toBe(201);
        expect(result.compression.id).toBe(88);
        expect(result.compression.target_format).toBe('WEBP');
        expect(fs.existsSync(oldDerivativePath)).toBe(false);
        expect(fs.existsSync(result.compression.output_derivative_path)).toBe(true);
      }

      expect(dispatchWebhookEvent).toHaveBeenCalledWith(
        testTenantId,
        'asset.updated',
        expect.objectContaining({
          event_type: 'IMAGE_COMPRESSED',
          compression_id: 88,
          target_format: 'WEBP',
        }),
      );
    });

    it('createAssetCompression debe usar BALANCED por defecto si quality_preset no es especificado', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: testAssetId,
          tenant_id: testTenantId,
          mime_type: 'image/png',
          current_version_id: testVersionId,
          storage_path: testImagePath,
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([]);
      vi.mocked(db.query).mockResolvedValueOnce({ insertId: 92 });

      const result = await createAssetCompression(testTenantId, testAssetId, testVersionId, {
        target_format: 'WEBP',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.compression.id).toBe(92);
        expect(result.compression.quality_preset).toBe('BALANCED');
      }
    });

    it('createAssetCompression debe hacer fallback a latest version si storage_path es nulo', async () => {
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
      vi.mocked(db.query).mockResolvedValueOnce([]);
      vi.mocked(db.query).mockResolvedValueOnce({ insertId: 89 });

      const result = await createAssetCompression(testTenantId, testAssetId, 1, {
        target_format: 'AVIF',
        quality_preset: 'MAX_COMPRESSION',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.compression.id).toBe(89);
        expect(result.compression.target_format).toBe('AVIF');
      }
    });

    it('createAssetCompression debe retornar 404 si storage_path y fallbackVersion son nulos', async () => {
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

      const result = await createAssetCompression(testTenantId, testAssetId, 1, {
        target_format: 'WEBP',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.statusCode).toBe(404);
        expect(result.message).toContain('no se encuentra en el almacenamiento');
      }
    });

    it('createAssetCompression debe manejar derivada previa que no existe en disco', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: testAssetId,
          tenant_id: testTenantId,
          mime_type: 'image/png',
          current_version_id: testVersionId,
          storage_path: testImagePath,
        },
      ]);
      const nonExistentOldPath = path.join(tempDir, 'ghost_old_comp.webp');
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 78, output_derivative_path: nonExistentOldPath },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce({ insertId: 90 });

      const result = await createAssetCompression(testTenantId, testAssetId, testVersionId, {
        target_format: 'PNG',
        quality_preset: 'LOSSLESS',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.compression.id).toBe(90);
      }
    });

    it('createAssetCompression debe manejar strip_metadata false y derivada previa con output_derivative_path nulo', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: testAssetId,
          tenant_id: testTenantId,
          mime_type: 'image/png',
          current_version_id: testVersionId,
          storage_path: testImagePath,
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([{ id: 79, output_derivative_path: null }]);
      vi.mocked(db.query).mockResolvedValueOnce({ insertId: 91 });

      const result = await createAssetCompression(testTenantId, testAssetId, testVersionId, {
        target_format: 'JPEG',
        quality_preset: 'HIGH_FIDELITY',
        strip_metadata: false,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.compression.id).toBe(91);
        expect(result.compression.strip_metadata).toBe(false);
      }
    });

    it('listAssetCompressions debe retornar lista paginada y filtrada', async () => {
      // 1. With filters (target_format and quality_preset)
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          target_format: 'WEBP',
          quality_preset: 'BALANCED',
          effort: 4,
          quality: 80,
          strip_metadata: 1,
          original_bytes: 10000,
          compressed_bytes: 4000,
          savings_percentage: 60.0,
          output_derivative_path: path.join(tempDir, 'comp1.webp'),
          compression_metadata: JSON.stringify({ target_format: 'WEBP' }),
          created_at: '2026-08-27T10:00:00Z',
        },
      ]);

      const itemsFiltered = await listAssetCompressions(
        testTenantId,
        testAssetId,
        10,
        0,
        'WEBP',
        'BALANCED',
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
          target_format: 'AVIF',
          quality_preset: 'HIGH_FIDELITY',
          effort: 4,
          quality: 90,
          strip_metadata: 1,
          original_bytes: 10000,
          compressed_bytes: 3500,
          savings_percentage: 65.0,
          output_derivative_path: path.join(tempDir, 'comp2.avif'),
          compression_metadata: { target_format: 'AVIF' },
          created_at: '2026-08-27T10:05:00Z',
        },
      ]);

      const itemsDefault = await listAssetCompressions(testTenantId, testAssetId);
      expect(itemsDefault).toHaveLength(1);
      expect(itemsDefault[0].id).toBe(2);

      // 3. With target_format only
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 3,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          target_format: 'JPEG',
          quality_preset: 'BALANCED',
          effort: 4,
          quality: 80,
          strip_metadata: 1,
          original_bytes: 10000,
          compressed_bytes: 5000,
          savings_percentage: 50.0,
          output_derivative_path: path.join(tempDir, 'comp3.jpg'),
          compression_metadata: { target_format: 'JPEG' },
          created_at: '2026-08-27T10:10:00Z',
        },
      ]);
      const itemsFormatOnly = await listAssetCompressions(testTenantId, testAssetId, 50, 0, 'JPEG');
      expect(itemsFormatOnly).toHaveLength(1);

      // 4. With quality_preset only
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 4,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          target_format: 'PNG',
          quality_preset: 'LOSSLESS',
          effort: 4,
          quality: 100,
          strip_metadata: 0,
          original_bytes: 10000,
          compressed_bytes: 8000,
          savings_percentage: 20.0,
          output_derivative_path: path.join(tempDir, 'comp4.png'),
          compression_metadata: { target_format: 'PNG' },
          created_at: '2026-08-27T10:15:00Z',
        },
      ]);
      const itemsPresetOnly = await listAssetCompressions(
        testTenantId,
        testAssetId,
        50,
        0,
        undefined,
        'LOSSLESS',
      );
      expect(itemsPresetOnly).toHaveLength(1);
    });

    it('getAssetCompressionById debe retornar registro o null', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          target_format: 'WEBP',
          quality_preset: 'BALANCED',
          effort: 4,
          quality: 80,
          strip_metadata: 1,
          original_bytes: 10000,
          compressed_bytes: 4000,
          savings_percentage: 60.0,
          output_derivative_path: path.join(tempDir, 'comp1.webp'),
          compression_metadata: JSON.stringify({ target_format: 'WEBP' }),
          created_at: '2026-08-27T10:00:00Z',
        },
      ]);

      const item = await getAssetCompressionById(testTenantId, testAssetId, 1);
      expect(item).not.toBeNull();
      expect(item?.target_format).toBe('WEBP');

      // Parsed object metadata
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 2,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          target_format: 'AVIF',
          quality_preset: 'MAX_COMPRESSION',
          effort: 6,
          quality: 60,
          strip_metadata: 1,
          original_bytes: 10000,
          compressed_bytes: 3000,
          savings_percentage: 70.0,
          output_derivative_path: null,
          compression_metadata: { target_format: 'AVIF' },
          created_at: '2026-08-27T10:00:00Z',
        },
      ]);
      const itemParsed = await getAssetCompressionById(testTenantId, testAssetId, 2);
      expect(itemParsed?.target_format).toBe('AVIF');

      vi.mocked(db.query).mockResolvedValueOnce([]);
      const notFound = await getAssetCompressionById(testTenantId, testAssetId, 999);
      expect(notFound).toBeNull();
    });

    it('deleteAssetCompression debe eliminar registro, archivo físico y despachar webhook', async () => {
      // 1. Found with physical file
      const derivativeToDelete = path.join(tempDir, 'comp_to_delete.webp');
      fs.writeFileSync(derivativeToDelete, 'DERIVATIVE_BYTES');

      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 55,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          target_format: 'WEBP',
          quality_preset: 'BALANCED',
          effort: 4,
          quality: 80,
          strip_metadata: 1,
          original_bytes: 10000,
          compressed_bytes: 4000,
          savings_percentage: 60.0,
          output_derivative_path: derivativeToDelete,
          compression_metadata: {},
          created_at: '2026-08-27T10:00:00Z',
        },
      ]);

      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 });

      const deleted = await deleteAssetCompression(testTenantId, testAssetId, 55);
      expect(deleted).toBe(true);
      expect(fs.existsSync(derivativeToDelete)).toBe(false);

      expect(dispatchWebhookEvent).toHaveBeenCalledWith(
        testTenantId,
        'asset.updated',
        expect.objectContaining({
          event_type: 'COMPRESSION_DELETED',
          compression_id: 55,
        }),
      );

      // 2. Found with non-existent disk file
      const nonExistentPath = path.join(tempDir, 'non_existent_comp.webp');
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 56,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          target_format: 'WEBP',
          quality_preset: 'BALANCED',
          effort: 4,
          quality: 80,
          strip_metadata: 1,
          original_bytes: 10000,
          compressed_bytes: 4000,
          savings_percentage: 60.0,
          output_derivative_path: nonExistentPath,
          compression_metadata: {},
          created_at: '2026-08-27T10:00:00Z',
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 });
      const deletedNoDisk = await deleteAssetCompression(testTenantId, testAssetId, 56);
      expect(deletedNoDisk).toBe(true);

      // 3. Found without output_derivative_path (null)
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 57,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          target_format: 'WEBP',
          quality_preset: 'BALANCED',
          effort: 4,
          quality: 80,
          strip_metadata: 1,
          original_bytes: 10000,
          compressed_bytes: 4000,
          savings_percentage: 60.0,
          output_derivative_path: null,
          compression_metadata: {},
          created_at: '2026-08-27T10:00:00Z',
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 });
      const deletedNoPath = await deleteAssetCompression(testTenantId, testAssetId, 57);
      expect(deletedNoPath).toBe(true);

      // 4. Return false if not found
      vi.mocked(db.query).mockResolvedValueOnce([]);
      const deletedNotFound = await deleteAssetCompression(testTenantId, testAssetId, 999);
      expect(deletedNotFound).toBe(false);
    });
  });

  describe('5. Endpoints REST Integration Tests (assets.ts)', () => {
    describe('POST /api/v1/assets/:id/compress', () => {
      it('debe retornar 400 si el ID de activo es inválido', async () => {
        const res = await request(app)
          .post('/api/v1/assets/0/compress')
          .send({ target_format: 'WEBP' });
        expect(res.status).toBe(400);
      });

      it('debe retornar 400 si el cuerpo tiene campos inválidos', async () => {
        const res = await request(app)
          .post('/api/v1/assets/42/compress')
          .send({ target_format: 'INVALID_FORMAT' });
        expect(res.status).toBe(400);
      });

      it('debe retornar 404 si el activo no existe en el tenant', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([]);

        const res = await request(app)
          .post('/api/v1/assets/42/compress')
          .send({ target_format: 'WEBP' });

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
          .post('/api/v1/assets/42/compress')
          .send({ target_format: 'WEBP' });

        expect(res.status).toBe(403);
      });

      it('debe retornar 400 o 404 si createAssetCompression falla', async () => {
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
          .post('/api/v1/assets/42/compress')
          .send({ target_format: 'WEBP' });
        expect(res400.status).toBe(400);
        expect(res400.body.error).toBe('Bad Request');
        expect(res400.body.message).toContain('Solo se admiten formatos raster');

        // 404 branch (version not found in engine)
        vi.mocked(db.query).mockResolvedValueOnce([
          { id: testAssetId, current_version_id: 1, mime_type: 'image/png' },
        ]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([]);

        const res404 = await request(app)
          .post('/api/v1/assets/42/compress')
          .send({ target_format: 'WEBP' });
        expect(res404.status).toBe(404);
        expect(res404.body.error).toBe('Not Found');
      });

      it('debe retornar 201 Created y data en caso exitoso', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([
          { id: testAssetId, current_version_id: null, mime_type: 'image/png' },
        ]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });

        // createAssetCompression queries
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

        const res = await request(app).post('/api/v1/assets/42/compress').send({
          target_format: 'WEBP',
          quality_preset: 'BALANCED',
        });

        expect(res.status).toBe(201);
        expect(res.body.data.id).toBe(99);
        expect(res.body.data.target_format).toBe('WEBP');
      });
    });

    describe('GET /api/v1/assets/:id/compressions', () => {
      it('debe retornar 400 si el ID de activo es inválido', async () => {
        const res = await request(app).get('/api/v1/assets/0/compressions');
        expect(res.status).toBe(400);
      });

      it('debe retornar 404 si el activo no existe', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([]);
        const res = await request(app).get('/api/v1/assets/42/compressions');
        expect(res.status).toBe(404);
      });

      it('debe retornar 403 si ACL VIEW es denegado', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([{ id: testAssetId }]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: false });
        const res = await request(app).get('/api/v1/assets/42/compressions');
        expect(res.status).toBe(403);
      });

      it('debe retornar 200 OK con la lista de derivadas comprimidas (con y sin query params)', async () => {
        // With query params
        vi.mocked(db.query).mockResolvedValueOnce([{ id: testAssetId }]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([]); // empty list

        const resWithQuery = await request(app).get(
          '/api/v1/assets/42/compressions?target_format=WEBP&quality_preset=BALANCED&limit=10&offset=5',
        );
        expect(resWithQuery.status).toBe(200);
        expect(resWithQuery.body.data).toEqual([]);

        // Without query params (defaults)
        vi.mocked(db.query).mockResolvedValueOnce([{ id: testAssetId }]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([]);

        const resWithoutQuery = await request(app).get('/api/v1/assets/42/compressions');
        expect(resWithoutQuery.status).toBe(200);
        expect(resWithoutQuery.body.data).toEqual([]);
      });
    });

    describe('GET /api/v1/assets/:id/compressions/:compressionId', () => {
      it('debe retornar 400 si los IDs son inválidos', async () => {
        const res1 = await request(app).get('/api/v1/assets/0/compressions/1');
        expect(res1.status).toBe(400);

        const res2 = await request(app).get('/api/v1/assets/42/compressions/0');
        expect(res2.status).toBe(400);
      });

      it('debe retornar 403 si ACL VIEW es denegado', async () => {
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: false });
        const res = await request(app).get('/api/v1/assets/42/compressions/1');
        expect(res.status).toBe(403);
      });

      it('debe retornar 404 si la derivada comprimida no existe', async () => {
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([]);
        const res = await request(app).get('/api/v1/assets/42/compressions/999');
        expect(res.status).toBe(404);
      });

      it('debe retornar 200 OK con el detalle de la derivada comprimida', async () => {
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([
          {
            id: 1,
            tenant_id: testTenantId,
            asset_id: testAssetId,
            version_id: 1,
            target_format: 'WEBP',
            quality_preset: 'BALANCED',
            effort: 4,
            quality: 80,
            strip_metadata: 1,
            original_bytes: 10000,
            compressed_bytes: 4000,
            savings_percentage: 60.0,
            output_derivative_path: path.join(tempDir, 'comp1.webp'),
            compression_metadata: {},
            created_at: '2026-08-27T10:00:00Z',
          },
        ]);
        const res = await request(app).get('/api/v1/assets/42/compressions/1');
        expect(res.status).toBe(200);
        expect(res.body.data.id).toBe(1);
      });
    });

    describe('DELETE /api/v1/assets/:id/compressions/:compressionId', () => {
      it('debe retornar 400 si los IDs son inválidos', async () => {
        const res = await request(app).delete('/api/v1/assets/0/compressions/1');
        expect(res.status).toBe(400);

        const res2 = await request(app).delete('/api/v1/assets/42/compressions/0');
        expect(res2.status).toBe(400);
      });

      it('debe retornar 403 si ACL EDIT es denegado', async () => {
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: false });
        const res = await request(app).delete('/api/v1/assets/42/compressions/1');
        expect(res.status).toBe(403);
      });

      it('debe retornar 404 si la derivada comprimida no existe', async () => {
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([]); // getAssetCompressionById
        const res = await request(app).delete('/api/v1/assets/42/compressions/999');
        expect(res.status).toBe(404);
      });

      it('debe retornar 200 OK y registrar evento de seguridad en caso exitoso', async () => {
        const derivativeToDelete = path.join(tempDir, 'to_delete.webp');
        fs.writeFileSync(derivativeToDelete, 'BYTES');

        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([
          {
            id: 1,
            tenant_id: testTenantId,
            asset_id: testAssetId,
            version_id: 1,
            target_format: 'WEBP',
            quality_preset: 'BALANCED',
            effort: 4,
            quality: 80,
            strip_metadata: 1,
            original_bytes: 10000,
            compressed_bytes: 4000,
            savings_percentage: 60.0,
            output_derivative_path: derivativeToDelete,
            compression_metadata: {},
            created_at: '2026-08-27T10:00:00Z',
          },
        ]);
        vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 });

        const res = await request(app).delete('/api/v1/assets/42/compressions/1');
        expect(res.status).toBe(200);
        expect(res.body.message).toContain('eliminada exitosamente');
      });

      it('debe manejar excepciones inesperadas con status 500', async () => {
        vi.mocked(evaluateAclPermission).mockRejectedValueOnce(
          new Error('Unexpected Delete Error'),
        );
        const res = await request(app).delete('/api/v1/assets/42/compressions/1');
        expect(res.status).toBe(500);
        expect(res.body.error).toBe('Internal Server Error');
      });
    });

    describe('500 Error Handlers for GET/POST routes', () => {
      it('POST /compress debe manejar errores 500', async () => {
        vi.mocked(db.query).mockRejectedValueOnce(new Error('DB Error'));
        const res = await request(app)
          .post('/api/v1/assets/42/compress')
          .send({ target_format: 'WEBP' });
        expect(res.status).toBe(500);
        expect(res.body.error).toBe('Internal Server Error');
      });

      it('GET /compressions debe manejar errores 500', async () => {
        vi.mocked(db.query).mockRejectedValueOnce(new Error('DB Error'));
        const res = await request(app).get('/api/v1/assets/42/compressions');
        expect(res.status).toBe(500);
        expect(res.body.error).toBe('Internal Server Error');
      });

      it('GET /compressions/:id debe manejar errores 500', async () => {
        vi.mocked(evaluateAclPermission).mockRejectedValueOnce(new Error('ACL Error'));
        const res = await request(app).get('/api/v1/assets/42/compressions/1');
        expect(res.status).toBe(500);
        expect(res.body.error).toBe('Internal Server Error');
      });
    });
  });

  describe('6. Rate Limiting Tests (compressionRateLimiter)', () => {
    it('compressionRateLimiter debe estar definido y configurado', () => {
      expect(compressionRateLimiter).toBeDefined();
    });

    it('compressionRateLimiter debe responder con 429 cuando se excede el límite de 30 solicitudes', async () => {
      const rateLimitApp = express();
      rateLimitApp.set('trust proxy', true);
      rateLimitApp.use(compressionRateLimiter);
      rateLimitApp.get('/test-limit', (_req, res) => {
        res.status(200).json({ ok: true });
      });

      const isolatedIp = '198.51.100.88';

      // 30 requests allowed
      for (let i = 0; i < 30; i++) {
        const res = await request(rateLimitApp)
          .get('/test-limit')
          .set('X-Forwarded-For', isolatedIp);
        expect(res.status).toBe(200);
      }

      // 31st request rejected with 429
      const res429 = await request(rateLimitApp)
        .get('/test-limit')
        .set('X-Forwarded-For', isolatedIp);
      expect(res429.status).toBe(429);
      expect(res429.body.error).toBe('Too Many Requests');
      expect(res429.body.message).toContain('Límite de operaciones de compresión');
    });
  });
});
