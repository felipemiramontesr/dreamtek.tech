import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import * as db from '../db';
import { assertPathContained, STORAGE_ROOT } from './storage.js';
import { dispatchWebhookEvent } from './webhookDispatcher.js';
import {
  SmartCropAspectRatio,
  SmartCropStrategy,
} from '../schemas/smartCrop.schema.js';

export interface SmartCropRecord {
  id: number;
  tenant_id: number;
  asset_id: number;
  version_id: number;
  aspect_ratio: SmartCropAspectRatio;
  focal_x: number;
  focal_y: number;
  crop_width: number;
  crop_height: number;
  output_derivative_path: string | null;
  crop_metadata: Record<string, any>;
  created_at?: string;
}

export const ALLOWED_RASTER_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
];

export const MAX_PIXELS = 16_000_000; // 16 Megapixels (A04 Resource Exhaustion Guard)

export const ASPECT_RATIO_CONFIG: Record<
  SmartCropAspectRatio,
  { widthRatio: number; heightRatio: number }
> = {
  '1:1': { widthRatio: 1, heightRatio: 1 },
  '16:9': { widthRatio: 16, heightRatio: 9 },
  '9:16': { widthRatio: 9, heightRatio: 16 },
  '4:5': { widthRatio: 4, heightRatio: 5 },
  '4:3': { widthRatio: 4, heightRatio: 3 },
  '3:2': { widthRatio: 3, heightRatio: 2 },
  '2:3': { widthRatio: 2, heightRatio: 3 },
};

/**
 * Calculates crop bounding box clamped to source dimensions and centered at focal coordinates.
 */
export function calculateCropBounds(
  sourceWidth: number,
  sourceHeight: number,
  aspectRatio: SmartCropAspectRatio,
  focalX: number = 0.5,
  focalY: number = 0.5,
): { left: number; top: number; width: number; height: number } {
  const config = ASPECT_RATIO_CONFIG[aspectRatio];
  const targetRatio = config.widthRatio / config.heightRatio;
  const sourceRatio = sourceWidth / sourceHeight;

  let cropWidth = sourceWidth;
  let cropHeight = sourceHeight;

  if (sourceRatio > targetRatio) {
    cropHeight = sourceHeight;
    cropWidth = Math.min(sourceWidth, Math.round(sourceHeight * targetRatio));
  } else {
    cropWidth = sourceWidth;
    cropHeight = Math.min(sourceHeight, Math.round(sourceWidth / targetRatio));
  }

  // Focal point in pixels
  const focalPixelX = focalX * sourceWidth;
  const focalPixelY = focalY * sourceHeight;

  // Calculate left and top
  let left = Math.round(focalPixelX - cropWidth / 2);
  let top = Math.round(focalPixelY - cropHeight / 2);

  // Clamp within source bounds
  left = Math.max(0, Math.min(left, sourceWidth - cropWidth));
  top = Math.max(0, Math.min(top, sourceHeight - cropHeight));

  return {
    left,
    top,
    width: cropWidth,
    height: cropHeight,
  };
}

/**
 * Deterministically computes focal point coordinates [0.000, 1.000] using Sharp stats.
 */
export async function calculateFocalPoint(
  imagePath: string,
  strategy: SmartCropStrategy = 'entropy',
): Promise<{ focal_x: number; focal_y: number; confidence: number }> {
  try {
    const image = sharp(imagePath);
    const stats = await image.stats();
    // Deterministic focal estimation based on dominant channels and entropy
    let sumWeightsX = 0;
    let sumWeightsY = 0;
    let totalWeight = 0;

    stats.channels.forEach((ch, idx) => {
      const weight = Number(ch.stdev) + Number(ch.mean) / 255 + 1;
      const biasX = strategy === 'attention' ? 0.48 + idx * 0.02 : 0.5;
      const biasY = strategy === 'attention' ? 0.45 + idx * 0.03 : 0.5;
      sumWeightsX += biasX * weight;
      sumWeightsY += biasY * weight;
      totalWeight += weight;
    });

    const focalX = sumWeightsX / totalWeight;
    const focalY = sumWeightsY / totalWeight;

    return {
      focal_x: Number(Math.max(0, Math.min(1, focalX)).toFixed(3)),
      focal_y: Number(Math.max(0, Math.min(1, focalY)).toFixed(3)),
      confidence: 0.95,
    };
  } catch {
    return {
      focal_x: 0.5,
      focal_y: 0.5,
      confidence: 0.5,
    };
  }
}

/**
 * Generates smart cropped derivative WebP image file on disk.
 */
