import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';
import * as db from '../db';
import { STORAGE_ROOT, assertPathContained } from './storage';
import { dispatchWebhookEvent } from './webhookDispatcher';
import {
  VideoWatermarkType,
  VideoWatermarkPositionStrategy,
  CreateVideoWatermarkBodyInput,
} from '../schemas/videoWatermark.schema';

export interface WatermarkTrajectoryPoint {
  time_seconds: number;
  x: number;
  y: number;
}

export interface VideoWatermarkMetadata {
  watermark_type: VideoWatermarkType;
  position_strategy: VideoWatermarkPositionStrategy;
  opacity: number;
  user_identifier: string | null;
  text_overlay: string;
  font_size: number;
  font_color: string;
  interval_seconds: number;
  trajectory_points: WatermarkTrajectoryPoint[];
  verification_digest: string;
  forensic_signature?: string;
  card_width: number;
  card_height: number;
}

export interface VideoWatermarkRecord {
  id: number;
  tenant_id: number;
  asset_id: number;
  version_id: number;
  watermark_type: VideoWatermarkType;
  position_strategy: VideoWatermarkPositionStrategy;
  opacity: number;
  user_identifier: string | null;
  tracking_payload: Record<string, any> | null;
  output_derivative_path: string | null;
  watermark_metadata: VideoWatermarkMetadata;
  created_at?: string;
  updated_at?: string;
}

/**
 * Escapes XML/SVG special characters to prevent injection attacks (OWASP A03/Anti-XSS).
 */
export function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case '\'':
        return '&apos;';
      case '"':
        return '&quot;';
      default:
        return c;
    }
  });
}

/**
 * Deterministically computes watermark trajectory points and coordinates.
 */
export function computeWatermarkTrajectory(
  strategy: VideoWatermarkPositionStrategy,
  assetId: number,
  versionId: number,
  width: number = 1280,
  height: number = 720,
  intervalSeconds: number = 10,
  durationSeconds: number = 60,
): WatermarkTrajectoryPoint[] {
  const points: WatermarkTrajectoryPoint[] = [];
  const safeWidth = Math.max(128, width);
  const safeHeight = Math.max(72, height);
  const safeInterval = Math.max(1, intervalSeconds);
  const safeDuration = Math.max(safeInterval, durationSeconds);

  switch (strategy) {
    case 'STATIC_CORNER':
      points.push({
        time_seconds: 0,
        x: Math.max(20, safeWidth - 220),
        y: Math.max(20, safeHeight - 60),
      });
      break;

    case 'FLOATING_BOUNCE': {
      const stepCount = Math.min(10, Math.floor(safeDuration / safeInterval));
      const seed = ((assetId * 37 + versionId * 17) % 100) / 100;
      for (let i = 0; i <= stepCount; i++) {
        const t = i * safeInterval;
        const normX = (Math.sin((i + seed) * 1.2) + 1) / 2;
        const normY = (Math.cos((i + seed) * 0.9) + 1) / 2;
        points.push({
          time_seconds: t,
          x: Math.round(30 + normX * (safeWidth - 280)),
          y: Math.round(30 + normY * (safeHeight - 100)),
        });
      }
      break;
    }

    case 'RANDOM_INTERVALS': {
      const stepCount = Math.min(10, Math.floor(safeDuration / safeInterval));
      for (let i = 0; i <= stepCount; i++) {
        const t = i * safeInterval;
        const hash = crypto
          .createHash('sha256')
          .update(`${assetId}-${versionId}-${i}`)
          .digest('hex');
        const randX = parseInt(hash.substring(0, 4), 16) / 65535;
        const randY = parseInt(hash.substring(4, 8), 16) / 65535;
        points.push({
          time_seconds: t,
          x: Math.round(40 + randX * (safeWidth - 300)),
          y: Math.round(40 + randY * (safeHeight - 120)),
        });
      }
      break;
    }

    case 'CENTER_TILED':
    default:
      points.push(
        {
          time_seconds: 0,
          x: Math.round(safeWidth / 2 - 100),
          y: Math.round(safeHeight / 2 - 30),
        },
        {
          time_seconds: 0,
          x: Math.round(safeWidth / 4),
          y: Math.round(safeHeight / 4),
        },
        {
          time_seconds: 0,
          x: Math.round((3 * safeWidth) / 4 - 150),
          y: Math.round((3 * safeHeight) / 4 - 40),
        },
      );
      break;
  }

  return points;
}

