/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import supertest from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import assetsRouter, { checkAssetEmbargoAndExpiration } from '../../../server/src/routes/assets';
import * as db from '../../../server/src/db';
import { STORAGE_ROOT } from '../../../server/src/utils/storage';
import {
  updateAssetRightsSchema,
  LicenseTypeEnum,
} from '../../../server/src/schemas/assetRights.schema';

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

describe('DAM Rights, Licenses & Embargo Engine (FC 010)', () => {
  const testSandbox = path.join(STORAGE_ROOT, 'test_rights_sandbox');

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
    if (fs.existsSync(testSandbox)) {
      fs.rmSync(testSandbox, { recursive: true, force: true });
    }
  });

  describe('1. Zod Schema & Embargo Helper Unit Tests', () => {
    it('should validate all standard license types in LicenseTypeEnum', () => {
      const validLicenses = [
        'PROPRIETARY',
        'CC_BY',
        'CC_BY_SA',
        'CC_BY_NC',
        'PUBLIC_DOMAIN',
        'CUSTOM',
      ];
      for (const lic of validLicenses) {
        expect(LicenseTypeEnum.safeParse(lic).success).toBe(true);
      }
      expect(LicenseTypeEnum.safeParse('INVALID_LICENSE').success).toBe(false);
    });

    it('should parse valid updateAssetRightsSchema payloads', () => {
      const valid = {
        copyright_notice: '© 2026 Dreamtek Inc.',
        license_type: 'CC_BY',
        terms_of_use: 'Atribución requerida',
        expires_at: '2028-12-31T23:59:59.000Z',
        embargo_until: '2027-01-01T00:00:00.000Z',
      };
      const result = updateAssetRightsSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should reject invalid date strings or excessive copyright_notice length', () => {
      const invalidDate = {
        expires_at: 'not-a-date',
      };
      expect(updateAssetRightsSchema.safeParse(invalidDate).success).toBe(false);

      const tooLongNotice = {
        copyright_notice: 'a'.repeat(256),
      };
      expect(updateAssetRightsSchema.safeParse(tooLongNotice).success).toBe(false);
    });

    it('checkAssetEmbargoAndExpiration should allow ADMIN without restrictions', () => {
      const futureDate = new Date(Date.now() + 1000000);
      const res = checkAssetEmbargoAndExpiration({ embargo_until: futureDate }, 'ADMIN');
      expect(res.allowed).toBe(true);
    });

    it('checkAssetEmbargoAndExpiration should allow when rights object is null/undefined', () => {
      expect(checkAssetEmbargoAndExpiration(null, 'CLIENT').allowed).toBe(true);
      expect(checkAssetEmbargoAndExpiration(undefined, 'CLIENT').allowed).toBe(true);
    });

    it('checkAssetEmbargoAndExpiration should block non-admin when embargo_until is in the future', () => {
      const futureDate = new Date(Date.now() + 1000000);
      const res = checkAssetEmbargoAndExpiration({ embargo_until: futureDate }, 'CLIENT');
      expect(res.allowed).toBe(false);
      expect(res.reason).toContain('Activo bajo embargo hasta');
    });

    it('checkAssetEmbargoAndExpiration should allow non-admin when embargo_until is in the past', () => {
      const pastDate = new Date(Date.now() - 1000000);
      const res = checkAssetEmbargoAndExpiration({ embargo_until: pastDate }, 'CLIENT');
      expect(res.allowed).toBe(true);
    });

    it('checkAssetEmbargoAndExpiration should block non-admin when expires_at is in the past', () => {
      const pastDate = new Date(Date.now() - 1000000);
      const res = checkAssetEmbargoAndExpiration({ expires_at: pastDate }, 'CLIENT');
      expect(res.allowed).toBe(false);
      expect(res.reason).toContain('La licencia del activo ha expirado');
    });

    it('checkAssetEmbargoAndExpiration should allow non-admin when expires_at is in the future', () => {
      const futureDate = new Date(Date.now() + 1000000);
      const res = checkAssetEmbargoAndExpiration({ expires_at: futureDate }, 'CLIENT');
      expect(res.allowed).toBe(true);
    });
  });

  describe('2. GET /api/v1/assets/:id/rights', () => {
    it('should return 400 for invalid asset ID param', async () => {
      const res = await supertest(app)
        .get('/assets/invalid-id/rights')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('ID de activo inválido');
    });

    it('should return 401 when no token is supplied', async () => {
      const res = await supertest(app).get('/assets/1/rights');
      expect(res.status).toBe(401);
    });

    it('should return 404 when asset does not exist or is deleted', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .get('/assets/999/rights')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('Activo no encontrado');
    });

    it('should return 403 when ACL evaluation denies VIEW permission', async () => {
      // 1. Asset query
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 1,
          workspace_id: 1,
          collection_id: null,
          status: 'ACTIVE',
          deleted_at: null,
        },
      ]);
      // 2. Mock evaluateAclPermission denying VIEW
      const aclModule = await import('../../../server/src/utils/acl');
      vi.spyOn(aclModule, 'evaluateAclPermission').mockResolvedValueOnce({
        allowed: false,
        reason: 'DEFAULT_DENY',
      });

      const res = await supertest(app)
        .get('/assets/1/rights')
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Acceso denegado por política de control de acceso');
    });

    it('should return 200 with default rights when asset has no custom rights record', async () => {
      // 1. Asset query (ADMIN bypasses ACL)
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 1,
          workspace_id: 1,
          collection_id: null,
          status: 'ACTIVE',
          deleted_at: null,
        },
      ]);
      // 2. Rights query (empty)
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .get('/assets/1/rights')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.license_type).toBe('PROPRIETARY');
      expect(res.body.data.is_embargoed).toBe(false);
      expect(res.body.data.is_expired).toBe(false);
    });

    it('should return 200 with calculated embargo and expiration status', async () => {
      const futureEmbargo = new Date(Date.now() + 86400000).toISOString();
      const futureExpires = new Date(Date.now() + 172800000).toISOString();

      // 1. Asset query (ADMIN bypasses ACL)
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 1,
          workspace_id: 1,
          collection_id: null,
          status: 'ACTIVE',
          deleted_at: null,
        },
      ]);
      // 2. Rights query
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 10,
          tenant_id: 1,
          asset_id: 1,
          copyright_notice: '© 2026 Dreamtek',
          license_type: 'CC_BY_SA',
          terms_of_use: 'Atribución requerida',
          expires_at: futureExpires,
          embargo_until: futureEmbargo,
        },
      ]);

      const res = await supertest(app)
        .get('/assets/1/rights')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.license_type).toBe('CC_BY_SA');
      expect(res.body.data.is_embargoed).toBe(true);
      expect(res.body.data.is_expired).toBe(false);
    });

    it('should return 200 with is_expired: true when expires_at has passed', async () => {
      const pastExpires = new Date(Date.now() - 86400000).toISOString();

      // 1. Asset query (ADMIN bypasses ACL)
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 1,
          workspace_id: 1,
          collection_id: null,
          status: 'ACTIVE',
          deleted_at: null,
        },
      ]);
      // 2. Rights query
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 10,
          tenant_id: 1,
          asset_id: 1,
          copyright_notice: '© 2026 Dreamtek',
          license_type: 'CUSTOM',
          terms_of_use: 'Licencia temporal vencida',
          expires_at: pastExpires,
          embargo_until: null,
        },
      ]);

      const res = await supertest(app)
        .get('/assets/1/rights')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.is_expired).toBe(true);
      expect(res.body.data.is_embargoed).toBe(false);
    });

    it('should return 500 when database throws an error', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('DB Connection Failure'));

      const res = await supertest(app)
        .get('/assets/1/rights')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(500);
      expect(res.body.message).toContain('Error al obtener los derechos');
    });
  });

  describe('3. PUT /api/v1/assets/:id/rights', () => {
    it('should return 400 on invalid asset ID or invalid payload', async () => {
      const res1 = await supertest(app)
        .put('/assets/not-a-number/rights')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ license_type: 'PROPRIETARY' });

      expect(res1.status).toBe(400);

      const res2 = await supertest(app)
        .put('/assets/1/rights')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ license_type: 'INVALID_ENUM' });

      expect(res2.status).toBe(400);
    });

    it('should return 404 when target asset does not exist', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .put('/assets/999/rights')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ license_type: 'PUBLIC_DOMAIN' });

      expect(res.status).toBe(404);
    });

    it('should return 403 when user lacks EDIT permission on asset', async () => {
      // 1. Asset query
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 1,
          workspace_id: 1,
          collection_id: null,
          status: 'ACTIVE',
          deleted_at: null,
        },
      ]);
      // 2. ACL query (only VIEW, no EDIT for CLIENT)
      vi.mocked(db.query).mockResolvedValueOnce([
        { permission: 'VIEW', principal_type: 'ROLE', principal_id: 'CLIENT' },
      ]);

      const res = await supertest(app)
        .put('/assets/1/rights')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ license_type: 'CC_BY' });

      expect(res.status).toBe(403);
    });

    it('should return 200 and upsert rights successfully', async () => {
      const futureEmbargo = new Date(Date.now() + 86400000).toISOString();
      const futureExpires = new Date(Date.now() + 172800000).toISOString();

      // 1. Asset query (ADMIN bypasses ACL)
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 1,
          workspace_id: 1,
          collection_id: null,
          status: 'ACTIVE',
          deleted_at: null,
        },
      ]);
      // 2. Upsert query
      vi.mocked(db.query).mockResolvedValueOnce([{ affectedRows: 1 }] as any);

      const res = await supertest(app)
        .put('/assets/1/rights')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          copyright_notice: '© 2026 Dreamtek Inc.',
          license_type: 'CC_BY_NC',
          terms_of_use: 'No comercial',
          expires_at: futureExpires,
          embargo_until: futureEmbargo,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.license_type).toBe('CC_BY_NC');
      expect(res.body.data.is_embargoed).toBe(true);
      expect(res.body.data.is_expired).toBe(false);
    });

    it('should return 200 with null dates and default proprietary license', async () => {
      // 1. Asset query (ADMIN bypasses ACL)
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 1,
          workspace_id: 1,
          collection_id: null,
          status: 'ACTIVE',
          deleted_at: null,
        },
      ]);
      // 2. Upsert query
      vi.mocked(db.query).mockResolvedValueOnce([{ affectedRows: 1 }] as any);

      const res = await supertest(app)
        .put('/assets/1/rights')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          copyright_notice: null,
          terms_of_use: null,
          expires_at: null,
          embargo_until: null,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.license_type).toBe('PROPRIETARY');
      expect(res.body.data.is_embargoed).toBe(false);
      expect(res.body.data.is_expired).toBe(false);
    });

    it('should return 500 when database throws during update', async () => {
      // 1. Asset query (ADMIN bypasses ACL)
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 1,
          workspace_id: 1,
          collection_id: null,
          status: 'ACTIVE',
          deleted_at: null,
        },
      ]);
      // 2. Upsert query fails
      vi.mocked(db.query).mockRejectedValueOnce(new Error('Write Failure'));

      const res = await supertest(app)
        .put('/assets/1/rights')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ license_type: 'PROPRIETARY' });

      expect(res.status).toBe(500);
      expect(res.body.message).toContain('Error al actualizar los derechos');
    });
  });

  describe('4. Embargo & Expiration Enforcement on Delivery Endpoints', () => {
    const dummyFilePath = path.join(testSandbox, 'stream_test.png');

    beforeEach(() => {
      fs.writeFileSync(dummyFilePath, 'dummy-content');
    });

    it('GET /assets/:id/stream should block non-admin when asset is under active embargo', async () => {
      const futureEmbargo = new Date(Date.now() + 86400000).toISOString();

      // Asset query with embargo
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          mime_type: 'image/png',
          title: 'embargoed.png',
          file_path: dummyFilePath,
          byte_size: 13,
          workspace_id: 1,
          collection_id: null,
          status: 'ACTIVE',
          deleted_at: null,
          embargo_until: futureEmbargo,
          expires_at: null,
        },
      ]);
      // ACL DOWNLOAD query (granted on ASSET 1 for CLIENT)
      vi.mocked(db.query).mockResolvedValueOnce([
        { resource_type: 'ASSET', resource_id: 1, permission: 'DOWNLOAD', granted_by: 'ADMIN' },
      ]);

      const res = await supertest(app)
        .get('/assets/1/stream')
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Activo bajo embargo hasta');
    });

    it('GET /assets/:id/stream should allow ADMIN even when asset is under active embargo', async () => {
      const futureEmbargo = new Date(Date.now() + 86400000).toISOString();

      vi.mocked(db.query).mockResolvedValueOnce([
        {
          mime_type: 'image/png',
          title: 'embargoed.png',
          file_path: dummyFilePath,
          byte_size: 13,
          workspace_id: 1,
          collection_id: null,
          status: 'ACTIVE',
          deleted_at: null,
          embargo_until: futureEmbargo,
          expires_at: null,
        },
      ]);

      const res = await supertest(app)
        .get('/assets/1/stream')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('image/png');
    });

    it('GET /assets/:id/stream should block non-admin when license has expired', async () => {
      const pastExpires = new Date(Date.now() - 86400000).toISOString();

      vi.mocked(db.query).mockResolvedValueOnce([
        {
          mime_type: 'image/png',
          title: 'expired.png',
          file_path: dummyFilePath,
          byte_size: 13,
          workspace_id: 1,
          collection_id: null,
          status: 'ACTIVE',
          deleted_at: null,
          embargo_until: null,
          expires_at: pastExpires,
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([
        { resource_type: 'ASSET', resource_id: 1, permission: 'DOWNLOAD', granted_by: 'ADMIN' },
      ]);

      const res = await supertest(app)
        .get('/assets/1/stream')
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('La licencia del activo ha expirado');
    });

    it('GET /assets/:id/thumbnail should block non-admin when derivative thumbnail is under embargo', async () => {
      const futureEmbargo = new Date(Date.now() + 86400000).toISOString();

      vi.mocked(db.query).mockResolvedValueOnce([
        {
          file_path: dummyFilePath,
          byte_size: 13,
          workspace_id: 1,
          collection_id: null,
          status: 'ACTIVE',
          deleted_at: null,
          embargo_until: futureEmbargo,
          expires_at: null,
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([
        { resource_type: 'ASSET', resource_id: 1, permission: 'VIEW', granted_by: 'ADMIN' },
      ]);

      const res = await supertest(app)
        .get('/assets/1/thumbnail')
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Activo bajo embargo hasta');
    });

    it('GET /assets/:id/thumbnail should block non-admin on fallback when original is under embargo', async () => {
      const futureEmbargo = new Date(Date.now() + 86400000).toISOString();

      // Derivative query returns empty
      vi.mocked(db.query).mockResolvedValueOnce([]);
      // Fallback query returns original with embargo
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          mime_type: 'image/png',
          file_path: dummyFilePath,
          byte_size: 13,
          workspace_id: 1,
          collection_id: null,
          status: 'ACTIVE',
          deleted_at: null,
          embargo_until: futureEmbargo,
          expires_at: null,
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([
        { resource_type: 'ASSET', resource_id: 1, permission: 'VIEW', granted_by: 'ADMIN' },
      ]);

      const res = await supertest(app)
        .get('/assets/1/thumbnail')
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Activo bajo embargo');
    });

    it('GET /assets/:id/versions/:versionNumber/stream should block non-admin under embargo', async () => {
      const futureEmbargo = new Date(Date.now() + 86400000).toISOString();

      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 1,
          workspace_id: 1,
          collection_id: null,
          title: 'version.png',
          mime_type: 'image/png',
          status: 'ACTIVE',
          deleted_at: null,
          embargo_until: futureEmbargo,
          expires_at: null,
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([
        { resource_type: 'ASSET', resource_id: 1, permission: 'DOWNLOAD', granted_by: 'ADMIN' },
      ]);

      const res = await supertest(app)
        .get('/assets/1/versions/1/stream')
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Activo bajo embargo');
    });

    it('GET /assets/:id/versions/:versionNumber/thumbnail should block non-admin under embargo', async () => {
      const futureEmbargo = new Date(Date.now() + 86400000).toISOString();

      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 1,
          workspace_id: 1,
          collection_id: null,
          status: 'ACTIVE',
          deleted_at: null,
          embargo_until: futureEmbargo,
          expires_at: null,
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([
        { resource_type: 'ASSET', resource_id: 1, permission: 'VIEW', granted_by: 'ADMIN' },
      ]);

      const res = await supertest(app)
        .get('/assets/1/versions/1/thumbnail')
        .set('Authorization', `Bearer ${clientToken}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Activo bajo embargo');
    });

    it('POST /assets/batch/download should filter out embargoed and expired assets for non-admin', async () => {
      const futureEmbargo = new Date(Date.now() + 86400000).toISOString();

      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 10,
          tenant_id: 1,
          workspace_id: 1,
          collection_id: null,
          title: 'embargoed.png',
          mime_type: 'image/png',
          status: 'ACTIVE',
          deleted_at: null,
          file_path: dummyFilePath,
          sha256_hash: 'hash10',
          byte_size: 13,
          embargo_until: futureEmbargo,
          expires_at: null,
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([
        { permission: 'DOWNLOAD', principal_type: 'ROLE', principal_id: 'CLIENT' },
      ]);

      const res = await supertest(app)
        .post('/assets/batch/download')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ asset_ids: [10] });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Acceso denegado por política de control de acceso (ACL)');
    });

    it('POST /assets/batch/download should allow embargoed assets for ADMIN role', async () => {
      const futureEmbargo = new Date(Date.now() + 86400000).toISOString();

      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 10,
          tenant_id: 1,
          workspace_id: 1,
          collection_id: null,
          title: 'embargoed.png',
          mime_type: 'image/png',
          status: 'ACTIVE',
          deleted_at: null,
          file_path: dummyFilePath,
          sha256_hash: 'hash10',
          byte_size: 13,
          embargo_until: futureEmbargo,
          expires_at: null,
        },
      ]);

      const res = await supertest(app)
        .post('/assets/batch/download')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ asset_ids: [10] });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/zip');
    });

    it('GET /assets/:id/rights should handle null fields in asset_rights record', async () => {
      // 1. Asset query
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 1,
          workspace_id: 1,
          collection_id: null,
          status: 'ACTIVE',
          deleted_at: null,
        },
      ]);
      // 2. Rights query with null fields
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 10,
          tenant_id: 1,
          asset_id: 1,
          copyright_notice: null,
          license_type: 'PROPRIETARY',
          terms_of_use: null,
          expires_at: null,
          embargo_until: null,
        },
      ]);

      const res = await supertest(app)
        .get('/assets/1/rights')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.copyright_notice).toBeNull();
      expect(res.body.data.terms_of_use).toBeNull();
      expect(res.body.data.expires_at).toBeNull();
      expect(res.body.data.embargo_until).toBeNull();
    });

    it('PUT /assets/:id/rights should return is_expired: true when setting past expires_at', async () => {
      const pastExpires = new Date(Date.now() - 86400000).toISOString();

      // 1. Asset query
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 1,
          workspace_id: 1,
          collection_id: null,
          status: 'ACTIVE',
          deleted_at: null,
        },
      ]);
      // 2. Upsert query
      vi.mocked(db.query).mockResolvedValueOnce([{ affectedRows: 1 }] as any);

      const res = await supertest(app)
        .put('/assets/1/rights')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          expires_at: pastExpires,
          license_type: 'PROPRIETARY',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.is_expired).toBe(true);
    });
  });

  describe('5. Rate Limiter 429 Handlers', () => {
    it('triggers rightsRateLimiter 429 response handler', async () => {
      const appRightsLimit = express();
      const { rightsRateLimiter: limiter } =
        await import('../../../server/src/middleware/rateLimiter');
      appRightsLimit.use(limiter);
      appRightsLimit.get('/test-rights', (_req, res) => res.json({ ok: true }));

      for (let i = 0; i < 100; i++) {
        await supertest(appRightsLimit).get('/test-rights');
      }
      const resBlocked = await supertest(appRightsLimit).get('/test-rights');
      expect(resBlocked.status).toBe(429);
      expect(resBlocked.body.message).toMatch(/Límite de operaciones de derechos y licencias/);
    });
  });
});
