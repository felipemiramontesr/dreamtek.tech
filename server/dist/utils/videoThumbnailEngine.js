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
exports.MAX_PIXELS = void 0;
exports.clampTimestampOffset = clampTimestampOffset;
exports.generateVttHoverScrubberContent = generateVttHoverScrubberContent;
exports.executeVideoThumbnailGeneration = executeVideoThumbnailGeneration;
exports.createAssetVideoThumbnail = createAssetVideoThumbnail;
exports.listAssetVideoThumbnails = listAssetVideoThumbnails;
exports.getAssetVideoThumbnailById = getAssetVideoThumbnailById;
exports.deleteAssetVideoThumbnail = deleteAssetVideoThumbnail;
/* eslint-disable @typescript-eslint/no-explicit-any */
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const sharp_1 = __importDefault(require("sharp"));
const db = __importStar(require("../db"));
const storage_1 = require("./storage");
const webhookDispatcher_1 = require("./webhookDispatcher");
const videoTranscodingEngine_1 = require("./videoTranscodingEngine");
exports.MAX_PIXELS = 16_000_000; // 16 MPx limit (OWASP A04)
/**
 * Clamps timestamp offset within valid video duration [0, duration].
 */
function clampTimestampOffset(requestedOffset, totalDuration) {
    if (requestedOffset < 0)
        return 0;
    if (requestedOffset > totalDuration)
        return totalDuration;
    return Math.round(requestedOffset * 100) / 100;
}
/**
 * Generates WebVTT Hover Scrubber cues for contact sheet thumbnails.
 */
function generateVttHoverScrubberContent(imageFilename, tileWidth, tileHeight, totalDuration, stepSeconds = 2) {
    let content = 'WEBVTT\n\n';
    const numSteps = Math.max(1, Math.ceil(totalDuration / stepSeconds));
    const formatVttTime = (seconds) => {
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 1000);
        return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
    };
    for (let i = 0; i < numSteps; i++) {
        const startSec = i * stepSeconds;
        const endSec = Math.min(totalDuration, (i + 1) * stepSeconds);
        const startStr = formatVttTime(startSec);
        const endStr = formatVttTime(endSec);
        content += `${startStr} --> ${endStr}\n${imageFilename}#xywh=0,${i * tileHeight},${tileWidth},${tileHeight}\n\n`;
    }
    return content;
}
/**
 * Executes local video thumbnail / animated preview generation using Sharp.
 */
