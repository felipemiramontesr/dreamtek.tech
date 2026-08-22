/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import supertest from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import path from 'path';
import { STORAGE_ROOT } from '../../../server/src/utils/storage';
import * as db from '../../../server/src/db';
import app from '../../../server/src/index';
import {
  archiveProviderEnum,
  restorationTierEnum,
  restorationStatusEnum,
  archiveAssetBodySchema,
  restoreAssetBodySchema,
} from '../../../server/src/schemas/assetArchival.schema';
import {
  archiveAsset,
  requestAssetRestoration,
  getArchivalStatus,
} from '../../../server/src/utils/archivalEngine';
import { archivalRateLimiter } from '../../../server/src/middleware/rateLimiter';

vi.mock('../../../server/src/db', () => ({
  query: vi.fn(),
  pool: {
    execute: vi.fn(),
    getConnection: vi.fn(),
  },
}));

vi.mock('../../../server/src/utils/webhookDispatcher', () => ({
  dispatchWebhookEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../server/src/utils/acl', () => ({
  evaluateAclPermission: vi.fn().mockResolvedValue({ allowed: true }),
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

describe('DAM Cloud Cold-Storage Archival & Glacier Sync (FC 014)', () => {
  const adminToken = makeToken({ userId: 1, role: 'ADMIN', tenantId: 100 });
  const clientToken = makeToken({ userId: 2, role: 'CLIENT', tenantId: 100 });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.pool.execute).mockResolvedValue([{ affectedRows: 1 }] as any);
  });

  describe('1. Zod Schemas Validation Tests', () => {
    it('validates archiveProviderEnum and restorationEnums', () => {
      expect(archiveProviderEnum.safeParse('AWS_GLACIER').success).toBe(true);
      expect(archiveProviderEnum.safeParse('CUSTOM_OBJECT_STORAGE').success).toBe(true);
      expect(archiveProviderEnum.safeParse('INVALID_PROVIDER').success).toBe(false);

      expect(restorationTierEnum.safeParse('EXPEDITED').success).toBe(true);
      expect(restorationTierEnum.safeParse('STANDARD').success).toBe(true);
      expect(restorationTierEnum.safeParse('BULK').success).toBe(true);
      expect(restorationTierEnum.safeParse('FAST').success).toBe(false);

      expect(restorationStatusEnum.safeParse('NONE').success).toBe(true);
      expect(restorationStatusEnum.safeParse('REQUESTED').success).toBe(true);
      expect(restorationStatusEnum.safeParse('IN_PROGRESS').success).toBe(true);
      expect(restorationStatusEnum.safeParse('RESTORED').success).toBe(true);
      expect(restorationStatusEnum.safeParse('EXPIRED').success).toBe(true);
      expect(restorationStatusEnum.safeParse('UNKNOWN').success).toBe(false);
    });

    it('validates archiveAssetBodySchema', () => {
      expect(archiveAssetBodySchema.safeParse({}).success).toBe(true);
      expect(archiveAssetBodySchema.safeParse({ archive_provider: 'AWS_GLACIER' }).success).toBe(
        true,
      );
      expect(archiveAssetBodySchema.safeParse({ reason: 'Legal hold preservation' }).success).toBe(
        true,
      );
      expect(archiveAssetBodySchema.safeParse({ reason: 'a'.repeat(600) }).success).toBe(false);
    });

    it('validates restoreAssetBodySchema', () => {
      expect(restoreAssetBodySchema.safeParse({}).success).toBe(true);
      expect(
        restoreAssetBodySchema.safeParse({ restoration_tier: 'EXPEDITED', days_valid: 14 }).success,
      ).toBe(true);
      expect(restoreAssetBodySchema.safeParse({ days_valid: 0 }).success).toBe(false);
      expect(restoreAssetBodySchema.safeParse({ days_valid: 35 }).success).toBe(false);
      expect(restoreAssetBodySchema.safeParse({ days_valid: 1.5 }).success).toBe(false);
    });
  });

  describe('2. Archival Engine Unit Tests (archivalEngine.ts)', () => {
    it('archiveAsset succeeds and updates storage_tier to ARCHIVED', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 10,
          storage_tier: 'HOT',
          status: 'ACTIVE',
          version_id: 1,
          sha256_hash: 'hash123',
          byte_size: 50000,
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([{ affectedRows: 1 }] as any);
      vi.mocked(db.query).mockResolvedValueOnce([{ insertId: 100 }] as any);

      const result = await archiveAsset(100, 10, 1, { archive_provider: 'AWS_GLACIER' });
      expect(result.success).toBe(true);
      expect(result.storage_tier).toBe('ARCHIVED');
      expect(result.archive_key).toBe('glacier/100/10/hash123');
      expect(result.byte_size).toBe(50000);
    });

    it('archiveAsset fails when asset does not exist or is inactive', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const result = await archiveAsset(100, 999, 1);
      expect(result.success).toBe(false);
      expect(result.error).toContain('no existe o no se encuentra activo');
    });

    it('archiveAsset fails when asset is already ARCHIVED', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 10,
          storage_tier: 'ARCHIVED',
          status: 'ACTIVE',
          version_id: 1,
          sha256_hash: 'hash123',
          byte_size: 50000,
        },
      ]);

      const result = await archiveAsset(100, 10, 1);
      expect(result.success).toBe(false);
      expect(result.error).toContain('ya se encuentra archivado');
    });

    it('requestAssetRestoration succeeds with EXPEDITED tier', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 10, storage_tier: 'ARCHIVED', status: 'ACTIVE' },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 5, restoration_status: 'NONE', restoration_expires_at: null },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([{ affectedRows: 1 }] as any);

      const result = await requestAssetRestoration(100, 10, 1, {
        restoration_tier: 'EXPEDITED',
        days_valid: 7,
      });

      expect(result.success).toBe(true);
      expect(result.restoration_status).toBe('RESTORED');
      expect(result.restoration_tier).toBe('EXPEDITED');
    });

    it('requestAssetRestoration succeeds with STANDARD tier', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 10, storage_tier: 'ARCHIVED', status: 'ACTIVE' },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 5, restoration_status: 'NONE', restoration_expires_at: null },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([{ affectedRows: 1 }] as any);

      const result = await requestAssetRestoration(100, 10, 1, {
        restoration_tier: 'STANDARD',
        days_valid: 7,
      });

      expect(result.success).toBe(true);
      expect(result.restoration_status).toBe('IN_PROGRESS');
      expect(result.restoration_tier).toBe('STANDARD');
    });

    it('requestAssetRestoration fails when asset does not exist', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const result = await requestAssetRestoration(100, 999, 1, {
        restoration_tier: 'STANDARD',
        days_valid: 7,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('no existe o no se encuentra activo');
    });

    it('requestAssetRestoration fails when asset is in HOT storage tier', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 10, storage_tier: 'HOT', status: 'ACTIVE' },
      ]);

      const result = await requestAssetRestoration(100, 10, 1, {
        restoration_tier: 'STANDARD',
        days_valid: 7,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('nivel de almacenamiento caliente (HOT)');
    });

    it('requestAssetRestoration fails when no archival record is found', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 10, storage_tier: 'ARCHIVED', status: 'ACTIVE' },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const result = await requestAssetRestoration(100, 10, 1, {
        restoration_tier: 'STANDARD',
        days_valid: 7,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('No se encontró un registro de archivo en frío');
    });

    it('getArchivalStatus returns null if asset does not exist', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);
      const status = await getArchivalStatus(100, 999);
      expect(status).toBeNull();
    });

    it('getArchivalStatus returns default HOT status when no archival record exists', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 10, storage_tier: 'HOT', archived_at: null },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const status = await getArchivalStatus(100, 10);
      expect(status).not.toBeNull();
      expect(status?.storage_tier).toBe('HOT');
      expect(status?.is_restored).toBe(true);
      expect(status?.restoration_status).toBe('NONE');
    });

    it('getArchivalStatus returns ARCHIVED status and calculates is_restored', async () => {
      const futureDate = new Date(Date.now() + 86400000).toISOString();
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 10, storage_tier: 'ARCHIVED', archived_at: '2026-08-20' },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 5,
          storage_tier: 'ARCHIVED',
          archive_provider: 'AWS_GLACIER',
          archive_key: 'glacier/100/10/hash123',
          byte_size: 1024,
          restoration_status: 'RESTORED',
          restoration_tier: 'EXPEDITED',
          restoration_requested_at: '2026-08-21',
          restoration_completed_at: '2026-08-21',
          restoration_expires_at: futureDate,
        },
      ]);

      const status = await getArchivalStatus(100, 10);
      expect(status).not.toBeNull();
      expect(status?.storage_tier).toBe('ARCHIVED');
      expect(status?.is_restored).toBe(true);
      expect(status?.restoration_status).toBe('RESTORED');
    });

    it('getArchivalStatus returns is_restored: true when restoration_expires_at is null', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 10, storage_tier: 'ARCHIVED', archived_at: '2026-08-20' },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 5,
          storage_tier: 'ARCHIVED',
          archive_provider: 'AWS_GLACIER',
          archive_key: 'glacier/100/10/hash123',
          byte_size: 1024,
          restoration_status: 'RESTORED',
          restoration_tier: 'EXPEDITED',
          restoration_requested_at: '2026-08-21',
          restoration_completed_at: '2026-08-21',
          restoration_expires_at: null,
        },
      ]);

      const status = await getArchivalStatus(100, 10);
      expect(status).not.toBeNull();
      expect(status?.is_restored).toBe(true);
    });

    it('getArchivalStatus returns is_restored: false when restoration is expired or not RESTORED', async () => {
      const pastDate = new Date(Date.now() - 86400000).toISOString();
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 10, storage_tier: 'ARCHIVED', archived_at: '2026-08-20' },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 5,
          storage_tier: 'ARCHIVED',
          archive_provider: 'AWS_GLACIER',
          archive_key: 'glacier/100/10/hash123',
          byte_size: 1024,
          restoration_status: 'RESTORED',
          restoration_tier: 'EXPEDITED',
          restoration_requested_at: '2026-08-21',
          restoration_completed_at: '2026-08-21',
          restoration_expires_at: pastDate,
        },
      ]);

      const status = await getArchivalStatus(100, 10);
      expect(status).not.toBeNull();
      expect(status?.is_restored).toBe(false);
    });
  });

  describe('3. Archival Routes Integration Tests (assets.ts)', () => {
    it('POST /api/v1/assets/:id/archive rejects with 400 when ID is invalid', async () => {
      const res = await supertest(app)
        .post('/api/v1/assets/invalid-id/archive')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('ID de activo inválido');
    });

    it('POST /api/v1/assets/:id/archive rejects with 403 when ACL MANAGE is denied', async () => {
      const aclModule = await import('../../../server/src/utils/acl');
      vi.mocked(aclModule.evaluateAclPermission).mockResolvedValueOnce({
        allowed: false,
        reason: 'DEFAULT_DENY',
      });

      const res = await supertest(app)
        .post('/api/v1/assets/10/archive')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ archive_provider: 'AWS_GLACIER' });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Acceso denegado por política de control de acceso');
    });

    it('POST /api/v1/assets/:id/archive returns 400 when archival fails in engine', async () => {
      const aclModule = await import('../../../server/src/utils/acl');
      vi.mocked(aclModule.evaluateAclPermission).mockResolvedValueOnce({
        allowed: true,
        reason: 'ADMIN_BYPASS',
      });
      vi.mocked(db.query).mockResolvedValueOnce([]); // asset not found

      const res = await supertest(app)
        .post('/api/v1/assets/10/archive')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ archive_provider: 'AWS_GLACIER' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('no existe o no se encuentra activo');
    });

    it('POST /api/v1/assets/:id/archive succeeds with 200 and dispatches webhook', async () => {
      const aclModule = await import('../../../server/src/utils/acl');
      vi.mocked(aclModule.evaluateAclPermission).mockResolvedValueOnce({
        allowed: true,
        reason: 'ADMIN_BYPASS',
      });

      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 10,
          storage_tier: 'HOT',
          status: 'ACTIVE',
          version_id: 1,
          sha256_hash: 'hash123',
          byte_size: 50000,
        },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([{ affectedRows: 1 }] as any);
      vi.mocked(db.query).mockResolvedValueOnce([{ insertId: 100 }] as any);

      const res = await supertest(app)
        .post('/api/v1/assets/10/archive')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ archive_provider: 'AWS_GLACIER', reason: 'Archival test' });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('archivado exitosamente');
      expect(res.body.data.storage_tier).toBe('ARCHIVED');
    });

    it('POST /api/v1/assets/:id/archive returns 500 on unexpected exception', async () => {
      const aclModule = await import('../../../server/src/utils/acl');
      vi.mocked(aclModule.evaluateAclPermission).mockRejectedValueOnce(new Error('ACL Error'));

      const res = await supertest(app)
        .post('/api/v1/assets/10/archive')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Internal Server Error');
    });

    it('POST /api/v1/assets/:id/restore rejects with 400 when ID is invalid', async () => {
      const res = await supertest(app)
        .post('/api/v1/assets/invalid-id/restore')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('POST /api/v1/assets/:id/restore rejects with 403 when ACL EDIT is denied', async () => {
      const aclModule = await import('../../../server/src/utils/acl');
      vi.mocked(aclModule.evaluateAclPermission).mockResolvedValueOnce({
        allowed: false,
        reason: 'DEFAULT_DENY',
      });

      const res = await supertest(app)
        .post('/api/v1/assets/10/restore')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ restoration_tier: 'STANDARD' });

      expect(res.status).toBe(403);
    });

    it('POST /api/v1/assets/:id/restore returns 400 when restoration fails in engine', async () => {
      const aclModule = await import('../../../server/src/utils/acl');
      vi.mocked(aclModule.evaluateAclPermission).mockResolvedValueOnce({
        allowed: true,
        reason: 'ADMIN_BYPASS',
      });
      vi.mocked(db.query).mockResolvedValueOnce([]); // asset not found

      const res = await supertest(app)
        .post('/api/v1/assets/10/restore')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ restoration_tier: 'STANDARD' });

      expect(res.status).toBe(400);
    });

    it('POST /api/v1/assets/:id/restore succeeds with 200', async () => {
      const aclModule = await import('../../../server/src/utils/acl');
      vi.mocked(aclModule.evaluateAclPermission).mockResolvedValueOnce({
        allowed: true,
        reason: 'ADMIN_BYPASS',
      });

      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 10, storage_tier: 'ARCHIVED', status: 'ACTIVE' },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 5, restoration_status: 'NONE', restoration_expires_at: null },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([{ affectedRows: 1 }] as any);

      const res = await supertest(app)
        .post('/api/v1/assets/10/restore')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ restoration_tier: 'EXPEDITED', days_valid: 7 });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('Solicitud de restauración de activo iniciada');
      expect(res.body.data.restoration_status).toBe('RESTORED');
    });

    it('POST /api/v1/assets/:id/restore returns 500 on unexpected exception', async () => {
      const aclModule = await import('../../../server/src/utils/acl');
      vi.mocked(aclModule.evaluateAclPermission).mockRejectedValueOnce(new Error('DB Error'));

      const res = await supertest(app)
        .post('/api/v1/assets/10/restore')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(500);
    });

    it('GET /api/v1/assets/:id/archival-status rejects with 400 on invalid ID', async () => {
      const res = await supertest(app)
        .get('/api/v1/assets/invalid-id/archival-status')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
    });

    it('GET /api/v1/assets/:id/archival-status rejects with 403 when ACL VIEW is denied', async () => {
      const aclModule = await import('../../../server/src/utils/acl');
      vi.mocked(aclModule.evaluateAclPermission).mockResolvedValueOnce({
        allowed: false,
        reason: 'DEFAULT_DENY',
      });

      const res = await supertest(app)
        .get('/api/v1/assets/10/archival-status')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(403);
    });

    it('GET /api/v1/assets/:id/archival-status returns 404 when asset not found', async () => {
      const aclModule = await import('../../../server/src/utils/acl');
      vi.mocked(aclModule.evaluateAclPermission).mockResolvedValueOnce({
        allowed: true,
        reason: 'ADMIN_BYPASS',
      });
      vi.mocked(db.query).mockResolvedValueOnce([]); // not found

      const res = await supertest(app)
        .get('/api/v1/assets/999/archival-status')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });

    it('GET /api/v1/assets/:id/archival-status succeeds with 200', async () => {
      const aclModule = await import('../../../server/src/utils/acl');
      vi.mocked(aclModule.evaluateAclPermission).mockResolvedValueOnce({
        allowed: true,
        reason: 'ADMIN_BYPASS',
      });

      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 10, storage_tier: 'HOT', archived_at: null },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .get('/api/v1/assets/10/archival-status')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.storage_tier).toBe('HOT');
      expect(res.body.data.is_restored).toBe(true);
    });

    it('GET /api/v1/assets/:id/archival-status returns 500 on unexpected exception', async () => {
      const aclModule = await import('../../../server/src/utils/acl');
      vi.mocked(aclModule.evaluateAclPermission).mockRejectedValueOnce(new Error('ACL Error'));

      const res = await supertest(app)
        .get('/api/v1/assets/10/archival-status')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(500);
    });
  });

  describe('4. Tier Enforcement & Streaming Defense Tests', () => {
    it('GET /api/v1/assets/:id/stream blocks with 409 Conflict when asset is ARCHIVED and not restored', async () => {
      const aclModule = await import('../../../server/src/utils/acl');
      vi.mocked(aclModule.evaluateAclPermission).mockResolvedValueOnce({
        allowed: true,
        reason: 'ADMIN_BYPASS',
      });

      // 1. Query asset metadata in stream route
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          mime_type: 'image/png',
          title: 'Archived.png',
          workspace_id: 1,
          collection_id: 1,
          status: 'ACTIVE',
          deleted_at: null,
          storage_tier: 'ARCHIVED',
          file_path: path.join(STORAGE_ROOT, 'fake_archived_stream.png'),
          byte_size: 1000,
          embargo_until: null,
          expires_at: null,
        },
      ]);

      // 2. getArchivalStatus query 1 (asset)
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 10, storage_tier: 'ARCHIVED', archived_at: '2026-08-20' },
      ]);
      // 3. getArchivalStatus query 2 (record) -> restoration_status: NONE
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 5,
          storage_tier: 'ARCHIVED',
          archive_provider: 'AWS_GLACIER',
          archive_key: 'glacier/100/10/hash123',
          byte_size: 1000,
          restoration_status: 'NONE',
          restoration_expires_at: null,
        },
      ]);

      const res = await supertest(app)
        .get('/api/v1/assets/10/stream')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(409);
      expect(res.body.message).toContain('archivado en almacenamiento frío (Glacier)');
      expect(res.body.data.storage_tier).toBe('ARCHIVED');
    });

    it('GET /api/v1/assets/:id/thumbnail blocks with 409 Conflict when asset is ARCHIVED and not restored', async () => {
      const aclModule = await import('../../../server/src/utils/acl');
      vi.mocked(aclModule.evaluateAclPermission).mockResolvedValueOnce({
        allowed: true,
        reason: 'ADMIN_BYPASS',
      });

      // 1. Query thumbnail derivative
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          file_path: path.join(STORAGE_ROOT, 'fake_archived_thumb.webp'),
          byte_size: 200,
          workspace_id: 1,
          collection_id: 1,
          status: 'ACTIVE',
          deleted_at: null,
          storage_tier: 'ARCHIVED',
          embargo_until: null,
          expires_at: null,
        },
      ]);

      // 2. getArchivalStatus asset query
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 10, storage_tier: 'ARCHIVED', archived_at: '2026-08-20' },
      ]);
      // 3. getArchivalStatus record query
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 5,
          storage_tier: 'ARCHIVED',
          archive_provider: 'AWS_GLACIER',
          archive_key: 'glacier/100/10/hash123',
          byte_size: 200,
          restoration_status: 'IN_PROGRESS',
          restoration_expires_at: null,
        },
      ]);

      const res = await supertest(app)
        .get('/api/v1/assets/10/thumbnail')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(409);
      expect(res.body.message).toContain('archivado en almacenamiento frío (Glacier)');
    });

    it('GET /api/v1/assets/:id/versions/:versionNumber/stream blocks with 409 Conflict when asset is ARCHIVED and not restored', async () => {
      const aclModule = await import('../../../server/src/utils/acl');
      vi.mocked(aclModule.evaluateAclPermission).mockResolvedValueOnce({
        allowed: true,
        reason: 'ADMIN_BYPASS',
      });

      // 1. Query parent asset
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 10,
          tenant_id: 100,
          workspace_id: 1,
          collection_id: 1,
          title: 'VersionArchived.png',
          mime_type: 'image/png',
          status: 'ACTIVE',
          deleted_at: null,
          storage_tier: 'ARCHIVED',
          embargo_until: null,
          expires_at: null,
        },
      ]);

      // 2. getArchivalStatus queries
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 10, storage_tier: 'ARCHIVED', archived_at: '2026-08-20' },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 5,
          storage_tier: 'ARCHIVED',
          restoration_status: 'NONE',
        },
      ]);

      const res = await supertest(app)
        .get('/api/v1/assets/10/versions/1/stream')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(409);
      expect(res.body.message).toContain('archivado en almacenamiento frío');
    });

    it('GET /api/v1/assets/:id/versions/:versionNumber/thumbnail blocks with 409 Conflict when asset is ARCHIVED and not restored', async () => {
      const aclModule = await import('../../../server/src/utils/acl');
      vi.mocked(aclModule.evaluateAclPermission).mockResolvedValueOnce({
        allowed: true,
        reason: 'ADMIN_BYPASS',
      });

      // 1. Query parent asset
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 10,
          tenant_id: 100,
          workspace_id: 1,
          collection_id: 1,
          status: 'ACTIVE',
          deleted_at: null,
          storage_tier: 'ARCHIVED',
          embargo_until: null,
          expires_at: null,
        },
      ]);

      // 2. getArchivalStatus queries
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 10, storage_tier: 'ARCHIVED', archived_at: '2026-08-20' },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 5,
          storage_tier: 'ARCHIVED',
          restoration_status: 'NONE',
        },
      ]);

      const res = await supertest(app)
        .get('/api/v1/assets/10/versions/1/thumbnail')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(409);
    });

    it('GET /api/v1/assets/:id/stream proceeds when ARCHIVED asset is restored', async () => {
      const aclModule = await import('../../../server/src/utils/acl');
      vi.mocked(aclModule.evaluateAclPermission).mockResolvedValueOnce({
        allowed: true,
        reason: 'ADMIN_BYPASS',
      });

      // 1. Query asset
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          mime_type: 'image/png',
          title: 'ArchivedRestored.png',
          workspace_id: 1,
          collection_id: 1,
          status: 'ACTIVE',
          deleted_at: null,
          storage_tier: 'ARCHIVED',
          file_path: path.join(STORAGE_ROOT, 'fake_archived_nonexistent.png'),
          byte_size: 1000,
          embargo_until: null,
          expires_at: null,
        },
      ]);
      // 2. getArchivalStatus query 1 (asset)
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 10, storage_tier: 'ARCHIVED', archived_at: '2026-08-20' },
      ]);
      // 3. getArchivalStatus query 2 (record) -> restoration_status: RESTORED
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 5,
          storage_tier: 'ARCHIVED',
          archive_provider: 'AWS_GLACIER',
          archive_key: 'glacier/100/10/hash123',
          byte_size: 1000,
          restoration_status: 'RESTORED',
          restoration_expires_at: new Date(Date.now() + 86400000).toISOString(),
        },
      ]);

      const res = await supertest(app)
        .get('/api/v1/assets/10/stream')
        .set('Authorization', `Bearer ${adminToken}`);

      // Physical file does not exist on test runner, so 404 is reached after passing 409 check
      expect(res.status).toBe(404);
      expect(res.body.message).toContain('Archivo físico no encontrado');
    });

    it('GET /api/v1/assets/:id/thumbnail proceeds when ARCHIVED asset is restored', async () => {
      const aclModule = await import('../../../server/src/utils/acl');
      vi.mocked(aclModule.evaluateAclPermission).mockResolvedValueOnce({
        allowed: true,
        reason: 'ADMIN_BYPASS',
      });

      // 1. Query thumbnail derivative
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          file_path: path.join(STORAGE_ROOT, 'fake_archived_thumb.webp'),
          byte_size: 200,
          workspace_id: 1,
          collection_id: 1,
          status: 'ACTIVE',
          deleted_at: null,
          storage_tier: 'ARCHIVED',
          embargo_until: null,
          expires_at: null,
        },
      ]);
      // 2. getArchivalStatus queries
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 10, storage_tier: 'ARCHIVED', archived_at: '2026-08-20' },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 5,
          storage_tier: 'ARCHIVED',
          restoration_status: 'RESTORED',
          restoration_expires_at: new Date(Date.now() + 86400000).toISOString(),
        },
      ]);

      const res = await supertest(app)
        .get('/api/v1/assets/10/thumbnail')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });

    it('GET /api/v1/assets/:id/versions/:versionNumber/stream proceeds when ARCHIVED version asset is restored', async () => {
      const aclModule = await import('../../../server/src/utils/acl');
      vi.mocked(aclModule.evaluateAclPermission).mockResolvedValueOnce({
        allowed: true,
        reason: 'ADMIN_BYPASS',
      });

      // 1. Query parent asset
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 10,
          tenant_id: 100,
          workspace_id: 1,
          collection_id: 1,
          title: 'VersionArchived.png',
          mime_type: 'image/png',
          status: 'ACTIVE',
          deleted_at: null,
          storage_tier: 'ARCHIVED',
          embargo_until: null,
          expires_at: null,
        },
      ]);
      // 2. getArchivalStatus queries
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 10, storage_tier: 'ARCHIVED', archived_at: '2026-08-20' },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 5,
          storage_tier: 'ARCHIVED',
          restoration_status: 'RESTORED',
          restoration_expires_at: new Date(Date.now() + 86400000).toISOString(),
        },
      ]);
      // 3. Query version
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .get('/api/v1/assets/10/versions/1/stream')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('Versión de activo no encontrada');
    });

    it('GET /api/v1/assets/:id/versions/:versionNumber/thumbnail proceeds when ARCHIVED version asset is restored', async () => {
      const aclModule = await import('../../../server/src/utils/acl');
      vi.mocked(aclModule.evaluateAclPermission).mockResolvedValueOnce({
        allowed: true,
        reason: 'ADMIN_BYPASS',
      });

      // 1. Query parent asset
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 10,
          tenant_id: 100,
          workspace_id: 1,
          collection_id: 1,
          status: 'ACTIVE',
          deleted_at: null,
          storage_tier: 'ARCHIVED',
          embargo_until: null,
          expires_at: null,
        },
      ]);
      // 2. getArchivalStatus queries
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 10, storage_tier: 'ARCHIVED', archived_at: '2026-08-20' },
      ]);
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 5,
          storage_tier: 'ARCHIVED',
          restoration_status: 'RESTORED',
          restoration_expires_at: new Date(Date.now() + 86400000).toISOString(),
        },
      ]);
      // 3. Query derivative
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .get('/api/v1/assets/10/versions/1/thumbnail')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('5. Rate Limiter 429 Handler', () => {
    it('triggers archivalRateLimiter 429 response handler', async () => {
      const appArchivalLimit = express();
      appArchivalLimit.use(archivalRateLimiter);
      appArchivalLimit.get('/test-archival-limit', (_req, res) => res.json({ ok: true }));

      for (let i = 0; i < 30; i++) {
        await supertest(appArchivalLimit).get('/test-archival-limit');
      }

      const resBlocked = await supertest(appArchivalLimit).get('/test-archival-limit');
      expect(resBlocked.status).toBe(429);
      expect(resBlocked.body.message).toMatch(
        /Límite de operaciones de archivado y restauración en frío alcanzado/,
      );
    });
  });
});
