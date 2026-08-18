/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import supertest from 'supertest';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

import * as db from '../../../server/src/db';
import assetsRouter from '../../../server/src/routes/assets';
import { validateMagicBytes } from '../../../server/src/utils/magicBytes';
import {
  STORAGE_ROOT,
  assertPathContained,
  computeBufferSha256,
  generateWebPDerivatives,
  getOrCreateDefaultWorkspace,
} from '../../../server/src/utils/storage';

vi.mock('../../../server/src/db', () => ({
  query: vi.fn(),
  pool: {
    execute: vi.fn().mockResolvedValue([{ affectedRows: 1 }]),
  },
}));

const TEST_SECRET = 'dreamtek_dev_jwt_secret_key_2026';

describe('FC 003 — DAM Asset Ingestion & Storage Suite', () => {
  const testDir = path.join(STORAGE_ROOT, 'test_sandbox');

  beforeEach(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    vi.clearAllMocks();
  });

  afterEach(() => {
    try {
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore Windows file handle delay
    }
  });

  describe('1. Magic Bytes & MIME Type Security (OWASP A03 / A05)', () => {
    it('should return null for short buffer < 12 bytes', () => {
      const short = Buffer.from([0x89, 0x50]);
      expect(validateMagicBytes(short)).toBeNull();
    });

    it('should correctly identify valid PNG file header', () => {
      const pngHeader = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      ]);
      const res = validateMagicBytes(pngHeader);
      expect(res).toEqual({ mime: 'image/png', ext: 'png' });
    });

    it('should correctly identify valid JPEG file header', () => {
      const jpgHeader = Buffer.from([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
      ]);
      const res = validateMagicBytes(jpgHeader);
      expect(res).toEqual({ mime: 'image/jpeg', ext: 'jpg' });
    });

    it('should correctly identify valid WebP file header', () => {
      const webpHeader = Buffer.from([
        0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38,
        0x20,
      ]);
      const res = validateMagicBytes(webpHeader);
      expect(res).toEqual({ mime: 'image/webp', ext: 'webp' });
    });

    it('should correctly identify valid GIF file header (87a and 89a)', () => {
      const gif89a = Buffer.from('GIF89a\x01\x00\x01\x00\x80\x00\x00', 'binary');
      expect(validateMagicBytes(gif89a)).toEqual({ mime: 'image/gif', ext: 'gif' });

      const gif87a = Buffer.from('GIF87a\x01\x00\x01\x00\x80\x00\x00', 'binary');
      expect(validateMagicBytes(gif87a)).toEqual({ mime: 'image/gif', ext: 'gif' });
    });

    it('should correctly identify valid PDF file header', () => {
      const pdfHeader = Buffer.from([
        0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x25, 0xd0, 0xd4,
      ]);
      const res = validateMagicBytes(pdfHeader);
      expect(res).toEqual({ mime: 'application/pdf', ext: 'pdf' });
    });

    it('should correctly identify valid MP4 file header', () => {
      const mp4Header = Buffer.from([
        0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
      ]);
      const res = validateMagicBytes(mp4Header);
      expect(res).toEqual({ mime: 'video/mp4', ext: 'mp4' });
    });

    it('should reject Windows PE/EXE binaries (MZ header 4D 5A)', () => {
      const exeHeader = Buffer.from([
        0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00,
      ]);
      const res = validateMagicBytes(exeHeader);
      expect(res).toBeNull();
    });

    it('should reject fake extension with shell script or text', () => {
      const scriptBuffer = Buffer.from('#!/bin/bash\necho "exploit"', 'utf-8');
      const res = validateMagicBytes(scriptBuffer);
      expect(res).toBeNull();
    });
  });

  describe('2. Path Traversal & Containment Guard (OWASP A01 / A05)', () => {
    it('should allow paths strictly located within STORAGE_ROOT', () => {
      const safePath = path.join(STORAGE_ROOT, 'tenants', '1', 'assets', '10', 'v1_sample.png');
      const resolved = assertPathContained(safePath);
      expect(resolved).toBe(path.resolve(safePath));
    });

    it('should throw Security Error on path traversal attempt (../)', () => {
      const maliciousPath = path.join(STORAGE_ROOT, '..', '..', 'etc', 'passwd');
      expect(() => assertPathContained(maliciousPath)).toThrow(/Path traversal attempt/);
    });
  });

  describe('3. Cryptographic Inmutability & Auto Bootstrap (OWASP A02)', () => {
    it('should compute deterministic SHA-256 hash', () => {
      const data = Buffer.from('Dreamtek DAM Inmutable Binary Asset 2026', 'utf-8');
      const hash = computeBufferSha256(data);
      const expected = crypto.createHash('sha256').update(data).digest('hex');
      expect(hash).toBe(expected);
      expect(hash).toHaveLength(64);
    });

    it('should auto bootstrap Workspace and Collection when not existing', async () => {
      const dbQueryMock = vi.mocked(db.query);
      dbQueryMock
        .mockResolvedValueOnce([]) // No existing workspace
        .mockResolvedValueOnce({ insertId: 101 } as any) // Insert workspace
        .mockResolvedValueOnce([]) // No existing collection
        .mockResolvedValueOnce({ insertId: 202 } as any); // Insert collection

      const res = await getOrCreateDefaultWorkspace(1);
      expect(res).toEqual({ workspaceId: 101, collectionId: 202 });
    });

    it('should reuse existing Workspace and Collection when available', async () => {
      const dbQueryMock = vi.mocked(db.query);
      dbQueryMock
        .mockResolvedValueOnce([{ id: 88 }]) // Existing workspace
        .mockResolvedValueOnce([{ id: 99 }]); // Existing collection

      const res = await getOrCreateDefaultWorkspace(1);
      expect(res).toEqual({ workspaceId: 88, collectionId: 99 });
    });
  });

  describe('4. WebP Derivative Generation with Sharp', () => {
    it('should generate thumb_200w and preview_800w WebP derivatives for valid image buffer', async () => {
      // 1x1 Transparent PNG buffer
      const pngBuffer = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64',
      );

      const outDir = path.join(testDir, 'derivatives');
      const derivatives = await generateWebPDerivatives(pngBuffer, 'image/png', outDir);

      expect(derivatives.length).toBe(2);
      expect(derivatives[0].derivativeType).toBe('THUMBNAIL_200W');
      expect(derivatives[1].derivativeType).toBe('PREVIEW_800W');

      expect(fs.existsSync(derivatives[0].filePath)).toBe(true);
      expect(fs.existsSync(derivatives[1].filePath)).toBe(true);
    });

    it('should skip image derivative generation for non-image MIME types (e.g. PDF)', async () => {
      const pdfBuffer = Buffer.from('%PDF-1.7 ... dummy pdf content ...', 'utf-8');
      const outDir = path.join(testDir, 'pdf_derivatives');
      const derivatives = await generateWebPDerivatives(pdfBuffer, 'application/pdf', outDir);
      expect(derivatives).toEqual([]);
    });

    it('should catch error gracefully if image derivative fails', async () => {
      const corruptBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x00, 0x00]);
      const outDir = path.join(testDir, 'corrupt_dir');
      const derivatives = await generateWebPDerivatives(corruptBuffer, 'image/png', outDir);
      expect(derivatives).toEqual([]);
    });
  });

  describe('5. Express Assets Router Endpoints (Supertest)', () => {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/assets', assetsRouter);

    const clientToken = jwt.sign(
      { userId: 1, uid: 1, email: 'client@dreamtek.tech', role: 'CLIENT' },
      TEST_SECRET,
      { algorithm: 'HS512' },
    );

    it('POST /assets/upload should reject request without file with 400', async () => {
      const res = await supertest(app)
        .post('/assets/upload')
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/No se proporcionó ningún archivo/);
    });

    it('POST /assets/upload should reject malicious executable file with 400', async () => {
      const exeBuffer = Buffer.from([
        0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      ]);
      const res = await supertest(app)
        .post('/assets/upload')
        .set('Authorization', `Bearer ${clientToken}`)
        .attach('file', exeBuffer, 'malware.exe');

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Tipo de archivo no permitido/);
    });

    it('POST /assets/upload should return 500 when DB insert fails', async () => {
      const dbQueryMock = vi.mocked(db.query);
      dbQueryMock.mockRejectedValueOnce(new Error('DB Insertion Error'));

      const pngBuffer = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64',
      );

      const res = await supertest(app)
        .post('/assets/upload')
        .set('Authorization', `Bearer ${clientToken}`)
        .attach('file', pngBuffer, 'hero.png');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Internal Server Error');
    });

    it('POST /assets/upload should successfully ingest valid PNG image', async () => {
      const dbQueryMock = vi.mocked(db.query);
      dbQueryMock
        .mockResolvedValueOnce([{ id: 1 }]) // workspace
        .mockResolvedValueOnce([{ id: 1 }]) // collection
        .mockResolvedValueOnce({ insertId: 45 } as any) // asset
        .mockResolvedValueOnce({ insertId: 90 } as any) // version
        .mockResolvedValueOnce({ insertId: 1 } as any) // thumb derivative
        .mockResolvedValueOnce({ insertId: 2 } as any); // preview derivative

      const pngBuffer = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64',
      );

      const res = await supertest(app)
        .post('/assets/upload')
        .set('Authorization', `Bearer ${clientToken}`)
        .attach('file', pngBuffer, 'hero.png');

      expect(res.status).toBe(201);
      expect(res.body.data.assetId).toBe(45);
      expect(res.body.data.mimeType).toBe('image/png');
    });

    it('getActorTenantId debe lanzar excepción si el contexto de usuario no es válido', async () => {
      const { getActorTenantId } = await import('../../../server/src/routes/assets');
      expect(() => getActorTenantId({ user: undefined } as any)).toThrow(
        /Invalid authenticated user context/,
      );
      expect(() => getActorTenantId({ user: { userId: NaN } } as any)).toThrow(
        /Invalid authenticated user context/,
      );
    });

    it('GET /assets should return paginated list of active assets for tenant', async () => {
      const dbQueryMock = vi.mocked(db.query);
      dbQueryMock
        .mockResolvedValueOnce([
          { id: 1, title: 'logo.png', mime_type: 'image/png', current_version_id: 10 },
        ])
        .mockResolvedValueOnce([{ total: 1 }]);

      const res = await supertest(app)
        .get('/assets?page=1&limit=10')
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.assets.length).toBe(1);
      expect(res.body.data.pagination.total).toBe(1);
    });

    it('GET /assets should return 500 when list query fails', async () => {
      const dbQueryMock = vi.mocked(db.query);
      dbQueryMock.mockRejectedValueOnce(new Error('List query error'));

      const res = await supertest(app).get('/assets').set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(500);
    });

    it('GET /assets/:id should return 400 on invalid NaN asset ID', async () => {
      const res = await supertest(app)
        .get('/assets/invalid-id')
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(400);
    });

    it('GET /assets/:id should return asset details with Anti-IDOR check', async () => {
      const dbQueryMock = vi.mocked(db.query);
      dbQueryMock
        .mockResolvedValueOnce([{ id: 1, tenant_id: 1, title: 'logo.png', mime_type: 'image/png' }])
        .mockResolvedValueOnce([{ id: 10, version_number: 1, byte_size: 1024 }]);

      const res = await supertest(app)
        .get('/assets/1')
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe('logo.png');
      expect(res.body.data.versions.length).toBe(1);
    });

    it('GET /assets/:id should return 404 when asset does not exist or cross-tenant', async () => {
      const dbQueryMock = vi.mocked(db.query);
      dbQueryMock.mockResolvedValueOnce([]);

      const res = await supertest(app)
        .get('/assets/999')
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(404);
    });

    it('GET /assets/:id should return 500 on query error', async () => {
      const dbQueryMock = vi.mocked(db.query);
      dbQueryMock.mockRejectedValueOnce(new Error('Get error'));

      const res = await supertest(app)
        .get('/assets/1')
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(500);
    });

    it('GET /assets/:id/stream should return 400 on invalid NaN asset ID', async () => {
      const res = await supertest(app)
        .get('/assets/abc/stream')
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(400);
    });

    it('GET /assets/:id/stream should return 404 when not found in DB', async () => {
      const dbQueryMock = vi.mocked(db.query);
      dbQueryMock.mockResolvedValueOnce([]);

      const res = await supertest(app)
        .get('/assets/1/stream')
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(404);
    });

    it('GET /assets/:id/stream should return 404 when physical file is missing', async () => {
      const dbQueryMock = vi.mocked(db.query);
      dbQueryMock.mockResolvedValueOnce([
        {
          mime_type: 'image/png',
          title: 'test.png',
          file_path: path.join(STORAGE_ROOT, 'missing.png'),
          byte_size: 10,
        },
      ]);

      const res = await supertest(app)
        .get('/assets/1/stream')
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(404);
    });

    it('GET /assets/:id/stream should stream file when physical file exists', async () => {
      const realFile = path.join(testDir, 'sample_stream.png');
      fs.writeFileSync(realFile, Buffer.from('dummy-stream-content'));

      const dbQueryMock = vi.mocked(db.query);
      dbQueryMock.mockResolvedValueOnce([
        { mime_type: 'image/png', title: 'sample_stream.png', file_path: realFile, byte_size: 20 },
      ]);

      const res = await supertest(app)
        .get('/assets/1/stream')
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('image/png');
    });

    it('GET /assets/:id/stream should return 500 on stream error', async () => {
      const dbQueryMock = vi.mocked(db.query);
      dbQueryMock.mockRejectedValueOnce(new Error('Stream DB Error'));

      const res = await supertest(app)
        .get('/assets/1/stream')
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(500);
    });

    it('GET /assets/:id/thumbnail should return 400 on invalid NaN asset ID', async () => {
      const res = await supertest(app)
        .get('/assets/abc/thumbnail')
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(400);
    });

    it('GET /assets/:id/thumbnail should serve webp thumbnail derivative when available', async () => {
      const thumbFile = path.join(testDir, 'thumb.webp');
      fs.writeFileSync(thumbFile, Buffer.from('dummy-thumb-webp'));

      const dbQueryMock = vi.mocked(db.query);
      dbQueryMock.mockResolvedValueOnce([{ file_path: thumbFile, byte_size: 16 }]);

      const res = await supertest(app)
        .get('/assets/1/thumbnail')
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('image/webp');
    });

    it('GET /assets/:id/thumbnail should fallback to original file if no derivative found', async () => {
      const origFile = path.join(testDir, 'orig.png');
      fs.writeFileSync(origFile, Buffer.from('dummy-orig-png'));

      const dbQueryMock = vi.mocked(db.query);
      dbQueryMock
        .mockResolvedValueOnce([]) // No derivative row
        .mockResolvedValueOnce([{ mime_type: 'image/png', file_path: origFile, byte_size: 14 }]);

      const res = await supertest(app)
        .get('/assets/1/thumbnail')
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('image/png');
    });

    it('GET /assets/:id/thumbnail should return 404 when no asset exists', async () => {
      const dbQueryMock = vi.mocked(db.query);
      dbQueryMock
        .mockResolvedValueOnce([]) // No derivative
        .mockResolvedValueOnce([]); // No asset

      const res = await supertest(app)
        .get('/assets/999/thumbnail')
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(404);
    });

    it('GET /assets/:id/thumbnail should return 500 on DB error', async () => {
      const dbQueryMock = vi.mocked(db.query);
      dbQueryMock.mockRejectedValueOnce(new Error('Thumb DB Error'));

      const res = await supertest(app)
        .get('/assets/1/thumbnail')
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(500);
    });

    it('DELETE /assets/:id should return 400 on invalid NaN asset ID', async () => {
      const res = await supertest(app)
        .delete('/assets/abc')
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(400);
    });

    it('DELETE /assets/:id should return 404 when asset not found or already deleted', async () => {
      const dbQueryMock = vi.mocked(db.query);
      dbQueryMock.mockResolvedValueOnce({ affectedRows: 0 } as any);

      const res = await supertest(app)
        .delete('/assets/999')
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(404);
    });

    it('DELETE /assets/:id should soft-delete asset', async () => {
      const dbQueryMock = vi.mocked(db.query);
      dbQueryMock.mockResolvedValueOnce({ affectedRows: 1 } as any);

      const res = await supertest(app)
        .delete('/assets/1')
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.assetId).toBe(1);
    });

    it('DELETE /assets/:id should return 500 on delete error', async () => {
      const dbQueryMock = vi.mocked(db.query);
      dbQueryMock.mockRejectedValueOnce(new Error('Delete Error'));

      const res = await supertest(app)
        .delete('/assets/1')
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(500);
    });

    it('debe cubrir branches de lista con count vacío, versiones vacías y thumbnail fallback en disco', async () => {
      const dbQueryMock = vi.mocked(db.query);

      // 1. GET /assets with empty total count
      dbQueryMock
        .mockResolvedValueOnce([]) // assets
        .mockResolvedValueOnce([]); // total count empty

      const resList = await supertest(app)
        .get('/assets')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(resList.status).toBe(200);
      expect(resList.body.data.pagination.total).toBe(0);

      // 2. GET /assets/:id with empty versions
      dbQueryMock
        .mockResolvedValueOnce([{ id: 10, title: 'Asset 10' }]) // asset
        .mockResolvedValueOnce([]); // versions empty

      const resGet = await supertest(app)
        .get('/assets/10')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(resGet.status).toBe(200);
      expect(resGet.body.data.versions).toEqual([]);

      // 3. GET /assets/:id/thumbnail when derivative file path does not exist on disk (fallback)
      const fakeDerivativePath = path.join(
        STORAGE_ROOT,
        'tenants',
        '1',
        'assets',
        '10',
        'not_found.webp',
      );
      dbQueryMock
        .mockResolvedValueOnce([{ file_path: fakeDerivativePath, byte_size: 100 }]) // derivative not on disk
        .mockResolvedValueOnce([]); // fallback rows empty -> 404

      const resThumb = await supertest(app)
        .get('/assets/10/thumbnail')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(resThumb.status).toBe(404);
    });
  });
});
