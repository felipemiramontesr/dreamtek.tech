import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import * as db from '../db';
import { STORAGE_ROOT, assertPathContained } from './storage';
import { dispatchWebhookEvent } from './webhookDispatcher';
import {
  TargetFormat,
  QualityPreset,
  CreateCompressionInput,
} from '../schemas/compression.schema';

/**
 * Maximum input pixel threshold to prevent decompression bombs (OWASP A04).
 * 16 Megapixels (e.g. 4000x4000).
 */
export const MAX_INPUT_PIXELS = 16_000_000;

export const ALLOWED_RASTER_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/tiff',
  'image/gif',
];

export const PRESET_DEFAULTS: Record<
  QualityPreset,
  { quality: number; effort: number; lossless: boolean; strip_metadata: boolean }
> = {
  HIGH_FIDELITY: { quality: 90, effort: 4, lossless: false, strip_metadata: true },
  BALANCED: { quality: 80, effort: 4, lossless: false, strip_metadata: true },
  MAX_COMPRESSION: { quality: 60, effort: 6, lossless: false, strip_metadata: true },
  LOSSLESS: { quality: 100, effort: 4, lossless: true, strip_metadata: false },
  CUSTOM: { quality: 80, effort: 4, lossless: false, strip_metadata: true },
};

export interface AssetCompressionRecord {
  id: number;
  tenant_id: number;
  asset_id: number;
  version_id: number;
  target_format: TargetFormat;
  quality_preset: QualityPreset;
  effort: number;
  quality: number;
  strip_metadata: boolean;
  original_bytes: number;
  compressed_bytes: number;
  savings_percentage: number;
  output_derivative_path: string;
  compression_metadata: Record<string, any>;
  created_at: string;
  updated_at?: string;
}

export function isRasterImage(mimeType?: string | null): boolean {
  if (!mimeType) return false;
  return ALLOWED_RASTER_MIMES.includes(mimeType.toLowerCase());
}

export function resolveCompressionParameters(input: CreateCompressionInput): {
  quality: number;
  effort: number;
  lossless: boolean;
  strip_metadata: boolean;
} {
  const preset = input.quality_preset || 'BALANCED';
  const defaults = PRESET_DEFAULTS[preset];

  return {
    quality: input.quality !== undefined ? input.quality : defaults.quality,
    effort: input.effort !== undefined ? input.effort : defaults.effort,
    lossless: input.lossless !== undefined ? input.lossless : defaults.lossless,
    strip_metadata:
      input.strip_metadata !== undefined ? input.strip_metadata : defaults.strip_metadata,
  };
}

export function calculateSavingsPercentage(
  originalBytes: number,
  compressedBytes: number,
): number {
  if (originalBytes <= 0) return 0;
  const ratio = ((originalBytes - compressedBytes) / originalBytes) * 100;
  return Math.min(100, Math.max(-100, Math.round(ratio * 100) / 100));
}

/**
 * Generates an optimized, compressed image derivative using Sharp (FC 029).
 */
export async function generateCompressionDerivative(
  tenantId: number,
  assetId: number,
  versionId: number,
  targetFormat: TargetFormat,
  qualityPreset: QualityPreset,
  quality: number,
  effort: number,
  lossless: boolean,
  stripMetadata: boolean,
  sourcePath: string,
): Promise<{
  derivativePath: string;
  compressedBytes: number;
  originalBytes: number;
  savingsPercentage: number;
  metadata: Record<string, any>;
}> {
  assertPathContained(sourcePath);

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`El archivo de origen no existe: ${sourcePath}`);
  }

  const originalBytes = fs.statSync(sourcePath).size;

  const imageMeta = await sharp(sourcePath).metadata();
  const width = Number(imageMeta.width);
  const height = Number(imageMeta.height);

  if (width * height > MAX_INPUT_PIXELS) {
    throw new Error(
      `La imagen de entrada (${width}x${height} = ${width * height} px) excede el límite máximo de ${MAX_INPUT_PIXELS} píxeles (16 MPx).`,
    );
  }

  const outputDir = path.join(STORAGE_ROOT, 'derivatives', `tenant_${tenantId}`);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const ext = targetFormat === 'JPEG' ? 'jpg' : targetFormat.toLowerCase();
  const fileName = `compression_${assetId}_v${versionId}_${targetFormat.toLowerCase()}_${qualityPreset.toLowerCase()}_${Date.now()}.${ext}`;
  const derivativePath = path.join(outputDir, fileName);
  assertPathContained(derivativePath);

  let pipeline = sharp(sourcePath, { pages: 1 });

  if (!stripMetadata) {
    pipeline = pipeline.withMetadata();
  }

  if (targetFormat === 'WEBP') {
    pipeline = pipeline.webp({
      quality,
      effort,
      lossless,
      nearLossless: !lossless && quality >= 90,
    });
  } else if (targetFormat === 'AVIF') {
    pipeline = pipeline.avif({
      quality,
      effort,
      lossless,
      chromaSubsampling: lossless ? '4:4:4' : '4:2:0',
    });
  } else if (targetFormat === 'JPEG') {
    pipeline = pipeline.jpeg({
      quality,
      mozjpeg: true,
      chromaSubsampling: quality >= 90 ? '4:4:4' : '4:2:0',
    });
  } else {
    // PNG
    pipeline = pipeline.png({
      quality,
      effort,
      compressionLevel: 9,
      palette: !lossless,
    });
  }

  await pipeline.toFile(derivativePath);

  const compressedBytes = fs.statSync(derivativePath).size;
  const savingsPercentage = calculateSavingsPercentage(originalBytes, compressedBytes);

  return {
    derivativePath,
    compressedBytes,
    originalBytes,
    savingsPercentage,
    metadata: {
      target_format: targetFormat,
      quality_preset: qualityPreset,
      quality,
      effort,
      lossless,
      strip_metadata: stripMetadata,
      width,
      height,
      original_bytes: originalBytes,
      compressed_bytes: compressedBytes,
      savings_percentage: savingsPercentage,
    },
  };
}

