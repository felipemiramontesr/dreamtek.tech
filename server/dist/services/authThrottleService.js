"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeThrottleKey = computeThrottleKey;
exports.checkLoginThrottle = checkLoginThrottle;
exports.recordFailedLoginAttempt = recordFailedLoginAttempt;
exports.clearLoginThrottle = clearLoginThrottle;
const node_crypto_1 = __importDefault(require("node:crypto"));
const db_js_1 = require("../db.js");
const auth_js_1 = require("../routes/auth.js");
/**
 * Computes deterministic HMAC-SHA256 key hash for throttle tracking.
 * Key derived from JWT_SECRET with strict domain separation (FC 055 Enmienda O / Archon FC199 parity).
 * Zero new environment variables required.
 */
function computeThrottleKey(identifier, ip, scope = 'login') {
    const cleanId = String(identifier || '')
        .trim()
        .toLowerCase();
    const cleanIp = String(ip || '').trim();
    const domainTag = `dreamtek-auth-throttle|${scope}:${cleanId}|${cleanIp}`;
    return node_crypto_1.default
        .createHmac('sha256', (0, auth_js_1.getJwtSecret)())
        .update(domainTag)
        .digest('hex');
}
/**
 * Checks whether login attempt is throttled.
 * Evaluated strictly BEFORE bcrypt computation.
 * Zero sleep() in Express thread.
 */
async function checkLoginThrottle(identifier, ip) {
    const keyHash = computeThrottleKey(identifier, ip);
    const rows = await (0, db_js_1.query)('SELECT counter, window_start, last_attempt_at FROM auth_throttle_counters WHERE key_hash = ? LIMIT 1', [keyHash]);
    if (!rows || rows.length === 0) {
        return { throttled: false, retryAfterSeconds: 0 };
    }
    const record = rows[0];
    const lastAttemptTime = new Date(record.last_attempt_at).getTime();
    const now = Date.now();
    const windowMs = 15 * 60 * 1000; // 15-minute sliding window
    // If previous attempt is older than the window, reset state
    if (now - lastAttemptTime > windowMs) {
        return { throttled: false, retryAfterSeconds: 0 };
    }
    // Under threshold: allow without throttle delay
    if (record.counter < 5) {
        return { throttled: false, retryAfterSeconds: 0 };
    }
    // Exponential progressive delay: 1s, 2s, 4s, 8s ... capped at 60s
    const delaySeconds = Math.min(60, Math.pow(2, record.counter - 5));
    const elapsedSeconds = (now - lastAttemptTime) / 1000;
    if (elapsedSeconds < delaySeconds) {
        const retryAfterSeconds = Math.min(60, Math.max(1, Math.ceil(delaySeconds - elapsedSeconds)));
        return { throttled: true, retryAfterSeconds };
    }
    return { throttled: false, retryAfterSeconds: 0 };
}
/**
 * Records failed login attempt atomically in MariaDB.
 */
async function recordFailedLoginAttempt(identifier, ip) {
    const keyHash = computeThrottleKey(identifier, ip);
    await (0, db_js_1.query)(`INSERT INTO auth_throttle_counters (key_hash, counter, window_start, last_attempt_at)
     VALUES (?, 1, NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       counter = IF(last_attempt_at < DATE_SUB(NOW(), INTERVAL 15 MINUTE), 1, counter + 1),
       window_start = IF(last_attempt_at < DATE_SUB(NOW(), INTERVAL 15 MINUTE), NOW(), window_start),
       last_attempt_at = NOW()`, [keyHash]);
}
/**
 * Clears throttle counter upon successful login.
 * Cleans ONLY the specific user|IP pair.
 */
async function clearLoginThrottle(identifier, ip) {
    const keyHash = computeThrottleKey(identifier, ip);
    await (0, db_js_1.query)('DELETE FROM auth_throttle_counters WHERE key_hash = ?', [keyHash]);
}
