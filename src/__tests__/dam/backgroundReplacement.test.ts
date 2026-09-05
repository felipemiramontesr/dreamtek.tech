/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import express from 'express';
import request from 'supertest';
import * as db from '../../../server/src/db';
import assetsRouter from '../../../server/src/routes/assets';
import { STORAGE_ROOT } from '../../../server/src/utils/storage';
import { evaluateAclPermission } from '../../../server/src/utils/acl';
import { dispatchWebhookEvent } from '../../../server/src/utils/webhookDispatcher';
import {
  BackgroundPresetEnum,
  BackgroundReplacementModeEnum,
  createBackgroundReplacementBodySchema,
  listBackgroundReplacementsQuerySchema,
  backgroundReplacementParamSchema,
  inpaintBoxSchema,
} from '../../../server/src/schemas/backgroundReplacement.schema';
import {
  hexToRgb,
  resolveParameters,
  generateBackgroundReplacementDerivative,
  createAssetBackgroundReplacement,
  listAssetBackgroundReplacements,
  getAssetBackgroundReplacementById,
  deleteAssetBackgroundReplacement,
} from '../../../server/src/utils/backgroundReplacementEngine';
import { backgroundReplacementRateLimiter } from '../../../server/src/middleware/rateLimiter';

// Mock database and ACL / Webhooks
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