/**
 * Generates deterministic HMAC forensic payload for tracking leak sources.
 */
export function generateForensicPayload(
  tenantId: number,
  assetId: number,
  versionId: number,
  userIdentifier?: string,
  customPayload?: Record<string, any>,
): {
  payload: Record<string, any>;
  hmac_signature: string;
  verification_digest: string;
} {
  const payload = {
    tenant_id: tenantId,
    asset_id: assetId,
    version_id: versionId,
    user_identifier: userIdentifier || `tenant-user-${tenantId}`,
    issued_at_iso: new Date().toISOString(),
    custom_tracking: customPayload || {},
  };

  const secret = process.env.JWT_SECRET || 'dreamtek_forensic_watermark_secret';
  const serialized = JSON.stringify(payload);
  const hmac_signature = crypto
    .createHmac('sha256', secret)
    .update(serialized)
    .digest('hex');
  const verification_digest = crypto
    .createHash('sha256')
    .update(`${serialized}:${hmac_signature}`)
    .digest('hex')
    .substring(0, 16)
    .toUpperCase();

  return { payload, hmac_signature, verification_digest };
}

/**
 * Resolves watermarking parameters and deterministic metadata.
 */
export function resolveVideoWatermarkParameters(
  tenantId: number,
  assetId: number,
  versionId: number,
  input: CreateVideoWatermarkBodyInput,
): {
  watermark_type: VideoWatermarkType;
  position_strategy: VideoWatermarkPositionStrategy;
  opacity: number;
  user_identifier: string | null;
  tracking_payload: Record<string, any> | null;
  text_overlay: string;
  font_size: number;
  font_color: string;
  interval_seconds: number;
  metadata: VideoWatermarkMetadata;
} {
  const watermark_type: VideoWatermarkType =
    input.watermark_type || 'DYNAMIC_OVERLAY';
  const position_strategy: VideoWatermarkPositionStrategy =
    input.position_strategy || 'STATIC_CORNER';
  const opacity = Math.max(0.05, Math.min(1.0, Number(input.opacity ?? 0.5)));
  const user_identifier = input.user_identifier
    ? String(input.user_identifier).trim()
    : null;
  const text_overlay = input.text_overlay
    ? String(input.text_overlay).trim()
    : user_identifier
      ? `CONFIDENTIAL - ${user_identifier}`
      : `DREAMTEK WATERMARK #${assetId}`;
  const font_size = Math.max(10, Math.min(120, Number(input.font_size ?? 24)));
  const font_color = input.font_color || '#FFFFFF';
  const interval_seconds = Math.max(
    1,
    Math.min(300, Number(input.interval_seconds ?? 10)),
  );
  const card_width = Math.max(128, Math.min(3840, Number(input.width ?? 1280)));
  const card_height = Math.max(72, Math.min(2160, Number(input.height ?? 720)));

  const trajectory_points = computeWatermarkTrajectory(
    position_strategy,
    assetId,
    versionId,
    card_width,
    card_height,
    interval_seconds,
  );

  const { payload, hmac_signature, verification_digest } =
    generateForensicPayload(
      tenantId,
      assetId,
      versionId,
      user_identifier || undefined,
      input.tracking_payload,
    );

  const tracking_payload =
    watermark_type === 'FORENSIC_STEGANOGRAPHIC' ? payload : input.tracking_payload || null;

  const metadata: VideoWatermarkMetadata = {
    watermark_type,
    position_strategy,
    opacity,
    user_identifier,
    text_overlay,
    font_size,
    font_color,
    interval_seconds,
    trajectory_points,
    verification_digest,
    forensic_signature:
      watermark_type === 'FORENSIC_STEGANOGRAPHIC' ? hmac_signature : undefined,
    card_width,
    card_height,
  };

  return {
    watermark_type,
    position_strategy,
    opacity,
    user_identifier,
    tracking_payload,
    text_overlay,
    font_size,
    font_color,
    interval_seconds,
    metadata,
  };
}

