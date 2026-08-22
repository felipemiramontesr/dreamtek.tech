/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { STORAGE_ROOT } from '../../../server/src/utils/storage';
import * as db from '../../../server/src/db';
import app from '../../../server/src/index';
import {
  aiVisionStatusEnum,
  aiVisionProviderEnum,
  analyzeAssetBodySchema,
  applyAiTagsBodySchema,
} from '../../../server/src/schemas/assetAiMetadata.schema';
import {
  analyzeAssetVisuals,
  getAssetAiMetadata,
  applyAiLabelsAsTags,
  getApproximateColorName,
  extractVisualFeatures,
  parseJsonField,
} from '../../../server/src/utils/aiVisionEngine';
import { aiRateLimiter } from '../../../server/src/middleware/rateLimiter';

vi.mock('../../../server/src/db', () => ({
  query: vi.fn(),
  pool: {
    execute: vi.fn(),
    getConnection: vi.fn(),
  },
}));

vi.mock('../../../server/src/utils/webhookDispatcher', () => ({
  dispatchWebhookEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../server/src/utils/acl', () => ({
  evaluateAclPermission: vi.fn().mockResolvedValue({ allowed: true }),
}));

const TEST_SECRET = 'test-jwt-secret-key-super-secure-and-long-enough-for-hs512-compliance-testing';
process.env.JWT_SECRET = TEST_SECRET;

function makeToken(payload: { userId: number; role: string; tenantId: number }): string {
  return jwt.sign(
    {
      userId: payload.userId,
      uid: payload.userId,
      email: `${payload.role.toLowerCase()}@dreamtek.tech`,
      role: payload.role,
      tenantId: payload.tenantId,
    },
    TEST_SECRET,
    { algorithm: 'HS512', expiresIn: '1h' },
  );
}