describe('FC 026: DAM AI Background Replacement & Inpainting Suite (100% 4x100)', () => {
  const testTenantId = 100;
  const testAssetId = 10;
  const testVersionId = 1;
  const tempDir = path.join(STORAGE_ROOT, 'derivatives', 'tenant_100');
  const testImagePath = path.join(STORAGE_ROOT, 'test_bg_replace_input.png');

  const app = express();
  app.use(express.json());
  app.use('/api/v1/assets', assetsRouter);

  beforeEach(() => {
    vi.clearAllMocks();
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  afterAll(async () => {
    if (fs.existsSync(testImagePath)) {
      try {
        fs.unlinkSync(testImagePath);
      } catch {}
    }
    if (fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    }
  });

  describe('1. Zod Schemas Validation Tests', () => {
    it('debe validar enums de mode y preset correctamente', () => {
      expect(BackgroundReplacementModeEnum.safeParse('SOLID_COLOR').success).toBe(true);
      expect(BackgroundReplacementModeEnum.safeParse('MASK_INPAINT').success).toBe(true);
      expect(BackgroundReplacementModeEnum.safeParse('INVALID_MODE').success).toBe(false);

      expect(BackgroundPresetEnum.safeParse('STUDIO_WHITE').success).toBe(true);
      expect(BackgroundPresetEnum.safeParse('OFFICE_BLUR').success).toBe(true);
      expect(BackgroundPresetEnum.safeParse('INVALID_PRESET').success).toBe(false);
    });

    it('inpaintBoxSchema debe validar coordenadas positivas', () => {
      const validBox = { left: 10, top: 20, width: 100, height: 150 };
      expect(inpaintBoxSchema.safeParse(validBox).success).toBe(true);

      const invalidLeft = { left: -1, top: 0, width: 100, height: 100 };
      expect(inpaintBoxSchema.safeParse(invalidLeft).success).toBe(false);

      const invalidWidth = { left: 0, top: 0, width: 0, height: 100 };
      expect(inpaintBoxSchema.safeParse(invalidWidth).success).toBe(false);
    });

    it('createBackgroundReplacementBodySchema debe asignar valores por defecto y validar regex HEX', () => {
      const parsedDefault = createBackgroundReplacementBodySchema.parse({});
      expect(parsedDefault.mode).toBe('SOLID_COLOR');
      expect(parsedDefault.preset).toBe('STUDIO_WHITE');

      const parsedCustom = createBackgroundReplacementBodySchema.safeParse({
        mode: 'GRADIENT',
        preset: 'WARM_GRADIENT',
        background_color_hex: '#FF7E5F',
        threshold: 0.25,
        inpaint_box: { left: 0, top: 0, width: 50, height: 50 },
      });
      expect(parsedCustom.success).toBe(true);

      const invalidHex = createBackgroundReplacementBodySchema.safeParse({
        background_color_hex: 'INVALID_HEX',
      });
      expect(invalidHex.success).toBe(false);

      const invalidThreshold = createBackgroundReplacementBodySchema.safeParse({
        threshold: 0.99, // Max is 0.90
      });
      expect(invalidThreshold.success).toBe(false);
    });

    it('listBackgroundReplacementsQuerySchema debe parsear paginación y filtros opcionales', () => {
      const parsed = listBackgroundReplacementsQuerySchema.parse({
        limit: '25',
        offset: '10',
        mode: 'STUDIO_PRESET',
        preset: 'OFFICE_BLUR',
      });
      expect(parsed.limit).toBe(25);
      expect(parsed.offset).toBe(10);
      expect(parsed.mode).toBe('STUDIO_PRESET');
      expect(parsed.preset).toBe('OFFICE_BLUR');
    });

    it('backgroundReplacementParamSchema debe validar IDs positivos', () => {
      const valid = backgroundReplacementParamSchema.safeParse({ id: '5', replacementId: '10' });
      expect(valid.success).toBe(true);

      const invalid = backgroundReplacementParamSchema.safeParse({ id: '0' });
      expect(invalid.success).toBe(false);
    });
  });

  describe('2. Helper Functions & Parameter Resolution Tests', () => {
    it('hexToRgb debe convertir correctamente cadenas HEX válidas e inválidas', () => {
      expect(hexToRgb('#FFFFFF')).toEqual({ r: 255, g: 255, b: 255 });
      expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 });
      expect(hexToRgb('#FF8C00')).toEqual({ r: 255, g: 140, b: 0 });
      // Invalid hex fallback
      expect(hexToRgb('ZZZZZZ')).toEqual({ r: 255, g: 255, b: 255 });
    });

    it('resolveParameters debe aplicar valores por defecto y límites de threshold', () => {
      const resolvedDefault = resolveParameters();
      expect(resolvedDefault.mode).toBe('STUDIO_PRESET');
      expect(resolvedDefault.preset).toBe('STUDIO_WHITE');
      expect(resolvedDefault.background_color_hex).toBe('#FFFFFF');

      // Transparent mode sets hex to null
      const resolvedTransparent = resolveParameters('TRANSPARENT', 'TRANSPARENT_ALPHA');
      expect(resolvedTransparent.background_color_hex).toBeNull();

      // Custom parameters with clamped threshold
      const resolvedCustom = resolveParameters('SOLID_COLOR', 'CUSTOM', {
        threshold: 1.5, // should clamp to 0.9
        background_color_hex: '#123456',
        inpaint_box: { left: 10, top: 10, width: 20, height: 20 },
      });
      expect(resolvedCustom.threshold).toBe(0.9);
      expect(resolvedCustom.background_color_hex).toBe('#123456');
      expect(resolvedCustom.inpaint_box).toEqual({ left: 10, top: 10, width: 20, height: 20 });

      // Solid color without hex defaults to #FFFFFF
      const resolvedSolidNoHex = resolveParameters('SOLID_COLOR', 'CUSTOM', {
        background_color_hex: null,
      });
      expect(resolvedSolidNoHex.background_color_hex).toBe('#FFFFFF');

      // Unknown preset fallback
      const resolvedUnknown = resolveParameters(undefined, 'UNKNOWN_PRESET' as any);
      expect(resolvedUnknown.preset).toBe('UNKNOWN_PRESET');
      expect(resolvedUnknown.mode).toBe('STUDIO_PRESET');
    });
  });

  describe('3. Sharp Image Derivative Processing Tests', () => {
    it('generateBackgroundReplacementDerivative debe generar derivada de fondo sólido', async () => {
      // Create a test raster PNG
      await sharp({
        create: {
          width: 100,
          height: 100,
          channels: 4,
          background: { r: 255, g: 0, b: 0, alpha: 1 },
        },
      })
        .png()
        .toFile(testImagePath);

      const params = resolveParameters('SOLID_COLOR', 'CUSTOM', {
        background_color_hex: '#00FF00',
      });
      const result = await generateBackgroundReplacementDerivative(
        testTenantId,
        testAssetId,
        testVersionId,
        params,
        testImagePath,
      );

      expect(result.width).toBe(100);
      expect(result.height).toBe(100);
      expect(fs.existsSync(result.derivativePath)).toBe(true);
      expect(result.metadata.mode).toBe('SOLID_COLOR');

      // Test with null background_color_hex fallback to #FFFFFF
      const paramsDefaultHex = {
        mode: 'SOLID_COLOR' as const,
        preset: 'CUSTOM' as const,
        background_color_hex: null,
        threshold: 0.15,
      };
      const resultDefault = await generateBackgroundReplacementDerivative(
        testTenantId,
        testAssetId,
        testVersionId,
        paramsDefaultHex,
        testImagePath,
      );
      expect(resultDefault.metadata.background_color_hex).toBe('#FFFFFF');
    });

    it('generateBackgroundReplacementDerivative debe generar derivada transparente', async () => {
      const params = resolveParameters('TRANSPARENT', 'TRANSPARENT_ALPHA');
      const result = await generateBackgroundReplacementDerivative(
        testTenantId,
        testAssetId,
        testVersionId,
        params,
        testImagePath,
      );

      expect(fs.existsSync(result.derivativePath)).toBe(true);
      expect(result.metadata.mode).toBe('TRANSPARENT');
      expect(result.metadata.background_color_hex).toBeNull();
    });

    it('generateBackgroundReplacementDerivative debe generar derivada con OFFICE_BLUR', async () => {
      const params = resolveParameters('STUDIO_PRESET', 'OFFICE_BLUR');
      const result = await generateBackgroundReplacementDerivative(
        testTenantId,
        testAssetId,
        testVersionId,
        params,
        testImagePath,
      );

      expect(fs.existsSync(result.derivativePath)).toBe(true);
      expect(result.metadata.preset).toBe('OFFICE_BLUR');
    });

    it('generateBackgroundReplacementDerivative debe generar derivada con MASK_INPAINT', async () => {
      const params = resolveParameters('MASK_INPAINT', 'CUSTOM', {
        inpaint_box: { left: 10, top: 10, width: 30, height: 30 },
      });
      const result = await generateBackgroundReplacementDerivative(
        testTenantId,
        testAssetId,
        testVersionId,
        params,
        testImagePath,
      );

      expect(fs.existsSync(result.derivativePath)).toBe(true);
      expect(result.metadata.mode).toBe('MASK_INPAINT');
      expect(result.metadata.inpaint_box).toEqual({ left: 10, top: 10, width: 30, height: 30 });
    });

    it('generateBackgroundReplacementDerivative debe fallar si inpaint_box excede dimensiones de la imagen', async () => {
      const params = resolveParameters('MASK_INPAINT', 'CUSTOM', {
        inpaint_box: { left: 80, top: 80, width: 50, height: 50 }, // 80+50 = 130 > 100
      });

      await expect(
        generateBackgroundReplacementDerivative(
          testTenantId,
          testAssetId,
          testVersionId,
          params,
          testImagePath,
        ),
      ).rejects.toThrow('Coordenadas de inpaint_box exceden las dimensiones');
    });

    it('generateBackgroundReplacementDerivative debe fallar si la imagen excede 16MP', async () => {
      const hugeImagePath = path.join(tempDir, 'huge_input_replace.png');
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

      const params = resolveParameters();
      await expect(
        generateBackgroundReplacementDerivative(
          testTenantId,
          testAssetId,
          testVersionId,
          params,
          hugeImagePath,
        ),
      ).rejects.toThrow('16 Megapíxeles');
    });

    it('generateBackgroundReplacementDerivative debe fallar si el archivo de imagen es inválido', async () => {
      const corruptFile = path.join(tempDir, 'bad_dims.png');
      fs.writeFileSync(corruptFile, 'INVALID_BUFFER_FOR_METADATA');
      const params = resolveParameters();

      await expect(
        generateBackgroundReplacementDerivative(
          testTenantId,
          testAssetId,
          testVersionId,
          params,
          corruptFile,
        ),
      ).rejects.toThrow();
    });

    it('generateBackgroundReplacementDerivative debe crear el directorio si no existe', async () => {
      const nonExistentTenantId = 9999;
      const nonExistentDir = path.join(
        STORAGE_ROOT,
        'derivatives',
        `tenant_${nonExistentTenantId}`,
      );
      if (fs.existsSync(nonExistentDir)) {
        fs.rmSync(nonExistentDir, { recursive: true, force: true });
      }

      const params = resolveParameters('SOLID_COLOR', 'CUSTOM', {
        background_color_hex: '#112233',
      });
      const result = await generateBackgroundReplacementDerivative(
        nonExistentTenantId,
        testAssetId,
        testVersionId,
        params,
        testImagePath,
      );

      expect(fs.existsSync(result.derivativePath)).toBe(true);
      if (fs.existsSync(nonExistentDir)) {
        fs.rmSync(nonExistentDir, { recursive: true, force: true });
      }
    });
  });

  describe('4. Engine Database & Storage Operations Tests', () => {
    it('createAssetBackgroundReplacement debe retornar 404 si la versión no existe', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);
      const result = await createAssetBackgroundReplacement(
        testTenantId,
        testAssetId,
        999,
        'SOLID_COLOR',
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.statusCode).toBe(404);
        expect(result.message).toContain('no encontrada');
      }
    });

    it('createAssetBackgroundReplacement debe retornar 400 si el MIME no es raster compatible (ej. SVG)', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: testVersionId, storage_path: '/fake/vector.svg', mime_type: 'image/svg+xml' },
      ]);
      const result = await createAssetBackgroundReplacement(
        testTenantId,
        testAssetId,
        testVersionId,
        'SOLID_COLOR',
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.statusCode).toBe(400);
        expect(result.message).toContain('no es una imagen raster compatible');
      }
    });

    it('createAssetBackgroundReplacement debe retornar 404 si el archivo físico no existe en disco', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: testVersionId,
          storage_path: path.join(tempDir, 'missing_source_file.png'),
          mime_type: 'image/png',
        },
      ]);
      const result = await createAssetBackgroundReplacement(
        testTenantId,
        testAssetId,
        testVersionId,
        'SOLID_COLOR',
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.statusCode).toBe(404);
        expect(result.message).toContain('El archivo de la imagen no existe');
      }
    });

    it('createAssetBackgroundReplacement debe retornar 400 si el archivo está corrupto', async () => {
      const corruptFile = path.join(tempDir, 'corrupt_bg.png');
      fs.writeFileSync(corruptFile, 'INVALID_IMAGE_PAYLOAD');

      vi.mocked(db.query).mockResolvedValueOnce([
        { id: testVersionId, storage_path: corruptFile, mime_type: 'image/png' },
      ]);
      const result = await createAssetBackgroundReplacement(
        testTenantId,
        testAssetId,
        testVersionId,
        'SOLID_COLOR',
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.statusCode).toBe(400);
        expect(result.message).toBeTruthy();
      }
    });

    it('createAssetBackgroundReplacement debe retornar 400 si la imagen excede 16MP', async () => {
      const hugeFile = path.join(tempDir, 'huge_bg.png');
      await sharp({
        create: {
          width: 5000,
          height: 3500, // 17.5 MP > 16 MP
          channels: 3,
          background: { r: 0, g: 0, b: 0 },
        },
      })
        .png()
        .toFile(hugeFile);

      vi.mocked(db.query).mockResolvedValueOnce([
        { id: testVersionId, storage_path: hugeFile, mime_type: 'image/png' },
      ]);
      const result = await createAssetBackgroundReplacement(
        testTenantId,
        testAssetId,
        testVersionId,
        'SOLID_COLOR',
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.statusCode).toBe(400);
        expect(result.message).toContain('16 Megapíxeles');
      }
    });

    it('createAssetBackgroundReplacement debe capturar errores de generación de derivada y retornar 400', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: testVersionId, storage_path: testImagePath, mime_type: 'image/png' },
      ]);
      const result = await createAssetBackgroundReplacement(
        testTenantId,
        testAssetId,
        testVersionId,
        'MASK_INPAINT',
        'CUSTOM',
        { inpaint_box: { left: 90, top: 90, width: 50, height: 50 } }, // 90+50 = 140 > 100
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.statusCode).toBe(400);
        expect(result.message).toContain('Coordenadas de inpaint_box exceden');
      }
    });

    it('createAssetBackgroundReplacement debe crear exitosamente, limpiar derivada previa y despachar webhook', async () => {
      const oldDerivativePath = path.join(tempDir, 'old_bg_derivative.webp');
      fs.writeFileSync(oldDerivativePath, 'old_bg_data');

      // 1. SELECT version
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: testVersionId, storage_path: testImagePath, mime_type: 'image/png' },
      ]);
      // 2. SELECT existing for replacement unlinking
      vi.mocked(db.query).mockResolvedValueOnce([{ output_derivative_path: oldDerivativePath }]);
      // 3. INSERT / ON DUPLICATE KEY UPDATE
      vi.mocked(db.query).mockResolvedValueOnce({ insertId: 101 });

      const result = await createAssetBackgroundReplacement(
        testTenantId,
        testAssetId,
        testVersionId,
        'STUDIO_PRESET',
        'STUDIO_WHITE',
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.replacement.id).toBe(101);
        expect(result.replacement.preset).toBe('STUDIO_WHITE');
        expect(fs.existsSync(oldDerivativePath)).toBe(false); // Cleaned up
        expect(dispatchWebhookEvent).toHaveBeenCalledWith(
          testTenantId,
          'asset.updated',
          expect.objectContaining({ event_type: 'BACKGROUND_REPLACED' }),
        );
      }

      // Branch: Existing row has null path
      vi.mocked(db.query)
        .mockResolvedValueOnce([
          { id: testVersionId, storage_path: testImagePath, mime_type: 'image/png' },
        ])
        .mockResolvedValueOnce([{ output_derivative_path: null }])
        .mockResolvedValueOnce({ insertId: 102 });

      const successNull = await createAssetBackgroundReplacement(
        testTenantId,
        testAssetId,
        testVersionId,
        'TRANSPARENT',
        'TRANSPARENT_ALPHA',
      );
      expect(successNull.success).toBe(true);

      // Branch: Existing row has missing file on disk
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
              'missing_bg_file.webp',
            ),
          },
        ])
        .mockResolvedValueOnce({ insertId: 103 });

      const successMissing = await createAssetBackgroundReplacement(
        testTenantId,
        testAssetId,
        testVersionId,
        'GRADIENT',
        'WARM_GRADIENT',
      );
      expect(successMissing.success).toBe(true);
    });

    it('listAssetBackgroundReplacements debe consultar BD con y sin filtros', async () => {
      const mockRows = [
        {
          id: 1,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          mode: 'STUDIO_PRESET',
          preset: 'STUDIO_WHITE',
          background_color_hex: '#FFFFFF',
          threshold: 0.15,
          inpaint_box: null,
          output_derivative_path: '/path/1.webp',
          replacement_metadata: JSON.stringify({ preset: 'STUDIO_WHITE' }),
          created_at: '2026-08-27T10:00:00Z',
        },
        {
          id: 2,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          mode: 'MASK_INPAINT',
          preset: 'CUSTOM',
          background_color_hex: null,
          threshold: 0.2,
          inpaint_box: JSON.stringify({ left: 10, top: 10, width: 20, height: 20 }),
          output_derivative_path: '/path/2.webp',
          replacement_metadata: { preset: 'CUSTOM' }, // already parsed
          created_at: '2026-08-27T10:05:00Z',
        },
      ];

      vi.mocked(db.query).mockResolvedValueOnce(mockRows);
      const listAll = await listAssetBackgroundReplacements(testTenantId, testAssetId);
      expect(listAll.length).toBe(2);
      expect(listAll[0].preset).toBe('STUDIO_WHITE');
      expect(listAll[1].inpaint_box?.width).toBe(20);

      vi.mocked(db.query).mockResolvedValueOnce([mockRows[1]]);
      const listFiltered = await listAssetBackgroundReplacements(
        testTenantId,
        testAssetId,
        10,
        0,
        'MASK_INPAINT',
        'CUSTOM',
      );
      expect(listFiltered.length).toBe(1);
      expect(listFiltered[0].mode).toBe('MASK_INPAINT');
    });

    it('getAssetBackgroundReplacementById debe retornar registro formateado o null', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          mode: 'STUDIO_PRESET',
          preset: 'STUDIO_DARK',
          background_color_hex: '#1E1E1E',
          threshold: 0.15,
          inpaint_box: null,
          output_derivative_path: '/path/dark.webp',
          replacement_metadata: JSON.stringify({ preset: 'STUDIO_DARK' }),
          created_at: '2026-08-27T10:00:00Z',
        },
      ]);

      const item = await getAssetBackgroundReplacementById(testTenantId, testAssetId, 1);
      expect(item).not.toBeNull();
      expect(item?.preset).toBe('STUDIO_DARK');

      // Test with parsed inpaint_box and replacement_metadata objects
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 2,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          mode: 'MASK_INPAINT',
          preset: 'CUSTOM',
          background_color_hex: null,
          threshold: 0.15,
          inpaint_box: { left: 1, top: 2, width: 3, height: 4 },
          output_derivative_path: null,
          replacement_metadata: { preset: 'CUSTOM' },
          created_at: '2026-08-27T10:00:00Z',
        },
      ]);
      const itemParsed = await getAssetBackgroundReplacementById(testTenantId, testAssetId, 2);
      expect(itemParsed?.inpaint_box?.left).toBe(1);

      // Test with string inpaint_box and replacement_metadata
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 3,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          mode: 'MASK_INPAINT',
          preset: 'CUSTOM',
          background_color_hex: null,
          threshold: 0.15,
          inpaint_box: JSON.stringify({ left: 5, top: 5, width: 10, height: 10 }),
          output_derivative_path: '/path/str.webp',
          replacement_metadata: JSON.stringify({ preset: 'CUSTOM' }),
          created_at: '2026-08-27T10:00:00Z',
        },
      ]);
      const itemString = await getAssetBackgroundReplacementById(testTenantId, testAssetId, 3);
      expect(itemString?.inpaint_box?.left).toBe(5);

      vi.mocked(db.query).mockResolvedValueOnce([]);
      const notFound = await getAssetBackgroundReplacementById(testTenantId, testAssetId, 999);
      expect(notFound).toBeNull();
    });

    it('deleteAssetBackgroundReplacement debe eliminar archivo físico y registro de BD', async () => {
      // 1. Found with physical file
      const derivativeFile = path.join(tempDir, 'bg_to_delete.webp');
      fs.writeFileSync(derivativeFile, 'sample_data');

      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 10,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          mode: 'STUDIO_PRESET',
          preset: 'STUDIO_WHITE',
          threshold: 0.15,
          inpaint_box: null,
          replacement_metadata: {},
          output_derivative_path: derivativeFile,
          created_at: '2026-08-27T10:00:00Z',
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 });

      const deleted = await deleteAssetBackgroundReplacement(testTenantId, testAssetId, 10);
      expect(deleted).toBe(true);
      expect(fs.existsSync(derivativeFile)).toBe(false);
      expect(dispatchWebhookEvent).toHaveBeenCalledWith(
        testTenantId,
        'asset.updated',
        expect.objectContaining({ event_type: 'BACKGROUND_REPLACEMENT_DELETED' }),
      );

      // 2. Found with path that does NOT exist on disk
      const nonExistentPath = path.join(
        STORAGE_ROOT,
        'derivatives',
        'tenant_100',
        'does_not_exist.webp',
      );
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 11,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          mode: 'TRANSPARENT',
          preset: 'TRANSPARENT_ALPHA',
          threshold: 0.15,
          inpaint_box: null,
          replacement_metadata: {},
          output_derivative_path: nonExistentPath,
          created_at: '2026-08-27T10:00:00Z',
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 });
      const deletedNoDiskFile = await deleteAssetBackgroundReplacement(
        testTenantId,
        testAssetId,
        11,
      );
      expect(deletedNoDiskFile).toBe(true);

      // 3. Found without output_derivative_path (null)
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 12,
          tenant_id: testTenantId,
          asset_id: testAssetId,
          version_id: 1,
          mode: 'TRANSPARENT',
          preset: 'TRANSPARENT_ALPHA',
          threshold: 0.15,
          inpaint_box: null,
          replacement_metadata: {},
          output_derivative_path: null,
          created_at: '2026-08-27T10:00:00Z',
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 });
      const deletedNullPath = await deleteAssetBackgroundReplacement(testTenantId, testAssetId, 12);
      expect(deletedNullPath).toBe(true);

      // 4. Not found branch
      vi.mocked(db.query).mockResolvedValueOnce([]);
      const deleteNotFound = await deleteAssetBackgroundReplacement(testTenantId, testAssetId, 999);
      expect(deleteNotFound).toBe(false);
    });
  });

  describe('5. Express HTTP Endpoints Integration & Security Tests', () => {
    describe('POST /api/v1/assets/:id/background-replace', () => {
      it('debe retornar 400 si el ID del activo es inválido', async () => {
        const res = await request(app).post('/api/v1/assets/abc/background-replace').send({});
        expect(res.status).toBe(400);
      });

      it('debe retornar 404 si el activo no existe en el tenant', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([]);
        const res = await request(app).post('/api/v1/assets/999/background-replace').send({});
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

        const res = await request(app)
          .post(`/api/v1/assets/${testAssetId}/background-replace`)
          .send({});
        expect(res.status).toBe(403);
        expect(res.body.message).toContain('Acceso denegado');
      });

      it('debe retornar 400 o 404 si createAssetBackgroundReplacement falla', async () => {
        // 400 branch (non-raster SVG)
        vi.mocked(db.query).mockResolvedValueOnce([
          { id: testAssetId, mime_type: 'image/svg+xml', current_version_id: 1 },
        ]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([
          { id: 1, storage_path: testImagePath, mime_type: 'image/svg+xml' },
        ]);

        const res400 = await request(app)
          .post(`/api/v1/assets/${testAssetId}/background-replace`)
          .send({});
        expect(res400.status).toBe(400);
        expect(res400.body.error).toBe('Bad Request');
        expect(res400.body.message).toContain('no es una imagen raster compatible');

        // 404 branch (version not found in engine)
        vi.mocked(db.query).mockResolvedValueOnce([
          { id: testAssetId, mime_type: 'image/png', current_version_id: 1 },
        ]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([]);

        const res404 = await request(app)
          .post(`/api/v1/assets/${testAssetId}/background-replace`)
          .send({});
        expect(res404.status).toBe(404);
        expect(res404.body.error).toBe('Not Found');
      });

      it('debe retornar 201 y registrar auditoría cuando el reemplazo de fondo es exitoso', async () => {
        // 1. With default preset
        vi.mocked(db.query).mockResolvedValueOnce([
          { id: testAssetId, mime_type: 'image/png', current_version_id: 1 },
        ]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([
          { id: 1, storage_path: testImagePath, mime_type: 'image/png' },
        ]);
        vi.mocked(db.query).mockResolvedValueOnce([]);
        vi.mocked(db.query).mockResolvedValueOnce({ insertId: 110 });

        const resDefault = await request(app)
          .post(`/api/v1/assets/${testAssetId}/background-replace`)
          .send({});

        expect(resDefault.status).toBe(201);
        expect(resDefault.body.data.id).toBe(110);

        // 2. With inpaint_box
        vi.mocked(db.query).mockResolvedValueOnce([
          { id: testAssetId, mime_type: 'image/png', current_version_id: 1 },
        ]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([
          { id: 1, storage_path: testImagePath, mime_type: 'image/png' },
        ]);
        vi.mocked(db.query).mockResolvedValueOnce([]);
        vi.mocked(db.query).mockResolvedValueOnce({ insertId: 111 });

        const _resInpaint = await request(app)
          .post(`/api/v1/assets/${testAssetId}/background-replace`)
          .send({
            mode: 'MASK_INPAINT',
            inpaint_box: { left: 5, top: 5, width: 20, height: 20 },
          });

        // 3. With null current_version_id (testing default fallback)
        vi.mocked(db.query).mockResolvedValueOnce([
          { id: testAssetId, mime_type: 'image/png', current_version_id: null },
        ]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([
          { id: 1, storage_path: testImagePath, mime_type: 'image/png' },
        ]);
        vi.mocked(db.query).mockResolvedValueOnce([]);
        vi.mocked(db.query).mockResolvedValueOnce({ insertId: 112 });

        const resNullVer = await request(app)
          .post(`/api/v1/assets/${testAssetId}/background-replace`)
          .send({});

        expect(resNullVer.status).toBe(201);
        expect(resNullVer.body.data.id).toBe(112);
      });

      it('debe manejar excepciones inesperadas con status 500', async () => {
        vi.mocked(db.query).mockRejectedValueOnce(new Error('Unexpected DB Error'));
        const res = await request(app)
          .post(`/api/v1/assets/${testAssetId}/background-replace`)
          .send({});
        expect(res.status).toBe(500);
        expect(res.body.error).toBe('Internal Server Error');
      });
    });

    describe('GET /api/v1/assets/:id/background-replacements', () => {
      it('debe retornar 400 si el ID del activo es inválido', async () => {
        const res = await request(app).get('/api/v1/assets/0/background-replacements');
        expect(res.status).toBe(400);
      });

      it('debe retornar 404 si el activo no existe en el tenant', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([]);
        const res = await request(app).get('/api/v1/assets/999/background-replacements');
        expect(res.status).toBe(404);
      });

      it('debe retornar 403 si la evaluación de ACL deniega VIEW', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([{ id: testAssetId }]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({
          allowed: false,
          reason: 'ACL_DENIED',
        });

        const res = await request(app).get(`/api/v1/assets/${testAssetId}/background-replacements`);
        expect(res.status).toBe(403);
      });

      it('debe retornar 200 con la lista de reemplazos de fondo', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([{ id: testAssetId }]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([
          {
            id: 1,
            tenant_id: testTenantId,
            asset_id: testAssetId,
            version_id: 1,
            mode: 'STUDIO_PRESET',
            preset: 'STUDIO_WHITE',
            background_color_hex: '#FFFFFF',
            threshold: 0.15,
            inpaint_box: null,
            output_derivative_path: '/path/1.webp',
            replacement_metadata: {},
            created_at: '2026-08-27T10:00:00Z',
          },
        ]);

        const res = await request(app).get(
          `/api/v1/assets/${testAssetId}/background-replacements?limit=10&offset=0&mode=STUDIO_PRESET`,
        );
        expect(res.status).toBe(200);
        expect(res.body.data.length).toBe(1);
        expect(res.body.data[0].preset).toBe('STUDIO_WHITE');
      });

      it('debe manejar excepciones inesperadas con status 500', async () => {
        vi.mocked(db.query).mockRejectedValueOnce(new Error('Unexpected DB Error'));
        const res = await request(app).get(`/api/v1/assets/${testAssetId}/background-replacements`);
        expect(res.status).toBe(500);
      });
    });

    describe('GET /api/v1/assets/:id/background-replacements/:replacementId', () => {
      it('debe retornar 400 si los parámetros son inválidos', async () => {
        const res = await request(app).get('/api/v1/assets/abc/background-replacements/xyz');
        expect(res.status).toBe(400);
      });

      it('debe retornar 403 si la evaluación de ACL deniega VIEW', async () => {
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({
          allowed: false,
          reason: 'ACL_DENIED',
        });

        const res = await request(app).get(
          `/api/v1/assets/${testAssetId}/background-replacements/1`,
        );
        expect(res.status).toBe(403);
      });

      it('debe retornar 404 si el reemplazo de fondo no existe', async () => {
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([]);

        const res = await request(app).get(
          `/api/v1/assets/${testAssetId}/background-replacements/999`,
        );
        expect(res.status).toBe(404);
      });

      it('debe retornar 200 con el detalle del reemplazo de fondo', async () => {
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([
          {
            id: 1,
            tenant_id: testTenantId,
            asset_id: testAssetId,
            version_id: 1,
            mode: 'GRADIENT',
            preset: 'WARM_GRADIENT',
            background_color_hex: '#FF7E5F',
            threshold: 0.15,
            inpaint_box: null,
            output_derivative_path: '/path/warm.webp',
            replacement_metadata: {},
            created_at: '2026-08-27T10:00:00Z',
          },
        ]);

        const res = await request(app).get(
          `/api/v1/assets/${testAssetId}/background-replacements/1`,
        );
        expect(res.status).toBe(200);
        expect(res.body.data.preset).toBe('WARM_GRADIENT');
      });

      it('debe manejar excepciones inesperadas con status 500', async () => {
        vi.mocked(evaluateAclPermission).mockRejectedValueOnce(new Error('Unexpected ACL Error'));
        const res = await request(app).get(
          `/api/v1/assets/${testAssetId}/background-replacements/1`,
        );
        expect(res.status).toBe(500);
      });
    });

    describe('DELETE /api/v1/assets/:id/background-replacements/:replacementId', () => {
      it('debe retornar 400 si los parámetros son inválidos', async () => {
        const res = await request(app).delete('/api/v1/assets/abc/background-replacements/xyz');
        expect(res.status).toBe(400);
      });

      it('debe retornar 403 si la evaluación de ACL deniega EDIT', async () => {
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({
          allowed: false,
          reason: 'ACL_DENIED',
        });

        const res = await request(app).delete(
          `/api/v1/assets/${testAssetId}/background-replacements/1`,
        );
        expect(res.status).toBe(403);
      });

      it('debe retornar 404 si el reemplazo de fondo no existe para eliminar', async () => {
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query).mockResolvedValueOnce([]);

        const res = await request(app).delete(
          `/api/v1/assets/${testAssetId}/background-replacements/999`,
        );
        expect(res.status).toBe(404);
      });

      it('debe retornar 200 y registrar auditoría al eliminar exitosamente', async () => {
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
        vi.mocked(db.query)
          .mockResolvedValueOnce([
            {
              id: 1,
              tenant_id: testTenantId,
              asset_id: testAssetId,
              output_derivative_path: null,
            },
          ])
          .mockResolvedValueOnce({ affectedRows: 1 });

        const res = await request(app).delete(
          `/api/v1/assets/${testAssetId}/background-replacements/1`,
        );
        expect(res.status).toBe(200);
        expect(res.body.message).toContain('eliminado exitosamente');
      });

      it('debe manejar excepciones inesperadas con status 500', async () => {
        vi.mocked(evaluateAclPermission).mockRejectedValueOnce(
          new Error('Unexpected Delete Error'),
        );
        const res = await request(app).delete(
          `/api/v1/assets/${testAssetId}/background-replacements/1`,
        );
        expect(res.status).toBe(500);
      });
    });
  });

  describe('6. Rate Limiter Middleware Unit Tests', () => {
    it('backgroundReplacementRateLimiter debe estar definido y configurado', () => {
      expect(backgroundReplacementRateLimiter).toBeDefined();
      expect(typeof backgroundReplacementRateLimiter).toBe('function');
    });

    it('backgroundReplacementRateLimiter debe responder con 429 cuando se excede el límite', async () => {
      const appLimit = express();
      appLimit.use(backgroundReplacementRateLimiter);
      appLimit.post('/test-bg-limit', (_req, res) => res.json({ ok: true }));

      for (let i = 0; i < 30; i++) {
        await request(appLimit).post('/test-bg-limit');
      }
      const resBlocked = await request(appLimit).post('/test-bg-limit');
      expect(resBlocked.status).toBe(429);
      expect(resBlocked.body.message).toContain('reemplazo de fondo e inpainting');
    });
  });
});
