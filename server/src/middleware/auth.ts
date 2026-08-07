import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthenticatedUser {
  userId: number | string;
  email: string;
  role: 'ADMIN' | 'CLIENT' | string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

interface JwtTokenPayload {
  userId?: number | string;
  uid?: number | string;
  id?: number | string;
  email: string;
  role?: string;
}

function getJwtSecret(): string {
  if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    throw new Error('FATAL SECURITY ERROR: JWT_SECRET environment variable is missing in production.');
  }
  return process.env.JWT_SECRET || 'dreamtek_dev_jwt_secret_key_2026';
}

/**
 * Require Authentication Middleware (Condition C-M2)
 * Extracts JWT token from HttpOnly cookie 'dreamtek_session' or Authorization header
 */
export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  let token: string | undefined;

  // 1. Try from HttpOnly Cookie
  if (req.cookies && req.cookies.dreamtek_session) {
    token = req.cookies.dreamtek_session;
  }

  // 2. Try from Authorization Header
  if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    res.status(401).json({
      status: 401,
      error: 'Unauthorized',
      message: 'Acceso no autorizado. Se requiere un token de sesión válido.',
    });
    return;
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret()) as JwtTokenPayload;
    
    // Condition C-M1 & C-M2: Standardize userId, email, and uppercase role
    req.user = {
      userId: decoded.userId || decoded.uid || decoded.id || 0,
      email: decoded.email,
      role: (decoded.role || 'CLIENT').toUpperCase(),
    };

    next();
  } catch (_err) {
    res.status(401).json({
      status: 401,
      error: 'Unauthorized',
      message: 'Token de sesión expirado o inválido.',
    });
  }
}

/**
 * Require Role Middleware (Condition C-M1)
 * Enforces Role-Based Access Control (RBAC) with uppercase role matching ('ADMIN', 'CLIENT')
 */
export function requireRole(allowedRoles: string[]) {
  const upperAllowed = allowedRoles.map((r) => r.toUpperCase());

  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        status: 401,
        error: 'Unauthorized',
        message: 'Usuario no autenticado.',
      });
      return;
    }

    if (!upperAllowed.includes(req.user.role)) {
      res.status(403).json({
        status: 403,
        error: 'Forbidden',
        message: `Acceso prohibido. Se requiere rol [${upperAllowed.join(', ')}].`,
      });
      return;
    }

    next();
  };
}