describe('DAM AI Auto-Tagging & Smart Metadata Extraction (FC 015)', () => {
  const adminToken = makeToken({ userId: 1, role: 'ADMIN', tenantId: 100 });
  const clientToken = makeToken({ userId: 2, role: 'CLIENT', tenantId: 100 });

  const testLandscapePng = path.join(STORAGE_ROOT, 'test_ai_landscape.png');
  const testOpaquePng = path.join(STORAGE_ROOT, 'test_ai_opaque.png');
  const testHighHeightJpg = path.join(STORAGE_ROOT, 'test_ai_high_height.jpg');
  const testPortraitJpg = path.join(STORAGE_ROOT, 'test_ai_portrait.jpg');
  const testSquareWebp = path.join(STORAGE_ROOT, 'test_ai_square.webp');
  const testSvgFile = path.join(STORAGE_ROOT, 'test_ai_vector.svg');
  const testTiffFile = path.join(STORAGE_ROOT, 'test_ai_sample.tiff');
  const testCorruptedFile = path.join(STORAGE_ROOT, 'test_ai_corrupted.png');

  beforeAll(async () => {
    if (!fs.existsSync(STORAGE_ROOT)) {
      fs.mkdirSync(STORAGE_ROOT, { recursive: true });
    }
    // 1. Transparent Landscape PNG (1920x1080)
    await sharp({
      create: {
        width: 1920,
        height: 1080,
        channels: 4,
        background: { r: 0, g: 191, b: 255, alpha: 0.8 },
      },
    })
      .png()
      .toFile(testLandscapePng);

    // 2. Opaque PNG without alpha (800x600)
    await sharp({
      create: {
        width: 800,
        height: 600,
        channels: 3,
        background: { r: 30, g: 144, b: 255 },
      },
    })
      .png()
      .toFile(testOpaquePng);

    // 3. High height JPEG (800x1200) -> tests height >= 1080 when width < 1920
    await sharp({
      create: {
        width: 800,
        height: 1200,
        channels: 3,
        background: { r: 255, g: 50, b: 50 },
      },
    })
      .jpeg()
      .toFile(testHighHeightJpg);

    // 4. Portrait JPEG (400x800)
    await sharp({
      create: {
        width: 400,
        height: 800,
        channels: 3,
        background: { r: 255, g: 50, b: 50 },
      },
    })
      .jpeg()
      .toFile(testPortraitJpg);

    // 5. Square WebP (500x500)
    await sharp({
      create: {
        width: 500,
        height: 500,
        channels: 3,
        background: { r: 50, g: 255, b: 50 },
      },
    })
      .webp()
      .toFile(testSquareWebp);

    // 6. TIFF File
    await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 100, g: 100, b: 100 },
      },
    })
      .tiff()
      .toFile(testTiffFile);

    // 7. SVG File
    fs.writeFileSync(
      testSvgFile,
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="40" fill="#00bfff" /></svg>',
    );

    // 8. Corrupted File
    fs.writeFileSync(testCorruptedFile, Buffer.from('NOT_AN_IMAGE_BUFFER'));
  });

  afterAll(() => {
    [
      testLandscapePng,
      testOpaquePng,
      testHighHeightJpg,
      testPortraitJpg,
      testSquareWebp,
      testTiffFile,
      testSvgFile,
      testCorruptedFile,
    ].forEach((f) => {
      if (fs.existsSync(f)) {
        fs.unlinkSync(f);
      }
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.pool.execute).mockResolvedValue([{ affectedRows: 1 }] as any);
  });

  describe('1. Zod Schemas Validation Tests', () => {
    it('validates aiVisionStatusEnum and aiVisionProviderEnum', () => {
      expect(aiVisionStatusEnum.safeParse('PENDING').success).toBe(true);
      expect(aiVisionStatusEnum.safeParse('COMPLETED').success).toBe(true);
      expect(aiVisionStatusEnum.safeParse('INVALID').success).toBe(false);

      expect(aiVisionProviderEnum.safeParse('BUILTIN_VISION').success).toBe(true);
      expect(aiVisionProviderEnum.safeParse('AWS_REKOGNITION').success).toBe(true);
      expect(aiVisionProviderEnum.safeParse('OPENAI_CLIP').success).toBe(true);
      expect(aiVisionProviderEnum.safeParse('UNKNOWN_PROVIDER').success).toBe(false);
    });

    it('validates analyzeAssetBodySchema', () => {
      expect(analyzeAssetBodySchema.safeParse({}).success).toBe(true);
      expect(
        analyzeAssetBodySchema.safeParse({
          auto_tag: true,
          min_confidence: 0.85,
          force_refresh: true,
        }).success,
      ).toBe(true);
      expect(analyzeAssetBodySchema.safeParse({ min_confidence: 1.5 }).success).toBe(false);
      expect(analyzeAssetBodySchema.safeParse({ min_confidence: -0.1 }).success).toBe(false);
    });

    it('validates applyAiTagsBodySchema', () => {
      expect(applyAiTagsBodySchema.safeParse({ labels: ['Landscape', 'Mountain'] }).success).toBe(
        true,
      );
      expect(applyAiTagsBodySchema.safeParse({ labels: [] }).success).toBe(false);
      expect(applyAiTagsBodySchema.safeParse({ labels: [''] }).success).toBe(false);
      expect(applyAiTagsBodySchema.safeParse({ labels: ['a'.repeat(60)] }).success).toBe(false);
    });
  });

  describe('2. Color and Feature Extraction Unit Tests', () => {
    it('getApproximateColorName classifies various color palettes accurately', () => {
      expect(getApproximateColorName('#FFFFFF')).toBe('White / Light');
      expect(getApproximateColorName('#101010')).toBe('Black / Dark');
      expect(getApproximateColorName('#FF2020')).toBe('Red / Crimson');
      expect(getApproximateColorName('#20FF20')).toBe('Green / Emerald');
      expect(getApproximateColorName('#2020FF')).toBe('Blue / Azure');
      expect(getApproximateColorName('#FFFF20')).toBe('Yellow / Gold');
      expect(getApproximateColorName('#FF9920')).toBe('Orange / Amber');
      expect(getApproximateColorName('#AA20AA')).toBe('Purple / Violet');
      expect(getApproximateColorName('#FFA0A0')).toBe('Pink / Rose');
      expect(getApproximateColorName('#808080')).toBe('Slate / Neutral');
    });

    it('extractVisualFeatures processes high-res landscape PNG with alpha transparency and opaque PNG', async () => {
      const { dominantColors, labels } = await extractVisualFeatures(testLandscapePng, 'image/png');
      expect(dominantColors.length).toBeGreaterThan(0);
      expect(labels.some((l) => l.label === 'High Resolution')).toBe(true);
      expect(labels.some((l) => l.label === 'Landscape Orientation')).toBe(true);
      expect(labels.some((l) => l.label === 'PNG Graphic')).toBe(true);
      expect(labels.some((l) => l.label === 'Transparent Background')).toBe(true);

      const opaqueFeatures = await extractVisualFeatures(testOpaquePng, 'image/png');
      expect(opaqueFeatures.labels.some((l) => l.label === 'PNG Graphic')).toBe(true);
      expect(opaqueFeatures.labels.some((l) => l.label === 'Transparent Background')).toBe(false);
    });

    it('extractVisualFeatures processes portrait JPEG, high-height JPEG, square WebP and SVG', async () => {
      const highHeightFeatures = await extractVisualFeatures(testHighHeightJpg, 'image/jpeg');
      expect(highHeightFeatures.labels.some((l) => l.label === 'High Resolution')).toBe(true);

      const jpegFeatures = await extractVisualFeatures(testPortraitJpg, 'image/jpeg');
      expect(jpegFeatures.labels.some((l) => l.label === 'Portrait Orientation')).toBe(true);
      expect(jpegFeatures.labels.some((l) => l.label === 'Photograph')).toBe(true);

      const webpFeatures = await extractVisualFeatures(testSquareWebp, 'image/webp');
      expect(webpFeatures.labels.some((l) => l.label === 'Square Format')).toBe(true);
      expect(webpFeatures.labels.some((l) => l.label === 'WebP Visual')).toBe(true);

      const svgFeatures = await extractVisualFeatures(testSvgFile, 'image/svg+xml');
      expect(svgFeatures.labels.some((l) => l.label === 'Vector Illustration')).toBe(true);

      const genericFeatures = await extractVisualFeatures(testTiffFile, 'image/tiff');
      expect(genericFeatures.labels.some((l) => l.label === 'Visual Media')).toBe(true);
    });

    it('extractVisualFeatures handles non-existent file path and corrupted file exception gracefully', async () => {
      const nonExistentFeatures = await extractVisualFeatures('non_existent_path.png', 'image/png');
      expect(nonExistentFeatures.labels.some((l) => l.label === 'Digital Asset')).toBe(true);

      const corruptFeatures = await extractVisualFeatures(testCorruptedFile, 'image/png');
      expect(corruptFeatures.labels.some((l) => l.label === 'Visual Content')).toBe(true);
    });
  });

  describe('3. AI Vision Engine Unit Tests (aiVisionEngine.ts)', () => {
    it('analyzeAssetVisuals returns cached metadata if available and force_refresh is false', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 10,
          tenant_id: 100,
          mime_type: 'image/png',
          status: 'ACTIVE',
          deleted_at: null,
          version_id: 1,
          file_path: testLandscapePng,
          byte_size: 2048,
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 100,
          asset_id: 10,
          version_id: 1,
          provider: 'BUILTIN_VISION',
          status: 'COMPLETED',
          labels: JSON.stringify([{ label: 'Landscape', confidence: 0.95, applied_as_tag: true }]),
          dominant_colors: JSON.stringify([{ hex: '#00bfff', name: 'Blue', percent: 60 }]),
          detected_faces: 0,
          detected_objects: JSON.stringify(['Subject']),
          ocr_text: null,
          min_confidence_applied: 0.75,
          auto_tagged: 1,
          analyzed_at: '2026-08-22T12:00:00.000Z',
        },
      ]);

      const result = await analyzeAssetVisuals(100, 10, { force_refresh: false });
      expect(result.success).toBe(true);
      expect(result.data?.asset_id).toBe(10);
      expect(result.data?.labels[0].label).toBe('Landscape');
      expect(result.data?.auto_tagged).toBe(true);
    });

    it('analyzeAssetVisuals bypasses cache when force_refresh is true', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 10,
          tenant_id: 100,
          mime_type: 'image/png',
          status: 'ACTIVE',
          deleted_at: null,
          version_id: 1,
          file_path: testLandscapePng,
          byte_size: 2048,
        },
      ]);
      // Note: No cached query is executed because force_refresh is true!
      vi.mocked(db.query).mockResolvedValueOnce([{ insertId: 2 }] as any); // insert asset_ai_metadata

      const result = await analyzeAssetVisuals(100, 10, { force_refresh: true });
      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('COMPLETED');
    });

    it('analyzeAssetVisuals returns error when asset does not exist or is inactive', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const result = await analyzeAssetVisuals(100, 999);
      expect(result.success).toBe(false);
      expect(result.error).toContain('no existe o no se encuentra activo');
    });

    it('analyzeAssetVisuals executes visual feature extraction with auto_tag = true and minConfidence thresholding', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 10,
          tenant_id: 100,
          mime_type: 'image/png',
          status: 'ACTIVE',
          deleted_at: null,
          version_id: 1,
          file_path: testLandscapePng,
          byte_size: 2048,
        },
      ]);
      // Existing cached check (empty)
      vi.mocked(db.query).mockResolvedValueOnce([]);
      // Auto-tagging queries: tag check -> not existing -> insert tag -> insert asset_tag
      vi.mocked(db.query).mockResolvedValueOnce([]); // tag 1 not existing
      vi.mocked(db.query).mockResolvedValueOnce([{ insertId: 50 }] as any); // insert tag 1
      vi.mocked(db.query).mockResolvedValueOnce([{ affectedRows: 1 }] as any); // insert asset_tag 1

      vi.mocked(db.query).mockResolvedValueOnce([{ id: 51 }] as any); // tag 2 already exists
      vi.mocked(db.query).mockResolvedValueOnce([{ affectedRows: 1 }] as any); // insert asset_tag 2

      // Insert asset_ai_metadata
      vi.mocked(db.query).mockResolvedValueOnce([{ insertId: 1 }] as any);

      // Set min_confidence to 0.96 so labels with lower confidence fall into else branch (applied_as_tag = false)
      const result = await analyzeAssetVisuals(100, 10, { auto_tag: true, min_confidence: 0.96 });
      expect(result.success).toBe(true);
      expect(result.data?.auto_tagged).toBe(true);
      expect(result.data?.labels.some((l) => !l.applied_as_tag)).toBe(true);
    });

    it('getAssetAiMetadata returns null when metadata record not found', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);
      const result = await getAssetAiMetadata(100, 999);
      expect(result).toBeNull();
    });

    it('getAssetAiMetadata returns parsed metadata when record exists', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 100,
          asset_id: 10,
          version_id: 1,
          provider: 'BUILTIN_VISION',
          status: 'COMPLETED',
          labels: [{ label: 'High Resolution', confidence: 0.98, applied_as_tag: false }],
          dominant_colors: [{ hex: '#0f172a', name: 'Dark', percent: 80 }],
          detected_faces: 0,
          detected_objects: ['Subject Focus'],
          ocr_text: null,
          min_confidence_applied: 0.75,
          auto_tagged: 0,
          analyzed_at: '2026-08-22',
        },
      ]);

      const result = await getAssetAiMetadata(100, 10);
      expect(result).not.toBeNull();
      expect(result?.asset_id).toBe(10);
      expect(result?.labels[0].label).toBe('High Resolution');
    });

    it('applyAiLabelsAsTags succeeds and creates new or existing tags', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([{ id: 10 }]); // asset exists
      vi.mocked(db.query).mockResolvedValueOnce([]); // tag 1 not existing
      vi.mocked(db.query).mockResolvedValueOnce([{ insertId: 101 }] as any); // insert tag 1
      vi.mocked(db.query).mockResolvedValueOnce([{ affectedRows: 1 }] as any); // insert asset_tag 1

      vi.mocked(db.query).mockResolvedValueOnce([{ id: 102 }]); // tag 2 already exists
      vi.mocked(db.query).mockResolvedValueOnce([{ affectedRows: 1 }] as any); // insert asset_tag 2

      // Existing metadata check and update (with one matched and one unmatched label)
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          labels: JSON.stringify([
            { label: 'Landscape', confidence: 0.9, applied_as_tag: false },
            { label: 'Unrelated Tag', confidence: 0.4, applied_as_tag: false },
          ]),
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([{ affectedRows: 1 }] as any); // update metadata

      const result = await applyAiLabelsAsTags(100, 10, ['Landscape', 'Mountain', '  ']);
      expect(result.success).toBe(true);
      expect(result.tags_applied).toEqual(['Landscape', 'Mountain']);
    });

    it('applyAiLabelsAsTags fails when asset does not exist', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const result = await applyAiLabelsAsTags(100, 999, ['Landscape']);
      expect(result.success).toBe(false);
      expect(result.error).toContain('no existe o no se encuentra activo');
    });

    it('parseJsonField correctly handles null, undefined, JSON string and object', () => {
      expect(parseJsonField(null, ['default'])).toEqual(['default']);
      expect(parseJsonField(undefined, 42)).toBe(42);
      expect(parseJsonField('{"key":"value"}', {})).toEqual({ key: 'value' });
      expect(parseJsonField({ key: 'alreadyObject' }, {})).toEqual({ key: 'alreadyObject' });
    });
  });

  describe('4. AI Vision Routes Integration Tests (assets.ts)', () => {
    it('POST /api/v1/assets/:id/ai-analyze rejects with 400 when ID is invalid', async () => {
      const res = await supertest(app)
        .post('/api/v1/assets/invalid-id/ai-analyze')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('ID de activo inválido');
    });

    it('POST /api/v1/assets/:id/ai-analyze rejects with 403 when ACL EDIT is denied', async () => {
      const aclModule = await import('../../../server/src/utils/acl');
      vi.mocked(aclModule.evaluateAclPermission).mockResolvedValueOnce({
        allowed: false,
        reason: 'DEFAULT_DENY',
      });

      const res = await supertest(app)
        .post('/api/v1/assets/10/ai-analyze')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Acceso denegado por política de control de acceso');
    });

    it('POST /api/v1/assets/:id/ai-analyze returns 400 when analysis fails in engine', async () => {
      const aclModule = await import('../../../server/src/utils/acl');
      vi.mocked(aclModule.evaluateAclPermission).mockResolvedValueOnce({
        allowed: true,
        reason: 'ADMIN_BYPASS',
      });
      vi.mocked(db.query).mockResolvedValueOnce([]); // asset not found

      const res = await supertest(app)
        .post('/api/v1/assets/10/ai-analyze')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('no existe o no se encuentra activo');
    });

    it('POST /api/v1/assets/:id/ai-analyze succeeds with 200 and dispatches webhook', async () => {
      const aclModule = await import('../../../server/src/utils/acl');
      vi.mocked(aclModule.evaluateAclPermission).mockResolvedValueOnce({
        allowed: true,
        reason: 'ADMIN_BYPASS',
      });

      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 10,
          tenant_id: 100,
          mime_type: 'image/png',
          status: 'ACTIVE',
          deleted_at: null,
          version_id: 1,
          file_path: testLandscapePng,
          byte_size: 2048,
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([]); // no cached
      vi.mocked(db.query).mockResolvedValueOnce([{ insertId: 1 }] as any); // insert metadata

      const res = await supertest(app)
        .post('/api/v1/assets/10/ai-analyze')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ auto_tag: false });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('Análisis de inteligencia visual completado');
      expect(res.body.data.status).toBe('COMPLETED');
    });

    it('POST /api/v1/assets/:id/ai-analyze returns 500 on unexpected exception', async () => {
      const aclModule = await import('../../../server/src/utils/acl');
      vi.mocked(aclModule.evaluateAclPermission).mockRejectedValueOnce(new Error('ACL DB Error'));

      const res = await supertest(app)
        .post('/api/v1/assets/10/ai-analyze')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(500);
    });

    it('GET /api/v1/assets/:id/ai-metadata rejects with 400 on invalid ID', async () => {
      const res = await supertest(app)
        .get('/api/v1/assets/invalid-id/ai-metadata')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
    });

    it('GET /api/v1/assets/:id/ai-metadata rejects with 403 when ACL VIEW is denied', async () => {
      const aclModule = await import('../../../server/src/utils/acl');
      vi.mocked(aclModule.evaluateAclPermission).mockResolvedValueOnce({
        allowed: false,
        reason: 'DEFAULT_DENY',
      });

      const res = await supertest(app)
        .get('/api/v1/assets/10/ai-metadata')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(403);
    });

    it('GET /api/v1/assets/:id/ai-metadata returns 404 when metadata not found', async () => {
      const aclModule = await import('../../../server/src/utils/acl');
      vi.mocked(aclModule.evaluateAclPermission).mockResolvedValueOnce({
        allowed: true,
        reason: 'ADMIN_BYPASS',
      });
      vi.mocked(db.query).mockResolvedValueOnce([]); // not found

      const res = await supertest(app)
        .get('/api/v1/assets/999/ai-metadata')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });

    it('GET /api/v1/assets/:id/ai-metadata succeeds with 200', async () => {
      const aclModule = await import('../../../server/src/utils/acl');
      vi.mocked(aclModule.evaluateAclPermission).mockResolvedValueOnce({
        allowed: true,
        reason: 'ADMIN_BYPASS',
      });

      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 100,
          asset_id: 10,
          version_id: 1,
          provider: 'BUILTIN_VISION',
          status: 'COMPLETED',
          labels: JSON.stringify([{ label: 'Landscape', confidence: 0.95 }]),
          dominant_colors: JSON.stringify([{ hex: '#00bfff', name: 'Blue', percent: 60 }]),
          detected_faces: 0,
          detected_objects: JSON.stringify(['Subject Focus']),
          ocr_text: null,
          min_confidence_applied: 0.75,
          auto_tagged: 1,
          analyzed_at: '2026-08-22',
        },
      ]);

      const res = await supertest(app)
        .get('/api/v1/assets/10/ai-metadata')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('COMPLETED');
    });

    it('GET /api/v1/assets/:id/ai-metadata returns 500 on unexpected exception', async () => {
      const aclModule = await import('../../../server/src/utils/acl');
      vi.mocked(aclModule.evaluateAclPermission).mockRejectedValueOnce(new Error('DB Error'));

      const res = await supertest(app)
        .get('/api/v1/assets/10/ai-metadata')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(500);
    });

    it('POST /api/v1/assets/:id/ai-tags/apply rejects with 400 on invalid ID or empty labels', async () => {
      const resInvalidId = await supertest(app)
        .post('/api/v1/assets/invalid-id/ai-tags/apply')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ labels: ['Landscape'] });
      expect(resInvalidId.status).toBe(400);

      const resEmpty = await supertest(app)
        .post('/api/v1/assets/10/ai-tags/apply')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ labels: [] });
      expect(resEmpty.status).toBe(400);
    });

    it('POST /api/v1/assets/:id/ai-tags/apply rejects with 403 when ACL EDIT is denied', async () => {
      const aclModule = await import('../../../server/src/utils/acl');
      vi.mocked(aclModule.evaluateAclPermission).mockResolvedValueOnce({
        allowed: false,
        reason: 'DEFAULT_DENY',
      });

      const res = await supertest(app)
        .post('/api/v1/assets/10/ai-tags/apply')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ labels: ['Landscape'] });

      expect(res.status).toBe(403);
    });

    it('POST /api/v1/assets/:id/ai-tags/apply returns 400 when engine fails', async () => {
      const aclModule = await import('../../../server/src/utils/acl');
      vi.mocked(aclModule.evaluateAclPermission).mockResolvedValueOnce({
        allowed: true,
        reason: 'ADMIN_BYPASS',
      });
      vi.mocked(db.query).mockResolvedValueOnce([]); // asset not found

      const res = await supertest(app)
        .post('/api/v1/assets/10/ai-tags/apply')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ labels: ['Landscape'] });

      expect(res.status).toBe(400);
    });

    it('POST /api/v1/assets/:id/ai-tags/apply succeeds with 200', async () => {
      const aclModule = await import('../../../server/src/utils/acl');
      vi.mocked(aclModule.evaluateAclPermission).mockResolvedValueOnce({
        allowed: true,
        reason: 'ADMIN_BYPASS',
      });

      vi.mocked(db.query).mockResolvedValueOnce([{ id: 10 }]); // asset exists
      vi.mocked(db.query).mockResolvedValueOnce([{ id: 100 }]); // tag exists
      vi.mocked(db.query).mockResolvedValueOnce([{ affectedRows: 1 }] as any); // insert asset_tag
      vi.mocked(db.query).mockResolvedValueOnce([]); // metadata check

      const res = await supertest(app)
        .post('/api/v1/assets/10/ai-tags/apply')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ labels: ['Landscape'] });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('Etiquetas visuales aplicadas');
      expect(res.body.data.tags_applied).toEqual(['Landscape']);
    });

    it('POST /api/v1/assets/:id/ai-tags/apply returns 500 on unexpected exception', async () => {
      const aclModule = await import('../../../server/src/utils/acl');
      vi.mocked(aclModule.evaluateAclPermission).mockRejectedValueOnce(new Error('DB Error'));

      const res = await supertest(app)
        .post('/api/v1/assets/10/ai-tags/apply')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ labels: ['Landscape'] });

      expect(res.status).toBe(500);
    });

    it('POST /api/v1/assets/:id/ai-analyze returns default 400 error message when result.error is undefined', async () => {
      const aclModule = await import('../../../server/src/utils/acl');
      vi.mocked(aclModule.evaluateAclPermission).mockResolvedValueOnce({
        allowed: true,
        reason: 'ADMIN_BYPASS',
      });

      const aiEngineModule = await import('../../../server/src/utils/aiVisionEngine');
      const spy = vi
        .spyOn(aiEngineModule, 'analyzeAssetVisuals')
        .mockResolvedValueOnce({ success: false });

      const res = await supertest(app)
        .post('/api/v1/assets/10/ai-analyze')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Error al analizar el activo digital.');
      spy.mockRestore();
    });

    it('POST /api/v1/assets/:id/ai-tags/apply returns default 400 error message when result.error is undefined', async () => {
      const aclModule = await import('../../../server/src/utils/acl');
      vi.mocked(aclModule.evaluateAclPermission).mockResolvedValueOnce({
        allowed: true,
        reason: 'ADMIN_BYPASS',
      });

      const aiEngineModule = await import('../../../server/src/utils/aiVisionEngine');
      const spy = vi.spyOn(aiEngineModule, 'applyAiLabelsAsTags').mockResolvedValueOnce({
        success: false,
        asset_id: 10,
        tags_applied: [],
      });

      const res = await supertest(app)
        .post('/api/v1/assets/10/ai-tags/apply')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ labels: ['Landscape'] });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Error al aplicar las etiquetas de IA.');
      spy.mockRestore();
    });
  });

  describe('5. Rate Limiter 429 Handler', () => {
    it('triggers aiRateLimiter 429 response handler', async () => {
      const appAiLimit = express();
      appAiLimit.use(aiRateLimiter);
      appAiLimit.get('/test-ai-limit', (_req, res) => res.json({ ok: true }));

      for (let i = 0; i < 30; i++) {
        await supertest(appAiLimit).get('/test-ai-limit');
      }

      const resBlocked = await supertest(appAiLimit).get('/test-ai-limit');
      expect(resBlocked.status).toBe(429);
      expect(resBlocked.body.message).toMatch(
        /Límite de operaciones de inteligencia artificial y auto-etiquetado alcanzado/,
      );
    });
  });
});
