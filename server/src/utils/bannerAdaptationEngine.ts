/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import * as db from '../db';
import { STORAGE_ROOT, assertPathContained } from './storage';
import { dispatchWebhookEvent } from './webhookDispatcher';
import {
  BannerPreset,
  BannerStrategy,
  ManualCropCoordinates,
  CreateBannerAdaptationInput,
} from '../schemas/bannerAdaptation.schema';

export const ALLOWED_RASTER_MIMES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
  'image/tiff',
];

export const MAX_INPUT_PIXELS = 16_000_000; // 16 Megapixels (OWASP A04)
export const MAX_OUTPUT_PIXELS = 16_000_000;

export interface AssetBannerAdaptationRecord {
  id: number;
  tenant_id: number;
  asset_id: number;
  version_id: number;
  preset: BannerPreset;
  strategy: BannerStrategy;
  target_width: number;
  target_height: number;
  crop_coordinates: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  output_derivative_path: string;
  adaptation_metadata: Record<string, any>;
  created_at: string;
  updated_at?: string;
}

export function isRasterImage(mimeType?: string | null): boolean {
  if (!mimeType) return false;
  return ALLOWED_RASTER_MIMES.includes(mimeType.toLowerCase());
}

export interface PresetDimensionSpec {
  ratio: number;
  targetWidth: number;
  targetHeight: number;
}

export const PRESET_DIMENSIONS: Record<Exclude<BannerPreset, 'CUSTOM'>, PresetDimensionSpec> = {
  '16:9_LANDSCAPE': { ratio: 16 / 9, targetWidth: 1920, targetHeight: 1080 },
  '1:1_SQUARE': { ratio: 1 / 1, targetWidth: 1080, targetHeight: 1080 },
  '9:16_STORY': { ratio: 9 / 16, targetWidth: 1080, targetHeight: 1920 },
  '4:5_PORTRAIT': { ratio: 4 / 5, targetWidth: 1080, targetHeight: 1350 },
  '21:9_ULTRAWIDE': { ratio: 21 / 9, targetWidth: 2560, targetHeight: 1080 },
  '4:3_STANDARD': { ratio: 4 / 3, targetWidth: 1440, targetHeight: 1080 },
};

/**
 * Computes the target dimensions for a preset or custom dimensions.
 */
export function calculatePresetDimensions(
  origWidth: number,
  origHeight: number,
  preset: BannerPreset,
  customWidth?: number,
  customHeight?: number,
): { width: number; height: number; aspectRatio: number } {
  if (preset === 'CUSTOM') {
    const width = customWidth || origWidth;
    const height = customHeight || origHeight;
    return {
      width,
      height,
      aspectRatio: Number((width / height).toFixed(4)),
    };
  }

  const spec = PRESET_DIMENSIONS[preset];
  // Fit within maximum bounds while preserving aspect ratio
  let width = spec.targetWidth;
  let height = spec.targetHeight;

  // Scale down if original image is smaller than standard banner size
  if (origWidth < width || origHeight < height) {
    if (origWidth / spec.ratio <= origHeight) {
      width = origWidth;
      height = Math.max(16, Math.round(width / spec.ratio));
    } else {
      height = origHeight;
      width = Math.max(16, Math.round(height * spec.ratio));
    }
  }

  return {
    width,
    height,
    aspectRatio: Number(spec.ratio.toFixed(4)),
  };
}

/**
 * Maps strategy to Sharp resize strategy/gravity options.
 */
export function resolveSharpPosition(strategy: BannerStrategy): number | string {
  switch (strategy) {
    case 'ENTROPY':
      return sharp.strategy.entropy;
    case 'ATTENTION':
      return sharp.strategy.attention;
    case 'NORTH':
      return sharp.gravity.north;
    case 'SOUTH':
      return sharp.gravity.south;
    case 'EAST':
      return sharp.gravity.east;
    case 'WEST':
      return sharp.gravity.west;
    case 'CENTER':
    default:
      return sharp.gravity.center;
  }
}

/**
 * Calculates theoretical crop coordinates for auto-crop strategies.
 */
