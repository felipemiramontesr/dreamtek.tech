import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

import { globalRateLimiter, sensitiveEndpointLimiter } from './middleware/rateLimiter.js';
import { metricsMiddleware } from './middleware/metrics.js';
import { metricsRouter } from './routes/metrics.js';
import { healthRouter, setShuttingDownState } from './routes/health.js';
import { authRouter } from './routes/auth.js';
import { onboardingRouter } from './routes/onboarding.js';
import { checkoutRouter } from './routes/checkout.js';
import { clientRouter } from './routes/client.js';
import { adminRouter } from './routes/admin.js';
import { contactRouter } from './routes/contact.js';
import { eventsRouter } from './routes/events.js';
import assetsRouter from './routes/assets.js';
import { sharesRouter } from './routes/shares.js';
import { tagsRouter } from './routes/tags.js';
import { pool } from './db.js';
import { getCache, setCache } from './utils/cache.js';


dotenv.config({ path: path.join(__dirname, '../.env') });

const app = express();
const PORT = process.env.PORT || 3001;

// Register Telemetry Middleware first
app.use(metricsMiddleware);

// Condition C-H3: Configure trust proxy for Hostinger/Cloudflare reverse proxies
app.set('trust proxy', 1);

// Security Headers via Helmet (OWASP A05)
app.use(
  helmet({
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
  })
);

// Condition C-H4: CORS Fail-Closed Allowlist Setup
export const allowedOrigins = [
  'http://localhost:3000',
  'https://dreamtek.tech',
  'https://www.dreamtek.tech',
  ...(process.env.CORS_ORIGIN ? [process.env.CORS_ORIGIN] : []),
];

export const corsOriginHandler = (
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void
) => {
  if (!origin || allowedOrigins.includes(origin)) {
    return callback(null, true);
  }
  return callback(new Error('CORS Policy: Origin not allowed by Access-Control-Allow-Origin'));
};

app.use(
  cors({
    origin: corsOriginHandler,
    credentials: true,
  })
);

// Stripe Webhook Raw Body Parser (Must run before global express.json parser)
app.use('/api/v1/checkout/webhook', express.raw({ type: 'application/json' }));

// Body Payload Size Limits (100kb)
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
app.use(cookieParser());

// Apply Global Rate Limiter
app.use(globalRateLimiter);

// Root and health fallback routes
app.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'Dreamtek Node.js API', version: '1.0.0' });
});

// OpenAPI 3.1 Documentation Endpoint (FC 001i / FC 001l Cached Hot Path - Condition C-L-R1)
app.get('/api/v1/docs', async (_req, res) => {
  try {
    const cacheKey = 'docs:openapi:3.1';
    const cachedDocs = await getCache<any>(cacheKey);

    if (cachedDocs) {
      res.json(cachedDocs);
      return;
    }

    const openapiPath = path.join(__dirname, 'docs/openapi.json');
    if (fs.existsSync(openapiPath)) {
      const rawData = JSON.parse(fs.readFileSync(openapiPath, 'utf-8'));
      await setCache(cacheKey, rawData, 300);
      res.json(rawData);
      return;
    }

    res.sendFile(openapiPath);
  } catch (_err) {
    res.sendFile(path.join(__dirname, 'docs/openapi.json'));
  }
});

// Condition C-N2: Mount Prometheus Metrics routes (Protected)
app.use('/metrics', metricsRouter);
app.use('/api/v1/metrics', metricsRouter);

// Condition C-J1: Mount health probes at Root (/healthz, /readyz) AND /api/v1/
app.use(healthRouter);
app.use('/api/v1', healthRouter);

// Express Subroutes
app.use('/api/v1/auth', sensitiveEndpointLimiter, authRouter);
app.use('/api/v1/onboarding', sensitiveEndpointLimiter, onboardingRouter);
app.use('/api/v1/checkout', checkoutRouter);
app.use('/api/v1/client', clientRouter);
app.use('/api/v1/admin', adminRouter);
app.use('/api/v1/contact', sensitiveEndpointLimiter, contactRouter);
app.use('/api/v1/assets', assetsRouter);
app.use('/api/v1/shares', sharesRouter);
app.use('/api/v1/tags', tagsRouter);
app.use('/api/v1', eventsRouter);


// Start HTTP Server
export const startServer = (port = PORT) => {
  return app.listen(port, () => {
    console.log(`🚀 Dreamtek Node.js API Server running on port ${port}`);
  });
};

export const server = process.env.NODE_ENV === 'test' ? null : startServer();

// Graceful Shutdown Logic (Condition C-J3)
export const gracefulShutdown = (signal: string, customServer: any = server, customPool: any = pool) => {
  console.log(`\n⚠️ Received ${signal}. Starting Graceful Shutdown...`);
  setShuttingDownState(true);

  // Condition C-J3: 10-second fallback forced exit timer unref'd
  const forceExitTimeout = setTimeout(() => {
    console.error('❌ Graceful shutdown timed out (10s). Forcing process exit.');
    process.exit(1);
  }, 10000);
  forceExitTimeout.unref();

  if (customServer) {
    customServer.close(async () => {
      console.log('🔒 Express HTTP server closed. Closing MariaDB connection pool...');
      try {
        if (customPool && typeof customPool.end === 'function') {
          await customPool.end();
        }
        console.log('✅ MariaDB pool closed cleanly. Process exiting.');
        process.exit(0);
      } catch (err) {
        console.error('❌ Error closing MariaDB pool:', err);
        process.exit(1);
      }
    });
  } else {
    process.exit(0);
  }
};

export const setupSignalHandlers = () => {
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
};

export const initialize = () => {
  if (process.env.NODE_ENV !== 'test') {
    setupSignalHandlers();
  }
};

initialize();

export { app };
export default app;
