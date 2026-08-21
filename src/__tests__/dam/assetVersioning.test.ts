/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import supertest from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import assetsRouter from '../../../server/src/routes/assets';
import { versionsRateLimiter } from '../../../server/src/middleware/rateLimiter';
import * as db from '../../../server/src/db';
import { STORAGE_ROOT } from '../../../server/src/utils/storage';
import {
  assetIdParamSchema,
  assetVersionParamsSchema,
} from '../../../server/src/schemas/assetVersion.schema';

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

describe('DAM Asset Versioning & Revision History (FC 008)', () => {
  const testSandbox = path.join(STORAGE_ROOT, 'test_versioning_sandbox');

  const ownerToken = jwt.sign(
    { userId: 1, uid: 1, email: 'owner@dreamtek.tech', role: 'ADMIN', tenantId: 1 },
    TEST_SECRET,
    { algorithm: 'HS512' },
  );

  const collaboratorToken = jwt.sign(
    { userId: 2, uid: 2, email: 'collaborator@dreamtek.tech', role: 'CLIENT', tenantId: 1 },
    TEST_SECRET,
    { algorithm: 'HS512' },
  );

  // Valid 1x1 transparent PNG buffer
  const validPngBuffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  );

  // PDF magic bytes (%PDF-1.7...)
  const validPdfBuffer = Buffer.from([
    0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3,
  ]);

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

  describe('Zod Schemas & Rate Limiting', () => {
    it('validates assetIdParamSchema correctly', () => {
      expect(assetIdParamSchema.safeParse({ id: '10' }).success).toBe(true);
      expect(assetIdParamSchema.safeParse({ id: '-5' }).success).toBe(false);
      expect(assetIdParamSchema.safeParse({ id: 'abc' }).success).toBe(false);
    });

    it('validates assetVersionParamsSchema correctly', () => {
      expect(assetVersionParamsSchema.safeParse({ id: '10', versionNumber: '2' }).success).toBe(
        true,
      );
      expect(assetVersionParamsSchema.safeParse({ id: '10', versionNumber: '0' }).success).toBe(
        false,
      );
      expect(assetVersionParamsSchema.safeParse({ id: '10', versionNumber: '-1' }).success).toBe(
        false,
      );
    });
  });

  describe('POST /assets/:id/versions (Upload New Version)', () => {
    it('returns 400 when no file is uploaded', async () => {
      const res = await supertest(app)
        .post('/assets/1/versions')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('No se proporcionó ningún archivo para la nueva versión.');
    });

    it('returns 400 when magic bytes are disallowed', async () => {
      const res = await supertest(app)
        .post('/assets/1/versions')
        .set('Authorization', `Bearer ${ownerToken}`)
        .attach('file', Buffer.from('malicious-executable-content'), 'bad.exe');

      expect(res.status).toBe(400);
      expect(res.body.message).toBe(
        'Tipo de archivo no permitido o contenido malicioso detectado.',
      );
    });

    it('returns 404 if asset not found or belongs to another tenant (Anti-IDOR)', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .post('/assets/999/versions')
        .set('Authorization', `Bearer ${ownerToken}`)
        .attach('file', validPngBuffer, 'photo_v2.png');

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Activo digital no encontrado.');
    });

    it('returns 404 if asset is soft-deleted', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 1,
          workspace_id: 1,
          collection_id: 1,
          title: 'Logo',
          status: 'DELETED',
          deleted_at: '2026-08-20',
        },
      ]);

      const res = await supertest(app)
        .post('/assets/1/versions')
        .set('Authorization', `Bearer ${ownerToken}`)
        .attach('file', validPngBuffer, 'photo_v2.png');

      expect(res.status).toBe(404);
    });

    it('returns 403 when ACL denies EDIT on asset', async () => {
      // 1. Asset check
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 1,
          workspace_id: 1,
          collection_id: 1,
          title: 'Logo',
          status: 'ACTIVE',
          deleted_at: null,
        },
      ]);
      // 2. dam_acl_entries -> empty
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .post('/assets/1/versions')
        .set('Authorization', `Bearer ${collaboratorToken}`)
        .attach('file', validPngBuffer, 'photo_v2.png');

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Acceso denegado');
    });

    it('uploads new version successfully for image file (creates v2 + derivatives)', async () => {
      // 1. Asset check
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 1,
          workspace_id: 1,
          collection_id: 1,
          title: 'Logo',
          status: 'ACTIVE',
          deleted_at: null,
        },
      ]);
      // 2. Max version check
      vi.mocked(db.query).mockResolvedValueOnce([{ max_version: 1 }]);
      // 3. Insert version
      vi.mocked(db.query).mockResolvedValueOnce({ insertId: 10 } as any);
      // 4. Insert derivative 1
      vi.mocked(db.query).mockResolvedValueOnce({ insertId: 21 } as any);
      // 5. Insert derivative 2
      vi.mocked(db.query).mockResolvedValueOnce({ insertId: 22 } as any);

      const res = await supertest(app)
        .post('/assets/1/versions')
        .set('Authorization', `Bearer ${ownerToken}`)
        .attach('file', validPngBuffer, 'logo_v2.png');

      expect(res.status).toBe(201);
      expect(res.body.data.versionNumber).toBe(2);
      expect(res.body.data.versionId).toBe(10);
      expect(res.body.data.mimeType).toBe('image/png');
    });

    it('uploads new version successfully for non-image file (e.g. PDF, skips derivatives)', async () => {
      // 1. Asset check
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 1,
          workspace_id: 1,
          collection_id: 1,
          title: 'Document',
          status: 'ACTIVE',
          deleted_at: null,
        },
      ]);
      // 2. Max version check (e.g. first version)
      vi.mocked(db.query).mockResolvedValueOnce([{ max_version: null }]);
      // 3. Insert version
      vi.mocked(db.query).mockResolvedValueOnce({ insertId: 1 } as any);

      const res = await supertest(app)
        .post('/assets/1/versions')
        .set('Authorization', `Bearer ${ownerToken}`)
        .attach('file', validPdfBuffer, 'doc_v1.pdf');

      expect(res.status).toBe(201);
      expect(res.body.data.versionNumber).toBe(1);
      expect(res.body.data.mimeType).toBe('application/pdf');
    });

    it('handles unexpected database error on upload', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('DB connection failed'));

      const res = await supertest(app)
        .post('/assets/1/versions')
        .set('Authorization', `Bearer ${ownerToken}`)
        .attach('file', validPngBuffer, 'logo_v2.png');

      expect(res.status).toBe(500);
      expect(res.body.message).toBe('Error al cargar la nueva versión del activo.');
    });
  });

  describe('GET /assets/:id/versions (List Version History)', () => {
    it('returns 404 if asset not found or cross-tenant', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .get('/assets/999/versions')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Activo digital no encontrado.');
    });

    it('returns 404 if asset is soft-deleted', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 1,
          workspace_id: 1,
          collection_id: 1,
          status: 'DELETED',
          deleted_at: '2026-08-20',
        },
      ]);

      const res = await supertest(app)
        .get('/assets/1/versions')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(404);
    });

    it('returns 403 when ACL evaluation denies VIEW (cross-tenant preloaded metadata)', async () => {
      // Mock rows returning asset belonging to tenant 99 (mismatched with collaborator tenantId: 1)
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 99,
          workspace_id: 1,
          collection_id: 1,
          status: 'ACTIVE',
          deleted_at: null,
        },
      ]);

      const res = await supertest(app)
        .get('/assets/1/versions')
        .set('Authorization', `Bearer ${collaboratorToken}`);

      expect(res.status).toBe(403);
    });

    it('returns version history list ordered by version_number DESC', async () => {
      // 1. Asset check
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 1,
          workspace_id: 1,
          collection_id: 1,
          status: 'ACTIVE',
          deleted_at: null,
        },
      ]);
      // 2. Versions query
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 2,
          version_number: 2,
          byte_size: 4096,
          sha256_hash: 'hash-v2',
          created_by: 1,
          created_at: '2026-08-20 18:00:00',
        },
        {
          id: 1,
          version_number: 1,
          byte_size: null as any,
          sha256_hash: 'hash-v1',
          created_by: 1,
          created_at: '2026-08-20 17:00:00',
        },
      ]);

      const res = await supertest(app)
        .get('/assets/1/versions')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].versionNumber).toBe(2);
      expect(res.body.data[0].byteSize).toBe(4096);
      expect(res.body.data[1].versionNumber).toBe(1);
      expect(res.body.data[1].byteSize).toBe(0);
    });

    it('handles empty or null version query gracefully', async () => {
      // 1. Asset check
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 1,
          workspace_id: 1,
          collection_id: 1,
          status: 'ACTIVE',
          deleted_at: null,
        },
      ]);
      // 2. Versions query returning null
      vi.mocked(db.query).mockResolvedValueOnce(null as any);

      const res = await supertest(app)
        .get('/assets/1/versions')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('handles database error on listing versions', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('DB Error'));

      const res = await supertest(app)
        .get('/assets/1/versions')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(500);
      expect(res.body.message).toBe('Error al consultar el historial de versiones del activo.');
    });
  });

  describe('GET /assets/:id/versions/:versionNumber/stream (Stream Specific Version)', () => {
    it('returns 404 if asset not found or cross-tenant', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .get('/assets/999/versions/1/stream')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Activo digital no encontrado.');
    });

    it('returns 404 if asset is soft-deleted', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 1,
          workspace_id: 1,
          collection_id: 1,
          title: 'Photo',
          mime_type: 'image/png',
          status: 'DELETED',
          deleted_at: '2026-08-20',
        },
      ]);

      const res = await supertest(app)
        .get('/assets/1/versions/1/stream')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(404);
    });

    it('returns 403 when ACL denies DOWNLOAD', async () => {
      // 1. Asset check
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 1,
          workspace_id: 1,
          collection_id: 1,
          title: 'Photo',
          mime_type: 'image/png',
          status: 'ACTIVE',
          deleted_at: null,
        },
      ]);
      // 2. dam_acl_entries -> empty (collaborator default is VIEW, not DOWNLOAD)
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .get('/assets/1/versions/1/stream')
        .set('Authorization', `Bearer ${collaboratorToken}`);

      expect(res.status).toBe(403);
    });

    it('returns 404 if version does not exist', async () => {
      // 1. Asset check
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 1,
          workspace_id: 1,
          collection_id: 1,
          title: 'Photo',
          mime_type: 'image/png',
          status: 'ACTIVE',
          deleted_at: null,
        },
      ]);
      // 2. Version query -> empty
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .get('/assets/1/versions/99/stream')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Versión de activo no encontrada.');
    });

    it('returns 404 if physical file is missing from storage', async () => {
      // 1. Asset check
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 1,
          workspace_id: 1,
          collection_id: 1,
          title: 'Photo',
          mime_type: 'image/png',
          status: 'ACTIVE',
          deleted_at: null,
        },
      ]);
      // 2. Version query
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          version_number: 1,
          byte_size: 1024,
          sha256_hash: 'hash-v1',
          file_path: path.join(testSandbox, 'missing_file.png'),
        },
      ]);

      const res = await supertest(app)
        .get('/assets/1/versions/1/stream')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Archivo físico de versión no encontrado.');
    });

    it('streams version binary successfully with correct headers', async () => {
      const realStreamFile = path.join(testSandbox, 'sample_version_stream.png');
      const content = Buffer.from('sample-version-stream-content');
      fs.writeFileSync(realStreamFile, content);

      // 1. Asset check
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 1,
          workspace_id: 1,
          collection_id: 1,
          title: 'Photo',
          mime_type: 'image/png',
          status: 'ACTIVE',
          deleted_at: null,
        },
      ]);
      // 2. Version query
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          version_number: 1,
          byte_size: content.length,
          sha256_hash: 'hash-v1',
          file_path: realStreamFile,
        },
      ]);

      const res = await supertest(app)
        .get('/assets/1/versions/1/stream')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('image/png');
      expect(res.headers['etag']).toBe('"hash-v1"');
      expect(res.headers['cache-control']).toBe('private, max-age=3600');
    });

    it('handles database error on streaming version', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('DB Error'));

      const res = await supertest(app)
        .get('/assets/1/versions/1/stream')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(500);
      expect(res.body.message).toBe('Error al transmitir la versión del activo.');
    });
  });

  describe('GET /assets/:id/versions/:versionNumber/thumbnail (Version Thumbnail)', () => {
    it('returns 404 if asset not found or cross-tenant', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .get('/assets/999/versions/1/thumbnail')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Activo digital no encontrado.');
    });

    it('returns 404 if asset is soft-deleted', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 1,
          workspace_id: 1,
          collection_id: 1,
          status: 'DELETED',
          deleted_at: '2026-08-20',
        },
      ]);

      const res = await supertest(app)
        .get('/assets/1/versions/1/thumbnail')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(404);
    });

    it('returns 403 when ACL denies VIEW (cross-tenant preloaded metadata)', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 99,
          workspace_id: 1,
          collection_id: 1,
          status: 'ACTIVE',
          deleted_at: null,
        },
      ]);

      const res = await supertest(app)
        .get('/assets/1/versions/1/thumbnail')
        .set('Authorization', `Bearer ${collaboratorToken}`);

      expect(res.status).toBe(403);
    });

    it('returns 404 if derivative not found or not an image version', async () => {
      // 1. Asset check
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 1,
          workspace_id: 1,
          collection_id: 1,
          status: 'ACTIVE',
          deleted_at: null,
        },
      ]);
      // 2. Derivative query -> empty
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .get('/assets/1/versions/1/thumbnail')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Miniatura no disponible para esta versión.');
    });

    it('returns 404 if thumbnail file missing from storage', async () => {
      // 1. Asset check
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 1,
          workspace_id: 1,
          collection_id: 1,
          status: 'ACTIVE',
          deleted_at: null,
        },
      ]);
      // 2. Derivative query
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          file_path: path.join(testSandbox, 'thumb_missing.webp'),
          byte_size: 512,
        },
      ]);

      const res = await supertest(app)
        .get('/assets/1/versions/1/thumbnail')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Archivo de miniatura no encontrado en almacenamiento.');
    });

    it('streams version thumbnail successfully', async () => {
      const realThumbFile = path.join(testSandbox, 'thumb_version.webp');
      fs.writeFileSync(realThumbFile, Buffer.from('fake-thumb-bytes'));

      // 1. Asset check
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 1,
          workspace_id: 1,
          collection_id: 1,
          status: 'ACTIVE',
          deleted_at: null,
        },
      ]);
      // 2. Derivative query
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          file_path: realThumbFile,
          byte_size: 16,
        },
      ]);

      const res = await supertest(app)
        .get('/assets/1/versions/1/thumbnail')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('image/webp');
      expect(res.headers['cache-control']).toBe('public, max-age=86400');
    });

    it('handles database error on version thumbnail', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('DB Error'));

      const res = await supertest(app)
        .get('/assets/1/versions/1/thumbnail')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(500);
      expect(res.body.message).toBe('Error al consultar la miniatura de la versión.');
    });
  });

  describe('POST /assets/:id/versions/:versionNumber/promote (Promote Version to New HEAD)', () => {
    it('returns 404 if asset not found or cross-tenant', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .post('/assets/999/versions/1/promote')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Activo digital no encontrado.');
    });

    it('returns 404 if asset is soft-deleted', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 1,
          workspace_id: 1,
          collection_id: 1,
          title: 'Doc',
          status: 'DELETED',
          deleted_at: '2026-08-20',
        },
      ]);

      const res = await supertest(app)
        .post('/assets/1/versions/1/promote')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(404);
    });

    it('returns 403 when ACL denies EDIT', async () => {
      // 1. Asset check
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 1,
          workspace_id: 1,
          collection_id: 1,
          title: 'Doc',
          status: 'ACTIVE',
          deleted_at: null,
        },
      ]);
      // 2. dam_acl_entries -> empty
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .post('/assets/1/versions/1/promote')
        .set('Authorization', `Bearer ${collaboratorToken}`);

      expect(res.status).toBe(403);
    });

    it('returns 404 if source version to promote is not found', async () => {
      // 1. Asset check
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 1,
          workspace_id: 1,
          collection_id: 1,
          title: 'Doc',
          status: 'ACTIVE',
          deleted_at: null,
        },
      ]);
      // 2. Source version query -> empty
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .post('/assets/1/versions/99/promote')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Versión de activo a promover no encontrada.');
    });

    it('promotes version successfully by creating new HEAD (e.g. promoting v1 creates v3)', async () => {
      // 1. Asset check
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 1,
          workspace_id: 1,
          collection_id: 1,
          title: 'Logo Design',
          status: 'ACTIVE',
          deleted_at: null,
        },
      ]);
      // 2. Source version query
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          version_number: 1,
          byte_size: 2048,
          sha256_hash: 'sha-v1',
          file_path: path.join(testSandbox, 'v1_logo.png'),
        },
      ]);
      // 3. Max version query (currently at v2)
      vi.mocked(db.query).mockResolvedValueOnce([{ max_version: 2 }]);
      // 4. Insert new version (v3)
      vi.mocked(db.query).mockResolvedValueOnce({ insertId: 30 } as any);
      // 5. Clone derivatives
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 2 } as any);

      const res = await supertest(app)
        .post('/assets/1/versions/1/promote')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.promotedFromVersion).toBe(1);
      expect(res.body.data.newHeadVersionNumber).toBe(3);
      expect(res.body.data.versionId).toBe(30);
      expect(res.body.data.sha256Hash).toBe('sha-v1');
      expect(res.body.data.byteSize).toBe(2048);
    });

    it('promotes version successfully when max_version returns null (defaults to 1)', async () => {
      // 1. Asset check
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 1,
          workspace_id: 1,
          collection_id: 1,
          title: 'Logo Design',
          status: 'ACTIVE',
          deleted_at: null,
        },
      ]);
      // 2. Source version query
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          version_number: 1,
          byte_size: 2048,
          sha256_hash: 'sha-v1',
          file_path: path.join(testSandbox, 'v1_logo.png'),
        },
      ]);
      // 3. Max version query returning null
      vi.mocked(db.query).mockResolvedValueOnce([{ max_version: null }]);
      // 4. Insert new version (v1)
      vi.mocked(db.query).mockResolvedValueOnce({ insertId: 31 } as any);
      // 5. Clone derivatives
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 0 } as any);

      const res = await supertest(app)
        .post('/assets/1/versions/1/promote')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.newHeadVersionNumber).toBe(1);
      expect(res.body.data.versionId).toBe(31);
    });

    it('handles database error on promote', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('DB Error'));

      const res = await supertest(app)
        .post('/assets/1/versions/1/promote')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(500);
      expect(res.body.message).toBe('Error al promover la versión del activo.');
    });
  });

  describe('Rate Limiter 429 Handlers', () => {
    it('triggers versionsRateLimiter 429 response handler', async () => {
      const appVersionsLimit = express();
      appVersionsLimit.use(versionsRateLimiter);
      appVersionsLimit.get('/test-ver', (_req, res) => res.json({ ok: true }));

      for (let i = 0; i < 100; i++) {
        await supertest(appVersionsLimit).get('/test-ver');
      }
      const resBlocked = await supertest(appVersionsLimit).get('/test-ver');
      expect(resBlocked.status).toBe(429);
      expect(resBlocked.body.message).toMatch(/Límite de operaciones de versiones/);
    });
  });
});
