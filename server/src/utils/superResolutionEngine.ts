import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import * as db from '../db';
import { assertPathContained, STORAGE_ROOT } from './storage';
import { dispatchWebhookEvent } from './webhookDispatcher';
import {
  CreateSuperResolutionInput,
  ScaleFactor,
  UpscaleAlgorithm,
} from '../schemas/superResolution.schema';

export const MAX_OUTPUT_PIXELS = 16_000_000; // 16 Megapixels limit (OWASP A04)

export const ALLOWED_RASTER_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export function isRasterImage(mimeType: string): boolean {
  if (!mimeType) return false;
  return ALLOWED_RASTER_MIME_TYPES.has(mimeType.toLowerCase());
}

export interface SuperResolutionRecord {
  id: number;
  tenant_id: number;
  asset_id: number;
  version_id: number;
  scale_factor: ScaleFactor;
  algorithm: UpscaleAlgorithm;
  denoise_level: number;
  sharpness_boost: number;
  output_width: number;
  output_height: number;
  output_derivative_path: string;
  upscale_metadata: Record<string, any>;
  created_at: string;
}

export async function generateSuperResolutionDerivative(
  tenantId: number,
  assetId: number,
  versionId: number,
  scaleFactor: ScaleFactor,
  algorithm: UpscaleAlgorithm,
  denoiseLevel: number,
  sharpnessBoost: number,
  sourcePath: string,
): Promise<{
  derivativePath: string;
  outputWidth: number;
  outputHeight: number;
  metadata: Record<string, any>;
}> {
  const image = sharp(sourcePath);
  const metadata = await image.metadata();

  const sourceWidth = Number(metadata.width);
  const sourceHeight = Number(metadata.height);

  const multiplier = scaleFactor === '4x' ? 4 : 2;
  const outputWidth = sourceWidth * multiplier;
  const outputHeight = sourceHeight * multiplier;

  if (outputWidth * outputHeight > MAX_OUTPUT_PIXELS) {
    throw new Error(
      `La resolución escalada resultante (${outputWidth}x${outputHeight}) excede el límite máximo permitido de 16 Megapíxeles.`,
    );
  }

  const derivativesDir = path.join(STORAGE_ROOT, 'derivatives', `tenant_${tenantId}`);
  assertPathContained(derivativesDir);
  fs.mkdirSync(derivativesDir, { recursive: true });

  const safeAlgo = algorithm.toLowerCase();
  const timestamp = Date.now();
  const derivativeFileName = `upscale_${assetId}_v${versionId}_${scaleFactor}_${safeAlgo}_${timestamp}.webp`;
  const derivativePath = path.join(derivativesDir, derivativeFileName);
  assertPathContained(derivativePath);

  let pipeline: sharp.Sharp;

  if (algorithm === 'LANCZOS3_SHARP') {
    pipeline = sharp(sourcePath).resize(outputWidth, outputHeight, {
      kernel: sharp.kernel.lanczos3,
      fastShrinkOnLoad: false,
    });

    if (sharpnessBoost > 0) {
      pipeline = pipeline.sharpen({ sigma: 0.5 + sharpnessBoost * 0.05, m1: 1.0, m2: 2.0 });
    }
    if (denoiseLevel > 0) {
      pipeline = pipeline.median(Math.min(3, Math.max(1, Math.round(denoiseLevel / 20))));
    }
  } else if (algorithm === 'BICUBIC_SMOOTH') {
    pipeline = sharp(sourcePath).resize(outputWidth, outputHeight, {
      kernel: sharp.kernel.cubic,
      fastShrinkOnLoad: false,
    });

    if (denoiseLevel > 0) {
      pipeline = pipeline.blur(Math.max(0.3, Math.min(2.0, denoiseLevel * 0.04)));
    }
    if (sharpnessBoost > 0) {
      pipeline = pipeline.sharpen({ sigma: 0.3 + sharpnessBoost * 0.02, m1: 1.0, m2: 1.5 });
    }
  } else {
    // EDGES_ENHANCED
    pipeline = sharp(sourcePath)
      .resize(outputWidth, outputHeight, {
        kernel: sharp.kernel.cubic,
        fastShrinkOnLoad: false,
      })
      .linear(1.04, -2);

    if (sharpnessBoost > 0) {
      pipeline = pipeline.sharpen({ sigma: 1.0 + sharpnessBoost * 0.06, m1: 1.5, m2: 3.0 });
    }
  }

  await pipeline.webp({ quality: 95 }).toFile(derivativePath);

  return {
    derivativePath,
    outputWidth,
    outputHeight,
    metadata: {
      scale_factor: scaleFactor,
      multiplier,
      algorithm,
      denoise_level: denoiseLevel,
      sharpness_boost: sharpnessBoost,
      source_width: sourceWidth,
      source_height: sourceHeight,
      output_width: outputWidth,
      output_height: outputHeight,
      processed_at: new Date().toISOString(),
    },
  };
}