/**
 * Service function: Creates and persists an image compression derivative.
 */
export async function createAssetCompression(
  tenantId: number,
  assetId: number,
  versionId: number,
  input: CreateCompressionInput,
): Promise<
  | { success: true; statusCode: 201; compression: AssetCompressionRecord }
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
      message: 'Activo o versión no encontrado.',
    };
  }

  const asset = assetRows[0];

  if (!isRasterImage(asset.mime_type)) {
    return {
      success: false,
      statusCode: 400,
      message: `El tipo MIME '${asset.mime_type || 'desconocido'}' no es compatible. Solo se admiten formatos raster (${ALLOWED_RASTER_MIMES.join(', ')}).`,
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
      message: 'El archivo físico del activo no se encuentra en el almacenamiento.',
    };
  }

  let meta: sharp.Metadata;
  try {
    meta = await sharp(sourcePath).metadata();
  } catch (err: any) {
    return {
      success: false,
      statusCode: 400,
      message: `No se pudieron leer las dimensiones de la imagen: ${err.message}`,
    };
  }

  const width = Number(meta.width);
  const height = Number(meta.height);

  if (width * height > MAX_INPUT_PIXELS) {
    return {
      success: false,
      statusCode: 400,
      message: `La imagen de entrada (${width}x${height} = ${width * height} px) excede el límite máximo de ${MAX_INPUT_PIXELS} píxeles (16 MPx).`,
    };
  }

  const { quality, effort, lossless, strip_metadata } = resolveCompressionParameters(input);
  const targetFormat = input.target_format;
  const qualityPreset = input.quality_preset || 'BALANCED';

  const {
    derivativePath,
    compressedBytes,
    originalBytes,
    savingsPercentage,
    metadata,
  } = await generateCompressionDerivative(
    tenantId,
    assetId,
    versionId,
    targetFormat,
    qualityPreset,
    quality,
    effort,
    lossless,
    strip_metadata,
    sourcePath,
  );

  // Check if an existing derivative exists for this asset/version/format/preset
  const existing = (await db.query(
    `SELECT id, output_derivative_path FROM dam_asset_compressions 
     WHERE tenant_id = ? AND asset_id = ? AND version_id = ? AND target_format = ? AND quality_preset = ? 
     LIMIT 1`,
    [tenantId, assetId, versionId, targetFormat, qualityPreset],
  )) as any[];

  if (existing && existing.length > 0 && existing[0].output_derivative_path) {
    const oldPath = existing[0].output_derivative_path;
    assertPathContained(oldPath);
    if (fs.existsSync(oldPath)) {
      try {
        fs.unlinkSync(oldPath);
      } catch {
        // Ignore unlink error for non-critical old derivative
      }
    }
  }

  const upsertResult = (await db.query(
    `INSERT INTO dam_asset_compressions
     (tenant_id, asset_id, version_id, target_format, quality_preset, effort, quality, strip_metadata, original_bytes, compressed_bytes, savings_percentage, output_derivative_path, compression_metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       effort = VALUES(effort),
       quality = VALUES(quality),
       strip_metadata = VALUES(strip_metadata),
       original_bytes = VALUES(original_bytes),
       compressed_bytes = VALUES(compressed_bytes),
       savings_percentage = VALUES(savings_percentage),
       output_derivative_path = VALUES(output_derivative_path),
       compression_metadata = VALUES(compression_metadata),
       updated_at = CURRENT_TIMESTAMP`,
    [
      tenantId,
      assetId,
      versionId,
      targetFormat,
      qualityPreset,
      effort,
      quality,
      strip_metadata ? 1 : 0,
      originalBytes,
      compressedBytes,
      savingsPercentage,
      derivativePath,
      JSON.stringify(metadata),
    ],
  )) as any;

  const recordId = Number(upsertResult.insertId);

  const compressionRecord: AssetCompressionRecord = {
    id: recordId,
    tenant_id: tenantId,
    asset_id: assetId,
    version_id: versionId,
    target_format: targetFormat,
    quality_preset: qualityPreset,
    effort,
    quality,
    strip_metadata,
    original_bytes: originalBytes,
    compressed_bytes: compressedBytes,
    savings_percentage: savingsPercentage,
    output_derivative_path: derivativePath,
    compression_metadata: metadata,
    created_at: new Date().toISOString(),
  };

  void dispatchWebhookEvent(tenantId, 'asset.updated', {
    asset_id: assetId,
    event_type: 'IMAGE_COMPRESSED',
    compression_id: recordId,
    target_format: targetFormat,
    quality_preset: qualityPreset,
    savings_percentage: savingsPercentage,
  });

  return {
    success: true,
    statusCode: 201,
    compression: compressionRecord,
  };
}

