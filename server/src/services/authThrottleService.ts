import crypto from 'node:crypto';
import { query } from '../db.js';
import { getJwtSecret } from '../routes/auth.js';

/**
 * Computes deterministic HMAC-SHA256 key hash for throttle tracking.
 * Key derived from JWT_SECRET with strict domain separation (FC 055 Enmienda O / Archon FC199 parity).
 * Zero new environment variables required.
 */
export function computeThrottleKey(identifier: string, ip: string, scope = 'login'): string {
  const cleanId = String(identifier || '')
    .trim()
    .toLowerCase();
  const cleanIp = String(ip || '').trim();
  const domainTag = `dreamtek-auth-throttle|${scope}:${cleanId}|${cleanIp}`;
  return crypto
    .createHmac('sha256', getJwtSecret())
    .update(domainTag)
    .digest('hex');
}

export interface ThrottleCheckResult {
  throttled: boolean;
  retryAfterSeconds: number;
}

/**
 * Checks whether login attempt is throttled.
 * Evaluated strictly BEFORE bcrypt computation.
 * Zero sleep() in Express thread.
 */
export async function checkLoginThrottle(
  identifier: string,
  ip: string,
): Promise<ThrottleCheckResult> {
  const keyHash = computeThrottleKey(identifier, ip);
  const rows = await query<any[]>(
    'SELECT counter, window_start, last_attempt_at FROM auth_throttle_counters WHERE key_hash = ? LIMIT 1',
    [keyHash],
  );

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
export async function recordFailedLoginAttempt(identifier: string, ip: string): Promise<void> {
  const keyHash = computeThrottleKey(identifier, ip);
  await query(
    `INSERT INTO auth_throttle_counters (key_hash, counter, window_start, last_attempt_at)
     VALUES (?, 1, NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       counter = IF(last_attempt_at < DATE_SUB(NOW(), INTERVAL 15 MINUTE), 1, counter + 1),
       window_start = IF(last_attempt_at < DATE_SUB(NOW(), INTERVAL 15 MINUTE), NOW(), window_start),
       last_attempt_at = NOW()`,
    [keyHash],
  );
}

/**
 * Clears throttle counter upon successful login.
 * Cleans ONLY the specific user|IP pair.
 */
export async function clearLoginThrottle(identifier: string, ip: string): Promise<void> {
  const keyHash = computeThrottleKey(identifier, ip);
  await query('DELETE FROM auth_throttle_counters WHERE key_hash = ?', [keyHash]);
}
