/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import supertest from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import * as db from '../../../server/src/db';
import * as auditLogger from '../../../server/src/middleware/auditLogger';
import * as aclUtils from '../../../server/src/utils/acl';
import * as webhookDispatcher from '../../../server/src/utils/webhookDispatcher';
import * as dedupEngine from '../../../server/src/utils/dedupEngine';
import assetsRouter from '../../../server/src/routes/assets';
import {
  dedupQuerySchema,
  deduplicateBodySchema,
  dedupPolicyEnum,
} from '../../../server/src/schemas/assetDedup.schema';
import {
  findDuplicateClusters,
  checkExistingDuplicate,
  consolidateDuplicates,
} from '../../../server/src/utils/dedupEngine';
import { dedupRateLimiter } from '../../../server/src/middleware/rateLimiter';

vi.mock('../../../server/src/db', () => ({
  query: vi.fn(),
}));

vi.mock('../../../server/src/middleware/auditLogger', () => ({
  logSecurityEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../server/src/utils/webhookDispatcher', () => ({
  dispatchWebhookEvent: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../../server/src/utils/mediaWorker', () => ({
  enqueueMediaJob: vi.fn().mockResolvedValue(undefined),
  retryFailedJobsForAsset: vi.fn().mockResolvedValue(undefined),
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

describe('DAM Asset Duplication & Deduplication Engine (FC 013)', () => {
  const adminToken = makeToken({ userId: 1, role: 'ADMIN', tenantId: 100 });
  const clientToken = makeToken({ userId: 2, role: 'CLIENT', tenantId: 100 });

  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/assets', assetsRouter);
  });

  describe('1. Zod Schemas Unit Tests', () => {
    it('dedupQuerySchema sets defaults for page and limit', () => {
      const parsed = dedupQuerySchema.parse({});
      expect(parsed.page).toBe(1);
      expect(parsed.limit).toBe(20);
    });

    it('dedupQuerySchema validates filters', () => {
      const parsed = dedupQuerySchema.parse({
        page: '2',
        limit: '50',
        workspace_id: '5',
        collection_id: '10',
        mime_category: 'image',
      });
      expect(parsed.page).toBe(2);
      expect(parsed.limit).toBe(50);
      expect(parsed.workspace_id).toBe(5);
      expect(parsed.collection_id).toBe(10);
      expect(parsed.mime_category).toBe('image');
    });

    it('deduplicateBodySchema rejects missing or invalid canonical_asset_id', () => {
      expect(() => deduplicateBodySchema.parse({ duplicate_asset_ids: [2] })).toThrow();
      expect(() =>
        deduplicateBodySchema.parse({ canonical_asset_id: -1, duplicate_asset_ids: [2] }),
      ).toThrow();
    });

    it('deduplicateBodySchema rejects empty or oversized duplicate_asset_ids', () => {
      expect(() =>
        deduplicateBodySchema.parse({ canonical_asset_id: 1, duplicate_asset_ids: [] }),
      ).toThrow();
      const largeArray = Array.from({ length: 101 }, (_, i) => i + 1);
      expect(() =>
        deduplicateBodySchema.parse({ canonical_asset_id: 1, duplicate_asset_ids: largeArray }),
      ).toThrow();
    });

    it('deduplicateBodySchema accepts valid payload with reason', () => {
      const parsed = deduplicateBodySchema.parse({
        canonical_asset_id: 10,
        duplicate_asset_ids: [11, 12],
        reason: 'Redundant upload consolidation',
      });
      expect(parsed.canonical_asset_id).toBe(10);
      expect(parsed.duplicate_asset_ids).toEqual([11, 12]);
      expect(parsed.reason).toBe('Redundant upload consolidation');
    });

    it('dedupPolicyEnum validates allowed policy literals', () => {
      expect(dedupPolicyEnum.parse('ALLOW_DUPLICATE')).toBe('ALLOW_DUPLICATE');
      expect(dedupPolicyEnum.parse('REJECT_DUPLICATE')).toBe('REJECT_DUPLICATE');
      expect(dedupPolicyEnum.parse('LINK_EXISTING')).toBe('LINK_EXISTING');
      expect(() => dedupPolicyEnum.parse('INVALID_POLICY')).toThrow();
    });
  });

  describe('2. Deduplication Engine Unit Tests (dedupEngine.ts)', () => {
    it('findDuplicateClusters returns empty summary when no duplicate clusters exist', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const result = await findDuplicateClusters(100, { page: 1, limit: 20 });
      expect(result.summary.total_duplicate_clusters).toBe(0);
      expect(result.summary.total_redundant_copies).toBe(0);
      expect(result.summary.total_wasted_bytes).toBe(0);
      expect(result.clusters).toEqual([]);
    });

    it('findDuplicateClusters correctly groups, computes wasted space and paginates', async () => {
      // 1. Return cluster summary count rows
      vi.mocked(db.query).mockResolvedValueOnce([
        { sha256_hash: 'hash_abc', asset_count: 3, byte_size: 1000 },
        { sha256_hash: 'hash_xyz', asset_count: 2, byte_size: 500 },
      ]);

      // 2. Return detail assets for these clusters
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          workspace_id: 10,
          collection_id: 20,
          title: 'Logo 1',
          mime_type: 'image/png',
          status: 'ACTIVE',
          created_at: '2026-08-01',
          sha256_hash: 'hash_abc',
          byte_size: 1000,
        },
        {
          id: 2,
          workspace_id: 10,
          collection_id: 21,
          title: 'Logo Copy',
          mime_type: 'image/png',
          status: 'ACTIVE',
          created_at: '2026-08-02',
          sha256_hash: 'hash_abc',
          byte_size: 1000,
        },
        {
          id: 3,
          workspace_id: 11,
          collection_id: 22,
          title: 'Logo 3',
          mime_type: 'image/png',
          status: 'ACTIVE',
          created_at: '2026-08-03',
          sha256_hash: 'hash_abc',
          byte_size: 1000,
        },
        {
          id: 4,
          workspace_id: 10,
          collection_id: 20,
          title: 'Doc A',
          mime_type: 'application/pdf',
          status: 'ACTIVE',
          created_at: '2026-08-01',
          sha256_hash: 'hash_xyz',
          byte_size: 500,
        },
        {
          id: 5,
          workspace_id: 10,
          collection_id: 20,
          title: 'Doc A Copy',
          mime_type: 'application/pdf',
          status: 'ACTIVE',
          created_at: '2026-08-02',
          sha256_hash: 'hash_xyz',
          byte_size: 500,
        },
      ]);

      const result = await findDuplicateClusters(100, {
        page: 1,
        limit: 20,
        workspace_id: 10,
        collection_id: 20,
        mime_category: 'image',
      });

      expect(result.summary.total_duplicate_clusters).toBe(2);
      expect(result.summary.total_redundant_copies).toBe(3); // (3-1) + (2-1) = 3
      expect(result.summary.total_wasted_bytes).toBe(2500); // 2*1000 + 1*500 = 2500
      expect(result.clusters.length).toBe(2);
      expect(result.clusters[0].sha256_hash).toBe('hash_abc');
      expect(result.clusters[0].copies_count).toBe(3);
      expect(result.clusters[0].wasted_bytes).toBe(2000);
      expect(result.clusters[1].sha256_hash).toBe('hash_xyz');
      expect(result.clusters[1].copies_count).toBe(2);
      expect(result.clusters[1].wasted_bytes).toBe(500);
    });

    it('findDuplicateClusters returns empty clusters when requested page is out of bounds', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        { sha256_hash: 'hash_1', asset_count: 2, byte_size: 100 },
      ]);

      const result = await findDuplicateClusters(100, { page: 5, limit: 10 });
      expect(result.summary.total_duplicate_clusters).toBe(1);
      expect(result.clusters).toEqual([]);
      expect(result.pagination.page).toBe(5);
    });

    it('checkExistingDuplicate returns asset when found and null when not found', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 10, title: 'Existing', sha256_hash: 'hash_abc' },
      ]);
      const found = await checkExistingDuplicate(100, 'hash_abc');
      expect(found).not.toBeNull();
      expect(found.id).toBe(10);

      vi.mocked(db.query).mockResolvedValueOnce([]);
      const notFound = await checkExistingDuplicate(100, 'non_existent');
      expect(notFound).toBeNull();
    });

    it('consolidateDuplicates fails when canonical asset does not exist or is inactive', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const result = await consolidateDuplicates(100, 999, [1000], 1);
      expect(result.success).toBe(false);
      expect(result.error).toContain('activo canónico especificado no existe');
    });

    it('consolidateDuplicates fails when duplicate assets do not exist or count mismatches', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 1, status: 'ACTIVE', sha256_hash: 'hash_abc', byte_size: 1000 },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 2, status: 'ACTIVE', sha256_hash: 'hash_abc', byte_size: 1000 },
      ]); // only 1 of 2 duplicates found

      const result = await consolidateDuplicates(100, 1, [2, 3], 1);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Uno o más activos duplicados no existen');
    });

    it('consolidateDuplicates fails when duplicate asset SHA-256 does not match canonical', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 1, status: 'ACTIVE', sha256_hash: 'hash_canonical', byte_size: 1000 },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 2, status: 'ACTIVE', sha256_hash: 'hash_different', byte_size: 1000 },
      ]);

      const result = await consolidateDuplicates(100, 1, [2], 1);
      expect(result.success).toBe(false);
      expect(result.error).toContain('no posee el mismo hash SHA-256');
    });

    it('consolidateDuplicates soft-deletes duplicates and records audit on success', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 1, status: 'ACTIVE', sha256_hash: 'hash_abc', byte_size: 1000 },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 2, status: 'ACTIVE', sha256_hash: 'hash_abc', byte_size: 1000 },
        { id: 3, status: 'ACTIVE', sha256_hash: 'hash_abc', byte_size: 1000 },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([{ affectedRows: 2 }] as any); // update soft delete
      vi.mocked(db.query).mockResolvedValueOnce([{ insertId: 1 }] as any); // log 1
      vi.mocked(db.query).mockResolvedValueOnce([{ insertId: 2 }] as any); // log 2

      const result = await consolidateDuplicates(100, 1, [2, 3], 1, 'Cleanup duplicate copies');
      expect(result.success).toBe(true);
      expect(result.canonical_asset_id).toBe(1);
      expect(result.consolidated_count).toBe(2);
      expect(result.reclaimed_bytes).toBe(2000);
      expect(result.consolidated_asset_ids).toEqual([2, 3]);
    });

    it('consolidateDuplicates succeeds when reason is omitted', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 1, status: 'ACTIVE', sha256_hash: 'hash_abc', byte_size: 500 },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 2, status: 'ACTIVE', sha256_hash: 'hash_abc', byte_size: 500 },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([{ affectedRows: 1 }] as any);
      vi.mocked(db.query).mockResolvedValueOnce([{ insertId: 10 }] as any);

      const result = await consolidateDuplicates(100, 1, [2], 1);
      expect(result.success).toBe(true);
      expect(result.consolidated_count).toBe(1);
    });
  });

  describe('3. Deduplication Routes Integration Tests (assets.ts)', () => {
    it('GET /api/v1/assets/duplicates returns 200 with summary and clusters', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        { sha256_hash: 'hash_img', asset_count: 2, byte_size: 2048 },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 10,
          workspace_id: 1,
          collection_id: 1,
          title: 'Photo A',
          mime_type: 'image/jpeg',
          status: 'ACTIVE',
          created_at: '2026-08-01',
          sha256_hash: 'hash_img',
          byte_size: 2048,
        },
        {
          id: 11,
          workspace_id: 1,
          collection_id: 2,
          title: 'Photo Copy',
          mime_type: 'image/jpeg',
          status: 'ACTIVE',
          created_at: '2026-08-02',
          sha256_hash: 'hash_img',
          byte_size: 2048,
        },
      ]);

      const res = await supertest(app)
        .get('/assets/duplicates?page=1&limit=10&mime_category=image')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.summary.total_duplicate_clusters).toBe(1);
      expect(res.body.summary.total_redundant_copies).toBe(1);
      expect(res.body.summary.total_wasted_bytes).toBe(2048);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].sha256_hash).toBe('hash_img');
    });

    it('GET /api/v1/assets/duplicates returns 500 when DB query fails', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('Duplicates DB Error'));

      const res = await supertest(app)
        .get('/assets/duplicates')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(500);
      expect(res.body.message).toContain('Error al escanear y obtener los activos duplicados');
    });

    it('POST /api/v1/assets/deduplicate rejects when canonical_asset_id is in duplicate_asset_ids', async () => {
      const res = await supertest(app)
        .post('/assets/deduplicate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          canonical_asset_id: 5,
          duplicate_asset_ids: [5, 6],
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('El activo canónico no puede estar incluido');
    });

    it('POST /api/v1/assets/deduplicate returns 403 when ACL denies VIEW on canonical asset', async () => {
      vi.spyOn(aclUtils, 'evaluateAclPermission').mockResolvedValueOnce(false); // canonical denied

      const res = await supertest(app)
        .post('/assets/deduplicate')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({
          canonical_asset_id: 10,
          duplicate_asset_ids: [11],
        });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Acceso denegado por ACL sobre el activo canónico');
    });

    it('POST /api/v1/assets/deduplicate returns 403 when ACL denies DELETE on a duplicate asset', async () => {
      vi.spyOn(aclUtils, 'evaluateAclPermission')
        .mockResolvedValueOnce(true) // canonical allowed
        .mockResolvedValueOnce(false); // duplicate denied

      const res = await supertest(app)
        .post('/assets/deduplicate')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({
          canonical_asset_id: 10,
          duplicate_asset_ids: [11],
        });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Permisos insuficientes para consolidar y eliminar');
    });

    it('POST /api/v1/assets/deduplicate returns 400 when deduplication engine returns failure', async () => {
      vi.spyOn(aclUtils, 'evaluateAclPermission').mockResolvedValue(true);
      vi.spyOn(dedupEngine, 'consolidateDuplicates').mockResolvedValueOnce({
        success: false,
        canonical_asset_id: 10,
        consolidated_count: 0,
        reclaimed_bytes: 0,
        consolidated_asset_ids: [],
        error: 'El activo canónico especificado no existe o no se encuentra activo.',
      });

      const res = await supertest(app)
        .post('/assets/deduplicate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          canonical_asset_id: 10,
          duplicate_asset_ids: [11],
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('no existe o no se encuentra activo');
    });

    it('POST /api/v1/assets/deduplicate returns 200 and consolidates assets on success', async () => {
      vi.spyOn(aclUtils, 'evaluateAclPermission').mockResolvedValue(true);
      vi.spyOn(dedupEngine, 'consolidateDuplicates').mockResolvedValueOnce({
        success: true,
        canonical_asset_id: 10,
        consolidated_count: 2,
        reclaimed_bytes: 4096,
        consolidated_asset_ids: [11, 12],
      });

      const res = await supertest(app)
        .post('/assets/deduplicate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          canonical_asset_id: 10,
          duplicate_asset_ids: [11, 12],
          reason: 'Manual cleanup of redundant uploads',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.canonical_asset_id).toBe(10);
      expect(res.body.data.consolidated_count).toBe(2);
      expect(res.body.data.reclaimed_bytes).toBe(4096);
      expect(res.body.data.consolidated_asset_ids).toEqual([11, 12]);
      expect(auditLogger.logSecurityEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ eventType: 'ASSET_DEDUPLICATE', status: 'SUCCESS' }),
      );
      expect(webhookDispatcher.dispatchWebhookEvent).toHaveBeenCalledWith(
        100,
        'asset.deleted',
        expect.objectContaining({ asset_id: 11, reason: 'DEDUPLICATED' }),
      );
      expect(webhookDispatcher.dispatchWebhookEvent).toHaveBeenCalledWith(
        100,
        'asset.deleted',
        expect.objectContaining({ asset_id: 12, reason: 'DEDUPLICATED' }),
      );
    });

    it('POST /api/v1/assets/deduplicate returns 500 when exception is thrown', async () => {
      vi.spyOn(aclUtils, 'evaluateAclPermission').mockRejectedValueOnce(new Error('ACL Error'));

      const res = await supertest(app)
        .post('/assets/deduplicate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          canonical_asset_id: 10,
          duplicate_asset_ids: [11],
        });

      expect(res.status).toBe(500);
      expect(res.body.message).toContain('Error interno al consolidar los activos duplicados');
    });

    it('POST /api/v1/assets/upload rejects with 409 when dedup_policy is REJECT_DUPLICATE and duplicate exists', async () => {
      // 1x1 1-pixel valid PNG buffer
      const pngBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
        0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f,
        0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00,
        0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
        0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
      ]);

      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 55,
          workspace_id: 1,
          collection_id: 1,
          title: 'Existing.png',
          mime_type: 'image/png',
          status: 'ACTIVE',
          created_at: '2026-08-01',
          version_id: 10,
          version_number: 1,
          byte_size: pngBuffer.length,
          sha256_hash: 'somehash',
        },
      ]);

      const res = await supertest(app)
        .post('/assets/upload?dedup_policy=REJECT_DUPLICATE')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', pngBuffer, 'test.png');

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('Conflict');
      expect(res.body.data.duplicate_asset_id).toBe(55);
    });

    it('POST /api/v1/assets/upload links existing duplicate with 200 when X-Deduplication-Policy is LINK_EXISTING', async () => {
      const pngBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
        0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f,
        0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00,
        0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
        0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
      ]);

      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 56,
          workspace_id: 2,
          collection_id: 3,
          title: 'ExistingLinked.png',
          mime_type: 'image/png',
          status: 'ACTIVE',
          created_at: '2026-08-01',
          version_id: 11,
          version_number: 1,
          byte_size: pngBuffer.length,
          sha256_hash: 'somehash',
        },
      ]);

      const res = await supertest(app)
        .post('/assets/upload')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-deduplication-policy', 'LINK_EXISTING')
        .attach('file', pngBuffer, 'test_linked.png');

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('Activo existente vinculado');
      expect(res.body.data.assetId).toBe(56);
      expect(res.body.data.linked).toBe(true);
    });

    it('POST /api/v1/assets/upload proceeds with upload when dedup_policy is REJECT_DUPLICATE but no duplicate exists', async () => {
      const pngBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
        0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f,
        0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00,
        0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
        0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
      ]);

      // 1. checkExistingDuplicate returns null (no duplicate)
      vi.mocked(db.query).mockResolvedValueOnce([]);
      // 2. getOrCreateDefaultWorkspace -> workspace lookup
      vi.mocked(db.query).mockResolvedValueOnce([{ id: 1 }]);
      // 3. collection lookup
      vi.mocked(db.query).mockResolvedValueOnce([{ id: 1 }]);
      // 4. asset insert
      vi.mocked(db.query).mockResolvedValueOnce({ insertId: 77 } as any);
      // 5. version insert
      vi.mocked(db.query).mockResolvedValueOnce({ insertId: 88 } as any);
      // 6. derivative insert
      vi.mocked(db.query).mockResolvedValueOnce({ insertId: 99 } as any);

      const res = await supertest(app)
        .post('/assets/upload?dedup_policy=REJECT_DUPLICATE')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', pngBuffer, 'unique.png');

      expect(res.status).toBe(201);
      expect(res.body.data.assetId).toBe(77);
    });

    it('GET /api/v1/assets/duplicates works with default query params', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .get('/assets/duplicates')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.summary.total_duplicate_clusters).toBe(0);
      expect(res.body.data).toEqual([]);
    });
  });

  describe('4. Rate Limiter 429 Response Handler', () => {
    it('triggers dedupRateLimiter 429 response handler', async () => {
      const appDedupLimit = express();
      appDedupLimit.use(dedupRateLimiter);
      appDedupLimit.get('/test-dedup-limit', (_req, res) => res.json({ ok: true }));

      for (let i = 0; i < 30; i++) {
        await supertest(appDedupLimit).get('/test-dedup-limit');
      }

      const resBlocked = await supertest(appDedupLimit).get('/test-dedup-limit');
      expect(resBlocked.status).toBe(429);
      expect(resBlocked.body.message).toMatch(
        /Límite de operaciones de detección y deduplicación alcanzado/,
      );
    });
  });
});