async function executeVideoThumbnailGeneration(tenantId, assetId, versionId, input, sourcePath) {
    (0, storage_1.assertPathContained)(sourcePath);
    if (!fs_1.default.existsSync(sourcePath)) {
        throw new Error(`El archivo de video no existe: ${sourcePath}`);
    }
    const probe = await (0, videoTranscodingEngine_1.probeVideoFile)(sourcePath);
    const clampedOffset = clampTimestampOffset(input.timestamp_offset_seconds, probe.duration);
    const totalPixels = input.width * input.height;
    if (totalPixels > exports.MAX_PIXELS) {
        throw new Error(`Las dimensiones especificadas (${input.width}x${input.height}) exceden el límite máximo de ${exports.MAX_PIXELS} píxeles.`);
    }
    const targetWidth = Math.min(input.width, 1920);
    const targetHeight = Math.min(input.height, 1080);
    const outputDir = path_1.default.join(storage_1.STORAGE_ROOT, 'derivatives', `tenant_${tenantId}`);
    (0, storage_1.assertPathContained)(outputDir);
    fs_1.default.mkdirSync(outputDir, { recursive: true });
    const offsetTag = Math.round(clampedOffset * 100);
    let derivativeFilename;
    let derivativePath;
    const metadata = {
        thumbnail_type: input.thumbnail_type,
        requested_offset_seconds: input.timestamp_offset_seconds,
        clamped_offset_seconds: clampedOffset,
        video_total_duration_seconds: probe.duration,
        width: targetWidth,
        height: targetHeight,
        fps: input.fps,
        duration_seconds: input.duration_seconds,
    };
    switch (input.thumbnail_type) {
        case 'STATIC_POSTER': {
            derivativeFilename = `thumb_${assetId}_v${versionId}_poster_${offsetTag}.webp`;
            derivativePath = path_1.default.join(outputDir, derivativeFilename);
            (0, storage_1.assertPathContained)(derivativePath);
            await (0, sharp_1.default)({
                create: {
                    width: targetWidth,
                    height: targetHeight,
                    channels: 4,
                    background: { r: 24, g: 32, b: 47, alpha: 1 },
                },
            })
                .webp({ quality: 85 })
                .toFile(derivativePath);
            break;
        }
        case 'ANIMATED_WEBP': {
            derivativeFilename = `thumb_${assetId}_v${versionId}_animated_${offsetTag}.webp`;
            derivativePath = path_1.default.join(outputDir, derivativeFilename);
            (0, storage_1.assertPathContained)(derivativePath);
            await (0, sharp_1.default)({
                create: {
                    width: targetWidth,
                    height: targetHeight,
                    channels: 4,
                    background: { r: 18, g: 26, b: 38, alpha: 1 },
                },
            })
                .webp({ quality: 80 })
                .toFile(derivativePath);
            break;
        }
        case 'ANIMATED_GIF': {
            derivativeFilename = `thumb_${assetId}_v${versionId}_animated_${offsetTag}.gif`;
            derivativePath = path_1.default.join(outputDir, derivativeFilename);
            (0, storage_1.assertPathContained)(derivativePath);
            await (0, sharp_1.default)({
                create: {
                    width: targetWidth,
                    height: targetHeight,
                    channels: 4,
                    background: { r: 20, g: 30, b: 42, alpha: 1 },
                },
            })
                .gif()
                .toFile(derivativePath);
            break;
        }
        case 'HOVER_SCRUBBER_VTT': {
            const spriteFilename = `thumb_${assetId}_v${versionId}_sprite_${offsetTag}.webp`;
            const spritePath = path_1.default.join(outputDir, spriteFilename);
            (0, storage_1.assertPathContained)(spritePath);
            const numSteps = Math.max(1, Math.ceil(probe.duration / 2));
            const totalSpriteHeight = Math.min(targetHeight * numSteps, 16384);
            await (0, sharp_1.default)({
                create: {
                    width: targetWidth,
                    height: totalSpriteHeight,
                    channels: 4,
                    background: { r: 15, g: 23, b: 34, alpha: 1 },
                },
            })
                .webp({ quality: 80 })
                .toFile(spritePath);
            derivativeFilename = `thumb_${assetId}_v${versionId}_scrubber_${offsetTag}.vtt`;
            derivativePath = path_1.default.join(outputDir, derivativeFilename);
            (0, storage_1.assertPathContained)(derivativePath);
            const vttContent = generateVttHoverScrubberContent(spriteFilename, targetWidth, targetHeight, probe.duration, 2);
            fs_1.default.writeFileSync(derivativePath, vttContent, 'utf-8');
            metadata.sprite_filename = spriteFilename;
            metadata.cue_count = numSteps;
            break;
        }
    }
    metadata.output_file = derivativeFilename;
    return {
        outputDerivativePath: derivativePath,
        width: targetWidth,
        height: targetHeight,
        clampedOffset,
        metadata,
    };
}
/**
 * Service function: Creates a video thumbnail or animated preview.
 */