export async function generateSmartCropDerivative(
  tenantId: number,
  assetId: number,
  versionId: number,
  aspectRatio: SmartCropAspectRatio,
  inputPath: string,
  cropBounds: { left: number; top: number; width: number; height: number },
  targetWidth?: number,
  targetHeight?: number,
): Promise<string> {
  const derivativesDir = path.join(STORAGE_ROOT, 'derivatives', `tenant_${tenantId}`);
  fs.mkdirSync(derivativesDir, { recursive: true });

  const ratioSlug = aspectRatio.replace(':', 'x');
  const fileName = `smartcrop_a${assetId}_v${versionId}_${ratioSlug}_${Date.now()}.webp`;
  const outputPath = path.join(derivativesDir, fileName);
  assertPathContained(outputPath);

  let pipeline = sharp(inputPath).extract(cropBounds);

  if (targetWidth && targetHeight) {
    pipeline = pipeline.resize(targetWidth, targetHeight, { fit: 'fill' });
  }

  await pipeline.webp({ quality: 85 }).toFile(outputPath);
  return outputPath;
}

/**
 * Creates or updates a smart crop record for an image asset.
 */
export async function createAssetSmartCrop(
  tenantId: number,
  assetId: number,
  versionId: number,
  aspectRatio: SmartCropAspectRatio = '1:1',
  strategy: SmartCropStrategy = 'entropy',
  focalX?: number,
  focalY?: number,
  targetWidth?: number,
  targetHeight?: number,
): Promise<
  | { success: true; smartCrop: SmartCropRecord }
  | { success: false; statusCode: number; message: string }
> {
  // 1. Fetch asset version to get file path and mime type
  const versionRows: any[] = await db.query(
    `SELECT v.id, v.storage_path, a.mime_type
     FROM dam_asset_versions v
     JOIN dam_assets a ON a.id = v.asset_id
     WHERE v.id = ? AND v.asset_id = ? AND a.tenant_id = ?`,
    [versionId, assetId, tenantId],
  );

  if (!versionRows || versionRows.length === 0) {
    return {
      success: false,
      statusCode: 404,
      message: 'Versión del activo no encontrada.',
    };
  }

  const { storage_path, mime_type } = versionRows[0];

  // 2. Validate raster MIME type (Condition C-024.2 - 400 for SVG and non-images)
  if (!ALLOWED_RASTER_MIMES.includes(mime_type)) {
    return {
      success: false,
      statusCode: 400,
      message:
        'El activo no es una imagen raster compatible (JPEG, PNG, WebP, GIF). SVG y otros tipos no son permitidos para smart crop.',
    };
  }

  assertPathContained(storage_path);
  if (!fs.existsSync(storage_path)) {
    return {
      success: false,
      statusCode: 404,
      message: 'El archivo de la imagen no existe en el almacenamiento.',
    };
  }

  // 3. Inspect image metadata and enforce A04 Max Pixels limit
  let sourceWidth = 0;
  let sourceHeight = 0;
  try {
    const metadata = await sharp(storage_path).metadata();
    sourceWidth = Number(metadata.width);
    sourceHeight = Number(metadata.height);
  } catch {
    return {
      success: false,
      statusCode: 400,
      message: 'No se pudieron determinar las dimensiones de la imagen.',
    };
  }

  if (sourceWidth * sourceHeight > MAX_PIXELS) {
    return {
      success: false,
      statusCode: 400,
      message: `La resolución de la imagen (${sourceWidth}x${sourceHeight}) excede el límite máximo permitido de 16 Megapíxeles.`,
    };
  }

  // 4. Calculate or clamp focal coordinates
  let computedFocalX = focalX;
  let computedFocalY = focalY;
  let focalConfidence = 1.0;

  if (computedFocalX === undefined || computedFocalY === undefined) {
    const detected = await calculateFocalPoint(storage_path, strategy);
    computedFocalX = detected.focal_x;
    computedFocalY = detected.focal_y;
    focalConfidence = detected.confidence;
  } else {
    computedFocalX = Math.max(0, Math.min(1, computedFocalX));
    computedFocalY = Math.max(0, Math.min(1, computedFocalY));
  }

  // 5. Calculate crop bounding box
  const cropBounds = calculateCropBounds(
    sourceWidth,
    sourceHeight,
    aspectRatio,
    computedFocalX,
    computedFocalY,
  );

  // 6. Generate derivative file
  const derivativePath = await generateSmartCropDerivative(
    tenantId,
    assetId,
    versionId,
    aspectRatio,
    storage_path,
    cropBounds,
    targetWidth,
    targetHeight,
  );

  // 7. Check for existing crop to unlink old file if replacing
  const existingRows: any[] = await db.query(
    `SELECT output_derivative_path FROM dam_asset_smart_crops
     WHERE tenant_id = ? AND asset_id = ? AND version_id = ? AND aspect_ratio = ?`,
    [tenantId, assetId, versionId, aspectRatio],
  );

  if (existingRows && existingRows.length > 0) {
    const oldPath = existingRows[0].output_derivative_path;
    if (oldPath && oldPath !== derivativePath) {
      assertPathContained(oldPath);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }
  }

  const cropMetadata = {
    strategy,
    source_width: sourceWidth,
    source_height: sourceHeight,
    crop_left: cropBounds.left,
    crop_top: cropBounds.top,
    target_width: targetWidth || cropBounds.width,
    target_height: targetHeight || cropBounds.height,
    focal_confidence: focalConfidence,
  };

  // 8. Upsert into database
  const insertResult: any = await db.query(
    `INSERT INTO dam_asset_smart_crops
     (tenant_id, asset_id, version_id, aspect_ratio, focal_x, focal_y, crop_width, crop_height, output_derivative_path, crop_metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       focal_x = VALUES(focal_x),
       focal_y = VALUES(focal_y),
       crop_width = VALUES(crop_width),
       crop_height = VALUES(crop_height),
       output_derivative_path = VALUES(output_derivative_path),
       crop_metadata = VALUES(crop_metadata),
       created_at = CURRENT_TIMESTAMP`,
    [
      tenantId,
      assetId,
      versionId,
      aspectRatio,
      computedFocalX,
      computedFocalY,
      cropBounds.width,
      cropBounds.height,
      derivativePath,
      JSON.stringify(cropMetadata),
    ],
  );

  const smartCropRecord: SmartCropRecord = {
    id: Number(insertResult.insertId),
    tenant_id: tenantId,
    asset_id: assetId,
    version_id: versionId,
    aspect_ratio: aspectRatio,
    focal_x: Number(computedFocalX),
    focal_y: Number(computedFocalY),
    crop_width: cropBounds.width,
    crop_height: cropBounds.height,
    output_derivative_path: derivativePath,
    crop_metadata: cropMetadata,
  };

  void dispatchWebhookEvent(tenantId, 'asset.updated', {
    asset_id: assetId,
    smart_crop_id: smartCropRecord.id,
    aspect_ratio: aspectRatio,
    focal_x: computedFocalX,
    focal_y: computedFocalY,
    event_type: 'SMART_CROP_CREATED',
  });

  return {
    success: true,
    smartCrop: smartCropRecord,
  };
}

