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
exports.PRESET_DEFAULTS = exports.MAX_PIXELS = exports.ALLOWED_RASTER_MIMES = void 0;
exports.hexToRgb = hexToRgb;
exports.resolveParameters = resolveParameters;
exports.generateImageEnhancementDerivative = generateImageEnhancementDerivative;
exports.createAssetImageEnhancement = createAssetImageEnhancement;
exports.listAssetImageEnhancements = listAssetImageEnhancements;
exports.getAssetImageEnhancementById = getAssetImageEnhancementById;
exports.deleteAssetImageEnhancement = deleteAssetImageEnhancement;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const sharp_1 = __importDefault(require("sharp"));
const db = __importStar(require("../db"));
const storage_1 = require("./storage");
const webhookDispatcher_1 = require("./webhookDispatcher");
exports.ALLOWED_RASTER_MIMES = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
];
exports.MAX_PIXELS = 16_000_000; // 16 Megapixels
exports.PRESET_DEFAULTS = {
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
/**
 * Parses HEX color string into RGB values.
 */
function hexToRgb(hex) {
    const cleanHex = hex.replace('#', '');
    const r = parseInt(cleanHex.substring(0, 2), 16);
    const g = parseInt(cleanHex.substring(2, 4), 16);
    const b = parseInt(cleanHex.substring(4, 6), 16);
    return { r, g, b };
}
/**
 * Resolves final parameters by combining preset defaults with optional overrides.
 */
function resolveParameters(preset, overrides) {
    const base = { ...exports.PRESET_DEFAULTS[preset] };
    if (!overrides)
        return base;
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
async function generateImageEnhancementDerivative(tenantId, assetId, versionId, preset, inputPath, params) {
    const tenantDir = path_1.default.join(storage_1.STORAGE_ROOT, 'derivatives', `tenant_${tenantId}`);
    fs_1.default.mkdirSync(tenantDir, { recursive: true });
    const outputFileName = `enhance_${assetId}_v${versionId}_${preset.toLowerCase()}_${Date.now()}.webp`;
    const outputPath = path_1.default.join(tenantDir, outputFileName);
    (0, storage_1.assertPathContained)(outputPath);
    let pipeline = (0, sharp_1.default)(inputPath);
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
async function createAssetImageEnhancement(tenantId, assetId, versionId, preset = 'NATURAL_RESTORE', overrides) {
    // 1. Fetch asset version to get file path and mime type
    const versionRows = await db.query(`SELECT v.id, v.storage_path, a.mime_type
     FROM dam_asset_versions v
     JOIN dam_assets a ON a.id = v.asset_id
     WHERE v.id = ? AND v.asset_id = ? AND a.tenant_id = ?`, [versionId, assetId, tenantId]);
    if (!versionRows || versionRows.length === 0) {
        return {
            success: false,
            statusCode: 404,
            message: 'Versión del activo no encontrada.',
        };
    }
    const { storage_path, mime_type } = versionRows[0];
    // 2. Validate raster MIME type (Condition C-025.2 - 400 for SVG and non-images)
    if (!exports.ALLOWED_RASTER_MIMES.includes(mime_type)) {
        return {
            success: false,
            statusCode: 400,
            message: 'El activo no es una imagen raster compatible (JPEG, PNG, WebP, GIF). SVG y otros tipos no son permitidos para realce de imagen.',
        };
    }
    if (!fs_1.default.existsSync(storage_path)) {
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
        const metadata = await (0, sharp_1.default)(storage_path).metadata();
        sourceWidth = Number(metadata.width);
        sourceHeight = Number(metadata.height);
    }
    catch {
        return {
            success: false,
            statusCode: 400,
            message: 'No se pudieron determinar las dimensiones de la imagen.',
        };
    }
    if (sourceWidth * sourceHeight > exports.MAX_PIXELS) {
        return {
            success: false,
            statusCode: 400,
            message: `La resolución de la imagen (${sourceWidth}x${sourceHeight}) excede el límite máximo permitido de 16 Megapíxeles.`,
        };
    }
    // 4. Resolve enhancement parameters
    const finalParams = resolveParameters(preset, overrides);
    // 5. Generate derivative file
    const derivativePath = await generateImageEnhancementDerivative(tenantId, assetId, versionId, preset, storage_path, finalParams);
    // 6. Check for existing enhancement to unlink old file if replacing
    const existingRows = await db.query(`SELECT output_derivative_path FROM dam_asset_enhancements
     WHERE tenant_id = ? AND asset_id = ? AND version_id = ? AND preset = ?`, [tenantId, assetId, versionId, preset]);
    if (existingRows && existingRows.length > 0) {
        const oldPath = existingRows[0].output_derivative_path;
        if (oldPath && oldPath !== derivativePath) {
            (0, storage_1.assertPathContained)(oldPath);
            if (fs_1.default.existsSync(oldPath)) {
                fs_1.default.unlinkSync(oldPath);
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
    const insertResult = await db.query(`INSERT INTO dam_asset_enhancements
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
       created_at = CURRENT_TIMESTAMP`, [
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
    ]);
    const enhancementRecord = {
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
    void (0, webhookDispatcher_1.dispatchWebhookEvent)(tenantId, 'asset.updated', {
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
async function listAssetImageEnhancements(tenantId, assetId, limit = 50, offset = 0, preset) {
    let sql = `SELECT id, tenant_id, asset_id, version_id, preset,
                    brightness, contrast, saturation, sharpness, gamma, tint_hex,
                    output_derivative_path, enhancement_metadata, created_at
             FROM dam_asset_enhancements
             WHERE tenant_id = ? AND asset_id = ?`;
    const params = [tenantId, assetId];
    if (preset) {
        sql += ' AND preset = ?';
        params.push(preset);
    }
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));
    const rows = await db.query(sql, params);
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
        enhancement_metadata: typeof r.enhancement_metadata === 'string'
            ? JSON.parse(r.enhancement_metadata)
            : r.enhancement_metadata,
    }));
}
/**
 * Gets details of a single enhancement record.
 */
async function getAssetImageEnhancementById(tenantId, assetId, enhancementId) {
    const rows = await db.query(`SELECT id, tenant_id, asset_id, version_id, preset,
            brightness, contrast, saturation, sharpness, gamma, tint_hex,
            output_derivative_path, enhancement_metadata, created_at
     FROM dam_asset_enhancements
     WHERE tenant_id = ? AND asset_id = ? AND id = ?`, [tenantId, assetId, enhancementId]);
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
        enhancement_metadata: typeof r.enhancement_metadata === 'string'
            ? JSON.parse(r.enhancement_metadata)
            : r.enhancement_metadata,
    };
}
/**
 * Deletes an enhancement record and unlinks its derivative from disk.
 */
async function deleteAssetImageEnhancement(tenantId, assetId, enhancementId) {
    const enhancement = await getAssetImageEnhancementById(tenantId, assetId, enhancementId);
    if (!enhancement) {
        return false;
    }
    if (enhancement.output_derivative_path) {
        (0, storage_1.assertPathContained)(enhancement.output_derivative_path);
        if (fs_1.default.existsSync(enhancement.output_derivative_path)) {
            fs_1.default.unlinkSync(enhancement.output_derivative_path);
        }
    }
    await db.query(`DELETE FROM dam_asset_enhancements
     WHERE tenant_id = ? AND asset_id = ? AND id = ?`, [tenantId, assetId, enhancementId]);
    void (0, webhookDispatcher_1.dispatchWebhookEvent)(tenantId, 'asset.updated', {
        asset_id: assetId,
        enhancement_id: enhancementId,
        event_type: 'IMAGE_ENHANCEMENT_DELETED',
    });
    return true;
}
