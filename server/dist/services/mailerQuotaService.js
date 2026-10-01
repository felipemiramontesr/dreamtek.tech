"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkUserEmailVerificationQuota = checkUserEmailVerificationQuota;
const db_js_1 = require("../db.js");
/**
 * Validates 24-hour verification email quota per user.
 * Limit: 5 emails per recipient per 24 hours.
 * Validated strictly BEFORE invalidating prior OTP or generating a new one.
 */
async function checkUserEmailVerificationQuota(userId) {
    const rows = await (0, db_js_1.query)('SELECT COUNT(*) as count FROM user_email_verifications WHERE user_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)', [userId]);
    const count = Number(rows?.[0]?.count || 0);
    const MAX_DAILY_EMAILS = 5;
    if (count >= MAX_DAILY_EMAILS) {
        return { allowed: false, remaining: 0 };
    }
    return { allowed: true, remaining: MAX_DAILY_EMAILS - count };
}
