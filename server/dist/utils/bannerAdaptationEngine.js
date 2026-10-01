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
exports.PRESET_DIMENSIONS = exports.MAX_OUTPUT_PIXELS = exports.MAX_INPUT_PIXELS = exports.ALLOWED_RASTER_MIMES = void 0;
exports.isRasterImage = isRasterImage;
exports.calculatePresetDimensions = calculatePresetDimensions;
exports.resolveSharpPosition = resolveSharpPosition;
exports.calculateCropCoordinates = calculateCropCoordinates;
exports.generateBannerAdaptationDerivative = generateBannerAdaptationDerivative;
exports.createAssetBannerAdaptation = createAssetBannerAdaptation;
exports.listAssetBannerAdaptations = listAssetBannerAdaptations;
exports.getAssetBannerAdaptationById = getAssetBannerAdaptationById;
exports.deleteAssetBannerAdaptation = deleteAssetBannerAdaptation;
/* eslint-disable @typescript-eslint/no-explicit-any */
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const sharp_1 = __importDefault(require("sharp"));
const db = __importStar(require("../db"));
const storage_1 = require("./storage");
const webhookDispatcher_1 = require("./webhookDispatcher");
exports.ALLOWED_RASTER_MIMES = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/avif',
    'image/gif',
    'image/tiff',
];
exports.MAX_INPUT_PIXELS = 16_000_000; // 16 Megapixels (OWASP A04)
exports.MAX_OUTPUT_PIXELS = 16_000_000;
function isRasterImage(mimeType) {
    if (!mimeType)
        return false;
    return exports.ALLOWED_RASTER_MIMES.includes(mimeType.toLowerCase());
}
exports.PRESET_DIMENSIONS = {
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
function calculatePresetDimensions(origWidth, origHeight, preset, customWidth, customHeight) {
    if (preset === 'CUSTOM') {
        const width = customWidth || origWidth;
        const height = customHeight || origHeight;
        return {
            width,
            height,
            aspectRatio: Number((width / height).toFixed(4)),
        };
    }
    const spec = exports.PRESET_DIMENSIONS[preset];
    // Fit within maximum bounds while preserving aspect ratio
    let width = spec.targetWidth;
    let height = spec.targetHeight;
    // Scale down if original image is smaller than standard banner size
    if (origWidth < width || origHeight < height) {
        if (origWidth / spec.ratio <= origHeight) {
            width = origWidth;
            height = Math.max(16, Math.round(width / spec.ratio));
        }
        else {
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
function resolveSharpPosition(strategy) {
    switch (strategy) {
        case 'ENTROPY':
            return sharp_1.default.strategy.entropy;
        case 'ATTENTION':
            return sharp_1.default.strategy.attention;
        case 'NORTH':
            return sharp_1.default.gravity.north;
        case 'SOUTH':
            return sharp_1.default.gravity.south;
        case 'EAST':
            return sharp_1.default.gravity.east;
        case 'WEST':
            return sharp_1.default.gravity.west;
        case 'CENTER':
        default:
            return sharp_1.default.gravity.center;
    }
}
/**
 * Calculates theoretical crop coordinates for auto-crop strategies.
 */
function calculateCropCoordinates(origWidth, origHeight, targetWidth, targetHeight, strategy) {
    const targetRatio = targetWidth / targetHeight;
    const origRatio = origWidth / origHeight;
    let cropW = origWidth;
    let cropH = origHeight;
    if (origRatio > targetRatio) {
        // Image is wider than target: crop horizontally
        cropW = Math.round(origHeight * targetRatio);
    }
    else {
        // Image is taller than target: crop vertically
        cropH = Math.round(origWidth / targetRatio);
    }
    let left = Math.round((origWidth - cropW) / 2);
    let top = Math.round((origHeight - cropH) / 2);
    if (strategy === 'NORTH') {
        top = 0;
    }
    else if (strategy === 'SOUTH') {
        top = origHeight - cropH;
    }
    else if (strategy === 'WEST') {
        left = 0;
    }
    else if (strategy === 'EAST') {
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
async function generateBannerAdaptationDerivative(tenantId, assetId, versionId, preset, strategy, customWidth, customHeight, manualCrop, sourcePath) {
    (0, storage_1.assertPathContained)(sourcePath);
    if (!fs_1.default.existsSync(sourcePath)) {
        throw new Error(`El archivo de origen no existe: ${sourcePath}`);
    }
    const imageMeta = await (0, sharp_1.default)(sourcePath).metadata();
    const origWidth = Number(imageMeta.width);
    const origHeight = Number(imageMeta.height);
    if (origWidth * origHeight > exports.MAX_INPUT_PIXELS) {
        throw new Error(`La imagen de entrada (${origWidth}x${origHeight} = ${origWidth * origHeight} px) excede el límite máximo de ${exports.MAX_INPUT_PIXELS} píxeles (16 MPx).`);
    }
    const dims = calculatePresetDimensions(origWidth, origHeight, preset, customWidth, customHeight);
    const targetWidth = dims.width;
    const targetHeight = dims.height;
    if (targetWidth * targetHeight > exports.MAX_OUTPUT_PIXELS) {
        throw new Error(`Las dimensiones de salida (${targetWidth}x${targetHeight} = ${targetWidth * targetHeight} px) exceden el límite máximo de ${exports.MAX_OUTPUT_PIXELS} píxeles (16 MPx).`);
    }
    const outputDir = path_1.default.join(storage_1.STORAGE_ROOT, 'derivatives', `tenant_${tenantId}`);
    if (!fs_1.default.existsSync(outputDir)) {
        fs_1.default.mkdirSync(outputDir, { recursive: true });
    }
    const fileName = `banner_${assetId}_v${versionId}_${preset.toLowerCase()}_${strategy.toLowerCase()}_${Date.now()}.webp`;
    const derivativePath = path_1.default.join(outputDir, fileName);
    (0, storage_1.assertPathContained)(derivativePath);
    let pipeline = (0, sharp_1.default)(sourcePath, { pages: 1 });
    let cropCoords;
    if (strategy === 'MANUAL_COORDINATES') {
        if (!manualCrop) {
            throw new Error('Las coordenadas manual_crop son requeridas para la estrategia MANUAL_COORDINATES.');
        }
        if (manualCrop.left + manualCrop.width > origWidth ||
            manualCrop.top + manualCrop.height > origHeight) {
            throw new Error(`Las coordenadas manual_crop (${manualCrop.left}+${manualCrop.width}x${manualCrop.top}+${manualCrop.height}) exceden los límites de la imagen original (${origWidth}x${origHeight}).`);
        }
        cropCoords = manualCrop;
        pipeline = pipeline
            .extract(manualCrop)
            .resize({
            width: targetWidth,
            height: targetHeight,
            fit: 'fill',
        });
    }
    else {
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
async function createAssetBannerAdaptation(tenantId, assetId, versionId, input) {
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
    if (!isRasterImage(asset.mime_type)) {
        return {
            success: false,
            statusCode: 400,
            message: `El tipo MIME '${asset.mime_type || 'desconocido'}' no es compatible. Solo se admiten formatos raster (${exports.ALLOWED_RASTER_MIMES.join(', ')}).`,
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
            message: 'El archivo físico del activo no se encuentra en el almacenamiento.',
        };
    }
    // Validate dimensions and 16MP limit
    let meta;
    try {
        meta = await (0, sharp_1.default)(sourcePath).metadata();
    }
    catch (err) {
        return {
            success: false,
            statusCode: 400,
            message: `No se pudieron leer las dimensiones de la imagen: ${err.message}`,
        };
    }
    const origWidth = Number(meta.width);
    const origHeight = Number(meta.height);
    if (origWidth * origHeight > exports.MAX_INPUT_PIXELS) {
        return {
            success: false,
            statusCode: 400,
            message: `La imagen de entrada (${origWidth}x${origHeight} = ${origWidth * origHeight} px) excede el límite máximo de ${exports.MAX_INPUT_PIXELS} píxeles (16 MPx).`,
        };
    }
    let resultDerivative;
    try {
        resultDerivative = await generateBannerAdaptationDerivative(tenantId, assetId, versionId, input.preset, input.strategy, input.target_width, input.target_height, input.manual_crop, sourcePath);
    }
    catch (err) {
        return {
            success: false,
            statusCode: 400,
            message: err.message,
        };
    }
    // Check if an existing adaptation exists for this asset/version/preset/strategy
    const existing = (await db.query(`SELECT id, output_derivative_path FROM dam_asset_banner_adaptations 
     WHERE tenant_id = ? AND asset_id = ? AND version_id = ? AND preset = ? AND strategy = ? 
     LIMIT 1`, [tenantId, assetId, versionId, input.preset, input.strategy]));
    if (existing && existing.length > 0 && existing[0].output_derivative_path) {
        const oldPath = existing[0].output_derivative_path;
        (0, storage_1.assertPathContained)(oldPath);
        if (fs_1.default.existsSync(oldPath)) {
            try {
                fs_1.default.unlinkSync(oldPath);
            }
            catch {
                // Non-critical unlink error
            }
        }
    }
    const upsertResult = (await db.query(`INSERT INTO dam_asset_banner_adaptations
     (tenant_id, asset_id, version_id, preset, strategy, target_width, target_height, crop_coordinates, output_derivative_path, adaptation_metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       target_width = VALUES(target_width),
       target_height = VALUES(target_height),
       crop_coordinates = VALUES(crop_coordinates),
       output_derivative_path = VALUES(output_derivative_path),
       adaptation_metadata = VALUES(adaptation_metadata),
       updated_at = CURRENT_TIMESTAMP`, [
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
    ]));
    const recordId = Number(upsertResult.insertId);
    const adaptationRecord = {
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
    void (0, webhookDispatcher_1.dispatchWebhookEvent)(tenantId, 'asset.updated', {
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
async function listAssetBannerAdaptations(tenantId, assetId, limit = 50, offset = 0, preset, strategy) {
    let queryStr = `SELECT * FROM dam_asset_banner_adaptations WHERE tenant_id = ? AND asset_id = ?`;
    const params = [tenantId, assetId];
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
    const rows = (await db.query(queryStr, params));
    return rows.map((row) => ({
        id: Number(row.id),
        tenant_id: Number(row.tenant_id),
        asset_id: Number(row.asset_id),
        version_id: Number(row.version_id),
        preset: row.preset,
        strategy: row.strategy,
        target_width: Number(row.target_width),
        target_height: Number(row.target_height),
        crop_coordinates: typeof row.crop_coordinates === 'string'
            ? JSON.parse(row.crop_coordinates)
            : row.crop_coordinates,
        output_derivative_path: row.output_derivative_path,
        adaptation_metadata: typeof row.adaptation_metadata === 'string'
            ? JSON.parse(row.adaptation_metadata)
            : row.adaptation_metadata,
        created_at: row.created_at,
        updated_at: row.updated_at,
    }));
}
/**
 * Service function: Gets a specific banner adaptation by ID.
 */
async function getAssetBannerAdaptationById(tenantId, assetId, adaptationId) {
    const rows = (await db.query(`SELECT * FROM dam_asset_banner_adaptations WHERE id = ? AND tenant_id = ? AND asset_id = ? LIMIT 1`, [adaptationId, tenantId, assetId]));
    if (!rows || rows.length === 0) {
        return null;
    }
    const row = rows[0];
    return {
        id: Number(row.id),
        tenant_id: Number(row.tenant_id),
        asset_id: Number(row.asset_id),
        version_id: Number(row.version_id),
        preset: row.preset,
        strategy: row.strategy,
        target_width: Number(row.target_width),
        target_height: Number(row.target_height),
        crop_coordinates: typeof row.crop_coordinates === 'string'
            ? JSON.parse(row.crop_coordinates)
            : row.crop_coordinates,
        output_derivative_path: row.output_derivative_path,
        adaptation_metadata: typeof row.adaptation_metadata === 'string'
            ? JSON.parse(row.adaptation_metadata)
            : row.adaptation_metadata,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}
/**
 * Service function: Deletes a banner adaptation and removes its physical file from disk.
 */
async function deleteAssetBannerAdaptation(tenantId, assetId, adaptationId) {
    const record = await getAssetBannerAdaptationById(tenantId, assetId, adaptationId);
    if (!record) {
        return false;
    }
    if (record.output_derivative_path) {
        (0, storage_1.assertPathContained)(record.output_derivative_path);
        if (fs_1.default.existsSync(record.output_derivative_path)) {
            fs_1.default.unlinkSync(record.output_derivative_path);
        }
    }
    await db.query(`DELETE FROM dam_asset_banner_adaptations 
     WHERE id = ? AND tenant_id = ? AND asset_id = ?`, [adaptationId, tenantId, assetId]);
    void (0, webhookDispatcher_1.dispatchWebhookEvent)(tenantId, 'asset.updated', {
        asset_id: assetId,
        event_type: 'BANNER_ADAPTATION_DELETED',
        adaptation_id: adaptationId,
    });
    return true;
}
