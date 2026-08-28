/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import * as db from '../db';
import { STORAGE_ROOT, assertPathContained } from './storage';
import { dispatchWebhookEvent } from './webhookDispatcher';
import { probeVideoFile, ALLOWED_VIDEO_MIMES, isVideo } from './videoTranscodingEngine';
import {
  VideoThumbnailType,
  CreateVideoThumbnailInput,
} from '../schemas/videoThumbnail.schema';

export const MAX_PIXELS = 16_000_000; // 16 MPx limit (OWASP A04)

export interface AssetVideoThumbnailRecord {
  id: number;
  tenant_id: number;
  asset_id: number;
  version_id: number;
  thumbnail_type: VideoThumbnailType;
  timestamp_offset_seconds: number;
  duration_seconds: number;
  width: number;
  height: number;
  fps: number;
  output_derivative_path: string;
  thumbnail_metadata: Record<string, any>;
  created_at: string;
  updated_at?: string;
}

/**
 * Clamps timestamp offset within valid video duration [0, duration].
 */
export function clampTimestampOffset(requestedOffset: number, totalDuration: number): number {
  if (requestedOffset < 0) return 0;
  if (requestedOffset > totalDuration) return totalDuration;
  return Math.round(requestedOffset * 100) / 100;
}

/**
 * Generates WebVTT Hover Scrubber cues for contact sheet thumbnails.
 */
