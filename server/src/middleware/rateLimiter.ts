import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

/**
 * Global API Rate Limiter
 * 100 requests per 15 minutes window per IP
 */
export const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 429,
    error: 'Too Many Requests',
    message: 'Too many requests from this IP, please try again after 15 minutes.',
  },
});

/**
 * Sensitive Endpoints Rate Limiter (Auth, Contact, Lead generation)
 * 5 requests per 15 minutes window per IP (OWASP A07 Brute-Force Protection)
 * Strictly targets POST /login, POST /register, POST /contact, POST /send-code, POST /lead.
 * GET /auth/me is EXEMPT (Condition C-H2).
 */
export const sensitiveEndpointLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: Request) => {
    // Exempt GET /auth/me or non-POST requests to auth endpoints
    if (req.method === 'GET' || req.path === '/me') {
      return true;
    }
    return false;
  },
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      status: 429,
      error: 'Too Many Requests',
      message: 'Too many sensitive operations attempted. Please try again after 15 minutes.',
    });
  },
});

/**
 * DAM Asset Upload Rate Limiter (OWASP A04)
 * 20 uploads per 15 minutes window per IP
 */
export const uploadRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      status: 429,
      error: 'Too Many Requests',
      message: 'Upload limit reached. Please try again after 15 minutes.',
    });
  },
});

/**
 * Public Share & Guest Links Rate Limiter (OWASP A04)
 * 60 requests per 1 minute window per IP
 */
export const shareRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      status: 429,
      error: 'Too Many Requests',
      message: 'Demasiadas solicitudes al enlace de compartición. Intente nuevamente en un minuto.',
    });
  },
});

/**
 * DAM Asset Search & Filtering Rate Limiter (OWASP A04)
 * 100 requests per 1 minute window per IP
 */
export const searchRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      status: 429,
      error: 'Too Many Requests',
      message: 'Límite de consultas de búsqueda alcanzado. Intente nuevamente en un minuto.',
    });
  },
});

/**
 * DAM Tags & Metadata Rate Limiter (OWASP A04)
 * 100 requests per 1 minute window per IP
 */
export const tagsRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      status: 429,
      error: 'Too Many Requests',
      message:
        'Límite de operaciones de etiquetas y metadatos alcanzado. Intente nuevamente en un minuto.',
    });
  },
});
