/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import supertest from 'supertest';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import path from 'path';
import fs from 'fs';

import * as db from '../../../server/src/db';
import assetsRouter from '../../../server/src/routes/assets';
import { sharesRouter, hashShareToken, resolveValidShare } from '../../../server/src/routes/shares';
import { STORAGE_ROOT } from '../../../server/src/utils/storage';

vi.mock('../../../server/src/db', () => ({
  query: vi.fn(),
  pool: {
    execute: vi.fn().mockResolvedValue([{ affectedRows: 1 }]),
  },
}));

const TEST_SECRET = 'dreamtek_dev_jwt_secret_key_2026';

describe('FC 004 — DAM Asset Sharing & Guest Links Suite (100% Coverage)', () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/assets', assetsRouter);
  app.use('/shares', sharesRouter);

  const clientToken = jwt.sign(
    { userId: 1, uid: 1, email: 'client@dreamtek.tech', role: 'CLIENT' },
    TEST_SECRET,
    { algorithm: 'HS512' },
  );

  const testAssetDir = path.join(STORAGE_ROOT, 'tenants', '1', 'assets', '1');
  const testFilePath = path.join(testAssetDir, 'sample.png');
  const testThumbPath = path.join(testAssetDir, 'thumb_200w.webp');

  beforeEach(() => {
    vi.clearAllMocks();
    fs.mkdirSync(testAssetDir, { recursive: true });
    fs.writeFileSync(testFilePath, Buffer.from('fake-png-content'));
    fs.writeFileSync(testThumbPath, Buffer.from('fake-thumb-content'));
  });

  afterEach(() => {
    try {
      if (fs.existsSync(testAssetDir)) {
        fs.rmSync(testAssetDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore Windows handle lock
    }
  });

  describe('1. Unit Helpers (hashShareToken & resolveValidShare)', () => {
    it('hashShareToken debe generar hash SHA-256 consistente', () => {
      const hash1 = hashShareToken('test-token-123');
      const hash2 = hashShareToken('test-token-123');
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });

    it('resolveValidShare debe retornar null si la consulta no devuelve registros', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);
      const result = await resolveValidShare('non-existent-token');
      expect(result).toBeNull();
    });

    it('resolveValidShare debe retornar null si el enlace está expirado', async () => {
      const expiredDate = new Date(Date.now() - 60000); // 1 minute ago
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          asset_id: 10,
          expires_at: expiredDate,
          revoked_at: null,
          asset_deleted_at: null,
          max_uses: null,
          current_uses: 0,
        },
      ]);
      const result = await resolveValidShare('expired-token');
      expect(result).toBeNull();
    });

    it('resolveValidShare debe retornar null si el enlace está revocado', async () => {
      const futureDate = new Date(Date.now() + 600000);
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          asset_id: 10,
          expires_at: futureDate,
          revoked_at: new Date(),
          asset_deleted_at: null,
          max_uses: null,
          current_uses: 0,
        },
      ]);
      const result = await resolveValidShare('revoked-token');
      expect(result).toBeNull();
    });

    it('resolveValidShare debe retornar null si el activo está eliminado', async () => {
      const futureDate = new Date(Date.now() + 600000);
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          asset_id: 10,
          expires_at: futureDate,
          revoked_at: null,
          asset_deleted_at: new Date(),
          max_uses: null,
          current_uses: 0,
        },
      ]);
      const result = await resolveValidShare('deleted-asset-token');
      expect(result).toBeNull();
    });

    it('resolveValidShare debe retornar null si se alcanzó el límite de usos', async () => {
      const futureDate = new Date(Date.now() + 600000);
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          asset_id: 10,
          expires_at: futureDate,
          revoked_at: null,
          asset_deleted_at: null,
          max_uses: 5,
          current_uses: 5,
        },
      ]);
      const result = await resolveValidShare('exhausted-token');
      expect(result).toBeNull();
    });

    it('resolveValidShare debe retornar el objeto share si todas las validaciones pasan', async () => {
      const futureDate = new Date(Date.now() + 600000);
      const mockShare = {
        id: 1,
        asset_id: 10,
        title: 'Valid Share',
        mime_type: 'image/png',
        expires_at: futureDate,
        revoked_at: null,
        asset_deleted_at: null,
        max_uses: 10,
        current_uses: 2,
      };
      vi.mocked(db.query).mockResolvedValueOnce([mockShare]);
      const result = await resolveValidShare('valid-token');
      expect(result).toEqual(mockShare);
    });
  });

  describe('2. POST /assets/:id/share (Link Creation)', () => {
    it('debe rechazar solicitudes no autenticadas con 401', async () => {
      const res = await supertest(app).post('/assets/1/share').send({});
      expect(res.status).toBe(401);
    });

    it('debe rechazar IDs no numéricos con 400', async () => {
      const res = await supertest(app)
        .post('/assets/invalid-id/share')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it('debe retornar 404 si el activo no existe o está eliminado', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);
      const res = await supertest(app)
        .post('/assets/999/share')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({});
      expect(res.status).toBe(404);
    });

    it('debe crear un enlace de compartición con valores por defecto', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: 1, title: 'Sample Image' }]) // asset check
        .mockResolvedValueOnce({ insertId: 50 } as any); // share insert

      const res = await supertest(app)
        .post('/assets/1/share')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({});

      expect(res.status).toBe(201);
      expect(res.body.data.shareId).toBe(50);
      expect(res.body.data.permission).toBe('VIEW');
      expect(res.body.data.token).toHaveLength(64);
      expect(res.body.data.shareUrl).toContain('/share/');
    });

    it('debe crear un enlace con permiso DOWNLOAD, días personalizados y límite de descargas', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: 1, title: 'Downloadable Asset' }])
        .mockResolvedValueOnce({ insertId: 51 } as any);

      const res = await supertest(app)
        .post('/assets/1/share')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({
          permission: 'DOWNLOAD',
          expires_in_days: 14,
          max_uses: 10,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.permission).toBe('DOWNLOAD');
      expect(res.body.data.maxUses).toBe(10);
    });

    it('debe retornar 500 si ocurre un error en base de datos al crear enlace', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('DB Insert Error'));
      const res = await supertest(app)
        .post('/assets/1/share')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({});
      expect(res.status).toBe(500);
    });
  });

  describe('3. GET /assets/:id/shares (List Asset Shares)', () => {
    it('debe rechazar IDs no numéricos con 400', async () => {
      const res = await supertest(app)
        .get('/assets/abc/shares')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(res.status).toBe(400);
    });

    it('debe listar los enlaces activos e históricos del activo', async () => {
      const mockShares = [
        { id: 1, permission: 'VIEW', current_uses: 0, expires_at: new Date() },
        { id: 2, permission: 'DOWNLOAD', current_uses: 3, expires_at: new Date() },
      ];
      vi.mocked(db.query).mockResolvedValueOnce(mockShares);

      const res = await supertest(app)
        .get('/assets/1/shares')
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.shares).toHaveLength(2);
    });

    it('debe retornar 500 en caso de fallo en la consulta de enlaces', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('List shares error'));
      const res = await supertest(app)
        .get('/assets/1/shares')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(res.status).toBe(500);
    });
  });

  describe('4. GET /shares/:token (Resolve Public Share Metadata)', () => {
    it('debe retornar 404 si el token es inválido, expirado o inexistente', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);
      const res = await supertest(app).get('/shares/invalid-token');
      expect(res.status).toBe(404);
    });

    it('debe resolver metadatos públicos del activo compartido', async () => {
      const futureDate = new Date(Date.now() + 86400000);
      vi.mocked(db.query)
        .mockResolvedValueOnce([
          {
            id: 10,
            asset_id: 1,
            title: 'Shared Mock Image',
            mime_type: 'image/png',
            permission: 'VIEW',
            expires_at: futureDate,
            revoked_at: null,
            asset_deleted_at: null,
            max_uses: null,
            current_uses: 0,
          },
        ]) // resolve share
        .mockResolvedValueOnce([{ byte_size: 2048 }]); // version byte_size

      const res = await supertest(app).get('/shares/valid-token-123');
      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe('Shared Mock Image');
      expect(res.body.data.byteSize).toBe(2048);
    });

    it('debe resolver metadatos con byteSize 0 si no hay versiones', async () => {
      const futureDate = new Date(Date.now() + 86400000);
      vi.mocked(db.query)
        .mockResolvedValueOnce([
          {
            id: 10,
            asset_id: 1,
            title: 'Shared Mock Image Without Version',
            mime_type: 'image/png',
            permission: 'VIEW',
            expires_at: futureDate,
            revoked_at: null,
            asset_deleted_at: null,
            max_uses: null,
            current_uses: 0,
          },
        ])
        .mockResolvedValueOnce([]); // empty versions

      const res = await supertest(app).get('/shares/valid-token-no-version');
      expect(res.status).toBe(200);
      expect(res.body.data.byteSize).toBe(0);
    });

    it('debe retornar 500 en caso de error interno al resolver metadatos', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('Crash DB'));
      const res = await supertest(app).get('/shares/error-token');
      expect(res.status).toBe(500);
    });
  });

  describe('5. GET /shares/:token/stream (Public Binary Streaming)', () => {
    it('debe retornar 404 si el token no es válido', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);
      const res = await supertest(app).get('/shares/bad-token/stream');
      expect(res.status).toBe(404);
    });

    it('debe retornar 404 si no existen versiones para el activo', async () => {
      const futureDate = new Date(Date.now() + 86400000);
      vi.mocked(db.query)
        .mockResolvedValueOnce([
          {
            id: 10,
            asset_id: 1,
            title: 'Shared File',
            mime_type: 'image/png',
            permission: 'VIEW',
            expires_at: futureDate,
            revoked_at: null,
            asset_deleted_at: null,
          },
        ])
        .mockResolvedValueOnce([]); // no versions

      const res = await supertest(app).get('/shares/valid-token/stream');
      expect(res.status).toBe(404);
    });

    it('debe retornar 404 si el archivo físico no existe en disco', async () => {
      const futureDate = new Date(Date.now() + 86400000);
      const fakePath = path.join(STORAGE_ROOT, 'tenants', '1', 'assets', '1', 'missing.png');
      vi.mocked(db.query)
        .mockResolvedValueOnce([
          {
            id: 10,
            asset_id: 1,
            title: 'Shared File',
            mime_type: 'image/png',
            permission: 'VIEW',
            expires_at: futureDate,
            revoked_at: null,
            asset_deleted_at: null,
          },
        ])
        .mockResolvedValueOnce([{ file_path: fakePath, byte_size: 100 }]);

      const res = await supertest(app).get('/shares/valid-token/stream');
      expect(res.status).toBe(404);
    });

    it('debe transmitir el archivo con Content-Disposition inline para permiso VIEW', async () => {
      const futureDate = new Date(Date.now() + 86400000);
      vi.mocked(db.query)
        .mockResolvedValueOnce([
          {
            id: 10,
            asset_id: 1,
            title: 'Sample Image',
            mime_type: 'image/png',
            permission: 'VIEW',
            expires_at: futureDate,
            revoked_at: null,
            asset_deleted_at: null,
          },
        ])
        .mockResolvedValueOnce([{ file_path: testFilePath, byte_size: 16 }])
        .mockResolvedValueOnce({} as any) // update current_uses
        .mockResolvedValueOnce({} as any); // insert access log

      const res = await supertest(app).get('/shares/valid-token/stream');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('image/png');
      expect(res.headers['content-disposition']).toContain('inline');
    });

    it('debe transmitir el archivo con Content-Disposition attachment para permiso DOWNLOAD', async () => {
      const futureDate = new Date(Date.now() + 86400000);
      vi.mocked(db.query)
        .mockResolvedValueOnce([
          {
            id: 10,
            asset_id: 1,
            title: 'Sample Download',
            mime_type: 'image/png',
            permission: 'DOWNLOAD',
            expires_at: futureDate,
            revoked_at: null,
            asset_deleted_at: null,
          },
        ])
        .mockResolvedValueOnce([{ file_path: testFilePath, byte_size: 16 }])
        .mockResolvedValueOnce({} as any)
        .mockResolvedValueOnce({} as any);

      const res = await supertest(app).get('/shares/valid-token/stream');
      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toContain('attachment');
    });

    it('debe retornar 500 en caso de error interno al transmitir archivo', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('Stream crash'));
      const res = await supertest(app).get('/shares/error-token/stream');
      expect(res.status).toBe(500);
    });
  });

  describe('6. GET /shares/:token/thumbnail (Public WebP Thumbnail)', () => {
    it('debe retornar 404 si el token no es válido', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);
      const res = await supertest(app).get('/shares/bad-token/thumbnail');
      expect(res.status).toBe(404);
    });

    it('debe entregar la miniatura WebP si existe derivado generado', async () => {
      const futureDate = new Date(Date.now() + 86400000);
      vi.mocked(db.query)
        .mockResolvedValueOnce([
          {
            id: 10,
            asset_id: 1,
            title: 'Image with Derivative',
            mime_type: 'image/png',
            permission: 'VIEW',
            expires_at: futureDate,
            revoked_at: null,
            asset_deleted_at: null,
          },
        ])
        .mockResolvedValueOnce([{ file_path: testThumbPath, byte_size: 18 }]);

      const res = await supertest(app).get('/shares/valid-token/thumbnail');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('image/webp');
    });

    it('debe entregar el archivo original como fallback si es imagen sin derivado', async () => {
      const futureDate = new Date(Date.now() + 86400000);
      vi.mocked(db.query)
        .mockResolvedValueOnce([
          {
            id: 10,
            asset_id: 1,
            title: 'Original Image Fallback',
            mime_type: 'image/png',
            permission: 'VIEW',
            expires_at: futureDate,
            revoked_at: null,
            asset_deleted_at: null,
          },
        ])
        .mockResolvedValueOnce([]) // no derivative
        .mockResolvedValueOnce([{ file_path: testFilePath, byte_size: 16 }]); // fallback to version

      const res = await supertest(app).get('/shares/valid-token/thumbnail');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('image/png');
    });

    it('debe transmitir con application/octet-stream si mime_type es null', async () => {
      const futureDate = new Date(Date.now() + 86400000);
      vi.mocked(db.query)
        .mockResolvedValueOnce([
          {
            id: 10,
            asset_id: 1,
            title: 'No Mime File',
            mime_type: null,
            permission: 'VIEW',
            expires_at: futureDate,
            revoked_at: null,
            asset_deleted_at: null,
          },
        ])
        .mockResolvedValueOnce([{ file_path: testFilePath, byte_size: 16 }])
        .mockResolvedValueOnce({} as any)
        .mockResolvedValueOnce({} as any);

      const res = await supertest(app).get('/shares/valid-token/stream');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/octet-stream');
    });

    it('debe manejar derivado inexistente en disco y buscar fallback', async () => {
      const futureDate = new Date(Date.now() + 86400000);
      const fakeDerivativePath = path.join(
        STORAGE_ROOT,
        'tenants',
        '1',
        'assets',
        '1',
        'missing_derivative.webp',
      );
      vi.mocked(db.query)
        .mockResolvedValueOnce([
          {
            id: 10,
            asset_id: 1,
            title: 'Image Missing Deriv',
            mime_type: 'image/png',
            permission: 'VIEW',
            expires_at: futureDate,
            revoked_at: null,
            asset_deleted_at: null,
          },
        ])
        .mockResolvedValueOnce([{ file_path: fakeDerivativePath, byte_size: 100 }]) // derivative missing on disk
        .mockResolvedValueOnce([{ file_path: testFilePath, byte_size: 16 }]); // fallback exists

      const res = await supertest(app).get('/shares/valid-token/thumbnail');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('image/png');
    });

    it('debe retornar 404 si el archivo de fallback tampoco existe en disco', async () => {
      const futureDate = new Date(Date.now() + 86400000);
      const fakeFallbackPath = path.join(
        STORAGE_ROOT,
        'tenants',
        '1',
        'assets',
        '1',
        'missing_fallback.png',
      );
      vi.mocked(db.query)
        .mockResolvedValueOnce([
          {
            id: 10,
            asset_id: 1,
            title: 'Image Missing All Files',
            mime_type: 'image/png',
            permission: 'VIEW',
            expires_at: futureDate,
            revoked_at: null,
            asset_deleted_at: null,
          },
        ])
        .mockResolvedValueOnce([]) // no derivative
        .mockResolvedValueOnce([{ file_path: fakeFallbackPath, byte_size: 100 }]); // fallback missing on disk

      const res = await supertest(app).get('/shares/valid-token/thumbnail');
      expect(res.status).toBe(404);
    });

    it('debe retornar 404 si no es imagen o no hay archivo disponible', async () => {
      const futureDate = new Date(Date.now() + 86400000);
      vi.mocked(db.query)
        .mockResolvedValueOnce([
          {
            id: 10,
            asset_id: 1,
            title: 'PDF Doc',
            mime_type: 'application/pdf',
            permission: 'VIEW',
            expires_at: futureDate,
            revoked_at: null,
            asset_deleted_at: null,
          },
        ])
        .mockResolvedValueOnce([]) // no derivative
        .mockResolvedValueOnce([]); // no fallback version

      const res = await supertest(app).get('/shares/valid-token/thumbnail');
      expect(res.status).toBe(404);
    });

    it('debe retornar 500 en caso de excepción en miniatura', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('Thumb crash'));
      const res = await supertest(app).get('/shares/error-token/thumbnail');
      expect(res.status).toBe(500);
    });
  });

  describe('7. POST /shares/:id/revoke (Revocation & Anti-IDOR)', () => {
    it('debe rechazar solicitudes no autenticadas con 401', async () => {
      const res = await supertest(app).post('/shares/1/revoke').send({});
      expect(res.status).toBe(401);
    });

    it('debe rechazar IDs no numéricos con 400', async () => {
      const res = await supertest(app)
        .post('/shares/invalid/revoke')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it('debe retornar 404 si el enlace no existe, pertenece a otro tenant o ya fue revocado', async () => {
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 0 } as any);
      const res = await supertest(app)
        .post('/shares/999/revoke')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({});
      expect(res.status).toBe(404);
    });

    it('debe revocar exitosamente el enlace de compartición', async () => {
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 } as any);
      const res = await supertest(app)
        .post('/shares/1/revoke')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({});
      expect(res.status).toBe(200);
      expect(res.body.data.revoked).toBe(true);
    });

    it('debe retornar 500 en caso de error interno al revocar', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('Revoke error'));
      const res = await supertest(app)
        .post('/shares/1/revoke')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({});
      expect(res.status).toBe(500);
    });
  });

  describe('8. Share Schemas & Rate Limiter Custom Handler', () => {
    it('createShareSchema debe validar y aplicar defaults', async () => {
      const { createShareSchema, shareTokenParamSchema } =
        await import('../../../server/src/schemas/share.schema');
      const valid = createShareSchema.parse({});
      expect(valid.permission).toBe('VIEW');
      expect(valid.expires_in_days).toBe(7);

      expect(() => createShareSchema.parse({ expires_in_days: 0 })).toThrow();
      expect(() => createShareSchema.parse({ expires_in_days: 35 })).toThrow();

      const validToken = shareTokenParamSchema.parse({ token: '12345678901234567890' });
      expect(validToken.token).toBe('12345678901234567890');
      expect(() => shareTokenParamSchema.parse({ token: 'short' })).toThrow();
    });

    it('shareRateLimiter handler debe responder con 429 Too Many Requests al exceder el límite', async () => {
      const { shareRateLimiter } = await import('../../../server/src/middleware/rateLimiter');
      const appShare = express();
      appShare.use(shareRateLimiter);
      appShare.get('/test-share', (_req, res) => res.json({ ok: true }));

      for (let i = 0; i < 60; i++) {
        await supertest(appShare).get('/test-share');
      }
      const resBlocked = await supertest(appShare).get('/test-share');
      expect(resBlocked.status).toBe(429);
      expect(resBlocked.body.message).toMatch(/Demasiadas solicitudes al enlace de compartición/);
    });
  });
});
