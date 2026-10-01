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
exports.MAX_INPUT_PIXELS = exports.ALLOWED_RASTER_MIMES = void 0;
exports.isRasterImage = isRasterImage;
exports.escapeXml = escapeXml;
exports.calculateOverlayPosition = calculateOverlayPosition;
exports.generateSvgTextOverlay = generateSvgTextOverlay;
exports.generateWatermarkDerivative = generateWatermarkDerivative;
exports.createAssetWatermark = createAssetWatermark;
exports.listAssetWatermarks = listAssetWatermarks;
exports.getAssetWatermarkById = getAssetWatermarkById;
exports.deleteAssetWatermark = deleteAssetWatermark;
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
function isRasterImage(mimeType) {
    if (!mimeType)
        return false;
    return exports.ALLOWED_RASTER_MIMES.includes(mimeType.toLowerCase());
}
/**
 * Sanitizes unsafe XML characters to prevent SVG injection/XSS (OWASP A03/Bravo Condition).
 */
function escapeXml(unsafe) {
    return unsafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}
/**
 * Computes overlay position coordinates (left, top) given container and element sizes.
 */
function calculateOverlayPosition(baseWidth, baseHeight, overlayWidth, overlayHeight, position, margin = 24) {
    let left = margin;
    let top = margin;
    switch (position) {
        case 'CENTER':
            left = Math.round((baseWidth - overlayWidth) / 2);
            top = Math.round((baseHeight - overlayHeight) / 2);
            break;
        case 'TOP_LEFT':
            left = margin;
            top = margin;
            break;
        case 'TOP_RIGHT':
            left = Math.round(baseWidth - overlayWidth - margin);
            top = margin;
            break;
        case 'BOTTOM_LEFT':
            left = margin;
            top = Math.round(baseHeight - overlayHeight - margin);
            break;
        default: // BOTTOM_RIGHT & TILED_PATTERN fallback
            left = Math.round(baseWidth - overlayWidth - margin);
            top = Math.round(baseHeight - overlayHeight - margin);
            break;
    }
    return {
        left: Math.max(0, left),
        top: Math.max(0, top),
    };
}
/**
 * Generates an SVG buffer for text watermarks with custom font size, opacity, rotation and positioning.
 */
function generateSvgTextOverlay(text, imageWidth, imageHeight, opacity, rotation, position) {
    const safeText = escapeXml(text);
    const fontSize = Math.max(16, Math.round(Math.min(imageWidth, imageHeight) * 0.045));
    if (position === 'TILED_PATTERN') {
        const tileW = Math.max(200, Math.round(imageWidth / 3));
        const tileH = Math.max(150, Math.round(imageHeight / 3));
        const angle = rotation !== 0 ? rotation : -30;
        let textElements = '';
        for (let x = 0; x < imageWidth + tileW; x += tileW) {
            for (let y = 0; y < imageHeight + tileH; y += tileH) {
                textElements += `<text x="${x}" y="${y}" transform="rotate(${angle}, ${x}, ${y})" fill="white" fill-opacity="${opacity}" stroke="black" stroke-width="1" stroke-opacity="${opacity * 0.5}" font-family="sans-serif" font-size="${fontSize}" font-weight="bold" text-anchor="middle">${safeText}</text>\n`;
            }
        }
        const svgString = `<svg width="${imageWidth}" height="${imageHeight}" xmlns="http://www.w3.org/2000/svg">\n${textElements}</svg>`;
        return Buffer.from(svgString);
    }
    // Single text placement
    let x = imageWidth - 24;
    let y = imageHeight - 24;
    let textAnchor = 'end';
    switch (position) {
        case 'CENTER':
            x = Math.round(imageWidth / 2);
            y = Math.round(imageHeight / 2);
            textAnchor = 'middle';
            break;
        case 'TOP_LEFT':
            x = 24;
            y = 24 + fontSize;
            textAnchor = 'start';
            break;
        case 'TOP_RIGHT':
            x = imageWidth - 24;
            y = 24 + fontSize;
            textAnchor = 'end';
            break;
        case 'BOTTOM_LEFT':
            x = 24;
            y = imageHeight - 24;
            textAnchor = 'start';
            break;
        default: // BOTTOM_RIGHT
            x = imageWidth - 24;
            y = imageHeight - 24;
            textAnchor = 'end';
            break;
    }
    const transform = rotation !== 0 ? `transform="rotate(${rotation}, ${x}, ${y})"` : '';
    const svgString = `
    <svg width="${imageWidth}" height="${imageHeight}" xmlns="http://www.w3.org/2000/svg">
      <text x="${x}" y="${y}" ${transform} fill="white" fill-opacity="${opacity}" stroke="black" stroke-width="1.5" stroke-opacity="${opacity * 0.7}" font-family="sans-serif" font-size="${fontSize}" font-weight="bold" text-anchor="${textAnchor}">
        ${safeText}
      </text>
    </svg>
  `;
    return Buffer.from(svgString);
}
/**
 * Generates a watermarked image derivative using Sharp (FC 030).
 */
