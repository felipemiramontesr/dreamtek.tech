/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import supertest from 'supertest';
import express, { Request, Response, NextFunction } from 'express';
import * as db from '../../../server/src/db';
import * as sharesModule from '../../../server/src/routes/shares';
import * as aclModule from '../../../server/src/utils/acl';
import {
  hashIpAddress,
  hashUserAgent,
  sanitizeReferer,
  calculateRoiScore,
  recordAnalyticsEvent,
  getOverviewMetrics,
  getAssetMetrics,
  getTopAssets,
  getRoiReport,
} from '../../../server/src/utils/analyticsEngine';
import {
  recordEventBodySchema,
  analyticsOverviewQuerySchema,
  topAssetsQuerySchema,
  roiReportQuerySchema,
  assetAnalyticsQuerySchema,
} from '../../../server/src/schemas/analytics.schema';
import {
  analyticsRateLimiter,
  analyticsEventsRateLimiter,
} from '../../../server/src/middleware/rateLimiter';
import { AuthenticatedRequest } from '../../../server/src/middleware/auth';
import analyticsRouter, {
  getClientIp,
  optionalAuthForAnalytics,
} from '../../../server/src/routes/analytics';

// Mock DB
vi.mock('../../../server/src/db', () => ({
  query: vi.fn(),
  pool: {
    query: vi.fn(),
    getConnection: vi.fn(),
  },
}));

// Test Auth Context variable
let currentTestUser: any = {
  userId: 42,
  tenantId: 100,
  role: 'ADMIN',
};

// Mock Auth Middleware
vi.mock('../../../server/src/middleware/auth', () => ({
  requireAuth: (req: Request, res: Response, next: NextFunction) => {
    if (!currentTestUser) {
      res.status(401).json({ status: 401, error: 'Unauthorized', message: 'No authenticated' });
      return;
    }
    (req as AuthenticatedRequest).user = currentTestUser;
    next();
  },
  requireRole: (allowedRoles: string[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
      const user = (req as AuthenticatedRequest).user;
      if (!user || !allowedRoles.includes(user.role)) {
        res
          .status(403)
          .json({ status: 403, error: 'Forbidden', message: 'Permiso denegado por rol.' });
        return;
      }
      next();
    };
  },
}));

