import { Request } from 'express';
import crypto from 'crypto';
import { pool } from '../db.js';

export interface AuditLogOptions {
  eventType: string;
  userId?: number | null;
  status?: 'SUCCESS' | 'FAILURE' | 'BLOCKED';
  details?: string;
}

/**
 * Sanitizes request payload by removing sensitive fields (password, token, secrets)
 * and computes SHA-256 hash for non-repudiation audit tracking (OWASP A09).
 */
export function computeSanitizedPayloadHash(body: any): string | null {
  if (!body || typeof body !== 'object') return null;
  try {
    const sanitized = { ...body };
    delete sanitized.password;
    delete sanitized.confirmPassword;
    delete sanitized.token;
    delete sanitized.secret;
    delete sanitized.creditCard;

    const payloadString = JSON.stringify(sanitized);
    return crypto.createHash('sha256').update(payloadString).digest('hex');
  } catch {
    return null;
  }
}

/**
 * Log a security audit event to security_audit_logs.
 * Never stores raw passwords or secrets (Condition C-H6).
 */
export async function logSecurityEvent(req: Request, options: AuditLogOptions): Promise<void> {
  const ipAddress =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.ip ||
    req.socket.remoteAddress ||
    '127.0.0.1';

  const userAgent = req.headers['user-agent']?.substring(0, 255) || 'Unknown';
  const payloadHash = computeSanitizedPayloadHash(req.body);
  const status = options.status || 'SUCCESS';
  const userId = options.userId || null;
  const details = options.details ? options.details.substring(0, 500) : null;

  try {
    await pool.execute(
      `INSERT INTO security_audit_logs 
       (event_type, user_id, ip_address, user_agent, payload_sha256, status, details) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [options.eventType, userId, ipAddress, userAgent, payloadHash, status, details],
    );
  } catch (err) {
    // Fail-safe: Non-blocking fallback log to stdout/stderr if DB is unavailable
    console.warn(
      `[SECURITY_AUDIT_FALLBACK] event=${options.eventType} ip=${ipAddress} status=${status}`,
    );
  }
}
