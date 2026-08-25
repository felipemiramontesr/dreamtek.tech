import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import * as db from '../db';
import { assertPathContained, STORAGE_ROOT } from './storage';
import { dispatchWebhookEvent } from './webhookDispatcher';
import { ImageEnhancementPreset } from '../schemas/imageEnhancement.schema';

export const ALLOWED_RASTER_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
];

export const MAX_PIXELS = 16_000_000; // 16 Megapixels

export interface EnhancementParameters {
  brightness: number;
  contrast: number;
  saturation: number;
  sharpness: number;
  gamma: number;
  tint_hex?: string;
  clahe?: boolean;
}

export const PRESET_DEFAULTS: Record<ImageEnhancementPreset, EnhancementParameters> = {
  NATURAL_RESTORE: {
    brightness: 1.05,
    contrast: 1.10,
    saturation: 1.05,
    sharpness: 1.20,
    gamma: 1.05,
    clahe: true,
  },
  VIBRANT: {
    brightness: 1.10,
    contrast: 1.20,
    saturation: 1.40,
    sharpness: 1.50,
    gamma: 1.10,
    clahe: true,
  },
  WARM: {
    brightness: 1.05,
    contrast: 1.05,
    saturation: 1.15,
    sharpness: 1.00,
    gamma: 1.00,
    tint_hex: '#FF8C00',
    clahe: false,
  },
  COOL: {
    brightness: 1.00,
    contrast: 1.10,
    saturation: 1.10,
    sharpness: 1.10,
    gamma: 1.00,
    tint_hex: '#00BFFF',
    clahe: false,
  },
  VINTAGE_COLORIZED: {
    brightness: 1.00,
    contrast: 1.15,
    saturation: 0.70,
    sharpness: 1.00,
    gamma: 1.00,
    tint_hex: '#704214',
    clahe: false,
  },
  CINEMATIC: {
    brightness: 0.95,
    contrast: 1.30,
    saturation: 1.20,
    sharpness: 1.30,
    gamma: 1.15,
    tint_hex: '#1E3F66',
    clahe: true,
  },
  HIGH_CONTRAST_BW: {
    brightness: 1.00,
    contrast: 1.50,
    saturation: 0.00,
    sharpness: 1.80,
    gamma: 1.10,
    clahe: true,
  },
  CUSTOM: {
    brightness: 1.00,
    contrast: 1.00,
    saturation: 1.00,
    sharpness: 1.00,
    gamma: 1.00,
    clahe: false,
  },
};

export interface ImageEnhancementRecord {
  id: number;
  tenant_id: number;
  asset_id: number;
  version_id: number;
  preset: ImageEnhancementPreset;
  brightness: number;
  contrast: number;
  saturation: number;
  sharpness: number;
  gamma: number;
  tint_hex?: string | null;
  output_derivative_path: string;
  enhancement_metadata: any;
  created_at?: string;
}

/**
 * Parses HEX color string into RGB values.
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  return { r, g, b };
}

/**
 * Resolves final parameters by combining preset defaults with optional overrides.
 */
export function resolveParameters(
  preset: ImageEnhancementPreset,
  overrides?: Partial<EnhancementParameters>,
): EnhancementParameters {
  const base = { ...PRESET_DEFAULTS[preset] };
  if (!overrides) return base;

  return {
    brightness: overrides.brightness !== undefined ? overrides.brightness : base.brightness,
    contrast: overrides.contrast !== undefined ? overrides.contrast : base.contrast,
    saturation: overrides.saturation !== undefined ? overrides.saturation : base.saturation,
    sharpness: overrides.sharpness !== undefined ? overrides.sharpness : base.sharpness,
    gamma: overrides.gamma !== undefined ? overrides.gamma : base.gamma,
    tint_hex: overrides.tint_hex !== undefined ? overrides.tint_hex : base.tint_hex,
    clahe: overrides.clahe !== undefined ? overrides.clahe : base.clahe,
  };
}

/**
 * Generates an enhanced WebP derivative file applying Sharp transforms.
 */
