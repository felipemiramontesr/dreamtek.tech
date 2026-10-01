"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.escapeXml = escapeXml;
exports.computeWatermarkTrajectory = computeWatermarkTrajectory;
exports.getForensicHmacSecret = getForensicHmacSecret;
exports.generateForensicPayload = generateForensicPayload;
exports.resolveVideoWatermarkParameters = resolveVideoWatermarkParameters;
exports.generateForensicValidationCardSvg = generateForensicValidationCardSvg;
exports.safeUnlink = safeUnlink;
exports.createOrUpdateVideoWatermark = createOrUpdateVideoWatermark;
exports.listAssetVideoWatermarks = listAssetVideoWatermarks;
exports.getAssetVideoWatermarkById = getAssetVideoWatermarkById;
exports.deleteAssetVideoWatermark = deleteAssetVideoWatermark;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const sharp_1 = __importDefault(require("sharp"));
const db = __importStar(require("../db"));
const storage_1 = require("./storage");
const webhookDispatcher_1 = require("./webhookDispatcher");
/**
 * Escapes XML/SVG special characters to prevent injection attacks (OWASP A03/Anti-XSS).
 */
function escapeXml(unsafe) {
    return unsafe
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&apos;');
}
/**
 * Deterministically computes watermark trajectory points and coordinates.
 */
function computeWatermarkTrajectory(strategy, assetId, versionId, width = 1280, height = 720, intervalSeconds = 10, durationSeconds = 60) {
    const points = [];
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
                const hash = crypto_1.default
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
            points.push({
                time_seconds: 0,
                x: Math.round(safeWidth / 2 - 100),
                y: Math.round(safeHeight / 2 - 30),
            }, {
                time_seconds: 0,
                x: Math.round(safeWidth / 4),
                y: Math.round(safeHeight / 4),
            }, {
                time_seconds: 0,
                x: Math.round((3 * safeWidth) / 4 - 150),
                y: Math.round((3 * safeHeight) / 4 - 40),
            });
            break;
    }
    return points;
}
/**
 * Gets the HMAC secret for forensic watermark signatures, throwing in production if missing.
 */
function getForensicHmacSecret() {
    if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
        throw new Error('FATAL SECURITY ERROR: JWT_SECRET environment variable is missing in production.');
    }
    return process.env.JWT_SECRET || 'dreamtek_dev_jwt_secret_key_2026';
}
/**
 * Generates deterministic HMAC forensic payload for tracking leak sources.
 */
