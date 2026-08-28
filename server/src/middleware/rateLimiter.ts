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

/**
 * DAM ACL & Permissions Rate Limiter (OWASP A04)
 * 100 requests per 1 minute window per IP
 */
export const aclRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      status: 429,
      error: 'Too Many Requests',
      message:
        'Límite de operaciones de control de acceso (ACL) alcanzado. Intente nuevamente en un minuto.',
    });
  },
});

/**
 * DAM Workspaces Rate Limiter (OWASP A04)
 * 100 requests per 1 minute window per IP
 */
export const workspacesRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      status: 429,
      error: 'Too Many Requests',
      message:
        'Límite de operaciones de espacios de trabajo alcanzado. Intente nuevamente en un minuto.',
    });
  },
});

/**
 * DAM Collections Rate Limiter (OWASP A04)
 * 100 requests per 1 minute window per IP
 */
export const collectionsRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      status: 429,
      error: 'Too Many Requests',
      message: 'Límite de operaciones de colecciones alcanzado. Intente nuevamente en un minuto.',
    });
  },
});

/**
 * DAM Asset Versions Rate Limiter (OWASP A04)
 * 100 requests per 1 minute window per IP
 */
export const versionsRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      status: 429,
      error: 'Too Many Requests',
      message:
        'Límite de operaciones de versiones de activos alcanzado. Intente nuevamente en un minuto.',
    });
  },
});

/**
 * DAM Batch & Bulk Operations Rate Limiter (OWASP A04)
 * 100 requests per 1 minute window per IP
 */
export const batchRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      status: 429,
      error: 'Too Many Requests',
      message:
        'Límite de operaciones por lotes (Batch) alcanzado. Intente nuevamente en un minuto.',
    });
  },
});

/**
 * DAM Rights, Licenses & Embargo Rate Limiter (OWASP A04)
 * 100 requests per 1 minute window per IP
 */
export const rightsRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      status: 429,
      error: 'Too Many Requests',
      message:
        'Límite de operaciones de derechos y licencias alcanzado. Intente nuevamente en un minuto.',
    });
  },
});

/**
 * DAM Video/Audio Preview & Processing Jobs Rate Limiter (OWASP A04)
 * 100 requests per 1 minute window per IP
 */
export const jobsRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      status: 429,
      error: 'Too Many Requests',
      message:
        'Límite de operaciones de procesamiento multimedia alcanzado. Intente nuevamente en un minuto.',
    });
  },
});

/**
 * DAM Webhooks & Outbound Event Notifications Rate Limiter (OWASP A04)
 * 60 requests per 1 minute window per IP
 */
export const webhooksRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      status: 429,
      error: 'Too Many Requests',
      message:
        'Límite de operaciones de webhooks alcanzado. Intente nuevamente en un minuto.',
    });
  },
});

/**
 * DAM Asset Duplication & Deduplication Rate Limiter (OWASP A04)
 * 30 requests per 1 minute window per IP
 */
export const dedupRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      status: 429,
      error: 'Too Many Requests',
      message:
        'Límite de operaciones de detección y deduplicación alcanzado. Intente nuevamente en un minuto.',
    });
  },
});

/**
 * DAM Cloud Cold-Storage Archival & Glacier Sync Rate Limiter (OWASP A04)
 * 30 requests per 1 minute window per IP
 */
export const archivalRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      status: 429,
      error: 'Too Many Requests',
      message:
        'Límite de operaciones de archivado y restauración en frío alcanzado. Intente nuevamente en un minuto.',
    });
  },
});

/**
 * DAM AI Auto-Tagging & Smart Metadata Extraction Rate Limiter (OWASP A04)
 * 30 requests per 1 minute window per IP
 */
export const aiRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      status: 429,
      error: 'Too Many Requests',
      message:
        'Límite de operaciones de inteligencia artificial y auto-etiquetado alcanzado. Intente nuevamente en un minuto.',
    });
  },
});

/**
 * DAM Semantic & Vector Similarity Search Rate Limiter (OWASP A04)
 * 30 requests per 1 minute window per IP
 */
export const semanticSearchRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      status: 429,
      error: 'Too Many Requests',
      message:
        'Límite de búsquedas semánticas y operaciones vectoriales alcanzado. Intente nuevamente en un minuto.',
    });
  },
});

/**
 * DAM Custom Dynamic Workflows & Automation Rate Limiter (OWASP A04)
 * 30 requests per 1 minute window per IP
 */
export const workflowsRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      status: 429,
      error: 'Too Many Requests',
      message:
        'Límite de operaciones de flujos de trabajo y automatización alcanzado. Intente nuevamente en un minuto.',
    });
  },
});

/**
 * DAM Analytics & ROI Reporting Rate Limiter (OWASP A04)
 * 30 requests per 1 minute window per IP
 */
export const analyticsRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      status: 429,
      error: 'Too Many Requests',
      message:
        'Límite de consultas de analíticas y reportes de ROI alcanzado. Intente nuevamente en un minuto.',
    });
  },
});