async function generateWatermarkDerivative(tenantId, assetId, versionId, watermarkType, watermarkText, watermarkAssetPath, position, opacity, rotation, sourcePath) {
    (0, storage_1.assertPathContained)(sourcePath);
    if (!fs_1.default.existsSync(sourcePath)) {
        throw new Error(`El archivo de origen no existe: ${sourcePath}`);
    }
    const imageMeta = await (0, sharp_1.default)(sourcePath).metadata();
    const width = Number(imageMeta.width);
    const height = Number(imageMeta.height);
    if (width * height > exports.MAX_INPUT_PIXELS) {
        throw new Error(`La imagen de entrada (${width}x${height} = ${width * height} px) excede el límite máximo de ${exports.MAX_INPUT_PIXELS} píxeles (16 MPx).`);
    }
    const outputDir = path_1.default.join(storage_1.STORAGE_ROOT, 'derivatives', `tenant_${tenantId}`);
    if (!fs_1.default.existsSync(outputDir)) {
        fs_1.default.mkdirSync(outputDir, { recursive: true });
    }
    const fileName = `watermark_${assetId}_v${versionId}_${watermarkType.toLowerCase()}_${position.toLowerCase()}_${Date.now()}.webp`;
    const derivativePath = path_1.default.join(outputDir, fileName);
    (0, storage_1.assertPathContained)(derivativePath);
    let pipeline = (0, sharp_1.default)(sourcePath, { pages: 1 });
    if (watermarkType === 'TEXT') {
        const textToRender = watermarkText || '© Confidential';
        const svgOverlay = generateSvgTextOverlay(textToRender, width, height, opacity, rotation, position);
        pipeline = pipeline.composite([
            {
                input: svgOverlay,
                top: 0,
                left: 0,
            },
        ]);
    }
    else {
        // IMAGE watermark
        if (!watermarkAssetPath || !fs_1.default.existsSync(watermarkAssetPath)) {
            throw new Error(`El archivo de imagen de marca de agua no existe: ${watermarkAssetPath}`);
        }
        (0, storage_1.assertPathContained)(watermarkAssetPath);
        const wmMeta = await (0, sharp_1.default)(watermarkAssetPath).metadata();
        const wmOrigW = Number(wmMeta.width);
        const wmOrigH = Number(wmMeta.height);
        if (wmOrigW * wmOrigH > exports.MAX_INPUT_PIXELS) {
            throw new Error(`La imagen de marca de agua (${wmOrigW}x${wmOrigH} px) excede el límite máximo de ${exports.MAX_INPUT_PIXELS} píxeles (16 MPx).`);
        }
        // Scale watermark to max 25% of base image dimensions
        const maxWmW = Math.max(40, Math.round(width * 0.25));
        const maxWmH = Math.max(40, Math.round(height * 0.25));
        let wmPipeline = (0, sharp_1.default)(watermarkAssetPath)
            .resize({
            width: maxWmW,
            height: maxWmH,
            fit: 'inside',
            withoutEnlargement: false,
        });
        if (rotation !== 0) {
            wmPipeline = wmPipeline.rotate(rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } });
        }
        // Apply opacity by converting to PNG with transparency
        const wmBuffer = await wmPipeline
            .ensureAlpha(opacity)
            .png()
            .toBuffer();
        const resizedWmMeta = await (0, sharp_1.default)(wmBuffer).metadata();
        const wmWidth = Number(resizedWmMeta.width);
        const wmHeight = Number(resizedWmMeta.height);
        if (position === 'TILED_PATTERN') {
            const composites = [];
            const stepX = Math.max(wmWidth + 40, Math.round(width / 3));
            const stepY = Math.max(wmHeight + 40, Math.round(height / 3));
            for (let x = 20; x < width; x += stepX) {
                for (let y = 20; y < height; y += stepY) {
                    composites.push({
                        input: wmBuffer,
                        left: x,
                        top: y,
                    });
                }
            }
            pipeline = pipeline.composite(composites);
        }
        else {
            const coords = calculateOverlayPosition(width, height, wmWidth, wmHeight, position);
            pipeline = pipeline.composite([
                {
                    input: wmBuffer,
                    left: coords.left,
                    top: coords.top,
                },
            ]);
        }
    }
    await pipeline.webp({ quality: 90 }).toFile(derivativePath);
    const metadata = {
        watermark_type: watermarkType,
        position,
        opacity,
        rotation,
        watermark_text: watermarkText || null,
        watermark_asset_path: watermarkAssetPath || null,
        width,
        height,
    };
    return {
        derivativePath,
        outputWidth: width,
        outputHeight: height,
        metadata,
    };
}
/**
 * Service function: Creates and persists a watermarked image derivative.
 */
