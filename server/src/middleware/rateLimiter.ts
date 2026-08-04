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
    message: 'Too many requests from this IP, please try again after 15 minutes.'
  }
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
      message: 'Too many sensitive operations attempted. Please try again after 15 minutes.'
    });
  }
});