export function calculateCropCoordinates(
  origWidth: number,
  origHeight: number,
  targetWidth: number,
  targetHeight: number,
  strategy: BannerStrategy,
): { left: number; top: number; width: number; height: number } {
  const targetRatio = targetWidth / targetHeight;
  const origRatio = origWidth / origHeight;

  let cropW = origWidth;
  let cropH = origHeight;

  if (origRatio > targetRatio) {
    // Image is wider than target: crop horizontally
    cropW = Math.round(origHeight * targetRatio);
  } else {
    // Image is taller than target: crop vertically
    cropH = Math.round(origWidth / targetRatio);
  }

  let left = Math.round((origWidth - cropW) / 2);
  let top = Math.round((origHeight - cropH) / 2);

  if (strategy === 'NORTH') {
    top = 0;
  } else if (strategy === 'SOUTH') {
    top = origHeight - cropH;
  } else if (strategy === 'WEST') {
    left = 0;
  } else if (strategy === 'EAST') {
    left = origWidth - cropW;
  }

  return {
    left: Math.max(0, left),
    top: Math.max(0, top),
    width: Math.min(origWidth, cropW),
    height: Math.min(origHeight, cropH),
  };
}

/**
 * Generates an adapted banner derivative using Sharp (FC 031).
 */
export async function generateBannerAdaptationDerivative(
  tenantId: number,
  assetId: number,
  versionId: number,
  preset: BannerPreset,
  strategy: BannerStrategy,
  customWidth: number | undefined,
  customHeight: number | undefined,
  manualCrop: ManualCropCoordinates | undefined,
  sourcePath: string,
): Promise<{
  derivativePath: string;
  targetWidth: number;
  targetHeight: number;
  cropCoordinates: { left: number; top: number; width: number; height: number };
  metadata: Record<string, any>;
}> {
  assertPathContained(sourcePath);

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`El archivo de origen no existe: ${sourcePath}`);
  }

  const imageMeta = await sharp(sourcePath).metadata();
  const origWidth = Number(imageMeta.width);
  const origHeight = Number(imageMeta.height);

  if (origWidth * origHeight > MAX_INPUT_PIXELS) {
    throw new Error(
      `La imagen de entrada (${origWidth}x${origHeight} = ${origWidth * origHeight} px) excede el límite máximo de ${MAX_INPUT_PIXELS} píxeles (16 MPx).`,
    );
  }

  const dims = calculatePresetDimensions(origWidth, origHeight, preset, customWidth, customHeight);
  const targetWidth = dims.width;
  const targetHeight = dims.height;

  if (targetWidth * targetHeight > MAX_OUTPUT_PIXELS) {
    throw new Error(
      `Las dimensiones de salida (${targetWidth}x${targetHeight} = ${targetWidth * targetHeight} px) exceden el límite máximo de ${MAX_OUTPUT_PIXELS} píxeles (16 MPx).`,
    );
  }

  const outputDir = path.join(STORAGE_ROOT, 'derivatives', `tenant_${tenantId}`);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const fileName = `banner_${assetId}_v${versionId}_${preset.toLowerCase()}_${strategy.toLowerCase()}_${Date.now()}.webp`;
  const derivativePath = path.join(outputDir, fileName);
  assertPathContained(derivativePath);

  let pipeline = sharp(sourcePath, { pages: 1 });
  let cropCoords: { left: number; top: number; width: number; height: number };

  if (strategy === 'MANUAL_COORDINATES') {
    if (!manualCrop) {
      throw new Error('Las coordenadas manual_crop son requeridas para la estrategia MANUAL_COORDINATES.');
    }

    if (
      manualCrop.left + manualCrop.width > origWidth ||
      manualCrop.top + manualCrop.height > origHeight
    ) {
      throw new Error(
        `Las coordenadas manual_crop (${manualCrop.left}+${manualCrop.width}x${manualCrop.top}+${manualCrop.height}) exceden los límites de la imagen original (${origWidth}x${origHeight}).`,
      );
    }

    cropCoords = manualCrop;
    pipeline = pipeline
      .extract(manualCrop)
      .resize({
        width: targetWidth,
        height: targetHeight,
        fit: 'fill',
      });
  } else {
    cropCoords = calculateCropCoordinates(origWidth, origHeight, targetWidth, targetHeight, strategy);
    const sharpPosition = resolveSharpPosition(strategy);

    pipeline = pipeline.resize({
      width: targetWidth,
      height: targetHeight,
      fit: 'cover',
      position: sharpPosition,
    });
  }

  await pipeline.webp({ quality: 90 }).toFile(derivativePath);

  const metadata = {
    preset,
    strategy,
    target_width: targetWidth,
    target_height: targetHeight,
    aspect_ratio: dims.aspectRatio,
    crop_coordinates: cropCoords,
    original_width: origWidth,
    original_height: origHeight,
  };

  return {
    derivativePath,
    targetWidth,
    targetHeight,
    cropCoordinates: cropCoords,
    metadata,
  };
}

