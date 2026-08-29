import fs from 'fs';
import path from 'path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import supertest from 'supertest';
import express, { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import {
  VideoWatermarkTypeEnum,
  VideoWatermarkPositionStrategyEnum,
  createVideoWatermarkBodySchema,
  listVideoWatermarkQuerySchema,
  videoWatermarkParamSchema,
} from '../../../server/src/schemas/videoWatermark.schema';
import {
  escapeXml,
  computeWatermarkTrajectory,
  getForensicHmacSecret,
  generateForensicPayload,
  resolveVideoWatermarkParameters,
  generateForensicValidationCardSvg,
  createOrUpdateVideoWatermark,
  listAssetVideoWatermarks,
  getAssetVideoWatermarkById,
  deleteAssetVideoWatermark,
} from '../../../server/src/utils/videoWatermarkEngine';
import { STORAGE_ROOT } from '../../../server/src/utils/storage';
import { videoWatermarkRateLimiter } from '../../../server/src/middleware/rateLimiter';
import * as db from '../../../server/src/db';
import { evaluateAclPermission } from '../../../server/src/utils/acl';
import { dispatchWebhookEvent } from '../../../server/src/utils/webhookDispatcher';
import assetsRouter from '../../../server/src/routes/assets';

vi.mock('../../../server/src/db', () => ({
  query: vi.fn(),
  pool: {
    execute: vi.fn(),
    getConnection: vi.fn(),
  },
}));

vi.mock('../../../server/src/middleware/auditLogger', () => ({
  logSecurityEvent: vi.fn().mockResolvedValue(undefined),
  auditLogger: vi.fn((_req, _res, next) => next()),
}));

vi.mock('../../../server/src/utils/acl', () => ({
  evaluateAclPermission: vi.fn().mockResolvedValue({ allowed: true, reason: 'ADMIN_BYPASS' }),
}));

vi.mock('../../../server/src/utils/webhookDispatcher', () => ({
  dispatchWebhookEvent: vi.fn().mockResolvedValue(undefined),
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
      tid: payload.tenantId,
      permissions: ['*'],
    },
    TEST_SECRET,
    { algorithm: 'HS512', expiresIn: '1h' },
  );
}

const adminToken = makeToken({ userId: 1, role: 'ADMIN', tenantId: 100 });
const memberToken = makeToken({ userId: 2, role: 'MEMBER', tenantId: 100 });

let ipCounter = 1;
function getNextIp(): string {
  ipCounter++;
  const octet3 = Math.floor(ipCounter / 250) % 250;
  const octet4 = (ipCounter % 250) + 1;
  return `10.99.${octet3}.${octet4}`;
}

const app = express();
app.set('trust proxy', true);
app.use(express.json());
app.use('/api/v1/assets', assetsRouter);

describe('DAM AI Dynamic Video Watermarking & Forensic Tracking (FC 036)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Zod Validation Schemas (videoWatermark.schema.ts)', () => {
    it('validates VideoWatermarkTypeEnum values', () => {
      expect(VideoWatermarkTypeEnum.parse('DYNAMIC_OVERLAY')).toBe('DYNAMIC_OVERLAY');
      expect(VideoWatermarkTypeEnum.parse('FORENSIC_STEGANOGRAPHIC')).toBe(
        'FORENSIC_STEGANOGRAPHIC',
      );
      expect(VideoWatermarkTypeEnum.parse('BURNED_TIMECODE')).toBe('BURNED_TIMECODE');
      expect(VideoWatermarkTypeEnum.parse('USER_IDENTIFIER_STAMP')).toBe('USER_IDENTIFIER_STAMP');
      expect(() => VideoWatermarkTypeEnum.parse('INVALID_TYPE')).toThrow();
    });

    it('validates VideoWatermarkPositionStrategyEnum values', () => {
      expect(VideoWatermarkPositionStrategyEnum.parse('STATIC_CORNER')).toBe('STATIC_CORNER');
      expect(VideoWatermarkPositionStrategyEnum.parse('FLOATING_BOUNCE')).toBe('FLOATING_BOUNCE');
      expect(VideoWatermarkPositionStrategyEnum.parse('RANDOM_INTERVALS')).toBe('RANDOM_INTERVALS');
      expect(VideoWatermarkPositionStrategyEnum.parse('CENTER_TILED')).toBe('CENTER_TILED');
      expect(() => VideoWatermarkPositionStrategyEnum.parse('INVALID_STRATEGY')).toThrow();
    });

    it('validates createVideoWatermarkBodySchema with defaults', () => {
      const parsed = createVideoWatermarkBodySchema.parse({});
      expect(parsed.watermark_type).toBe('DYNAMIC_OVERLAY');
      expect(parsed.position_strategy).toBe('STATIC_CORNER');
      expect(parsed.opacity).toBe(0.5);
      expect(parsed.font_size).toBe(24);
      expect(parsed.font_color).toBe('#FFFFFF');
      expect(parsed.interval_seconds).toBe(10);
      expect(parsed.width).toBe(1280);
      expect(parsed.height).toBe(720);
    });

    it('validates createVideoWatermarkBodySchema with custom valid values', () => {
      const parsed = createVideoWatermarkBodySchema.parse({
        watermark_type: 'USER_IDENTIFIER_STAMP',
        position_strategy: 'FLOATING_BOUNCE',
        opacity: '0.85',
        user_identifier: 'john.doe@dreamtek.tech',
        text_overlay: 'INTERNAL CONFIDENTIAL',
        font_size: '32',
        font_color: '#FFCC00',
        interval_seconds: '15',
        width: '1920',
        height: '1080',
        tracking_payload: { project: 'Apollo' },
      });
      expect(parsed.watermark_type).toBe('USER_IDENTIFIER_STAMP');
      expect(parsed.position_strategy).toBe('FLOATING_BOUNCE');
      expect(parsed.opacity).toBe(0.85);
      expect(parsed.user_identifier).toBe('john.doe@dreamtek.tech');
      expect(parsed.font_size).toBe(32);
      expect(parsed.font_color).toBe('#FFCC00');
      expect(parsed.interval_seconds).toBe(15);
      expect(parsed.width).toBe(1920);
      expect(parsed.height).toBe(1080);
      expect(parsed.tracking_payload).toEqual({ project: 'Apollo' });
    });

    it('fails createVideoWatermarkBodySchema on out-of-range values', () => {
      expect(() => createVideoWatermarkBodySchema.parse({ opacity: 0.01 })).toThrow();
      expect(() => createVideoWatermarkBodySchema.parse({ opacity: 1.5 })).toThrow();
      expect(() => createVideoWatermarkBodySchema.parse({ font_size: 5 })).toThrow();
      expect(() => createVideoWatermarkBodySchema.parse({ font_size: 200 })).toThrow();
      expect(() => createVideoWatermarkBodySchema.parse({ font_color: 'invalid-hex' })).toThrow();
      expect(() => createVideoWatermarkBodySchema.parse({ interval_seconds: 0 })).toThrow();
      expect(() => createVideoWatermarkBodySchema.parse({ interval_seconds: 500 })).toThrow();
      expect(() =>
        createVideoWatermarkBodySchema.parse({ user_identifier: 'a'.repeat(300) }),
      ).toThrow();
    });

    it('validates listVideoWatermarkQuerySchema', () => {
      const parsedDefault = listVideoWatermarkQuerySchema.parse({});
      expect(parsedDefault.limit).toBe(50);
      expect(parsedDefault.offset).toBe(0);

      const parsedCustom = listVideoWatermarkQuerySchema.parse({
        limit: '20',
        offset: '10',
        watermark_type: 'BURNED_TIMECODE',
      });
      expect(parsedCustom.limit).toBe(20);
      expect(parsedCustom.offset).toBe(10);
      expect(parsedCustom.watermark_type).toBe('BURNED_TIMECODE');

      expect(() => listVideoWatermarkQuerySchema.parse({ limit: 0 })).toThrow();
      expect(() => listVideoWatermarkQuerySchema.parse({ limit: 200 })).toThrow();
      expect(() => listVideoWatermarkQuerySchema.parse({ offset: -1 })).toThrow();
    });

    it('validates videoWatermarkParamSchema', () => {
      const parsed = videoWatermarkParamSchema.parse({ id: '15', watermarkId: '3' });
      expect(parsed.id).toBe(15);
      expect(parsed.watermarkId).toBe(3);

      expect(() => videoWatermarkParamSchema.parse({ id: '0', watermarkId: '1' })).toThrow();
      expect(() => videoWatermarkParamSchema.parse({ id: '1', watermarkId: '-2' })).toThrow();
      expect(() => videoWatermarkParamSchema.parse({ id: 'abc', watermarkId: '1' })).toThrow();
    });
  });

  describe('2. Core Engine Utilities (videoWatermarkEngine.ts)', () => {
    it('escapes XML special characters safely', () => {
      expect(escapeXml('normal string')).toBe('normal string');
      expect(escapeXml('<script>alert("xss") & test \'quoted\'</script>')).toBe(
        '&lt;script&gt;alert(&quot;xss&quot;) &amp; test &apos;quoted&apos;&lt;/script&gt;',
      );
    });

    it('computes watermark trajectory for all strategies and fallbacks', () => {
      // STATIC_CORNER
      const staticPoints = computeWatermarkTrajectory('STATIC_CORNER', 10, 1, 1920, 1080);
      expect(staticPoints.length).toBe(1);
      expect(staticPoints[0].time_seconds).toBe(0);
      expect(staticPoints[0].x).toBe(1700);
      expect(staticPoints[0].y).toBe(1020);

      // FLOATING_BOUNCE
      const bouncePoints = computeWatermarkTrajectory('FLOATING_BOUNCE', 10, 1, 1280, 720, 10, 60);
      expect(bouncePoints.length).toBeGreaterThan(1);
      expect(bouncePoints[0].time_seconds).toBe(0);

      // RANDOM_INTERVALS
      const randomPoints = computeWatermarkTrajectory('RANDOM_INTERVALS', 10, 1, 1280, 720, 10, 60);
      expect(randomPoints.length).toBeGreaterThan(1);

      // CENTER_TILED and default fallback
      const tiledPoints = computeWatermarkTrajectory('CENTER_TILED', 10, 1, 1280, 720);
      expect(tiledPoints.length).toBe(3);

      // Edge cases: small dimensions and intervals
      const smallPoints = computeWatermarkTrajectory('STATIC_CORNER', 10, 1, 50, 40, 0, 0);
      expect(smallPoints.length).toBe(1);
      expect(smallPoints[0].x).toBe(20);
      expect(smallPoints[0].y).toBe(20);
    });

    it('generates deterministic HMAC forensic payload with and without secret', () => {
      const res1 = generateForensicPayload(100, 10, 1, 'felipe@dreamtek.tech', { leak_id: 'L1' });
      expect(res1.payload.tenant_id).toBe(100);
      expect(res1.payload.user_identifier).toBe('felipe@dreamtek.tech');
      expect(res1.hmac_signature).toBeDefined();
      expect(res1.verification_digest).toHaveLength(16);

      // Without userIdentifier and customPayload fallback
      const res2 = generateForensicPayload(100, 10, 1);
      expect(res2.payload.user_identifier).toBe('tenant-user-100');
      expect(res2.payload.custom_tracking).toEqual({});

      // Without process.env.JWT_SECRET fallback
      const prevSecret = process.env.JWT_SECRET;
      delete process.env.JWT_SECRET;
      const res3 = generateForensicPayload(100, 10, 1);
      expect(res3.hmac_signature).toBeDefined();
      process.env.JWT_SECRET = prevSecret;
    });

    it('tests getForensicHmacSecret behavior in dev and production', () => {
      const prevEnv = process.env.NODE_ENV;
      const prevSecret = process.env.JWT_SECRET;

      // With secret
      process.env.JWT_SECRET = 'my_secret';
      expect(getForensicHmacSecret()).toBe('my_secret');

      // Without secret in dev
      delete process.env.JWT_SECRET;
      process.env.NODE_ENV = 'development';
      expect(getForensicHmacSecret()).toBe('dreamtek_dev_jwt_secret_key_2026');

      // Without secret in production (throws FATAL error)
      process.env.NODE_ENV = 'production';
      expect(() => getForensicHmacSecret()).toThrow('FATAL SECURITY ERROR');

      process.env.NODE_ENV = prevEnv;
      process.env.JWT_SECRET = prevSecret;
    });

    it('resolves video watermark parameters with all combinations of defaults and overrides', () => {
      const resDefault = resolveVideoWatermarkParameters(100, 5, 1, {});
      expect(resDefault.watermark_type).toBe('DYNAMIC_OVERLAY');
      expect(resDefault.position_strategy).toBe('STATIC_CORNER');
      expect(resDefault.text_overlay).toBe('DREAMTEK WATERMARK #5');
      expect(resDefault.font_color).toBe('#FFFFFF');
      expect(resDefault.tracking_payload).toBeNull();

      const resUser = resolveVideoWatermarkParameters(100, 5, 1, {
        user_identifier: 'user123',
      });
      expect(resUser.text_overlay).toBe('CONFIDENTIAL - user123');

      const resCustom = resolveVideoWatermarkParameters(100, 5, 1, {
        watermark_type: 'FORENSIC_STEGANOGRAPHIC',
        text_overlay: 'CUSTOM OVERLAY',
        opacity: 0.9,
        font_size: 40,
        font_color: '#FF0000',
        interval_seconds: 20,
        width: 1920,
        height: 1080,
      });
      expect(resCustom.text_overlay).toBe('CUSTOM OVERLAY');
      expect(resCustom.opacity).toBe(0.9);
      expect(resCustom.font_size).toBe(40);
      expect(resCustom.font_color).toBe('#FF0000');
      expect(resCustom.interval_seconds).toBe(20);
      expect(resCustom.metadata.forensic_signature).toBeDefined();
      expect(resCustom.tracking_payload).toBeDefined();

      const resNonStegoWithPayload = resolveVideoWatermarkParameters(100, 5, 1, {
        watermark_type: 'DYNAMIC_OVERLAY',
        tracking_payload: { test: true },
      });
      expect(resNonStegoWithPayload.tracking_payload).toEqual({ test: true });
    });

    it('generates SVG validation card with escaped content and trajectory point fallback', () => {
      const resolved = resolveVideoWatermarkParameters(100, 5, 1, {
        text_overlay: 'Test <SVG> "Card"',
        user_identifier: 'test & <user>',
      });
      const svg = generateForensicValidationCardSvg(100, 5, 1, resolved.metadata);
      expect(svg).toContain('<svg');
      expect(svg).toContain('Test &lt;SVG&gt; &quot;Card&quot;');
      expect(svg).toContain('test &amp; &lt;user&gt;');
      expect(svg).toContain('Verification Digest: [');

      // Empty trajectory points and null user identifier fallback
      const emptyMeta = {
        ...resolved.metadata,
        user_identifier: null,
        trajectory_points: [],
      };
      const svgFallback = generateForensicValidationCardSvg(100, 5, 1, emptyMeta);
      expect(svgFallback).toContain('User Identifier: None');
      expect(svgFallback).toContain('x="100" y="100"');
    });
  });

  describe('3. Database Operations & Engine Logic', () => {
    it('creates or updates a video watermark record in DB', async () => {
      // Mock existing check: empty (insert new)
      vi.mocked(db.query)
        .mockResolvedValueOnce([]) // existing check
        .mockResolvedValueOnce({ insertId: 1 }) // insert
        .mockResolvedValueOnce([
          {
            id: 1,
            tenant_id: 100,
            asset_id: 10,
            version_id: 1,
            watermark_type: 'DYNAMIC_OVERLAY',
            position_strategy: 'STATIC_CORNER',
            opacity: 0.5,
            user_identifier: null,
            tracking_payload: null,
            output_derivative_path: '/tmp/watermark.webp',
            watermark_metadata: JSON.stringify({
              watermark_type: 'DYNAMIC_OVERLAY',
              position_strategy: 'STATIC_CORNER',
              opacity: 0.5,
              user_identifier: null,
              text_overlay: 'DREAMTEK WATERMARK #10',
              font_size: 24,
              font_color: '#FFFFFF',
              interval_seconds: 10,
              trajectory_points: [{ time_seconds: 0, x: 1060, y: 660 }],
              verification_digest: 'A1B2C3D4E5F67890',
              card_width: 1280,
              card_height: 720,
            }),
          },
        ]);

      const record = await createOrUpdateVideoWatermark(100, 10, 1, {});
      expect(record.id).toBe(1);
      expect(record.watermark_type).toBe('DYNAMIC_OVERLAY');
      expect(record.watermark_metadata.text_overlay).toBe('DREAMTEK WATERMARK #10');
      expect(dispatchWebhookEvent).toHaveBeenCalled();
    });

    it('updates existing record and deletes old derivative file if present', async () => {
      const oldFile = path.join(
        STORAGE_ROOT,
        'derivatives',
        '100',
        'video_watermarks',
        'old_wm.webp',
      );
      const dir = path.dirname(oldFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(oldFile, 'fake-old-content');

      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: 1, output_derivative_path: oldFile }]) // existing check
        .mockResolvedValueOnce({ affectedRows: 1 }) // update
        .mockResolvedValueOnce([
          {
            id: 1,
            tenant_id: 100,
            asset_id: 10,
            version_id: 1,
            watermark_type: 'DYNAMIC_OVERLAY',
            position_strategy: 'FLOATING_BOUNCE',
            opacity: 0.8,
            user_identifier: 'updated@dreamtek.tech',
            tracking_payload: JSON.stringify({ updated: true }),
            output_derivative_path: '/tmp/new_watermark.webp',
            watermark_metadata: {
              watermark_type: 'DYNAMIC_OVERLAY',
              position_strategy: 'FLOATING_BOUNCE',
              opacity: 0.8,
              user_identifier: 'updated@dreamtek.tech',
              text_overlay: 'CONFIDENTIAL - updated@dreamtek.tech',
              font_size: 24,
              font_color: '#FFFFFF',
              interval_seconds: 10,
              trajectory_points: [],
              verification_digest: 'A1B2C3D4E5F67890',
              card_width: 1280,
              card_height: 720,
            },
          },
        ]);

      const record = await createOrUpdateVideoWatermark(100, 10, 1, {
        position_strategy: 'FLOATING_BOUNCE',
        opacity: 0.8,
        user_identifier: 'updated@dreamtek.tech',
        tracking_payload: { updated: true },
      });

      expect(record.id).toBe(1);
      expect(record.position_strategy).toBe('FLOATING_BOUNCE');
      expect(fs.existsSync(oldFile)).toBe(false);
    });

    it('updates existing record when old derivative file does not exist on disk', async () => {
      const nonExistentOldFile = path.join(
        STORAGE_ROOT,
        'derivatives',
        '100',
        'video_watermarks',
        'missing_old_wm.webp',
      );

      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: 1, output_derivative_path: nonExistentOldFile }]) // existing check
        .mockResolvedValueOnce({ affectedRows: 1 }) // update
        .mockResolvedValueOnce([
          {
            id: 1,
            tenant_id: 100,
            asset_id: 10,
            version_id: 1,
            watermark_type: 'DYNAMIC_OVERLAY',
            position_strategy: 'STATIC_CORNER',
            opacity: 0.5,
            user_identifier: null,
            tracking_payload: { already_parsed: true }, // object side
            output_derivative_path: '/tmp/wm.webp',
            watermark_metadata: { already_parsed: true, verification_digest: 'TEST' }, // object side
          },
        ]);

      const record = await createOrUpdateVideoWatermark(100, 10, 1, {});
      expect(record.id).toBe(1);
      expect(record.tracking_payload).toEqual({ already_parsed: true });
      expect(record.watermark_metadata).toEqual({
        already_parsed: true,
        verification_digest: 'TEST',
      });
    });

    it('updates existing record when old output_derivative_path is null', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: 1, output_derivative_path: null }]) // existing check with null oldPath
        .mockResolvedValueOnce({ affectedRows: 1 }) // update
        .mockResolvedValueOnce([
          {
            id: 1,
            tenant_id: 100,
            asset_id: 10,
            version_id: 1,
            watermark_type: 'DYNAMIC_OVERLAY',
            position_strategy: 'STATIC_CORNER',
            opacity: 0.5,
            user_identifier: null,
            tracking_payload: null,
            output_derivative_path: '/tmp/wm.webp',
            watermark_metadata: {},
          },
        ]);

      const record = await createOrUpdateVideoWatermark(100, 10, 1, {});
      expect(record.id).toBe(1);
    });

    it('lists video watermark records with and without filters', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 1,
          tenant_id: 100,
          asset_id: 10,
          version_id: 1,
          watermark_type: 'DYNAMIC_OVERLAY',
          position_strategy: 'STATIC_CORNER',
          opacity: 0.5,
          user_identifier: null,
          tracking_payload: null,
          output_derivative_path: null,
          watermark_metadata: JSON.stringify({
            watermark_type: 'DYNAMIC_OVERLAY',
            verification_digest: 'ABC',
          }),
        },
      ]);

      const list = await listAssetVideoWatermarks(100, 10, 20, 0, 'DYNAMIC_OVERLAY');
      expect(list.length).toBe(1);
      expect(list[0].watermark_type).toBe('DYNAMIC_OVERLAY');

      // Without filter and with string tracking_payload and object watermark_metadata
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 2,
          tenant_id: 100,
          asset_id: 10,
          version_id: 1,
          watermark_type: 'DYNAMIC_OVERLAY',
          position_strategy: 'STATIC_CORNER',
          opacity: 0.5,
          user_identifier: null,
          tracking_payload: JSON.stringify({ string_payload: true }),
          output_derivative_path: null,
          watermark_metadata: { verification_digest: 'DEF' },
        },
      ]);

      const list2 = await listAssetVideoWatermarks(100, 10);
      expect(list2.length).toBe(1);
      expect(list2[0].tracking_payload).toEqual({ string_payload: true });
      expect(list2[0].watermark_metadata).toEqual({ verification_digest: 'DEF' });
    });

    it('retrieves single video watermark record by ID or returns null', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            id: 2,
            tenant_id: 100,
            asset_id: 10,
            version_id: 1,
            watermark_type: 'USER_IDENTIFIER_STAMP',
            position_strategy: 'CENTER_TILED',
            opacity: 0.6,
            user_identifier: 'agent@dreamtek.tech',
            tracking_payload: null,
            output_derivative_path: null,
            watermark_metadata: {
              watermark_type: 'USER_IDENTIFIER_STAMP',
              verification_digest: 'XYZ',
            },
          },
        ]);

      const notFound = await getAssetVideoWatermarkById(100, 10, 999);
      expect(notFound).toBeNull();

      const found = await getAssetVideoWatermarkById(100, 10, 2);
      expect(found).not.toBeNull();
      expect(found?.user_identifier).toBe('agent@dreamtek.tech');

      // Test with stringified JSON payload and metadata
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 3,
          tenant_id: 100,
          asset_id: 10,
          version_id: 1,
          watermark_type: 'USER_IDENTIFIER_STAMP',
          position_strategy: 'CENTER_TILED',
          opacity: 0.6,
          user_identifier: 'agent@dreamtek.tech',
          tracking_payload: JSON.stringify({ payload_str: true }),
          output_derivative_path: null,
          watermark_metadata: JSON.stringify({
            watermark_type: 'USER_IDENTIFIER_STAMP',
            verification_digest: 'XYZ_STR',
          }),
        },
      ]);

      const foundStr = await getAssetVideoWatermarkById(100, 10, 3);
      expect(foundStr).not.toBeNull();
      expect(foundStr?.tracking_payload).toEqual({ payload_str: true });
      expect(foundStr?.watermark_metadata).toEqual({
        watermark_type: 'USER_IDENTIFIER_STAMP',
        verification_digest: 'XYZ_STR',
      });
    });

    it('deletes video watermark record and unlinks derivative file', async () => {
      const filePath = path.join(
        STORAGE_ROOT,
        'derivatives',
        '100',
        'video_watermarks',
        'delete_wm.webp',
      );
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filePath, 'fake-delete-content');

      // Not found case
      vi.mocked(db.query).mockResolvedValueOnce([]);
      const del1 = await deleteAssetVideoWatermark(100, 10, 999);
      expect(del1).toBe(false);

      // Found case with file
      vi.mocked(db.query)
        .mockResolvedValueOnce([
          {
            id: 5,
            tenant_id: 100,
            asset_id: 10,
            version_id: 1,
            watermark_type: 'DYNAMIC_OVERLAY',
            position_strategy: 'STATIC_CORNER',
            opacity: 0.5,
            user_identifier: null,
            tracking_payload: null,
            output_derivative_path: filePath,
            watermark_metadata: {},
          },
        ])
        .mockResolvedValueOnce({ affectedRows: 1 });

      const del2 = await deleteAssetVideoWatermark(100, 10, 5);
      expect(del2).toBe(true);
      expect(fs.existsSync(filePath)).toBe(false);
      expect(dispatchWebhookEvent).toHaveBeenCalled();

      // Found case without derivative path
      vi.mocked(db.query)
        .mockResolvedValueOnce([
          {
            id: 6,
            tenant_id: 100,
            asset_id: 10,
            version_id: 1,
            watermark_type: 'DYNAMIC_OVERLAY',
            position_strategy: 'STATIC_CORNER',
            opacity: 0.5,
            user_identifier: null,
            tracking_payload: null,
            output_derivative_path: null,
            watermark_metadata: {},
          },
        ])
        .mockResolvedValueOnce({ affectedRows: 1 });

      const del3 = await deleteAssetVideoWatermark(100, 10, 6);
      expect(del3).toBe(true);

      // Found case with derivative path but file already missing on disk
      vi.mocked(db.query)
        .mockResolvedValueOnce([
          {
            id: 7,
            tenant_id: 100,
            asset_id: 10,
            version_id: 1,
            watermark_type: 'DYNAMIC_OVERLAY',
            position_strategy: 'STATIC_CORNER',
            opacity: 0.5,
            user_identifier: null,
            tracking_payload: null,
            output_derivative_path: path.join(
              STORAGE_ROOT,
              'derivatives',
              '100',
              'video_watermarks',
              'nonexistent_wm.webp',
            ),
            watermark_metadata: {},
          },
        ])
        .mockResolvedValueOnce({ affectedRows: 1 });

      const del4 = await deleteAssetVideoWatermark(100, 10, 7);
      expect(del4).toBe(true);
    });

    it('handles createOrUpdate when existing row has null output_derivative_path', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: 1, output_derivative_path: null }]) // existing check with null path
        .mockResolvedValueOnce({ affectedRows: 1 }) // update
        .mockResolvedValueOnce([
          {
            id: 1,
            tenant_id: 100,
            asset_id: 10,
            version_id: 1,
            watermark_type: 'DYNAMIC_OVERLAY',
            position_strategy: 'STATIC_CORNER',
            opacity: 0.5,
            user_identifier: null,
            tracking_payload: null,
            output_derivative_path: '/tmp/wm.webp',
            watermark_metadata: {},
          },
        ]);

      const record = await createOrUpdateVideoWatermark(100, 10, 1, {});
      expect(record.id).toBe(1);
    });
  });

  describe('4. REST Endpoints Integration (assets.ts)', () => {
    describe('Rate Limiter', () => {
      it('videoWatermarkRateLimiter responds with 429 when 30 requests exceeded', async () => {
        const rateLimitApp = express();
        rateLimitApp.set('trust proxy', true);
        rateLimitApp.use('/test-rl', videoWatermarkRateLimiter, (_req: Request, res: Response) => {
          res.json({ ok: true });
        });

        const clientIp = '10.99.88.77';
        for (let i = 0; i < 30; i++) {
          const res = await supertest(rateLimitApp)
            .get('/test-rl')
            .set('X-Forwarded-For', clientIp);
          expect(res.status).toBe(200);
        }

        const resBlocked = await supertest(rateLimitApp)
          .get('/test-rl')
          .set('X-Forwarded-For', clientIp);
        expect(resBlocked.status).toBe(429);
        expect(resBlocked.body.error).toBe('Too Many Requests');
      });
    });

    describe('POST /api/v1/assets/:id/video-watermark', () => {
      it('returns 401 if unauthenticated', async () => {
        const res = await supertest(app)
          .post('/api/v1/assets/10/video-watermark')
          .set('X-Forwarded-For', getNextIp())
          .send({});
        expect(res.status).toBe(401);
      });

      it('returns 400 if invalid request body', async () => {
        const res = await supertest(app)
          .post('/api/v1/assets/10/video-watermark')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-Forwarded-For', getNextIp())
          .send({ opacity: 2.0 });
        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Validation Error');
      });

      it('returns 400 if asset ID is invalid or <= 0', async () => {
        const res = await supertest(app)
          .post('/api/v1/assets/0/video-watermark')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-Forwarded-For', getNextIp())
          .send({});
        expect(res.status).toBe(400);
      });

      it('returns 404 if asset not found in tenant', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([]); // asset check

        const res = await supertest(app)
          .post('/api/v1/assets/10/video-watermark')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-Forwarded-For', getNextIp())
          .send({});
        expect(res.status).toBe(404);
        expect(res.body.message).toContain('Activo digital no encontrado');
      });

      it('returns 400 if asset mime_type is not video/* or null', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([{ id: 10, mime_type: 'image/png' }]);

        const res = await supertest(app)
          .post('/api/v1/assets/10/video-watermark')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-Forwarded-For', getNextIp())
          .send({});
        expect(res.status).toBe(400);
        expect(res.body.message).toContain('se requiere MIME type video/*');

        // Case when mime_type is null
        vi.mocked(db.query).mockResolvedValueOnce([{ id: 10, mime_type: null }]);
        const resNull = await supertest(app)
          .post('/api/v1/assets/10/video-watermark')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-Forwarded-For', getNextIp())
          .send({});
        expect(resNull.status).toBe(400);
        expect(resNull.body.message).toContain('se requiere MIME type video/*');
      });

      it('returns 403 if ACL EDIT permission is denied', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([{ id: 10, mime_type: 'video/mp4' }]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({
          allowed: false,
          reason: 'DENIED',
        });

        const res = await supertest(app)
          .post('/api/v1/assets/10/video-watermark')
          .set('Authorization', `Bearer ${memberToken}`)
          .set('X-Forwarded-For', getNextIp())
          .send({});
        expect(res.status).toBe(403);
        expect(res.body.error).toBe('Forbidden');
      });

      it('returns 201 Created on success with truthy current_version_id', async () => {
        vi.mocked(db.query)
          .mockResolvedValueOnce([{ id: 10, current_version_id: 2, mime_type: 'video/mp4' }])
          .mockResolvedValueOnce([]) // existing check
          .mockResolvedValueOnce({ insertId: 1 }) // insert
          .mockResolvedValueOnce([
            {
              id: 1,
              tenant_id: 100,
              asset_id: 10,
              version_id: 2,
              watermark_type: 'DYNAMIC_OVERLAY',
              position_strategy: 'STATIC_CORNER',
              opacity: 0.5,
              user_identifier: null,
              tracking_payload: null,
              output_derivative_path: null,
              watermark_metadata: JSON.stringify({
                watermark_type: 'DYNAMIC_OVERLAY',
                position_strategy: 'STATIC_CORNER',
                verification_digest: '1234567890ABCDEF',
              }),
            },
          ]);

        const res = await supertest(app)
          .post('/api/v1/assets/10/video-watermark')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-Forwarded-For', getNextIp())
          .send({});

        expect(res.status).toBe(201);
        expect(res.body.status).toBe(201);
        expect(res.body.data.watermark_type).toBe('DYNAMIC_OVERLAY');
        expect(res.body.data.version_id).toBe(2);
      });

      it('returns 201 Created on success with null current_version_id fallback', async () => {
        vi.mocked(db.query)
          .mockResolvedValueOnce([
            { id: 10, current_version_id: null, mime_type: 'video/quicktime' },
          ])
          .mockResolvedValueOnce([]) // existing check
          .mockResolvedValueOnce({ insertId: 2 }) // insert
          .mockResolvedValueOnce([
            {
              id: 2,
              tenant_id: 100,
              asset_id: 10,
              version_id: 1,
              watermark_type: 'USER_IDENTIFIER_STAMP',
              position_strategy: 'FLOATING_BOUNCE',
              opacity: 0.7,
              user_identifier: 'tester@dreamtek.tech',
              tracking_payload: null,
              output_derivative_path: null,
              watermark_metadata: JSON.stringify({
                watermark_type: 'USER_IDENTIFIER_STAMP',
                position_strategy: 'FLOATING_BOUNCE',
                verification_digest: 'ABCDEF1234567890',
              }),
            },
          ]);

        const res = await supertest(app)
          .post('/api/v1/assets/10/video-watermark')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-Forwarded-For', getNextIp())
          .send({
            watermark_type: 'USER_IDENTIFIER_STAMP',
            position_strategy: 'FLOATING_BOUNCE',
            user_identifier: 'tester@dreamtek.tech',
          });

        expect(res.status).toBe(201);
        expect(res.body.data.version_id).toBe(1);
      });

      it('handles server exceptions gracefully (500)', async () => {
        vi.mocked(db.query).mockRejectedValueOnce(new Error('DB crash'));

        const res = await supertest(app)
          .post('/api/v1/assets/10/video-watermark')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-Forwarded-For', getNextIp())
          .send({});

        expect(res.status).toBe(500);
        expect(res.body.error).toBe('Internal Server Error');
      });
    });

    describe('GET /api/v1/assets/:id/video-watermarks', () => {
      it('returns 401 if unauthenticated', async () => {
        const res = await supertest(app)
          .get('/api/v1/assets/10/video-watermarks')
          .set('X-Forwarded-For', getNextIp());
        expect(res.status).toBe(401);
      });

      it('returns 400 if asset ID is <= 0 or NaN', async () => {
        const res = await supertest(app)
          .get('/api/v1/assets/0/video-watermarks')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-Forwarded-For', getNextIp());
        expect(res.status).toBe(400);
      });

      it('returns 404 if asset not found', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([]);

        const res = await supertest(app)
          .get('/api/v1/assets/10/video-watermarks')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-Forwarded-For', getNextIp());
        expect(res.status).toBe(404);
      });

      it('returns 403 if ACL VIEW permission is denied', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([{ id: 10 }]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({
          allowed: false,
          reason: 'DENIED',
        });

        const res = await supertest(app)
          .get('/api/v1/assets/10/video-watermarks')
          .set('Authorization', `Bearer ${memberToken}`)
          .set('X-Forwarded-For', getNextIp());
        expect(res.status).toBe(403);
      });

      it('returns 200 OK and list of watermarks with query filtering', async () => {
        vi.mocked(db.query)
          .mockResolvedValueOnce([{ id: 10 }]) // asset check
          .mockResolvedValueOnce([
            {
              id: 1,
              tenant_id: 100,
              asset_id: 10,
              version_id: 1,
              watermark_type: 'DYNAMIC_OVERLAY',
              position_strategy: 'STATIC_CORNER',
              opacity: 0.5,
              user_identifier: null,
              tracking_payload: null,
              output_derivative_path: null,
              watermark_metadata: JSON.stringify({ verification_digest: 'ABC' }),
            },
          ]);

        const res = await supertest(app)
          .get(
            '/api/v1/assets/10/video-watermarks?limit=10&offset=0&watermark_type=DYNAMIC_OVERLAY',
          )
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-Forwarded-For', getNextIp());

        expect(res.status).toBe(200);
        expect(res.body.data.length).toBe(1);
        expect(res.body.meta.limit).toBe(10);
      });

      it('returns 200 OK and list of watermarks without query filtering (defaults)', async () => {
        vi.mocked(db.query)
          .mockResolvedValueOnce([{ id: 10 }])
          .mockResolvedValueOnce([
            {
              id: 1,
              tenant_id: 100,
              asset_id: 10,
              version_id: 1,
              watermark_type: 'DYNAMIC_OVERLAY',
              position_strategy: 'STATIC_CORNER',
              opacity: 0.5,
              user_identifier: null,
              tracking_payload: JSON.stringify({ test: 1 }),
              output_derivative_path: null,
              watermark_metadata: { verification_digest: 'ABC' },
            },
          ]);

        const res = await supertest(app)
          .get('/api/v1/assets/10/video-watermarks')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-Forwarded-For', getNextIp());

        expect(res.status).toBe(200);
        expect(res.body.data.length).toBe(1);
        expect(res.body.meta.limit).toBe(50);
      });

      it('handles server exceptions gracefully (500)', async () => {
        vi.mocked(db.query).mockRejectedValueOnce(new Error('DB crash'));

        const res = await supertest(app)
          .get('/api/v1/assets/10/video-watermarks')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-Forwarded-For', getNextIp());
        expect(res.status).toBe(500);
      });
    });

    describe('GET /api/v1/assets/:id/video-watermarks/:watermarkId', () => {
      it('returns 401 if unauthenticated', async () => {
        const res = await supertest(app)
          .get('/api/v1/assets/10/video-watermarks/1')
          .set('X-Forwarded-For', getNextIp());
        expect(res.status).toBe(401);
      });

      it('returns 400 if invalid params', async () => {
        const res = await supertest(app)
          .get('/api/v1/assets/10/video-watermarks/0')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-Forwarded-For', getNextIp());
        expect(res.status).toBe(400);
      });

      it('returns 404 if asset not found', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([]);

        const res = await supertest(app)
          .get('/api/v1/assets/10/video-watermarks/1')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-Forwarded-For', getNextIp());
        expect(res.status).toBe(404);
      });

      it('returns 403 if ACL VIEW is denied', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([{ id: 10 }]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({
          allowed: false,
          reason: 'DENIED',
        });

        const res = await supertest(app)
          .get('/api/v1/assets/10/video-watermarks/1')
          .set('Authorization', `Bearer ${memberToken}`)
          .set('X-Forwarded-For', getNextIp());
        expect(res.status).toBe(403);
      });

      it('returns 404 if watermark not found', async () => {
        vi.mocked(db.query)
          .mockResolvedValueOnce([{ id: 10 }])
          .mockResolvedValueOnce([]);

        const res = await supertest(app)
          .get('/api/v1/assets/10/video-watermarks/99')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-Forwarded-For', getNextIp());
        expect(res.status).toBe(404);
      });

      it('returns 200 OK and watermark details on success', async () => {
        vi.mocked(db.query)
          .mockResolvedValueOnce([{ id: 10 }])
          .mockResolvedValueOnce([
            {
              id: 1,
              tenant_id: 100,
              asset_id: 10,
              version_id: 1,
              watermark_type: 'DYNAMIC_OVERLAY',
              position_strategy: 'STATIC_CORNER',
              opacity: 0.5,
              user_identifier: null,
              tracking_payload: null,
              output_derivative_path: null,
              watermark_metadata: JSON.stringify({ verification_digest: 'XYZ' }),
            },
          ]);

        const res = await supertest(app)
          .get('/api/v1/assets/10/video-watermarks/1')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-Forwarded-For', getNextIp());
        expect(res.status).toBe(200);
        expect(res.body.data.id).toBe(1);
      });

      it('handles server exceptions gracefully (500)', async () => {
        vi.mocked(db.query).mockRejectedValueOnce(new Error('DB crash'));

        const res = await supertest(app)
          .get('/api/v1/assets/10/video-watermarks/1')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-Forwarded-For', getNextIp());
        expect(res.status).toBe(500);
      });
    });

    describe('DELETE /api/v1/assets/:id/video-watermarks/:watermarkId', () => {
      it('returns 401 if unauthenticated', async () => {
        const res = await supertest(app)
          .delete('/api/v1/assets/10/video-watermarks/1')
          .set('X-Forwarded-For', getNextIp());
        expect(res.status).toBe(401);
      });

      it('returns 400 if invalid params', async () => {
        const res = await supertest(app)
          .delete('/api/v1/assets/10/video-watermarks/0')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-Forwarded-For', getNextIp());
        expect(res.status).toBe(400);
      });

      it('returns 404 if asset not found', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([]);

        const res = await supertest(app)
          .delete('/api/v1/assets/10/video-watermarks/1')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-Forwarded-For', getNextIp());
        expect(res.status).toBe(404);
      });

      it('returns 403 if ACL EDIT is denied', async () => {
        vi.mocked(db.query).mockResolvedValueOnce([{ id: 10 }]);
        vi.mocked(evaluateAclPermission).mockResolvedValueOnce({
          allowed: false,
          reason: 'DENIED',
        });

        const res = await supertest(app)
          .delete('/api/v1/assets/10/video-watermarks/1')
          .set('Authorization', `Bearer ${memberToken}`)
          .set('X-Forwarded-For', getNextIp());
        expect(res.status).toBe(403);
      });

      it('returns 404 if watermark not found to delete', async () => {
        vi.mocked(db.query)
          .mockResolvedValueOnce([{ id: 10 }])
          .mockResolvedValueOnce([]); // get by id returns empty

        const res = await supertest(app)
          .delete('/api/v1/assets/10/video-watermarks/99')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-Forwarded-For', getNextIp());
        expect(res.status).toBe(404);
      });

      it('returns 200 OK when watermark deleted successfully', async () => {
        vi.mocked(db.query)
          .mockResolvedValueOnce([{ id: 10 }]) // asset check
          .mockResolvedValueOnce([
            {
              id: 1,
              tenant_id: 100,
              asset_id: 10,
              version_id: 1,
              watermark_type: 'DYNAMIC_OVERLAY',
              position_strategy: 'STATIC_CORNER',
              opacity: 0.5,
              user_identifier: null,
              tracking_payload: null,
              output_derivative_path: null,
              watermark_metadata: {},
            },
          ]) // get by id
          .mockResolvedValueOnce({ affectedRows: 1 }); // delete query

        const res = await supertest(app)
          .delete('/api/v1/assets/10/video-watermarks/1')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-Forwarded-For', getNextIp());

        expect(res.status).toBe(200);
        expect(res.body.message).toContain('eliminada exitosamente');
      });

      it('handles server exceptions gracefully (500)', async () => {
        vi.mocked(db.query).mockRejectedValueOnce(new Error('DB crash'));

        const res = await supertest(app)
          .delete('/api/v1/assets/10/video-watermarks/1')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('X-Forwarded-For', getNextIp());
        expect(res.status).toBe(500);
      });
    });
  });
});
