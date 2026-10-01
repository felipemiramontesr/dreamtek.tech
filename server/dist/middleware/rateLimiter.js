"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.videoWatermarkRateLimiter = exports.audioSpectralRateLimiter = exports.videoChapterRateLimiter = exports.videoThumbnailRateLimiter = exports.videoTranscodingRateLimiter = exports.bannerAdaptationRateLimiter = exports.watermarkRateLimiter = exports.compressionRateLimiter = exports.superResolutionRateLimiter = exports.faceBlurringRateLimiter = exports.backgroundReplacementRateLimiter = exports.imageEnhancementRateLimiter = exports.smartCropRateLimiter = exports.subtitlesRateLimiter = exports.audioCleaningRateLimiter = exports.videoHighlightsRateLimiter = exports.videoAiRateLimiter = exports.portalVerifyRateLimiter = exports.publicPortalsRateLimiter = exports.portalsRateLimiter = exports.analyticsEventsRateLimiter = exports.analyticsRateLimiter = exports.workflowsRateLimiter = exports.semanticSearchRateLimiter = exports.aiRateLimiter = exports.archivalRateLimiter = exports.dedupRateLimiter = exports.webhooksRateLimiter = exports.jobsRateLimiter = exports.rightsRateLimiter = exports.batchRateLimiter = exports.versionsRateLimiter = exports.collectionsRateLimiter = exports.workspacesRateLimiter = exports.aclRateLimiter = exports.tagsRateLimiter = exports.searchRateLimiter = exports.shareRateLimiter = exports.uploadRateLimiter = exports.sensitiveEndpointLimiter = exports.globalRateLimiter = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
/**
 * Global API Rate Limiter
 * 100 requests per 15 minutes window per IP
 */
exports.globalRateLimiter = (0, express_rate_limit_1.default)({
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
exports.sensitiveEndpointLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
        // Exempt GET /auth/me or non-POST requests to auth endpoints
        if (req.method === 'GET' || req.path === '/me') {
            return true;
        }
        return false;
    },
    handler: (_req, res) => {
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
exports.uploadRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
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
exports.shareRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
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
exports.searchRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
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
exports.tagsRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
        res.status(429).json({
            status: 429,
            error: 'Too Many Requests',
            message: 'Límite de operaciones de etiquetas y metadatos alcanzado. Intente nuevamente en un minuto.',
        });
    },
});
/**
 * DAM ACL & Permissions Rate Limiter (OWASP A04)
 * 100 requests per 1 minute window per IP
 */
exports.aclRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
        res.status(429).json({
            status: 429,
            error: 'Too Many Requests',
            message: 'Límite de operaciones de control de acceso (ACL) alcanzado. Intente nuevamente en un minuto.',
        });
    },
});
/**
 * DAM Workspaces Rate Limiter (OWASP A04)
 * 100 requests per 1 minute window per IP
 */
exports.workspacesRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
        res.status(429).json({
            status: 429,
            error: 'Too Many Requests',
            message: 'Límite de operaciones de espacios de trabajo alcanzado. Intente nuevamente en un minuto.',
        });
    },
});
/**
 * DAM Collections Rate Limiter (OWASP A04)
 * 100 requests per 1 minute window per IP
 */
exports.collectionsRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
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
exports.versionsRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
        res.status(429).json({
            status: 429,
            error: 'Too Many Requests',
            message: 'Límite de operaciones de versiones de activos alcanzado. Intente nuevamente en un minuto.',
        });
    },
});
/**
 * DAM Batch & Bulk Operations Rate Limiter (OWASP A04)
 * 100 requests per 1 minute window per IP
 */
exports.batchRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
        res.status(429).json({
            status: 429,
            error: 'Too Many Requests',
            message: 'Límite de operaciones por lotes (Batch) alcanzado. Intente nuevamente en un minuto.',
        });
    },
});
/**
 * DAM Rights, Licenses & Embargo Rate Limiter (OWASP A04)
 * 100 requests per 1 minute window per IP
 */
