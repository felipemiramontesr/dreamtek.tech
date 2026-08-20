/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import supertest from 'supertest';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';

import * as db from '../../../server/src/db';
import { workspacesRouter, getWorkspaceActor } from '../../../server/src/routes/workspaces';
import { collectionsRouter, getCollectionActor } from '../../../server/src/routes/collections';
import assetsRouter from '../../../server/src/routes/assets';
import {
  workspacesRateLimiter,
  collectionsRateLimiter,
} from '../../../server/src/middleware/rateLimiter';
import {
  createWorkspaceSchema,
  updateWorkspaceSchema,
  workspaceIdParamSchema,
  moveAssetLocationSchema,
} from '../../../server/src/schemas/workspace.schema';
import {
  createCollectionSchema,
  updateCollectionSchema,
  collectionIdParamSchema,
  queryCollectionsSchema,
} from '../../../server/src/schemas/collection.schema';

vi.mock('../../../server/src/db', () => ({
  query: vi.fn(),
  pool: {
    execute: vi.fn(),
  },
}));

const TEST_SECRET = 'dreamtek_dev_jwt_secret_key_2026';

describe('FC 007 — DAM Workspaces, Collections & Asset Organization Suite (100% Coverage)', () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/workspaces', workspacesRouter);
  app.use('/collections', collectionsRouter);
  app.use('/assets', assetsRouter);

  const adminToken = jwt.sign(
    { userId: 99, uid: 99, email: 'admin@dreamtek.tech', role: 'ADMIN' },
    TEST_SECRET,
    { algorithm: 'HS512' },
  );

  // Tenant 1 Owner
  const ownerToken = jwt.sign(
    { userId: 1, uid: 1, email: 'owner@dreamtek.tech', role: 'CLIENT' },
    TEST_SECRET,
    { algorithm: 'HS512' },
  );

  // Tenant 1 Collaborator
  const collaboratorToken = jwt.sign(
    { userId: 2, uid: 2, email: 'collab@dreamtek.tech', role: 'CLIENT', tenantId: 1 },
    TEST_SECRET,
    { algorithm: 'HS512' },
  );

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.pool.execute).mockResolvedValue([{ affectedRows: 1 }] as any);
  });

  describe('Zod Schemas Direct Validation', () => {
    it('validates createWorkspaceSchema and updateWorkspaceSchema', () => {
      expect(createWorkspaceSchema.safeParse({ name: 'Marketing' }).success).toBe(true);
      expect(createWorkspaceSchema.safeParse({ name: '' }).success).toBe(false);
      expect(createWorkspaceSchema.safeParse({ name: 'a'.repeat(101) }).success).toBe(false);
      expect(createWorkspaceSchema.safeParse({}).success).toBe(false);

      expect(updateWorkspaceSchema.safeParse({ name: 'Engineering' }).success).toBe(true);
      expect(updateWorkspaceSchema.safeParse({ name: '' }).success).toBe(false);
      expect(updateWorkspaceSchema.safeParse({ name: 'a'.repeat(101) }).success).toBe(false);
    });

    it('validates workspaceIdParamSchema', () => {
      expect(workspaceIdParamSchema.safeParse({ id: '1' }).success).toBe(true);
      expect(workspaceIdParamSchema.safeParse({ id: 0 }).success).toBe(false);
      expect(workspaceIdParamSchema.safeParse({ id: -5 }).success).toBe(false);
      expect(workspaceIdParamSchema.safeParse({ id: 'abc' }).success).toBe(false);
    });

    it('validates moveAssetLocationSchema', () => {
      expect(moveAssetLocationSchema.safeParse({ workspace_id: 1, collection_id: 2 }).success).toBe(
        true,
      );
      expect(
        moveAssetLocationSchema.safeParse({ workspace_id: 1, collection_id: null }).success,
      ).toBe(true);
      expect(moveAssetLocationSchema.safeParse({ workspace_id: 1 }).success).toBe(true);
      expect(moveAssetLocationSchema.safeParse({ workspace_id: 0 }).success).toBe(false);
      expect(
        moveAssetLocationSchema.safeParse({ workspace_id: 1, collection_id: -1 }).success,
      ).toBe(false);
    });

    it('validates createCollectionSchema and updateCollectionSchema', () => {
      expect(createCollectionSchema.safeParse({ workspace_id: 1, name: 'Logos' }).success).toBe(
        true,
      );
      expect(createCollectionSchema.safeParse({ workspace_id: 0, name: 'Logos' }).success).toBe(
        false,
      );
      expect(createCollectionSchema.safeParse({ workspace_id: 1, name: '' }).success).toBe(false);
      expect(
        createCollectionSchema.safeParse({ workspace_id: 1, name: 'a'.repeat(101) }).success,
      ).toBe(false);

      expect(updateCollectionSchema.safeParse({ name: 'Brand Assets' }).success).toBe(true);
      expect(updateCollectionSchema.safeParse({ name: '' }).success).toBe(false);
      expect(updateCollectionSchema.safeParse({ name: 'a'.repeat(101) }).success).toBe(false);
    });

    it('validates collectionIdParamSchema and queryCollectionsSchema', () => {
      expect(collectionIdParamSchema.safeParse({ id: 5 }).success).toBe(true);
      expect(collectionIdParamSchema.safeParse({ id: 'abc' }).success).toBe(false);

      expect(queryCollectionsSchema.safeParse({ workspace_id: '3' }).success).toBe(true);
      expect(queryCollectionsSchema.safeParse({}).success).toBe(true);
      expect(queryCollectionsSchema.safeParse({ workspace_id: 0 }).success).toBe(false);
    });
  });

  describe('Actor Context Helpers & Fallbacks', () => {
    it('throws error when user context is invalid in getWorkspaceActor & getCollectionActor', () => {
      expect(() => getWorkspaceActor({ user: null } as any)).toThrow(
        'Invalid authenticated user context.',
      );
      expect(() => getWorkspaceActor({ user: { userId: NaN } } as any)).toThrow(
        'Invalid authenticated user context.',
      );
      expect(() => getCollectionActor({ user: null } as any)).toThrow(
        'Invalid authenticated user context.',
      );
      expect(() => getCollectionActor({ user: { userId: NaN } } as any)).toThrow(
        'Invalid authenticated user context.',
      );
    });

    it('extracts actor properly with tenantId fallback', () => {
      const actor1 = getWorkspaceActor({
        user: { userId: 5, role: 'CLIENT', tenantId: 10 },
      } as any);
      expect(actor1).toEqual({ id: 5, role: 'CLIENT', tenantId: 10 });

      const actor2 = getCollectionActor({ user: { userId: 5, role: 'CLIENT' } } as any);
      expect(actor2).toEqual({ id: 5, role: 'CLIENT', tenantId: 5 });
    });
  });

  describe('Workspaces Endpoints (/api/v1/workspaces)', () => {
    it('GET /workspaces lists workspaces with statistics', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 1, name: 'Default', created_at: '2026-08-20', collection_count: 2, asset_count: 5 },
        { id: 2, name: 'Marketing', created_at: '2026-08-20', collection_count: 0, asset_count: 0 },
      ]);

      const res = await supertest(app)
        .get('/workspaces')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].collectionCount).toBe(2);
      expect(res.body.data[0].assetCount).toBe(5);
    });

    it('GET /workspaces handles empty or null list gracefully', async () => {
      vi.mocked(db.query).mockResolvedValueOnce(null as any);

      const res = await supertest(app)
        .get('/workspaces')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('GET /workspaces handles database error', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('DB Error'));

      const res = await supertest(app)
        .get('/workspaces')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(500);
      expect(res.body.message).toBe('Error al consultar los espacios de trabajo.');
    });

    it('POST /workspaces allows ADMIN or TENANT_OWNER to create workspace', async () => {
      vi.mocked(db.query).mockResolvedValueOnce({ insertId: 10 } as any);

      const res = await supertest(app)
        .post('/workspaces')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Finance' });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBe(10);
      expect(res.body.data.name).toBe('Finance');
    });

    it('POST /workspaces allows ADMIN to create workspace', async () => {
      vi.mocked(db.query).mockResolvedValueOnce({ insertId: 11 } as any);

      const res = await supertest(app)
        .post('/workspaces')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Enterprise' });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBe(11);
    });

    it('POST /workspaces rejects non-owner / non-admin (403)', async () => {
      const res = await supertest(app)
        .post('/workspaces')
        .set('Authorization', `Bearer ${collaboratorToken}`)
        .send({ name: 'Unauthorized Workspace' });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Solo el propietario del tenant o un administrador');
    });

    it('POST /workspaces validates body (400 on empty name)', async () => {
      const res = await supertest(app)
        .post('/workspaces')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: '' });

      expect(res.status).toBe(400);
    });

    it('POST /workspaces handles database error', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('DB Error'));

      const res = await supertest(app)
        .post('/workspaces')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Error Workspace' });

      expect(res.status).toBe(500);
      expect(res.body.message).toBe('Error al crear el espacio de trabajo.');
    });

    it('GET /workspaces/:id returns 400 on invalid ID', async () => {
      const res = await supertest(app)
        .get('/workspaces/invalid')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(400);
    });

    it('GET /workspaces/:id returns 404 if not found or cross-tenant', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .get('/workspaces/999')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Espacio de trabajo no encontrado.');
    });

    it('GET /workspaces/:id returns 200 on success for owner', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          name: 'Main WS',
          created_at: '2026-08-20',
          collection_count: 1,
          asset_count: 3,
          total_byte_size: 1024,
        },
      ]);

      const res = await supertest(app)
        .get('/workspaces/1')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(1);
      expect(res.body.data.name).toBe('Main WS');
      expect(res.body.data.totalByteSize).toBe(1024);
    });

    it('GET /workspaces/:id evaluates ACL VIEW permission and returns 200 for tenant member with default view', async () => {
      // 1. Workspace query
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          name: 'Secret WS',
          created_at: '2026-08-20',
          collection_count: 0,
          asset_count: 0,
          total_byte_size: 0,
        },
      ]);
      // 2. dam_acl_entries -> empty (tenant member fallback to VIEW)
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .get('/workspaces/1')
        .set('Authorization', `Bearer ${collaboratorToken}`);

      expect(res.status).toBe(200);
    });

    it('GET /workspaces/:id returns 403 if ACL evaluation denies VIEW (cross-tenant preloaded metadata mismatch)', async () => {
      // Mock rows returning a workspace with tenant_id: 99 (mismatches actor tenantId: 1)
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          name: 'Other WS',
          tenant_id: 99,
          created_at: '2026-08-20',
          collection_count: 0,
          asset_count: 0,
          total_byte_size: 0,
        },
      ]);

      const res = await supertest(app)
        .get('/workspaces/1')
        .set('Authorization', `Bearer ${collaboratorToken}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Acceso denegado');
    });

    it('GET /workspaces/:id handles database error', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('DB Error'));

      const res = await supertest(app)
        .get('/workspaces/1')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(500);
      expect(res.body.message).toBe('Error al consultar el espacio de trabajo.');
    });

    it('PUT /workspaces/:id returns 404 if workspace not found', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .put('/workspaces/999')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'New Name' });

      expect(res.status).toBe(404);
    });

    it('PUT /workspaces/:id updates name when authorized', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: 1, tenant_id: 1 }]) // select
        .mockResolvedValueOnce({ affectedRows: 1 } as any); // update

      const res = await supertest(app)
        .put('/workspaces/1')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Renamed Workspace' });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Renamed Workspace');
    });

    it('PUT /workspaces/:id returns 403 when ACL denies EDIT', async () => {
      // 1. Workspace check
      vi.mocked(db.query).mockResolvedValueOnce([{ id: 1, tenant_id: 1 }]);
      // 2. dam_acl_entries -> empty
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .put('/workspaces/1')
        .set('Authorization', `Bearer ${collaboratorToken}`)
        .send({ name: 'Denied Rename' });

      expect(res.status).toBe(403);
    });

    it('PUT /workspaces/:id handles database error', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('DB Error'));

      const res = await supertest(app)
        .put('/workspaces/1')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Error Rename' });

      expect(res.status).toBe(500);
      expect(res.body.message).toBe('Error al actualizar el espacio de trabajo.');
    });

    it('DELETE /workspaces/:id returns 404 if workspace not found', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .delete('/workspaces/999')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(404);
    });

    it('DELETE /workspaces/:id returns 403 when ACL denies DELETE', async () => {
      // 1. Workspace check
      vi.mocked(db.query).mockResolvedValueOnce([{ id: 1, tenant_id: 1 }]);
      // 2. dam_acl_entries -> empty
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .delete('/workspaces/1')
        .set('Authorization', `Bearer ${collaboratorToken}`);

      expect(res.status).toBe(403);
    });

    it('DELETE /workspaces/:id returns 409 Conflict if workspace contains active collections', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: 1, tenant_id: 1 }]) // select
        .mockResolvedValueOnce([{ count: 2 }]) // collections count > 0
        .mockResolvedValueOnce([{ count: 0 }]); // assets count

      const res = await supertest(app)
        .delete('/workspaces/1')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(409);
      expect(res.body.message).toContain(
        'El espacio de trabajo contiene colecciones o activos activos.',
      );
    });

    it('DELETE /workspaces/:id returns 409 Conflict if workspace contains active assets', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: 1, tenant_id: 1 }]) // select
        .mockResolvedValueOnce([{ count: 0 }]) // collections count 0
        .mockResolvedValueOnce([{ count: 3 }]); // assets count > 0

      const res = await supertest(app)
        .delete('/workspaces/1')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(409);
      expect(res.body.message).toContain(
        'El espacio de trabajo contiene colecciones o activos activos.',
      );
    });

    it('DELETE /workspaces/:id returns 200 when empty (and soft-deleted assets are excluded)', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: 1, tenant_id: 1 }]) // select
        .mockResolvedValueOnce([{ count: 0 }]) // collections count 0
        .mockResolvedValueOnce([{ count: 0 }]) // active assets count 0
        .mockResolvedValueOnce({ affectedRows: 1 } as any); // delete

      const res = await supertest(app)
        .delete('/workspaces/1')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.workspaceId).toBe(1);
    });

    it('DELETE /workspaces/:id handles database error', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('DB Error'));

      const res = await supertest(app)
        .delete('/workspaces/1')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(500);
      expect(res.body.message).toBe('Error al eliminar el espacio de trabajo.');
    });
  });

  describe('Collections Endpoints (/api/v1/collections)', () => {
    it('GET /collections lists collections without filter', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          workspace_id: 1,
          name: 'Brand',
          created_at: '2026-08-20',
          workspace_name: 'Main',
          asset_count: 4,
          total_byte_size: 2048,
        },
      ]);

      const res = await supertest(app)
        .get('/collections')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('Brand');
      expect(res.body.data[0].assetCount).toBe(4);
      expect(res.body.data[0].totalByteSize).toBe(2048);
    });

    it('GET /collections handles empty or null list gracefully', async () => {
      vi.mocked(db.query).mockResolvedValueOnce(null as any);

      const res = await supertest(app)
        .get('/collections')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('GET /collections handles collection with null asset_count and total_byte_size', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          workspace_id: 1,
          name: 'Brand',
          created_at: '2026-08-20',
          workspace_name: 'Main',
          asset_count: null as any,
          total_byte_size: null as any,
        },
      ]);

      const res = await supertest(app)
        .get('/collections')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data[0].assetCount).toBe(0);
      expect(res.body.data[0].totalByteSize).toBe(0);
    });

    it('GET /collections lists collections with workspace_id filter', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .get('/collections?workspace_id=2')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('GET /collections handles database error', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('DB Error'));

      const res = await supertest(app)
        .get('/collections')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(500);
      expect(res.body.message).toBe('Error al consultar las colecciones.');
    });

    it('POST /collections returns 404 if workspace does not exist in tenant', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .post('/collections')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ workspace_id: 99, name: 'Logos' });

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('El espacio de trabajo especificado no existe');
    });

    it('POST /collections returns 403 when ACL denies EDIT on workspace', async () => {
      // 1. Workspace query
      vi.mocked(db.query).mockResolvedValueOnce([{ id: 1, tenant_id: 1 }]);
      // 2. dam_acl_entries -> empty
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .post('/collections')
        .set('Authorization', `Bearer ${collaboratorToken}`)
        .send({ workspace_id: 1, name: 'Logos' });

      expect(res.status).toBe(403);
    });

    it('POST /collections creates collection successfully for owner', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: 1, tenant_id: 1 }]) // workspace exists
        .mockResolvedValueOnce({ insertId: 50 } as any); // insert

      const res = await supertest(app)
        .post('/collections')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ workspace_id: 1, name: 'Product Photos' });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBe(50);
      expect(res.body.data.workspaceId).toBe(1);
      expect(res.body.data.name).toBe('Product Photos');
    });

    it('POST /collections handles database error', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('DB Error'));

      const res = await supertest(app)
        .post('/collections')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ workspace_id: 1, name: 'Product Photos' });

      expect(res.status).toBe(500);
      expect(res.body.message).toBe('Error al crear la colección.');
    });

    it('GET /collections/:id returns 404 if not found or cross-tenant', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .get('/collections/999')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Colección no encontrada.');
    });

    it('GET /collections/:id returns 200 on success', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 5,
          workspace_id: 1,
          name: 'Banners',
          created_at: '2026-08-20',
          workspace_name: 'Marketing',
          tenant_id: 1,
          asset_count: 2,
          total_byte_size: 4096,
        },
      ]);

      const res = await supertest(app)
        .get('/collections/5')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(5);
      expect(res.body.data.name).toBe('Banners');
      expect(res.body.data.assetCount).toBe(2);
      expect(res.body.data.totalByteSize).toBe(4096);
    });

    it('GET /collections/:id returns 200 on collection with null/0 asset_count and total_byte_size', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 5,
          workspace_id: 1,
          name: 'Empty Banners',
          created_at: '2026-08-20',
          workspace_name: 'Marketing',
          tenant_id: 1,
          asset_count: null as any,
          total_byte_size: null as any,
        },
      ]);

      const res = await supertest(app)
        .get('/collections/5')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.assetCount).toBe(0);
      expect(res.body.data.totalByteSize).toBe(0);
    });

    it('GET /collections/:id returns 403 if ACL evaluation denies VIEW (cross-tenant preloaded metadata mismatch)', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 5,
          workspace_id: 1,
          name: 'Banners',
          created_at: '2026-08-20',
          workspace_name: 'Marketing',
          tenant_id: 99, // Mismatched tenant
          asset_count: 2,
          total_byte_size: 4096,
        },
      ]);

      const res = await supertest(app)
        .get('/collections/5')
        .set('Authorization', `Bearer ${collaboratorToken}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Acceso denegado');
    });

    it('GET /collections/:id handles database error', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('DB Error'));

      const res = await supertest(app)
        .get('/collections/5')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(500);
      expect(res.body.message).toBe('Error al consultar la colección.');
    });

    it('PUT /collections/:id returns 404 if collection not found', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .put('/collections/999')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'New Col Name' });

      expect(res.status).toBe(404);
    });

    it('PUT /collections/:id updates name when authorized', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: 5, workspace_id: 1, tenant_id: 1 }]) // select
        .mockResolvedValueOnce({ affectedRows: 1 } as any); // update

      const res = await supertest(app)
        .put('/collections/5')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Updated Banners' });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Updated Banners');
    });

    it('PUT /collections/:id returns 403 when ACL denies EDIT', async () => {
      // 1. Collection check
      vi.mocked(db.query).mockResolvedValueOnce([{ id: 5, workspace_id: 1, tenant_id: 1 }]);
      // 2. dam_acl_entries -> empty
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .put('/collections/5')
        .set('Authorization', `Bearer ${collaboratorToken}`)
        .send({ name: 'Denied Edit' });

      expect(res.status).toBe(403);
    });

    it('PUT /collections/:id handles database error', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('DB Error'));

      const res = await supertest(app)
        .put('/collections/5')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Error Name' });

      expect(res.status).toBe(500);
      expect(res.body.message).toBe('Error al actualizar la colección.');
    });

    it('DELETE /collections/:id returns 404 if collection not found', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .delete('/collections/999')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(404);
    });

    it('DELETE /collections/:id returns 403 when ACL denies DELETE', async () => {
      // 1. Collection check
      vi.mocked(db.query).mockResolvedValueOnce([{ id: 5, workspace_id: 1, tenant_id: 1 }]);
      // 2. dam_acl_entries -> empty
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .delete('/collections/5')
        .set('Authorization', `Bearer ${collaboratorToken}`);

      expect(res.status).toBe(403);
    });

    it('DELETE /collections/:id returns 409 Conflict if collection contains active assets', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: 5, workspace_id: 1, tenant_id: 1 }]) // select
        .mockResolvedValueOnce([{ count: 2 }]); // asset count > 0

      const res = await supertest(app)
        .delete('/collections/5')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(409);
      expect(res.body.message).toContain('La colección contiene activos activos.');
    });

    it('DELETE /collections/:id returns 200 when empty (soft-deleted assets excluded)', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: 5, workspace_id: 1, tenant_id: 1 }]) // select
        .mockResolvedValueOnce([{ count: 0 }]) // asset count 0
        .mockResolvedValueOnce({ affectedRows: 1 } as any); // delete

      const res = await supertest(app)
        .delete('/collections/5')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.collectionId).toBe(5);
    });

    it('DELETE /collections/:id handles database error', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('DB Error'));

      const res = await supertest(app)
        .delete('/collections/5')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(500);
      expect(res.body.message).toBe('Error al eliminar la colección.');
    });
  });

  describe('Asset Relocation Endpoint (PATCH /api/v1/assets/:id/location)', () => {
    it('returns 400 on invalid asset ID param', async () => {
      const res = await supertest(app)
        .patch('/assets/invalid-id/location')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ workspace_id: 2 });

      expect(res.status).toBe(400);
    });

    it('returns 404 when asset does not exist, belongs to another tenant or is soft-deleted', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .patch('/assets/999/location')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ workspace_id: 2 });

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Activo no encontrado o ya eliminado.');
    });

    it('returns 403 when ACL denies EDIT on source asset', async () => {
      // 1. Source asset
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 10,
          tenant_id: 1,
          workspace_id: 1,
          collection_id: null,
          status: 'ACTIVE',
          deleted_at: null,
        },
      ]);
      // 2. dam_acl_entries -> empty
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .patch('/assets/10/location')
        .set('Authorization', `Bearer ${collaboratorToken}`)
        .send({ workspace_id: 2 });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('activo de origen');
    });

    it('returns 400 when destination workspace does not exist in tenant', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([
          {
            id: 10,
            tenant_id: 1,
            workspace_id: 1,
            collection_id: null,
            status: 'ACTIVE',
            deleted_at: null,
          },
        ]) // source asset
        .mockResolvedValueOnce([]); // destination workspace not found

      const res = await supertest(app)
        .patch('/assets/10/location')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ workspace_id: 99 });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain(
        'El espacio de trabajo de destino no existe o pertenece a otro tenant.',
      );
    });

    it('returns 400 when destination collection does not belong to destination workspace or tenant', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([
          {
            id: 10,
            tenant_id: 1,
            workspace_id: 1,
            collection_id: null,
            status: 'ACTIVE',
            deleted_at: null,
          },
        ]) // source asset
        .mockResolvedValueOnce([{ id: 2, tenant_id: 1 }]) // dest workspace exists
        .mockResolvedValueOnce([]); // dest collection query fails

      const res = await supertest(app)
        .patch('/assets/10/location')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ workspace_id: 2, collection_id: 88 });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain(
        'La colección de destino no existe, no pertenece al workspace',
      );
    });

    it('returns 403 when ACL denies EDIT on destination collection', async () => {
      // 1. Source asset
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 10,
          tenant_id: 1,
          workspace_id: 1,
          collection_id: null,
          status: 'ACTIVE',
          deleted_at: null,
        },
      ]);
      // 2. ACL check on source asset -> allowed (specific grant)
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 1,
          resource_type: 'ASSET',
          resource_id: 10,
          principal_type: 'USER',
          principal_id: '2',
          permission: 'EDIT',
        },
      ]);
      // 3. dest workspace
      vi.mocked(db.query).mockResolvedValueOnce([{ id: 2, tenant_id: 1 }]);
      // 4. dest collection
      vi.mocked(db.query).mockResolvedValueOnce([{ id: 8, workspace_id: 2, tenant_id: 1 }]);
      // 5. ACL check on dest collection -> empty (denied)
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .patch('/assets/10/location')
        .set('Authorization', `Bearer ${collaboratorToken}`)
        .send({ workspace_id: 2, collection_id: 8 });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('colección de destino');
    });

    it('returns 403 when ACL denies EDIT on destination workspace (when collection_id is null)', async () => {
      // 1. Source asset
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 10,
          tenant_id: 1,
          workspace_id: 1,
          collection_id: 4,
          status: 'ACTIVE',
          deleted_at: null,
        },
      ]);
      // 2. ACL check on source asset -> allowed
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 1,
          resource_type: 'ASSET',
          resource_id: 10,
          principal_type: 'USER',
          principal_id: '2',
          permission: 'EDIT',
        },
      ]);
      // 3. dest workspace
      vi.mocked(db.query).mockResolvedValueOnce([{ id: 2, tenant_id: 1 }]);
      // 4. ACL check on dest workspace -> empty (denied)
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .patch('/assets/10/location')
        .set('Authorization', `Bearer ${collaboratorToken}`)
        .send({ workspace_id: 2, collection_id: null });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('espacio de trabajo de destino');
    });

    it('relocates asset to destination collection successfully (200)', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([
          {
            id: 10,
            tenant_id: 1,
            workspace_id: 1,
            collection_id: 3,
            status: 'ACTIVE',
            deleted_at: null,
          },
        ]) // source asset
        .mockResolvedValueOnce([{ id: 2, tenant_id: 1 }]) // dest workspace
        .mockResolvedValueOnce([{ id: 8, workspace_id: 2, tenant_id: 1 }]) // dest collection
        .mockResolvedValueOnce({ affectedRows: 1 } as any); // update asset

      const res = await supertest(app)
        .patch('/assets/10/location')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ workspace_id: 2, collection_id: 8 });

      expect(res.status).toBe(200);
      expect(res.body.data.assetId).toBe(10);
      expect(res.body.data.previousWorkspaceId).toBe(1);
      expect(res.body.data.previousCollectionId).toBe(3);
      expect(res.body.data.newWorkspaceId).toBe(2);
      expect(res.body.data.newCollectionId).toBe(8);
    });

    it('relocates asset to workspace root (collection_id: null) successfully (200)', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([
          {
            id: 10,
            tenant_id: 1,
            workspace_id: 1,
            collection_id: 3,
            status: 'ACTIVE',
            deleted_at: null,
          },
        ]) // source asset
        .mockResolvedValueOnce([{ id: 2, tenant_id: 1 }]) // dest workspace
        .mockResolvedValueOnce({ affectedRows: 1 } as any); // update asset

      const res = await supertest(app)
        .patch('/assets/10/location')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ workspace_id: 2, collection_id: null });

      expect(res.status).toBe(200);
      expect(res.body.data.assetId).toBe(10);
      expect(res.body.data.newWorkspaceId).toBe(2);
      expect(res.body.data.newCollectionId).toBeNull();
    });

    it('handles database error on asset relocation', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('DB Error'));

      const res = await supertest(app)
        .patch('/assets/10/location')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ workspace_id: 2 });

      expect(res.status).toBe(500);
      expect(res.body.message).toBe('Error al reubicar el activo digital.');
    });
  });

  describe('Rate Limiter 429 Handlers', () => {
    it('triggers workspacesRateLimiter handler', async () => {
      const appWsLimit = express();
      appWsLimit.use(workspacesRateLimiter);
      appWsLimit.get('/test-ws', (_req, res) => res.json({ ok: true }));

      for (let i = 0; i < 100; i++) {
        await supertest(appWsLimit).get('/test-ws');
      }
      const resBlocked = await supertest(appWsLimit).get('/test-ws');
      expect(resBlocked.status).toBe(429);
      expect(resBlocked.body.message).toMatch(/Límite de operaciones de espacios de trabajo/);
    });

    it('triggers collectionsRateLimiter handler', async () => {
      const appColLimit = express();
      appColLimit.use(collectionsRateLimiter);
      appColLimit.get('/test-col', (_req, res) => res.json({ ok: true }));

      for (let i = 0; i < 100; i++) {
        await supertest(appColLimit).get('/test-col');
      }
      const resBlocked = await supertest(appColLimit).get('/test-col');
      expect(resBlocked.status).toBe(429);
      expect(resBlocked.body.message).toMatch(/Límite de operaciones de colecciones/);
    });
  });
});
