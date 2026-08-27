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
import { faceBlurringRateLimiter } from '../../../server/src/middleware/rateLimiter';
import {
  boundingBoxSchema,
  createFaceBlurringBodySchema,
  listFaceBlurringsQuerySchema,
  faceBlurringParamSchema,
} from '../../../server/src/schemas/faceBlurring.schema';
import {
  isRasterImage,
  validateBoundingBoxes,
  generateFaceBlurringDerivative,
  createAssetFaceBlurring,
  listAssetFaceBlurrings,
  getAssetFaceBlurringById,
  deleteAssetFaceBlurring,
} from '../../../server/src/utils/faceBlurringEngine';
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

describe('FC 027 — DAM AI Face Blurring & Privacy Anonymization Engine Suite', () => {
  const testTenantId = 100;
  const testAssetId = 42;
  const testVersionId = 1;
  const tempDir = path.join(STORAGE_ROOT, 'derivatives', `tenant_${testTenantId}`);
  const testImagePath = path.join(tempDir, 'test_source_face.png');

  let app: Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    fs.mkdirSync(tempDir, { recursive: true });

    // Create a 200x200 test image
    await sharp({
      create: {
        width: 200,
        height: 200,
        channels: 4,
        background: { r: 120, g: 150, b: 200, alpha: 1 },
      },
    })
      .png()
      .toFile(testImagePath);

    app = express();
    app.use(express.json());
    app.use('/api/v1/assets', assetsRouter);
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup error
      }
    }
  });

  describe('1. Zod Schemas Validation Tests', () => {
    it('boundingBoxSchema debe validar cajas delimitadoras válidas e inválidas', () => {
      const valid = boundingBoxSchema.safeParse({
        left: 10,
        top: 20,
        width: 50,
        height: 60,
        label: 'face_1',
      });
      expect(valid.success).toBe(true);

      const invalidNegative = boundingBoxSchema.safeParse({
        left: -1,
        top: 0,
        width: 10,
        height: 10,
      });
      expect(invalidNegative.success).toBe(false);

      const invalidZeroDim = boundingBoxSchema.safeParse({
        left: 0,
        top: 0,
        width: 0,
        height: 10,
      });
      expect(invalidZeroDim.success).toBe(false);
    });

    it('createFaceBlurringBodySchema debe validar estrategias y límites de cajas', () => {
      const validGaussian = createFaceBlurringBodySchema.safeParse({
        strategy: 'GAUSSIAN_BLUR',
        blur_intensity: 25,
        bounding_boxes: [{ left: 10, top: 10, width: 30, height: 30 }],
      });
      expect(validGaussian.success).toBe(true);

      const validDefault = createFaceBlurringBodySchema.safeParse({
        bounding_boxes: [{ left: 0, top: 0, width: 20, height: 20 }],
      });
      expect(validDefault.success).toBe(true);
      if (validDefault.success) {
        expect(validDefault.data.strategy).toBe('GAUSSIAN_BLUR');
        expect(validDefault.data.blur_intensity).toBe(20);
      }

      // Empty bounding boxes must be rejected (Honesty Gate 170_AN)
      const invalidEmpty = createFaceBlurringBodySchema.safeParse({
        bounding_boxes: [],
      });
      expect(invalidEmpty.success).toBe(false);

      // Missing bounding boxes
      const invalidMissing = createFaceBlurringBodySchema.safeParse({});
      expect(invalidMissing.success).toBe(false);

      // Intensity out of range
      const invalidIntensityLow = createFaceBlurringBodySchema.safeParse({
        blur_intensity: 0,
        bounding_boxes: [{ left: 0, top: 0, width: 10, height: 10 }],
      });
      expect(invalidIntensityLow.success).toBe(false);

      const invalidIntensityHigh = createFaceBlurringBodySchema.safeParse({
        blur_intensity: 51,
        bounding_boxes: [{ left: 0, top: 0, width: 10, height: 10 }],
      });
      expect(invalidIntensityHigh.success).toBe(false);
    });

    it('listFaceBlurringsQuerySchema y faceBlurringParamSchema deben validar parámetros', () => {
      const queryParsed = listFaceBlurringsQuerySchema.safeParse({
        limit: '20',
        offset: '10',
        strategy: 'PIXELATE_MOSAIC',
      });
      expect(queryParsed.success).toBe(true);
      if (queryParsed.success) {
        expect(queryParsed.data.limit).toBe(20);
        expect(queryParsed.data.offset).toBe(10);
        expect(queryParsed.data.strategy).toBe('PIXELATE_MOSAIC');
      }

      const paramParsed = faceBlurringParamSchema.safeParse({
        id: '123',
        anonymizationId: '456',
      });
      expect(paramParsed.success).toBe(true);

      const invalidParam = faceBlurringParamSchema.safeParse({
        id: 'abc',
        anonymizationId: '0',
      });
      expect(invalidParam.success).toBe(false);
    });
  });

  describe('2. Helper Functions & Bounds Validation Tests', () => {
    it('isRasterImage debe aceptar solo imágenes raster y rechazar SVG u otros', () => {
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

    it('validateBoundingBoxes debe validar contención estricta dentro de dimensiones', () => {
      const emptyCheck = validateBoundingBoxes([], 200, 200);
      expect(emptyCheck.valid).toBe(false);
      expect(emptyCheck.error).toContain('Se requiere al menos una caja');

      const negativeCheck = validateBoundingBoxes(
        [{ left: -5, top: 10, width: 20, height: 20 }],
        200,
        200,
      );
      expect(negativeCheck.valid).toBe(false);
      expect(negativeCheck.error).toContain('dimensiones inválidas');

      const overflowWidth = validateBoundingBoxes(
        [{ left: 150, top: 50, width: 100, height: 50 }],
        200,
        200,
      );
      expect(overflowWidth.valid).toBe(false);
      expect(overflowWidth.error).toContain('excede las dimensiones');

      const overflowHeight = validateBoundingBoxes(
        [{ left: 50, top: 180, width: 50, height: 50 }],
        200,
        200,
      );
      expect(overflowHeight.valid).toBe(false);
      expect(overflowHeight.error).toContain('excede las dimensiones');

      const validCheck = validateBoundingBoxes(
        [
          { left: 10, top: 10, width: 50, height: 50 },
          { left: 100, top: 100, width: 80, height: 80 },
        ],
        200,
        200,
      );
      expect(validCheck.valid).toBe(true);
      expect(validCheck.error).toBeUndefined();
    });
  });

  describe('3. Sharp Image Derivative Processing Tests', () => {
    it('generateFaceBlurringDerivative debe procesar GAUSSIAN_BLUR exitosamente', async () => {
      const result = await generateFaceBlurringDerivative(
        testTenantId,
        testAssetId,
        testVersionId,
        'GAUSSIAN_BLUR',
        20,
        [{ left: 10, top: 10, width: 50, height: 50 }],
        testImagePath,
      );

      expect(result.width).toBe(200);
      expect(result.height).toBe(200);
      expect(fs.existsSync(result.derivativePath)).toBe(true);
      expect(result.metadata.strategy).toBe('GAUSSIAN_BLUR');
      expect(result.metadata.blur_intensity).toBe(20);
      expect(result.metadata.regions_count).toBe(1);
    });

    it('generateFaceBlurringDerivative debe procesar PIXELATE_MOSAIC exitosamente', async () => {
      const result = await generateFaceBlurringDerivative(
        testTenantId,
        testAssetId,
        testVersionId,
        'PIXELATE_MOSAIC',
        16,
        [{ left: 20, top: 20, width: 60, height: 60 }],
        testImagePath,
      );

      expect(fs.existsSync(result.derivativePath)).toBe(true);
      expect(result.metadata.strategy).toBe('PIXELATE_MOSAIC');
      expect(result.metadata.blur_intensity).toBe(16);
    });

    it('generateFaceBlurringDerivative debe procesar BLACK_BAR_CENSOR exitosamente', async () => {
      const result = await generateFaceBlurringDerivative(
        testTenantId,
        testAssetId,
        testVersionId,
        'BLACK_BAR_CENSOR',
        20,
        [{ left: 30, top: 30, width: 80, height: 30 }],
        testImagePath,
      );

      expect(fs.existsSync(result.derivativePath)).toBe(true);
      expect(result.metadata.strategy).toBe('BLACK_BAR_CENSOR');
    });

    it('generateFaceBlurringDerivative debe procesar múltiples regiones simultáneamente', async () => {
      const result = await generateFaceBlurringDerivative(
        testTenantId,
        testAssetId,
        testVersionId,
        'GAUSSIAN_BLUR',
        15,
        [
          { left: 10, top: 10, width: 40, height: 40 },
          { left: 100, top: 100, width: 50, height: 50 },
        ],
        testImagePath,
      );

      expect(fs.existsSync(result.derivativePath)).toBe(true);
      expect(result.metadata.regions_count).toBe(2);
    });

    it('generateFaceBlurringDerivative debe fallar si la imagen excede 16MP', async () => {
      const hugeImagePath = path.join(tempDir, 'huge_input_blur.png');
      await sharp({
        create: {
          width: 5000,
          height: 4000,
          channels: 3,
          background: { r: 0, g: 0, b: 0 },
        },
      })
        .png()
        .toFile(hugeImagePath);

      await expect(
        generateFaceBlurringDerivative(
          testTenantId,
          testAssetId,
          testVersionId,
          'GAUSSIAN_BLUR',
          20,
          [{ left: 10, top: 10, width: 50, height: 50 }],
          hugeImagePath,
        ),
      ).rejects.toThrow('excede el límite máximo permitido de 16 Megapíxeles');
    });

    it('generateFaceBlurringDerivative debe fallar si una caja delimitadora desborda', async () => {
      await expect(
        generateFaceBlurringDerivative(
          testTenantId,
          testAssetId,
          testVersionId,
          'GAUSSIAN_BLUR',
          20,
          [{ left: 150, top: 150, width: 100, height: 100 }],
          testImagePath,
        ),
      ).rejects.toThrow('excede las dimensiones de la imagen');
    });
  });

  describe('4. Engine Service Functions Tests', () => {
    it('createAssetFaceBlurring debe retornar 404 si el activo no existe', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const result = await createAssetFaceBlurring(testTenantId, 999, 1, {
        strategy: 'GAUSSIAN_BLUR',
        blur_intensity: 20,
        bounding_boxes: [{ left: 10, top: 10, width: 20, height: 20 }],
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.statusCode).toBe(404);
        expect(result.message).toContain('no encontrado');
      }
    });

    it('createAssetFaceBlurring debe retornar 400 si el tipo MIME no es raster', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: testAssetId, mime_type: 'image/svg+xml', storage_path: testImagePath },
      ]);

      const result = await createAssetFaceBlurring(testTenantId, testAssetId, 1, {
        strategy: 'GAUSSIAN_BLUR',
        blur_intensity: 20,
        bounding_boxes: [{ left: 10, top: 10, width: 20, height: 20 }],
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.statusCode).toBe(400);
        expect(result.message).toContain('Solo se admiten formatos raster');
      }
    });

    it('createAssetFaceBlurring debe retornar 404 si el archivo físico no existe en disco', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: testAssetId,
          mime_type: 'image/png',
          storage_path: path.join(tempDir, 'non_existent_source.png'),
        },
      ]);

      const result = await createAssetFaceBlurring(testTenantId, testAssetId, 1, {
        strategy: 'GAUSSIAN_BLUR',
        blur_intensity: 20,
        bounding_boxes: [{ left: 10, top: 10, width: 20, height: 20 }],
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.statusCode).toBe(404);
        expect(result.message).toContain('no se encuentra en el almacenamiento');
      }
    });

    it('createAssetFaceBlurring debe retornar 400 si el archivo de imagen está corrupto', async () => {
      const corruptFile = path.join(tempDir, 'corrupt_face.png');
      fs.writeFileSync(corruptFile, 'INVALID_IMAGE_DATA_CORRUPT');

      vi.mocked(db.query).mockResolvedValueOnce([
        { id: testAssetId, mime_type: 'image/png', storage_path: corruptFile },
      ]);

      const result = await createAssetFaceBlurring(testTenantId, testAssetId, 1, {
        strategy: 'GAUSSIAN_BLUR',
        blur_intensity: 20,
        bounding_boxes: [{ left: 10, top: 10, width: 20, height: 20 }],
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.statusCode).toBe(400);
        expect(result.message).toContain('No se pudieron determinar las dimensiones');
      }
    });

    it('createAssetFaceBlurring debe retornar 400 si la imagen excede 16MP', async () => {
      const hugeImagePath = path.join(tempDir, 'huge_asset_blur.png');
      await sharp({
        create: {
          width: 5000,
          height: 4000,
          channels: 3,
          background: { r: 0, g: 0, b: 0 },
        },
      })
        .png()
        .toFile(hugeImagePath);

      vi.mocked(db.query).mockResolvedValueOnce([
        { id: testAssetId, mime_type: 'image/png', storage_path: hugeImagePath },
      ]);

      const result = await createAssetFaceBlurring(testTenantId, testAssetId, 1, {
        strategy: 'GAUSSIAN_BLUR',
        blur_intensity: 20,
        bounding_boxes: [{ left: 10, top: 10, width: 20, height: 20 }],
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.statusCode).toBe(400);
        expect(result.message).toContain('16 Megapíxeles');
      }
    });

    it('createAssetFaceBlurring debe retornar 400 si las cajas delimitadoras desbordan', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: testAssetId, mime_type: 'image/png', storage_path: testImagePath },
      ]);

      const result = await createAssetFaceBlurring(testTenantId, testAssetId, 1, {
        strategy: 'GAUSSIAN_BLUR',
        blur_intensity: 20,
        bounding_boxes: [{ left: 150, top: 150, width: 100, height: 100 }],
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.statusCode).toBe(400);
        expect(result.message).toContain('excede las dimensiones');
      }
    });

    it('createAssetFaceBlurring debe crear exitosamente, limpiar derivada previa y despachar webhook', async () => {
      const oldDerivativePath = path.join(tempDir, 'old_anon_derivative.webp');
      fs.writeFileSync(oldDerivativePath, 'old_derivative_data');

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

      const result = await createAssetFaceBlurring(testTenantId, testAssetId, testVersionId, {
        strategy: 'GAUSSIAN_BLUR',
        blur_intensity: 20,
        bounding_boxes: [{ left: 10, top: 10, width: 40, height: 40 }],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.statusCode).toBe(201);
        expect(result.anonymization.id).toBe(88);
        expect(result.anonymization.strategy).toBe('GAUSSIAN_BLUR');
        expect(fs.existsSync(oldDerivativePath)).toBe(false);
        expect(fs.existsSync(result.anonymization.output_derivative_path)).toBe(true);
      }

      expect(dispatchWebhookEvent).toHaveBeenCalledWith(
        testTenantId,
        'asset.updated',
        expect.objectContaining({
          event_type: 'FACE_BLURRED',
          anonymization_id: 88,
          strategy: 'GAUSSIAN_BLUR',
        }),
      );
    });

    it('createAssetFaceBlurring debe hacer fallback a latest version si storage_path es nulo', async () => {
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

      const result = await createAssetFaceBlurring(testTenantId, testAssetId, 1, {
        strategy: 'PIXELATE_MOSAIC',
        blur_intensity: 16,
        bounding_boxes: [{ left: 10, top: 10, width: 30, height: 30 }],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.anonymization.id).toBe(89);
        expect(result.anonymization.strategy).toBe('PIXELATE_MOSAIC');
      }
    });

    it('createAssetFaceBlurring debe retornar 404 si storage_path y fallbackVersion son nulos', async () => {
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

      const result = await createAssetFaceBlurring(testTenantId, testAssetId, 1, {
        strategy: 'PIXELATE_MOSAIC',
        blur_intensity: 16,
        bounding_boxes: [{ left: 10, top: 10, width: 30, height: 30 }],
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.statusCode).toBe(404);
        expect(result.message).toContain('no se encuentra en el almacenamiento');
      }
    });

    it('createAssetFaceBlurring debe manejar derivada previa que no existe en disco', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: testAssetId,
          tenant_id: testTenantId,
          mime_type: 'image/png',
          current_version_id: testVersionId,
          storage_path: testImagePath,
        },
      ]);
      const nonExistentOldPath = path.join(
        STORAGE_ROOT,
        'derivatives',
        `tenant_${testTenantId}`,
        'ghost_anon.webp',
      );
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 78, output_derivative_path: nonExistentOldPath },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce({ insertId: 90 });

      const result = await createAssetFaceBlurring(testTenantId, testAssetId, testVersionId, {
        strategy: 'BLACK_BAR_CENSOR',
        blur_intensity: 20,
        bounding_boxes: [{ left: 10, top: 10, width: 40, height: 40 }],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.anonymization.id).toBe(90);
      }
    });

    it('listAssetFaceBlurrings debe retornar lista paginada y filtrada', async () => {
      // 1. With strategy filter
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          strategy: 'GAUSSIAN_BLUR',
          blur_intensity: 20,
          bounding_boxes: JSON.stringify([{ left: 10, top: 10, width: 20, height: 20 }]),
          output_derivative_path: '/path/blur1.webp',
          blurring_metadata: JSON.stringify({ strategy: 'GAUSSIAN_BLUR' }),
          created_at: '2026-08-27T10:00:00Z',
        },
      ]);

      const itemsFiltered = await listAssetFaceBlurrings(
        testTenantId,
        testAssetId,
        10,
        0,
        'GAUSSIAN_BLUR',
      );

      expect(itemsFiltered).toHaveLength(1);
      expect(itemsFiltered[0].id).toBe(1);

      // 2. Without strategy filter (defaults)
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 2,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          strategy: 'PIXELATE_MOSAIC',
          blur_intensity: 16,
          bounding_boxes: [{ left: 5, top: 5, width: 15, height: 15 }],
          output_derivative_path: '/path/blur2.webp',
          blurring_metadata: { strategy: 'PIXELATE_MOSAIC' },
          created_at: '2026-08-27T10:05:00Z',
        },
      ]);

      const itemsDefault = await listAssetFaceBlurrings(testTenantId, testAssetId);
      expect(itemsDefault).toHaveLength(1);
      expect(itemsDefault[0].id).toBe(2);
    });

    it('getAssetFaceBlurringById debe retornar registro o null', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          strategy: 'BLACK_BAR_CENSOR',
          blur_intensity: 20,
          bounding_boxes: JSON.stringify([{ left: 0, top: 0, width: 50, height: 20 }]),
          output_derivative_path: '/path/censor.webp',
          blurring_metadata: JSON.stringify({ strategy: 'BLACK_BAR_CENSOR' }),
          created_at: '2026-08-27T10:00:00Z',
        },
      ]);

      const item = await getAssetFaceBlurringById(testTenantId, testAssetId, 1);
      expect(item).not.toBeNull();
      expect(item?.strategy).toBe('BLACK_BAR_CENSOR');

      // Test with parsed object fields
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 2,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          strategy: 'GAUSSIAN_BLUR',
          blur_intensity: 20,
          bounding_boxes: [{ left: 5, top: 5, width: 25, height: 25 }],
          output_derivative_path: null,
          blurring_metadata: { strategy: 'GAUSSIAN_BLUR' },
          created_at: '2026-08-27T10:00:00Z',
        },
      ]);
      const itemParsed = await getAssetFaceBlurringById(testTenantId, testAssetId, 2);
      expect(itemParsed?.bounding_boxes[0].left).toBe(5);

      vi.mocked(db.query).mockResolvedValueOnce([]);
      const notFound = await getAssetFaceBlurringById(testTenantId, testAssetId, 999);
      expect(notFound).toBeNull();
    });

    it('deleteAssetFaceBlurring debe eliminar archivo físico y registro de BD', async () => {
      // 1. Found with physical file
      const derivativeFile = path.join(tempDir, 'anon_to_delete.webp');
      fs.writeFileSync(derivativeFile, 'sample_data');

      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 10,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          strategy: 'GAUSSIAN_BLUR',
          blur_intensity: 20,
          bounding_boxes: [],
          output_derivative_path: derivativeFile,
          blurring_metadata: {},
          created_at: '2026-08-27T10:00:00Z',
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 });

      const deleted = await deleteAssetFaceBlurring(testTenantId, testAssetId, 10);
      expect(deleted).toBe(true);
      expect(fs.existsSync(derivativeFile)).toBe(false);
      expect(dispatchWebhookEvent).toHaveBeenCalledWith(
        testTenantId,
        'asset.updated',
        expect.objectContaining({ event_type: 'FACE_BLURRING_DELETED' }),
      );

      // 2. Found with non-existent disk file
      const nonExistentPath = path.join(
        STORAGE_ROOT,
        'derivatives',
        'tenant_100',
        'does_not_exist_anon.webp',
      );
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 11,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          strategy: 'GAUSSIAN_BLUR',
          blur_intensity: 20,
          bounding_boxes: [],
          output_derivative_path: nonExistentPath,
          blurring_metadata: {},
          created_at: '2026-08-27T10:00:00Z',
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 });
      const deletedNoDisk = await deleteAssetFaceBlurring(testTenantId, testAssetId, 11);
      expect(deletedNoDisk).toBe(true);

      // 3. Found without output_derivative_path (null)
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 12,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          output_derivative_path: null,
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 });
      const deletedNullPath = await deleteAssetFaceBlurring(testTenantId, testAssetId, 12);
      expect(deletedNullPath).toBe(true);

      // 4. Not found branch
      vi.mocked(db.query).mockResolvedValueOnce([]);
      const deleteNotFound = await deleteAssetFaceBlurring(testTenantId, testAssetId, 999);
      expect(deleteNotFound).toBe(false);
    });
  });

  describe('5. Endpoints REST Integration Tests (assets.ts)', () => {
    describe('POST /api/v1/assets/:id/anonymize', () => {
      it('debe retornar 400 si el ID de activo es inválido', async () => {
        const res = await request(app)
          .post('/api/v1/assets/invalid-id/anonymize')
          .send({
            strategy: 'GAUSSIAN_BLUR',
            bounding_boxes: [{ left: 0, top: 0, width: 10, height: 10 }],
          });
        expect(res.status).toBe(400);
        expect(res.body.message).toContain('ID de activo inválido');
      });

      it('debe retornar 400 si el cuerpo no contiene bounding_boxes', async () => {
        const res = await request(app).post('/api/v1/assets/42/anonymize').send({
          strategy: 'GAUSSIAN_BLUR',
        });
        expect(res.status).toBe(400);
      });

      it('debe retornar 404 si el activo no existe en el tenant', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([]);

        const res = await request(app)
          .post('/api/v1/assets/42/anonymize')
          .send({
            strategy: 'GAUSSIAN_BLUR',
            bounding_boxes: [{ left: 0, top: 0, width: 10, height: 10 }],
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

        const res = await request(app)
          .post('/api/v1/assets/42/anonymize')
          .send({
            strategy: 'GAUSSIAN_BLUR',
            bounding_boxes: [{ left: 0, top: 0, width: 10, height: 10 }],
          });

        expect(res.status).toBe(403);
        expect(res.body.message).toContain('Acceso denegado por política de control de acceso');
      });

      it('debe retornar 400 o 404 si createAssetFaceBlurring falla', async () => {
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
          .post('/api/v1/assets/42/anonymize')
          .send({
            strategy: 'GAUSSIAN_BLUR',
            bounding_boxes: [{ left: 0, top: 0, width: 10, height: 10 }],
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

        const res404 = await request(app)
          .post('/api/v1/assets/42/anonymize')
          .send({
            strategy: 'GAUSSIAN_BLUR',
            bounding_boxes: [{ left: 0, top: 0, width: 10, height: 10 }],
          });
        expect(res404.status).toBe(404);
        expect(res404.body.error).toBe('Not Found');
      });

      it('debe retornar 201 Created y data en caso exitoso (incluyendo versionId fallback si current_version_id es null)', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([
          { id: testAssetId, current_version_id: null, mime_type: 'image/png' },
        ]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });

        // createAssetFaceBlurring queries
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

        const res = await request(app)
          .post('/api/v1/assets/42/anonymize')
          .send({
            strategy: 'GAUSSIAN_BLUR',
            blur_intensity: 20,
            bounding_boxes: [{ left: 10, top: 10, width: 30, height: 30 }],
          });

        expect(res.status).toBe(201);
        expect(res.body.data.id).toBe(99);
        expect(res.body.data.strategy).toBe('GAUSSIAN_BLUR');
      });
    });

    describe('GET /api/v1/assets/:id/anonymizations', () => {
      it('debe retornar 400 si el ID de activo es inválido', async () => {
        const res = await request(app).get('/api/v1/assets/0/anonymizations');
        expect(res.status).toBe(400);
      });

      it('debe retornar 404 si el activo no existe', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([]);
        const res = await request(app).get('/api/v1/assets/42/anonymizations');
        expect(res.status).toBe(404);
      });

      it('debe retornar 403 si ACL VIEW es denegado', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([{ id: testAssetId }]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: false });
        const res = await request(app).get('/api/v1/assets/42/anonymizations');
        expect(res.status).toBe(403);
      });

      it('debe retornar 200 OK con la lista de anonimizaciones (con y sin query params)', async () => {
        // With query params
        vi.mocked(db.query).mockResolvedValueOnce([{ id: testAssetId }]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([]); // empty list

        const resWithQuery = await request(app).get(
          '/api/v1/assets/42/anonymizations?strategy=GAUSSIAN_BLUR&limit=10&offset=5',
        );
        expect(resWithQuery.status).toBe(200);
        expect(resWithQuery.body.data).toEqual([]);

        // Without query params (default limit 50, offset 0)
        vi.mocked(db.query).mockResolvedValueOnce([{ id: testAssetId }]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([]);

        const resWithoutQuery = await request(app).get('/api/v1/assets/42/anonymizations');
        expect(resWithoutQuery.status).toBe(200);
        expect(resWithoutQuery.body.data).toEqual([]);
      });
    });

    describe('GET /api/v1/assets/:id/anonymizations/:anonymizationId', () => {
      it('debe retornar 400 si los IDs son inválidos', async () => {
        const res = await request(app).get('/api/v1/assets/42/anonymizations/0');
        expect(res.status).toBe(400);
      });

      it('debe retornar 403 si ACL VIEW es denegado', async () => {
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: false });
        const res = await request(app).get('/api/v1/assets/42/anonymizations/1');
        expect(res.status).toBe(403);
      });

      it('debe retornar 404 si la anonimización no existe', async () => {
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([]); // not found
        const res = await request(app).get('/api/v1/assets/42/anonymizations/999');
        expect(res.status).toBe(404);
      });

      it('debe retornar 200 OK con el detalle de la anonimización', async () => {
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([
          {
            id: 1,
            tenant_id: testTenantId,
            asset_id: testAssetId,
            version_id: 1,
            strategy: 'GAUSSIAN_BLUR',
            blur_intensity: 20,
            bounding_boxes: [],
            output_derivative_path: '/path/anon.webp',
            blurring_metadata: {},
            created_at: '2026-08-27T10:00:00Z',
          },
        ]);
        const res = await request(app).get('/api/v1/assets/42/anonymizations/1');
        expect(res.status).toBe(200);
        expect(res.body.data.id).toBe(1);
      });
    });

    describe('DELETE /api/v1/assets/:id/anonymizations/:anonymizationId', () => {
      it('debe retornar 400 si los IDs son inválidos', async () => {
        const res = await request(app).delete('/api/v1/assets/abc/anonymizations/1');
        expect(res.status).toBe(400);
      });

      it('debe retornar 403 si ACL EDIT es denegado', async () => {
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: false });
        const res = await request(app).delete('/api/v1/assets/42/anonymizations/1');
        expect(res.status).toBe(403);
      });

      it('debe retornar 404 si no se encuentra para eliminar', async () => {
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([]); // not found
        const res = await request(app).delete('/api/v1/assets/42/anonymizations/999');
        expect(res.status).toBe(404);
      });

      it('debe retornar 200 OK cuando se elimina exitosamente', async () => {
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([
          {
            id: 1,
            tenant_id: testTenantId,
            asset_id: testAssetId,
            output_derivative_path: null,
          },
        ]);
        vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 });

        const res = await request(app).delete('/api/v1/assets/42/anonymizations/1');
        expect(res.status).toBe(200);
        expect(res.body.message).toContain('eliminada exitosamente');
      });

      it('debe manejar excepciones inesperadas con status 500', async () => {
        vi.mocked(evaluateAclPermission).mockRejectedValueOnce(
          new Error('Unexpected Delete Error'),
        );
        const res = await request(app).delete('/api/v1/assets/42/anonymizations/1');
        expect(res.status).toBe(500);
      });
    });

    describe('500 Error Handlers for GET/POST routes', () => {
      it('POST /anonymize debe manejar errores 500', async () => {
        vi.mocked(db.query).mockRejectedValueOnce(new Error('DB Error'));
        const res = await request(app)
          .post('/api/v1/assets/42/anonymize')
          .send({
            strategy: 'GAUSSIAN_BLUR',
            bounding_boxes: [{ left: 0, top: 0, width: 10, height: 10 }],
          });
        expect(res.status).toBe(500);
      });

      it('GET /anonymizations debe manejar errores 500', async () => {
        vi.mocked(db.query).mockRejectedValueOnce(new Error('DB Error'));
        const res = await request(app).get('/api/v1/assets/42/anonymizations');
        expect(res.status).toBe(500);
      });

      it('GET /anonymizations/:id debe manejar errores 500', async () => {
        vi.mocked(evaluateAclPermission).mockRejectedValueOnce(new Error('ACL Error'));
        const res = await request(app).get('/api/v1/assets/42/anonymizations/1');
        expect(res.status).toBe(500);
      });
    });
  });

  describe('6. Rate Limiter Middleware Unit Tests', () => {
    it('faceBlurringRateLimiter debe estar definido y configurado', () => {
      expect(faceBlurringRateLimiter).toBeDefined();
      expect(typeof faceBlurringRateLimiter).toBe('function');
    });

    it('faceBlurringRateLimiter debe responder con 429 cuando se excede el límite', async () => {
      const appLimit = express();
      appLimit.use(faceBlurringRateLimiter);
      appLimit.post('/test-face-limit', (_req, res) => res.json({ ok: true }));

      for (let i = 0; i < 30; i++) {
        await request(appLimit).post('/test-face-limit');
      }
      const resBlocked = await request(appLimit).post('/test-face-limit');
      expect(resBlocked.status).toBe(429);
      expect(resBlocked.body.message).toContain('anonimización y difuminado facial');
    });
  });
});