/**
 * Service function: Lists compression derivatives for an asset.
 */
export async function listAssetCompressions(
  tenantId: number,
  assetId: number,
  limit = 50,
  offset = 0,
  targetFormat?: TargetFormat,
  qualityPreset?: QualityPreset,
): Promise<AssetCompressionRecord[]> {
  let queryStr = `SELECT * FROM dam_asset_compressions WHERE tenant_id = ? AND asset_id = ?`;
  const params: any[] = [tenantId, assetId];

  if (targetFormat) {
    queryStr += ` AND target_format = ?`;
    params.push(targetFormat);
  }

  if (qualityPreset) {
    queryStr += ` AND quality_preset = ?`;
    params.push(qualityPreset);
  }

  queryStr += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const rows = (await db.query(queryStr, params)) as any[];

  return rows.map((row) => ({
    id: Number(row.id),
    tenant_id: Number(row.tenant_id),
    asset_id: Number(row.asset_id),
    version_id: Number(row.version_id),
    target_format: row.target_format as TargetFormat,
    quality_preset: row.quality_preset as QualityPreset,
    effort: Number(row.effort),
    quality: Number(row.quality),
    strip_metadata: Boolean(row.strip_metadata),
    original_bytes: Number(row.original_bytes),
    compressed_bytes: Number(row.compressed_bytes),
    savings_percentage: Number(row.savings_percentage),
    output_derivative_path: row.output_derivative_path,
    compression_metadata:
      typeof row.compression_metadata === 'string'
        ? JSON.parse(row.compression_metadata)
        : row.compression_metadata,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}

/**
 * Service function: Gets a specific compression derivative by ID.
 */
export async function getAssetCompressionById(
  tenantId: number,
  assetId: number,
  compressionId: number,
): Promise<AssetCompressionRecord | null> {
  const rows = (await db.query(
    `SELECT * FROM dam_asset_compressions WHERE id = ? AND tenant_id = ? AND asset_id = ? LIMIT 1`,
    [compressionId, tenantId, assetId],
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
    target_format: row.target_format as TargetFormat,
    quality_preset: row.quality_preset as QualityPreset,
    effort: Number(row.effort),
    quality: Number(row.quality),
    strip_metadata: Boolean(row.strip_metadata),
    original_bytes: Number(row.original_bytes),
    compressed_bytes: Number(row.compressed_bytes),
    savings_percentage: Number(row.savings_percentage),
    output_derivative_path: row.output_derivative_path,
    compression_metadata:
      typeof row.compression_metadata === 'string'
        ? JSON.parse(row.compression_metadata)
        : row.compression_metadata,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Service function: Deletes a compression derivative and removes its physical file from disk.
 */
export async function deleteAssetCompression(
  tenantId: number,
  assetId: number,
  compressionId: number,
): Promise<boolean> {
  const record = await getAssetCompressionById(tenantId, assetId, compressionId);
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
    `DELETE FROM dam_asset_compressions 
     WHERE id = ? AND tenant_id = ? AND asset_id = ?`,
    [compressionId, tenantId, assetId],
  );

  void dispatchWebhookEvent(tenantId, 'asset.updated', {
    asset_id: assetId,
    event_type: 'COMPRESSION_DELETED',
    compression_id: compressionId,
  });

  return true;
}