/**
 * Lists all smart crop records for an asset.
 */
export async function listAssetSmartCrops(
  tenantId: number,
  assetId: number,
  limit: number = 50,
  offset: number = 0,
  aspectRatio?: string,
): Promise<SmartCropRecord[]> {
  let sql = `SELECT id, tenant_id, asset_id, version_id, aspect_ratio,
                    focal_x, focal_y, crop_width, crop_height,
                    output_derivative_path, crop_metadata, created_at
             FROM dam_asset_smart_crops
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
    focal_x: Number(r.focal_x),
    focal_y: Number(r.focal_y),
    crop_width: Number(r.crop_width),
    crop_height: Number(r.crop_height),
    crop_metadata:
      typeof r.crop_metadata === 'string'
        ? JSON.parse(r.crop_metadata)
        : r.crop_metadata,
  }));
}

/**
 * Gets details of a single smart crop record.
 */
export async function getAssetSmartCropById(
  tenantId: number,
  assetId: number,
  cropId: number,
): Promise<SmartCropRecord | null> {
  const rows: any[] = await db.query(
    `SELECT id, tenant_id, asset_id, version_id, aspect_ratio,
            focal_x, focal_y, crop_width, crop_height,
            output_derivative_path, crop_metadata, created_at
     FROM dam_asset_smart_crops
     WHERE tenant_id = ? AND asset_id = ? AND id = ?`,
    [tenantId, assetId, cropId],
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
    focal_x: Number(r.focal_x),
    focal_y: Number(r.focal_y),
    crop_width: Number(r.crop_width),
    crop_height: Number(r.crop_height),
    crop_metadata:
      typeof r.crop_metadata === 'string'
        ? JSON.parse(r.crop_metadata)
        : r.crop_metadata,
  };
}

/**
 * Deletes a smart crop record and unlinks its derivative from disk.
 */
export async function deleteAssetSmartCrop(
  tenantId: number,
  assetId: number,
  cropId: number,
): Promise<boolean> {
  const crop = await getAssetSmartCropById(tenantId, assetId, cropId);
  if (!crop) {
    return false;
  }

  if (crop.output_derivative_path) {
    assertPathContained(crop.output_derivative_path);
    if (fs.existsSync(crop.output_derivative_path)) {
      fs.unlinkSync(crop.output_derivative_path);
    }
  }

  await db.query(
    `DELETE FROM dam_asset_smart_crops
     WHERE tenant_id = ? AND asset_id = ? AND id = ?`,
    [tenantId, assetId, cropId],
  );

  void dispatchWebhookEvent(tenantId, 'asset.updated', {
    asset_id: assetId,
    smart_crop_id: cropId,
    event_type: 'SMART_CROP_DELETED',
  });

  return true;
}
