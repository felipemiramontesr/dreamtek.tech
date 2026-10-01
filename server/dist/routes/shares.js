"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sharesRouter = void 0;
exports.hashShareToken = hashShareToken;
exports.resolveValidShare = resolveValidShare;
const express_1 = require("express");
const node_crypto_1 = __importDefault(require("node:crypto"));
const node_fs_1 = __importDefault(require("node:fs"));
const db_js_1 = require("../db.js");
const rateLimiter_js_1 = require("../middleware/rateLimiter.js");
const auth_js_1 = require("../middleware/auth.js");
const auditLogger_js_1 = require("../middleware/auditLogger.js");
const storage_js_1 = require("../utils/storage.js");
const assets_js_1 = require("./assets.js");
const analyticsEngine_js_1 = require("../utils/analyticsEngine.js");
exports.sharesRouter = (0, express_1.Router)();
// Apply dedicated rate limiting to all share routes
exports.sharesRouter.use(rateLimiter_js_1.shareRateLimiter);
/**
 * Hash raw share token using SHA-256
 */
function hashShareToken(token) {
    return node_crypto_1.default.createHash('sha256').update(String(token).trim()).digest('hex');
}
/**
 * Resolve share row from DB with expiration, revocation and usage limits check
 */
async function resolveValidShare(token) {
    const tokenHash = hashShareToken(token);
    const rows = await (0, db_js_1.query)(`SELECT s.*, a.title, a.mime_type, a.deleted_at as asset_deleted_at
     FROM asset_shares s
     JOIN assets a ON a.id = s.asset_id
     WHERE s.share_token_hash = ?
     LIMIT 1`, [tokenHash]);
    if (!rows || rows.length === 0) {
        return null;
    }
    const share = rows[0];
    // Expired, revoked, asset deleted, or max uses reached check
    const now = new Date();
    const isExpired = new Date(share.expires_at) <= now;
    const isRevoked = share.revoked_at !== null && share.revoked_at !== undefined;
    const isAssetDeleted = share.asset_deleted_at !== null && share.asset_deleted_at !== undefined;
    const isExhausted = share.max_uses !== null && share.max_uses !== undefined && share.current_uses >= share.max_uses;
    if (isExpired || isRevoked || isAssetDeleted || isExhausted) {
        return null;
    }
    return share;
}
/**
 * GET /api/v1/shares/:token
 * Resolve public share metadata
 */
exports.sharesRouter.get('/:token', async (req, res) => {
    try {
        const token = String(req.params.token);
        const share = await resolveValidShare(token);
        if (!share) {
            res.status(404).json({
                status: 404,
                error: 'Not Found',
                message: 'Enlace de compartición no encontrado, expirado o revocado.',
            });
            return;
        }
        // Fetch latest version byte_size
        const versions = await (0, db_js_1.query)(`SELECT byte_size FROM asset_versions WHERE asset_id = ? ORDER BY version_number DESC LIMIT 1`, [share.asset_id]);
        const byteSize = versions[0]?.byte_size ?? 0;
        res.status(200).json({
            status: 200,
            data: {
                shareId: share.id,
                title: share.title,
                mimeType: share.mime_type,
                byteSize,
                permission: share.permission,
                expiresAt: share.expires_at,
                currentUses: share.current_uses,
                maxUses: share.max_uses,
            },
        });
    }
    catch (err) {
        console.error('Resolve share error:', err);
        res.status(500).json({
            status: 500,
            error: 'Internal Server Error',
            message: 'Error al consultar el enlace.',
        });
    }
});
/**
 * GET /api/v1/shares/:token/stream
 * Public binary streaming for shared assets
 */
exports.sharesRouter.get('/:token/stream', async (req, res) => {
    try {
        const token = String(req.params.token);
        const share = await resolveValidShare(token);
        if (!share) {
            res.status(404).json({
                status: 404,
                error: 'Not Found',
                message: 'Enlace de compartición no encontrado, expirado o revocado.',
            });
            return;
        }
        // Fetch latest version file_path & byte_size
        const versions = await (0, db_js_1.query)(`SELECT file_path, byte_size FROM asset_versions WHERE asset_id = ? ORDER BY version_number DESC LIMIT 1`, [share.asset_id]);
        if (!versions || versions.length === 0) {
            res
                .status(404)
                .json({ status: 404, error: 'Not Found', message: 'Archivo no encontrado en el sistema.' });
            return;
        }
        const { file_path, byte_size } = versions[0];
        (0, storage_js_1.assertPathContained)(file_path);
        if (!node_fs_1.default.existsSync(file_path)) {
            res.status(404).json({
                status: 404,
                error: 'Not Found',
                message: 'Archivo físico no disponible en almacenamiento.',
            });
            return;
        }
        // Increment current_uses and record access log
        try {
            await (0, db_js_1.query)('UPDATE asset_shares SET current_uses = current_uses + 1 WHERE id = ?', [
                share.id,
            ]);
            const ip = String(req.ip);
            const userAgent = String(req.headers['user-agent']);
            await (0, db_js_1.query)('INSERT INTO share_access_logs (share_id, ip_address, user_agent) VALUES (?, ?, ?)', [share.id, ip, userAgent]);
            void (0, analyticsEngine_js_1.recordAnalyticsEvent)({
                tenant_id: share.tenant_id,
                asset_id: share.asset_id,
                event_type: share.permission === 'DOWNLOAD' ? 'DOWNLOAD' : 'SHARE_ACCESS',
                actor_type: 'GUEST',
                bytes_served: byte_size,
                ip,
                user_agent: userAgent,
                referer: req.headers['referer'],
            });
        }
        catch {
            // Non-blocking access log update
        }
        res.setHeader('Content-Type', share.mime_type || 'application/octet-stream');
        res.setHeader('Content-Length', byte_size);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        const disposition = share.permission === 'DOWNLOAD' ? 'attachment' : 'inline';
        res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(share.title)}"`);
        node_fs_1.default.createReadStream(file_path).pipe(res);
    }
    catch (err) {
        console.error('Stream share error:', err);
        res.status(500).json({
            status: 500,
            error: 'Internal Server Error',
            message: 'Error al transmitir archivo compartido.',
        });
    }
});
/**
 * GET /api/v1/shares/:token/thumbnail
 * Public WebP thumbnail delivery for guest previews
 */
