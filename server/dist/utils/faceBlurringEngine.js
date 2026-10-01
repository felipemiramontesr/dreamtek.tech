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
exports.ALLOWED_RASTER_MIME_TYPES = exports.MAX_PIXELS = void 0;
exports.isRasterImage = isRasterImage;
exports.validateBoundingBoxes = validateBoundingBoxes;
exports.generateFaceBlurringDerivative = generateFaceBlurringDerivative;
exports.createAssetFaceBlurring = createAssetFaceBlurring;
exports.listAssetFaceBlurrings = listAssetFaceBlurrings;
exports.getAssetFaceBlurringById = getAssetFaceBlurringById;
exports.deleteAssetFaceBlurring = deleteAssetFaceBlurring;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const sharp_1 = __importDefault(require("sharp"));
const db = __importStar(require("../db"));
const storage_1 = require("./storage");
const webhookDispatcher_1 = require("./webhookDispatcher");
exports.MAX_PIXELS = 16_000_000; // 16 Megapixels limit (OWASP A04)
exports.ALLOWED_RASTER_MIME_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
]);
function isRasterImage(mimeType) {
    if (!mimeType)
        return false;
    return exports.ALLOWED_RASTER_MIME_TYPES.has(mimeType.toLowerCase());
}
function validateBoundingBoxes(boxes, sourceWidth, sourceHeight) {
    if (!boxes || boxes.length === 0) {
        return {
            valid: false,
            error: 'Se requiere al menos una caja delimitadora para anonimizar.',
        };
    }
    for (let i = 0; i < boxes.length; i++) {
        const box = boxes[i];
        if (box.left < 0 || box.top < 0 || box.width <= 0 || box.height <= 0) {
            return {
                valid: false,
                error: `La caja delimitadora #${i + 1} tiene dimensiones inválidas.`,
            };
        }
        if (box.left + box.width > sourceWidth || box.top + box.height > sourceHeight) {
            return {
                valid: false,
                error: `La caja delimitadora #${i + 1} (${box.left}, ${box.top}, ${box.width}x${box.height}) excede las dimensiones de la imagen (${sourceWidth}x${sourceHeight}).`,
            };
        }
    }
    return { valid: true };
}
async function generateFaceBlurringDerivative(tenantId, assetId, versionId, strategy, blurIntensity, boundingBoxes, sourcePath) {
    const image = (0, sharp_1.default)(sourcePath);
    const metadata = await image.metadata();
    const width = Number(metadata.width);
    const height = Number(metadata.height);
    if (width * height > exports.MAX_PIXELS) {
        throw new Error(`La resolución de la imagen (${width}x${height}) excede el límite máximo permitido de 16 Megapíxeles.`);
    }
    const boundsCheck = validateBoundingBoxes(boundingBoxes, width, height);
    if (!boundsCheck.valid) {
        throw new Error(boundsCheck.error);
    }
    const derivativesDir = path_1.default.join(storage_1.STORAGE_ROOT, 'derivatives', `tenant_${tenantId}`);
    (0, storage_1.assertPathContained)(derivativesDir);
    fs_1.default.mkdirSync(derivativesDir, { recursive: true });
    const safeStrategy = strategy.toLowerCase();
    const timestamp = Date.now();
    const derivativeFileName = `anon_${assetId}_v${versionId}_${safeStrategy}_${timestamp}.webp`;
    const derivativePath = path_1.default.join(derivativesDir, derivativeFileName);
    (0, storage_1.assertPathContained)(derivativePath);
    const overlays = [];
    for (const box of boundingBoxes) {
        if (strategy === 'GAUSSIAN_BLUR') {
            const regionBuffer = await (0, sharp_1.default)(sourcePath)
                .extract({
                left: box.left,
                top: box.top,
                width: box.width,
                height: box.height,
            })
                .blur(Math.max(1, blurIntensity))
                .toBuffer();
            overlays.push({
                input: regionBuffer,
                left: box.left,
                top: box.top,
            });
        }
        else if (strategy === 'PIXELATE_MOSAIC') {
            const factor = Math.max(2, Math.min(64, blurIntensity));
            const downscaledW = Math.max(1, Math.round(box.width / factor));
            const downscaledH = Math.max(1, Math.round(box.height / factor));
            const regionBuffer = await (0, sharp_1.default)(sourcePath)
                .extract({
                left: box.left,
                top: box.top,
                width: box.width,
                height: box.height,
            })
                .resize(downscaledW, downscaledH, { kernel: sharp_1.default.kernel.nearest })
                .resize(box.width, box.height, { kernel: sharp_1.default.kernel.nearest })
                .toBuffer();
            overlays.push({
                input: regionBuffer,
                left: box.left,
                top: box.top,
            });
        }
        else {
            // BLACK_BAR_CENSOR strategy
            const regionBuffer = await (0, sharp_1.default)({
                create: {
                    width: box.width,
                    height: box.height,
                    channels: 4,
                    background: { r: 0, g: 0, b: 0, alpha: 1 },
                },
            })
                .webp()
                .toBuffer();
            overlays.push({
                input: regionBuffer,
                left: box.left,
                top: box.top,
            });
        }
    }
    await (0, sharp_1.default)(sourcePath)
        .composite(overlays)
        .webp({ quality: 90 })
        .toFile(derivativePath);
    return {
        derivativePath,
        width,
        height,
        metadata: {
            strategy,
            blur_intensity: blurIntensity,
            regions_count: boundingBoxes.length,
            processed_at: new Date().toISOString(),
        },
    };
}
async function createAssetFaceBlurring(tenantId, assetId, versionId, input) {
    const assetRows = await db.query(`SELECT a.id, a.tenant_id, a.mime_type, a.current_version_id, v.storage_path, v.file_size
     FROM assets a
     LEFT JOIN asset_versions v ON v.id = ? AND v.tenant_id = a.tenant_id
     WHERE a.id = ? AND a.tenant_id = ?`, [versionId, assetId, tenantId]);
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
            message: `El tipo MIME '${asset.mime_type}' no es compatible con anonimización y difuminado visual. Solo se admiten formatos raster (JPEG, PNG, WebP, GIF).`,
        };
    }
    let storage_path = asset.storage_path;
    if (!storage_path) {
        const fallbackVersion = await db.query(`SELECT storage_path FROM asset_versions WHERE asset_id = ? AND tenant_id = ? ORDER BY version_number DESC LIMIT 1`, [assetId, tenantId]);
        if (fallbackVersion && fallbackVersion.length > 0) {
            storage_path = fallbackVersion[0].storage_path;
        }
    }
    if (!storage_path || !fs_1.default.existsSync(storage_path)) {
        return {
            success: false,
            statusCode: 404,
            message: 'El archivo físico del activo no se encuentra en el almacenamiento.',
        };
    }
    (0, storage_1.assertPathContained)(storage_path);
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
    const boundsCheck = validateBoundingBoxes(input.bounding_boxes, sourceWidth, sourceHeight);
    if (!boundsCheck.valid) {
        return {
            success: false,
            statusCode: 400,
            message: boundsCheck.error,
        };
    }
    const { derivativePath, metadata } = await generateFaceBlurringDerivative(tenantId, assetId, versionId, input.strategy, input.blur_intensity, input.bounding_boxes, storage_path);
    const existing = await db.query(`SELECT id, output_derivative_path FROM dam_asset_face_blurrings 
     WHERE tenant_id = ? AND asset_id = ? AND version_id = ? AND strategy = ?`, [tenantId, assetId, versionId, input.strategy]);
    if (existing && existing.length > 0 && existing[0].output_derivative_path) {
        const oldPath = existing[0].output_derivative_path;
        try {
            (0, storage_1.assertPathContained)(oldPath);
            if (fs_1.default.existsSync(oldPath)) {
                fs_1.default.unlinkSync(oldPath);
            }
        }
        catch {
            // Ignore cleanup error of old file
        }
    }
    const result = await db.query(`INSERT INTO dam_asset_face_blurrings 
     (tenant_id, asset_id, version_id, strategy, blur_intensity, bounding_boxes, output_derivative_path, blurring_metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       blur_intensity = VALUES(blur_intensity),
       bounding_boxes = VALUES(bounding_boxes),
       output_derivative_path = VALUES(output_derivative_path),
       blurring_metadata = VALUES(blurring_metadata),
       created_at = CURRENT_TIMESTAMP`, [
        tenantId,
        assetId,
        versionId,
        input.strategy,
        input.blur_intensity,
        JSON.stringify(input.bounding_boxes),
        derivativePath,
        JSON.stringify(metadata),
    ]);
    const anonymizationId = Number(result.insertId);
    const record = {
        id: anonymizationId,
        tenant_id: tenantId,
        asset_id: assetId,
        version_id: versionId,
        strategy: input.strategy,
        blur_intensity: input.blur_intensity,
        bounding_boxes: input.bounding_boxes,
        output_derivative_path: derivativePath,
        blurring_metadata: metadata,
        created_at: new Date().toISOString(),
    };
    void (0, webhookDispatcher_1.dispatchWebhookEvent)(tenantId, 'asset.updated', {
        asset_id: assetId,
        event_type: 'FACE_BLURRED',
        anonymization_id: anonymizationId,
        strategy: input.strategy,
        regions_count: input.bounding_boxes.length,
    });
    return {
        success: true,
        anonymization: record,
        statusCode: 201,
    };
}
async function listAssetFaceBlurrings(tenantId, assetId, limit = 50, offset = 0, strategy) {
    let sql = `SELECT * FROM dam_asset_face_blurrings WHERE tenant_id = ? AND asset_id = ?`;
    const params = [tenantId, assetId];
    if (strategy) {
        sql += ` AND strategy = ?`;
        params.push(strategy);
    }
    sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);
    const rows = await db.query(sql, params);
    return rows.map((row) => ({
        id: Number(row.id),
        tenant_id: Number(row.tenant_id),
        asset_id: Number(row.asset_id),
        version_id: Number(row.version_id),
        strategy: row.strategy,
        blur_intensity: Number(row.blur_intensity),
        bounding_boxes: typeof row.bounding_boxes === 'string'
            ? JSON.parse(row.bounding_boxes)
            : row.bounding_boxes,
        output_derivative_path: row.output_derivative_path,
        blurring_metadata: typeof row.blurring_metadata === 'string'
            ? JSON.parse(row.blurring_metadata)
            : row.blurring_metadata,
        created_at: row.created_at,
    }));
}
async function getAssetFaceBlurringById(tenantId, assetId, anonymizationId) {
    const rows = await db.query(`SELECT * FROM dam_asset_face_blurrings 
     WHERE id = ? AND tenant_id = ? AND asset_id = ?`, [anonymizationId, tenantId, assetId]);
    if (!rows || rows.length === 0) {
        return null;
    }
    const row = rows[0];
    return {
        id: Number(row.id),
        tenant_id: Number(row.tenant_id),
        asset_id: Number(row.asset_id),
        version_id: Number(row.version_id),
        strategy: row.strategy,
        blur_intensity: Number(row.blur_intensity),
        bounding_boxes: typeof row.bounding_boxes === 'string'
            ? JSON.parse(row.bounding_boxes)
            : row.bounding_boxes,
        output_derivative_path: row.output_derivative_path,
        blurring_metadata: typeof row.blurring_metadata === 'string'
            ? JSON.parse(row.blurring_metadata)
            : row.blurring_metadata,
        created_at: row.created_at,
    };
}
async function deleteAssetFaceBlurring(tenantId, assetId, anonymizationId) {
    const record = await getAssetFaceBlurringById(tenantId, assetId, anonymizationId);
    if (!record) {
        return false;
    }
    if (record.output_derivative_path) {
        (0, storage_1.assertPathContained)(record.output_derivative_path);
        if (fs_1.default.existsSync(record.output_derivative_path)) {
            fs_1.default.unlinkSync(record.output_derivative_path);
        }
    }
    await db.query(`DELETE FROM dam_asset_face_blurrings 
     WHERE id = ? AND tenant_id = ? AND asset_id = ?`, [anonymizationId, tenantId, assetId]);
    void (0, webhookDispatcher_1.dispatchWebhookEvent)(tenantId, 'asset.updated', {
        asset_id: assetId,
        event_type: 'FACE_BLURRING_DELETED',
        anonymization_id: anonymizationId,
    });
    return true;
}