export async function createAssetSuperResolution(
  tenantId: number,
  assetId: number,
  versionId: number,
  input: CreateSuperResolutionInput,
): Promise<
  | { success: true; upscale: SuperResolutionRecord; statusCode: 201 }
  | { success: false; statusCode: number; message: string }
> {
  const assetRows = await db.query(
    `SELECT a.id, a.tenant_id, a.mime_type, a.current_version_id, v.storage_path, v.file_size
     FROM assets a
     LEFT JOIN asset_versions v ON v.id = ? AND v.tenant_id = a.tenant_id
     WHERE a.id = ? AND a.tenant_id = ?`,
    [versionId, assetId, tenantId],
  );

  if (!assetRows || assetRows.length === 0) {
    return {
      success: false,
      statusCode: 404,
      message: 'Activo o versión no encontrado.',
    };
  }

  const asset = assetRows[0];

  if (!isRasterImage(asset.mime_type)) {
    return {
      success: false,
      statusCode: 400,
      message: `El tipo MIME '${asset.mime_type}' no es compatible con super-resolución y escalado. Solo se admiten formatos raster (JPEG, PNG, WebP, GIF).`,
    };
  }

  let storage_path = asset.storage_path;
  if (!storage_path) {
    const fallbackVersion = await db.query(
      `SELECT storage_path FROM asset_versions WHERE asset_id = ? AND tenant_id = ? ORDER BY version_number DESC LIMIT 1`,
      [assetId, tenantId],
    );
    if (fallbackVersion && fallbackVersion.length > 0) {
      storage_path = fallbackVersion[0].storage_path;
    }
  }

  if (!storage_path || !fs.existsSync(storage_path)) {
    return {
      success: false,
      statusCode: 404,
      message: 'El archivo físico del activo no se encuentra en el almacenamiento.',
    };
  }

  assertPathContained(storage_path);

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

  const multiplier = input.scale_factor === '4x' ? 4 : 2;
  const targetOutputWidth = sourceWidth * multiplier;
  const targetOutputHeight = sourceHeight * multiplier;

  if (targetOutputWidth * targetOutputHeight > MAX_OUTPUT_PIXELS) {
    return {
      success: false,
      statusCode: 400,
      message: `La resolución escalada resultante (${targetOutputWidth}x${targetOutputHeight}) excede el límite máximo permitido de 16 Megapíxeles.`,
    };
  }

  const { derivativePath, outputWidth, outputHeight, metadata } =
    await generateSuperResolutionDerivative(
      tenantId,
      assetId,
      versionId,
      input.scale_factor,
      input.algorithm,
      input.denoise_level,
      input.sharpness_boost,
      storage_path,
    );

  const existing = await db.query(
    `SELECT id, output_derivative_path FROM dam_asset_super_resolutions 
     WHERE tenant_id = ? AND asset_id = ? AND version_id = ? AND scale_factor = ? AND algorithm = ?`,
    [tenantId, assetId, versionId, input.scale_factor, input.algorithm],
  );

  if (existing && existing.length > 0 && existing[0].output_derivative_path) {
    const oldPath = existing[0].output_derivative_path;
    try {
      assertPathContained(oldPath);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    } catch {
      // Ignore cleanup error of old file
    }
  }

  const result = await db.query(
    `INSERT INTO dam_asset_super_resolutions 
     (tenant_id, asset_id, version_id, scale_factor, algorithm, denoise_level, sharpness_boost, output_width, output_height, output_derivative_path, upscale_metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       denoise_level = VALUES(denoise_level),
       sharpness_boost = VALUES(sharpness_boost),
       output_width = VALUES(output_width),
       output_height = VALUES(output_height),
       output_derivative_path = VALUES(output_derivative_path),
       upscale_metadata = VALUES(upscale_metadata),
       created_at = CURRENT_TIMESTAMP`,
    [
      tenantId,
      assetId,
      versionId,
      input.scale_factor,
      input.algorithm,
      input.denoise_level,
      input.sharpness_boost,
      outputWidth,
      outputHeight,
      derivativePath,
      JSON.stringify(metadata),
    ],
  );

  const upscaleId = Number(result.insertId);

  const record: SuperResolutionRecord = {
    id: upscaleId,
    tenant_id: tenantId,
    asset_id: assetId,
    version_id: versionId,
    scale_factor: input.scale_factor,
    algorithm: input.algorithm,
    denoise_level: input.denoise_level,
    sharpness_boost: input.sharpness_boost,
    output_width: outputWidth,
    output_height: outputHeight,
    output_derivative_path: derivativePath,
    upscale_metadata: metadata,
    created_at: new Date().toISOString(),
  };

  void dispatchWebhookEvent(tenantId, 'asset.updated', {
    asset_id: assetId,
    event_type: 'IMAGE_UPSCALED',
    upscale_id: upscaleId,
    scale_factor: input.scale_factor,
    algorithm: input.algorithm,
    output_width: outputWidth,
    output_height: outputHeight,
  });

  return {
    success: true,
    upscale: record,
    statusCode: 201,
  };
}

