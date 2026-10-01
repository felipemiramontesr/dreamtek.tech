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
exports.logPortalAccess = exports.sanitizeMarkdownGuidelines = exports.verifyPortalToken = exports.generatePortalToken = exports.verifyPortalPassword = exports.hashPortalPassword = exports.getPortalJwtSecret = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const analyticsEngine_1 = require("./analyticsEngine");
const db = __importStar(require("../db"));
/**
 * Returns the JWT secret dedicated to brand portals (Condition C-019.2)
 */
const getPortalJwtSecret = () => {
    if (process.env.NODE_ENV === 'production' && !process.env.PORTAL_JWT_SECRET && !process.env.JWT_SECRET) {
        throw new Error('FATAL SECURITY ERROR: PORTAL_JWT_SECRET environment variable is missing in production.');
    }
    return (process.env.PORTAL_JWT_SECRET ||
        (process.env.JWT_SECRET ? `${process.env.JWT_SECRET}:portal` : 'dreamtek_dev_portal_jwt_secret_2026'));
};
exports.getPortalJwtSecret = getPortalJwtSecret;
/**
 * Hashes a portal password using bcrypt
 */
const hashPortalPassword = async (password) => {
    return bcryptjs_1.default.hash(password, 10);
};
exports.hashPortalPassword = hashPortalPassword;
/**
 * Verifies a plain text password against a bcrypt hash in timing-safe fashion (Condition C-019.9)
 */
const verifyPortalPassword = async (password, hash) => {
    return bcryptjs_1.default.compare(password, hash);
};
exports.verifyPortalPassword = verifyPortalPassword;
/**
 * Generates an independent signed Portal JWT token with 24h expiration (Condition C-019.2)
 */
const generatePortalToken = (portalId, tenantId) => {
    const secret = (0, exports.getPortalJwtSecret)();
    return jsonwebtoken_1.default.sign({
        portal_id: portalId,
        tenant_id: tenantId,
        scope: 'portal_access',
    }, secret, {
        expiresIn: '24h',
        audience: 'dreamtek:portal',
        issuer: 'dreamtek.tech',
    });
};
exports.generatePortalToken = generatePortalToken;
/**
 * Verifies a Portal JWT token (Condition C-019.2)
 */
const verifyPortalToken = (token) => {
    try {
        const secret = (0, exports.getPortalJwtSecret)();
        const decoded = jsonwebtoken_1.default.verify(token, secret, {
            audience: 'dreamtek:portal',
            issuer: 'dreamtek.tech',
        });
        if (decoded.scope !== 'portal_access' || !decoded.portal_id || !decoded.tenant_id) {
            return null;
        }
        return decoded;
    }
    catch {
        return null;
    }
};
exports.verifyPortalToken = verifyPortalToken;
/**
 * Sanitizes markdown content removing dangerous HTML tags and script injections (Condition C-019.5, OWASP A03)
 */
const sanitizeMarkdownGuidelines = (markdown) => {
    if (!markdown)
        return '';
    return markdown
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
        .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
        .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
        .replace(/<link\b[^>]*>/gi, '')
        .replace(/javascript:[^"'\s>]+/gi, '')
        .replace(/\s+on\w+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, '');
};
exports.sanitizeMarkdownGuidelines = sanitizeMarkdownGuidelines;
/**
 * Logs anonymous visitor access to a brand portal (Condition C-019.13)
 */
const logPortalAccess = async (portalId, ip, userAgent, referer) => {
    try {
        const ipHash = ip ? (0, analyticsEngine_1.hashIpAddress)(ip) : null;
        const uaHash = userAgent ? (0, analyticsEngine_1.hashUserAgent)(userAgent) : null;
        let refererDomain = null;
        if (referer) {
            try {
                const parsed = new URL(referer);
                refererDomain = parsed.hostname;
            }
            catch {
                refererDomain = null;
            }
        }
        await db.query(`INSERT INTO dam_portal_access_logs (portal_id, ip_hash, user_agent_hash, referer_domain)
       VALUES (?, ?, ?, ?)`, [portalId, ipHash, uaHash, refererDomain]);
    }
    catch (err) {
        console.error('Failed to log portal access:', err);
    }
};
exports.logPortalAccess = logPortalAccess;