exports.rightsRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
        res.status(429).json({
            status: 429,
            error: 'Too Many Requests',
            message: 'Límite de operaciones de derechos y licencias alcanzado. Intente nuevamente en un minuto.',
        });
    },
});
/**
 * DAM Video/Audio Preview & Processing Jobs Rate Limiter (OWASP A04)
 * 100 requests per 1 minute window per IP
 */
exports.jobsRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
        res.status(429).json({
            status: 429,
            error: 'Too Many Requests',
            message: 'Límite de operaciones de procesamiento multimedia alcanzado. Intente nuevamente en un minuto.',
        });
    },
});
/**
 * DAM Webhooks & Outbound Event Notifications Rate Limiter (OWASP A04)
 * 60 requests per 1 minute window per IP
 */
exports.webhooksRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
        res.status(429).json({
            status: 429,
            error: 'Too Many Requests',
            message: 'Límite de operaciones de webhooks alcanzado. Intente nuevamente en un minuto.',
        });
    },
});
/**
 * DAM Asset Duplication & Deduplication Rate Limiter (OWASP A04)
 * 30 requests per 1 minute window per IP
 */
exports.dedupRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
        res.status(429).json({
            status: 429,
            error: 'Too Many Requests',
            message: 'Límite de operaciones de detección y deduplicación alcanzado. Intente nuevamente en un minuto.',
        });
    },
});
/**
 * DAM Cloud Cold-Storage Archival & Glacier Sync Rate Limiter (OWASP A04)
 * 30 requests per 1 minute window per IP
 */
exports.archivalRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
        res.status(429).json({
            status: 429,
            error: 'Too Many Requests',
            message: 'Límite de operaciones de archivado y restauración en frío alcanzado. Intente nuevamente en un minuto.',
        });
    },
});
/**
 * DAM AI Auto-Tagging & Smart Metadata Extraction Rate Limiter (OWASP A04)
 * 30 requests per 1 minute window per IP
 */
exports.aiRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
        res.status(429).json({
            status: 429,
            error: 'Too Many Requests',
            message: 'Límite de operaciones de inteligencia artificial y auto-etiquetado alcanzado. Intente nuevamente en un minuto.',
        });
    },
});
/**
 * DAM Semantic & Vector Similarity Search Rate Limiter (OWASP A04)
 * 30 requests per 1 minute window per IP
 */
exports.semanticSearchRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
        res.status(429).json({
            status: 429,
            error: 'Too Many Requests',
            message: 'Límite de búsquedas semánticas y operaciones vectoriales alcanzado. Intente nuevamente en un minuto.',
        });
    },
});
/**
 * DAM Custom Dynamic Workflows & Automation Rate Limiter (OWASP A04)
 * 30 requests per 1 minute window per IP
 */
exports.workflowsRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
        res.status(429).json({
            status: 429,
            error: 'Too Many Requests',
            message: 'Límite de operaciones de flujos de trabajo y automatización alcanzado. Intente nuevamente en un minuto.',
        });
    },
});
/**
 * DAM Analytics & ROI Reporting Rate Limiter (OWASP A04)
 * 30 requests per 1 minute window per IP
 */
exports.analyticsRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
        res.status(429).json({
            status: 429,
            error: 'Too Many Requests',
            message: 'Límite de consultas de analíticas y reportes de ROI alcanzado. Intente nuevamente en un minuto.',
        });
    },
});
/**
 * DAM Analytics Events Ingestion Rate Limiter (OWASP A04)
 * 60 requests per 1 minute window per IP
 */
exports.analyticsEventsRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
        res.status(429).json({
            status: 429,
            error: 'Too Many Requests',
            message: 'Límite de registro de eventos de telemetría alcanzado. Intente nuevamente en un minuto.',
        });
    },
});
/**
 * DAM Brand Portals Management Rate Limiter (OWASP A04)
 * 60 requests per 1 minute window per IP
 */
