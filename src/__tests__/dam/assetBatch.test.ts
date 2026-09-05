/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import supertest from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import assetsRouter from '../../../server/src/routes/assets';
import { batchRateLimiter } from '../../../server/src/middleware/rateLimiter';
import * as db from '../../../server/src/db';
import { STORAGE_ROOT } from '../../../server/src/utils/storage';
import {
  batchAssetIdsSchema,
  batchRelocateSchema,
  batchTagsSchema,
} from '../../../server/src/schemas/assetBatch.schema';

// Mock DB
vi.mock('../../../server/src/db', () => {
  const queryFn = vi.fn();
  const executeFn = vi.fn().mockResolvedValue([{ affectedRows: 1 }]);
  return {
    query: queryFn,
    pool: {
      execute: executeFn,
    },
  };
});

const TEST_SECRET = 'test-jwt-secret-key-super-secure-and-long-enough-for-hs512-compliance-testing';
process.env.JWT_SECRET = TEST_SECRET;

const app = express();
app.use(express.json());
app.use('/assets', assetsRouter);

describe('DAM Batch & Bulk Asset Operations (FC 009)', () => {
  const testSandbox = path.join(STORAGE_ROOT, 'test_batch_sandbox');

  const adminToken = jwt.sign(
    { userId: 1, uid: 1, email: 'admin@dreamtek.tech', role: 'ADMIN', tenantId: 1 },
    TEST_SECRET,
    { algorithm: 'HS512' },
  );

  const clientToken = jwt.sign(
    { userId: 2, uid: 2, email: 'client@dreamtek.tech', role: 'CLIENT', tenantId: 1 },
    TEST_SECRET,
    { algorithm: 'HS512' },
  );

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.pool.execute).mockResolvedValue([{ affectedRows: 1 }] as any);
    if (!fs.existsSync(testSandbox)) {
      fs.mkdirSync(testSandbox, { recursive: true });
    }
  });

  afterEach(() => {
    try {
      if (fs.existsSync(testSandbox)) {
        fs.rmSync(testSandbox, { recursive: true, force: true });
      }
    } catch {
      // Ignore Windows handle lock
    }
  });

  describe('Zod Schemas Unit Tests', () => {
    it('validates batchAssetIdsSchema correctly', () => {
      expect(batchAssetIdsSchema.safeParse({ asset_ids: [1, 2, 3] }).success).toBe(true);
      expect(batchAssetIdsSchema.safeParse({ asset_ids: [] }).success).toBe(false);
      expect(batchAssetIdsSchema.safeParse({ asset_ids: [-1] }).success).toBe(false);
      expect(batchAssetIdsSchema.safeParse({ asset_ids: [1.5] }).success).toBe(false);

      const largeArray = Array.from({ length: 51 }, (_, i) => i + 1);
      expect(batchAssetIdsSchema.safeParse({ asset_ids: largeArray }).success).toBe(false);
    });

    it('validates batchRelocateSchema correctly', () => {
      expect(
        batchRelocateSchema.safeParse({
          asset_ids: [1],
          workspace_id: 10,
          collection_id: 20,
        }).success,
      ).toBe(true);

      expect(
        batchRelocateSchema.safeParse({
          asset_ids: [1],
          workspace_id: 10,
          collection_id: null,
        }).success,
      ).toBe(true);

      expect(
        batchRelocateSchema.safeParse({
          asset_ids: [1],
          workspace_id: 10,
        }).success,
      ).toBe(true);

      expect(
        batchRelocateSchema.safeParse({
          asset_ids: [1],
          workspace_id: -1,
        }).success,
      ).toBe(false);

      expect(
        batchRelocateSchema.safeParse({
          asset_ids: [],
          workspace_id: 10,
        }).success,
      ).toBe(false);
    });

    it('validates batchTagsSchema correctly', () => {
      expect(
        batchTagsSchema.safeParse({
          asset_ids: [1, 2],
          tag_ids: [10, 20],
        }).success,
      ).toBe(true);

      expect(
        batchTagsSchema.safeParse({
          asset_ids: [1],
          tag_ids: [],
        }).success,
      ).toBe(false);

      const largeTags = Array.from({ length: 21 }, (_, i) => i + 1);
      expect(
        batchTagsSchema.safeParse({
          asset_ids: [1],
          tag_ids: largeTags,
        }).success,
      ).toBe(false);
    });
  });

  describe('POST /assets/batch/download (Batch Download ZIP on-the-fly)', () => {
    it('returns 401 if unauthenticated', async () => {
      const res = await supertest(app)
        .post('/assets/batch/download')
        .send({ asset_ids: [1, 2] });
      expect(res.status).toBe(401);
    });

    it('returns 400 if validation fails', async () => {
      const res = await supertest(app)
        .post('/assets/batch/download')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ asset_ids: [] });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation Error');
    });

    it('returns 404 if no valid active assets found for tenant', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .post('/assets/batch/download')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ asset_ids: [999] });

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('Ningún activo válido encontrado');
    });

    it('returns 403 if ACL denies download permission for all assets', async () => {
      const filePath = path.join(testSandbox, 'test_file.png');
      fs.writeFileSync(filePath, 'sample-binary');

      vi.mocked(db.query)
        // 1. Fetch assets
        .mockResolvedValueOnce([
          {
            id: 10,
            tenant_id: 1,
            workspace_id: 1,
            collection_id: 1,
            title: 'restricted.png',
            mime_type: 'image/png',
            status: 'ACTIVE',
            deleted_at: null,
            file_path: filePath,
            sha256_hash: 'abc',
            byte_size: 13,
          },
        ])
        // 2. ACL check query for clientToken (userId: 2) -> returns empty list (deny)
        .mockResolvedValueOnce([]);

      const res = await supertest(app)
        .post('/assets/batch/download')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ asset_ids: [10] });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Acceso denegado por política de control de acceso');
    });

    it('streams ZIP with deduplicated file names on success', async () => {
      const file1Path = path.join(testSandbox, 'img1.png');
      const file2Path = path.join(testSandbox, 'img2.png');
      fs.writeFileSync(file1Path, 'binary-1');
      fs.writeFileSync(file2Path, 'binary-2');

      vi.mocked(db.query)
        // 1. Fetch assets query (both share the title 'logo.png')
        .mockResolvedValueOnce([
          {
            id: 1,
            tenant_id: 1,
            workspace_id: 1,
            collection_id: 1,
            title: 'logo.png',
            mime_type: 'image/png',
            status: 'ACTIVE',
            deleted_at: null,
            file_path: file1Path,
            sha256_hash: 'hash1',
            byte_size: 8,
          },
          {
            id: 2,
            tenant_id: 1,
            workspace_id: 1,
            collection_id: 1,
            title: 'logo.png',
            mime_type: 'image/png',
            status: 'ACTIVE',
            deleted_at: null,
            file_path: file2Path,
            sha256_hash: 'hash2',
            byte_size: 8,
          },
        ]);

      const binaryParser = (res: any, cb: any) => {
        const bufs: Buffer[] = [];
        res.on('data', (c: Buffer) => bufs.push(c));
        res.on('end', () => cb(null, Buffer.concat(bufs)));
      };

      const res = await supertest(app)
        .post('/assets/batch/download')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ asset_ids: [1, 2] })
        .parse(binaryParser);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/zip');
      expect(res.headers['content-disposition']).toContain('attachment; filename="assets_export_');
      expect(res.body).toBeInstanceOf(Buffer);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('handles asset title with special characters and fallback', async () => {
      const file1Path = path.join(testSandbox, 'special.png');
      fs.writeFileSync(file1Path, 'binary-special');

      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 5,
          tenant_id: 1,
          workspace_id: 1,
          collection_id: 1,
          title: '',
          mime_type: 'image/png',
          status: 'ACTIVE',
          deleted_at: null,
          file_path: file1Path,
          sha256_hash: 'hash5',
          byte_size: 14,
        },
      ]);

      const res = await supertest(app)
        .post('/assets/batch/download')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ asset_ids: [5] });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/zip');
    });

    it('streams ZIP with deduplicated file names when title has no extension', async () => {
      const file1Path = path.join(testSandbox, 'noext1');
      const file2Path = path.join(testSandbox, 'noext2');
      fs.writeFileSync(file1Path, 'bytes1');
      fs.writeFileSync(file2Path, 'bytes2');

      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 10,
          tenant_id: 1,
          workspace_id: 1,
          collection_id: null,
          title: 'document',
          mime_type: 'application/octet-stream',
          status: 'ACTIVE',
          deleted_at: null,
          file_path: file1Path,
          sha256_hash: 'hash10',
          byte_size: 6,
        },
        {
          id: 11,
          tenant_id: 1,
          workspace_id: 1,
          collection_id: null,
          title: 'document',
          mime_type: 'application/octet-stream',
          status: 'ACTIVE',
          deleted_at: null,
          file_path: file2Path,
          sha256_hash: 'hash11',
          byte_size: 6,
        },
      ]);

      const res = await supertest(app)
        .post('/assets/batch/download')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ asset_ids: [10, 11] });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/zip');
    });

    it('handles 500 error on database failure', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('DB Connection Failed'));

      const res = await supertest(app)
        .post('/assets/batch/download')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ asset_ids: [1] });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Internal Server Error');
    });

    it('handles 500 error on file system read failure before streaming', async () => {
      const file1Path = path.join(testSandbox, 'arch_err.png');
      fs.writeFileSync(file1Path, 'test-bytes');

      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 1,
          workspace_id: 1,
          collection_id: 1,
          title: 'arch_err.png',
          mime_type: 'image/png',
          status: 'ACTIVE',
          deleted_at: null,
          file_path: file1Path,
          sha256_hash: 'hash1',
          byte_size: 10,
        },
      ]);

      const readSpy = vi.spyOn(fs, 'readFileSync').mockImplementationOnce(() => {
        throw new Error('Simulated disk read failure');
      });

      const res = await supertest(app)
        .post('/assets/batch/download')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ asset_ids: [1] });

      readSpy.mockRestore();

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Internal Server Error');
    });
  });

  describe('POST /assets/batch/relocate (Bulk Relocate)', () => {
    it('returns 401 if unauthenticated', async () => {
      const res = await supertest(app)
        .post('/assets/batch/relocate')
        .send({ asset_ids: [1], workspace_id: 10 });
      expect(res.status).toBe(401);
    });

    it('returns 400 if validation fails', async () => {
      const res = await supertest(app)
        .post('/assets/batch/relocate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ asset_ids: [], workspace_id: -1 });

      expect(res.status).toBe(400);
    });

    it('returns 404 if destination workspace not found for tenant', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .post('/assets/batch/relocate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ asset_ids: [1], workspace_id: 999 });

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('Espacio de trabajo de destino no encontrado');
    });

    it('returns 400 if destination collection does not belong to destination workspace', async () => {
      vi.mocked(db.query)
        // 1. Destination workspace found
        .mockResolvedValueOnce([{ id: 10, tenant_id: 1 }])
        // 2. Destination collection not in workspace
        .mockResolvedValueOnce([]);

      const res = await supertest(app)
        .post('/assets/batch/relocate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ asset_ids: [1], workspace_id: 10, collection_id: 20 });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain(
        'La colección de destino no pertenece al espacio de trabajo',
      );
    });

    it('returns 403 if ACL denies access on destination workspace for client actor', async () => {
      vi.mocked(db.query)
        // 1. Workspace found
        .mockResolvedValueOnce([{ id: 10, tenant_id: 1 }])
        // 2. ACL check on destination workspace returns empty list (deny)
        .mockResolvedValueOnce([]);

      const res = await supertest(app)
        .post('/assets/batch/relocate')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ asset_ids: [1], workspace_id: 10 });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain(
        'Acceso denegado por política de control de acceso (ACL) en el espacio de trabajo de destino',
      );
    });

    it('returns 403 if ACL denies access on destination collection for client actor', async () => {
      vi.mocked(db.query)
        // 1. Workspace found
        .mockResolvedValueOnce([{ id: 10, tenant_id: 1 }])
        // 2. Collection found
        .mockResolvedValueOnce([{ id: 20, workspace_id: 10 }])
        // 3. ACL on destination collection returns empty list (deny)
        .mockResolvedValueOnce([]);

      const res = await supertest(app)
        .post('/assets/batch/relocate')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ asset_ids: [1], workspace_id: 10, collection_id: 20 });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain(
        'Acceso denegado por política de control de acceso (ACL) en la colección de destino',
      );
    });

    it('successfully relocates assets with partial permissions breakdown', async () => {
      vi.mocked(db.query)
        // 1. Workspace found
        .mockResolvedValueOnce([{ id: 10, tenant_id: 1 }])
        // 2. Fetch candidate assets (asset 1 and asset 2 found; asset 3 not found in DB)
        .mockResolvedValueOnce([
          {
            id: 1,
            tenant_id: 1,
            workspace_id: 1,
            collection_id: null,
            status: 'ACTIVE',
            deleted_at: null,
          },
          {
            id: 2,
            tenant_id: 1,
            workspace_id: 1,
            collection_id: null,
            status: 'ACTIVE',
            deleted_at: null,
          },
        ])
        // 3. Update query execute
        .mockResolvedValueOnce({ affectedRows: 2 });

      const res = await supertest(app)
        .post('/assets/batch/relocate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ asset_ids: [1, 2, 3], workspace_id: 10 });

      expect(res.status).toBe(200);
      expect(res.body.data.relocated_count).toBe(2);
      expect(res.body.data.relocated_asset_ids).toEqual([1, 2]);
      expect(res.body.data.failed_asset_ids).toEqual([3]);
      expect(res.body.data.destination_workspace_id).toBe(10);
      expect(res.body.data.destination_collection_id).toBeNull();
    });

    it('handles client user where asset is denied by ACL during relocate', async () => {
      vi.mocked(db.query)
        // 1. Workspace found
        .mockResolvedValueOnce([{ id: 10, tenant_id: 1 }])
        // 2. ACL check on destination workspace (allow)
        .mockResolvedValueOnce([
          {
            resource_type: 'WORKSPACE',
            resource_id: 10,
            permission: 'EDIT',
            granted_by: 'ADMIN',
          },
        ])
        // 3. Candidate assets
        .mockResolvedValueOnce([
          {
            id: 1,
            tenant_id: 1,
            workspace_id: 10,
            collection_id: null,
            status: 'ACTIVE',
            deleted_at: null,
          },
        ])
        // 4. ACL check on asset 1 (deny)
        .mockResolvedValueOnce([]);

      const res = await supertest(app)
        .post('/assets/batch/relocate')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ asset_ids: [1, 99], workspace_id: 10 });

      expect(res.status).toBe(200);
      expect(res.body.data.relocated_count).toBe(0);
      expect(res.body.data.relocated_asset_ids).toEqual([]);
      expect(res.body.data.failed_asset_ids).toEqual([1, 99]);
    });

    it('handles client user relocate with destination collection allowed by ACL', async () => {
      vi.mocked(db.query)
        // 1. Destination workspace lookup
        .mockResolvedValueOnce([{ id: 10, tenant_id: 1 }])
        // 2. Destination collection lookup
        .mockResolvedValueOnce([{ id: 20, workspace_id: 10 }])
        // 3. ACL check on destination collection (allow)
        .mockResolvedValueOnce([
          {
            resource_type: 'COLLECTION',
            resource_id: 20,
            permission: 'EDIT',
            granted_by: 'ADMIN',
          },
        ])
        // 4. Candidate assets
        .mockResolvedValueOnce([
          {
            id: 1,
            tenant_id: 1,
            workspace_id: 10,
            collection_id: null,
            status: 'ACTIVE',
            deleted_at: null,
          },
        ])
        // 5. ACL check on candidate asset (allow)
        .mockResolvedValueOnce([
          {
            resource_type: 'ASSET',
            resource_id: 1,
            permission: 'EDIT',
            granted_by: 'ADMIN',
          },
        ])
        // 6. UPDATE assets
        .mockResolvedValueOnce({ affectedRows: 1 });

      const res = await supertest(app)
        .post('/assets/batch/relocate')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ asset_ids: [1], workspace_id: 10, collection_id: 20 });

      expect(res.status).toBe(200);
      expect(res.body.data.relocated_count).toBe(1);
      expect(res.body.data.destination_collection_id).toBe(20);
    });

    it('handles 500 error on database exception in relocate', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('DB Query Relocate Crash'));

      const res = await supertest(app)
        .post('/assets/batch/relocate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ asset_ids: [1], workspace_id: 10 });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Internal Server Error');
    });
  });

  describe('POST /assets/batch/tags/assign (Bulk Assign Tags)', () => {
    it('returns 401 if unauthenticated', async () => {
      const res = await supertest(app)
        .post('/assets/batch/tags/assign')
        .send({ asset_ids: [1], tag_ids: [10] });
      expect(res.status).toBe(401);
    });

    it('returns 400 if validation fails', async () => {
      const res = await supertest(app)
        .post('/assets/batch/tags/assign')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ asset_ids: [], tag_ids: [] });

      expect(res.status).toBe(400);
    });

    it('returns 404 if no valid tags found for tenant', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .post('/assets/batch/tags/assign')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ asset_ids: [1], tag_ids: [999] });

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('Ninguna de las etiquetas especificadas fue encontrada');
    });

    it('successfully assigns tags to multiple assets', async () => {
      vi.mocked(db.query)
        // 1. Tags found
        .mockResolvedValueOnce([{ id: 5 }, { id: 6 }])
        // 2. Candidate assets
        .mockResolvedValueOnce([
          { id: 1, tenant_id: 1, workspace_id: 1, collection_id: 1 },
          { id: 2, tenant_id: 1, workspace_id: 1, collection_id: 1 },
        ])
        // 3. Insert ignore query
        .mockResolvedValueOnce({ affectedRows: 4 });

      const res = await supertest(app)
        .post('/assets/batch/tags/assign')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ asset_ids: [1, 2, 3], tag_ids: [5, 6] });

      expect(res.status).toBe(200);
      expect(res.body.data.assigned_count).toBe(2);
      expect(res.body.data.processed_asset_ids).toEqual([1, 2]);
      expect(res.body.data.failed_asset_ids).toEqual([3]);
      expect(res.body.data.tag_ids).toEqual([5, 6]);
    });

    it('handles client ACL denial on candidate asset during tag assign', async () => {
      vi.mocked(db.query)
        // 1. Tags found
        .mockResolvedValueOnce([{ id: 5 }])
        // 2. Candidate assets
        .mockResolvedValueOnce([{ id: 1, tenant_id: 1, workspace_id: 1, collection_id: 1 }])
        // 3. ACL check (deny)
        .mockResolvedValueOnce([]);

      const res = await supertest(app)
        .post('/assets/batch/tags/assign')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ asset_ids: [1], tag_ids: [5] });

      expect(res.status).toBe(200);
      expect(res.body.data.assigned_count).toBe(0);
      expect(res.body.data.failed_asset_ids).toEqual([1]);
    });

    it('handles 500 on database error during tag assign', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('Tag assign DB fail'));

      const res = await supertest(app)
        .post('/assets/batch/tags/assign')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ asset_ids: [1], tag_ids: [5] });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Internal Server Error');
    });
  });

  describe('POST /assets/batch/tags/remove (Bulk Remove Tags)', () => {
    it('returns 401 if unauthenticated', async () => {
      const res = await supertest(app)
        .post('/assets/batch/tags/remove')
        .send({ asset_ids: [1], tag_ids: [10] });
      expect(res.status).toBe(401);
    });

    it('returns 400 if validation fails', async () => {
      const res = await supertest(app)
        .post('/assets/batch/tags/remove')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ asset_ids: [], tag_ids: [10] });

      expect(res.status).toBe(400);
    });

    it('successfully removes tags from multiple assets', async () => {
      vi.mocked(db.query)
        // 1. Candidate assets
        .mockResolvedValueOnce([
          { id: 1, tenant_id: 1, workspace_id: 1, collection_id: 1 },
          { id: 2, tenant_id: 1, workspace_id: 1, collection_id: 1 },
        ])
        // 2. Delete query
        .mockResolvedValueOnce({ affectedRows: 2 });

      const res = await supertest(app)
        .post('/assets/batch/tags/remove')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ asset_ids: [1, 2, 4], tag_ids: [5, 6] });

      expect(res.status).toBe(200);
      expect(res.body.data.removed_count).toBe(2);
      expect(res.body.data.processed_asset_ids).toEqual([1, 2]);
      expect(res.body.data.failed_asset_ids).toEqual([4]);
      expect(res.body.data.tag_ids).toEqual([5, 6]);
    });

    it('handles client ACL denial on candidate asset during tag remove', async () => {
      vi.mocked(db.query)
        // 1. Candidate assets
        .mockResolvedValueOnce([{ id: 1, tenant_id: 1, workspace_id: 1, collection_id: 1 }])
        // 2. ACL check (deny)
        .mockResolvedValueOnce([]);

      const res = await supertest(app)
        .post('/assets/batch/tags/remove')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ asset_ids: [1], tag_ids: [5] });

      expect(res.status).toBe(200);
      expect(res.body.data.removed_count).toBe(0);
      expect(res.body.data.failed_asset_ids).toEqual([1]);
    });

    it('handles 500 on database error during tag remove', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('Tag remove DB fail'));

      const res = await supertest(app)
        .post('/assets/batch/tags/remove')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ asset_ids: [1], tag_ids: [5] });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Internal Server Error');
    });
  });

  describe('POST /assets/batch/delete (Bulk Soft-Delete)', () => {
    it('returns 401 if unauthenticated', async () => {
      const res = await supertest(app)
        .post('/assets/batch/delete')
        .send({ asset_ids: [1] });
      expect(res.status).toBe(401);
    });

    it('returns 400 if validation fails', async () => {
      const res = await supertest(app)
        .post('/assets/batch/delete')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ asset_ids: [] });

      expect(res.status).toBe(400);
    });

    it('successfully soft-deletes assets with partial permissions', async () => {
      vi.mocked(db.query)
        // 1. Candidate assets
        .mockResolvedValueOnce([
          { id: 1, tenant_id: 1, workspace_id: 1, collection_id: 1 },
          { id: 2, tenant_id: 1, workspace_id: 1, collection_id: 1 },
        ])
        // 2. Soft-delete update query
        .mockResolvedValueOnce({ affectedRows: 2 });

      const res = await supertest(app)
        .post('/assets/batch/delete')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ asset_ids: [1, 2, 7] });

      expect(res.status).toBe(200);
      expect(res.body.data.deleted_count).toBe(2);
      expect(res.body.data.deleted_asset_ids).toEqual([1, 2]);
      expect(res.body.data.failed_asset_ids).toEqual([7]);
    });

    it('handles client ACL denial on candidate asset during delete', async () => {
      vi.mocked(db.query)
        // 1. Candidate assets
        .mockResolvedValueOnce([{ id: 1, tenant_id: 1, workspace_id: 1, collection_id: 1 }])
        // 2. ACL check (deny)
        .mockResolvedValueOnce([]);

      const res = await supertest(app)
        .post('/assets/batch/delete')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ asset_ids: [1] });

      expect(res.status).toBe(200);
      expect(res.body.data.deleted_count).toBe(0);
      expect(res.body.data.failed_asset_ids).toEqual([1]);
    });

    it('handles 500 on database error during delete', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('Batch delete DB fail'));

      const res = await supertest(app)
        .post('/assets/batch/delete')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ asset_ids: [1] });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Internal Server Error');
    });
  });

  describe('Rate Limiter Protection (batchRateLimiter)', () => {
    it('returns 429 when batch operations rate limit is exceeded', async () => {
      const rateLimitApp = express();
      rateLimitApp.use(express.json());
      rateLimitApp.post('/test-batch-limit', batchRateLimiter, (_req, res) => {
        res.status(200).json({ ok: true });
      });

      for (let i = 0; i < 100; i++) {
        await supertest(rateLimitApp).post('/test-batch-limit').send({});
      }

      const blockedRes = await supertest(rateLimitApp).post('/test-batch-limit').send({});
      expect(blockedRes.status).toBe(429);
      expect(blockedRes.body.error).toBe('Too Many Requests');
      expect(blockedRes.body.message).toContain('Límite de operaciones por lotes');
    });
  });
});