/**
 * DAM Analytics Events Ingestion Rate Limiter (OWASP A04)
 * 60 requests per 1 minute window per IP
 */
export const analyticsEventsRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      status: 429,
      error: 'Too Many Requests',
      message:
        'Límite de registro de eventos de telemetría alcanzado. Intente nuevamente en un minuto.',
    });
  },
});

/**
 * DAM Brand Portals Management Rate Limiter (OWASP A04)
 * 60 requests per 1 minute window per IP
 */
export const portalsRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      status: 429,
      error: 'Too Many Requests',
      message:
        'Límite de operaciones de portales de marca alcanzado. Intente nuevamente en un minuto.',
    });
  },
});

/**
 * DAM Public Brand Portals Browsing Rate Limiter (OWASP A04)
 * 60 requests per 1 minute window per IP
 */
export const publicPortalsRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      status: 429,
      error: 'Too Many Requests',
      message:
        'Límite de navegación pública de portales alcanzado. Intente nuevamente en un minuto.',
    });
  },
});

/**
 * DAM Public Brand Portal Password Verification Rate Limiter (OWASP A04 / A07 Anti-Brute-Force)
 * 10 requests per 1 minute window per IP
 */
export const portalVerifyRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      status: 429,
      error: 'Too Many Requests',
      message:
        'Demasiados intentos de validación de contraseña. Intente nuevamente en un minuto.',
    });
  },
});

/**
 * DAM Video AI Scene Search & Transcription Rate Limiter (OWASP A04)
 * 30 requests per 1 minute window per IP
 */
export const videoAiRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      status: 429,
      error: 'Too Many Requests',
      message:
        'Límite de operaciones de análisis y búsqueda de video alcanzado. Intente nuevamente en un minuto.',
    });
  },
});

/**
 * DAM Video Highlights & Automated Reel Generation Rate Limiter (OWASP A04)
 * 30 requests per 1 minute window per IP
 */
export const videoHighlightsRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      status: 429,
      error: 'Too Many Requests',
      message:
        'Límite de operaciones de generación de resúmenes de video alcanzado. Intente nuevamente en un minuto.',
    });
  },
});

/**
 * DAM Audio Cleaning & Noise Suppression Rate Limiter (OWASP A04)
 * 30 requests per 1 minute window per IP
 */
export const audioCleaningRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      status: 429,
      error: 'Too Many Requests',
      message:
        'Límite de operaciones de limpieza de audio alcanzado. Intente nuevamente en un minuto.',
    });
  },
});

/**
 * DAM Automated Subtitling & Translation Rate Limiter (OWASP A04)
 * 30 requests per 1 minute window per IP
 */
export const subtitlesRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      status: 429,
      error: 'Too Many Requests',
      message:
        'Límite de operaciones de generación y traducción de subtítulos alcanzado. Intente nuevamente en un minuto.',
    });
  },
});

/**
 * DAM AI Smart Crop & Focal Point Auto-Detection Rate Limiter (OWASP A04)
 * 30 requests per 1 minute window per IP
 */
export const smartCropRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      status: 429,
      error: 'Too Many Requests',
      message:
        'Límite de operaciones de smart crop y recorte inteligente alcanzado. Intente nuevamente en un minuto.',
    });
  },
});

/**
 * DAM AI Image Colorization & Tone Enhancement Rate Limiter (OWASP A04)
 * 30 requests per 1 minute window per IP
 */
export const imageEnhancementRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      status: 429,
      error: 'Too Many Requests',
      message:
        'Límite de operaciones de realce y colorización de imagen alcanzado. Intente nuevamente en un minuto.',
    });
  },
});

/**
 * DAM AI Background Replacement & Inpainting Rate Limiter (OWASP A04)
 * 30 requests per 1 minute window per IP
 */
export const backgroundReplacementRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      status: 429,
      error: 'Too Many Requests',
      message:
        'Límite de operaciones de reemplazo de fondo e inpainting alcanzado. Intente nuevamente en un minuto.',
    });
  },
});

/**
 * DAM AI Face Blurring & Privacy Anonymization Rate Limiter (OWASP A04)
 * 30 requests per 1 minute window per IP
 */
export const faceBlurringRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      status: 429,
      error: 'Too Many Requests',
      message:
        'Límite de operaciones de anonimización y difuminado facial alcanzado. Intente nuevamente en un minuto.',
    });
  },
});

/**
 * DAM AI Image Super-Resolution & Smart Upscaling Rate Limiter (OWASP A04)
 * 30 requests per 1 minute window per IP
 */
export const superResolutionRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      status: 429,
      error: 'Too Many Requests',
      message:
        'Límite de operaciones de super-resolución y escalado de imagen alcanzado. Intente nuevamente en un minuto.',
    });
  },
});

/**
 * DAM AI Semantic Image Compression & Web Optimization Rate Limiter (OWASP A04)
 * 30 requests per 1 minute window per IP
 */
export const compressionRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      status: 429,
      error: 'Too Many Requests',
      message:
        'Límite de operaciones de compresión y optimización web alcanzado. Intente nuevamente en un minuto.',
    });
  },
});




