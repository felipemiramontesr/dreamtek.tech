import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import path from 'path';

import { globalRateLimiter, sensitiveEndpointLimiter } from './middleware/rateLimiter.js';
import { healthRouter, setShuttingDownState } from './routes/health.js';
import { authRouter } from './routes/auth.js';
import { onboardingRouter } from './routes/onboarding.js';
import { checkoutRouter } from './routes/checkout.js';
import { clientRouter } from './routes/client.js';
import { adminRouter } from './routes/admin.js';
import { contactRouter } from './routes/contact.js';
import { pool } from './db.js';

dotenv.config({ path: path.join(__dirname, '../.env') });

const app = express();
const PORT = process.env.PORT || 3001;

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

// CORS Fail-Closed Allowlist Setup (Condition C-H4)
const allowedOrigins = [
  'http://localhost:3000',
  'https://dreamtek.tech',
  'https://www.dreamtek.tech',
];

if (process.env.CORS_ORIGIN) {
  allowedOrigins.push(process.env.CORS_ORIGIN);
}

app.use(
  cors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('CORS Policy: Origin not allowed by Access-Control-Allow-Origin'));
    },
    credentials: true,
  })
);

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

// OpenAPI 3.1 Documentation Endpoint (FC 001i)
app.get('/api/v1/docs', (_req, res) => {
  res.sendFile(path.join(__dirname, 'docs/openapi.json'));
});

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

// Start HTTP Server
const server = app.listen(PORT, () => {
  console.log(`🚀 Dreamtek Node.js API Server running on port ${PORT}`);
});

// Graceful Shutdown Logic (Condition C-J3)
const gracefulShutdown = (signal: string) => {
  console.log(`\n⚠️ Received ${signal}. Starting Graceful Shutdown...`);
  setShuttingDownState(true);

  // Condition C-J3: 10-second fallback forced exit timer unref'd
  const forceExitTimeout = setTimeout(() => {
    console.error('❌ Graceful shutdown timed out (10s). Forcing process exit.');
    process.exit(1);
  }, 10000);
  forceExitTimeout.unref();

  server.close(async () => {
    console.log('🔒 Express HTTP server closed. Closing MariaDB connection pool...');
    try {
      if (pool && typeof pool.end === 'function') {
        await pool.end();
      }
      console.log('✅ MariaDB pool closed cleanly. Process exiting.');
      process.exit(0);
    } catch (err) {
      console.error('❌ Error closing MariaDB pool:', err);
      process.exit(1);
    }
  });
};

if (process.env.NODE_ENV !== 'test') {
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

export default app;