function generateForensicPayload(tenantId, assetId, versionId, userIdentifier, customPayload) {
    const payload = {
        tenant_id: tenantId,
        asset_id: assetId,
        version_id: versionId,
        user_identifier: userIdentifier || `tenant-user-${tenantId}`,
        issued_at_iso: new Date().toISOString(),
        custom_tracking: customPayload || {},
    };
    const secret = getForensicHmacSecret();
    const serialized = JSON.stringify(payload);
    const hmac_signature = crypto_1.default
        .createHmac('sha256', secret)
        .update(serialized)
        .digest('hex');
    const verification_digest = crypto_1.default
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
function resolveVideoWatermarkParameters(tenantId, assetId, versionId, input) {
    const watermark_type = input.watermark_type || 'DYNAMIC_OVERLAY';
    const position_strategy = input.position_strategy || 'STATIC_CORNER';
    const opacity = Number(input.opacity ?? 0.5);
    const user_identifier = input.user_identifier
        ? String(input.user_identifier).trim()
        : null;
    const text_overlay = input.text_overlay
        ? String(input.text_overlay).trim()
        : user_identifier
            ? `CONFIDENTIAL - ${user_identifier}`
            : `DREAMTEK WATERMARK #${assetId}`;
    const font_size = Number(input.font_size ?? 24);
    const font_color = input.font_color || '#FFFFFF';
    const interval_seconds = Number(input.interval_seconds ?? 10);
    const card_width = Number(input.width ?? 1280);
    const card_height = Number(input.height ?? 720);
    const trajectory_points = computeWatermarkTrajectory(position_strategy, assetId, versionId, card_width, card_height, interval_seconds);
    const { payload, hmac_signature, verification_digest } = generateForensicPayload(tenantId, assetId, versionId, user_identifier || undefined, input.tracking_payload);
    const tracking_payload = watermark_type === 'FORENSIC_STEGANOGRAPHIC' ? payload : input.tracking_payload || null;
    const metadata = {
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
        forensic_signature: watermark_type === 'FORENSIC_STEGANOGRAPHIC' ? hmac_signature : undefined,
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
function generateForensicValidationCardSvg(tenantId, assetId, versionId, metadata) {
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
 * Safely unlinks a derivative file if present, asserting containment and ignoring ENOENT.
 */
function safeUnlink(filePath) {
    if (!filePath) {
        return;
    }
    (0, storage_1.assertPathContained)(filePath);
    try {
        fs_1.default.unlinkSync(filePath);
    }
    catch {
        // Ignore ENOENT / missing file
    }
}
/**
 * Persists or updates a video watermark record in MySQL and generates the Sharp WebP card.
 */
async function createOrUpdateVideoWatermark(tenantId, assetId, versionId, input) {
    const resolved = resolveVideoWatermarkParameters(tenantId, assetId, versionId, input);
    const derivativeDir = path_1.default.join(storage_1.STORAGE_ROOT, 'derivatives', String(tenantId), 'video_watermarks');
    fs_1.default.mkdirSync(derivativeDir, { recursive: true });
    const derivativeFilename = `watermark_${assetId}_v${versionId}_${Date.now()}.webp`;
    const derivativePath = path_1.default.join(derivativeDir, derivativeFilename);
    (0, storage_1.assertPathContained)(derivativePath);
    const svgContent = generateForensicValidationCardSvg(tenantId, assetId, versionId, resolved.metadata);
    await (0, sharp_1.default)(Buffer.from(svgContent))
        .webp({ quality: 90 })
        .toFile(derivativePath);
    // Check if existing record exists for this type
    const rawExisting = await db.query(`SELECT id, output_derivative_path FROM dam_asset_video_watermarks
     WHERE tenant_id = ? AND asset_id = ? AND version_id = ? AND watermark_type = ?`, [tenantId, assetId, versionId, resolved.watermark_type]);
    const existingRows = rawExisting || [];
    const serializedPayload = resolved.tracking_payload
        ? JSON.stringify(resolved.tracking_payload)
        : null;
    if (existingRows.length > 0) {
        safeUnlink(existingRows[0].output_derivative_path);
        await db.query(`UPDATE dam_asset_video_watermarks
       SET position_strategy = ?, opacity = ?, user_identifier = ?, tracking_payload = ?,
           output_derivative_path = ?, watermark_metadata = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND tenant_id = ?`, [
            resolved.position_strategy,
            resolved.opacity,
            resolved.user_identifier,
            serializedPayload,
            derivativePath,
            JSON.stringify(resolved.metadata),
            existingRows[0].id,
            tenantId,
        ]);
    }
    else {
        await db.query(`INSERT INTO dam_asset_video_watermarks
       (tenant_id, asset_id, version_id, watermark_type, position_strategy, opacity,
        user_identifier, tracking_payload, output_derivative_path, watermark_metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            tenantId,
            assetId,
            versionId,
            resolved.watermark_type,
            resolved.position_strategy,
            resolved.opacity,
            resolved.user_identifier,
            serializedPayload,
            derivativePath,
            JSON.stringify(resolved.metadata),
        ]);
    }
    const fetchRows = await db.query(`SELECT id, tenant_id, asset_id, version_id, watermark_type, position_strategy,
            opacity, user_identifier, tracking_payload, output_derivative_path,
            watermark_metadata, created_at, updated_at
     FROM dam_asset_video_watermarks
     WHERE tenant_id = ? AND asset_id = ? AND version_id = ? AND watermark_type = ?`, [tenantId, assetId, versionId, resolved.watermark_type]);
    const r = fetchRows[0];
    const record = {
        id: Number(r.id),
        tenant_id: Number(r.tenant_id),
        asset_id: Number(r.asset_id),
        version_id: Number(r.version_id),
        watermark_type: r.watermark_type,
        position_strategy: r.position_strategy,
        opacity: Number(r.opacity),
        user_identifier: r.user_identifier,
        tracking_payload: typeof r.tracking_payload === 'string'
            ? JSON.parse(r.tracking_payload)
            : r.tracking_payload,
        output_derivative_path: r.output_derivative_path,
        watermark_metadata: typeof r.watermark_metadata === 'string'
            ? JSON.parse(r.watermark_metadata)
            : r.watermark_metadata,
        created_at: r.created_at,
        updated_at: r.updated_at,
    };
    void (0, webhookDispatcher_1.dispatchWebhookEvent)(tenantId, 'asset.updated', {
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
async function listAssetVideoWatermarks(tenantId, assetId, limit = 50, offset = 0, watermarkType) {
    let sql = `SELECT id, tenant_id, asset_id, version_id, watermark_type, position_strategy,
                    opacity, user_identifier, tracking_payload, output_derivative_path,
                    watermark_metadata, created_at, updated_at
             FROM dam_asset_video_watermarks
             WHERE tenant_id = ? AND asset_id = ?`;
    const params = [tenantId, assetId];
    if (watermarkType) {
        sql += ' AND watermark_type = ?';
        params.push(watermarkType);
    }
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));
    const rawRows = await db.query(sql, params);
    const rows = rawRows || [];
    return rows.map((r) => ({
        id: Number(r.id),
        tenant_id: Number(r.tenant_id),
        asset_id: Number(r.asset_id),
        version_id: Number(r.version_id),
        watermark_type: r.watermark_type,
        position_strategy: r.position_strategy,
        opacity: Number(r.opacity),
        user_identifier: r.user_identifier,
        tracking_payload: typeof r.tracking_payload === 'string'
            ? JSON.parse(r.tracking_payload)
            : r.tracking_payload,
        output_derivative_path: r.output_derivative_path,
        watermark_metadata: typeof r.watermark_metadata === 'string'
            ? JSON.parse(r.watermark_metadata)
            : r.watermark_metadata,
        created_at: r.created_at,
        updated_at: r.updated_at,
    }));
}
/**
 * Retrieves a single video watermark configuration by ID.
 */
async function getAssetVideoWatermarkById(tenantId, assetId, watermarkId) {
    const rawRows = await db.query(`SELECT id, tenant_id, asset_id, version_id, watermark_type, position_strategy,
            opacity, user_identifier, tracking_payload, output_derivative_path,
            watermark_metadata, created_at, updated_at
     FROM dam_asset_video_watermarks
     WHERE tenant_id = ? AND asset_id = ? AND id = ?`, [tenantId, assetId, watermarkId]);
    const rows = rawRows || [];
    if (rows.length === 0) {
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
        tracking_payload: typeof r.tracking_payload === 'string'
            ? JSON.parse(r.tracking_payload)
            : r.tracking_payload,
        output_derivative_path: r.output_derivative_path,
        watermark_metadata: typeof r.watermark_metadata === 'string'
            ? JSON.parse(r.watermark_metadata)
            : r.watermark_metadata,
        created_at: r.created_at,
        updated_at: r.updated_at,
    };
}
/**
 * Deletes a video watermark configuration and unlinks its physical validation card.
 */
async function deleteAssetVideoWatermark(tenantId, assetId, watermarkId) {
    const record = await getAssetVideoWatermarkById(tenantId, assetId, watermarkId);
    if (!record) {
        return false;
    }
    safeUnlink(record.output_derivative_path);
    await db.query('DELETE FROM dam_asset_video_watermarks WHERE tenant_id = ? AND asset_id = ? AND id = ?', [tenantId, assetId, watermarkId]);
    void (0, webhookDispatcher_1.dispatchWebhookEvent)(tenantId, 'asset.updated', {
        asset_id: assetId,
        watermark_id: watermarkId,
        watermark_type: record.watermark_type,
        event_type: 'VIDEO_WATERMARK_DELETED',
    });
    return true;
}
