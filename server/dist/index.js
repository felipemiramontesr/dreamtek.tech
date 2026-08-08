"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const rateLimiter_js_1 = require("./middleware/rateLimiter.js");
const health_js_1 = require("./routes/health.js");
const auth_js_1 = require("./routes/auth.js");
const onboarding_js_1 = require("./routes/onboarding.js");
const checkout_js_1 = require("./routes/checkout.js");
const client_js_1 = require("./routes/client.js");
const admin_js_1 = require("./routes/admin.js");
const contact_js_1 = require("./routes/contact.js");
const db_js_1 = require("./db.js");
const cache_js_1 = require("./utils/cache.js");
dotenv_1.default.config({ path: path_1.default.join(__dirname, '../.env') });
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3001;
// Condition C-H3: Configure trust proxy for Hostinger/Cloudflare reverse proxies
app.set('trust proxy', 1);
// Security Headers via Helmet (OWASP A05)
app.use((0, helmet_1.default)({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'https:'],
            connectSrc: ["'self'", 'https://api.stripe.com'],
            frameAncestors: ["'none'"],
        },
    },
    crossOriginEmbedderPolicy: false,
    hsts: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true,
    },
    frameguard: {
        action: 'deny',
    },
    referrerPolicy: {
        policy: 'strict-origin-when-cross-origin',
    },
}));
// CORS Fail-Closed Allowlist Setup (Condition C-H4)
const allowedOrigins = [
    'http://localhost:3000',
    'https://dreamtek.tech',
    'https://www.dreamtek.tech',
];
if (process.env.CORS_ORIGIN) {
    allowedOrigins.push(process.env.CORS_ORIGIN);
}
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error('CORS Policy: Origin not allowed by Access-Control-Allow-Origin'));
    },
    credentials: true,
}));
// Body Payload Size Limits (100kb)
app.use(express_1.default.json({ limit: '100kb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '100kb' }));
app.use((0, cookie_parser_1.default)());
// Apply Global Rate Limiter
app.use(rateLimiter_js_1.globalRateLimiter);
// Root and health fallback routes
app.get('/', (_req, res) => {
    res.json({ status: 'ok', service: 'Dreamtek Node.js API', version: '1.0.0' });
});
// OpenAPI 3.1 Documentation Endpoint (FC 001i / FC 001l Cached Hot Path - Condition C-L-R1)
app.get('/api/v1/docs', async (_req, res) => {
    try {
        const cacheKey = 'docs:openapi:3.1';
        const cachedDocs = await (0, cache_js_1.getCache)(cacheKey);
        if (cachedDocs) {
            res.json(cachedDocs);
            return;
        }
        const openapiPath = path_1.default.join(__dirname, 'docs/openapi.json');
        if (fs_1.default.existsSync(openapiPath)) {
            const rawData = JSON.parse(fs_1.default.readFileSync(openapiPath, 'utf-8'));
            await (0, cache_js_1.setCache)(cacheKey, rawData, 300);
            res.json(rawData);
            return;
        }
        res.sendFile(openapiPath);
    }
    catch (_err) {
        res.sendFile(path_1.default.join(__dirname, 'docs/openapi.json'));
    }
});
// Condition C-J1: Mount health probes at Root (/healthz, /readyz) AND /api/v1/
app.use(health_js_1.healthRouter);
app.use('/api/v1', health_js_1.healthRouter);
// Express Subroutes
app.use('/api/v1/auth', rateLimiter_js_1.sensitiveEndpointLimiter, auth_js_1.authRouter);
app.use('/api/v1/onboarding', rateLimiter_js_1.sensitiveEndpointLimiter, onboarding_js_1.onboardingRouter);
app.use('/api/v1/checkout', checkout_js_1.checkoutRouter);
app.use('/api/v1/client', client_js_1.clientRouter);
app.use('/api/v1/admin', admin_js_1.adminRouter);
app.use('/api/v1/contact', rateLimiter_js_1.sensitiveEndpointLimiter, contact_js_1.contactRouter);
// Start HTTP Server
const server = app.listen(PORT, () => {
    console.log(`🚀 Dreamtek Node.js API Server running on port ${PORT}`);
});
// Graceful Shutdown Logic (Condition C-J3)
const gracefulShutdown = (signal) => {
    console.log(`\n⚠️ Received ${signal}. Starting Graceful Shutdown...`);
    (0, health_js_1.setShuttingDownState)(true);
    // Condition C-J3: 10-second fallback forced exit timer unref'd
    const forceExitTimeout = setTimeout(() => {
        console.error('❌ Graceful shutdown timed out (10s). Forcing process exit.');
        process.exit(1);
    }, 10000);
    forceExitTimeout.unref();
    server.close(async () => {
        console.log('🔒 Express HTTP server closed. Closing MariaDB connection pool...');
        try {
            if (db_js_1.pool && typeof db_js_1.pool.end === 'function') {
                await db_js_1.pool.end();
            }
            console.log('✅ MariaDB pool closed cleanly. Process exiting.');
            process.exit(0);
        }
        catch (err) {
            console.error('❌ Error closing MariaDB pool:', err);
            process.exit(1);
        }
    });
};
if (process.env.NODE_ENV !== 'test') {
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}
exports.default = app;