export async function listAssetSuperResolutions(
  tenantId: number,
  assetId: number,
  limit: number = 50,
  offset: number = 0,
  scaleFactor?: ScaleFactor,
  algorithm?: UpscaleAlgorithm,
): Promise<SuperResolutionRecord[]> {
  let sql = `SELECT * FROM dam_asset_super_resolutions WHERE tenant_id = ? AND asset_id = ?`;
  const params: any[] = [tenantId, assetId];

  if (scaleFactor) {
    sql += ` AND scale_factor = ?`;
    params.push(scaleFactor);
  }

  if (algorithm) {
    sql += ` AND algorithm = ?`;
    params.push(algorithm);
  }

  sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const rows = await db.query(sql, params);

  return rows.map((row: any) => ({
    id: Number(row.id),
    tenant_id: Number(row.tenant_id),
    asset_id: Number(row.asset_id),
    version_id: Number(row.version_id),
    scale_factor: row.scale_factor,
    algorithm: row.algorithm,
    denoise_level: Number(row.denoise_level),
    sharpness_boost: Number(row.sharpness_boost),
    output_width: Number(row.output_width),
    output_height: Number(row.output_height),
    output_derivative_path: row.output_derivative_path,
    upscale_metadata:
      typeof row.upscale_metadata === 'string'
        ? JSON.parse(row.upscale_metadata)
        : row.upscale_metadata,
    created_at: row.created_at,
  }));
}

export async function getAssetSuperResolutionById(
  tenantId: number,
  assetId: number,
  upscaleId: number,
): Promise<SuperResolutionRecord | null> {
  const rows = await db.query(
    `SELECT * FROM dam_asset_super_resolutions 
     WHERE id = ? AND tenant_id = ? AND asset_id = ?`,
    [upscaleId, tenantId, assetId],
  );

  if (!rows || rows.length === 0) {
    return null;
  }

  const row = rows[0];
  return {
    id: Number(row.id),
    tenant_id: Number(row.tenant_id),
    asset_id: Number(row.asset_id),
    version_id: Number(row.version_id),
    scale_factor: row.scale_factor,
    algorithm: row.algorithm,
    denoise_level: Number(row.denoise_level),
    sharpness_boost: Number(row.sharpness_boost),
    output_width: Number(row.output_width),
    output_height: Number(row.output_height),
    output_derivative_path: row.output_derivative_path,
    upscale_metadata:
      typeof row.upscale_metadata === 'string'
        ? JSON.parse(row.upscale_metadata)
        : row.upscale_metadata,
    created_at: row.created_at,
  };
}

export async function deleteAssetSuperResolution(
  tenantId: number,
  assetId: number,
  upscaleId: number,
): Promise<boolean> {
  const record = await getAssetSuperResolutionById(tenantId, assetId, upscaleId);
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
    `DELETE FROM dam_asset_super_resolutions 
     WHERE id = ? AND tenant_id = ? AND asset_id = ?`,
    [upscaleId, tenantId, assetId],
  );

  void dispatchWebhookEvent(tenantId, 'asset.updated', {
    asset_id: assetId,
    event_type: 'UPSCALING_DELETED',
    upscale_id: upscaleId,
  });

  return true;
}