async function createAssetWatermark(tenantId, assetId, versionId, input) {
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
    let wmAssetPath = null;
    if (input.watermark_type === 'IMAGE') {
        const wmAssetRows = (await db.query(`SELECT a.id, a.tenant_id, a.mime_type, av.storage_path
       FROM assets a
       LEFT JOIN asset_versions av ON av.id = a.current_version_id
       WHERE a.id = ? AND a.tenant_id = ?
       LIMIT 1`, [input.watermark_asset_id, tenantId]));
        if (!wmAssetRows || wmAssetRows.length === 0) {
            return {
                success: false,
                statusCode: 404,
                message: 'El activo de imagen de marca de agua no fue encontrado en este espacio de trabajo (mismo tenant requerido).',
            };
        }
        const wmAsset = wmAssetRows[0];
        if (!isRasterImage(wmAsset.mime_type)) {
            return {
                success: false,
                statusCode: 400,
                message: `El activo de marca de agua tiene un tipo MIME '${wmAsset.mime_type || 'desconocido'}' no compatible. Solo se admiten imágenes raster.`,
            };
        }
        wmAssetPath = wmAsset.storage_path;
        if (!wmAssetPath) {
            const fbWm = (await db.query(`SELECT storage_path FROM asset_versions WHERE asset_id = ? AND tenant_id = ? ORDER BY version_number DESC LIMIT 1`, [input.watermark_asset_id, tenantId]));
            if (fbWm && fbWm.length > 0) {
                wmAssetPath = fbWm[0].storage_path;
            }
        }
        if (!wmAssetPath || !fs_1.default.existsSync(wmAssetPath)) {
            return {
                success: false,
                statusCode: 404,
                message: 'El archivo físico de la imagen de marca de agua no se encuentra en el almacenamiento.',
            };
        }
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
    const width = Number(meta.width);
    const height = Number(meta.height);
    if (width * height > exports.MAX_INPUT_PIXELS) {
        return {
            success: false,
            statusCode: 400,
            message: `La imagen de entrada (${width}x${height} = ${width * height} px) excede el límite máximo de ${exports.MAX_INPUT_PIXELS} píxeles (16 MPx).`,
        };
    }
    const position = input.position;
    const opacity = input.opacity;
    const rotation = input.rotation;
    const { derivativePath, metadata } = await generateWatermarkDerivative(tenantId, assetId, versionId, input.watermark_type, input.watermark_text, wmAssetPath, position, opacity, rotation, sourcePath);
    // Check if an existing derivative exists for this asset/version/type/position
    const existing = (await db.query(`SELECT id, output_derivative_path FROM dam_asset_watermarks 
     WHERE tenant_id = ? AND asset_id = ? AND version_id = ? AND watermark_type = ? AND position = ? 
     LIMIT 1`, [tenantId, assetId, versionId, input.watermark_type, position]));
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
    const upsertResult = (await db.query(`INSERT INTO dam_asset_watermarks
     (tenant_id, asset_id, version_id, watermark_type, watermark_text, watermark_asset_id, position, opacity, rotation, output_derivative_path, watermark_metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       watermark_text = VALUES(watermark_text),
       watermark_asset_id = VALUES(watermark_asset_id),
       opacity = VALUES(opacity),
       rotation = VALUES(rotation),
       output_derivative_path = VALUES(output_derivative_path),
       watermark_metadata = VALUES(watermark_metadata),
       updated_at = CURRENT_TIMESTAMP`, [
        tenantId,
        assetId,
        versionId,
        input.watermark_type,
        input.watermark_text || null,
        input.watermark_asset_id || null,
        position,
        opacity,
        rotation,
        derivativePath,
        JSON.stringify(metadata),
    ]));
    const recordId = Number(upsertResult.insertId);
    const watermarkRecord = {
        id: recordId,
        tenant_id: tenantId,
        asset_id: assetId,
        version_id: versionId,
        watermark_type: input.watermark_type,
        watermark_text: input.watermark_text || null,
        watermark_asset_id: input.watermark_asset_id || null,
        position,
        opacity,
        rotation,
        output_derivative_path: derivativePath,
        watermark_metadata: metadata,
        created_at: new Date().toISOString(),
    };
    void (0, webhookDispatcher_1.dispatchWebhookEvent)(tenantId, 'asset.updated', {
        asset_id: assetId,
        event_type: 'IMAGE_WATERMARKED',
        watermark_id: recordId,
        watermark_type: input.watermark_type,
        position,
    });
    return {
        success: true,
        statusCode: 201,
        watermark: watermarkRecord,
    };
}
/**
 * Service function: Lists watermarked derivatives for an asset.
 */
async function listAssetWatermarks(tenantId, assetId, limit = 50, offset = 0, watermarkType, position) {
    let queryStr = `SELECT * FROM dam_asset_watermarks WHERE tenant_id = ? AND asset_id = ?`;
    const params = [tenantId, assetId];
    if (watermarkType) {
        queryStr += ` AND watermark_type = ?`;
        params.push(watermarkType);
    }
    if (position) {
        queryStr += ` AND position = ?`;
        params.push(position);
    }
    queryStr += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);
    const rows = (await db.query(queryStr, params));
    return rows.map((row) => ({
        id: Number(row.id),
        tenant_id: Number(row.tenant_id),
        asset_id: Number(row.asset_id),
        version_id: Number(row.version_id),
        watermark_type: row.watermark_type,
        watermark_text: row.watermark_text,
        watermark_asset_id: row.watermark_asset_id ? Number(row.watermark_asset_id) : null,
        position: row.position,
        opacity: Number(row.opacity),
        rotation: Number(row.rotation),
        output_derivative_path: row.output_derivative_path,
        watermark_metadata: typeof row.watermark_metadata === 'string'
            ? JSON.parse(row.watermark_metadata)
            : row.watermark_metadata,
        created_at: row.created_at,
        updated_at: row.updated_at,
    }));
}
/**
 * Service function: Gets a specific watermarked derivative by ID.
 */