describe('FC 018 — DAM Analytics, Engagement & ROI Reporting Engine', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    currentTestUser = {
      userId: 42,
      tenantId: 100,
      role: 'ADMIN',
    };
  });

  describe('1. Zod Schemas Validation', () => {
    it('validates correct recordEventBodySchema for authenticated USER', () => {
      const valid = {
        asset_id: 10,
        event_type: 'VIEW',
        actor_type: 'USER',
        bytes_served: 1024,
      };
      const result = recordEventBodySchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('validates recordEventBodySchema for GUEST with share_token', () => {
      const validGuest = {
        asset_id: 10,
        event_type: 'DOWNLOAD',
        actor_type: 'GUEST',
        share_token: 'token-abc-123',
        bytes_served: 5000,
      };
      const result = recordEventBodySchema.safeParse(validGuest);
      expect(result.success).toBe(true);
    });

    it('rejects GUEST event without share_token', () => {
      const invalidGuest = {
        asset_id: 10,
        event_type: 'DOWNLOAD',
        actor_type: 'GUEST',
      };
      const result = recordEventBodySchema.safeParse(invalidGuest);
      expect(result.success).toBe(false);
    });

    it('rejects invalid event_type', () => {
      const invalid = {
        asset_id: 10,
        event_type: 'UNKNOWN_TYPE',
      };
      const result = recordEventBodySchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('validates overview and top assets query schemas with defaults and constraints', () => {
      expect(analyticsOverviewQuerySchema.safeParse({}).success).toBe(true);
      expect(analyticsOverviewQuerySchema.safeParse({ days: '60' }).success).toBe(true);
      expect(analyticsOverviewQuerySchema.safeParse({ days: '999' }).success).toBe(false);
      expect(analyticsOverviewQuerySchema.safeParse({ days: 'invalid' }).success).toBe(false);

      expect(topAssetsQuerySchema.safeParse({}).success).toBe(true);
      expect(
        topAssetsQuerySchema.safeParse({ metric: 'roi', days: '15', limit: '20' }).success,
      ).toBe(true);
      expect(topAssetsQuerySchema.safeParse({ metric: 'invalid' }).success).toBe(false);
      expect(topAssetsQuerySchema.safeParse({ limit: '100' }).success).toBe(false);

      expect(roiReportQuerySchema.safeParse({}).success).toBe(true);
      expect(
        roiReportQuerySchema.safeParse({ days: '30', dormant_threshold_days: '60', limit: '25' })
          .success,
      ).toBe(true);
      expect(roiReportQuerySchema.safeParse({ dormant_threshold_days: '2' }).success).toBe(false);

      expect(assetAnalyticsQuerySchema.safeParse({}).success).toBe(true);
      expect(assetAnalyticsQuerySchema.safeParse({ days: '45' }).success).toBe(true);
      expect(assetAnalyticsQuerySchema.safeParse({ days: '-5' }).success).toBe(false);
    });
  });

  describe('2. Engine Utilities & Helper Unit Tests', () => {
    it('hashIpAddress hashes IP with salt and handles empty/undefined inputs', () => {
      const ip = '192.168.1.50';
      const hash1 = hashIpAddress(ip);
      expect(hash1).toBeTruthy();
      expect(hash1?.length).toBe(64);

      // Deterministic
      const hash2 = hashIpAddress(ip);
      expect(hash1).toBe(hash2);

      // Empty cases
      expect(hashIpAddress(undefined)).toBeNull();
      expect(hashIpAddress('')).toBeNull();
      expect(hashIpAddress('   ')).toBeNull();
    });

    it('hashUserAgent hashes with SHA-256 and handles empty inputs', () => {
      const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
      const hash = hashUserAgent(ua);
      expect(hash).toBeTruthy();
      expect(hash?.length).toBe(64);
      expect(hashUserAgent(undefined)).toBeNull();
      expect(hashUserAgent('')).toBeNull();
    });

    it('sanitizeReferer extracts hostname safely and handles malformed strings', () => {
      expect(sanitizeReferer('https://app.dreamtek.tech/dashboard/assets?id=5')).toBe(
        'app.dreamtek.tech',
      );
      expect(sanitizeReferer('http://staging.dreamtek.tech:3000/')).toBe('staging.dreamtek.tech');
      expect(sanitizeReferer('dreamtek.tech/some/path')).toBe('dreamtek.tech');
      expect(sanitizeReferer('http://[invalid-url-domain/')).toBeNull();
      expect(sanitizeReferer('   /only/path   ')).toBeNull();
      expect(sanitizeReferer(undefined)).toBeNull();
      expect(sanitizeReferer('')).toBeNull();
      expect(sanitizeReferer('   ')).toBeNull();
    });

    it('optionalAuthForAnalytics calls next for GUEST and requireAuth for USER', () => {
      const mockReqGuest = { body: { actor_type: 'GUEST' } } as Request;
      const nextFn = vi.fn();
      optionalAuthForAnalytics(mockReqGuest, {} as Response, nextFn);
      expect(nextFn).toHaveBeenCalled();
    });

    it('calculateRoiScore computes frozen deterministic scoring curve', () => {
      // Zero engagement yields 0.0
      expect(
        calculateRoiScore({
          total_views: 0,
          total_downloads: 0,
          total_streams: 0,
          total_shares: 0,
          total_search_hits: 0,
          byte_size: 1048576,
        }),
      ).toBe(0.0);

      // Normal engagement calculation
      const score = calculateRoiScore({
        total_views: 100,
        total_downloads: 20,
        total_streams: 30,
        total_shares: 10,
        total_search_hits: 50,
        byte_size: 5 * 1024 * 1024, // 5 MB
      });
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(100);

      // High storage penalty yields lower score for same engagement
      const scoreHeavy = calculateRoiScore({
        total_views: 100,
        total_downloads: 20,
        total_streams: 30,
        total_shares: 10,
        total_search_hits: 50,
        byte_size: 500 * 1024 * 1024, // 500 MB
      });
      expect(score).toBeGreaterThan(scoreHeavy);
    });

    it('recordAnalyticsEvent executes queries fail-open and handles all event types', async () => {
      (db.pool.query as any).mockResolvedValue([{ affectedRows: 1 }]);

      const okView = await recordAnalyticsEvent({
        tenant_id: 100,
        asset_id: 10,
        event_type: 'VIEW',
        actor_id: 42,
        actor_type: 'USER',
        bytes_served: 1024,
        ip: '127.0.0.1',
        user_agent: 'Vitest Agent',
        referer: 'https://dreamtek.tech',
      });
      expect(okView).toBe(true);

      const okStream = await recordAnalyticsEvent({
        tenant_id: 100,
        asset_id: 10,
        event_type: 'STREAM',
      });
      expect(okStream).toBe(true);

      const okShare = await recordAnalyticsEvent({
        tenant_id: 100,
        asset_id: 10,
        event_type: 'SHARE_ACCESS',
      });
      expect(okShare).toBe(true);

      const okSearch = await recordAnalyticsEvent({
        tenant_id: 100,
        asset_id: 10,
        event_type: 'SEARCH_HIT',
      });
      expect(okSearch).toBe(true);

      const okDownload = await recordAnalyticsEvent({
        tenant_id: 100,
        asset_id: 10,
        event_type: 'DOWNLOAD',
      });
      expect(okDownload).toBe(true);

      const okTranscode = await recordAnalyticsEvent({
        tenant_id: 100,
        asset_id: 10,
        event_type: 'TRANSCODE',
      });
      expect(okTranscode).toBe(true);

      // Fail-open branch
      (db.pool.query as any).mockRejectedValueOnce(new Error('DB connection timeout'));
      const failOpenResult = await recordAnalyticsEvent({
        tenant_id: 100,
        asset_id: 10,
        event_type: 'DOWNLOAD',
      });
      expect(failOpenResult).toBe(false);
    });

    it('getOverviewMetrics aggregates counts and timeline with fallbacks for null/empty', async () => {
      (db.pool.query as any)
        .mockResolvedValueOnce([
          [
            {
              total_events: 150,
              total_views: 100,
              total_downloads: 25,
              total_streams: 15,
              total_shares: 10,
              total_search_hits: 5,
              total_bytes_served: 50000000,
              active_assets_count: 8,
            },
          ],
        ])
        .mockResolvedValueOnce([
          [
            {
              event_date: '2026-08-20',
              views: 50,
              downloads: 10,
              streams: 5,
              shares: 5,
              bytes_served: 20000000,
            },
            {
              event_date: '2026-08-21',
              views: 50,
              downloads: 15,
              streams: 10,
              shares: 5,
              bytes_served: 30000000,
            },
            {
              event_date: '2026-08-22',
            },
          ],
        ]);

      const res = await getOverviewMetrics(100, 30);
      expect(res.total_events).toBe(150);
      expect(res.total_views).toBe(100);
      expect(res.timeline.length).toBe(3);
      expect(res.active_assets_count).toBe(8);

      // Empty result fallback
      (db.pool.query as any).mockResolvedValueOnce([[]]).mockResolvedValueOnce([null]);
      const emptyOverview = await getOverviewMetrics(100, 30);
      expect(emptyOverview.total_events).toBe(0);
      expect(emptyOverview.timeline).toEqual([]);
    });

    it('getAssetMetrics returns asset telemetry or null if not found', async () => {
      (db.pool.query as any)
        .mockResolvedValueOnce([
          [
            {
              id: 10,
              tenant_id: 100,
              title: 'Promo Video',
              mime_type: 'video/mp4',
              byte_size: 15000000,
              created_at: '2026-08-01T00:00:00.000Z',
              total_views: 40,
              total_downloads: 10,
              total_streams: 25,
              total_shares: 5,
              total_search_hits: 15,
              total_bytes_served: 300000000,
              last_accessed_at: '2026-08-22T10:00:00.000Z',
            },
          ],
        ])
        .mockResolvedValueOnce([
          [
            {
              event_date: '2026-08-22',
              views: 40,
              downloads: 10,
              streams: 25,
              shares: 5,
              bytes_served: 300000000,
            },
            {
              event_date: '2026-08-23',
            },
          ],
        ]);

      const assetMetrics = await getAssetMetrics(100, 10, 30);
      expect(assetMetrics).not.toBeNull();
      expect(assetMetrics?.asset_id).toBe(10);
      expect(assetMetrics?.roi_score).toBeGreaterThan(0);
      expect(assetMetrics?.timeline.length).toBe(2);

      // Asset found with null timeline
      (db.pool.query as any)
        .mockResolvedValueOnce([[{ id: 10, tenant_id: 100, title: 'No Timeline' }]])
        .mockResolvedValueOnce([null]);
      const noTimeline = await getAssetMetrics(100, 10, 30);
      expect(noTimeline?.timeline).toEqual([]);

      // Not found case
      (db.pool.query as any).mockResolvedValueOnce([[]]);
      const notFound = await getAssetMetrics(100, 999, 30);
      expect(notFound).toBeNull();
    });

    it('getTopAssets orders assets by metric and sorts by ROI when requested', async () => {
      (db.pool.query as any).mockResolvedValueOnce([
        [
          {
            asset_id: 10,
            title: 'Popular Hero',
            mime_type: 'image/jpeg',
            byte_size: 2000000,
            window_views: 120,
            window_downloads: 30,
            window_streams: 10,
            window_shares: 8,
            window_bytes: 60000000,
            total_views: 120,
            total_downloads: 30,
            total_streams: 10,
            total_shares: 8,
            total_search_hits: 20,
            last_accessed_at: '2026-08-23T08:00:00.000Z',
          },
          {
            asset_id: 11,
            title: 'Secondary Graphic',
            mime_type: 'image/png',
            byte_size: 8000000,
            window_views: 40,
            window_downloads: 5,
            window_streams: 2,
            window_shares: 1,
            window_bytes: 40000000,
            total_views: 40,
            total_downloads: 5,
            total_streams: 2,
            total_shares: 1,
            total_search_hits: 5,
            last_accessed_at: '2026-08-20T08:00:00.000Z',
          },
          {
            asset_id: 12,
            title: 'Fallback Undefined Metric Asset',
          },
        ],
      ]);

      const topViews = await getTopAssets(100, 'views', 30, 10);
      expect(topViews.results.length).toBe(3);
      expect(topViews.results[0].asset_id).toBe(10);

      // Check different metric filters
      (db.pool.query as any).mockResolvedValueOnce([[{ asset_id: 10, byte_size: 1000 }]]);
      await getTopAssets(100, 'downloads', 30, 10);
      (db.pool.query as any).mockResolvedValueOnce([[{ asset_id: 10, byte_size: 1000 }]]);
      await getTopAssets(100, 'streams', 30, 10);
      (db.pool.query as any).mockResolvedValueOnce([[{ asset_id: 10, byte_size: 1000 }]]);
      await getTopAssets(100, 'shares', 30, 10);
      (db.pool.query as any).mockResolvedValueOnce([[{ asset_id: 10, byte_size: 1000 }]]);
      await getTopAssets(100, 'bytes', 30, 10);

      // ROI metric sorting
      (db.pool.query as any).mockResolvedValueOnce([
        [
          { asset_id: 1, total_views: 5, byte_size: 100000000 },
          { asset_id: 2, total_views: 500, byte_size: 1000000 },
        ],
      ]);
      const topRoi = await getTopAssets(100, 'roi', 30, 10);
      expect(topRoi.results[0].asset_id).toBe(2);

      // Null rows fallback
      (db.pool.query as any).mockResolvedValueOnce([null]);
      const nullTop = await getTopAssets(100, 'views', 30, 10);
      expect(nullTop.results).toEqual([]);
    });

    it('getRoiReport identifies high performing, low performing, and dormant assets with tie-breaking and empty cases', async () => {
      const oldDate = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString();
      const oldAccessDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
      const recentDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

      (db.pool.query as any).mockResolvedValueOnce([
        [
          {
            asset_id: 1,
            title: 'High ROI Banner',
            mime_type: 'image/webp',
            byte_size: 500000,
            created_at: recentDate,
            total_views: 300,
            total_downloads: 50,
            total_streams: 10,
            total_shares: 20,
            total_search_hits: 40,
            total_bytes_served: 25000000,
            last_accessed_at: recentDate,
          },
          {
            asset_id: 2,
            title: 'Dormant Raw Footage',
            mime_type: 'video/mp4',
            byte_size: 100000000,
            created_at: oldDate,
            total_views: 0,
            total_downloads: 0,
            total_streams: 0,
            total_shares: 0,
            total_search_hits: 0,
            total_bytes_served: 0,
            last_accessed_at: null,
          },
          {
            asset_id: 3,
            title: 'Dormant Audio File with Old Access',
            mime_type: 'audio/wav',
            byte_size: 50000000,
            created_at: oldDate,
            total_views: 1,
            total_downloads: 0,
            total_streams: 0,
            total_shares: 0,
            total_search_hits: 0,
            total_bytes_served: 1000,
            last_accessed_at: oldAccessDate,
          },
          {
            asset_id: 4,
            title: 'Tied Low ROI Big Size',
            mime_type: 'application/pdf',
            byte_size: 20000000,
            created_at: recentDate,
            total_views: 0,
            total_downloads: 0,
            total_streams: 0,
            total_shares: 0,
            total_search_hits: 0,
            total_bytes_served: 0,
            last_accessed_at: recentDate,
          },
          {
            asset_id: 5,
            title: 'Undefined Metrics Asset',
            created_at: recentDate,
          },
        ],
      ]);

      const report = await getRoiReport(100, 30, 90, 50);
      expect(report.summary.total_assets).toBe(5);
      expect(report.summary.dormant_candidates_count).toBe(2);
      expect(report.dormant_candidates[0].asset_id).toBe(2);
      expect(report.dormant_candidates[1].asset_id).toBe(3);
      expect(report.high_performing_assets[0].asset_id).toBe(1);

      // Empty result fallback
      (db.pool.query as any).mockResolvedValueOnce([[]]);
      const emptyReport = await getRoiReport(100, 30, 90, 50);
      expect(emptyReport.summary.total_assets).toBe(0);
      expect(emptyReport.summary.average_roi_score).toBe(0.0);

      // Null rows fallback
      (db.pool.query as any).mockResolvedValueOnce([null]);
      const nullReport = await getRoiReport(100, 30, 90, 50);
      expect(nullReport.summary.total_assets).toBe(0);
    });
  });

  describe('3. HTTP Endpoints & Integration Tests', () => {
    const app = express();
    app.use(express.json());
    app.use('/api/v1/analytics', analyticsRouter);

    it('POST /events records authenticated USER event with valid ACL', async () => {
      currentTestUser = { userId: 42, tenantId: 100, role: 'ADMIN' };
      vi.spyOn(aclModule, 'evaluateAclPermission').mockResolvedValue({
        allowed: true,
        reason: 'ADMIN_BYPASS',
      });
      (db.pool.query as any).mockResolvedValue([{ affectedRows: 1 }]);

      const res = await supertest(app).post('/api/v1/analytics/events').send({
        asset_id: 10,
        event_type: 'VIEW',
        actor_type: 'USER',
        bytes_served: 100,
      });

      expect(res.status).toBe(201);
      expect(res.body.data.asset_id).toBe(10);
      expect(res.body.data.event_type).toBe('VIEW');
    });

    it('POST /events rejects USER event if ACL is denied', async () => {
      currentTestUser = { userId: 42, tenantId: 100, role: 'ADMIN' };
      vi.spyOn(aclModule, 'evaluateAclPermission').mockResolvedValue({
        allowed: false,
        reason: 'DEFAULT_DENY',
      });

      const res = await supertest(app).post('/api/v1/analytics/events').send({
        asset_id: 10,
        event_type: 'VIEW',
        actor_type: 'USER',
      });

      expect(res.status).toBe(403);
    });

    it('POST /events records valid GUEST event with valid share_token', async () => {
      vi.spyOn(sharesModule, 'resolveValidShare').mockResolvedValue({
        id: 5,
        asset_id: 10,
        tenant_id: 100,
      });
      (db.pool.query as any).mockResolvedValue([{ affectedRows: 1 }]);

      const res = await supertest(app).post('/api/v1/analytics/events').send({
        asset_id: 10,
        event_type: 'SHARE_ACCESS',
        actor_type: 'GUEST',
        share_token: 'valid-share-token',
      });

      expect(res.status).toBe(201);
      expect(res.body.data.actor_type).toBe('GUEST');
    });

    it('POST /events rejects GUEST event with mismatched or invalid share_token', async () => {
      vi.spyOn(sharesModule, 'resolveValidShare').mockResolvedValue(null);

      const res = await supertest(app).post('/api/v1/analytics/events').send({
        asset_id: 10,
        event_type: 'SHARE_ACCESS',
        actor_type: 'GUEST',
        share_token: 'invalid-token',
      });

      expect(res.status).toBe(403);
    });

    it('POST /events handles unauthenticated USER request with 401', async () => {
      currentTestUser = null;

      const res = await supertest(app).post('/api/v1/analytics/events').send({
        asset_id: 10,
        event_type: 'VIEW',
        actor_type: 'USER',
      });

      expect(res.status).toBe(401);
    });

    it('GET /overview returns overview data for ADMIN and denies non-admin', async () => {
      currentTestUser = { userId: 42, tenantId: 100, role: 'ADMIN' };
      (db.pool.query as any)
        .mockResolvedValueOnce([[{ total_events: 10 }]])
        .mockResolvedValueOnce([[]]);

      const resAdmin = await supertest(app).get('/api/v1/analytics/overview?days=14');
      expect(resAdmin.status).toBe(200);
      expect(resAdmin.body.data.total_events).toBe(10);

      // Non-admin CLIENT
      currentTestUser = { userId: 99, tenantId: 100, role: 'CLIENT' };
      const resForbidden = await supertest(app).get('/api/v1/analytics/overview');
      expect(resForbidden.status).toBe(403);
    });

    it('GET /assets/:id returns detailed metrics with ACL validation', async () => {
      currentTestUser = { userId: 42, tenantId: 100, role: 'ADMIN' };
      vi.spyOn(aclModule, 'evaluateAclPermission').mockResolvedValue({
        allowed: true,
        reason: 'ADMIN_BYPASS',
      });
      (db.pool.query as any)
        .mockResolvedValueOnce([
          [
            {
              id: 10,
              tenant_id: 100,
              title: 'Asset',
              mime_type: 'image/jpeg',
              byte_size: 2000,
              total_views: 10,
            },
          ],
        ])
        .mockResolvedValueOnce([[]]);

      const res = await supertest(app).get('/api/v1/analytics/assets/10?days=60');
      expect(res.status).toBe(200);
      expect(res.body.data.asset_id).toBe(10);

      // Call without days query
      (db.pool.query as any)
        .mockResolvedValueOnce([
          [
            {
              id: 10,
              tenant_id: 100,
              title: 'Asset',
              mime_type: 'image/jpeg',
              byte_size: 2000,
              total_views: 10,
            },
          ],
        ])
        .mockResolvedValueOnce([[]]);
      const resNoDays = await supertest(app).get('/api/v1/analytics/assets/10');
      expect(resNoDays.status).toBe(200);

      // Invalid ID
      const resInvalid = await supertest(app).get('/api/v1/analytics/assets/abc');
      expect(resInvalid.status).toBe(400);

      // ACL Denied
      vi.spyOn(aclModule, 'evaluateAclPermission').mockResolvedValueOnce({
        allowed: false,
        reason: 'DEFAULT_DENY',
      });
      const resAclDenied = await supertest(app).get('/api/v1/analytics/assets/10');
      expect(resAclDenied.status).toBe(403);

      // Not Found
      vi.spyOn(aclModule, 'evaluateAclPermission').mockResolvedValueOnce({
        allowed: true,
        reason: 'ADMIN_BYPASS',
      });
      (db.pool.query as any).mockResolvedValueOnce([[]]);
      const resNotFound = await supertest(app).get('/api/v1/analytics/assets/999');
      expect(resNotFound.status).toBe(404);
    });

    it('GET /top-assets returns ranked assets for ADMIN with and without query params', async () => {
      currentTestUser = { userId: 42, tenantId: 100, role: 'ADMIN' };
      (db.pool.query as any).mockResolvedValueOnce([
        [{ asset_id: 1, title: 'Top 1', byte_size: 1000, window_views: 50 }],
      ]);

      const res = await supertest(app).get(
        '/api/v1/analytics/top-assets?metric=views&days=14&limit=5',
      );
      expect(res.status).toBe(200);
      expect(res.body.data.results.length).toBe(1);

      // Without query parameters to test default fallbacks
      (db.pool.query as any).mockResolvedValueOnce([
        [{ asset_id: 1, title: 'Top 1', byte_size: 1000, window_views: 50 }],
      ]);
      const resDefault = await supertest(app).get('/api/v1/analytics/top-assets');
      expect(resDefault.status).toBe(200);
    });

    it('GET /roi-report returns executive report for ADMIN with and without query params', async () => {
      currentTestUser = { userId: 42, tenantId: 100, role: 'ADMIN' };
      (db.pool.query as any).mockResolvedValueOnce([
        [
          {
            asset_id: 1,
            title: 'Asset 1',
            byte_size: 1000,
            total_views: 10,
            created_at: new Date().toISOString(),
          },
        ],
      ]);

      const res = await supertest(app).get(
        '/api/v1/analytics/roi-report?days=30&dormant_threshold_days=60&limit=25',
      );
      expect(res.status).toBe(200);
      expect(res.body.data.summary.total_assets).toBe(1);

      // Without query parameters to test default fallbacks
      (db.pool.query as any).mockResolvedValueOnce([
        [
          {
            asset_id: 1,
            title: 'Asset 1',
            byte_size: 1000,
            total_views: 10,
            created_at: new Date().toISOString(),
          },
        ],
      ]);
      const resDefault = await supertest(app).get('/api/v1/analytics/roi-report');
      expect(resDefault.status).toBe(200);
    });

    it('getClientIp helper resolves IP correctly from headers or socket', () => {
      const mockReqForwarded = {
        headers: { 'x-forwarded-for': '203.0.113.195, 70.41.3.18' },
      } as unknown as Request;
      expect(getClientIp(mockReqForwarded)).toBe('203.0.113.195');

      const mockReqDirect = {
        headers: {},
        ip: '10.0.0.5',
      } as unknown as Request;
      expect(getClientIp(mockReqDirect)).toBe('10.0.0.5');

      const mockReqFallback = {
        headers: {},
        socket: { remoteAddress: '192.168.1.1' },
      } as unknown as Request;
      expect(getClientIp(mockReqFallback)).toBe('192.168.1.1');

      const mockReqUltimateFallback = {
        headers: {},
      } as unknown as Request;
      expect(getClientIp(mockReqUltimateFallback)).toBe('127.0.0.1');
    });

    it('handles unexpected controller server errors gracefully (500)', async () => {
      currentTestUser = { userId: 42, tenantId: 100, role: 'ADMIN' };
      vi.spyOn(aclModule, 'evaluateAclPermission').mockRejectedValueOnce(new Error('ACL crash'));
      const resEventError = await supertest(app)
        .post('/api/v1/analytics/events')
        .send({ asset_id: 10, event_type: 'VIEW', actor_type: 'USER' });
      expect(resEventError.status).toBe(500);

      (db.pool.query as any).mockRejectedValueOnce(new Error('DB crash'));
      const resOverviewError = await supertest(app).get('/api/v1/analytics/overview');
      expect(resOverviewError.status).toBe(500);

      vi.spyOn(aclModule, 'evaluateAclPermission').mockResolvedValueOnce({
        allowed: true,
        reason: 'ADMIN_BYPASS',
      });
      (db.pool.query as any).mockRejectedValueOnce(new Error('DB crash'));
      const resAssetError = await supertest(app).get('/api/v1/analytics/assets/10');
      expect(resAssetError.status).toBe(500);

      (db.pool.query as any).mockRejectedValueOnce(new Error('DB crash'));
      const resTopError = await supertest(app).get('/api/v1/analytics/top-assets');
      expect(resTopError.status).toBe(500);

      (db.pool.query as any).mockRejectedValueOnce(new Error('DB crash'));
      const resRoiError = await supertest(app).get('/api/v1/analytics/roi-report');
      expect(resRoiError.status).toBe(500);
    });

    it('rate limiters trigger 429 response when limit exceeded', async () => {
      const appLimit = express();
      appLimit.use(analyticsRateLimiter);
      appLimit.get('/test-analytics-limit', (_req, res) => res.json({ ok: true }));

      for (let i = 0; i < 30; i++) {
        await supertest(appLimit).get('/test-analytics-limit');
      }
      const resBlocked = await supertest(appLimit).get('/test-analytics-limit');
      expect(resBlocked.status).toBe(429);
      expect(resBlocked.body.message).toMatch(/Límite de consultas de analíticas/);

      const appEventsLimit = express();
      appEventsLimit.use(analyticsEventsRateLimiter);
      appEventsLimit.get('/test-events-limit', (_req, res) => res.json({ ok: true }));

      for (let i = 0; i < 60; i++) {
        await supertest(appEventsLimit).get('/test-events-limit');
      }
      const resEventsBlocked = await supertest(appEventsLimit).get('/test-events-limit');
      expect(resEventsBlocked.status).toBe(429);
      expect(resEventsBlocked.body.message).toMatch(/Límite de registro de eventos de telemetría/);
    });
  });
});
