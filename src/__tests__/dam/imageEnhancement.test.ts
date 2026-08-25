/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

import assetsRouter from '../../../server/src/routes/assets';
import {
  ImageEnhancementPresetEnum,
  createImageEnhancementBodySchema,
  listImageEnhancementsQuerySchema,
  imageEnhancementParamSchema,
} from '../../../server/src/schemas/imageEnhancement.schema';
import {
  hexToRgb,
  resolveParameters,
  generateImageEnhancementDerivative,
  createAssetImageEnhancement,
  listAssetImageEnhancements,
  getAssetImageEnhancementById,
  deleteAssetImageEnhancement,
} from '../../../server/src/utils/imageEnhancementEngine';
import { STORAGE_ROOT } from '../../../server/src/utils/storage';
import * as db from '../../../server/src/db';
import { dispatchWebhookEvent } from '../../../server/src/utils/webhookDispatcher';
import { evaluateAclPermission } from '../../../server/src/utils/acl';
import { imageEnhancementRateLimiter } from '../../../server/src/middleware/rateLimiter';

// Mock dependencies
vi.mock('../../../server/src/db', () => ({
  query: vi.fn(),
}));

vi.mock('../../../server/src/utils/webhookDispatcher', () => ({
  dispatchWebhookEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../server/src/utils/acl', () => ({
  evaluateAclPermission: vi.fn(),
}));

// Mock requireAuth to inject test user
vi.mock('../../../server/src/middleware/auth', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { userId: 42, role: 'ADMIN', tenantId: 100 };
    next();
  },
}));

// Mock audit logger
vi.mock('../../../server/src/middleware/auditLogger', () => ({
  logSecurityEvent: vi.fn().mockResolvedValue(undefined),
}));

