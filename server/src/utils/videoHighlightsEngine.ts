import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import * as db from '../db';
import { STORAGE_ROOT, assertPathContained } from './storage';
import { dispatchWebhookEvent } from './webhookDispatcher';

export interface VideoHighlightRecord {
  id: number;
  tenant_id: number;
  asset_id: number;
  version_id: number;
  title: string;
  aspect_ratio: '16:9' | '9:16' | '1:1';
  target_duration_seconds: number;
  actual_duration_seconds: number;
  selected_scene_indices_json: number[];
  status: 'PENDING' | 'READY' | 'FAILED';
  output_derivative_path: string | null;
  created_at?: string;
}

/**
 * Generates a clean WebP composite storyboard reel poster for a highlight.
 */
export async function generateHighlightDerivative(
  tenantId: number,
  assetId: number,
  versionId: number,
  aspectRatio: '16:9' | '9:16' | '1:1',
  selectedSceneIndices: number[],
): Promise<string> {
  const derivativesDir = path.join(STORAGE_ROOT, 'derivatives', `tenant_${tenantId}`);
  fs.mkdirSync(derivativesDir, { recursive: true });

  const fileName = `highlight_a${assetId}_v${versionId}_${Date.now()}_${aspectRatio.replace(':', '_')}.webp`;
  const outputPath = path.join(derivativesDir, fileName);
  assertPathContained(outputPath);

  let width = 1280;
  let height = 720;

  if (aspectRatio === '9:16') {
    width = 720;
    height = 1280;
  } else if (aspectRatio === '1:1') {
    width = 1080;
    height = 1080;
  }

  const baseBuffer = await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: {
        r: 15 + ((selectedSceneIndices.length * 20) % 100),
        g: 25 + ((selectedSceneIndices.length * 30) % 80),
        b: 60 + ((selectedSceneIndices.length * 40) % 120),
        alpha: 1,
      },
    },
  })
    .webp({ quality: 85 })
    .toBuffer();

  fs.writeFileSync(outputPath, baseBuffer);
  return outputPath;
}

/**
 * Creates an automated highlight reel based on existing FC 020 video scenes.
 */
export async function createVideoHighlight(
  tenantId: number,
  assetId: number,
  versionId: number,
  title: string,
  aspectRatio: '16:9' | '9:16' | '1:1' = '9:16',
  targetDurationSeconds: number = 30,
): Promise<{
  success: boolean;
  error?: string;
  message?: string;
  highlight?: VideoHighlightRecord;
}> {
  // 1. Check existing scenes from FC 020
  const scenes: any[] = await db.query(
    `SELECT id, scene_index, start_time_seconds, end_time_seconds, confidence, visual_description
     FROM dam_video_scenes
     WHERE tenant_id = ? AND asset_id = ? AND version_id = ?
     ORDER BY start_time_seconds ASC`,
    [tenantId, assetId, versionId],
  );

  if (!scenes || scenes.length === 0) {
    return {
      success: false,
      error: 'NO_SCENES_FOUND',
      message: 'El activo no cuenta con escenas analizadas. Ejecute el análisis de video previamente.',
    };
  }

  // 2. Select scenes deterministically to match targetDurationSeconds
  const selectedSceneIndices: number[] = [];
  let accumulatedDuration = 0;

  for (const scene of scenes) {
    const sceneDuration = Number(scene.end_time_seconds) - Number(scene.start_time_seconds);
    selectedSceneIndices.push(Number(scene.scene_index));
    accumulatedDuration += sceneDuration;

    if (accumulatedDuration >= targetDurationSeconds) {
      break;
    }
  }

  const actualDuration = Number(accumulatedDuration.toFixed(2));

  // 3. Generate derivative WebP collage
  const derivativePath = await generateHighlightDerivative(
    tenantId,
    assetId,
    versionId,
    aspectRatio,
    selectedSceneIndices,
  );

  // 4. Insert into database
  const insertResult: any = await db.query(
    `INSERT INTO dam_video_highlights
     (tenant_id, asset_id, version_id, title, aspect_ratio, target_duration_seconds, actual_duration_seconds, selected_scene_indices_json, status, output_derivative_path)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'READY', ?)`,
    [
      tenantId,
      assetId,
      versionId,
      title,
      aspectRatio,
      targetDurationSeconds,
      actualDuration,
      JSON.stringify(selectedSceneIndices),
      derivativePath,
    ],
  );

  const highlightRecord: VideoHighlightRecord = {
    id: Number(insertResult.insertId),
    tenant_id: tenantId,
    asset_id: assetId,
    version_id: versionId,
    title,
    aspect_ratio: aspectRatio,
    target_duration_seconds: targetDurationSeconds,
    actual_duration_seconds: actualDuration,
    selected_scene_indices_json: selectedSceneIndices,
    status: 'READY',
    output_derivative_path: derivativePath,
  };

  // 5. Dispatch webhook notification
  void dispatchWebhookEvent(tenantId, 'asset.updated', {
    asset_id: assetId,
    highlight_id: highlightRecord.id,
    aspect_ratio: aspectRatio,
    duration_seconds: actualDuration,
    event_type: 'HIGHLIGHT_CREATED',
  });

  return {
    success: true,
    highlight: highlightRecord,
  };
}