export async function generateImageEnhancementDerivative(
  tenantId: number,
  assetId: number,
  versionId: number,
  preset: ImageEnhancementPreset,
  inputPath: string,
  params: EnhancementParameters,
): Promise<string> {
  const tenantDir = path.join(STORAGE_ROOT, 'derivatives', `tenant_${tenantId}`);
  fs.mkdirSync(tenantDir, { recursive: true });

  const outputFileName = `enhance_${assetId}_v${versionId}_${preset.toLowerCase()}_${Date.now()}.webp`;
  const outputPath = path.join(tenantDir, outputFileName);
  assertPathContained(outputPath);

  let pipeline = sharp(inputPath);

  // 1. Modulate brightness and saturation
  pipeline = pipeline.modulate({
    brightness: params.brightness,
    saturation: params.saturation,
  });

  // 2. Linear Contrast adjustment
  if (params.contrast !== 1.0) {
    pipeline = pipeline.linear(params.contrast, -(128 * params.contrast) + 128);
  }

  // 3. Gamma correction
  if (params.gamma !== 1.0) {
    pipeline = pipeline.gamma(params.gamma);
  }

  // 4. Sharpness / Unsharp mask
  if (params.sharpness > 0) {
    pipeline = pipeline.sharpen({ sigma: params.sharpness });
  }

  // 5. CLAHE (Contrast-Limited Adaptive Histogram Equalization)
  if (params.clahe) {
    pipeline = pipeline.clahe({ width: 32, height: 32, maxSlope: 3 });
  }

  // 6. Thermal Tint / Tone Filter
  if (params.tint_hex) {
    const rgb = hexToRgb(params.tint_hex);
    pipeline = pipeline.tint(rgb);
  }

  await pipeline.webp({ quality: 85 }).toFile(outputPath);
  return outputPath;
}

/**
 * Creates or updates an enhanced derivative for an asset.
 */
export async function createAssetImageEnhancement(
  tenantId: number,
  assetId: number,
  versionId: number,
  preset: ImageEnhancementPreset = 'NATURAL_RESTORE',
  overrides?: Partial<EnhancementParameters>,
): Promise<
  | { success: true; enhancement: ImageEnhancementRecord }
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

  // 2. Validate raster MIME type (Condition C-025.2 - 400 for SVG and non-images)
  if (!ALLOWED_RASTER_MIMES.includes(mime_type)) {
    return {
      success: false,
      statusCode: 400,
      message:
        'El activo no es una imagen raster compatible (JPEG, PNG, WebP, GIF). SVG y otros tipos no son permitidos para realce de imagen.',
    };
  }

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

  // 4. Resolve enhancement parameters
  const finalParams = resolveParameters(preset, overrides);

  // 5. Generate derivative file
  const derivativePath = await generateImageEnhancementDerivative(
    tenantId,
    assetId,
    versionId,
    preset,
    storage_path,
    finalParams,
  );

  // 6. Check for existing enhancement to unlink old file if replacing
  const existingRows: any[] = await db.query(
    `SELECT output_derivative_path FROM dam_asset_enhancements
     WHERE tenant_id = ? AND asset_id = ? AND version_id = ? AND preset = ?`,
    [tenantId, assetId, versionId, preset],
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

  const enhancementMetadata = {
    preset,
    source_width: sourceWidth,
    source_height: sourceHeight,
    applied_parameters: finalParams,
  };

  // 7. Upsert into database
  const insertResult: any = await db.query(
    `INSERT INTO dam_asset_enhancements
     (tenant_id, asset_id, version_id, preset, brightness, contrast, saturation, sharpness, gamma, tint_hex, output_derivative_path, enhancement_metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       brightness = VALUES(brightness),
       contrast = VALUES(contrast),
       saturation = VALUES(saturation),
       sharpness = VALUES(sharpness),
       gamma = VALUES(gamma),
       tint_hex = VALUES(tint_hex),
       output_derivative_path = VALUES(output_derivative_path),
       enhancement_metadata = VALUES(enhancement_metadata),
       created_at = CURRENT_TIMESTAMP`,
    [
      tenantId,
      assetId,
      versionId,
      preset,
      finalParams.brightness,
      finalParams.contrast,
      finalParams.saturation,
      finalParams.sharpness,
      finalParams.gamma,
      finalParams.tint_hex || null,
      derivativePath,
      JSON.stringify(enhancementMetadata),
    ],
  );

  const enhancementRecord: ImageEnhancementRecord = {
    id: Number(insertResult.insertId),
    tenant_id: tenantId,
    asset_id: assetId,
    version_id: versionId,
    preset,
    brightness: finalParams.brightness,
    contrast: finalParams.contrast,
    saturation: finalParams.saturation,
    sharpness: finalParams.sharpness,
    gamma: finalParams.gamma,
    tint_hex: finalParams.tint_hex || null,
    output_derivative_path: derivativePath,
    enhancement_metadata: enhancementMetadata,
  };

  void dispatchWebhookEvent(tenantId, 'asset.updated', {
    asset_id: assetId,
    enhancement_id: enhancementRecord.id,
    preset,
    event_type: 'IMAGE_ENHANCED',
  });

  return {
    success: true,
    enhancement: enhancementRecord,
  };
}