async function getAssetWatermarkById(tenantId, assetId, watermarkId) {
    const rows = (await db.query(`SELECT * FROM dam_asset_watermarks WHERE id = ? AND tenant_id = ? AND asset_id = ? LIMIT 1`, [watermarkId, tenantId, assetId]));
    if (!rows || rows.length === 0) {
        return null;
    }
    const row = rows[0];
    return {
        id: Number(row.id),
        tenant_id: Number(row.tenant_id),
        asset_id: Number(row.asset_id),
        version_id: Number(row.version_id),
        watermark_type: row.watermark_type,
        watermark_text: row.watermark_text,
        watermark_asset_id: row.watermark_asset_id ? Number(row.watermark_asset_id) : null,
        position: row.position,
        opacity: Number(row.opacity),
        rotation: Number(row.rotation),
        output_derivative_path: row.output_derivative_path,
        watermark_metadata: typeof row.watermark_metadata === 'string'
            ? JSON.parse(row.watermark_metadata)
            : row.watermark_metadata,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}
/**
 * Service function: Deletes a watermarked derivative and removes its physical file from disk.
 */
async function deleteAssetWatermark(tenantId, assetId, watermarkId) {
    const record = await getAssetWatermarkById(tenantId, assetId, watermarkId);
    if (!record) {
        return false;
    }
    if (record.output_derivative_path) {
        (0, storage_1.assertPathContained)(record.output_derivative_path);
        if (fs_1.default.existsSync(record.output_derivative_path)) {
            fs_1.default.unlinkSync(record.output_derivative_path);
        }
    }
    await db.query(`DELETE FROM dam_asset_watermarks 
     WHERE id = ? AND tenant_id = ? AND asset_id = ?`, [watermarkId, tenantId, assetId]);
    void (0, webhookDispatcher_1.dispatchWebhookEvent)(tenantId, 'asset.updated', {
        asset_id: assetId,
        event_type: 'WATERMARK_DELETED',
        watermark_id: watermarkId,
    });
    return true;
}
