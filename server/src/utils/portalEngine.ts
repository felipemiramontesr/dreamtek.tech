import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { hashIpAddress, hashUserAgent } from './analyticsEngine';
import * as db from '../db';

export interface PortalTokenPayload {
  portal_id: number;
  tenant_id: number;
  scope: 'portal_access';
  iat?: number;
  exp?: number;
}

/**
 * Returns the JWT secret dedicated to brand portals (Condition C-019.2)
 */
export const getPortalJwtSecret = (): string => {
  if (process.env.NODE_ENV === 'production' && !process.env.PORTAL_JWT_SECRET && !process.env.JWT_SECRET) {
    throw new Error(
      'FATAL SECURITY ERROR: PORTAL_JWT_SECRET environment variable is missing in production.',
    );
  }
  return (
    process.env.PORTAL_JWT_SECRET ||
    (process.env.JWT_SECRET ? `${process.env.JWT_SECRET}:portal` : 'dreamtek_dev_portal_jwt_secret_2026')
  );
};

/**
 * Hashes a portal password using bcrypt
 */
export const hashPortalPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, 10);
};

/**
 * Verifies a plain text password against a bcrypt hash in timing-safe fashion (Condition C-019.9)
 */
export const verifyPortalPassword = async (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};

/**
 * Generates an independent signed Portal JWT token with 24h expiration (Condition C-019.2)
 */
export const generatePortalToken = (portalId: number, tenantId: number): string => {
  const secret = getPortalJwtSecret();
  return jwt.sign(
    {
      portal_id: portalId,
      tenant_id: tenantId,
      scope: 'portal_access',
    },
    secret,
    {
      expiresIn: '24h',
      audience: 'dreamtek:portal',
      issuer: 'dreamtek.tech',
    },
  );
};

/**
 * Verifies a Portal JWT token (Condition C-019.2)
 */
export const verifyPortalToken = (token: string): PortalTokenPayload | null => {
  try {
    const secret = getPortalJwtSecret();
    const decoded = jwt.verify(token, secret, {
      audience: 'dreamtek:portal',
      issuer: 'dreamtek.tech',
    }) as PortalTokenPayload;

    if (decoded.scope !== 'portal_access' || !decoded.portal_id || !decoded.tenant_id) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
};

/**
 * Sanitizes markdown content removing dangerous HTML tags and script injections (Condition C-019.5, OWASP A03)
 */
export const sanitizeMarkdownGuidelines = (markdown?: string | null): string => {
  if (!markdown) return '';

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

/**
 * Logs anonymous visitor access to a brand portal (Condition C-019.13)
 */
export const logPortalAccess = async (
  portalId: number,
  ip?: string,
  userAgent?: string,
  referer?: string,
): Promise<void> => {
  try {
    const ipHash = ip ? hashIpAddress(ip) : null;
    const uaHash = userAgent ? hashUserAgent(userAgent) : null;
    let refererDomain: string | null = null;

    if (referer) {
      try {
        const parsed = new URL(referer);
        refererDomain = parsed.hostname;
      } catch {
        refererDomain = null;
      }
    }

    await db.query(
      `INSERT INTO dam_portal_access_logs (portal_id, ip_hash, user_agent_hash, referer_domain)
       VALUES (?, ?, ?, ?)`,
      [portalId, ipHash, uaHash, refererDomain],
    );
  } catch (err) {
    console.error('Failed to log portal access:', err);
  }
};
