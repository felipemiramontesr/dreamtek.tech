/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

import assetsRouter from '../../../server/src/routes/assets';
import {
  SmartCropAspectRatioEnum,
  SmartCropStrategyEnum,
  createSmartCropBodySchema,
  listSmartCropsQuerySchema,
  smartCropParamSchema,
} from '../../../server/src/schemas/smartCrop.schema';
import {
  calculateCropBounds,
  calculateFocalPoint,
  generateSmartCropDerivative,
  createAssetSmartCrop,
  listAssetSmartCrops,
  getAssetSmartCropById,
  deleteAssetSmartCrop,
} from '../../../server/src/utils/smartCropEngine';
import { STORAGE_ROOT } from '../../../server/src/utils/storage';
import * as db from '../../../server/src/db';
import { dispatchWebhookEvent } from '../../../server/src/utils/webhookDispatcher';
import { evaluateAclPermission } from '../../../server/src/utils/acl';
import { smartCropRateLimiter } from '../../../server/src/middleware/rateLimiter';

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

vi.mock('../../../server/src/middleware/auth', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = {
      userId: 1,
      tenantId: 100,
      role: 'ADMIN',
      email: 'admin@dreamtek.tech',
    };
    next();
  },
}));

describe('DAM AI Smart Crop & Focal Point Auto-Detection (FC 024)', () => {
  let app: Express;
  const tempTestDir = path.join(STORAGE_ROOT, 'test_smart_crops');
  let testImagePath: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/v1/assets', assetsRouter);

    fs.mkdirSync(tempTestDir, { recursive: true });
    testImagePath = path.join(tempTestDir, `test_img_${Date.now()}.png`);

    // Create a valid 200x100 solid image
    await sharp({
      create: {
        width: 200,
        height: 100,
        channels: 4,
        background: { r: 255, g: 100, b: 50, alpha: 1 },
      },
    })
      .png()
      .toFile(testImagePath);
  });

  afterEach(() => {
    if (fs.existsSync(tempTestDir)) {
      fs.rmSync(tempTestDir, { recursive: true, force: true });
    }
  });

  describe('1. Zod Validation Schemas (smartCrop.schema.ts)', () => {
    it('validates SmartCropAspectRatioEnum and SmartCropStrategyEnum', () => {
      expect(SmartCropAspectRatioEnum.safeParse('1:1').success).toBe(true);
      expect(SmartCropAspectRatioEnum.safeParse('16:9').success).toBe(true);
      expect(SmartCropAspectRatioEnum.safeParse('9:16').success).toBe(true);
      expect(SmartCropAspectRatioEnum.safeParse('4:5').success).toBe(true);
      expect(SmartCropAspectRatioEnum.safeParse('4:3').success).toBe(true);
      expect(SmartCropAspectRatioEnum.safeParse('3:2').success).toBe(true);
      expect(SmartCropAspectRatioEnum.safeParse('2:3').success).toBe(true);
      expect(SmartCropAspectRatioEnum.safeParse('21:9').success).toBe(false);

      expect(SmartCropStrategyEnum.safeParse('entropy').success).toBe(true);
      expect(SmartCropStrategyEnum.safeParse('attention').success).toBe(true);
      expect(SmartCropStrategyEnum.safeParse('random').success).toBe(false);
    });

    it('validates createSmartCropBodySchema', () => {
      const defaultParsed = createSmartCropBodySchema.safeParse({});
      expect(defaultParsed.success).toBe(true);
      if (defaultParsed.success) {
        expect(defaultParsed.data.aspect_ratio).toBe('1:1');
        expect(defaultParsed.data.strategy).toBe('entropy');
      }

      const fullValid = createSmartCropBodySchema.safeParse({
        aspect_ratio: '16:9',
        strategy: 'attention',
        focal_x: 0.75,
        focal_y: 0.25,
        target_width: 800,
        target_height: 450,
      });
      expect(fullValid.success).toBe(true);

      const invalidFocal = createSmartCropBodySchema.safeParse({
        focal_x: 1.5,
      });
      expect(invalidFocal.success).toBe(false);

      const invalidDimension = createSmartCropBodySchema.safeParse({
        target_width: 5,
      });
      expect(invalidDimension.success).toBe(false);
    });

    it('validates listSmartCropsQuerySchema and smartCropParamSchema', () => {
      const queryParsed = listSmartCropsQuerySchema.safeParse({
        limit: '20',
        offset: '5',
        aspect_ratio: '9:16',
      });
      expect(queryParsed.success).toBe(true);
      if (queryParsed.success) {
        expect(queryParsed.data.limit).toBe(20);
        expect(queryParsed.data.offset).toBe(5);
        expect(queryParsed.data.aspect_ratio).toBe('9:16');
      }

      const paramParsed = smartCropParamSchema.safeParse({
        id: '10',
        cropId: '25',
      });
      expect(paramParsed.success).toBe(true);

      const invalidParam = smartCropParamSchema.safeParse({
        id: '-1',
        cropId: 'abc',
      });
      expect(invalidParam.success).toBe(false);
    });
  });

  describe('2. Smart Crop Engine Utilities (smartCropEngine.ts)', () => {
    it('calculateCropBounds clamps and centers correctly', () => {
      // 1. Wide source to square target (sourceRatio 2 > targetRatio 1)
      const wideToSquare = calculateCropBounds(200, 100, '1:1', 0.5, 0.5);
      expect(wideToSquare.width).toBe(100);
      expect(wideToSquare.height).toBe(100);
      expect(wideToSquare.left).toBe(50);
      expect(wideToSquare.top).toBe(0);

      // 2. Square source to wide target (sourceRatio 1 < targetRatio 1.777)
      const squareToWide = calculateCropBounds(100, 100, '16:9', 0.5, 0.5);
      expect(squareToWide.width).toBe(100);
      expect(squareToWide.height).toBe(56);
      expect(squareToWide.left).toBe(0);
      expect(squareToWide.top).toBe(22);

      // 3. Focal point near right edge (left clamping)
      const rightEdge = calculateCropBounds(200, 100, '1:1', 0.95, 0.5);
      expect(rightEdge.left).toBe(100); // 200 - 100 = 100

      // 4. Focal point near top edge (top clamping)
      const topEdge = calculateCropBounds(100, 100, '16:9', 0.5, 0.05);
      expect(topEdge.top).toBe(0);
    });

    it('calculateFocalPoint detects prominence or falls back safely', async () => {
      const entropyFocal = await calculateFocalPoint(testImagePath, 'entropy');
      expect(entropyFocal.focal_x).toBeGreaterThanOrEqual(0);
      expect(entropyFocal.focal_x).toBeLessThanOrEqual(1);
      expect(entropyFocal.confidence).toBe(0.95);

      const attentionFocal = await calculateFocalPoint(testImagePath, 'attention');
      expect(attentionFocal.focal_y).toBeGreaterThanOrEqual(0);
      expect(attentionFocal.focal_y).toBeLessThanOrEqual(1);

      // Invalid file path triggers catch fallback
      const fallback = await calculateFocalPoint('/non/existent/path/image.png');
      expect(fallback.focal_x).toBe(0.5);
      expect(fallback.focal_y).toBe(0.5);
      expect(fallback.confidence).toBe(0.5);
    });

    it('generateSmartCropDerivative creates WebP derivative with optional resizing', async () => {
      const cropBounds = { left: 10, top: 10, width: 80, height: 80 };

      // 1. Without target dimensions
      const outPath1 = await generateSmartCropDerivative(
        100,
        1,
        1,
        '1:1',
        testImagePath,
        cropBounds,
      );
      expect(fs.existsSync(outPath1)).toBe(true);

      // 2. With target dimensions
      const outPath2 = await generateSmartCropDerivative(
        100,
        1,
        1,
        '16:9',
        testImagePath,
        cropBounds,
        160,
        90,
      );
      expect(fs.existsSync(outPath2)).toBe(true);
      const meta = await sharp(outPath2).metadata();
      expect(meta.width).toBe(160);
      expect(meta.height).toBe(90);
    });

    it('createAssetSmartCrop handles error branches and success flow', async () => {
      // 1. Version not found (404)
      vi.mocked(db.query).mockResolvedValueOnce([]);
      const notFound = await createAssetSmartCrop(100, 1, 1);
      expect(notFound.success).toBe(false);
      expect(notFound.statusCode).toBe(404);

      // 2. Non-raster MIME (e.g. SVG or MP4) -> 400 Bad Request (Condition C-024.2)
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 1, storage_path: testImagePath, mime_type: 'image/svg+xml' },
      ]);
      const svgReject = await createAssetSmartCrop(100, 1, 1);
      expect(svgReject.success).toBe(false);
      expect(svgReject.statusCode).toBe(400);
      expect(svgReject.message).toContain('SVG');

      // 3. Storage file does not exist (404)
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 1, storage_path: path.join(STORAGE_ROOT, 'missing.png'), mime_type: 'image/png' },
      ]);
      const missingFile = await createAssetSmartCrop(100, 1, 1);
      expect(missingFile.success).toBe(false);
      expect(missingFile.statusCode).toBe(404);

      // 4. Corrupted / 0-dimension image (400)
      const emptyImagePath = path.join(tempTestDir, 'empty.png');
      fs.writeFileSync(emptyImagePath, Buffer.alloc(0));
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 1, storage_path: emptyImagePath, mime_type: 'image/png' },
      ]);
      const zeroDim = await createAssetSmartCrop(100, 1, 1);
      expect(zeroDim.success).toBe(false);
      expect(zeroDim.statusCode).toBe(400);

      // 5. Exceeding 16MP resolution limit (Condition C-024.4)
      const hugeImagePath = path.join(tempTestDir, 'huge.png');
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
        { id: 1, storage_path: hugeImagePath, mime_type: 'image/png' },
      ]);
      const hugeReject = await createAssetSmartCrop(100, 1, 1);
      expect(hugeReject.success).toBe(false);
      expect(hugeReject.statusCode).toBe(400);
      expect(hugeReject.message).toContain('16 Megapíxeles');

      // 6. Successful creation with auto focal point and previous crop replacement
      const oldDerivPath = path.join(tempTestDir, 'old_crop.webp');
      fs.writeFileSync(oldDerivPath, 'old data');

      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: 1, storage_path: testImagePath, mime_type: 'image/png' }]) // version query
        .mockResolvedValueOnce([{ output_derivative_path: oldDerivPath }]) // existing crop query
        .mockResolvedValueOnce({ insertId: 55 }); // upsert

      const successAuto = await createAssetSmartCrop(100, 1, 1, '1:1', 'entropy');
      expect(successAuto.success).toBe(true);
      expect(successAuto.smartCrop?.id).toBe(55);
      expect(fs.existsSync(oldDerivPath)).toBe(false); // unlinked old derivative
      expect(dispatchWebhookEvent).toHaveBeenCalled();

      // 6b. Successful creation with existing crop having null path
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: 1, storage_path: testImagePath, mime_type: 'image/png' }])
        .mockResolvedValueOnce([{ output_derivative_path: null }])
        .mockResolvedValueOnce({ insertId: 57 });

      const successNullOld = await createAssetSmartCrop(100, 1, 1, '1:1', 'entropy');
      expect(successNullOld.success).toBe(true);

      // 6c. Successful creation with existing crop having non-existent path on disk
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: 1, storage_path: testImagePath, mime_type: 'image/png' }])
        .mockResolvedValueOnce([
          {
            output_derivative_path: path.join(
              STORAGE_ROOT,
              'derivatives',
              'tenant_100',
              'old_missing.webp',
            ),
          },
        ])
        .mockResolvedValueOnce({ insertId: 58 });

      const successMissingOld = await createAssetSmartCrop(100, 1, 1, '1:1', 'entropy');
      expect(successMissingOld.success).toBe(true);

      // 7. Successful creation with explicit focal coordinates and target dimensions
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: 1, storage_path: testImagePath, mime_type: 'image/png' }])
        .mockResolvedValueOnce([]) // no existing crop
        .mockResolvedValueOnce({ insertId: 56 });

      const successExplicit = await createAssetSmartCrop(
        100,
        1,
        1,
        '16:9',
        'attention',
        0.8,
        0.3,
        160,
        90,
      );
      expect(successExplicit.success).toBe(true);
      expect(successExplicit.smartCrop?.focal_x).toBe(0.8);
      expect(successExplicit.smartCrop?.focal_y).toBe(0.3);
    });

    it('listAssetSmartCrops returns list with optional aspect ratio filter', async () => {
      const mockCrop = {
        id: 1,
        tenant_id: 100,
        asset_id: 10,
        version_id: 1,
        aspect_ratio: '1:1',
        focal_x: '0.500',
        focal_y: '0.500',
        crop_width: 100,
        crop_height: 100,
        output_derivative_path: '/path/crop.webp',
        crop_metadata: JSON.stringify({ strategy: 'entropy' }),
        created_at: new Date().toISOString(),
      };

      vi.mocked(db.query)
        .mockResolvedValueOnce([mockCrop]) // with aspect_ratio filter
        .mockResolvedValueOnce([{ ...mockCrop, crop_metadata: { strategy: 'attention' } }]); // without filter (metadata object)

      const filteredList = await listAssetSmartCrops(100, 10, 10, 0, '1:1');
      expect(filteredList.length).toBe(1);
      expect(filteredList[0].crop_metadata.strategy).toBe('entropy');

      const allList = await listAssetSmartCrops(100, 10, 10, 0);
      expect(allList.length).toBe(1);
      expect(allList[0].crop_metadata.strategy).toBe('attention');
    });

    it('getAssetSmartCropById returns single crop or null', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([]) // not found
        .mockResolvedValueOnce([
          {
            id: 1,
            tenant_id: 100,
            asset_id: 10,
            version_id: 1,
            aspect_ratio: '1:1',
            focal_x: 0.5,
            focal_y: 0.5,
            crop_width: 100,
            crop_height: 100,
            output_derivative_path: '/path/crop.webp',
            crop_metadata: JSON.stringify({ strategy: 'entropy' }),
          },
        ]) // string metadata
        .mockResolvedValueOnce([
          {
            id: 2,
            tenant_id: 100,
            asset_id: 10,
            version_id: 1,
            aspect_ratio: '16:9',
            focal_x: 0.5,
            focal_y: 0.5,
            crop_width: 160,
            crop_height: 90,
            output_derivative_path: '/path/crop2.webp',
            crop_metadata: { strategy: 'attention' },
          },
        ]); // object metadata

      const notFound = await getAssetSmartCropById(100, 10, 999);
      expect(notFound).toBeNull();

      const foundString = await getAssetSmartCropById(100, 10, 1);
      expect(foundString).not.toBeNull();
      expect(foundString?.id).toBe(1);

      const foundObj = await getAssetSmartCropById(100, 10, 2);
      expect(foundObj).not.toBeNull();
      expect(foundObj?.id).toBe(2);
    });

    it('deleteAssetSmartCrop handles missing record, missing file and physical unlinking', async () => {
      // 1. Not found
      vi.mocked(db.query).mockResolvedValueOnce([]);
      const notFound = await deleteAssetSmartCrop(100, 10, 999);
      expect(notFound).toBe(false);

      // 2. Found without path
      vi.mocked(db.query)
        .mockResolvedValueOnce([
          {
            id: 1,
            tenant_id: 100,
            asset_id: 10,
            version_id: 1,
            output_derivative_path: null,
            crop_metadata: {},
          },
        ])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);
      const deletedNoPath = await deleteAssetSmartCrop(100, 10, 1);
      expect(deletedNoPath).toBe(true);

      // 3. Found with physical file
      const derivativesDir = path.join(STORAGE_ROOT, 'derivatives', 'tenant_100');
      fs.mkdirSync(derivativesDir, { recursive: true });
      const testCropFile = path.join(derivativesDir, `test_crop_${Date.now()}.webp`);
      fs.writeFileSync(testCropFile, 'crop data');

      vi.mocked(db.query)
        .mockResolvedValueOnce([
          {
            id: 2,
            tenant_id: 100,
            asset_id: 10,
            version_id: 1,
            output_derivative_path: testCropFile,
            crop_metadata: {},
          },
        ])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      const deletedFile = await deleteAssetSmartCrop(100, 10, 2);
      expect(deletedFile).toBe(true);
      expect(fs.existsSync(testCropFile)).toBe(false);

      // 4. Found with non-existent physical file path
      vi.mocked(db.query)
        .mockResolvedValueOnce([
          {
            id: 3,
            tenant_id: 100,
            asset_id: 10,
            version_id: 1,
            output_derivative_path: path.join(
              STORAGE_ROOT,
              'derivatives',
              'tenant_100',
              'missing.webp',
            ),
            crop_metadata: {},
          },
        ])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      const deletedMissing = await deleteAssetSmartCrop(100, 10, 3);
      expect(deletedMissing).toBe(true);
    });
  });

  describe('3. POST /api/v1/assets/:id/smart-crop', () => {
    it('returns 400 for invalid asset ID', async () => {
      const res = await request(app).post('/api/v1/assets/abc/smart-crop').send({});
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('ID de activo inválido');
    });

    it('returns 404 if asset not found in tenant', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await request(app).post('/api/v1/assets/999/smart-crop').send({});
      expect(res.status).toBe(404);
      expect(res.body.message).toContain('Activo digital no encontrado');
    });

    it('returns 403 if ACL denies EDIT permission', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 10, mime_type: 'image/png', current_version_id: 1 },
      ]);
      vi.mocked(evaluateAclPermission).mockResolvedValueOnce({
        allowed: false,
        reason: 'DENIED',
      });

      const res = await request(app).post('/api/v1/assets/10/smart-crop').send({});
      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Acceso denegado');
    });

    it('returns 400 if asset is not a raster image', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 10, mime_type: 'image/svg+xml', current_version_id: 1 },
      ]);
      vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });

      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 1, storage_path: testImagePath, mime_type: 'image/svg+xml' },
      ]);

      const res = await request(app).post('/api/v1/assets/10/smart-crop').send({});
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('SVG');
    });

    it('creates smart crop returning 201 Created', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 10, mime_type: 'image/png', current_version_id: 1 },
      ]);
      vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });

      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: 1, storage_path: testImagePath, mime_type: 'image/png' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce({ insertId: 77 });

      const res = await request(app).post('/api/v1/assets/10/smart-crop').send({
        aspect_ratio: '1:1',
        strategy: 'entropy',
      });

      expect(res.status).toBe(201);
      expect(res.body.message).toContain('Recorte inteligente generado exitosamente');
      expect(res.body.data.id).toBe(77);
    });

    it('returns error when engine create fails with 404 or 400', async () => {
      // 1. Engine 404 (version missing)
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: 10, mime_type: 'image/png', current_version_id: 1 }])
        .mockResolvedValueOnce([]); // version query returns []
      vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });

      const res404 = await request(app).post('/api/v1/assets/10/smart-crop').send({
        aspect_ratio: '1:1',
      });
      expect(res404.status).toBe(404);

      // 2. Engine 400 (corrupt/empty image)
      const emptyImagePath = path.join(tempTestDir, 'empty_route.png');
      fs.writeFileSync(emptyImagePath, Buffer.alloc(0));

      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: 10, mime_type: 'image/png', current_version_id: 1 }])
        .mockResolvedValueOnce([{ id: 1, storage_path: emptyImagePath, mime_type: 'image/png' }]);
      vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });

      const res400 = await request(app).post('/api/v1/assets/10/smart-crop').send({
        aspect_ratio: '1:1',
      });
      expect(res400.status).toBe(400);
    });
  });

  describe('4. GET /api/v1/assets/:id/smart-crops', () => {
    it('returns 400 for invalid asset ID', async () => {
      const res = await request(app).get('/api/v1/assets/invalid/smart-crops');
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('ID de activo inválido');
    });

    it('returns 404 if asset not found in tenant', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await request(app).get('/api/v1/assets/999/smart-crops');
      expect(res.status).toBe(404);
    });

    it('returns 403 if ACL denies VIEW permission', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([{ id: 10 }]);
      vi.mocked(evaluateAclPermission).mockResolvedValueOnce({
        allowed: false,
        reason: 'DENIED',
      });

      const res = await request(app).get('/api/v1/assets/10/smart-crops');
      expect(res.status).toBe(403);
    });

    it('returns 200 with list of smart crops', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([{ id: 10 }]);
      vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });

      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 100,
          asset_id: 10,
          version_id: 1,
          aspect_ratio: '1:1',
          focal_x: 0.5,
          focal_y: 0.5,
          crop_width: 100,
          crop_height: 100,
          output_derivative_path: '/path/crop.webp',
          crop_metadata: JSON.stringify({ strategy: 'entropy' }),
          created_at: new Date().toISOString(),
        },
      ]);

      const res = await request(app).get('/api/v1/assets/10/smart-crops');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(1);
    });
  });

  describe('5. GET /api/v1/assets/:id/smart-crops/:cropId', () => {
    it('returns 400 for invalid params', async () => {
      const res = await request(app).get('/api/v1/assets/10/smart-crops/abc');
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Parámetros inválidos');
    });

    it('returns 403 if ACL denies VIEW permission', async () => {
      vi.mocked(evaluateAclPermission).mockResolvedValueOnce({
        allowed: false,
        reason: 'DENIED',
      });

      const res = await request(app).get('/api/v1/assets/10/smart-crops/1');
      expect(res.status).toBe(403);
    });

    it('returns 404 if smart crop not found', async () => {
      vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await request(app).get('/api/v1/assets/10/smart-crops/999');
      expect(res.status).toBe(404);
    });

    it('returns 200 with smart crop details', async () => {
      vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 100,
          asset_id: 10,
          version_id: 1,
          aspect_ratio: '1:1',
          focal_x: 0.5,
          focal_y: 0.5,
          crop_width: 100,
          crop_height: 100,
          output_derivative_path: '/path/crop.webp',
          crop_metadata: { strategy: 'entropy' },
          created_at: new Date().toISOString(),
        },
      ]);

      const res = await request(app).get('/api/v1/assets/10/smart-crops/1');
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(1);
    });
  });

  describe('6. DELETE /api/v1/assets/:id/smart-crops/:cropId', () => {
    it('returns 400 for invalid params', async () => {
      const res = await request(app).delete('/api/v1/assets/10/smart-crops/invalid');
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Parámetros inválidos');
    });

    it('returns 403 if ACL denies EDIT permission', async () => {
      vi.mocked(evaluateAclPermission).mockResolvedValueOnce({
        allowed: false,
        reason: 'DENIED',
      });

      const res = await request(app).delete('/api/v1/assets/10/smart-crops/1');
      expect(res.status).toBe(403);
    });

    it('returns 404 if smart crop not found on delete', async () => {
      vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await request(app).delete('/api/v1/assets/10/smart-crops/999');
      expect(res.status).toBe(404);
    });

    it('deletes smart crop and returns 200 OK on success', async () => {
      vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
      vi.mocked(db.query)
        .mockResolvedValueOnce([
          {
            id: 1,
            tenant_id: 100,
            asset_id: 10,
            version_id: 1,
            output_derivative_path: null,
            crop_metadata: {},
          },
        ])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      const res = await request(app).delete('/api/v1/assets/10/smart-crops/1');
      expect(res.status).toBe(200);
      expect(res.body.message).toContain('eliminado exitosamente');
    });
  });

  describe('7. Rate Limiting & Server Error Handlers', () => {
    it('handles unexpected exceptions with 500 status', async () => {
      vi.mocked(db.query).mockRejectedValue(new Error('Fatal Smart Crop DB Crash'));

      // 1. POST
      const postRes = await request(app).post('/api/v1/assets/10/smart-crop').send({});
      expect(postRes.status).toBe(500);

      // 2. GET list
      const getListRes = await request(app).get('/api/v1/assets/10/smart-crops');
      expect(getListRes.status).toBe(500);

      // 3. GET detail
      vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
      vi.mocked(db.query).mockRejectedValueOnce(new Error('Fatal Smart Crop DB Crash'));
      const getDetailRes = await request(app).get('/api/v1/assets/10/smart-crops/1');
      expect(getDetailRes.status).toBe(500);

      // 4. DELETE
      vi.mocked(evaluateAclPermission).mockResolvedValueOnce({ allowed: true });
      vi.mocked(db.query).mockRejectedValueOnce(new Error('Fatal Smart Crop DB Crash'));
      const deleteRes = await request(app).delete('/api/v1/assets/10/smart-crops/1');
      expect(deleteRes.status).toBe(500);
    });

    it('triggers smartCropRateLimiter 429 response handler', async () => {
      const appLimit = express();
      appLimit.use(smartCropRateLimiter);
      appLimit.post('/test-smartcrop-limit', (_req, res) => res.json({ ok: true }));

      for (let i = 0; i < 30; i++) {
        await request(appLimit).post('/test-smartcrop-limit');
      }
      const resBlocked = await request(appLimit).post('/test-smartcrop-limit');
      expect(resBlocked.status).toBe(429);
      expect(resBlocked.body.message).toContain('smart crop');
    });
  });
});