/**
 * Generates an SVG visual validation card for forensic tracking proofing.
 */
export function generateForensicValidationCardSvg(
  tenantId: number,
  assetId: number,
  versionId: number,
  metadata: VideoWatermarkMetadata,
): string {
  const safeText = escapeXml(metadata.text_overlay);
  const safeUser = escapeXml(metadata.user_identifier || 'None');
  const safeDigest = escapeXml(metadata.verification_digest);
  const safeType = escapeXml(metadata.watermark_type);
  const safeStrategy = escapeXml(metadata.position_strategy);
  const safeColor = escapeXml(metadata.font_color);

  return `<svg width="${metadata.card_width}" height="${metadata.card_height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0b0f19" />
      <stop offset="50%" stop-color="#111827" />
      <stop offset="100%" stop-color="#030712" />
    </linearGradient>
    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
    </pattern>
  </defs>

  <rect width="100%" height="100%" fill="url(#bgGrad)" />
  <rect width="100%" height="100%" fill="url(#grid)" />

  <!-- Frame border -->
  <rect x="20" y="20" width="${metadata.card_width - 40}" height="${metadata.card_height - 40}"
        fill="none" stroke="#2563eb" stroke-width="2" stroke-dasharray="6,6" opacity="0.6" rx="8" />

  <!-- Watermark Simulation Overlay -->
  <g opacity="${metadata.opacity}">
    <rect x="${metadata.trajectory_points[0]?.x ?? 100}" y="${metadata.trajectory_points[0]?.y ?? 100}"
          width="260" height="50" rx="6" fill="#000000" fill-opacity="0.6" stroke="${safeColor}" stroke-width="1.5"/>
    <text x="${(metadata.trajectory_points[0]?.x ?? 100) + 15}" y="${(metadata.trajectory_points[0]?.y ?? 100) + 32}"
          font-family="monospace, sans-serif" font-size="${metadata.font_size}" font-weight="bold" fill="${safeColor}">
      ${safeText}
    </text>
  </g>

  <!-- Forensic Information Badge -->
  <g transform="translate(40, 50)">
    <rect width="460" height="180" rx="8" fill="#1e293b" fill-opacity="0.85" stroke="#3b82f6" stroke-width="1" />
    <text x="20" y="30" font-family="sans-serif" font-size="16" font-weight="bold" fill="#60a5fa">
      DREAMTEK FORENSIC WATERMARK CARD
    </text>
    <text x="20" y="60" font-family="monospace" font-size="12" fill="#94a3b8">
      Asset ID: ${assetId} (v${versionId}) | Tenant: ${tenantId}
    </text>
    <text x="20" y="85" font-family="monospace" font-size="12" fill="#94a3b8">
      Type: ${safeType} | Strategy: ${safeStrategy}
    </text>
    <text x="20" y="110" font-family="monospace" font-size="12" fill="#94a3b8">
      User Identifier: ${safeUser}
    </text>
    <text x="20" y="135" font-family="monospace" font-size="12" fill="#94a3b8">
      Opacity: ${(metadata.opacity * 100).toFixed(0)}% | Interval: ${metadata.interval_seconds}s
    </text>
    <text x="20" y="160" font-family="monospace" font-size="12" font-weight="bold" fill="#34d399">
      Verification Digest: [${safeDigest}]
    </text>
  </g>
</svg>`;
}

/**
 * Creates or updates a video watermark record, writes the validation card derivative to storage, and dispatches webhooks.
 */