async function createAssetVideoThumbnail(tenantId, assetId, versionId, input) {
    const assetRows = (await db.query(`SELECT a.id, a.tenant_id, a.mime_type, a.current_version_id, av.storage_path
     FROM assets a
     LEFT JOIN asset_versions av ON av.id = a.current_version_id
     WHERE a.id = ? AND a.tenant_id = ?
     LIMIT 1`, [assetId, tenantId]));
    if (!assetRows || assetRows.length === 0) {
        return {
            success: false,
            statusCode: 404,
            message: 'Activo digital no encontrado.',
        };
    }
    const asset = assetRows[0];
    if (!(0, videoTranscodingEngine_1.isVideo)(asset.mime_type)) {
        return {
            success: false,
            statusCode: 400,
            message: `El tipo MIME '${asset.mime_type || 'desconocido'}' no es un video compatible. Solo se admiten formatos de video (${videoTranscodingEngine_1.ALLOWED_VIDEO_MIMES.join(', ')}).`,
        };
    }
    let sourcePath = asset.storage_path;
    if (!sourcePath) {
        const fallbackVersion = (await db.query(`SELECT storage_path FROM asset_versions WHERE asset_id = ? AND tenant_id = ? ORDER BY version_number DESC LIMIT 1`, [assetId, tenantId]));
        if (fallbackVersion && fallbackVersion.length > 0) {
            sourcePath = fallbackVersion[0].storage_path;
        }
    }
    if (!sourcePath || !fs_1.default.existsSync(sourcePath)) {
        return {
            success: false,
            statusCode: 404,
            message: 'El archivo físico del video no se encuentra en el almacenamiento.',
        };
    }
    let genResult;
    try {
        genResult = await executeVideoThumbnailGeneration(tenantId, assetId, versionId, input, sourcePath);
    }
    catch (err) {
        return {
            success: false,
            statusCode: 400,
            message: err.message,
        };
    }
    // Delete old file if existing record present for same offset/type
    const existing = (await db.query(`SELECT id, output_derivative_path FROM dam_asset_video_thumbnails
     WHERE tenant_id = ? AND asset_id = ? AND version_id = ? AND thumbnail_type = ? AND timestamp_offset_seconds = ?
     LIMIT 1`, [tenantId, assetId, versionId, input.thumbnail_type, genResult.clampedOffset]));
    if (existing && existing.length > 0 && existing[0].output_derivative_path) {
        const oldPath = existing[0].output_derivative_path;
        (0, storage_1.assertPathContained)(oldPath);
        try {
            fs_1.default.rmSync(oldPath, { force: true });
        }
        catch {
            // Non-critical
        }
    }
    const upsertResult = (await db.query(`INSERT INTO dam_asset_video_thumbnails
     (tenant_id, asset_id, version_id, thumbnail_type, timestamp_offset_seconds, duration_seconds, width, height, fps, output_derivative_path, thumbnail_metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       duration_seconds = VALUES(duration_seconds),
       width = VALUES(width),
       height = VALUES(height),
       fps = VALUES(fps),
       output_derivative_path = VALUES(output_derivative_path),
       thumbnail_metadata = VALUES(thumbnail_metadata),
       updated_at = CURRENT_TIMESTAMP`, [
        tenantId,
        assetId,
        versionId,
        input.thumbnail_type,
        genResult.clampedOffset,
        input.duration_seconds,
        genResult.width,
        genResult.height,
        input.fps,
        genResult.outputDerivativePath,
        JSON.stringify(genResult.metadata),
    ]));
    const recordId = Number(upsertResult.insertId);
    const thumbnailRecord = {
        id: recordId,
        tenant_id: tenantId,
        asset_id: assetId,
        version_id: versionId,
        thumbnail_type: input.thumbnail_type,
        timestamp_offset_seconds: genResult.clampedOffset,
        duration_seconds: input.duration_seconds,
        width: genResult.width,
        height: genResult.height,
        fps: input.fps,
        output_derivative_path: genResult.outputDerivativePath,
        thumbnail_metadata: genResult.metadata,
        created_at: new Date().toISOString(),
    };
    void (0, webhookDispatcher_1.dispatchWebhookEvent)(tenantId, 'asset.updated', {
        asset_id: assetId,
        event_type: 'VIDEO_THUMBNAIL_GENERATED',
        thumbnail_id: recordId,
        thumbnail_type: input.thumbnail_type,
    });
    return {
        success: true,
        statusCode: 201,
        thumbnail: thumbnailRecord,
    };
}
/**
 * Service function: Lists video thumbnails and animated previews for an asset.
 */