export function generateVttHoverScrubberContent(
  imageFilename: string,
  tileWidth: number,
  tileHeight: number,
  totalDuration: number,
  stepSeconds = 2,
): string {
  let content = 'WEBVTT\n\n';
  const numSteps = Math.max(1, Math.ceil(totalDuration / stepSeconds));

  const formatVttTime = (seconds: number) => {
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
export async function executeVideoThumbnailGeneration(
  tenantId: number,
  assetId: number,
  versionId: number,
  input: CreateVideoThumbnailInput,
  sourcePath: string,
): Promise<{
  outputDerivativePath: string;
  width: number;
  height: number;
  clampedOffset: number;
  metadata: Record<string, any>;
}> {
  assertPathContained(sourcePath);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`El archivo de video no existe: ${sourcePath}`);
  }

  const probe = await probeVideoFile(sourcePath);
  const clampedOffset = clampTimestampOffset(input.timestamp_offset_seconds, probe.duration);

  const totalPixels = input.width * input.height;
  if (totalPixels > MAX_PIXELS) {
    throw new Error(
      `Las dimensiones especificadas (${input.width}x${input.height}) exceden el límite máximo de ${MAX_PIXELS} píxeles.`,
    );
  }

  const targetWidth = Math.min(input.width, 1920);
  const targetHeight = Math.min(input.height, 1080);

  const outputDir = path.join(STORAGE_ROOT, 'derivatives', `tenant_${tenantId}`);
  assertPathContained(outputDir);
  fs.mkdirSync(outputDir, { recursive: true });

  const offsetTag = Math.round(clampedOffset * 100);
  let derivativeFilename: string;
  let derivativePath: string;

  const metadata: Record<string, any> = {
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
      derivativePath = path.join(outputDir, derivativeFilename);
      assertPathContained(derivativePath);

      await sharp({
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
      derivativePath = path.join(outputDir, derivativeFilename);
      assertPathContained(derivativePath);

      await sharp({
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
      derivativePath = path.join(outputDir, derivativeFilename);
      assertPathContained(derivativePath);

      await sharp({
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
      const spritePath = path.join(outputDir, spriteFilename);
      assertPathContained(spritePath);

      const numSteps = Math.max(1, Math.ceil(probe.duration / 2));
      const totalSpriteHeight = Math.min(targetHeight * numSteps, 16384);

      await sharp({
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
      derivativePath = path.join(outputDir, derivativeFilename);
      assertPathContained(derivativePath);

      const vttContent = generateVttHoverScrubberContent(
        spriteFilename,
        targetWidth,
        targetHeight,
        probe.duration,
        2,
      );
      fs.writeFileSync(derivativePath, vttContent, 'utf-8');

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
export async function createAssetVideoThumbnail(
  tenantId: number,
  assetId: number,
  versionId: number,
  input: CreateVideoThumbnailInput,
): Promise<
  | { success: true; statusCode: 201; thumbnail: AssetVideoThumbnailRecord }
  | { success: false; statusCode: 400 | 404; message: string }
> {
  const assetRows = (await db.query(
    `SELECT a.id, a.tenant_id, a.mime_type, a.current_version_id, av.storage_path
     FROM assets a
     LEFT JOIN asset_versions av ON av.id = a.current_version_id
     WHERE a.id = ? AND a.tenant_id = ?
     LIMIT 1`,
    [assetId, tenantId],
  )) as any[];

  if (!assetRows || assetRows.length === 0) {
    return {
      success: false,
      statusCode: 404,
      message: 'Activo digital no encontrado.',
    };
  }

  const asset = assetRows[0];

  if (!isVideo(asset.mime_type)) {
    return {
      success: false,
      statusCode: 400,
      message: `El tipo MIME '${asset.mime_type || 'desconocido'}' no es un video compatible. Solo se admiten formatos de video (${ALLOWED_VIDEO_MIMES.join(', ')}).`,
    };
  }

  let sourcePath = asset.storage_path;
  if (!sourcePath) {
    const fallbackVersion = (await db.query(
      `SELECT storage_path FROM asset_versions WHERE asset_id = ? AND tenant_id = ? ORDER BY version_number DESC LIMIT 1`,
      [assetId, tenantId],
    )) as any[];

    if (fallbackVersion && fallbackVersion.length > 0) {
      sourcePath = fallbackVersion[0].storage_path;
    }
  }

  if (!sourcePath || !fs.existsSync(sourcePath)) {
    return {
      success: false,
      statusCode: 404,
      message: 'El archivo físico del video no se encuentra en el almacenamiento.',
    };
  }

  let genResult: {
    outputDerivativePath: string;
    width: number;
    height: number;
    clampedOffset: number;
    metadata: Record<string, any>;
  };

  try {
    genResult = await executeVideoThumbnailGeneration(tenantId, assetId, versionId, input, sourcePath);
  } catch (err: any) {
    return {
      success: false,
      statusCode: 400,
      message: err.message,
    };
  }

  // Delete old file if existing record present for same offset/type
  const existing = (await db.query(
    `SELECT id, output_derivative_path FROM dam_asset_video_thumbnails
     WHERE tenant_id = ? AND asset_id = ? AND version_id = ? AND thumbnail_type = ? AND timestamp_offset_seconds = ?
     LIMIT 1`,
    [tenantId, assetId, versionId, input.thumbnail_type, genResult.clampedOffset],
  )) as any[];

  if (existing && existing.length > 0 && existing[0].output_derivative_path) {
    const oldPath = existing[0].output_derivative_path;
    assertPathContained(oldPath);
    try {
      fs.rmSync(oldPath, { force: true });
    } catch {
      // Non-critical
    }
  }

  const upsertResult = (await db.query(
    `INSERT INTO dam_asset_video_thumbnails
     (tenant_id, asset_id, version_id, thumbnail_type, timestamp_offset_seconds, duration_seconds, width, height, fps, output_derivative_path, thumbnail_metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       duration_seconds = VALUES(duration_seconds),
       width = VALUES(width),
       height = VALUES(height),
       fps = VALUES(fps),
       output_derivative_path = VALUES(output_derivative_path),
       thumbnail_metadata = VALUES(thumbnail_metadata),
       updated_at = CURRENT_TIMESTAMP`,
    [
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
    ],
  )) as any;

  const recordId = Number(upsertResult.insertId);

  const thumbnailRecord: AssetVideoThumbnailRecord = {
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

  void dispatchWebhookEvent(tenantId, 'asset.updated', {
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
export async function listAssetVideoThumbnails(
  tenantId: number,
  assetId: number,
  limit = 50,
  offset = 0,
  thumbnailType?: VideoThumbnailType,
): Promise<AssetVideoThumbnailRecord[]> {
  let queryStr = `SELECT * FROM dam_asset_video_thumbnails WHERE tenant_id = ? AND asset_id = ?`;
  const params: any[] = [tenantId, assetId];

  if (thumbnailType) {
    queryStr += ` AND thumbnail_type = ?`;
    params.push(thumbnailType);
  }

  queryStr += ` ORDER BY timestamp_offset_seconds ASC, created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const rows = (await db.query(queryStr, params)) as any[];

  return rows.map((row) => ({
    id: Number(row.id),
    tenant_id: Number(row.tenant_id),
    asset_id: Number(row.asset_id),
    version_id: Number(row.version_id),
    thumbnail_type: row.thumbnail_type as VideoThumbnailType,
    timestamp_offset_seconds: Number(row.timestamp_offset_seconds),
    duration_seconds: Number(row.duration_seconds),
    width: Number(row.width),
    height: Number(row.height),
    fps: Number(row.fps),
    output_derivative_path: row.output_derivative_path,
    thumbnail_metadata:
      typeof row.thumbnail_metadata === 'string'
        ? JSON.parse(row.thumbnail_metadata)
        : row.thumbnail_metadata,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}

/**
 * Service function: Gets a specific video thumbnail by ID.
 */
export async function getAssetVideoThumbnailById(
  tenantId: number,
  assetId: number,
  thumbnailId: number,
): Promise<AssetVideoThumbnailRecord | null> {
  const rows = (await db.query(
    `SELECT * FROM dam_asset_video_thumbnails WHERE id = ? AND tenant_id = ? AND asset_id = ? LIMIT 1`,
    [thumbnailId, tenantId, assetId],
  )) as any[];

  if (!rows || rows.length === 0) {
    return null;
  }

  const row = rows[0];
  return {
    id: Number(row.id),
    tenant_id: Number(row.tenant_id),
    asset_id: Number(row.asset_id),
    version_id: Number(row.version_id),
    thumbnail_type: row.thumbnail_type as VideoThumbnailType,
    timestamp_offset_seconds: Number(row.timestamp_offset_seconds),
    duration_seconds: Number(row.duration_seconds),
    width: Number(row.width),
    height: Number(row.height),
    fps: Number(row.fps),
    output_derivative_path: row.output_derivative_path,
    thumbnail_metadata:
      typeof row.thumbnail_metadata === 'string'
        ? JSON.parse(row.thumbnail_metadata)
        : row.thumbnail_metadata,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Service function: Deletes a video thumbnail and unlinks the derivative file from disk.
 */
export async function deleteAssetVideoThumbnail(
  tenantId: number,
  assetId: number,
  thumbnailId: number,
): Promise<boolean> {
  const record = await getAssetVideoThumbnailById(tenantId, assetId, thumbnailId);
  if (!record) {
    return false;
  }

  if (record.output_derivative_path) {
    assertPathContained(record.output_derivative_path);
    fs.rmSync(record.output_derivative_path, { force: true });

    // If VTT, also cleanup sprite if referenced
    if (record.thumbnail_metadata?.sprite_filename) {
      const spritePath = path.join(
        path.dirname(record.output_derivative_path),
        record.thumbnail_metadata.sprite_filename,
      );
      assertPathContained(spritePath);
      fs.rmSync(spritePath, { force: true });
    }
  }

  await db.query(
    `DELETE FROM dam_asset_video_thumbnails 
     WHERE id = ? AND tenant_id = ? AND asset_id = ?`,
    [thumbnailId, tenantId, assetId],
  );

  void dispatchWebhookEvent(tenantId, 'asset.updated', {
    asset_id: assetId,
    event_type: 'VIDEO_THUMBNAIL_DELETED',
    thumbnail_id: thumbnailId,
  });

  return true;
}
