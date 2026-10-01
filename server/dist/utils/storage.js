"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.STORAGE_ROOT = void 0;
exports.assertPathContained = assertPathContained;
exports.computeBufferSha256 = computeBufferSha256;
exports.getOrCreateDefaultWorkspace = getOrCreateDefaultWorkspace;
exports.generateWebPDerivatives = generateWebPDerivatives;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const sharp_1 = __importDefault(require("sharp"));
const db_1 = require("../db");
exports.STORAGE_ROOT = path_1.default.resolve(process.env.DAM_STORAGE_ROOT || path_1.default.join(process.cwd(), 'storage', 'dam'));
// Ensure storage root exists
fs_1.default.mkdirSync(exports.STORAGE_ROOT, { recursive: true });
/**
 * Validate that a given target path is strictly contained within STORAGE_ROOT.
 * Prevents Path Traversal attacks (OWASP A01 / A05).
 */
function assertPathContained(targetPath) {
    const resolved = path_1.default.resolve(targetPath);
    const normalizedRoot = path_1.default.resolve(exports.STORAGE_ROOT);
    const isContained = process.platform === 'win32'
        ? resolved.toLowerCase().startsWith(normalizedRoot.toLowerCase())
        : resolved.startsWith(normalizedRoot);
    if (!isContained) {
        throw new Error('Security Error: Path traversal attempt detected.');
    }
    return resolved;
}
/**
 * Calculate SHA-256 hash of a file buffer (OWASP A02).
 */
function computeBufferSha256(buffer) {
    return crypto_1.default.createHash('sha256').update(buffer).digest('hex');
}
/**
 * Auto-bootstrap default Workspace and Collection for a Tenant if none exists.
 */
async function getOrCreateDefaultWorkspace(tenantId) {
    // Check if workspace exists
    const workspaces = await (0, db_1.query)('SELECT id FROM workspaces WHERE tenant_id = ? ORDER BY id ASC LIMIT 1', [tenantId]);
    let workspaceId;
    if (workspaces && workspaces.length > 0) {
        workspaceId = workspaces[0].id;
    }
    else {
        const res = await (0, db_1.query)('INSERT INTO workspaces (tenant_id, name) VALUES (?, ?)', [
            tenantId,
            'General Workspace',
        ]);
        workspaceId = res.insertId;
    }
    // Check if collection exists
    const collections = await (0, db_1.query)('SELECT id FROM collections WHERE workspace_id = ? ORDER BY id ASC LIMIT 1', [workspaceId]);
    let collectionId;
    if (collections && collections.length > 0) {
        collectionId = collections[0].id;
    }
    else {
        const res = await (0, db_1.query)('INSERT INTO collections (workspace_id, name) VALUES (?, ?)', [
            workspaceId,
            'Todos los Archivos',
        ]);
        collectionId = res.insertId;
    }
    return { workspaceId, collectionId };
}
/**
 * Generate WebP derivatives (thumb_200w and preview_800w) using sharp.
 */
async function generateWebPDerivatives(inputBuffer, mimeType, outDir) {
    const derivatives = [];
    // Only generate image derivatives if input is an image
    if (!mimeType.startsWith('image/') || mimeType === 'image/gif') {
        return derivatives;
    }
    if (!fs_1.default.existsSync(outDir)) {
        fs_1.default.mkdirSync(outDir, { recursive: true });
    }
    try {
        // 1. Thumbnail 200w WebP
        const thumbPath = path_1.default.join(outDir, 'thumb_200w.webp');
        assertPathContained(thumbPath);
        const thumbBuffer = await (0, sharp_1.default)(inputBuffer)
            .resize({ width: 200, withoutEnlargement: true })
            .webp({ quality: 80 })
            .toBuffer();
        fs_1.default.writeFileSync(thumbPath, thumbBuffer);
        const thumbMeta = await (0, sharp_1.default)(thumbBuffer).metadata();
        derivatives.push({
            derivativeType: 'THUMBNAIL_200W',
            width: Number(thumbMeta.width),
            height: Number(thumbMeta.height),
            byteSize: thumbBuffer.length,
            filePath: thumbPath,
        });
        // 2. Preview 800w WebP
        const previewPath = path_1.default.join(outDir, 'preview_800w.webp');
        assertPathContained(previewPath);
        const previewBuffer = await (0, sharp_1.default)(inputBuffer)
            .resize({ width: 800, withoutEnlargement: true })
            .webp({ quality: 85 })
            .toBuffer();
        fs_1.default.writeFileSync(previewPath, previewBuffer);
        const previewMeta = await (0, sharp_1.default)(previewBuffer).metadata();
        derivatives.push({
            derivativeType: 'PREVIEW_800W',
            width: Number(previewMeta.width),
            height: Number(previewMeta.height),
            byteSize: previewBuffer.length,
            filePath: previewPath,
        });
    }
    catch (err) {
        console.error('Error generating image derivatives with sharp:', err);
    }
    return derivatives;
}
