/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import supertest from 'supertest';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import path from 'path';

import * as db from '../../../server/src/db';
import aclRouter from '../../../server/src/routes/acl';
import assetsRouter from '../../../server/src/routes/assets';
import {
  tagsRouter,
  getActorTenantId as getTagsActorTenantId,
} from '../../../server/src/routes/tags';
import { STORAGE_ROOT } from '../../../server/src/utils/storage';
import { hasPermission, evaluateAclPermission, AclActor } from '../../../server/src/utils/acl';
import {
  createAclEntrySchema,
  queryAclSchema,
  checkAclSchema,
  deleteAclEntryParamsSchema,
} from '../../../server/src/schemas/acl.schema';

vi.mock('../../../server/src/db', () => ({
  query: vi.fn(),
  pool: {
    execute: vi.fn().mockResolvedValue([{ affectedRows: 1 }]),
  },
}));

const TEST_SECRET = 'dreamtek_dev_jwt_secret_key_2026';

describe('FC 006 — DAM Access Control Lists (ACL) & Granular Permissions Suite (100% Coverage)', () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/acl', aclRouter);
  app.use('/assets', assetsRouter);
  app.use('/tags', tagsRouter);

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

  // Tenant 1 Collaborator (non-owner)
  const collaboratorToken = jwt.sign(
    { userId: 2, uid: 2, tenantId: 1, email: 'collab@dreamtek.tech', role: 'CLIENT' },
    TEST_SECRET,
    { algorithm: 'HS512' },
  );

  // Tenant 2 Client (Cross-tenant)
  const _crossTenantToken = jwt.sign(
    { userId: 3, uid: 3, tenantId: 2, email: 'other@dreamtek.tech', role: 'CLIENT' },
    TEST_SECRET,
    { algorithm: 'HS512' },
  );

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('1. Unit Tests — hasPermission (Implication Lattice)', () => {
    it('debe validar que MANAGE otorga todos los permisos', () => {
      expect(hasPermission('MANAGE', 'VIEW')).toBe(true);
      expect(hasPermission('MANAGE', 'DOWNLOAD')).toBe(true);
      expect(hasPermission('MANAGE', 'EDIT')).toBe(true);
      expect(hasPermission('MANAGE', 'DELETE')).toBe(true);
      expect(hasPermission('MANAGE', 'MANAGE')).toBe(true);
    });

    it('debe validar que DELETE otorga VIEW y DELETE, pero no EDIT o DOWNLOAD', () => {
      expect(hasPermission('DELETE', 'DELETE')).toBe(true);
      expect(hasPermission('DELETE', 'VIEW')).toBe(true);
      expect(hasPermission('DELETE', 'DOWNLOAD')).toBe(false);
      expect(hasPermission('DELETE', 'EDIT')).toBe(false);
      expect(hasPermission('DELETE', 'MANAGE')).toBe(false);
    });

    it('debe validar que EDIT otorga EDIT, DOWNLOAD y VIEW, pero no DELETE o MANAGE', () => {
      expect(hasPermission('EDIT', 'EDIT')).toBe(true);
      expect(hasPermission('EDIT', 'DOWNLOAD')).toBe(true);
      expect(hasPermission('EDIT', 'VIEW')).toBe(true);
      expect(hasPermission('EDIT', 'DELETE')).toBe(false);
      expect(hasPermission('EDIT', 'MANAGE')).toBe(false);
    });

    it('debe validar que DOWNLOAD otorga DOWNLOAD y VIEW, pero no EDIT, DELETE o MANAGE', () => {
      expect(hasPermission('DOWNLOAD', 'DOWNLOAD')).toBe(true);
      expect(hasPermission('DOWNLOAD', 'VIEW')).toBe(true);
      expect(hasPermission('DOWNLOAD', 'EDIT')).toBe(false);
      expect(hasPermission('DOWNLOAD', 'DELETE')).toBe(false);
      expect(hasPermission('DOWNLOAD', 'MANAGE')).toBe(false);
    });

    it('debe validar que VIEW solo otorga VIEW', () => {
      expect(hasPermission('VIEW', 'VIEW')).toBe(true);
      expect(hasPermission('VIEW', 'DOWNLOAD')).toBe(false);
      expect(hasPermission('VIEW', 'EDIT')).toBe(false);
      expect(hasPermission('VIEW', 'DELETE')).toBe(false);
      expect(hasPermission('VIEW', 'MANAGE')).toBe(false);
    });

    it('debe retornar false para valores no contemplados', () => {
      expect(hasPermission('VIEW' as any, 'UNKNOWN' as any)).toBe(false);
    });
  });

  describe('2. Unit Tests — evaluateAclPermission', () => {
    it('debe retornar ADMIN_BYPASS para usuarios con rol ADMIN', async () => {
      const adminActor: AclActor = { id: 99, role: 'ADMIN', tenantId: 1 };
      const res = await evaluateAclPermission(adminActor, 'ASSET', 10, 'DELETE');
      expect(res).toEqual({ allowed: true, reason: 'ADMIN_BYPASS' });
    });

    it('debe otorgar permisos completos (TENANT_OWNER) al propietario del tenant', async () => {
      const ownerActor: AclActor = { id: 1, role: 'CLIENT', tenantId: 1 };
      // Preloaded metadata
      const res = await evaluateAclPermission(ownerActor, 'ASSET', 10, 'DELETE', {
        tenantId: 1,
        status: 'ACTIVE',
      });
      expect(res).toEqual({ allowed: true, reason: 'ACL_GRANTED', grantedBy: 'TENANT_OWNER' });
    });

    it('debe denegar cuando el ASSET no existe o es de otro tenant', async () => {
      const collabActor: AclActor = { id: 2, role: 'CLIENT', tenantId: 1 };
      vi.mocked(db.query).mockResolvedValueOnce([]); // No rows
      const res = await evaluateAclPermission(collabActor, 'ASSET', 999, 'VIEW');
      expect(res).toEqual({ allowed: false, reason: 'NOT_FOUND_OR_CROSS_TENANT' });

      // Cross tenant
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 10,
          tenant_id: 2,
          workspace_id: 1,
          collection_id: null,
          status: 'ACTIVE',
          deleted_at: null,
        },
      ]);
      const res2 = await evaluateAclPermission(collabActor, 'ASSET', 10, 'VIEW');
      expect(res2).toEqual({ allowed: false, reason: 'NOT_FOUND_OR_CROSS_TENANT' });

      // Preloaded cross tenant
      const res3 = await evaluateAclPermission(collabActor, 'ASSET', 10, 'VIEW', {
        tenantId: 2,
      });
      expect(res3).toEqual({ allowed: false, reason: 'NOT_FOUND_OR_CROSS_TENANT' });
    });

    it('debe denegar cuando la COLLECTION no existe o es de otro tenant', async () => {
      const collabActor: AclActor = { id: 2, role: 'CLIENT', tenantId: 1 };
      vi.mocked(db.query).mockResolvedValueOnce([]); // No rows
      const res = await evaluateAclPermission(collabActor, 'COLLECTION', 999, 'VIEW');
      expect(res).toEqual({ allowed: false, reason: 'NOT_FOUND_OR_CROSS_TENANT' });

      // Cross tenant
      vi.mocked(db.query).mockResolvedValueOnce([{ id: 5, workspace_id: 1, tenant_id: 2 }]);
      const res2 = await evaluateAclPermission(collabActor, 'COLLECTION', 5, 'VIEW');
      expect(res2).toEqual({ allowed: false, reason: 'NOT_FOUND_OR_CROSS_TENANT' });
    });

    it('debe denegar cuando el WORKSPACE no existe o es de otro tenant', async () => {
      const collabActor: AclActor = { id: 2, role: 'CLIENT', tenantId: 1 };
      vi.mocked(db.query).mockResolvedValueOnce([]); // No rows
      const res = await evaluateAclPermission(collabActor, 'WORKSPACE', 999, 'VIEW');
      expect(res).toEqual({ allowed: false, reason: 'NOT_FOUND_OR_CROSS_TENANT' });

      // Cross tenant
      vi.mocked(db.query).mockResolvedValueOnce([{ id: 2, tenant_id: 2 }]);
      const res2 = await evaluateAclPermission(collabActor, 'WORKSPACE', 2, 'VIEW');
      expect(res2).toEqual({ allowed: false, reason: 'NOT_FOUND_OR_CROSS_TENANT' });
    });

    it('debe denegar activos soft-deleted si el permiso solicitado no es MANAGE', async () => {
      const collabActor: AclActor = { id: 2, role: 'CLIENT', tenantId: 1 };
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 10,
          tenant_id: 1,
          workspace_id: 1,
          collection_id: null,
          status: 'DELETED',
          deleted_at: new Date(),
        },
      ]);
      const res = await evaluateAclPermission(collabActor, 'ASSET', 10, 'VIEW');
      expect(res).toEqual({ allowed: false, reason: 'ASSET_DELETED' });

      // Preloaded deleted
      const res2 = await evaluateAclPermission(collabActor, 'ASSET', 10, 'VIEW', {
        tenantId: 1,
        status: 'DELETED',
      });
      expect(res2).toEqual({ allowed: false, reason: 'ASSET_DELETED' });
    });

    it('debe otorgar permiso directo sobre ASSET si existe entrada de ACL para colaborador', async () => {
      const collabActor: AclActor = { id: 2, role: 'CLIENT', tenantId: 1 };
      // Asset query
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 10,
          tenant_id: 1,
          workspace_id: 1,
          collection_id: 2,
          status: 'ACTIVE',
          deleted_at: null,
        },
      ]);
      // ACL entries query
      vi.mocked(db.query).mockResolvedValueOnce([
        { resource_type: 'ASSET', resource_id: 10, permission: 'DOWNLOAD', granted_by: 'admin' },
      ]);

      const res = await evaluateAclPermission(collabActor, 'ASSET', 10, 'DOWNLOAD');
      expect(res).toEqual({ allowed: true, reason: 'ACL_GRANTED', grantedBy: 'admin' });
    });

    it('debe heredar permiso desde COLLECTION para colaborador', async () => {
      const collabActor: AclActor = { id: 2, role: 'CLIENT', tenantId: 1 };
      // Asset query
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 10,
          tenant_id: 1,
          workspace_id: 1,
          collection_id: 2,
          status: 'ACTIVE',
          deleted_at: null,
        },
      ]);
      // ACL entries query
      vi.mocked(db.query).mockResolvedValueOnce([
        { resource_type: 'COLLECTION', resource_id: 2, permission: 'EDIT', granted_by: 'admin' },
      ]);

      const res = await evaluateAclPermission(collabActor, 'ASSET', 10, 'EDIT');
      expect(res).toEqual({ allowed: true, reason: 'ACL_GRANTED', grantedBy: 'admin' });
    });

    it('debe heredar permiso desde WORKSPACE para colaborador', async () => {
      const collabActor: AclActor = { id: 2, role: 'CLIENT', tenantId: 1 };
      // Asset query
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
      // ACL entries query
      vi.mocked(db.query).mockResolvedValueOnce([
        { resource_type: 'WORKSPACE', resource_id: 1, permission: 'MANAGE', granted_by: 'admin' },
      ]);

      const res = await evaluateAclPermission(collabActor, 'ASSET', 10, 'DELETE');
      expect(res).toEqual({ allowed: true, reason: 'ACL_GRANTED', grantedBy: 'admin' });
    });

    it('debe permitir VIEW por defecto para miembros colaboradores del mismo tenant en activos activos', async () => {
      const collabActor: AclActor = { id: 2, role: 'CLIENT', tenantId: 1 };
      // Asset query
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
      // ACL entries query: empty
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await evaluateAclPermission(collabActor, 'ASSET', 10, 'VIEW');
      expect(res).toEqual({ allowed: true, reason: 'TENANT_MEMBER_DEFAULT_VIEW' });
    });

    it('debe aplicar DEFAULT_DENY si no hay coincidencia de permiso para colaborador', async () => {
      const collabActor: AclActor = { id: 2, role: 'CLIENT', tenantId: 1 };
      // Asset query
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
      // ACL entries query: empty
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await evaluateAclPermission(collabActor, 'ASSET', 10, 'DOWNLOAD');
      expect(res).toEqual({ allowed: false, reason: 'DEFAULT_DENY' });
    });

    it('debe evaluar permisos sobre COLLECTION directamente para colaborador', async () => {
      const collabActor: AclActor = { id: 2, role: 'CLIENT', tenantId: 1 };
      // Collection query
      vi.mocked(db.query).mockResolvedValueOnce([{ id: 5, workspace_id: 1, tenant_id: 1 }]);
      // ACL entries query
      vi.mocked(db.query).mockResolvedValueOnce([
        { resource_type: 'COLLECTION', resource_id: 5, permission: 'MANAGE', granted_by: 'owner' },
      ]);

      const res = await evaluateAclPermission(collabActor, 'COLLECTION', 5, 'EDIT');
      expect(res).toEqual({ allowed: true, reason: 'ACL_GRANTED', grantedBy: 'owner' });
    });

    it('debe evaluar permisos sobre WORKSPACE directamente para colaborador', async () => {
      const collabActor: AclActor = { id: 2, role: 'CLIENT', tenantId: 1 };
      // Workspace query
      vi.mocked(db.query).mockResolvedValueOnce([{ id: 3, tenant_id: 1 }]);
      // ACL entries query
      vi.mocked(db.query).mockResolvedValueOnce([
        { resource_type: 'WORKSPACE', resource_id: 3, permission: 'EDIT', granted_by: 'owner' },
      ]);

      const res = await evaluateAclPermission(collabActor, 'WORKSPACE', 3, 'VIEW');
      expect(res).toEqual({ allowed: true, reason: 'ACL_GRANTED', grantedBy: 'owner' });
    });

    it('debe manejar resourceType desconocido en evaluateAclPermission', async () => {
      const collabActor: AclActor = { id: 2, role: 'CLIENT', tenantId: 1 };
      const res = await evaluateAclPermission(collabActor, 'UNKNOWN' as any, 10, 'VIEW');
      expect(res).toEqual({ allowed: false, reason: 'DEFAULT_DENY' });
    });

    it('debe denegar cuando la entrada de ACL para COLLECTION o WORKSPACE es insuficiente', async () => {
      const collabActor: AclActor = { id: 2, role: 'CLIENT', tenantId: 1 };
      // Asset query
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 10,
          tenant_id: 1,
          workspace_id: 1,
          collection_id: 2,
          status: 'ACTIVE',
          deleted_at: null,
        },
      ]);
      // ACL entries query: COLLECTION and WORKSPACE have only VIEW, but DELETE is required
      vi.mocked(db.query).mockResolvedValueOnce([
        { resource_type: 'COLLECTION', resource_id: 2, permission: 'VIEW', granted_by: 'owner' },
        { resource_type: 'WORKSPACE', resource_id: 1, permission: 'VIEW', granted_by: 'owner' },
      ]);

      const res = await evaluateAclPermission(collabActor, 'ASSET', 10, 'DELETE');
      expect(res).toEqual({ allowed: false, reason: 'DEFAULT_DENY' });
    });
  });

  describe('3. Zod Schemas Validation', () => {
    it('debe validar createAclEntrySchema correctamente', () => {
      const valid = {
        resource_type: 'ASSET',
        resource_id: 10,
        principal_type: 'USER',
        principal_id: '1',
        permission: 'DOWNLOAD',
      };
      expect(createAclEntrySchema.safeParse(valid).success).toBe(true);

      const invalid = {
        resource_type: 'INVALID',
        resource_id: -5,
        principal_type: 'UNKNOWN',
        principal_id: '',
        permission: 'SUPER',
      };
      expect(createAclEntrySchema.safeParse(invalid).success).toBe(false);
    });

    it('debe validar queryAclSchema y checkAclSchema', () => {
      expect(
        queryAclSchema.safeParse({ resource_type: 'COLLECTION', resource_id: 2 }).success,
      ).toBe(true);
      expect(
        queryAclSchema.safeParse({ resource_type: 'UNKNOWN', resource_id: 'abc' }).success,
      ).toBe(false);

      expect(
        checkAclSchema.safeParse({ resource_type: 'WORKSPACE', resource_id: 1, permission: 'VIEW' })
          .success,
      ).toBe(true);
      expect(
        checkAclSchema.safeParse({
          resource_type: 'WORKSPACE',
          resource_id: 1,
          permission: 'INVALID',
        }).success,
      ).toBe(false);
    });

    it('debe validar deleteAclEntryParamsSchema', () => {
      expect(deleteAclEntryParamsSchema.safeParse({ id: 5 }).success).toBe(true);
      expect(deleteAclEntryParamsSchema.safeParse({ id: -1 }).success).toBe(false);
    });
  });

  describe('4. REST API Endpoints — /acl/*', () => {
    describe('GET /acl/entries', () => {
      it('debe rechazar solicitud sin autenticación (401)', async () => {
        const res = await supertest(app).get('/acl/entries?resource_type=ASSET&resource_id=10');
        expect(res.status).toBe(401);
      });

      it('debe rechazar parámetros de consulta inválidos (400)', async () => {
        const res = await supertest(app)
          .get('/acl/entries?resource_type=INVALID&resource_id=abc')
          .set('Authorization', `Bearer ${ownerToken}`);
        expect(res.status).toBe(400);
      });

      it('debe denegar cuando el actor no tiene permiso VIEW sobre el recurso (403)', async () => {
        // Asset query (belongs to tenant 2)
        vi.mocked(db.query).mockResolvedValueOnce([
          {
            id: 10,
            tenant_id: 2,
            workspace_id: 1,
            collection_id: null,
            status: 'ACTIVE',
            deleted_at: null,
          },
        ]);

        const res = await supertest(app)
          .get('/acl/entries?resource_type=ASSET&resource_id=10')
          .set('Authorization', `Bearer ${collaboratorToken}`);

        expect(res.status).toBe(403);
        expect(res.body.error).toBe('Forbidden');
      });

      it('debe listar entradas de ACL cuando el actor tiene permiso (200)', async () => {
        // 1. evaluateAclPermission asset query
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
        // 2. Query entries
        vi.mocked(db.query).mockResolvedValueOnce([
          {
            id: 1,
            tenant_id: 1,
            resource_type: 'ASSET',
            resource_id: 10,
            principal_type: 'USER',
            principal_id: '2',
            permission: 'DOWNLOAD',
            granted_by: '1',
            created_at: '2026-08-19T10:00:00Z',
            updated_at: '2026-08-19T10:00:00Z',
          },
        ]);

        const res = await supertest(app)
          .get('/acl/entries?resource_type=ASSET&resource_id=10')
          .set('Authorization', `Bearer ${ownerToken}`);

        expect(res.status).toBe(200);
        expect(res.body.entries).toHaveLength(1);
        expect(res.body.entries[0].permission).toBe('DOWNLOAD');
      });

      it('debe retornar array vacío cuando no hay entradas de ACL registradas (200)', async () => {
        // 1. evaluateAclPermission asset query
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
        // 2. Query entries -> null / empty
        vi.mocked(db.query).mockResolvedValueOnce(null as any);

        const res = await supertest(app)
          .get('/acl/entries?resource_type=ASSET&resource_id=10')
          .set('Authorization', `Bearer ${ownerToken}`);

        expect(res.status).toBe(200);
        expect(res.body.entries).toEqual([]);
      });

      it('debe manejar errores inesperados de base de datos (500)', async () => {
        vi.mocked(db.query).mockRejectedValueOnce(new Error('DB Query Error'));

        const res = await supertest(app)
          .get('/acl/entries?resource_type=ASSET&resource_id=10')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(500);
        expect(res.body.error).toBe('Internal Server Error');
      });
    });

    describe('POST /acl/entries', () => {
      it('debe rechazar solicitud sin autenticación (401)', async () => {
        const res = await supertest(app).post('/acl/entries').send({
          resource_type: 'ASSET',
          resource_id: 10,
          principal_type: 'USER',
          principal_id: '2',
          permission: 'DOWNLOAD',
        });
        expect(res.status).toBe(401);
      });

      it('debe rechazar payload inválido (400)', async () => {
        const res = await supertest(app)
          .post('/acl/entries')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            resource_type: 'INVALID',
          });
        expect(res.status).toBe(400);
      });

      it('debe denegar cuando el colaborador no tiene permiso MANAGE sobre el recurso (403)', async () => {
        // Asset query
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
        // ACL query for evaluate: only VIEW
        vi.mocked(db.query).mockResolvedValueOnce([
          { resource_type: 'ASSET', resource_id: 10, permission: 'VIEW', granted_by: '1' },
        ]);

        const res = await supertest(app)
          .post('/acl/entries')
          .set('Authorization', `Bearer ${collaboratorToken}`)
          .send({
            resource_type: 'ASSET',
            resource_id: 10,
            principal_type: 'USER',
            principal_id: '2',
            permission: 'DOWNLOAD',
          });

        expect(res.status).toBe(403);
        expect(res.body.message).toContain('Se requiere permiso MANAGE');
      });

      it('debe registrar un permiso de ACL exitosamente cuando el actor es ADMIN (201)', async () => {
        vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 });

        const res = await supertest(app)
          .post('/acl/entries')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            resource_type: 'ASSET',
            resource_id: 10,
            principal_type: 'USER',
            principal_id: '2',
            permission: 'DOWNLOAD',
          });

        expect(res.status).toBe(201);
        expect(res.body.message).toContain('registrado exitosamente');
        expect(res.body.entry.permission).toBe('DOWNLOAD');
      });

      it('debe manejar errores inesperados de DB al registrar permiso (500)', async () => {
        vi.mocked(db.query).mockRejectedValueOnce(new Error('Insert Fail'));

        const res = await supertest(app)
          .post('/acl/entries')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            resource_type: 'ASSET',
            resource_id: 10,
            principal_type: 'USER',
            principal_id: '2',
            permission: 'DOWNLOAD',
          });

        expect(res.status).toBe(500);
      });
    });

    describe('DELETE /acl/entries/:id', () => {
      it('debe rechazar solicitud sin autenticación (401)', async () => {
        const res = await supertest(app).delete('/acl/entries/1');
        expect(res.status).toBe(401);
      });

      it('debe rechazar id inválido (400)', async () => {
        const res = await supertest(app)
          .delete('/acl/entries/abc')
          .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(400);
      });

      it('debe retornar 404 si la entrada no existe en el tenant', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([]); // No row

        const res = await supertest(app)
          .delete('/acl/entries/999')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(404);
        expect(res.body.error).toBe('Not Found');
      });

      it('debe denegar si el colaborador no tiene permiso MANAGE sobre el recurso de la entrada (403)', async () => {
        // Query entry
        vi.mocked(db.query).mockResolvedValueOnce([
          {
            id: 1,
            tenant_id: 1,
            resource_type: 'ASSET',
            resource_id: 10,
            principal_type: 'USER',
            principal_id: '2',
            permission: 'DOWNLOAD',
          },
        ]);
        // Asset query for evaluate
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
        // ACL query: no MANAGE
        vi.mocked(db.query).mockResolvedValueOnce([]);

        const res = await supertest(app)
          .delete('/acl/entries/1')
          .set('Authorization', `Bearer ${collaboratorToken}`);

        expect(res.status).toBe(403);
        expect(res.body.message).toContain('Se requiere permiso MANAGE');
      });

      it('debe revocar la entrada exitosamente cuando el actor es ADMIN (200)', async () => {
        // Query entry
        vi.mocked(db.query).mockResolvedValueOnce([
          {
            id: 1,
            tenant_id: 99,
            resource_type: 'ASSET',
            resource_id: 10,
            principal_type: 'USER',
            principal_id: '2',
            permission: 'DOWNLOAD',
          },
        ]);
        // Delete query
        vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 });

        const res = await supertest(app)
          .delete('/acl/entries/1')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.message).toContain('revocada exitosamente');
      });

      it('debe manejar errores de base de datos al revocar entrada (500)', async () => {
        vi.mocked(db.query).mockRejectedValueOnce(new Error('DB Error'));

        const res = await supertest(app)
          .delete('/acl/entries/1')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(500);
      });
    });

    describe('GET /acl/check', () => {
      it('debe evaluar y retornar el permiso efectivo del actor (200)', async () => {
        const res = await supertest(app)
          .get('/acl/check?resource_type=ASSET&resource_id=10&permission=VIEW')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.allowed).toBe(true);
        expect(res.body.reason).toBe('ADMIN_BYPASS');
        expect(res.body.checkedPermission).toBe('VIEW');
      });

      it('debe retornar 400 para parámetros de verificación inválidos', async () => {
        const res = await supertest(app)
          .get('/acl/check?resource_type=INVALID&resource_id=10&permission=VIEW')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(400);
      });

      it('debe retornar 500 en caso de error interno', async () => {
        // Force evaluateAclPermission to fail on client by making DB throw
        vi.mocked(db.query).mockRejectedValueOnce(new Error('DB Fail'));

        const res = await supertest(app)
          .get('/acl/check?resource_type=ASSET&resource_id=10&permission=VIEW')
          .set('Authorization', `Bearer ${collaboratorToken}`);

        expect(res.status).toBe(500);
      });
    });
  });

  describe('5. Integration with Asset Routes & Tags Routes ACL Wire-in', () => {
    it('debe denegar GET /assets/:id cuando la ACL deniega VIEW (403)', async () => {
      // Soft-deleted asset
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 10,
          tenant_id: 1,
          workspace_id: 1,
          collection_id: null,
          status: 'DELETED',
          deleted_at: new Date(),
        },
      ]);

      const res = await supertest(app)
        .get('/assets/10')
        .set('Authorization', `Bearer ${collaboratorToken}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Acceso denegado por política de control de acceso (ACL)');
    });

    it('debe denegar GET /assets/:id/stream cuando la ACL deniega DOWNLOAD para colaborador (403)', async () => {
      const fakeFilePath = path.join(STORAGE_ROOT, 'tenants', '1', 'assets', '10', 'test.png');
      // 1. SELECT asset & version
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          mime_type: 'image/png',
          title: 'test.png',
          workspace_id: 1,
          collection_id: null,
          status: 'ACTIVE',
          deleted_at: null,
          file_path: fakeFilePath,
          byte_size: 100,
        },
      ]);
      // 2. Query dam_acl_entries -> empty
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .get('/assets/10/stream')
        .set('Authorization', `Bearer ${collaboratorToken}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Acceso denegado por política de control de acceso (ACL)');
    });

    it('debe denegar GET /assets/:id/thumbnail cuando la ACL deniega VIEW (403)', async () => {
      const fakeThumbPath = path.join(STORAGE_ROOT, 'tenants', '1', 'assets', '10', 'thumb.webp');
      // 1. SELECT derivative
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          file_path: fakeThumbPath,
          byte_size: 50,
          workspace_id: 1,
          collection_id: null,
          status: 'DELETED', // Soft-deleted asset
          deleted_at: new Date(),
        },
      ]);

      const res = await supertest(app)
        .get('/assets/10/thumbnail')
        .set('Authorization', `Bearer ${collaboratorToken}`);

      expect(res.status).toBe(403);
    });

    it('debe denegar GET /assets/:id/thumbnail cuando fallback original es denegado por ACL (403)', async () => {
      const fakeOriginalPath = path.join(
        STORAGE_ROOT,
        'tenants',
        '1',
        'assets',
        '10',
        'original.png',
      );
      // 1. SELECT derivative -> empty
      vi.mocked(db.query).mockResolvedValueOnce([]);
      // 2. SELECT fallbackRows -> soft-deleted
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          mime_type: 'image/png',
          file_path: fakeOriginalPath,
          byte_size: 100,
          workspace_id: 1,
          collection_id: null,
          status: 'DELETED',
          deleted_at: new Date(),
        },
      ]);

      const res = await supertest(app)
        .get('/assets/10/thumbnail')
        .set('Authorization', `Bearer ${collaboratorToken}`);

      expect(res.status).toBe(403);
    });

    it('debe denegar DELETE /assets/:id cuando la ACL deniega DELETE para colaborador (403)', async () => {
      // 1. evaluateAclPermission asset query
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
        .delete('/assets/10')
        .set('Authorization', `Bearer ${collaboratorToken}`);

      expect(res.status).toBe(403);
    });

    it('debe permitir DELETE /assets/:id cuando el colaborador tiene permiso DELETE explícito en ACL (200)', async () => {
      // 1. evaluateAclPermission asset query
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
      // 2. dam_acl_entries -> has DELETE
      vi.mocked(db.query).mockResolvedValueOnce([
        { resource_type: 'ASSET', resource_id: 10, permission: 'DELETE', granted_by: 'owner' },
      ]);
      // 3. UPDATE assets
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 });

      const res = await supertest(app)
        .delete('/assets/10')
        .set('Authorization', `Bearer ${collaboratorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('marcado como eliminado');
    });

    it('debe denegar POST /assets/:id/tags cuando la ACL deniega EDIT para colaborador (403)', async () => {
      // 1. Anti-IDOR asset query
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
        .post('/assets/10/tags')
        .set('Authorization', `Bearer ${collaboratorToken}`)
        .send({ tag_ids: [1] });

      expect(res.status).toBe(403);
    });

    it('debe denegar DELETE /assets/:id/tags/:tagId cuando la ACL deniega EDIT para colaborador (403)', async () => {
      // 1. Anti-IDOR asset query
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
        .delete('/assets/10/tags/1')
        .set('Authorization', `Bearer ${collaboratorToken}`);

      expect(res.status).toBe(403);
    });

    it('debe denegar GET /assets/:id/metadata cuando la ACL deniega VIEW (403)', async () => {
      // 1. Anti-IDOR asset query
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 10,
          tenant_id: 1,
          workspace_id: 1,
          collection_id: null,
          status: 'DELETED',
          deleted_at: new Date(),
        },
      ]);

      const res = await supertest(app)
        .get('/assets/10/metadata')
        .set('Authorization', `Bearer ${collaboratorToken}`);

      expect(res.status).toBe(403);
    });

    it('debe denegar PUT /assets/:id/metadata cuando la ACL deniega EDIT para colaborador (403)', async () => {
      // 1. Anti-IDOR asset query
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
        .put('/assets/10/metadata')
        .set('Authorization', `Bearer ${collaboratorToken}`)
        .send({ meta_key: 'author', meta_value: 'dreamtek' });

      expect(res.status).toBe(403);
    });

    it('debe denegar DELETE /assets/:id/metadata/:key cuando la ACL deniega EDIT para colaborador (403)', async () => {
      // 1. Anti-IDOR asset query
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
        .delete('/assets/10/metadata/author')
        .set('Authorization', `Bearer ${collaboratorToken}`);

      expect(res.status).toBe(403);
    });

    it('debe validar getTagsActorTenantId en tags.ts', () => {
      expect(getTagsActorTenantId({ user: { userId: 123 } } as any)).toBe(123);
      expect(getTagsActorTenantId({ user: { tenantId: 456, userId: 123 } } as any)).toBe(456);
      expect(() => getTagsActorTenantId({ user: {} } as any)).toThrow();
    });
  });

  describe('6. Rate Limiting — aclRateLimiter', () => {
    it('aclRateLimiter handler debe responder con 429 Too Many Requests al exceder el límite', async () => {
      const { aclRateLimiter } = await import('../../../server/src/middleware/rateLimiter');
      const appAclLimit = express();
      appAclLimit.use(aclRateLimiter);
      appAclLimit.get('/test-acl', (_req, res) => res.json({ ok: true }));

      for (let i = 0; i < 100; i++) {
        await supertest(appAclLimit).get('/test-acl');
      }
      const resBlocked = await supertest(appAclLimit).get('/test-acl');
      expect(resBlocked.status).toBe(429);
      expect(resBlocked.body.message).toMatch(/Límite de operaciones de control de acceso/);
    });
  });
});