describe('DAM AI Image Colorization & Tone Enhancement Suite (FC 025)', () => {
  let app: Express;
  const testTenantId = 100;
  const testAssetId = 55;
  const testVersionId = 1;
  const tempDir = path.join(STORAGE_ROOT, 'test_enhance_fixtures');
  let testImagePath: string;

  beforeEach(async () => {
    vi.clearAllMocks();

    app = express();
    app.use(express.json());
    app.use('/api/v1/assets', assetsRouter);

    fs.mkdirSync(tempDir, { recursive: true });
    testImagePath = path.join(tempDir, `sample_${Date.now()}.png`);

    // Create a valid 200x200 sample image using sharp
    await sharp({
      create: {
        width: 200,
        height: 200,
        channels: 3,
        background: { r: 120, g: 150, b: 180 },
      },
    })
      .png()
      .toFile(testImagePath);
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('1. Zod Schemas Validation', () => {
    it('debe validar todos los presets de ImageEnhancementPresetEnum', () => {
      const presets = [
        'NATURAL_RESTORE',
        'VIBRANT',
        'WARM',
        'COOL',
        'VINTAGE_COLORIZED',
        'CINEMATIC',
        'HIGH_CONTRAST_BW',
        'CUSTOM',
      ];
      for (const preset of presets) {
        const result = ImageEnhancementPresetEnum.safeParse(preset);
        expect(result.success).toBe(true);
      }

      const invalid = ImageEnhancementPresetEnum.safeParse('INVALID_PRESET');
      expect(invalid.success).toBe(false);
    });

    it('debe validar createImageEnhancementBodySchema con valores por defecto y personalizados', () => {
      const defaultParsed = createImageEnhancementBodySchema.parse({});
      expect(defaultParsed.preset).toBe('NATURAL_RESTORE');

      const customParsed = createImageEnhancementBodySchema.parse({
        preset: 'VIBRANT',
        brightness: 1.2,
        contrast: 1.3,
        saturation: 1.5,
        sharpness: 2.0,
        gamma: 1.1,
        tint_hex: '#FF5733',
      });
      expect(customParsed.preset).toBe('VIBRANT');
      expect(customParsed.brightness).toBe(1.2);
      expect(customParsed.tint_hex).toBe('#FF5733');

      // Invalid bounds
      expect(createImageEnhancementBodySchema.safeParse({ brightness: 0.05 }).success).toBe(false);
      expect(createImageEnhancementBodySchema.safeParse({ brightness: 3.5 }).success).toBe(false);
      expect(createImageEnhancementBodySchema.safeParse({ contrast: 0.05 }).success).toBe(false);
      expect(createImageEnhancementBodySchema.safeParse({ saturation: -0.1 }).success).toBe(false);
      expect(createImageEnhancementBodySchema.safeParse({ sharpness: 6.0 }).success).toBe(false);
      expect(createImageEnhancementBodySchema.safeParse({ gamma: 0.05 }).success).toBe(false);
      expect(createImageEnhancementBodySchema.safeParse({ tint_hex: 'invalid' }).success).toBe(
        false,
      );
    });

    it('debe validar listImageEnhancementsQuerySchema', () => {
      const defaults = listImageEnhancementsQuerySchema.parse({});
      expect(defaults.limit).toBe(50);
      expect(defaults.offset).toBe(0);

      const custom = listImageEnhancementsQuerySchema.parse({
        limit: '25',
        offset: '10',
        preset: 'WARM',
      });
      expect(custom.limit).toBe(25);
      expect(custom.offset).toBe(10);
      expect(custom.preset).toBe('WARM');

      expect(listImageEnhancementsQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
      expect(listImageEnhancementsQuerySchema.safeParse({ limit: 200 }).success).toBe(false);
    });

    it('debe validar imageEnhancementParamSchema', () => {
      expect(imageEnhancementParamSchema.safeParse({ id: '10' }).success).toBe(true);
      expect(imageEnhancementParamSchema.safeParse({ id: '10', enhancementId: '5' }).success).toBe(
        true,
      );
      expect(imageEnhancementParamSchema.safeParse({ id: '0' }).success).toBe(false);
      expect(imageEnhancementParamSchema.safeParse({ id: '-5' }).success).toBe(false);
    });
  });

  describe('2. Engine Utilities: hexToRgb & resolveParameters', () => {
    it('hexToRgb debe parsear correctamente cadenas HEX con y sin almohadilla', () => {
      expect(hexToRgb('#FFFFFF')).toEqual({ r: 255, g: 255, b: 255 });
      expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 });
      expect(hexToRgb('#FF8C00')).toEqual({ r: 255, g: 140, b: 0 });
      expect(hexToRgb('1E3F66')).toEqual({ r: 30, g: 63, b: 102 });
    });

    it('resolveParameters debe resolver valores por defecto de presets y aplicar overrides', () => {
      const natural = resolveParameters('NATURAL_RESTORE');
      expect(natural.clahe).toBe(true);
      expect(natural.brightness).toBe(1.05);

      const overridden = resolveParameters('NATURAL_RESTORE', {
        brightness: 1.5,
        contrast: 1.4,
        saturation: 1.2,
        sharpness: 2.0,
        gamma: 1.3,
        tint_hex: '#112233',
        clahe: false,
      });
      expect(overridden.brightness).toBe(1.5);
      expect(overridden.contrast).toBe(1.4);
      expect(overridden.saturation).toBe(1.2);
      expect(overridden.sharpness).toBe(2.0);
      expect(overridden.gamma).toBe(1.3);
      expect(overridden.tint_hex).toBe('#112233');
      expect(overridden.clahe).toBe(false);

      const withEmptyOverrides = resolveParameters('COOL', {});
      expect(withEmptyOverrides.tint_hex).toBe('#00BFFF');
    });
  });

  describe('3. Derivative Generation with Sharp', () => {
    it('generateImageEnhancementDerivative debe generar archivo WebP aplicando todas las transformaciones', async () => {
      const params = {
        brightness: 1.1,
        contrast: 1.2,
        saturation: 1.3,
        sharpness: 1.5,
        gamma: 1.1,
        tint_hex: '#FF8C00',
        clahe: true,
      };

      const outputPath = await generateImageEnhancementDerivative(
        testTenantId,
        testAssetId,
        testVersionId,
        'WARM',
        testImagePath,
        params,
      );

      expect(fs.existsSync(outputPath)).toBe(true);
      expect(outputPath.endsWith('.webp')).toBe(true);

      const metadata = await sharp(outputPath).metadata();
      expect(metadata.format).toBe('webp');
      expect(metadata.width).toBe(200);
      expect(metadata.height).toBe(200);

      try {
        if (fs.existsSync(outputPath)) {
          fs.unlinkSync(outputPath);
        }
      } catch {}
    });

    it('generateImageEnhancementDerivative debe funcionar con parámetros neutros (sin tint, contrast=1, gamma=1, sharpness=0, clahe=false)', async () => {
      const params = {
        brightness: 1.0,
        contrast: 1.0,
        saturation: 1.0,
        sharpness: 0,
        gamma: 1.0,
        clahe: false,
      };

      const outputPath = await generateImageEnhancementDerivative(
        testTenantId,
        testAssetId,
        testVersionId,
        'CUSTOM',
        testImagePath,
        params,
      );

      expect(fs.existsSync(outputPath)).toBe(true);
      try {
        if (fs.existsSync(outputPath)) {
          fs.unlinkSync(outputPath);
        }
      } catch {}
    });
  });

  describe('4. Engine Core Functions (create, list, get, delete)', () => {
    it('createAssetImageEnhancement debe retornar 404 si la versión no existe', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const result = await createAssetImageEnhancement(
        testTenantId,
        testAssetId,
        testVersionId,
        'NATURAL_RESTORE',
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.statusCode).toBe(404);
        expect(result.message).toContain('Versión del activo no encontrada');
      }
    });

    it('createAssetImageEnhancement debe retornar 400 si el tipo MIME no es raster permitido (ej. SVG o video)', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: testVersionId, storage_path: testImagePath, mime_type: 'image/svg+xml' },
      ]);

      const result = await createAssetImageEnhancement(
        testTenantId,
        testAssetId,
        testVersionId,
        'NATURAL_RESTORE',
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.statusCode).toBe(400);
        expect(result.message).toContain('El activo no es una imagen raster compatible');
      }
    });

    it('createAssetImageEnhancement debe retornar 404 si el archivo físico no existe en disco', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: testVersionId,
          storage_path: path.join(tempDir, 'non_existent.png'),
          mime_type: 'image/png',
        },
      ]);

      const result = await createAssetImageEnhancement(
        testTenantId,
        testAssetId,
        testVersionId,
        'NATURAL_RESTORE',
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.statusCode).toBe(404);
        expect(result.message).toContain('El archivo de la imagen no existe');
      }
    });

    it('createAssetImageEnhancement debe retornar 400 si el archivo está corrupto y sharp falla en metadata()', async () => {
      const corruptFile = path.join(tempDir, 'corrupt.png');
      fs.writeFileSync(corruptFile, 'NOT_A_VALID_IMAGE_BUFFER');

      vi.mocked(db.query).mockResolvedValueOnce([
        { id: testVersionId, storage_path: corruptFile, mime_type: 'image/png' },
      ]);

      const result = await createAssetImageEnhancement(
        testTenantId,
        testAssetId,
        testVersionId,
        'NATURAL_RESTORE',
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.statusCode).toBe(400);
        expect(result.message).toContain('No se pudieron determinar las dimensiones');
      }
    });

    it('createAssetImageEnhancement debe retornar 400 si excede el límite A04 de 16 Megapíxeles', async () => {
      const hugeImagePath = path.join(tempDir, 'huge_sample.png');
      await sharp({
        create: {
          width: 5000,
          height: 3500, // 17.5 MP > 16 MP
          channels: 3,
          background: { r: 0, g: 0, b: 0 },
        },
      })
        .png()
        .toFile(hugeImagePath);

      vi.mocked(db.query).mockResolvedValueOnce([
        { id: testVersionId, storage_path: hugeImagePath, mime_type: 'image/png' },
      ]);

      const result = await createAssetImageEnhancement(
        testTenantId,
        testAssetId,
        testVersionId,
        'NATURAL_RESTORE',
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.statusCode).toBe(400);
        expect(result.message).toContain('16 Megapíxeles');
      }
    });

    it('createAssetImageEnhancement debe crear exitosamente, limpiar archivo previo y despachar webhook', async () => {
      const oldDerivativePath = path.join(tempDir, 'old_enhance_derivative.webp');
      fs.writeFileSync(oldDerivativePath, 'old_data');

      // 1. SELECT version
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: testVersionId, storage_path: testImagePath, mime_type: 'image/png' },
      ]);
      // 2. SELECT existing for replacement unlinking
      vi.mocked(db.query).mockResolvedValueOnce([{ output_derivative_path: oldDerivativePath }]);
      // 3. INSERT / ON DUPLICATE KEY UPDATE
      vi.mocked(db.query).mockResolvedValueOnce({ insertId: 77 });

      const result = await createAssetImageEnhancement(
        testTenantId,
        testAssetId,
        testVersionId,
        'VIBRANT',
        { saturation: 1.6 },
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.enhancement.id).toBe(77);
        expect(result.enhancement.preset).toBe('VIBRANT');
        expect(result.enhancement.saturation).toBe(1.6);
        expect(fs.existsSync(oldDerivativePath)).toBe(false); // Cleaned up
        expect(dispatchWebhookEvent).toHaveBeenCalledWith(
          testTenantId,
          'asset.updated',
          expect.objectContaining({ event_type: 'IMAGE_ENHANCED' }),
        );
      }

      // 1b. Creation with existing enhancement having null path
      vi.mocked(db.query)
        .mockResolvedValueOnce([
          { id: testVersionId, storage_path: testImagePath, mime_type: 'image/png' },
        ])
        .mockResolvedValueOnce([{ output_derivative_path: null }])
        .mockResolvedValueOnce({ insertId: 78 });

      const successNull = await createAssetImageEnhancement(
        testTenantId,
        testAssetId,
        testVersionId,
        'WARM',
      );
      expect(successNull.success).toBe(true);

      // 1c. Creation with existing enhancement having non-existent path on disk
      vi.mocked(db.query)
        .mockResolvedValueOnce([
          { id: testVersionId, storage_path: testImagePath, mime_type: 'image/png' },
        ])
        .mockResolvedValueOnce([
          {
            output_derivative_path: path.join(
              STORAGE_ROOT,
              'derivatives',
              'tenant_100',
              'missing_old_enhance.webp',
            ),
          },
        ])
        .mockResolvedValueOnce({ insertId: 79 });

      const successMissing = await createAssetImageEnhancement(
        testTenantId,
        testAssetId,
        testVersionId,
        'COOL',
      );
      expect(successMissing.success).toBe(true);
    });

    it('listAssetImageEnhancements debe consultar BD con y sin filtro de preset', async () => {
      const mockRows = [
        {
          id: 1,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          preset: 'NATURAL_RESTORE',
          brightness: 1.05,
          contrast: 1.1,
          saturation: 1.05,
          sharpness: 1.2,
          gamma: 1.05,
          tint_hex: null,
          output_derivative_path: '/path/1.webp',
          enhancement_metadata: JSON.stringify({ preset: 'NATURAL_RESTORE' }),
          created_at: '2026-08-25T10:00:00Z',
        },
        {
          id: 2,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          preset: 'COOL',
          brightness: 1.0,
          contrast: 1.1,
          saturation: 1.1,
          sharpness: 1.1,
          gamma: 1.0,
          tint_hex: '#00BFFF',
          output_derivative_path: '/path/2.webp',
          enhancement_metadata: { preset: 'COOL' }, // already parsed
          created_at: '2026-08-25T10:05:00Z',
        },
      ];

      vi.mocked(db.query).mockResolvedValueOnce(mockRows);
      const listWithoutFilter = await listAssetImageEnhancements(testTenantId, testAssetId);
      expect(listWithoutFilter.length).toBe(2);
      expect(listWithoutFilter[0].preset).toBe('NATURAL_RESTORE');
      expect(listWithoutFilter[1].tint_hex).toBe('#00BFFF');

      vi.mocked(db.query).mockResolvedValueOnce([mockRows[1]]);
      const listWithFilter = await listAssetImageEnhancements(
        testTenantId,
        testAssetId,
        10,
        0,
        'COOL',
      );
      expect(listWithFilter.length).toBe(1);
      expect(listWithFilter[0].preset).toBe('COOL');
    });

    it('getAssetImageEnhancementById debe retornar registro formateado o null', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          preset: 'WARM',
          brightness: 1.05,
          contrast: 1.05,
          saturation: 1.15,
          sharpness: 1.0,
          gamma: 1.0,
          tint_hex: '#FF8C00',
          output_derivative_path: '/path/warm.webp',
          enhancement_metadata: JSON.stringify({ preset: 'WARM' }),
          created_at: '2026-08-25T10:00:00Z',
        },
      ]);

      const item = await getAssetImageEnhancementById(testTenantId, testAssetId, 1);
      expect(item).not.toBeNull();
      expect(item?.preset).toBe('WARM');

      vi.mocked(db.query).mockResolvedValueOnce([]);
      const notFound = await getAssetImageEnhancementById(testTenantId, testAssetId, 999);
      expect(notFound).toBeNull();
    });

    it('deleteAssetImageEnhancement debe eliminar archivo físico y registro de BD', async () => {
      // 1. Found with physical file
      const derivativeFile = path.join(tempDir, 'to_delete.webp');
      fs.writeFileSync(derivativeFile, 'sample_data');

      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 10,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          output_derivative_path: derivativeFile,
          enhancement_metadata: {},
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 });

      const deleted = await deleteAssetImageEnhancement(testTenantId, testAssetId, 10);
      expect(deleted).toBe(true);
      expect(fs.existsSync(derivativeFile)).toBe(false);
      expect(dispatchWebhookEvent).toHaveBeenCalledWith(
        testTenantId,
        'asset.updated',
        expect.objectContaining({ event_type: 'IMAGE_ENHANCEMENT_DELETED' }),
      );

      // 2. Found without output_derivative_path
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 11,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          output_derivative_path: null,
          enhancement_metadata: {},
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 });
      const deletedNoPath = await deleteAssetImageEnhancement(testTenantId, testAssetId, 11);
      expect(deletedNoPath).toBe(true);

      // 3. Not found branch
      vi.mocked(db.query).mockResolvedValueOnce([]);
      const deleteNotFound = await deleteAssetImageEnhancement(testTenantId, testAssetId, 999);
      expect(deleteNotFound).toBe(false);
    });
  });

  describe('5. Express HTTP Endpoints Integration & Security Tests', () => {
    describe('POST /api/v1/assets/:id/enhance', () => {
      it('debe retornar 400 si el ID del activo es inválido', async () => {
        const res = await request(app).post('/api/v1/assets/abc/enhance').send({});
        expect(res.status).toBe(400);
      });

      it('debe retornar 404 si el activo no existe en el tenant', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([]);
        const res = await request(app).post('/api/v1/assets/999/enhance').send({});
        expect(res.status).toBe(404);
        expect(res.body.message).toContain('Activo digital no encontrado');
      });

      it('debe retornar 403 si la evaluación de ACL deniega EDIT', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([
          { id: testAssetId, mime_type: 'image/png', current_version_id: 1 },
        ]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({
          allowed: false,
          reason: 'ACL_DENIED',
        });

        const res = await request(app).post(`/api/v1/assets/${testAssetId}/enhance`).send({});
        expect(res.status).toBe(403);
        expect(res.body.message).toContain('Acceso denegado');
      });

      it('debe retornar 400 o 404 si createAssetImageEnhancement falla', async () => {
        // 400 branch
        vi.mocked(db.query).mockResolvedValueOnce([
          { id: testAssetId, mime_type: 'image/svg+xml', current_version_id: 1 },
        ]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([
          { id: 1, storage_path: testImagePath, mime_type: 'image/svg+xml' },
        ]);

        const res400 = await request(app).post(`/api/v1/assets/${testAssetId}/enhance`).send({});
        expect(res400.status).toBe(400);
        expect(res400.body.error).toBe('Bad Request');
        expect(res400.body.message).toContain('no es una imagen raster compatible');

        // 404 branch (version not found in engine)
        vi.mocked(db.query).mockResolvedValueOnce([
          { id: testAssetId, mime_type: 'image/png', current_version_id: 1 },
        ]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([]);

        const res404 = await request(app).post(`/api/v1/assets/${testAssetId}/enhance`).send({});
        expect(res404.status).toBe(404);
        expect(res404.body.error).toBe('Not Found');
      });

      it('debe retornar 201 y registrar auditoría cuando la generación de realce es exitosa (con y sin preset)', async () => {
        // 1. With default preset (empty body)
        vi.mocked(db.query).mockResolvedValueOnce([
          { id: testAssetId, mime_type: 'image/png', current_version_id: 1 },
        ]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([
          { id: 1, storage_path: testImagePath, mime_type: 'image/png' },
        ]);
        vi.mocked(db.query).mockResolvedValueOnce([]);
        vi.mocked(db.query).mockResolvedValueOnce({ insertId: 88 });

        const resDefault = await request(app)
          .post(`/api/v1/assets/${testAssetId}/enhance`)
          .send({});

        expect(resDefault.status).toBe(201);
        expect(resDefault.body.data.id).toBe(88);

        // 2. With explicit preset
        vi.mocked(db.query).mockResolvedValueOnce([
          { id: testAssetId, mime_type: 'image/png', current_version_id: 1 },
        ]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([
          { id: 1, storage_path: testImagePath, mime_type: 'image/png' },
        ]);
        vi.mocked(db.query).mockResolvedValueOnce([]);
        vi.mocked(db.query).mockResolvedValueOnce({ insertId: 89 });

        const resExplicit = await request(app)
          .post(`/api/v1/assets/${testAssetId}/enhance`)
          .send({ preset: 'CINEMATIC' });

        expect(resExplicit.status).toBe(201);
        expect(resExplicit.body.data.id).toBe(89);
        expect(resExplicit.body.data.preset).toBe('CINEMATIC');
      });

      it('debe manejar excepciones inesperadas con status 500', async () => {
        vi.mocked(db.query).mockRejectedValueOnce(new Error('DB crash'));

        const res = await request(app).post(`/api/v1/assets/${testAssetId}/enhance`).send({});
        expect(res.status).toBe(500);
        expect(res.body.error).toBe('Internal Server Error');
      });
    });

    describe('GET /api/v1/assets/:id/enhancements', () => {
      it('debe retornar 400 si el ID de activo es inválido', async () => {
        const res = await request(app).get('/api/v1/assets/0/enhancements');
        expect(res.status).toBe(400);
      });

      it('debe retornar 404 si el activo no existe en el tenant', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([]);
        const res = await request(app).get('/api/v1/assets/999/enhancements');
        expect(res.status).toBe(404);
      });

      it('debe retornar 403 si ACL deniega VIEW', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([{ id: testAssetId }]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({
          allowed: false,
          reason: 'ACL_DENIED',
        });

        const res = await request(app).get(`/api/v1/assets/${testAssetId}/enhancements`);
        expect(res.status).toBe(403);
      });

      it('debe retornar 200 con la lista de realces', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([{ id: testAssetId }]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([
          {
            id: 1,
            tenant_id: testTenantId,
            asset_id: testAssetId,
            version_id: 1,
            preset: 'HIGH_CONTRAST_BW',
            brightness: 1.0,
            contrast: 1.5,
            saturation: 0.0,
            sharpness: 1.8,
            gamma: 1.1,
            tint_hex: null,
            output_derivative_path: '/path/bw.webp',
            enhancement_metadata: {},
            created_at: '2026-08-25T10:00:00Z',
          },
        ]);

        const res = await request(app).get(`/api/v1/assets/${testAssetId}/enhancements`);
        expect(res.status).toBe(200);
        expect(res.body.data.length).toBe(1);
        expect(res.body.data[0].preset).toBe('HIGH_CONTRAST_BW');
      });

      it('debe manejar errores de servidor con 500', async () => {
        vi.mocked(db.query).mockRejectedValueOnce(new Error('Query error'));
        const res = await request(app).get(`/api/v1/assets/${testAssetId}/enhancements`);
        expect(res.status).toBe(500);
      });
    });

    describe('GET /api/v1/assets/:id/enhancements/:enhancementId', () => {
      it('debe retornar 400 si los parámetros numéricos son inválidos', async () => {
        const res = await request(app).get(`/api/v1/assets/${testAssetId}/enhancements/abc`);
        expect(res.status).toBe(400);
      });

      it('debe retornar 403 si ACL deniega VIEW', async () => {
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({
          allowed: false,
          reason: 'ACL_DENIED',
        });

        const res = await request(app).get(`/api/v1/assets/${testAssetId}/enhancements/5`);
        expect(res.status).toBe(403);
      });

      it('debe retornar 404 si el realce no existe', async () => {
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([]);

        const res = await request(app).get(`/api/v1/assets/${testAssetId}/enhancements/99`);
        expect(res.status).toBe(404);
      });

      it('debe retornar 200 con el detalle del realce', async () => {
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([
          {
            id: 5,
            tenant_id: testTenantId,
            asset_id: testAssetId,
            version_id: 1,
            preset: 'VINTAGE_COLORIZED',
            brightness: 1.0,
            contrast: 1.15,
            saturation: 0.7,
            sharpness: 1.0,
            gamma: 1.0,
            tint_hex: '#704214',
            output_derivative_path: '/path/sepia.webp',
            enhancement_metadata: {},
            created_at: '2026-08-25T10:00:00Z',
          },
        ]);

        const res = await request(app).get(`/api/v1/assets/${testAssetId}/enhancements/5`);
        expect(res.status).toBe(200);
        expect(res.body.data.preset).toBe('VINTAGE_COLORIZED');
      });

      it('debe retornar 500 en fallo inesperado', async () => {
        vi.mocked(evaluateAclPermission).mockRejectedValueOnce(new Error('Fatal'));
        const res = await request(app).get(`/api/v1/assets/${testAssetId}/enhancements/5`);
        expect(res.status).toBe(500);
      });
    });

    describe('DELETE /api/v1/assets/:id/enhancements/:enhancementId', () => {
      it('debe retornar 400 si los parámetros son inválidos', async () => {
        const res = await request(app).delete(`/api/v1/assets/0/enhancements/5`);
        expect(res.status).toBe(400);
      });

      it('debe retornar 403 si ACL deniega EDIT', async () => {
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({
          allowed: false,
          reason: 'ACL_DENIED',
        });

        const res = await request(app).delete(`/api/v1/assets/${testAssetId}/enhancements/5`);
        expect(res.status).toBe(403);
      });

      it('debe retornar 404 si el realce a eliminar no existe', async () => {
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([]); // getAssetImageEnhancementById returns null

        const res = await request(app).delete(`/api/v1/assets/${testAssetId}/enhancements/99`);
        expect(res.status).toBe(404);
      });

      it('debe retornar 200 y registrar auditoría cuando la eliminación es exitosa', async () => {
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        const validDerivativePath = path.join(
          STORAGE_ROOT,
          'derivatives',
          'tenant_100',
          'to_delete.webp',
        );
        // Engine lookup
        vi.mocked(db.query).mockResolvedValueOnce([
          {
            id: 5,
            tenant_id: testTenantId,
            asset_id: testAssetId,
            output_derivative_path: validDerivativePath,
            enhancement_metadata: {},
          },
        ]);
        // Engine DELETE
        vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 });

        const res = await request(app).delete(`/api/v1/assets/${testAssetId}/enhancements/5`);
        expect(res.status).toBe(200);
        expect(res.body.message).toContain('eliminado exitosamente');
      });

      it('debe retornar 500 en fallo inesperado', async () => {
        vi.mocked(evaluateAclPermission).mockRejectedValueOnce(new Error('Fatal'));
        const res = await request(app).delete(`/api/v1/assets/${testAssetId}/enhancements/5`);
        expect(res.status).toBe(500);
      });
    });
  });

  describe('6. Rate Limiter Handler Test', () => {
    it('imageEnhancementRateLimiter handler debe retornar 429 cuando se excede el límite', async () => {
      const appLimit = express();
      appLimit.use(imageEnhancementRateLimiter);
      appLimit.post('/test-enhance-limit', (_req, res) => res.json({ ok: true }));

      for (let i = 0; i < 30; i++) {
        await request(appLimit).post('/test-enhance-limit');
      }
      const resBlocked = await request(appLimit).post('/test-enhance-limit');
      expect(resBlocked.status).toBe(429);
      expect(resBlocked.body.message).toContain('realce');
    });
  });
});