/**
 * Lists all enhancement records for an asset.
 */
export async function listAssetImageEnhancements(
  tenantId: number,
  assetId: number,
  limit: number = 50,
  offset: number = 0,
  preset?: string,
): Promise<ImageEnhancementRecord[]> {
  let sql = `SELECT id, tenant_id, asset_id, version_id, preset,
                    brightness, contrast, saturation, sharpness, gamma, tint_hex,
                    output_derivative_path, enhancement_metadata, created_at
             FROM dam_asset_enhancements
             WHERE tenant_id = ? AND asset_id = ?`;
  const params: any[] = [tenantId, assetId];

  if (preset) {
    sql += ' AND preset = ?';
    params.push(preset);
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
    brightness: Number(r.brightness),
    contrast: Number(r.contrast),
    saturation: Number(r.saturation),
    sharpness: Number(r.sharpness),
    gamma: Number(r.gamma),
    enhancement_metadata:
      typeof r.enhancement_metadata === 'string'
        ? JSON.parse(r.enhancement_metadata)
        : r.enhancement_metadata,
  }));
}

/**
 * Gets details of a single enhancement record.
 */
export async function getAssetImageEnhancementById(
  tenantId: number,
  assetId: number,
  enhancementId: number,
): Promise<ImageEnhancementRecord | null> {
  const rows: any[] = await db.query(
    `SELECT id, tenant_id, asset_id, version_id, preset,
            brightness, contrast, saturation, sharpness, gamma, tint_hex,
            output_derivative_path, enhancement_metadata, created_at
     FROM dam_asset_enhancements
     WHERE tenant_id = ? AND asset_id = ? AND id = ?`,
    [tenantId, assetId, enhancementId],
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
    brightness: Number(r.brightness),
    contrast: Number(r.contrast),
    saturation: Number(r.saturation),
    sharpness: Number(r.sharpness),
    gamma: Number(r.gamma),
    enhancement_metadata:
      typeof r.enhancement_metadata === 'string'
        ? JSON.parse(r.enhancement_metadata)
        : r.enhancement_metadata,
  };
}

/**
 * Deletes an enhancement record and unlinks its derivative from disk.
 */
export async function deleteAssetImageEnhancement(
  tenantId: number,
  assetId: number,
  enhancementId: number,
): Promise<boolean> {
  const enhancement = await getAssetImageEnhancementById(tenantId, assetId, enhancementId);
  if (!enhancement) {
    return false;
  }

  if (enhancement.output_derivative_path) {
    assertPathContained(enhancement.output_derivative_path);
    if (fs.existsSync(enhancement.output_derivative_path)) {
      fs.unlinkSync(enhancement.output_derivative_path);
    }
  }

  await db.query(
    `DELETE FROM dam_asset_enhancements
     WHERE tenant_id = ? AND asset_id = ? AND id = ?`,
    [tenantId, assetId, enhancementId],
  );

  void dispatchWebhookEvent(tenantId, 'asset.updated', {
    asset_id: assetId,
    enhancement_id: enhancementId,
    event_type: 'IMAGE_ENHANCEMENT_DELETED',
  });

  return true;
}