exports.portalsRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
        res.status(429).json({
            status: 429,
            error: 'Too Many Requests',
            message: 'Límite de operaciones de portales de marca alcanzado. Intente nuevamente en un minuto.',
        });
    },
});
/**
 * DAM Public Brand Portals Browsing Rate Limiter (OWASP A04)
 * 60 requests per 1 minute window per IP
 */
exports.publicPortalsRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
        res.status(429).json({
            status: 429,
            error: 'Too Many Requests',
            message: 'Límite de navegación pública de portales alcanzado. Intente nuevamente en un minuto.',
        });
    },
});
/**
 * DAM Public Brand Portal Password Verification Rate Limiter (OWASP A04 / A07 Anti-Brute-Force)
 * 10 requests per 1 minute window per IP
 */
exports.portalVerifyRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
        res.status(429).json({
            status: 429,
            error: 'Too Many Requests',
            message: 'Demasiados intentos de validación de contraseña. Intente nuevamente en un minuto.',
        });
    },
});
/**
 * DAM Video AI Scene Search & Transcription Rate Limiter (OWASP A04)
 * 30 requests per 1 minute window per IP
 */
exports.videoAiRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
        res.status(429).json({
            status: 429,
            error: 'Too Many Requests',
            message: 'Límite de operaciones de análisis y búsqueda de video alcanzado. Intente nuevamente en un minuto.',
        });
    },
});
/**
 * DAM Video Highlights & Automated Reel Generation Rate Limiter (OWASP A04)
 * 30 requests per 1 minute window per IP
 */
exports.videoHighlightsRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
        res.status(429).json({
            status: 429,
            error: 'Too Many Requests',
            message: 'Límite de operaciones de generación de resúmenes de video alcanzado. Intente nuevamente en un minuto.',
        });
    },
});
/**
 * DAM Audio Cleaning & Noise Suppression Rate Limiter (OWASP A04)
 * 30 requests per 1 minute window per IP
 */
exports.audioCleaningRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
        res.status(429).json({
            status: 429,
            error: 'Too Many Requests',
            message: 'Límite de operaciones de limpieza de audio alcanzado. Intente nuevamente en un minuto.',
        });
    },
});
/**
 * DAM Automated Subtitling & Translation Rate Limiter (OWASP A04)
 * 30 requests per 1 minute window per IP
 */
exports.subtitlesRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
        res.status(429).json({
            status: 429,
            error: 'Too Many Requests',
            message: 'Límite de operaciones de generación y traducción de subtítulos alcanzado. Intente nuevamente en un minuto.',
        });
    },
});
/**
 * DAM AI Smart Crop & Focal Point Auto-Detection Rate Limiter (OWASP A04)
 * 30 requests per 1 minute window per IP
 */
exports.smartCropRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
        res.status(429).json({
            status: 429,
            error: 'Too Many Requests',
            message: 'Límite de operaciones de smart crop y recorte inteligente alcanzado. Intente nuevamente en un minuto.',
        });
    },
});
/**
 * DAM AI Image Colorization & Tone Enhancement Rate Limiter (OWASP A04)
 * 30 requests per 1 minute window per IP
 */
exports.imageEnhancementRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
        res.status(429).json({
            status: 429,
            error: 'Too Many Requests',
            message: 'Límite de operaciones de realce y colorización de imagen alcanzado. Intente nuevamente en un minuto.',
        });
    },
});
/**
 * DAM AI Background Replacement & Inpainting Rate Limiter (OWASP A04)
 * 30 requests per 1 minute window per IP
 */
exports.backgroundReplacementRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
        res.status(429).json({
            status: 429,
            error: 'Too Many Requests',
            message: 'Límite de operaciones de reemplazo de fondo e inpainting alcanzado. Intente nuevamente en un minuto.',
        });
    },
});
/**
 * DAM AI Face Blurring & Privacy Anonymization Rate Limiter (OWASP A04)
 * 30 requests per 1 minute window per IP
 */
