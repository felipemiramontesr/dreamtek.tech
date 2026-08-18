/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import supertest from 'supertest';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';

import * as db from '../../../server/src/db';
import assetsRouter from '../../../server/src/routes/assets';
import {
  tagsRouter,
  getActorTenantId as getTagsActorTenantId,
} from '../../../server/src/routes/tags';

vi.mock('../../../server/src/db', () => ({
  query: vi.fn(),
  pool: {
    execute: vi.fn().mockResolvedValue([{ affectedRows: 1 }]),
  },
}));

const TEST_SECRET = 'dreamtek_dev_jwt_secret_key_2026';

describe('FC 005 — DAM Asset Search, Tags & Metadata Suite (100% Coverage)', () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/assets', assetsRouter);
  app.use('/tags', tagsRouter);

  const clientToken = jwt.sign(
    { userId: 1, uid: 1, email: 'client@dreamtek.tech', role: 'CLIENT' },
    TEST_SECRET,
    { algorithm: 'HS512' },
  );

  const otherClientToken = jwt.sign(
    { userId: 2, uid: 2, email: 'other@dreamtek.tech', role: 'CLIENT' },
    TEST_SECRET,
    { algorithm: 'HS512' },
  );

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('1. GET /assets — Advanced Search & Filtering', () => {
    it('debe listar activos con paginación por defecto sin filtros', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([
          {
            id: 10,
            tenant_id: 1,
            workspace_id: 1,
            collection_id: null,
            title: 'Logo Principal.png',
            mime_type: 'image/png',
            status: 'ACTIVE',
            created_at: '2026-08-18T10:00:00Z',
            current_version_id: 1,
            version_number: 1,
            byte_size: 154200,
            sha256_hash: 'abcdef123456',
            tags: 'Branding,Marketing',
          },
        ]) // Assets query
        .mockResolvedValueOnce([{ total: 1 }]); // Count query

      const res = await supertest(app)
        .get('/assets')
        .set('Cookie', [`dreamtek_session=${clientToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(200);
      expect(res.body.data.assets).toHaveLength(1);
      expect(res.body.data.assets[0].title).toBe('Logo Principal.png');
      expect(res.body.data.assets[0].tags).toEqual(['Branding', 'Marketing']);
      expect(res.body.data.pagination.total).toBe(1);
    });

    it('debe filtrar por término de texto q escapando caracteres especiales', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ total: 0 }]);

      const res = await supertest(app)
        .get('/assets?q=100%_special\\search')
        .set('Cookie', [`dreamtek_session=${clientToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.data.assets).toEqual([]);
      const callSql = vi.mocked(db.query).mock.calls[0][0] as string;
      expect(callSql).toContain('a.title LIKE ? OR v.file_path LIKE ?');
    });

    it('debe filtrar por workspace_id y collection_id', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([
          {
            id: 11,
            tenant_id: 1,
            workspace_id: 2,
            collection_id: 5,
            title: 'Doc.pdf',
            mime_type: 'application/pdf',
            status: 'ACTIVE',
            created_at: '2026-08-18T10:00:00Z',
            current_version_id: null,
            version_number: null,
            byte_size: null,
            sha256_hash: null,
            tags: null,
          },
        ])
        .mockResolvedValueOnce([{ total: 1 }]);

      const res = await supertest(app)
        .get('/assets?workspace_id=2&collection_id=5')
        .set('Cookie', [`dreamtek_session=${clientToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.data.assets[0].currentVersion).toBeNull();
      expect(res.body.data.assets[0].tags).toEqual([]);
    });

    it('debe filtrar por categoría MIME image, video, document, audio y exacto', async () => {
      const categories = ['image', 'video', 'document', 'audio', 'image/svg+xml'];

      for (const cat of categories) {
        vi.mocked(db.query)
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{ total: 0 }]);

        const res = await supertest(app)
          .get(`/assets?mime_type=${encodeURIComponent(cat)}`)
          .set('Cookie', [`dreamtek_session=${clientToken}`]);

        expect(res.status).toBe(200);
      }
    });

    it('debe filtrar por tag', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ total: 1 }]);

      const res = await supertest(app)
        .get('/assets?tag=Campana2026')
        .set('Cookie', [`dreamtek_session=${clientToken}`]);

      expect(res.status).toBe(200);
      const sql = vi.mocked(db.query).mock.calls[0][0] as string;
      expect(sql).toContain('EXISTS (SELECT 1 FROM asset_tags');
    });

    it('debe filtrar por rango de tamaño min_size y max_size', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ total: 0 }]);

      const res = await supertest(app)
        .get('/assets?min_size=1000&max_size=500000')
        .set('Cookie', [`dreamtek_session=${clientToken}`]);

      expect(res.status).toBe(200);
      const sql = vi.mocked(db.query).mock.calls[0][0] as string;
      expect(sql).toContain('v.byte_size >= ?');
      expect(sql).toContain('v.byte_size <= ?');
    });

    it('debe filtrar por fechas from_date y to_date válidas e ignorar inválidas', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ total: 0 }]);

      const res = await supertest(app)
        .get('/assets?from_date=2026-01-01&to_date=2026-12-31')
        .set('Cookie', [`dreamtek_session=${clientToken}`]);

      expect(res.status).toBe(200);

      // Branch con fecha inválida
      vi.mocked(db.query)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ total: 0 }]);

      const resInvalid = await supertest(app)
        .get('/assets?from_date=fecha_invalida&to_date=otra_invalida')
        .set('Cookie', [`dreamtek_session=${clientToken}`]);

      expect(resInvalid.status).toBe(200);
    });

    it('debe soportar ordenamiento por title y byte_size ascendente/descendente', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ total: 0 }]);

      const resTitle = await supertest(app)
        .get('/assets?sort_by=title&sort_order=asc')
        .set('Cookie', [`dreamtek_session=${clientToken}`]);

      expect(resTitle.status).toBe(200);

      vi.mocked(db.query)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ total: 0 }]);

      const resSize = await supertest(app)
        .get('/assets?sort_by=byte_size&sort_order=desc')
        .set('Cookie', [`dreamtek_session=${clientToken}`]);

      expect(resSize.status).toBe(200);
    });

    it('debe retornar 400 Bad Request si los parámetros de query fallan schema Zod', async () => {
      const res = await supertest(app)
        .get('/assets?limit=500') // Max allowed is 100
        .set('Cookie', [`dreamtek_session=${clientToken}`]);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Bad Request');
    });

    it('debe responder 500 si la base de datos lanza una excepción', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('DB Connection Failure'));

      const res = await supertest(app)
        .get('/assets')
        .set('Cookie', [`dreamtek_session=${clientToken}`]);

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Internal Server Error');
    });
  });

  describe('2. GET & POST /tags — Tag Management API', () => {
    it('GET /tags debe listar todas las etiquetas del tenant con su asset_count', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          name: 'Branding',
          color: '#00bfff',
          created_at: '2026-08-18T10:00:00Z',
          asset_count: 5,
        },
        {
          id: 2,
          name: 'Web',
          color: '#ff0055',
          created_at: '2026-08-18T10:05:00Z',
          asset_count: 0,
        },
      ]);

      const res = await supertest(app)
        .get('/tags')
        .set('Cookie', [`dreamtek_session=${clientToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].name).toBe('Branding');
      expect(res.body.data[0].assetCount).toBe(5);
    });

    it('GET /tags debe responder 500 en error de base de datos', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('DB Error'));

      const res = await supertest(app)
        .get('/tags')
        .set('Cookie', [`dreamtek_session=${clientToken}`]);

      expect(res.status).toBe(500);
    });

    it('POST /tags debe crear una nueva etiqueta exitosamente (201)', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([]) // Check existing: none
        .mockResolvedValueOnce({ insertId: 7 } as any); // Insert tag

      const res = await supertest(app)
        .post('/tags')
        .set('Cookie', [`dreamtek_session=${clientToken}`])
        .send({ name: 'Fotografia', color: '#10b981' });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBe(7);
      expect(res.body.data.name).toBe('Fotografia');
      expect(res.body.data.color).toBe('#10b981');
    });

    it('POST /tags debe rechazar etiquetas duplicadas en el mismo tenant (409 Conflict)', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([{ id: 7, name: 'Fotografia' }]); // Already exists

      const res = await supertest(app)
        .post('/tags')
        .set('Cookie', [`dreamtek_session=${clientToken}`])
        .send({ name: 'Fotografia' });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('Conflict');
    });

    it('POST /tags debe rechazar payload con color inválido (400 Bad Request)', async () => {
      const res = await supertest(app)
        .post('/tags')
        .set('Cookie', [`dreamtek_session=${clientToken}`])
        .send({ name: 'Invalido', color: 'no-es-hex' });

      expect(res.status).toBe(400);
    });

    it('POST /tags debe responder 500 en error inesperado de base de datos', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('DB crash'));

      const res = await supertest(app)
        .post('/tags')
        .set('Cookie', [`dreamtek_session=${clientToken}`])
        .send({ name: 'ErrorTag' });

      expect(res.status).toBe(500);
    });
  });

  describe('3. POST & DELETE /assets/:id/tags — Tag Association & Anti-IDOR', () => {
    it('POST /assets/:id/tags debe asociar etiquetas a un activo propio', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: 10 }]) // Asset exists & belongs to tenant 1
        .mockResolvedValueOnce([{ id: 1 }]) // Tag 1 exists in tenant 1
        .mockResolvedValueOnce({ affectedRows: 1 } as any) // Insert asset_tags
        .mockResolvedValueOnce([{ id: 2 }]) // Tag 2 exists in tenant 1
        .mockResolvedValueOnce({ affectedRows: 1 } as any); // Insert asset_tags

      const res = await supertest(app)
        .post('/assets/10/tags')
        .set('Cookie', [`dreamtek_session=${clientToken}`])
        .send({ tag_ids: [1, 2] });

      expect(res.status).toBe(200);
      expect(res.body.data.assetId).toBe(10);
      expect(res.body.data.tagIds).toEqual([1, 2]);
    });

    it('POST /assets/:id/tags debe responder 400 con ID de activo inválido', async () => {
      const res = await supertest(app)
        .post('/assets/abc/tags')
        .set('Cookie', [`dreamtek_session=${clientToken}`])
        .send({ tag_ids: [1] });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('inválido');
    });

    it('POST /assets/:id/tags debe responder 404 si el activo pertenece a otro tenant (Anti-IDOR)', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]); // Asset not found for tenant 1

      const res = await supertest(app)
        .post('/assets/999/tags')
        .set('Cookie', [`dreamtek_session=${clientToken}`])
        .send({ tag_ids: [1] });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Not Found');
    });

    it('POST /assets/:id/tags debe responder 400 si el tag no pertenece al tenant', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: 10 }]) // Asset exists
        .mockResolvedValueOnce([]); // Tag does not exist in tenant 1

      const res = await supertest(app)
        .post('/assets/10/tags')
        .set('Cookie', [`dreamtek_session=${clientToken}`])
        .send({ tag_ids: [999] });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('no existe o no pertenece');
    });

    it('POST /assets/:id/tags debe responder 500 en fallo de base de datos', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('DB Error'));

      const res = await supertest(app)
        .post('/assets/10/tags')
        .set('Cookie', [`dreamtek_session=${clientToken}`])
        .send({ tag_ids: [1] });

      expect(res.status).toBe(500);
    });

    it('DELETE /assets/:id/tags/:tagId debe desvincular una etiqueta exitosamente', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: 10 }]) // Asset exists & belongs to tenant
        .mockResolvedValueOnce({ affectedRows: 1 } as any); // Delete from asset_tags

      const res = await supertest(app)
        .delete('/assets/10/tags/1')
        .set('Cookie', [`dreamtek_session=${clientToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.data.assetId).toBe(10);
      expect(res.body.data.tagId).toBe(1);
    });

    it('DELETE /assets/:id/tags/:tagId debe responder 400 con parámetros no numéricos', async () => {
      const res = await supertest(app)
        .delete('/assets/abc/tags/xyz')
        .set('Cookie', [`dreamtek_session=${clientToken}`]);

      expect(res.status).toBe(400);
    });

    it('DELETE /assets/:id/tags/:tagId debe responder 404 si el activo es de otro tenant (Anti-IDOR)', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]); // Asset not found for tenant

      const res = await supertest(app)
        .delete('/assets/10/tags/1')
        .set('Cookie', [`dreamtek_session=${clientToken}`]);

      expect(res.status).toBe(404);
    });

    it('DELETE /assets/:id/tags/:tagId debe responder 500 en fallo de base de datos', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('DB Error'));

      const res = await supertest(app)
        .delete('/assets/10/tags/1')
        .set('Cookie', [`dreamtek_session=${clientToken}`]);

      expect(res.status).toBe(500);
    });
  });

  describe('4. GET, PUT & DELETE /assets/:id/metadata — Custom Structured Metadata', () => {
    it('GET /assets/:id/metadata debe retornar metadatos de un activo propio', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: 10 }]) // Asset check
        .mockResolvedValueOnce([
          {
            id: 1,
            meta_key: 'author',
            meta_value: 'Felipe M.',
            data_type: 'STRING',
            created_at: '2026-08-18T10:00:00Z',
            updated_at: '2026-08-18T10:00:00Z',
          },
          {
            id: 2,
            meta_key: 'dimensions',
            meta_value: '{"width": 1920, "height": 1080}',
            data_type: 'JSON',
            created_at: '2026-08-18T10:00:00Z',
            updated_at: '2026-08-18T10:00:00Z',
          },
        ]);

      const res = await supertest(app)
        .get('/assets/10/metadata')
        .set('Cookie', [`dreamtek_session=${clientToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].metaKey).toBe('author');
      expect(res.body.data[1].dataType).toBe('JSON');
    });

    it('GET /assets/:id/metadata debe responder 400 con ID inválido', async () => {
      const res = await supertest(app)
        .get('/assets/abc/metadata')
        .set('Cookie', [`dreamtek_session=${clientToken}`]);

      expect(res.status).toBe(400);
    });

    it('GET /assets/:id/metadata debe responder 404 si el activo no pertenece al tenant (Anti-IDOR)', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]); // Not found

      const res = await supertest(app)
        .get('/assets/999/metadata')
        .set('Cookie', [`dreamtek_session=${clientToken}`]);

      expect(res.status).toBe(404);
    });

    it('GET /assets/:id/metadata debe responder 500 en error de base de datos', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('DB Error'));

      const res = await supertest(app)
        .get('/assets/10/metadata')
        .set('Cookie', [`dreamtek_session=${clientToken}`]);

      expect(res.status).toBe(500);
    });

    it('PUT /assets/:id/metadata debe upsert metadato tipo STRING exitosamente', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: 10 }]) // Asset check
        .mockResolvedValueOnce({ affectedRows: 1 } as any); // Upsert

      const res = await supertest(app)
        .put('/assets/10/metadata')
        .set('Cookie', [`dreamtek_session=${clientToken}`])
        .send({
          meta_key: 'campaign',
          meta_value: 'Summer 2026',
          data_type: 'STRING',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.metaKey).toBe('campaign');
    });

    it('PUT /assets/:id/metadata debe aceptar JSON válido cuando data_type=JSON', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: 10 }])
        .mockResolvedValueOnce({ affectedRows: 1 } as any);

      const res = await supertest(app)
        .put('/assets/10/metadata')
        .set('Cookie', [`dreamtek_session=${clientToken}`])
        .send({
          meta_key: 'exif',
          meta_value: '{"camera": "Sony A7IV", "iso": 100}',
          data_type: 'JSON',
        });

      expect(res.status).toBe(200);
    });

    it('PUT /assets/:id/metadata debe rechazar JSON inválido cuando data_type=JSON (400)', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([{ id: 10 }]);

      const res = await supertest(app)
        .put('/assets/10/metadata')
        .set('Cookie', [`dreamtek_session=${clientToken}`])
        .send({
          meta_key: 'exif',
          meta_value: 'no-es-un-json-valido',
          data_type: 'JSON',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('no es un JSON válido');
    });

    it('PUT /assets/:id/metadata debe responder 400 con ID inválido', async () => {
      const res = await supertest(app)
        .put('/assets/invalido/metadata')
        .set('Cookie', [`dreamtek_session=${clientToken}`])
        .send({
          meta_key: 'key',
          meta_value: 'val',
        });

      expect(res.status).toBe(400);
    });

    it('PUT /assets/:id/metadata debe responder 404 en activo ajeno (Anti-IDOR)', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]); // Cross-tenant

      const res = await supertest(app)
        .put('/assets/10/metadata')
        .set('Cookie', [`dreamtek_session=${otherClientToken}`])
        .send({
          meta_key: 'key',
          meta_value: 'val',
        });

      expect(res.status).toBe(404);
    });

    it('PUT /assets/:id/metadata debe responder 500 en error de base de datos', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('DB Failure'));

      const res = await supertest(app)
        .put('/assets/10/metadata')
        .set('Cookie', [`dreamtek_session=${clientToken}`])
        .send({
          meta_key: 'key',
          meta_value: 'val',
        });

      expect(res.status).toBe(500);
    });

    it('DELETE /assets/:id/metadata/:key debe eliminar metadato exitosamente', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: 10 }]) // Asset check
        .mockResolvedValueOnce({ affectedRows: 1 } as any); // Delete

      const res = await supertest(app)
        .delete('/assets/10/metadata/campaign')
        .set('Cookie', [`dreamtek_session=${clientToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.data.metaKey).toBe('campaign');
    });

    it('DELETE /assets/:id/metadata/:key debe responder 400 con parámetros inválidos', async () => {
      const res = await supertest(app)
        .delete('/assets/abc/metadata/key')
        .set('Cookie', [`dreamtek_session=${clientToken}`]);

      expect(res.status).toBe(400);
    });

    it('DELETE /assets/:id/metadata/:key debe responder 404 si el activo es ajeno (Anti-IDOR)', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .delete('/assets/10/metadata/campaign')
        .set('Cookie', [`dreamtek_session=${clientToken}`]);

      expect(res.status).toBe(404);
    });

    it('DELETE /assets/:id/metadata/:key debe responder 500 en error de base de datos', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('DB Failure'));

      const res = await supertest(app)
        .delete('/assets/10/metadata/campaign')
        .set('Cookie', [`dreamtek_session=${clientToken}`]);

      expect(res.status).toBe(500);
    });
  });

  describe('5. Helper Units & Rate Limiters (100% Coverage)', () => {
    it('getTagsActorTenantId debe lanzar error si req.user es inválido', () => {
      expect(() => getTagsActorTenantId({} as any)).toThrow('Invalid authenticated user context.');
      expect(() => getTagsActorTenantId({ user: { userId: NaN } } as any)).toThrow(
        'Invalid authenticated user context.',
      );
    });

    it('searchRateLimiter debe responder con 429 Too Many Requests al exceder límite', async () => {
      const { searchRateLimiter } = await import('../../../server/src/middleware/rateLimiter');
      const testApp = express();
      testApp.use(searchRateLimiter);
      testApp.get('/test-search-limit', (_req, res) => res.json({ ok: true }));

      for (let i = 0; i < 100; i++) {
        await supertest(testApp).get('/test-search-limit');
      }
      const resBlocked = await supertest(testApp).get('/test-search-limit');
      expect(resBlocked.status).toBe(429);
      expect(resBlocked.body.message).toContain('Límite de consultas de búsqueda alcanzado');
    });

    it('tagsRateLimiter debe responder con 429 Too Many Requests al exceder límite', async () => {
      const { tagsRateLimiter } = await import('../../../server/src/middleware/rateLimiter');
      const testApp = express();
      testApp.use(tagsRateLimiter);
      testApp.post('/test-tags-limit', (_req, res) => res.json({ ok: true }));

      for (let i = 0; i < 100; i++) {
        await supertest(testApp).post('/test-tags-limit');
      }
      const resBlocked = await supertest(testApp).post('/test-tags-limit');
      expect(resBlocked.status).toBe(429);
      expect(resBlocked.body.message).toContain(
        'Límite de operaciones de etiquetas y metadatos alcanzado',
      );
    });
  });
});
