import fs from 'fs';
import path from 'path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import supertest from 'supertest';
import express, { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import {
  createVideoHighlightBodySchema,
  listVideoHighlightsQuerySchema,
  highlightIdParamSchema,
  AspectRatioEnum,
} from '../../../server/src/schemas/videoHighlights.schema';
import {
  generateHighlightDerivative,
  createVideoHighlight,
  listVideoHighlights,
  getVideoHighlightById,
  deleteVideoHighlight,
} from '../../../server/src/utils/videoHighlightsEngine';
import { STORAGE_ROOT } from '../../../server/src/utils/storage';
import { videoHighlightsRateLimiter } from '../../../server/src/middleware/rateLimiter';
import * as db from '../../../server/src/db';
import { evaluateAclPermission } from '../../../server/src/utils/acl';
import { dispatchWebhookEvent } from '../../../server/src/utils/webhookDispatcher';
import assetsRouter from '../../../server/src/routes/assets';

vi.mock('../../../server/src/db', () => ({
  query: vi.fn(),
  pool: {
    execute: vi.fn(),
    getConnection: vi.fn(),
  },
}));

vi.mock('../../../server/src/middleware/auditLogger', () => ({
  logSecurityEvent: vi.fn().mockResolvedValue(undefined),
  auditLogger: vi.fn((_req, _res, next) => next()),
}));

vi.mock('../../../server/src/utils/acl', () => ({
  evaluateAclPermission: vi.fn().mockResolvedValue({ allowed: true, reason: 'ADMIN_BYPASS' }),
}));

vi.mock('../../../server/src/utils/webhookDispatcher', () => ({
  dispatchWebhookEvent: vi.fn().mockResolvedValue(undefined),
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

describe('DAM AI Video Highlights & Automated Reel Generation (FC 021)', () => {
  const adminToken = makeToken({ userId: 1, role: 'ADMIN', tenantId: 100 });
  const clientToken = makeToken({ userId: 2, role: 'CLIENT', tenantId: 100 });

  let app: express.Express;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(evaluateAclPermission).mockResolvedValue({
      allowed: true,
      reason: 'ADMIN_BYPASS',
    });
    vi.mocked(dispatchWebhookEvent).mockResolvedValue(undefined);
    app = express();
    app.use(express.json());
    app.use('/api/v1/assets', assetsRouter);
  });

  describe('1. Zod Validation Schemas (videoHighlights.schema.ts)', () => {
    it('validates AspectRatioEnum values', () => {
      expect(AspectRatioEnum.safeParse('16:9').success).toBe(true);
      expect(AspectRatioEnum.safeParse('9:16').success).toBe(true);
      expect(AspectRatioEnum.safeParse('1:1').success).toBe(true);
      expect(AspectRatioEnum.safeParse('4:3').success).toBe(false);
    });

    it('validates createVideoHighlightBodySchema constraints', () => {
      const valid = createVideoHighlightBodySchema.safeParse({
        title: 'Social Reel',
      });
      expect(valid.success).toBe(true);
      if (valid.success) {
        expect(valid.data.aspect_ratio).toBe('9:16');
        expect(valid.data.target_duration_seconds).toBe(30);
      }

      const invalidDurationLow = createVideoHighlightBodySchema.safeParse({
        title: 'Short',
        target_duration_seconds: 2,
      });
      expect(invalidDurationLow.success).toBe(false);

      const invalidDurationHigh = createVideoHighlightBodySchema.safeParse({
        title: 'Long',
        target_duration_seconds: 300,
      });
      expect(invalidDurationHigh.success).toBe(false);

      const emptyTitle = createVideoHighlightBodySchema.safeParse({
        title: '',
      });
      expect(emptyTitle.success).toBe(false);
    });

    it('validates listVideoHighlightsQuerySchema and highlightIdParamSchema', () => {
      const listParsed = listVideoHighlightsQuerySchema.safeParse({
        limit: 10,
        offset: 0,
        aspect_ratio: '1:1',
      });
      expect(listParsed.success).toBe(true);

      const paramParsed = highlightIdParamSchema.safeParse({
        id: 10,
        highlightId: 5,
      });
      expect(paramParsed.success).toBe(true);

      const invalidParam = highlightIdParamSchema.safeParse({
        id: -1,
        highlightId: 0,
      });
      expect(invalidParam.success).toBe(false);
    });
  });

  describe('2. Video Highlights Engine Utilities (videoHighlightsEngine.ts)', () => {
    it('generateHighlightDerivative generates WebP posters for 16:9, 9:16 and 1:1', async () => {
      const path169 = await generateHighlightDerivative(100, 10, 1, '16:9', [1, 2]);
      expect(path169).toContain('derivatives');

      const path916 = await generateHighlightDerivative(100, 10, 1, '9:16', [1]);
      expect(path916).toContain('derivatives');

      const path11 = await generateHighlightDerivative(100, 10, 1, '1:1', [1, 2, 3]);
      expect(path11).toContain('derivatives');
    });

    it('createVideoHighlight returns error when no FC 020 scenes exist (Condition C-021.2)', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const result = await createVideoHighlight(100, 10, 1, 'No Scenes Reel');
      expect(result.success).toBe(false);
      expect(result.error).toBe('NO_SCENES_FOUND');
    });

    it('createVideoHighlight succeeds and selects scenes to match duration', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([
          { scene_index: 1, start_time_seconds: 0, end_time_seconds: 15 },
          { scene_index: 2, start_time_seconds: 15, end_time_seconds: 35 },
          { scene_index: 3, start_time_seconds: 35, end_time_seconds: 50 },
        ]) // scenes query
        .mockResolvedValueOnce({ insertId: 42 }); // INSERT query

      const result = await createVideoHighlight(100, 10, 1, 'Main Highlight', '16:9', 30);
      expect(result.success).toBe(true);
      expect(result.highlight?.id).toBe(42);
      expect(result.highlight?.selected_scene_indices_json).toEqual([1, 2]);
      expect(result.highlight?.actual_duration_seconds).toBe(35);
      expect(dispatchWebhookEvent).toHaveBeenCalled();
    });

    it('listVideoHighlights returns parsed highlights with and without aspect_ratio filter', async () => {
      vi.mocked(db.query).mockResolvedValue([
        {
          id: 1,
          tenant_id: 100,
          asset_id: 10,
          version_id: 1,
          title: 'Highlight 1',
          aspect_ratio: '9:16',
          target_duration_seconds: 30,
          actual_duration_seconds: 28.5,
          selected_scene_indices_json: '[1,2]',
          status: 'READY',
          output_derivative_path: '/path/highlight.webp',
          created_at: new Date().toISOString(),
        },
        {
          id: 2,
          tenant_id: 100,
          asset_id: 10,
          version_id: 1,
          title: 'Highlight 2',
          aspect_ratio: '16:9',
          target_duration_seconds: 60,
          actual_duration_seconds: 60,
          selected_scene_indices_json: [1, 2, 3],
          status: 'READY',
          output_derivative_path: null,
          created_at: new Date().toISOString(),
        },
      ]);

      const listAll = await listVideoHighlights(100, 10);
      expect(listAll.length).toBe(2);
      expect(listAll[0].selected_scene_indices_json).toEqual([1, 2]);

      const listFiltered = await listVideoHighlights(100, 10, 10, 0, '9:16');
      expect(listFiltered.length).toBe(2);
    });

    it('getVideoHighlightById returns highlight or null', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([]) // not found
        .mockResolvedValueOnce([
          {
            id: 1,
            tenant_id: 100,
            asset_id: 10,
            version_id: 1,
            title: 'Highlight 1',
            aspect_ratio: '9:16',
            target_duration_seconds: 30,
            actual_duration_seconds: 28.5,
            selected_scene_indices_json: '[1,2]',
            status: 'READY',
            output_derivative_path: '/path/highlight.webp',
          },
        ]);

      const notFound = await getVideoHighlightById(100, 10, 999);
      expect(notFound).toBeNull();

      const found = await getVideoHighlightById(100, 10, 1);
      expect(found).not.toBeNull();
      expect(found?.id).toBe(1);
    });

    it('deleteVideoHighlight deletes record and unlinks file when path exists and not exists', async () => {
      // 1. Not found
      vi.mocked(db.query).mockResolvedValueOnce([]);
      const deleteNotFound = await deleteVideoHighlight(100, 10, 999);
      expect(deleteNotFound).toBe(false);

      // 2. Found without path
      vi.mocked(db.query)
        .mockResolvedValueOnce([
          {
            id: 1,
            tenant_id: 100,
            asset_id: 10,
            version_id: 1,
            output_derivative_path: null,
          },
        ])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);
      const deleteNoPath = await deleteVideoHighlight(100, 10, 1);
      expect(deleteNoPath).toBe(true);

      // 3. Found with real existing file
      const derivativesDir = path.join(STORAGE_ROOT, 'derivatives', 'tenant_100');
      fs.mkdirSync(derivativesDir, { recursive: true });
      const testFile = path.join(derivativesDir, `test_unlink_${Date.now()}.webp`);
      fs.writeFileSync(testFile, 'dummy-webp-data');

      vi.mocked(db.query)
        .mockResolvedValueOnce([
          {
            id: 2,
            tenant_id: 100,
            asset_id: 10,
            version_id: 1,
            output_derivative_path: testFile,
          },
        ])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      const deleteWithRealFile = await deleteVideoHighlight(100, 10, 2);
      expect(deleteWithRealFile).toBe(true);
      expect(fs.existsSync(testFile)).toBe(false);

      // 4. Found with non-existing file path
      const nonExistentFile = path.join(derivativesDir, `non_existent_${Date.now()}.webp`);
      vi.mocked(db.query)
        .mockResolvedValueOnce([
          {
            id: 3,
            tenant_id: 100,
            asset_id: 10,
            version_id: 1,
            output_derivative_path: nonExistentFile,
          },
        ])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      const deleteWithMissingFile = await deleteVideoHighlight(100, 10, 3);
      expect(deleteWithMissingFile).toBe(true);
      expect(dispatchWebhookEvent).toHaveBeenCalled();
    });
  });

  describe('3. POST /api/v1/assets/:id/highlights', () => {
    it('returns 400 for invalid asset ID', async () => {
      const res = await supertest(app)
        .post('/api/v1/assets/invalid/highlights')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Test Reel' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('ID de activo inválido');
    });

    it('returns 404 if asset not found in tenant', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .post('/api/v1/assets/999/highlights')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Test Reel' });

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('Activo digital no encontrado');
    });

    it('returns 400 if asset is not a video file (Condition C-021.4)', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 10, mime_type: 'image/jpeg', current_version_id: 1 },
      ]);

      const res = await supertest(app)
        .post('/api/v1/assets/10/highlights')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Test Reel' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('no es un archivo de video compatible');
    });

    it('returns 403 if ACL denies EDIT permission', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 10, mime_type: 'video/mp4', current_version_id: 1 },
      ]);
      vi.mocked(evaluateAclPermission).mockResolvedValueOnce({
        allowed: false,
        reason: 'FORBIDDEN',
      });

      const res = await supertest(app)
        .post('/api/v1/assets/10/highlights')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ title: 'Test Reel' });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Acceso denegado por política de control de acceso');
    });

    it('returns 400 if no FC 020 scenes exist for asset', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: 10, mime_type: 'video/mp4', current_version_id: 1 }]) // asset query
        .mockResolvedValueOnce([]); // no scenes

      const res = await supertest(app)
        .post('/api/v1/assets/10/highlights')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Test Reel' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('no cuenta con escenas analizadas');
    });

    it('creates highlight and returns 201 Created on success', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: 10, mime_type: 'video/mp4', current_version_id: 1 }]) // asset query
        .mockResolvedValueOnce([
          { scene_index: 1, start_time_seconds: 0, end_time_seconds: 15 },
          { scene_index: 2, start_time_seconds: 15, end_time_seconds: 30 },
        ]) // scenes
        .mockResolvedValueOnce({ insertId: 101 }); // insert highlight

      const res = await supertest(app)
        .post('/api/v1/assets/10/highlights')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Executive Reel',
          aspect_ratio: '9:16',
          target_duration_seconds: 30,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBe(101);
      expect(res.body.data.aspect_ratio).toBe('9:16');
    });
  });

  describe('4. GET /api/v1/assets/:id/highlights', () => {
    it('returns 400 for invalid asset ID', async () => {
      const res = await supertest(app)
        .get('/api/v1/assets/0/highlights')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
    });

    it('returns 404 if asset not found', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .get('/api/v1/assets/999/highlights')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });

    it('returns 403 if ACL denies VIEW permission', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([{ id: 10 }]);
      vi.mocked(evaluateAclPermission).mockResolvedValueOnce({
        allowed: false,
        reason: 'FORBIDDEN',
      });

      const res = await supertest(app)
        .get('/api/v1/assets/10/highlights')
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(403);
    });

    it('returns 200 with list of highlights', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: 10 }]) // asset query
        .mockResolvedValueOnce([
          {
            id: 1,
            tenant_id: 100,
            asset_id: 10,
            version_id: 1,
            title: 'Highlight 1',
            aspect_ratio: '16:9',
            target_duration_seconds: 30,
            actual_duration_seconds: 30,
            selected_scene_indices_json: [1, 2],
            status: 'READY',
            output_derivative_path: '/path/derivative.webp',
          },
        ]);

      const res = await supertest(app)
        .get('/api/v1/assets/10/highlights?limit=10&offset=0&aspect_ratio=16:9')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
    });
  });

  describe('5. GET /api/v1/assets/:id/highlights/:highlightId', () => {
    it('returns 400 for invalid params', async () => {
      const res = await supertest(app)
        .get('/api/v1/assets/invalid/highlights/0')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
    });

    it('returns 403 if ACL denies VIEW permission', async () => {
      vi.mocked(evaluateAclPermission).mockResolvedValueOnce({
        allowed: false,
        reason: 'FORBIDDEN',
      });

      const res = await supertest(app)
        .get('/api/v1/assets/10/highlights/1')
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(403);
    });

    it('returns 404 if highlight not found', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .get('/api/v1/assets/10/highlights/999')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });

    it('returns 200 with highlight detail on success', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 100,
          asset_id: 10,
          version_id: 1,
          title: 'Highlight Detail',
          aspect_ratio: '9:16',
          target_duration_seconds: 30,
          actual_duration_seconds: 30,
          selected_scene_indices_json: [1, 2],
          status: 'READY',
          output_derivative_path: '/path/derivative.webp',
        },
      ]);

      const res = await supertest(app)
        .get('/api/v1/assets/10/highlights/1')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(1);
      expect(res.body.data.title).toBe('Highlight Detail');
    });
  });

  describe('6. DELETE /api/v1/assets/:id/highlights/:highlightId', () => {
    it('returns 400 for invalid params', async () => {
      const res = await supertest(app)
        .delete('/api/v1/assets/0/highlights/invalid')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
    });

    it('returns 403 if ACL denies EDIT permission', async () => {
      vi.mocked(evaluateAclPermission).mockResolvedValueOnce({
        allowed: false,
        reason: 'FORBIDDEN',
      });

      const res = await supertest(app)
        .delete('/api/v1/assets/10/highlights/1')
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(403);
    });

    it('returns 404 if highlight not found on delete', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .delete('/api/v1/assets/10/highlights/999')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });

    it('deletes highlight and returns 200 OK on success', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([
          {
            id: 1,
            tenant_id: 100,
            asset_id: 10,
            version_id: 1,
            output_derivative_path: null,
          },
        ]) // get by id
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // delete query

      const res = await supertest(app)
        .delete('/api/v1/assets/10/highlights/1')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('eliminado exitosamente');
    });
  });

  describe('7. Rate Limiting & Server Error Handlers', () => {
    it('handles unexpected exceptions with 500 status', async () => {
      vi.mocked(db.query).mockRejectedValue(new Error('Fatal DB Crash'));

      const res1 = await supertest(app)
        .post('/api/v1/assets/10/highlights')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Crash Reel' });
      expect(res1.status).toBe(500);

      const res2 = await supertest(app)
        .get('/api/v1/assets/10/highlights')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res2.status).toBe(500);

      const res3 = await supertest(app)
        .get('/api/v1/assets/10/highlights/1')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res3.status).toBe(500);

      const res4 = await supertest(app)
        .delete('/api/v1/assets/10/highlights/1')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res4.status).toBe(500);
    });

    it('triggers videoHighlightsRateLimiter 429 response handler', async () => {
      const appLimit = express();
      appLimit.use(videoHighlightsRateLimiter);
      appLimit.post('/test-highlight-limit', (_req, res) => res.json({ ok: true }));

      for (let i = 0; i < 30; i++) {
        await supertest(appLimit).post('/test-highlight-limit');
      }
      const resBlocked = await supertest(appLimit).post('/test-highlight-limit');
      expect(resBlocked.status).toBe(429);
      expect(resBlocked.body.message).toMatch(
        /Límite de operaciones de generación de resúmenes de video/,
      );
    });
  });
});