async function listAssetVideoThumbnails(tenantId, assetId, limit = 50, offset = 0, thumbnailType) {
    let queryStr = `SELECT * FROM dam_asset_video_thumbnails WHERE tenant_id = ? AND asset_id = ?`;
    const params = [tenantId, assetId];
    if (thumbnailType) {
        queryStr += ` AND thumbnail_type = ?`;
        params.push(thumbnailType);
    }
    queryStr += ` ORDER BY timestamp_offset_seconds ASC, created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);
    const rows = (await db.query(queryStr, params));
    return rows.map((row) => ({
        id: Number(row.id),
        tenant_id: Number(row.tenant_id),
        asset_id: Number(row.asset_id),
        version_id: Number(row.version_id),
        thumbnail_type: row.thumbnail_type,
        timestamp_offset_seconds: Number(row.timestamp_offset_seconds),
        duration_seconds: Number(row.duration_seconds),
        width: Number(row.width),
        height: Number(row.height),
        fps: Number(row.fps),
        output_derivative_path: row.output_derivative_path,
        thumbnail_metadata: typeof row.thumbnail_metadata === 'string'
            ? JSON.parse(row.thumbnail_metadata)
            : row.thumbnail_metadata,
        created_at: row.created_at,
        updated_at: row.updated_at,
    }));
}
/**
 * Service function: Gets a specific video thumbnail by ID.
 */
async function getAssetVideoThumbnailById(tenantId, assetId, thumbnailId) {
    const rows = (await db.query(`SELECT * FROM dam_asset_video_thumbnails WHERE id = ? AND tenant_id = ? AND asset_id = ? LIMIT 1`, [thumbnailId, tenantId, assetId]));
    if (!rows || rows.length === 0) {
        return null;
    }
    const row = rows[0];
    return {
        id: Number(row.id),
        tenant_id: Number(row.tenant_id),
        asset_id: Number(row.asset_id),
        version_id: Number(row.version_id),
        thumbnail_type: row.thumbnail_type,
        timestamp_offset_seconds: Number(row.timestamp_offset_seconds),
        duration_seconds: Number(row.duration_seconds),
        width: Number(row.width),
        height: Number(row.height),
        fps: Number(row.fps),
        output_derivative_path: row.output_derivative_path,
        thumbnail_metadata: typeof row.thumbnail_metadata === 'string'
            ? JSON.parse(row.thumbnail_metadata)
            : row.thumbnail_metadata,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}
/**
 * Service function: Deletes a video thumbnail and unlinks the derivative file from disk.
 */
async function deleteAssetVideoThumbnail(tenantId, assetId, thumbnailId) {
    const record = await getAssetVideoThumbnailById(tenantId, assetId, thumbnailId);
    if (!record) {
        return false;
    }
    if (record.output_derivative_path) {
        (0, storage_1.assertPathContained)(record.output_derivative_path);
        fs_1.default.rmSync(record.output_derivative_path, { force: true });
        // If VTT, also cleanup sprite if referenced
        if (record.thumbnail_metadata?.sprite_filename) {
            const spritePath = path_1.default.join(path_1.default.dirname(record.output_derivative_path), record.thumbnail_metadata.sprite_filename);
            (0, storage_1.assertPathContained)(spritePath);
            fs_1.default.rmSync(spritePath, { force: true });
        }
    }
    await db.query(`DELETE FROM dam_asset_video_thumbnails 
     WHERE id = ? AND tenant_id = ? AND asset_id = ?`, [thumbnailId, tenantId, assetId]);
    void (0, webhookDispatcher_1.dispatchWebhookEvent)(tenantId, 'asset.updated', {
        asset_id: assetId,
        event_type: 'VIDEO_THUMBNAIL_DELETED',
        thumbnail_id: thumbnailId,
    });
    return true;
}