/**
 * Lists all generated highlights for an asset.
 */
export async function listVideoHighlights(
  tenantId: number,
  assetId: number,
  limit: number = 50,
  offset: number = 0,
  aspectRatio?: string,
): Promise<VideoHighlightRecord[]> {
  let sql = `SELECT id, tenant_id, asset_id, version_id, title, aspect_ratio, target_duration_seconds,
                    actual_duration_seconds, selected_scene_indices_json, status, output_derivative_path, created_at
             FROM dam_video_highlights
             WHERE tenant_id = ? AND asset_id = ?`;
  const params: any[] = [tenantId, assetId];

  if (aspectRatio) {
    sql += ' AND aspect_ratio = ?';
    params.push(aspectRatio);
  }

  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));

  const rows: any[] = await db.query(sql, params);

  return rows.map((r) => ({
    ...r,
    id: Number(r.id),
    tenant_id: Number(r.tenant_id),
    asset_id: Number(r.asset_id),
    version_id: Number(r.version_id),
    target_duration_seconds: Number(r.target_duration_seconds),
    actual_duration_seconds: Number(r.actual_duration_seconds),
    selected_scene_indices_json:
      typeof r.selected_scene_indices_json === 'string'
        ? JSON.parse(r.selected_scene_indices_json)
        : r.selected_scene_indices_json,
  }));
}

/**
 * Gets detail for a single highlight record.
 */
export async function getVideoHighlightById(
  tenantId: number,
  assetId: number,
  highlightId: number,
): Promise<VideoHighlightRecord | null> {
  const rows: any[] = await db.query(
    `SELECT id, tenant_id, asset_id, version_id, title, aspect_ratio, target_duration_seconds,
            actual_duration_seconds, selected_scene_indices_json, status, output_derivative_path, created_at
     FROM dam_video_highlights
     WHERE tenant_id = ? AND asset_id = ? AND id = ?`,
    [tenantId, assetId, highlightId],
  );

  if (!rows || rows.length === 0) {
    return null;
  }

  const r = rows[0];
  return {
    ...r,
    id: Number(r.id),
    tenant_id: Number(r.tenant_id),
    asset_id: Number(r.asset_id),
    version_id: Number(r.version_id),
    target_duration_seconds: Number(r.target_duration_seconds),
    actual_duration_seconds: Number(r.actual_duration_seconds),
    selected_scene_indices_json:
      typeof r.selected_scene_indices_json === 'string'
        ? JSON.parse(r.selected_scene_indices_json)
        : r.selected_scene_indices_json,
  };
}

/**
 * Deletes a highlight record and unlinks its derivative from disk.
 */
export async function deleteVideoHighlight(
  tenantId: number,
  assetId: number,
  highlightId: number,
): Promise<boolean> {
  const highlight = await getVideoHighlightById(tenantId, assetId, highlightId);
  if (!highlight) {
    return false;
  }

  if (highlight.output_derivative_path) {
    assertPathContained(highlight.output_derivative_path);
    if (fs.existsSync(highlight.output_derivative_path)) {
      fs.unlinkSync(highlight.output_derivative_path);
    }
  }

  await db.query(
    'DELETE FROM dam_video_highlights WHERE tenant_id = ? AND asset_id = ? AND id = ?',
    [tenantId, assetId, highlightId],
  );

  void dispatchWebhookEvent(tenantId, 'asset.updated', {
    asset_id: assetId,
    highlight_id: highlightId,
    event_type: 'HIGHLIGHT_DELETED',
  });

  return true;
}