exports.sharesRouter.get('/:token/thumbnail', async (req, res) => {
    try {
        const token = String(req.params.token);
        const share = await resolveValidShare(token);
        if (!share) {
            res.status(404).json({
                status: 404,
                error: 'Not Found',
                message: 'Enlace de compartición no encontrado, expirado o revocado.',
            });
            return;
        }
        const rows = await (0, db_js_1.query)(`SELECT d.file_path, d.byte_size
       FROM asset_derivatives d
       JOIN asset_versions v ON v.id = d.version_id
       WHERE v.asset_id = ? AND d.derivative_type = 'THUMBNAIL_200W'
       ORDER BY v.version_number DESC
       LIMIT 1`, [share.asset_id]);
        if (rows && rows.length > 0) {
            const { file_path, byte_size } = rows[0];
            (0, storage_js_1.assertPathContained)(file_path);
            if (node_fs_1.default.existsSync(file_path)) {
                res.setHeader('Content-Type', 'image/webp');
                res.setHeader('Content-Length', byte_size);
                res.setHeader('Cache-Control', 'public, max-age=3600');
                node_fs_1.default.createReadStream(file_path).pipe(res);
                return;
            }
        }
        // Fallback to original if image without thumbnail derivative
        const fallbackRows = await (0, db_js_1.query)(`SELECT file_path, byte_size FROM asset_versions WHERE asset_id = ? ORDER BY version_number DESC LIMIT 1`, [share.asset_id]);
        if (fallbackRows && fallbackRows.length > 0 && share.mime_type.startsWith('image/')) {
            const { file_path, byte_size } = fallbackRows[0];
            (0, storage_js_1.assertPathContained)(file_path);
            if (node_fs_1.default.existsSync(file_path)) {
                res.setHeader('Content-Type', share.mime_type);
                res.setHeader('Content-Length', byte_size);
                res.setHeader('Cache-Control', 'public, max-age=3600');
                node_fs_1.default.createReadStream(file_path).pipe(res);
                return;
            }
        }
        res.status(404).json({ status: 404, error: 'Not Found', message: 'Miniatura no disponible.' });
    }
    catch (err) {
        console.error('Thumbnail share error:', err);
        res.status(500).json({
            status: 500,
            error: 'Internal Server Error',
            message: 'Error al obtener miniatura de compartición.',
        });
    }
});
/**
 * POST /api/v1/shares/:id/revoke
 * Revoke an active share link (Anti-IDOR + Auth required)
 */
exports.sharesRouter.post('/:id/revoke', auth_js_1.requireAuth, async (req, res) => {
    try {
        const tenantId = (0, assets_js_1.getActorTenantId)(req);
        const shareId = parseInt(String(req.params.id), 10);
        if (isNaN(shareId)) {
            res
                .status(400)
                .json({ status: 400, error: 'Bad Request', message: 'ID de enlace inválido.' });
            return;
        }
        const updateResult = await (0, db_js_1.query)(`UPDATE asset_shares
         SET revoked_at = NOW()
         WHERE id = ? AND tenant_id = ? AND revoked_at IS NULL`, [shareId, tenantId]);
        if (!updateResult || updateResult.affectedRows === 0) {
            res.status(404).json({
                status: 404,
                error: 'Not Found',
                message: 'Enlace no encontrado o previamente revocado.',
            });
            return;
        }
        await (0, auditLogger_js_1.logSecurityEvent)(req, {
            eventType: 'SHARE_REVOKED',
            userId: Number(req.user?.userId),
            status: 'SUCCESS',
            details: `Revoked share link ${shareId}`,
        });
        res.status(200).json({
            status: 200,
            message: 'Enlace de compartición revocado exitosamente.',
            data: { shareId, revoked: true },
        });
    }
    catch (err) {
        console.error('Revoke share error:', err);
        res
            .status(500)
            .json({ status: 500, error: 'Internal Server Error', message: 'Error al revocar enlace.' });
    }
});