export async function createOrUpdateVideoWatermark(
  tenantId: number,
  assetId: number,
  versionId: number,
  input: CreateVideoWatermarkBodyInput,
): Promise<VideoWatermarkRecord> {
  const resolved = resolveVideoWatermarkParameters(
    tenantId,
    assetId,
    versionId,
    input,
  );

  const derivativeDir = path.join(
    STORAGE_ROOT,
    'derivatives',
    String(tenantId),
    'video_watermarks',
  );
  if (!fs.existsSync(derivativeDir)) {
    fs.mkdirSync(derivativeDir, { recursive: true });
  }

  const derivativeFilename = `watermark_${assetId}_v${versionId}_${Date.now()}.webp`;
  const derivativePath = path.join(derivativeDir, derivativeFilename);
  assertPathContained(derivativePath);

  const svgContent = generateForensicValidationCardSvg(
    tenantId,
    assetId,
    versionId,
    resolved.metadata,
  );

  await sharp(Buffer.from(svgContent))
    .webp({ quality: 90 })
    .toFile(derivativePath);

  // Check if existing record exists for this type
  const existingRows: any[] = await db.query(
    `SELECT id, output_derivative_path FROM dam_asset_video_watermarks
     WHERE tenant_id = ? AND asset_id = ? AND version_id = ? AND watermark_type = ?`,
    [tenantId, assetId, versionId, resolved.watermark_type],
  );

  if (existingRows && existingRows.length > 0) {
    const oldPath = existingRows[0].output_derivative_path;
    if (oldPath && oldPath !== derivativePath) {
      assertPathContained(oldPath);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }

    await db.query(
      `UPDATE dam_asset_video_watermarks
       SET position_strategy = ?, opacity = ?, user_identifier = ?, tracking_payload = ?,
           output_derivative_path = ?, watermark_metadata = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND tenant_id = ?`,
      [
        resolved.position_strategy,
        resolved.opacity,
        resolved.user_identifier,
        resolved.tracking_payload
          ? JSON.stringify(resolved.tracking_payload)
          : null,
        derivativePath,
        JSON.stringify(resolved.metadata),
        existingRows[0].id,
        tenantId,
      ],
    );
  } else {
    await db.query(
      `INSERT INTO dam_asset_video_watermarks
       (tenant_id, asset_id, version_id, watermark_type, position_strategy, opacity,
        user_identifier, tracking_payload, output_derivative_path, watermark_metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tenantId,
        assetId,
        versionId,
        resolved.watermark_type,
        resolved.position_strategy,
        resolved.opacity,
        resolved.user_identifier,
        resolved.tracking_payload
          ? JSON.stringify(resolved.tracking_payload)
          : null,
        derivativePath,
        JSON.stringify(resolved.metadata),
      ],
    );
  }

  const fetchRows: any[] = await db.query(
    `SELECT id, tenant_id, asset_id, version_id, watermark_type, position_strategy,
            opacity, user_identifier, tracking_payload, output_derivative_path,
            watermark_metadata, created_at, updated_at
     FROM dam_asset_video_watermarks
     WHERE tenant_id = ? AND asset_id = ? AND version_id = ? AND watermark_type = ?`,
    [tenantId, assetId, versionId, resolved.watermark_type],
  );

  const r = fetchRows[0];
  const record: VideoWatermarkRecord = {
    id: Number(r.id),
    tenant_id: Number(r.tenant_id),
    asset_id: Number(r.asset_id),
    version_id: Number(r.version_id),
    watermark_type: r.watermark_type,
    position_strategy: r.position_strategy,
    opacity: Number(r.opacity),
    user_identifier: r.user_identifier,
    tracking_payload:
      typeof r.tracking_payload === 'string'
        ? JSON.parse(r.tracking_payload)
        : r.tracking_payload,
    output_derivative_path: r.output_derivative_path,
    watermark_metadata:
      typeof r.watermark_metadata === 'string'
        ? JSON.parse(r.watermark_metadata)
        : r.watermark_metadata,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };

  void dispatchWebhookEvent(tenantId, 'asset.updated', {
    asset_id: assetId,
    watermark_id: record.id,
    watermark_type: record.watermark_type,
    position_strategy: record.position_strategy,
    verification_digest: record.watermark_metadata.verification_digest,
    event_type: 'VIDEO_WATERMARK_CREATED',
  });

  return record;
}

/**
 * Lists video watermark configurations for an asset.
 */
export async function listAssetVideoWatermarks(
  tenantId: number,
  assetId: number,
  limit: number = 50,
  offset: number = 0,
  watermarkType?: string,
): Promise<VideoWatermarkRecord[]> {
  let sql = `SELECT id, tenant_id, asset_id, version_id, watermark_type, position_strategy,
                    opacity, user_identifier, tracking_payload, output_derivative_path,
                    watermark_metadata, created_at, updated_at
             FROM dam_asset_video_watermarks
             WHERE tenant_id = ? AND asset_id = ?`;
  const params: any[] = [tenantId, assetId];

  if (watermarkType) {
    sql += ' AND watermark_type = ?';
    params.push(watermarkType);
  }

  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));

  const rows: any[] = await db.query(sql, params);

  return rows.map((r) => ({
    id: Number(r.id),
    tenant_id: Number(r.tenant_id),
    asset_id: Number(r.asset_id),
    version_id: Number(r.version_id),
    watermark_type: r.watermark_type,
    position_strategy: r.position_strategy,
    opacity: Number(r.opacity),
    user_identifier: r.user_identifier,
    tracking_payload:
      typeof r.tracking_payload === 'string'
        ? JSON.parse(r.tracking_payload)
        : r.tracking_payload,
    output_derivative_path: r.output_derivative_path,
    watermark_metadata:
      typeof r.watermark_metadata === 'string'
        ? JSON.parse(r.watermark_metadata)
        : r.watermark_metadata,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));
}

/**
 * Retrieves a single video watermark configuration by ID.
 */
export async function getAssetVideoWatermarkById(
  tenantId: number,
  assetId: number,
  watermarkId: number,
): Promise<VideoWatermarkRecord | null> {
  const rows: any[] = await db.query(
    `SELECT id, tenant_id, asset_id, version_id, watermark_type, position_strategy,
            opacity, user_identifier, tracking_payload, output_derivative_path,
            watermark_metadata, created_at, updated_at
     FROM dam_asset_video_watermarks
     WHERE tenant_id = ? AND asset_id = ? AND id = ?`,
    [tenantId, assetId, watermarkId],
  );

  if (!rows || rows.length === 0) {
    return null;
  }

  const r = rows[0];
  return {
    id: Number(r.id),
    tenant_id: Number(r.tenant_id),
    asset_id: Number(r.asset_id),
    version_id: Number(r.version_id),
    watermark_type: r.watermark_type,
    position_strategy: r.position_strategy,
    opacity: Number(r.opacity),
    user_identifier: r.user_identifier,
    tracking_payload:
      typeof r.tracking_payload === 'string'
        ? JSON.parse(r.tracking_payload)
        : r.tracking_payload,
    output_derivative_path: r.output_derivative_path,
    watermark_metadata:
      typeof r.watermark_metadata === 'string'
        ? JSON.parse(r.watermark_metadata)
        : r.watermark_metadata,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

/**
 * Deletes a video watermark configuration and unlinks its physical validation card.
 */
export async function deleteAssetVideoWatermark(
  tenantId: number,
  assetId: number,
  watermarkId: number,
): Promise<boolean> {
  const record = await getAssetVideoWatermarkById(tenantId, assetId, watermarkId);
  if (!record) {
    return false;
  }

  if (record.output_derivative_path) {
    assertPathContained(record.output_derivative_path);
    if (fs.existsSync(record.output_derivative_path)) {
      fs.unlinkSync(record.output_derivative_path);
    }
  }

  await db.query(
    'DELETE FROM dam_asset_video_watermarks WHERE tenant_id = ? AND asset_id = ? AND id = ?',
    [tenantId, assetId, watermarkId],
  );

  void dispatchWebhookEvent(tenantId, 'asset.updated', {
    asset_id: assetId,
    watermark_id: watermarkId,
    watermark_type: record.watermark_type,
    event_type: 'VIDEO_WATERMARK_DELETED',
  });

  return true;
}
