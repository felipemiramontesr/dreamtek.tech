/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import supertest from 'supertest';
import express, { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import fs from 'node:fs';
import * as db from '../../../server/src/db';
import * as portalEngine from '../../../server/src/utils/portalEngine';
import * as analyticsEngine from '../../../server/src/utils/analyticsEngine';
import {
  portalsRateLimiter,
  publicPortalsRateLimiter,
  portalVerifyRateLimiter,
} from '../../../server/src/middleware/rateLimiter';
import {
  createPortalBodySchema,
  updatePortalBodySchema,
  attachCollectionBodySchema,
  verifyPortalPasswordBodySchema,
  publicPortalAssetsQuerySchema,
} from '../../../server/src/schemas/portal.schema';
import {
  portalsRouter,
  publicPortalsRouter,
  formatPortalResponse,
  extractPortalToken,
} from '../../../server/src/routes/portals';

// Mock DB
vi.mock('../../../server/src/db', () => ({
  query: vi.fn(),
  pool: {
    getConnection: vi.fn(),
  },
}));

// Mock Analytics Engine
vi.mock('../../../server/src/utils/analyticsEngine', () => ({
  recordAnalyticsEvent: vi.fn().mockResolvedValue(undefined),
  hashIpAddress: vi.fn((ip: string) => `ip-hash-${ip}`),
  hashUserAgent: vi.fn((ua: string) => `ua-hash-${ua}`),
}));

// Mock Auth Middleware
let currentTestUser: { userId: number; tenantId: number; role: string } | null = {
  userId: 42,
  tenantId: 100,
  role: 'ADMIN',
};

vi.mock('../../../server/src/middleware/auth', () => ({
  requireAuth: (req: Request, res: Response, next: NextFunction) => {
    if (!currentTestUser) {
      res
        .status(401)
        .json({ status: 401, error: 'Unauthorized', message: 'Token de autenticación requerido.' });
      return;
    }
    (req as any).user = { ...currentTestUser };
    next();
  },
  requireRole: (roles: string[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
      if (!currentTestUser || !roles.includes(currentTestUser.role)) {
        res
          .status(403)
          .json({ status: 403, error: 'Forbidden', message: 'Permisos insuficientes.' });
        return;
      }
      next();
    };
  },
}));

// App setup
const app = express();
app.use(express.json());
app.use('/api/v1/portals', portalsRouter);
app.use('/api/v1/public/portals', publicPortalsRouter);

describe('FC 019 — DAM Brand Portals, Guidelines & External Distribution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentTestUser = { userId: 42, tenantId: 100, role: 'ADMIN' };
  });

  describe('1. Zod Schemas Validation', () => {
    it('validates createPortalBodySchema correctly', () => {
      const valid = createPortalBodySchema.safeParse({
        name: 'Brand Press Kit',
        slug: 'press-kit-2026',
        description: 'Official brand assets and logos',
        brand_header_title: 'Dreamtek Media Center',
        brand_primary_color: '#00bfff',
        brand_logo_asset_id: 10,
        brand_guidelines_markdown: '# Brand Guidelines\nUse logos with care.',
        is_public: true,
        password: 'secure-portal-pass',
        allowed_domains: ['dreamtek.tech', 'press.com'],
        status: 'PUBLISHED',
      });
      expect(valid.success).toBe(true);

      const invalidSlug = createPortalBodySchema.safeParse({
        name: 'Test',
        slug: 'Invalid Slug With Spaces!',
      });
      expect(invalidSlug.success).toBe(false);

      const invalidColor = createPortalBodySchema.safeParse({
        name: 'Test',
        slug: 'valid-slug',
        brand_primary_color: 'invalid-hex',
      });
      expect(invalidColor.success).toBe(false);

      const shortPassword = createPortalBodySchema.safeParse({
        name: 'Test',
        slug: 'valid-slug',
        password: '123',
      });
      expect(shortPassword.success).toBe(false);
    });

    it('validates updatePortalBodySchema correctly', () => {
      const valid = updatePortalBodySchema.safeParse({
        name: 'Updated Name',
        slug: 'updated-slug',
        remove_password: true,
        brand_primary_color: '#ff0055',
        status: 'ARCHIVED',
      });
      expect(valid.success).toBe(true);

      const invalidColor = updatePortalBodySchema.safeParse({
        brand_primary_color: '#GGG123',
      });
      expect(invalidColor.success).toBe(false);
    });

    it('validates attachCollectionBodySchema correctly', () => {
      const valid = attachCollectionBodySchema.safeParse({
        collection_id: 5,
        display_order: 1,
        allow_download: true,
      });
      expect(valid.success).toBe(true);

      const invalid = attachCollectionBodySchema.safeParse({
        collection_id: -1,
      });
      expect(invalid.success).toBe(false);
    });

    it('validates verifyPortalPasswordBodySchema correctly', () => {
      const valid = verifyPortalPasswordBodySchema.safeParse({ password: 'secretpassword' });
      expect(valid.success).toBe(true);

      const invalid = verifyPortalPasswordBodySchema.safeParse({ password: '' });
      expect(invalid.success).toBe(false);
    });

    it('validates publicPortalAssetsQuerySchema correctly', () => {
      const valid = publicPortalAssetsQuerySchema.safeParse({
        page: '2',
        limit: '25',
        mime_type: 'image',
        collection_id: '5',
      });
      expect(valid.success).toBe(true);
      if (valid.success) {
        expect(valid.data.page).toBe(2);
        expect(valid.data.limit).toBe(25);
        expect(valid.data.collection_id).toBe(5);
      }

      const emptyQuery = publicPortalAssetsQuerySchema.safeParse({});
      expect(emptyQuery.success).toBe(true);
      if (emptyQuery.success) {
        expect(emptyQuery.data.page).toBe(1);
        expect(emptyQuery.data.limit).toBe(50);
      }
    });
  });

  describe('2. Portal Engine Utilities', () => {
    it('hashes and verifies portal passwords with bcrypt', async () => {
      const plain = 'SecretPortal123!';
      const hash = await portalEngine.hashPortalPassword(plain);
      expect(hash).not.toBe(plain);
      expect(hash.startsWith('$2')).toBe(true);

      const isMatch = await portalEngine.verifyPortalPassword(plain, hash);
      expect(isMatch).toBe(true);

      const isMismatch = await portalEngine.verifyPortalPassword('WrongPassword', hash);
      expect(isMismatch).toBe(false);
    });

    it('generates and verifies portal JWT tokens with custom audience and 24h expiration', () => {
      const token = portalEngine.generatePortalToken(10, 100);
      expect(typeof token).toBe('string');

      const decoded = portalEngine.verifyPortalToken(token);
      expect(decoded).not.toBeNull();
      expect(decoded?.portal_id).toBe(10);
      expect(decoded?.tenant_id).toBe(100);
      expect(decoded?.scope).toBe('portal_access');

      // Invalid tokens
      expect(portalEngine.verifyPortalToken('invalid-token')).toBeNull();

      const wrongScopeToken = jwt.sign(
        { portal_id: 10, tenant_id: 100, scope: 'other_scope' },
        portalEngine.getPortalJwtSecret(),
        { audience: 'dreamtek:portal', issuer: 'dreamtek.tech' },
      );
      expect(portalEngine.verifyPortalToken(wrongScopeToken)).toBeNull();

      const missingIdToken = jwt.sign(
        { scope: 'portal_access' },
        portalEngine.getPortalJwtSecret(),
        { audience: 'dreamtek:portal', issuer: 'dreamtek.tech' },
      );
      expect(portalEngine.verifyPortalToken(missingIdToken)).toBeNull();
    });

    it('getPortalJwtSecret handles env fallbacks', () => {
      const origPortal = process.env.PORTAL_JWT_SECRET;
      const origJwt = process.env.JWT_SECRET;

      delete process.env.PORTAL_JWT_SECRET;
      process.env.JWT_SECRET = 'test-jwt-secret';
      expect(portalEngine.getPortalJwtSecret()).toBe('test-jwt-secret:portal');

      delete process.env.JWT_SECRET;
      expect(portalEngine.getPortalJwtSecret()).toBe('dreamtek-portal-secret-key-salt');

      process.env.PORTAL_JWT_SECRET = 'explicit-portal-secret';
      expect(portalEngine.getPortalJwtSecret()).toBe('explicit-portal-secret');

      process.env.PORTAL_JWT_SECRET = origPortal;
      process.env.JWT_SECRET = origJwt;
    });

    it('sanitizes markdown guidelines removing XSS payloads (OWASP A03 / Condition C-019.5)', () => {
      expect(portalEngine.sanitizeMarkdownGuidelines(null)).toBe('');
      expect(portalEngine.sanitizeMarkdownGuidelines(undefined)).toBe('');

      const dirty = `
        # Brand Guidelines
        <script>alert('xss')</script>
        <iframe src="https://evil.com"></iframe>
        <object data="evil.swf"></object>
        <embed src="evil.swf"></embed>
        <style>body { display: none; }</style>
        <link rel="stylesheet" href="evil.css">
        <a href="javascript:alert(1)">Click Me</a>
        <img src="valid.png" onload="alert(1)" onerror="stealCookies()" />
        Safe text.
      `;

      const clean = portalEngine.sanitizeMarkdownGuidelines(dirty);
      expect(clean).not.toContain('<script>');
      expect(clean).not.toContain('<iframe>');
      expect(clean).not.toContain('<object>');
      expect(clean).not.toContain('<embed>');
      expect(clean).not.toContain('<style>');
      expect(clean).not.toContain('<link');
      expect(clean).not.toContain('javascript:');
      expect(clean).not.toContain('onload=');
      expect(clean).not.toContain('onerror=');
      expect(clean).toContain('# Brand Guidelines');
      expect(clean).toContain('Safe text.');
    });

    it('logs portal visitor access anonymously (Condition C-019.13)', async () => {
      (db.query as any).mockResolvedValueOnce({ insertId: 1 });
      await portalEngine.logPortalAccess(
        10,
        '192.168.1.50',
        'Mozilla/5.0',
        'https://press.example.com/article',
      );
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO dam_portal_access_logs'),
        [10, 'ip-hash-192.168.1.50', 'ua-hash-Mozilla/5.0', 'press.example.com'],
      );

      // With invalid referer and null values
      (db.query as any).mockResolvedValueOnce({ insertId: 2 });
      await portalEngine.logPortalAccess(10, undefined, undefined, 'invalid-url');
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO dam_portal_access_logs'),
        [10, null, null, null],
      );

      // Catch error branch
      (db.query as any).mockRejectedValueOnce(new Error('DB failure'));
      await portalEngine.logPortalAccess(10, '10.0.0.1');
      // Should not throw
    });

    it('extractPortalToken extracts tokens from headers or query parameters', () => {
      const mockReqBearer = {
        headers: { authorization: 'Bearer token-from-header' },
        query: {},
      } as unknown as Request;
      expect(extractPortalToken(mockReqBearer)).toBe('token-from-header');

      const mockReqQuery = {
        headers: { authorization: 'Basic 123' },
        query: { token: 'token-from-query' },
      } as unknown as Request;
      expect(extractPortalToken(mockReqQuery)).toBe('token-from-query');

      const mockReqEmpty = {
        headers: {},
        query: {},
      } as unknown as Request;
      expect(extractPortalToken(mockReqEmpty)).toBeUndefined();
    });

    it('formatPortalResponse handles malformed JSON and defaults properly', () => {
      const formattedInvalidJson = formatPortalResponse({
        id: 1,
        tenant_id: 100,
        name: 'Test',
        slug: 'test',
        brand_primary_color: '',
        allowed_domains: 'invalid-json-string',
      });
      expect(formattedInvalidJson.allowed_domains).toEqual([]);
      expect(formattedInvalidJson.brand_primary_color).toBe('#00bfff');

      const formattedArray = formatPortalResponse({
        id: 1,
        tenant_id: 100,
        name: 'Test',
        slug: 'test',
        allowed_domains: ['a.com'],
      });
      expect(formattedArray.allowed_domains).toEqual(['a.com']);
    });
  });

  describe('3. Admin Management Routes (/api/v1/portals)', () => {
    it('POST / creates a new brand portal successfully (Condition C-019.1)', async () => {
      (db.query as any)
        .mockResolvedValueOnce([]) // Slug check (none exists)
        .mockResolvedValueOnce([{ id: 5 }]) // Logo asset check
        .mockResolvedValueOnce({ insertId: 10 }) // Insert portal
        .mockResolvedValueOnce([
          {
            id: 10,
            tenant_id: 100,
            name: 'Press Kit',
            slug: 'press-kit',
            description: 'Brand assets',
            brand_header_title: 'Press Center',
            brand_primary_color: '#00bfff',
            brand_logo_asset_id: 5,
            brand_guidelines_markdown: '# Guidelines',
            is_public: 1,
            password_hash: '$2b$10$hashed',
            allowed_domains: '["press.com"]',
            status: 'PUBLISHED',
            expires_at: null,
            created_by: 42,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ]);

      const res = await supertest(app)
        .post('/api/v1/portals')
        .send({
          name: 'Press Kit',
          slug: 'press-kit',
          description: 'Brand assets',
          brand_header_title: 'Press Center',
          brand_primary_color: '#00bfff',
          brand_logo_asset_id: 5,
          brand_guidelines_markdown: '# Guidelines <script>bad()</script>',
          is_public: true,
          password: 'secretpassword',
          allowed_domains: ['press.com'],
          status: 'PUBLISHED',
          expires_at: '2030-12-31T23:59:59.000Z',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.slug).toBe('press-kit');
      expect(res.body.data.has_password).toBe(true);
      expect(res.body.data.password_hash).toBeUndefined(); // Omit password_hash (Condition C-019.10)
      expect(res.body.data.allowed_domains).toEqual(['press.com']);

      // Minimal creation with only name and slug
      (db.query as any)
        .mockResolvedValueOnce([]) // Slug check
        .mockResolvedValueOnce({ insertId: 12 }) // Insert
        .mockResolvedValueOnce([
          {
            id: 12,
            tenant_id: 100,
            name: 'Minimal Portal',
            slug: 'minimal-slug',
            brand_primary_color: '#00bfff',
            is_public: 0,
            password_hash: null,
            allowed_domains: '[]',
            status: 'DRAFT',
            created_by: 42,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ]);

      const resMinimal = await supertest(app)
        .post('/api/v1/portals')
        .send({ name: 'Minimal Portal', slug: 'minimal-slug' });
      expect(resMinimal.status).toBe(201);
      expect(resMinimal.body.data.status).toBe('DRAFT');
    });

    it('POST / returns 409 Conflict if slug already exists in tenant (Condition C-019.3)', async () => {
      (db.query as any).mockResolvedValueOnce([{ id: 1 }]); // Slug exists

      const res = await supertest(app).post('/api/v1/portals').send({
        name: 'Duplicate Portal',
        slug: 'press-kit',
      });

      expect(res.status).toBe(409);
      expect(res.body.message).toContain('ya está en uso');
    });

    it('POST / returns 400 Bad Request if brand_logo_asset_id does not exist in tenant', async () => {
      (db.query as any)
        .mockResolvedValueOnce([]) // Slug check OK
        .mockResolvedValueOnce([]); // Logo check not found

      const res = await supertest(app).post('/api/v1/portals').send({
        name: 'Portal with Bad Logo',
        slug: 'bad-logo',
        brand_logo_asset_id: 999,
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('activo especificado como logo no existe');
    });

    it('GET / lists all brand portals for current tenant', async () => {
      (db.query as any).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 100,
          name: 'Portal 1',
          slug: 'portal-1',
          is_public: 1,
          password_hash: null,
          allowed_domains: [],
          status: 'PUBLISHED',
          created_by: 42,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]);

      const res = await supertest(app).get('/api/v1/portals');
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].has_password).toBe(false);
    });

    it('GET /:id returns portal detail with attached collections', async () => {
      (db.query as any)
        .mockResolvedValueOnce([
          {
            id: 10,
            tenant_id: 100,
            name: 'Portal Detail',
            slug: 'portal-detail',
            is_public: 0,
            password_hash: '$2b$10$hash',
            allowed_domains: '["dreamtek.tech"]',
            status: 'DRAFT',
            created_by: 42,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ])
        .mockResolvedValueOnce([
          {
            portal_collection_id: 1,
            display_order: 0,
            allow_download: 1,
            collection_id: 5,
            name: 'Logos',
            description: 'Brand logos',
            workspace_id: 2,
          },
        ]);

      const res = await supertest(app).get('/api/v1/portals/10');
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(10);
      expect(res.body.data.collections.length).toBe(1);
    });

    it('GET /:id returns 400 for invalid ID and 404 if not found (Anti-IDOR)', async () => {
      const resBadId = await supertest(app).get('/api/v1/portals/invalid-id');
      expect(resBadId.status).toBe(400);

      (db.query as any).mockResolvedValueOnce([]);
      const resNotFound = await supertest(app).get('/api/v1/portals/999');
      expect(resNotFound.status).toBe(404);
    });

    it('PUT /:id updates portal configuration and handles slug/password updates', async () => {
      (db.query as any)
        .mockResolvedValueOnce([
          {
            id: 10,
            tenant_id: 100,
            slug: 'old-slug',
            password_hash: '$2b$10$old',
            description: 'Old desc',
            brand_header_title: 'Old title',
            brand_primary_color: '#00bfff',
            brand_logo_asset_id: null,
            brand_guidelines_markdown: '# Old',
            is_public: 0,
            allowed_domains: null,
            status: 'DRAFT',
            expires_at: null,
          },
        ]) // Existing
        .mockResolvedValueOnce([]) // Slug uniqueness check OK
        .mockResolvedValueOnce([{ id: 7 }]) // Logo check OK
        .mockResolvedValueOnce({ affectedRows: 1 }) // Update
        .mockResolvedValueOnce([
          {
            id: 10,
            tenant_id: 100,
            name: 'Updated Portal',
            slug: 'new-slug',
            description: 'New desc',
            brand_header_title: 'New title',
            brand_primary_color: '#ff0077',
            brand_logo_asset_id: 7,
            brand_guidelines_markdown: '# New',
            is_public: 1,
            password_hash: '$2b$10$newhash',
            allowed_domains: '["new.com"]',
            status: 'PUBLISHED',
            created_by: 42,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ]);

      const res = await supertest(app)
        .put('/api/v1/portals/10')
        .send({
          name: 'Updated Portal',
          slug: 'new-slug',
          description: 'New desc',
          brand_header_title: 'New title',
          brand_primary_color: '#ff0077',
          brand_logo_asset_id: 7,
          brand_guidelines_markdown: '# New',
          is_public: true,
          password: 'new-password-123',
          allowed_domains: ['new.com'],
          status: 'PUBLISHED',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.slug).toBe('new-slug');
      expect(res.body.data.brand_primary_color).toBe('#ff0077');

      // Update with is_public: false
      (db.query as any)
        .mockResolvedValueOnce([{ id: 10, tenant_id: 100, slug: 'new-slug' }])
        .mockResolvedValueOnce({ affectedRows: 1 })
        .mockResolvedValueOnce([
          {
            id: 10,
            tenant_id: 100,
            name: 'Updated Portal',
            slug: 'new-slug',
            is_public: 0,
            created_by: 42,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ]);
      const resPrivate = await supertest(app).put('/api/v1/portals/10').send({ is_public: false });
      expect(resPrivate.status).toBe(200);
      expect(resPrivate.body.data.is_public).toBe(false);

      // Update with expires_at: null
      (db.query as any)
        .mockResolvedValueOnce([
          { id: 10, tenant_id: 100, slug: 'new-slug', expires_at: new Date() },
        ])
        .mockResolvedValueOnce({ affectedRows: 1 })
        .mockResolvedValueOnce([
          {
            id: 10,
            tenant_id: 100,
            name: 'Updated Portal',
            slug: 'new-slug',
            expires_at: null,
            created_by: 42,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ]);
      const resNullExpires = await supertest(app)
        .put('/api/v1/portals/10')
        .send({ expires_at: null });
      expect(resNullExpires.status).toBe(200);
      expect(resNullExpires.body.data.expires_at).toBeNull();
    });

    it('PUT /:id handles remove_password and slug collision checks', async () => {
      // Invalid ID
      const resBadId = await supertest(app).put('/api/v1/portals/bad').send({ name: 'Test' });
      expect(resBadId.status).toBe(400);

      // Not found
      (db.query as any).mockResolvedValueOnce([]);
      const resNotFound = await supertest(app).put('/api/v1/portals/10').send({ name: 'Test' });
      expect(resNotFound.status).toBe(404);

      // Slug collision
      (db.query as any)
        .mockResolvedValueOnce([{ id: 10, tenant_id: 100, slug: 'slug-a' }])
        .mockResolvedValueOnce([{ id: 11 }]); // Collision with id 11
      const resConflict = await supertest(app).put('/api/v1/portals/10').send({ slug: 'slug-b' });
      expect(resConflict.status).toBe(409);

      // Bad logo asset
      (db.query as any)
        .mockResolvedValueOnce([{ id: 10, tenant_id: 100, slug: 'slug-a' }])
        .mockResolvedValueOnce([]); // Logo asset not found
      const resBadLogo = await supertest(app)
        .put('/api/v1/portals/10')
        .send({ brand_logo_asset_id: 999 });
      expect(resBadLogo.status).toBe(400);

      // Remove password success
      (db.query as any)
        .mockResolvedValueOnce([
          { id: 10, tenant_id: 100, slug: 'slug-a', password_hash: '$2b$10$old' },
        ])
        .mockResolvedValueOnce({ affectedRows: 1 })
        .mockResolvedValueOnce([{ id: 10, tenant_id: 100, slug: 'slug-a', password_hash: null }]);
      const resRemovePass = await supertest(app).put('/api/v1/portals/10').send({
        remove_password: true,
        description: null,
        brand_header_title: null,
        brand_guidelines_markdown: null,
        brand_logo_asset_id: null,
        allowed_domains: null,
        expires_at: '2030-01-01T00:00:00.000Z',
      });
      expect(resRemovePass.status).toBe(200);
      expect(resRemovePass.body.data.has_password).toBe(false);
    });

    it('DELETE /:id deletes brand portal successfully', async () => {
      const resBadId = await supertest(app).delete('/api/v1/portals/bad');
      expect(resBadId.status).toBe(400);

      (db.query as any).mockResolvedValueOnce([]);
      const resNotFound = await supertest(app).delete('/api/v1/portals/10');
      expect(resNotFound.status).toBe(404);

      (db.query as any)
        .mockResolvedValueOnce([{ id: 10 }])
        .mockResolvedValueOnce({ affectedRows: 1 });
      const resOk = await supertest(app).delete('/api/v1/portals/10');
      expect(resOk.status).toBe(200);
    });

    it('POST /:id/collections attaches a collection with Anti-IDOR check (Condition C-019.7)', async () => {
      const resBadId = await supertest(app)
        .post('/api/v1/portals/bad/collections')
        .send({ collection_id: 5 });
      expect(resBadId.status).toBe(400);

      // Portal not found
      (db.query as any).mockResolvedValueOnce([]);
      const resPortal404 = await supertest(app)
        .post('/api/v1/portals/10/collections')
        .send({ collection_id: 5 });
      expect(resPortal404.status).toBe(404);

      // Collection not found in tenant
      (db.query as any)
        .mockResolvedValueOnce([{ id: 10 }]) // Portal OK
        .mockResolvedValueOnce([]); // Collection not found
      const resCol404 = await supertest(app)
        .post('/api/v1/portals/10/collections')
        .send({ collection_id: 5 });
      expect(resCol404.status).toBe(404);

      // Success with allow_download: true
      (db.query as any)
        .mockResolvedValueOnce([{ id: 10 }])
        .mockResolvedValueOnce([{ id: 5 }])
        .mockResolvedValueOnce({ insertId: 1 });
      const resOk = await supertest(app)
        .post('/api/v1/portals/10/collections')
        .send({ collection_id: 5, display_order: 1, allow_download: true });
      expect(resOk.status).toBe(200);

      // Success with allow_download: false
      (db.query as any)
        .mockResolvedValueOnce([{ id: 10 }])
        .mockResolvedValueOnce([{ id: 6 }])
        .mockResolvedValueOnce({ insertId: 2 });
      const resOkNoDl = await supertest(app)
        .post('/api/v1/portals/10/collections')
        .send({ collection_id: 6, display_order: 2, allow_download: false });
      expect(resOkNoDl.status).toBe(200);
    });

    it('DELETE /:id/collections/:collectionId detaches collection successfully', async () => {
      const resBad = await supertest(app).delete('/api/v1/portals/bad/collections/bad');
      expect(resBad.status).toBe(400);

      (db.query as any).mockResolvedValueOnce([]);
      const resNotFound = await supertest(app).delete('/api/v1/portals/10/collections/5');
      expect(resNotFound.status).toBe(404);

      (db.query as any)
        .mockResolvedValueOnce([{ id: 10 }])
        .mockResolvedValueOnce({ affectedRows: 1 });
      const resOk = await supertest(app).delete('/api/v1/portals/10/collections/5');
      expect(resOk.status).toBe(200);
    });
  });

  describe('4. Public Consumer Routes (/api/v1/public/portals)', () => {
    it('GET /:tenantSlug/:portalSlug resolves public manifest and records telemetry (Condition C-019.13)', async () => {
      // Invalid tenant slug
      const resBadTenant = await supertest(app).get(
        '/api/v1/public/portals/invalid-tenant/press-kit',
      );
      expect(resBadTenant.status).toBe(404);

      // Portal not found
      (db.query as any).mockResolvedValueOnce([]);
      const resNotFound = await supertest(app).get('/api/v1/public/portals/100/non-existent');
      expect(resNotFound.status).toBe(404);

      // Portal found
      (db.query as any)
        .mockResolvedValueOnce([
          {
            id: 10,
            tenant_id: 100,
            name: 'Public Press Kit',
            slug: 'press-kit',
            brand_header_title: 'Media Center',
            brand_primary_color: '#00bfff',
            brand_logo_asset_id: 5,
            brand_guidelines_markdown: '# Welcome',
            is_public: 1,
            password_hash: null,
            allowed_domains: '[]',
            status: 'PUBLISHED',
            expires_at: null,
            created_by: 42,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ])
        .mockResolvedValueOnce({ insertId: 1 }) // logPortalAccess DB query
        .mockResolvedValueOnce([
          {
            portal_collection_id: 1,
            display_order: 0,
            allow_download: 1,
            collection_id: 5,
            name: 'Logos',
            description: 'Brand Logos',
          },
        ]);

      const res = await supertest(app)
        .get('/api/v1/public/portals/100/press-kit')
        .set('User-Agent', 'Mozilla/5.0')
        .set('Referer', 'https://press.dreamtek.tech');

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Public Press Kit');
      expect(res.body.data.collections.length).toBe(1);

      // Portal with brand_logo_asset_id: null
      (db.query as any)
        .mockResolvedValueOnce([
          {
            id: 11,
            tenant_id: 100,
            name: 'No Logo Portal',
            slug: 'no-logo',
            brand_logo_asset_id: null,
            status: 'PUBLISHED',
            created_by: 42,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ])
        .mockResolvedValueOnce({ insertId: 2 })
        .mockResolvedValueOnce([]);

      const resNoLogo = await supertest(app).get('/api/v1/public/portals/100/no-logo');
      expect(resNoLogo.status).toBe(200);
    });

    it('POST /:tenantSlug/:portalSlug/verify handles password validation and JWT issuance (Condition C-019.9)', async () => {
      // Invalid tenant
      const resBadTenant = await supertest(app)
        .post('/api/v1/public/portals/bad/press/verify')
        .send({ password: '123' });
      expect(resBadTenant.status).toBe(404);

      // Not found
      (db.query as any).mockResolvedValueOnce([]);
      const resNotFound = await supertest(app)
        .post('/api/v1/public/portals/100/not-found/verify')
        .send({ password: '123' });
      expect(resNotFound.status).toBe(404);

      // Portal with no password returns token immediately
      (db.query as any).mockResolvedValueOnce([{ id: 10, tenant_id: 100, password_hash: null }]);
      const resNoPass = await supertest(app)
        .post('/api/v1/public/portals/100/open-portal/verify')
        .send({ password: 'any' });
      expect(resNoPass.status).toBe(200);
      expect(resNoPass.body.data.token).toBeDefined();

      // Password mismatch
      const hash = await bcrypt.hash('CorrectPassword123!', 10);
      (db.query as any).mockResolvedValueOnce([{ id: 10, tenant_id: 100, password_hash: hash }]);
      const resWrongPass = await supertest(app)
        .post('/api/v1/public/portals/100/protected/verify')
        .send({ password: 'WrongPassword' });
      expect(resWrongPass.status).toBe(401);

      // Password match
      (db.query as any).mockResolvedValueOnce([{ id: 10, tenant_id: 100, password_hash: hash }]);
      const resMatch = await supertest(app)
        .post('/api/v1/public/portals/100/protected/verify')
        .send({ password: 'CorrectPassword123!' });
      expect(resMatch.status).toBe(200);
      expect(resMatch.body.data.token).toBeDefined();
    });

    it('GET /:tenantSlug/:portalSlug/assets lists assets enforcing portal token when protected (Condition C-019.8)', async () => {
      // Invalid tenant
      const resBadTenant = await supertest(app).get('/api/v1/public/portals/bad/press/assets');
      expect(resBadTenant.status).toBe(404);

      // Portal not found
      (db.query as any).mockResolvedValueOnce([]);
      const resNotFound = await supertest(app).get('/api/v1/public/portals/100/not-found/assets');
      expect(resNotFound.status).toBe(404);

      // Password-protected non-public portal without token
      (db.query as any).mockResolvedValueOnce([
        { id: 10, tenant_id: 100, is_public: 0, password_hash: '$2b$10$hash' },
      ]);
      const resNoToken = await supertest(app).get('/api/v1/public/portals/100/protected/assets');
      expect(resNoToken.status).toBe(401);

      // Password-protected non-public portal with invalid token
      (db.query as any).mockResolvedValueOnce([
        { id: 10, tenant_id: 100, is_public: 0, password_hash: '$2b$10$hash' },
      ]);
      const resInvalidToken = await supertest(app)
        .get('/api/v1/public/portals/100/protected/assets')
        .set('Authorization', 'Bearer invalid-token');
      expect(resInvalidToken.status).toBe(403);

      // Valid public portal assets query with filters
      const validToken = portalEngine.generatePortalToken(10, 100);
      (db.query as any)
        .mockResolvedValueOnce([{ id: 10, tenant_id: 100, is_public: 1, password_hash: null }])
        .mockResolvedValueOnce([
          {
            id: 1,
            collection_id: 5,
            title: 'Logo SVG',
            mime_type: 'image/svg+xml',
            byte_size: 15000,
            allow_download: 1,
          },
        ]);

      const resAssets = await supertest(app)
        .get(
          '/api/v1/public/portals/100/press/assets?page=1&limit=10&mime_type=image&collection_id=5',
        )
        .set('Authorization', `Bearer ${validToken}`);

      expect(resAssets.status).toBe(200);
      expect(resAssets.body.data.results.length).toBe(1);

      // Query with token in query param and without filters
      (db.query as any)
        .mockResolvedValueOnce([
          { id: 10, tenant_id: 100, is_public: 0, password_hash: '$2b$10$hash' },
        ])
        .mockResolvedValueOnce([
          {
            id: 1,
            collection_id: 5,
            title: 'Logo SVG',
            mime_type: 'image/svg+xml',
            byte_size: 15000,
            allow_download: 1,
          },
        ]);

      const resAssetsQueryToken = await supertest(app).get(
        `/api/v1/public/portals/100/press/assets?token=${validToken}`,
      );
      expect(resAssetsQueryToken.status).toBe(200);
    });

    it('GET /:tenantSlug/:portalSlug/assets/:assetId/download handles download with embargo and rights (Condition C-019.8)', async () => {
      // Bad params
      const resBad = await supertest(app).get(
        '/api/v1/public/portals/bad/press/assets/bad/download',
      );
      expect(resBad.status).toBe(400);

      // Portal not found
      (db.query as any).mockResolvedValueOnce([]);
      const resNotFound = await supertest(app).get(
        '/api/v1/public/portals/100/not-found/assets/1/download',
      );
      expect(resNotFound.status).toBe(404);

      // Protected portal without token
      (db.query as any).mockResolvedValueOnce([
        { id: 10, tenant_id: 100, is_public: 0, password_hash: '$2b$10$hash' },
      ]);
      const resNoToken = await supertest(app).get(
        '/api/v1/public/portals/100/protected/assets/1/download',
      );
      expect(resNoToken.status).toBe(401);

      // Protected portal with invalid token
      (db.query as any).mockResolvedValueOnce([
        { id: 10, tenant_id: 100, is_public: 0, password_hash: '$2b$10$hash' },
      ]);
      const resBadToken = await supertest(app).get(
        '/api/v1/public/portals/100/protected/assets/1/download?token=bad',
      );
      expect(resBadToken.status).toBe(403);

      // Asset not found in portal collections
      const validToken = portalEngine.generatePortalToken(10, 100);
      (db.query as any)
        .mockResolvedValueOnce([{ id: 10, tenant_id: 100, is_public: 1, password_hash: null }])
        .mockResolvedValueOnce([]);
      const resAsset404 = await supertest(app).get(
        '/api/v1/public/portals/100/press/assets/999/download',
      );
      expect(resAsset404.status).toBe(404);

      // Asset in collection where allow_download = 0
      (db.query as any)
        .mockResolvedValueOnce([{ id: 10, tenant_id: 100, is_public: 1, password_hash: null }])
        .mockResolvedValueOnce([
          {
            id: 1,
            title: 'No Download',
            mime_type: 'image/png',
            allow_download: 0,
            byte_size: 100,
          },
        ]);
      const resNoDownload = await supertest(app).get(
        '/api/v1/public/portals/100/press/assets/1/download',
      );
      expect(resNoDownload.status).toBe(403);
      expect(resNoDownload.body.message).toContain(
        'descarga de activos en esta colección está deshabilitada',
      );

      // Asset under active embargo
      const futureEmbargo = new Date(Date.now() + 86400000).toISOString();
      (db.query as any)
        .mockResolvedValueOnce([{ id: 10, tenant_id: 100, is_public: 1, password_hash: null }])
        .mockResolvedValueOnce([
          {
            id: 1,
            title: 'Embargoed',
            mime_type: 'image/png',
            allow_download: 1,
            embargo_until: futureEmbargo,
            byte_size: 100,
          },
        ]);
      const resEmbargo = await supertest(app).get(
        '/api/v1/public/portals/100/press/assets/1/download',
      );
      expect(resEmbargo.status).toBe(403);
      expect(resEmbargo.body.message).toContain('bajo embargo');

      // Success download with fallback buffer
      (db.query as any)
        .mockResolvedValueOnce([{ id: 10, tenant_id: 100, is_public: 1, password_hash: null }])
        .mockResolvedValueOnce([
          {
            id: 1,
            title: 'Hero.png',
            mime_type: 'image/png',
            allow_download: 1,
            embargo_until: null,
            file_path: null,
            byte_size: 1024,
          },
        ]);
      const resSuccess = await supertest(app).get(
        '/api/v1/public/portals/100/press/assets/1/download',
      );
      expect(resSuccess.status).toBe(200);
      expect(resSuccess.header['content-disposition']).toContain('Hero.png');

      // Success download with physical file stream
      vi.spyOn(fs, 'existsSync').mockReturnValueOnce(true);
      const mockPipe = vi.fn((res) => res.end());
      vi.spyOn(fs, 'createReadStream').mockReturnValueOnce({ pipe: mockPipe } as any);

      (db.query as any)
        .mockResolvedValueOnce([
          { id: 10, tenant_id: 100, is_public: 0, password_hash: '$2b$10$hash' },
        ])
        .mockResolvedValueOnce([
          {
            id: 1,
            title: 'Physical.png',
            mime_type: 'image/png',
            allow_download: 1,
            file_path: '/tmp/test.png',
            byte_size: 2048,
          },
        ]);
      const resStream = await supertest(app).get(
        `/api/v1/public/portals/100/press/assets/1/download?token=${validToken}`,
      );
      expect(resStream.status).toBe(200);
    });
  });

  describe('5. Error Handling & Rate Limiter Handlers', () => {
    it('handles server exceptions gracefully (500)', async () => {
      (db.query as any).mockRejectedValueOnce(new Error('Crash'));
      const resPostError = await supertest(app)
        .post('/api/v1/portals')
        .send({ name: 'Crash', slug: 'crash-portal' });
      expect(resPostError.status).toBe(500);

      (db.query as any).mockRejectedValueOnce(new Error('Crash'));
      const resGetError = await supertest(app).get('/api/v1/portals');
      expect(resGetError.status).toBe(500);

      (db.query as any).mockRejectedValueOnce(new Error('Crash'));
      const resGetIdError = await supertest(app).get('/api/v1/portals/10');
      expect(resGetIdError.status).toBe(500);

      (db.query as any).mockRejectedValueOnce(new Error('Crash'));
      const resPutError = await supertest(app).put('/api/v1/portals/10').send({ name: 'Crash' });
      expect(resPutError.status).toBe(500);

      (db.query as any).mockRejectedValueOnce(new Error('Crash'));
      const resDeleteError = await supertest(app).delete('/api/v1/portals/10');
      expect(resDeleteError.status).toBe(500);

      (db.query as any).mockRejectedValueOnce(new Error('Crash'));
      const resColPostError = await supertest(app)
        .post('/api/v1/portals/10/collections')
        .send({ collection_id: 5 });
      expect(resColPostError.status).toBe(500);

      (db.query as any).mockRejectedValueOnce(new Error('Crash'));
      const resColDelError = await supertest(app).delete('/api/v1/portals/10/collections/5');
      expect(resColDelError.status).toBe(500);

      (db.query as any).mockRejectedValueOnce(new Error('Crash'));
      const resPubError = await supertest(app).get('/api/v1/public/portals/100/press');
      expect(resPubError.status).toBe(500);

      (db.query as any).mockRejectedValueOnce(new Error('Crash'));
      const resVerifyError = await supertest(app)
        .post('/api/v1/public/portals/100/press/verify')
        .send({ password: '123' });
      expect(resVerifyError.status).toBe(500);

      (db.query as any).mockRejectedValueOnce(new Error('Crash'));
      const resAssetsError = await supertest(app).get('/api/v1/public/portals/100/press/assets');
      expect(resAssetsError.status).toBe(500);

      (db.query as any).mockRejectedValueOnce(new Error('Crash'));
      const resDlError = await supertest(app).get(
        '/api/v1/public/portals/100/press/assets/1/download',
      );
      expect(resDlError.status).toBe(500);
    });

    it('triggers portalsRateLimiter 429 response handler', async () => {
      const appLimit = express();
      appLimit.use(portalsRateLimiter);
      appLimit.get('/test-portals-limit', (_req, res) => res.json({ ok: true }));

      for (let i = 0; i < 60; i++) {
        await supertest(appLimit).get('/test-portals-limit');
      }
      const resBlocked = await supertest(appLimit).get('/test-portals-limit');
      expect(resBlocked.status).toBe(429);
      expect(resBlocked.body.message).toMatch(/Límite de operaciones de portales de marca/);
    });

    it('triggers publicPortalsRateLimiter 429 response handler', async () => {
      const appLimit = express();
      appLimit.use(publicPortalsRateLimiter);
      appLimit.get('/test-public-limit', (_req, res) => res.json({ ok: true }));

      for (let i = 0; i < 60; i++) {
        await supertest(appLimit).get('/test-public-limit');
      }
      const resBlocked = await supertest(appLimit).get('/test-public-limit');
      expect(resBlocked.status).toBe(429);
      expect(resBlocked.body.message).toMatch(/Límite de navegación pública de portales/);
    });

    it('triggers portalVerifyRateLimiter 429 response handler', async () => {
      const appLimit = express();
      appLimit.use(portalVerifyRateLimiter);
      appLimit.post('/test-verify-limit', (_req, res) => res.json({ ok: true }));

      for (let i = 0; i < 10; i++) {
        await supertest(appLimit).post('/test-verify-limit');
      }
      const resBlocked = await supertest(appLimit).post('/test-verify-limit');
      expect(resBlocked.status).toBe(429);
      expect(resBlocked.body.message).toMatch(/Demasiados intentos de validación de contraseña/);
    });
  });
});