/**
 * Service function: Creates and persists a banner adaptation derivative.
 */
export async function createAssetBannerAdaptation(
  tenantId: number,
  assetId: number,
  versionId: number,
  input: CreateBannerAdaptationInput,
): Promise<
  | { success: true; statusCode: 201; adaptation: AssetBannerAdaptationRecord }
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

  // Validate dimensions and 16MP limit
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

  const origWidth = Number(meta.width);
  const origHeight = Number(meta.height);

  if (origWidth * origHeight > MAX_INPUT_PIXELS) {
    return {
      success: false,
      statusCode: 400,
      message: `La imagen de entrada (${origWidth}x${origHeight} = ${origWidth * origHeight} px) excede el límite máximo de ${MAX_INPUT_PIXELS} píxeles (16 MPx).`,
    };
  }

  let resultDerivative: {
    derivativePath: string;
    targetWidth: number;
    targetHeight: number;
    cropCoordinates: { left: number; top: number; width: number; height: number };
    metadata: Record<string, any>;
  };

  try {
    resultDerivative = await generateBannerAdaptationDerivative(
      tenantId,
      assetId,
      versionId,
      input.preset,
      input.strategy,
      input.target_width,
      input.target_height,
      input.manual_crop,
      sourcePath,
    );
  } catch (err: any) {
    return {
      success: false,
      statusCode: 400,
      message: err.message,
    };
  }

  // Check if an existing adaptation exists for this asset/version/preset/strategy
  const existing = (await db.query(
    `SELECT id, output_derivative_path FROM dam_asset_banner_adaptations 
     WHERE tenant_id = ? AND asset_id = ? AND version_id = ? AND preset = ? AND strategy = ? 
     LIMIT 1`,
    [tenantId, assetId, versionId, input.preset, input.strategy],
  )) as any[];

  if (existing && existing.length > 0 && existing[0].output_derivative_path) {
    const oldPath = existing[0].output_derivative_path;
    assertPathContained(oldPath);
    if (fs.existsSync(oldPath)) {
      try {
        fs.unlinkSync(oldPath);
      } catch {
        // Non-critical unlink error
      }
    }
  }

  const upsertResult = (await db.query(
    `INSERT INTO dam_asset_banner_adaptations
     (tenant_id, asset_id, version_id, preset, strategy, target_width, target_height, crop_coordinates, output_derivative_path, adaptation_metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       target_width = VALUES(target_width),
       target_height = VALUES(target_height),
       crop_coordinates = VALUES(crop_coordinates),
       output_derivative_path = VALUES(output_derivative_path),
       adaptation_metadata = VALUES(adaptation_metadata),
       updated_at = CURRENT_TIMESTAMP`,
    [
      tenantId,
      assetId,
      versionId,
      input.preset,
      input.strategy,
      resultDerivative.targetWidth,
      resultDerivative.targetHeight,
      JSON.stringify(resultDerivative.cropCoordinates),
      resultDerivative.derivativePath,
      JSON.stringify(resultDerivative.metadata),
    ],
  )) as any;

  const recordId = Number(upsertResult.insertId);

  const adaptationRecord: AssetBannerAdaptationRecord = {
    id: recordId,
    tenant_id: tenantId,
    asset_id: assetId,
    version_id: versionId,
    preset: input.preset,
    strategy: input.strategy,
    target_width: resultDerivative.targetWidth,
    target_height: resultDerivative.targetHeight,
    crop_coordinates: resultDerivative.cropCoordinates,
    output_derivative_path: resultDerivative.derivativePath,
    adaptation_metadata: resultDerivative.metadata,
    created_at: new Date().toISOString(),
  };

  void dispatchWebhookEvent(tenantId, 'asset.updated', {
    asset_id: assetId,
    event_type: 'BANNER_ADAPTED',
    adaptation_id: recordId,
    preset: input.preset,
    strategy: input.strategy,
  });

  return {
    success: true,
    statusCode: 201,
    adaptation: adaptationRecord,
  };
}