exports.faceBlurringRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
        res.status(429).json({
            status: 429,
            error: 'Too Many Requests',
            message: 'Límite de operaciones de anonimización y difuminado facial alcanzado. Intente nuevamente en un minuto.',
        });
    },
});
/**
 * DAM AI Image Super-Resolution & Smart Upscaling Rate Limiter (OWASP A04)
 * 30 requests per 1 minute window per IP
 */
exports.superResolutionRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
        res.status(429).json({
            status: 429,
            error: 'Too Many Requests',
            message: 'Límite de operaciones de super-resolución y escalado de imagen alcanzado. Intente nuevamente en un minuto.',
        });
    },
});
/**
 * DAM AI Semantic Image Compression & Web Optimization Rate Limiter (OWASP A04)
 * 30 requests per 1 minute window per IP
 */
exports.compressionRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
        res.status(429).json({
            status: 429,
            error: 'Too Many Requests',
            message: 'Límite de operaciones de compresión y optimización web alcanzado. Intente nuevamente en un minuto.',
        });
    },
});
/**
 * DAM AI Smart Watermarking & Copyright Protection Rate Limiter (OWASP A04)
 * 30 requests per 1 minute window per IP
 */
exports.watermarkRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
        res.status(429).json({
            status: 429,
            error: 'Too Many Requests',
            message: 'Límite de operaciones de marca de agua y protección de copyright alcanzado. Intente nuevamente en un minuto.',
        });
    },
});
/**
 * DAM AI Smart Semantic Auto-Cropping & Banner Adaptation Rate Limiter (OWASP A04)
 * 30 requests per 1 minute window per IP
 */
exports.bannerAdaptationRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
        res.status(429).json({
            status: 429,
            error: 'Too Many Requests',
            message: 'Límite de operaciones de adaptación de banners y auto-recorte alcanzado. Intente nuevamente en un minuto.',
        });
    },
});
/**
 * DAM AI Video Transcoding & Adaptive Bitrate Streaming Rate Limiter (OWASP A04)
 * 30 requests per 1 minute window per IP
 */
exports.videoTranscodingRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
        res.status(429).json({
            status: 429,
            error: 'Too Many Requests',
            message: 'Límite de operaciones de transcodificación y streaming adaptativo alcanzado. Intente nuevamente en un minuto.',
        });
    },
});
/**
 * DAM AI Smart Video Thumbnail & Animated Preview Rate Limiter (OWASP A04)
 * 30 requests per 1 minute window per IP
 */
exports.videoThumbnailRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
        res.status(429).json({
            status: 429,
            error: 'Too Many Requests',
            message: 'Límite de operaciones de generación de miniaturas y vistas previas alcanzado. Intente nuevamente en un minuto.',
        });
    },
});
/**
 * DAM AI Automated Video Chaptering & Content Summarization Rate Limiter (OWASP A04)
 * 30 requests per 1 minute window per IP
 */
exports.videoChapterRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
        res.status(429).json({
            status: 429,
            error: 'Too Many Requests',
            message: 'Límite de operaciones de capítulos y resúmenes de video alcanzado. Intente nuevamente en un minuto.',
        });
    },
});
/**
 * DAM AI Automated Audio Noise Profiling & Spectral De-humming Rate Limiter (OWASP A04)
 * 30 requests per 1 minute window per IP
 */
exports.audioSpectralRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
        res.status(429).json({
            status: 429,
            error: 'Too Many Requests',
            message: 'Límite de operaciones de perfilado espectral y de-humming alcanzado. Intente nuevamente en un minuto.',
        });
    },
});
/**
 * DAM AI Dynamic Video Watermarking & Forensic Tracking Rate Limiter (OWASP A04)
 * 30 requests per 1 minute window per IP
 */
exports.videoWatermarkRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
        res.status(429).json({
            status: 429,
            error: 'Too Many Requests',
            message: 'Límite de operaciones de marcas de agua dinámicas y trazabilidad forense alcanzado. Intente nuevamente en un minuto.',
        });
    },
});
