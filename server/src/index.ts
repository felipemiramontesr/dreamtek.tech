import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import path from 'path';

import { globalRateLimiter, sensitiveEndpointLimiter } from './middleware/rateLimiter.js';
import { healthRouter } from './routes/health.js';
import { authRouter } from './routes/auth.js';
import { onboardingRouter } from './routes/onboarding.js';
import { checkoutRouter } from './routes/checkout.js';
import { clientRouter } from './routes/client.js';
import { adminRouter } from './routes/admin.js';
import { contactRouter } from './routes/contact.js';

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
      // Condition C-H4: Allow requests with no origin (cURL, mobile apps, server-to-server)
      if (!origin) {
        return callback(null, true);
      }
      // Allow origins explicitly defined in the allowlist
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      // Fail-closed: Deny unauthorized browser origins
      return callback(new Error('CORS Policy: Origin not allowed by Access-Control-Allow-Origin'));
    },
    credentials: true,
  })
);

// Body Payload Size Limits (100kb to mitigate Payload Flooding / ReDoS)
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
app.use(cookieParser());

// Apply Global Rate Limiter
app.use(globalRateLimiter);

// Root and health fallback routes
app.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'Dreamtek Node.js API', version: '1.0.0' });
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'Dreamtek Node.js API', version: '1.0.0' });
});

// Subruta principal del API
app.use('/api/v1', healthRouter);
app.use('/api/v1/auth', sensitiveEndpointLimiter, authRouter);
app.use('/api/v1/onboarding', sensitiveEndpointLimiter, onboardingRouter);
app.use('/api/v1/checkout', checkoutRouter);
app.use('/api/v1/client', clientRouter);
app.use('/api/v1/admin', adminRouter);
app.use('/api/v1/contact', sensitiveEndpointLimiter, contactRouter);

app.listen(PORT, () => {
  console.log(`🚀 Dreamtek Node.js API Server running on port ${PORT}`);
});

export default app;