/**
 * Service function: Lists banner adaptations for an asset.
 */
export async function listAssetBannerAdaptations(
  tenantId: number,
  assetId: number,
  limit = 50,
  offset = 0,
  preset?: BannerPreset,
  strategy?: BannerStrategy,
): Promise<AssetBannerAdaptationRecord[]> {
  let queryStr = `SELECT * FROM dam_asset_banner_adaptations WHERE tenant_id = ? AND asset_id = ?`;
  const params: any[] = [tenantId, assetId];

  if (preset) {
    queryStr += ` AND preset = ?`;
    params.push(preset);
  }

  if (strategy) {
    queryStr += ` AND strategy = ?`;
    params.push(strategy);
  }

  queryStr += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const rows = (await db.query(queryStr, params)) as any[];

  return rows.map((row) => ({
    id: Number(row.id),
    tenant_id: Number(row.tenant_id),
    asset_id: Number(row.asset_id),
    version_id: Number(row.version_id),
    preset: row.preset as BannerPreset,
    strategy: row.strategy as BannerStrategy,
    target_width: Number(row.target_width),
    target_height: Number(row.target_height),
    crop_coordinates:
      typeof row.crop_coordinates === 'string'
        ? JSON.parse(row.crop_coordinates)
        : row.crop_coordinates,
    output_derivative_path: row.output_derivative_path,
    adaptation_metadata:
      typeof row.adaptation_metadata === 'string'
        ? JSON.parse(row.adaptation_metadata)
        : row.adaptation_metadata,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}

/**
 * Service function: Gets a specific banner adaptation by ID.
 */
export async function getAssetBannerAdaptationById(
  tenantId: number,
  assetId: number,
  adaptationId: number,
): Promise<AssetBannerAdaptationRecord | null> {
  const rows = (await db.query(
    `SELECT * FROM dam_asset_banner_adaptations WHERE id = ? AND tenant_id = ? AND asset_id = ? LIMIT 1`,
    [adaptationId, tenantId, assetId],
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
    preset: row.preset as BannerPreset,
    strategy: row.strategy as BannerStrategy,
    target_width: Number(row.target_width),
    target_height: Number(row.target_height),
    crop_coordinates:
      typeof row.crop_coordinates === 'string'
        ? JSON.parse(row.crop_coordinates)
        : row.crop_coordinates,
    output_derivative_path: row.output_derivative_path,
    adaptation_metadata:
      typeof row.adaptation_metadata === 'string'
        ? JSON.parse(row.adaptation_metadata)
        : row.adaptation_metadata,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Service function: Deletes a banner adaptation and removes its physical file from disk.
 */
export async function deleteAssetBannerAdaptation(
  tenantId: number,
  assetId: number,
  adaptationId: number,
): Promise<boolean> {
  const record = await getAssetBannerAdaptationById(tenantId, assetId, adaptationId);
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
    `DELETE FROM dam_asset_banner_adaptations 
     WHERE id = ? AND tenant_id = ? AND asset_id = ?`,
    [adaptationId, tenantId, assetId],
  );

  void dispatchWebhookEvent(tenantId, 'asset.updated', {
    asset_id: assetId,
    event_type: 'BANNER_ADAPTATION_DELETED',
    adaptation_id: adaptationId,
  });

  return true;
}
