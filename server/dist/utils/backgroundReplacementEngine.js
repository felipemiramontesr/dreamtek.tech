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
exports.generateBackgroundReplacementDerivative = generateBackgroundReplacementDerivative;
exports.createAssetBackgroundReplacement = createAssetBackgroundReplacement;
exports.listAssetBackgroundReplacements = listAssetBackgroundReplacements;
exports.getAssetBackgroundReplacementById = getAssetBackgroundReplacementById;
exports.deleteAssetBackgroundReplacement = deleteAssetBackgroundReplacement;
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
    STUDIO_WHITE: {
        mode: 'STUDIO_PRESET',
        background_color_hex: '#FFFFFF',
        threshold: 0.15,
    },
    STUDIO_DARK: {
        mode: 'STUDIO_PRESET',
        background_color_hex: '#1E1E1E',
        threshold: 0.15,
    },
    TRANSPARENT_ALPHA: {
        mode: 'TRANSPARENT',
        background_color_hex: null,
        threshold: 0.15,
    },
    WARM_GRADIENT: {
        mode: 'GRADIENT',
        background_color_hex: '#FF7E5F',
        threshold: 0.15,
    },
    NEON_CYBERPUNK: {
        mode: 'GRADIENT',
        background_color_hex: '#00F2FE',
        threshold: 0.15,
    },
    OFFICE_BLUR: {
        mode: 'STUDIO_PRESET',
        background_color_hex: null,
        threshold: 0.15,
    },
    OUTDOOR_NATURE: {
        mode: 'STUDIO_PRESET',
        background_color_hex: '#2E7D32',
        threshold: 0.15,
    },
    CUSTOM: {
        mode: 'SOLID_COLOR',
        background_color_hex: '#FFFFFF',
        threshold: 0.15,
    },
};
function hexToRgb(hex) {
    const sanitized = hex.replace(/^#/, '');
    const r = parseInt(sanitized.substring(0, 2), 16);
    const g = parseInt(sanitized.substring(2, 4), 16);
    const b = parseInt(sanitized.substring(4, 6), 16);
    return {
        r: isNaN(r) ? 255 : r,
        g: isNaN(g) ? 255 : g,
        b: isNaN(b) ? 255 : b,
    };
}
function resolveParameters(modeInput, presetInput, customParams) {
    const preset = presetInput || 'STUDIO_WHITE';
    const defaultValues = exports.PRESET_DEFAULTS[preset] || exports.PRESET_DEFAULTS.STUDIO_WHITE;
    const mode = modeInput || defaultValues.mode;
    let background_color_hex = customParams?.background_color_hex !== undefined
        ? customParams.background_color_hex
        : defaultValues.background_color_hex;
    if (mode === 'TRANSPARENT' || preset === 'TRANSPARENT_ALPHA') {
        background_color_hex = null;
    }
    else if (!background_color_hex && mode === 'SOLID_COLOR') {
        background_color_hex = '#FFFFFF';
    }
    const threshold = customParams?.threshold !== undefined
        ? Math.max(0.01, Math.min(0.9, customParams.threshold))
        : defaultValues.threshold;
    const inpaint_box = customParams?.inpaint_box || null;
    return {
        mode,
        preset,
        background_color_hex,
        threshold,
        inpaint_box,
    };
}
async function generateBackgroundReplacementDerivative(tenantId, assetId, versionId, params, sourcePath) {
    const image = (0, sharp_1.default)(sourcePath);
    const metadata = await image.metadata();
    const width = Number(metadata.width);
    const height = Number(metadata.height);
    if (width * height > exports.MAX_PIXELS) {
        throw new Error(`La resolución de la imagen (${width}x${height}) excede el límite máximo permitido de 16 Megapíxeles.`);
    }
    const derivativesDir = path_1.default.join(storage_1.STORAGE_ROOT, 'derivatives', `tenant_${tenantId}`);
    (0, storage_1.assertPathContained)(derivativesDir);
    fs_1.default.mkdirSync(derivativesDir, { recursive: true });
    const filename = `bg_${assetId}_${versionId}_${params.mode}_${params.preset}_${Date.now()}.webp`;
    const derivativePath = path_1.default.join(derivativesDir, filename);
    (0, storage_1.assertPathContained)(derivativePath);
    // 1. MASK_INPAINT mode with inpaint_box
    if (params.mode === 'MASK_INPAINT' && params.inpaint_box) {
        const { left, top, width: boxWidth, height: boxHeight } = params.inpaint_box;
        if (left + boxWidth > width || top + boxHeight > height) {
            throw new Error(`Coordenadas de inpaint_box exceden las dimensiones de la imagen (${width}x${height}).`);
        }
        const patch = await (0, sharp_1.default)(sourcePath)
            .extract({ left, top, width: boxWidth, height: boxHeight })
            .blur(15)
            .toBuffer();
        await (0, sharp_1.default)(sourcePath)
            .composite([{ input: patch, left, top }])
            .webp({ quality: 90 })
            .toFile(derivativePath);
        return {
            derivativePath,
            width,
            height,
            metadata: {
                mode: params.mode,
                preset: params.preset,
                threshold: params.threshold,
                inpaint_box: params.inpaint_box,
                source_width: width,
                source_height: height,
                format: 'webp',
            },
        };
    }
    // 2. TRANSPARENT mode
    if (params.mode === 'TRANSPARENT' || params.preset === 'TRANSPARENT_ALPHA') {
        await (0, sharp_1.default)(sourcePath)
            .ensureAlpha()
            .webp({ quality: 90, alphaQuality: 90 })
            .toFile(derivativePath);
        return {
            derivativePath,
            width,
            height,
            metadata: {
                mode: params.mode,
                preset: params.preset,
                threshold: params.threshold,
                background_color_hex: null,
                source_width: width,
                source_height: height,
                format: 'webp',
            },
        };
    }
    // 3. OFFICE_BLUR preset
    if (params.preset === 'OFFICE_BLUR') {
        const blurredBg = await (0, sharp_1.default)(sourcePath).blur(20).toBuffer();
        await (0, sharp_1.default)(blurredBg)
            .composite([{ input: sourcePath, blend: 'over' }])
            .webp({ quality: 90 })
            .toFile(derivativePath);
        return {
            derivativePath,
            width,
            height,
            metadata: {
                mode: params.mode,
                preset: params.preset,
                threshold: params.threshold,
                background_color_hex: null,
                source_width: width,
                source_height: height,
                format: 'webp',
            },
        };
    }
    // 4. SOLID_COLOR, STUDIO_PRESET, GRADIENT, CUSTOM
    const color = hexToRgb(params.background_color_hex || '#FFFFFF');
    const bgLayer = await (0, sharp_1.default)({
        create: {
            width,
            height,
            channels: 4,
            background: { r: color.r, g: color.g, b: color.b, alpha: 1 },
        },
    })
        .png()
        .toBuffer();
    await (0, sharp_1.default)(bgLayer)
        .composite([{ input: sourcePath, blend: 'over' }])
        .webp({ quality: 90 })
        .toFile(derivativePath);
    return {
        derivativePath,
        width,
        height,
        metadata: {
            mode: params.mode,
            preset: params.preset,
            background_color_hex: params.background_color_hex || '#FFFFFF',
            threshold: params.threshold,
            source_width: width,
            source_height: height,
            format: 'webp',
        },
    };
}
async function createAssetBackgroundReplacement(tenantId, assetId, versionId, mode, preset, customParams) {
    const versionRows = await db.query(`SELECT id, storage_path, mime_type FROM asset_versions 
     WHERE id = ? AND asset_id = ? AND tenant_id = ? LIMIT 1`, [versionId, assetId, tenantId]);
    if (!versionRows || versionRows.length === 0) {
        return {
            success: false,
            statusCode: 404,
            message: 'Versión del activo no encontrada.',
        };
    }
    const { storage_path, mime_type } = versionRows[0];
    if (!exports.ALLOWED_RASTER_MIMES.includes(mime_type)) {
        return {
            success: false,
            statusCode: 400,
            message: `El archivo con tipo MIME '${mime_type}' no es una imagen raster compatible (JPEG, PNG, WebP, GIF).`,
        };
    }
    if (!fs_1.default.existsSync(storage_path)) {
        return {
            success: false,
            statusCode: 404,
            message: 'El archivo de la imagen no existe en almacenamiento local.',
        };
    }
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
    const resolved = resolveParameters(mode, preset, customParams);
    let derivativeResult;
    try {
        derivativeResult = await generateBackgroundReplacementDerivative(tenantId, assetId, versionId, resolved, storage_path);
    }
    catch (err) {
        return {
            success: false,
            statusCode: 400,
            message: err.message,
        };
    }
    const { derivativePath, metadata } = derivativeResult;
    // Check for existing derivative to unlink
    const existingRows = await db.query(`SELECT id, output_derivative_path FROM dam_asset_background_replacements 
     WHERE tenant_id = ? AND asset_id = ? AND version_id = ? AND mode = ? AND preset = ? LIMIT 1`, [tenantId, assetId, versionId, resolved.mode, resolved.preset]);
    if (existingRows && existingRows.length > 0) {
        const oldPath = existingRows[0].output_derivative_path;
        if (oldPath && oldPath !== derivativePath) {
            (0, storage_1.assertPathContained)(oldPath);
            if (fs_1.default.existsSync(oldPath)) {
                fs_1.default.unlinkSync(oldPath);
            }
        }
    }
    const metadataJson = JSON.stringify(metadata);
    const inpaintBoxJson = resolved.inpaint_box
        ? JSON.stringify(resolved.inpaint_box)
        : null;
    const insertResult = await db.query(`INSERT INTO dam_asset_background_replacements
     (tenant_id, asset_id, version_id, mode, preset, background_color_hex, threshold, inpaint_box, output_derivative_path, replacement_metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
     background_color_hex = VALUES(background_color_hex),
     threshold = VALUES(threshold),
     inpaint_box = VALUES(inpaint_box),
     output_derivative_path = VALUES(output_derivative_path),
     replacement_metadata = VALUES(replacement_metadata),
     created_at = CURRENT_TIMESTAMP`, [
        tenantId,
        assetId,
        versionId,
        resolved.mode,
        resolved.preset,
        resolved.background_color_hex || null,
        resolved.threshold,
        inpaintBoxJson,
        derivativePath,
        metadataJson,
    ]);
    const replacementId = Number(insertResult.insertId);
    const replacementRecord = {
        id: replacementId,
        tenant_id: tenantId,
        asset_id: assetId,
        version_id: versionId,
        mode: resolved.mode,
        preset: resolved.preset,
        background_color_hex: resolved.background_color_hex || null,
        threshold: resolved.threshold,
        inpaint_box: resolved.inpaint_box || null,
        output_derivative_path: derivativePath,
        replacement_metadata: metadata,
        created_at: new Date().toISOString(),
    };
    void (0, webhookDispatcher_1.dispatchWebhookEvent)(tenantId, 'asset.updated', {
        asset_id: assetId,
        version_id: versionId,
        event_type: 'BACKGROUND_REPLACED',
        background_replacement_id: replacementId,
        mode: resolved.mode,
        preset: resolved.preset,
    });
    return {
        success: true,
        replacement: replacementRecord,
    };
}
async function listAssetBackgroundReplacements(tenantId, assetId, limit = 50, offset = 0, mode, preset) {
    let query = `SELECT * FROM dam_asset_background_replacements 
               WHERE tenant_id = ? AND asset_id = ?`;
    const params = [tenantId, assetId];
    if (mode) {
        query += ` AND mode = ?`;
        params.push(mode);
    }
    if (preset) {
        query += ` AND preset = ?`;
        params.push(preset);
    }
    query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);
    const rows = (await db.query(query, params));
    return rows.map((row) => ({
        id: Number(row.id),
        tenant_id: Number(row.tenant_id),
        asset_id: Number(row.asset_id),
        version_id: Number(row.version_id),
        mode: row.mode,
        preset: row.preset,
        background_color_hex: row.background_color_hex || null,
        threshold: parseFloat(row.threshold),
        inpaint_box: typeof row.inpaint_box === 'string'
            ? JSON.parse(row.inpaint_box)
            : row.inpaint_box,
        output_derivative_path: row.output_derivative_path,
        replacement_metadata: typeof row.replacement_metadata === 'string'
            ? JSON.parse(row.replacement_metadata)
            : row.replacement_metadata,
        created_at: row.created_at,
    }));
}
async function getAssetBackgroundReplacementById(tenantId, assetId, replacementId) {
    const rows = (await db.query(`SELECT * FROM dam_asset_background_replacements 
     WHERE id = ? AND tenant_id = ? AND asset_id = ? LIMIT 1`, [replacementId, tenantId, assetId]));
    if (!rows || rows.length === 0) {
        return null;
    }
    const row = rows[0];
    return {
        id: Number(row.id),
        tenant_id: Number(row.tenant_id),
        asset_id: Number(row.asset_id),
        version_id: Number(row.version_id),
        mode: row.mode,
        preset: row.preset,
        background_color_hex: row.background_color_hex || null,
        threshold: parseFloat(row.threshold),
        inpaint_box: typeof row.inpaint_box === 'string'
            ? JSON.parse(row.inpaint_box)
            : row.inpaint_box,
        output_derivative_path: row.output_derivative_path,
        replacement_metadata: typeof row.replacement_metadata === 'string'
            ? JSON.parse(row.replacement_metadata)
            : row.replacement_metadata,
        created_at: row.created_at,
    };
}
async function deleteAssetBackgroundReplacement(tenantId, assetId, replacementId) {
    const replacement = await getAssetBackgroundReplacementById(tenantId, assetId, replacementId);
    if (!replacement) {
        return false;
    }
    if (replacement.output_derivative_path) {
        (0, storage_1.assertPathContained)(replacement.output_derivative_path);
        if (fs_1.default.existsSync(replacement.output_derivative_path)) {
            fs_1.default.unlinkSync(replacement.output_derivative_path);
        }
    }
    await db.query(`DELETE FROM dam_asset_background_replacements 
     WHERE id = ? AND tenant_id = ? AND asset_id = ?`, [replacementId, tenantId, assetId]);
    void (0, webhookDispatcher_1.dispatchWebhookEvent)(tenantId, 'asset.updated', {
        asset_id: assetId,
        event_type: 'BACKGROUND_REPLACEMENT_DELETED',
        background_replacement_id: replacementId,
    });
    return true;
}
