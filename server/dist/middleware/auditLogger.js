"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeSanitizedPayloadHash = computeSanitizedPayloadHash;
exports.logSecurityEvent = logSecurityEvent;
const crypto_1 = __importDefault(require("crypto"));
const db_js_1 = require("../db.js");
/**
 * Sanitizes request payload by removing sensitive fields (password, token, secrets)
 * and computes SHA-256 hash for non-repudiation audit tracking (OWASP A09).
 */
function computeSanitizedPayloadHash(body) {
    if (!body || typeof body !== 'object')
        return null;
    try {
        const sanitized = { ...body };
        delete sanitized.password;
        delete sanitized.confirmPassword;
        delete sanitized.token;
        delete sanitized.secret;
        delete sanitized.creditCard;
        const payloadString = JSON.stringify(sanitized);
        return crypto_1.default.createHash('sha256').update(payloadString).digest('hex');
    }
    catch {
        return null;
    }
}
/**
 * Log a security audit event to security_audit_logs.
 * Never stores raw passwords or secrets (Condition C-H6).
 */
async function logSecurityEvent(req, options) {
    const ipAddress = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
        req.ip ||
        req.socket.remoteAddress ||
        '127.0.0.1';
    const userAgent = req.headers['user-agent']?.substring(0, 255) || 'Unknown';
    const payloadHash = computeSanitizedPayloadHash(req.body);
    const status = options.status || 'SUCCESS';
    const userId = options.userId || null;
    const details = options.details ? options.details.substring(0, 500) : null;
    try {
        await db_js_1.pool.execute(`INSERT INTO security_audit_logs 
       (event_type, user_id, ip_address, user_agent, payload_sha256, status, details) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`, [options.eventType, userId, ipAddress, userAgent, payloadHash, status, details]);
    }
    catch (err) {
        // Fail-safe: Non-blocking fallback log to stdout/stderr if DB is unavailable
        console.warn(`[SECURITY_AUDIT_FALLBACK] event=${options.eventType} ip=${ipAddress} status=${status}`);
    }
}
