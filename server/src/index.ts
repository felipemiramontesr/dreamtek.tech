import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import path from 'path';

import { healthRouter } from './routes/health.js';
import { authRouter } from './routes/auth.js';
import { onboardingRouter } from './routes/onboarding.js';
import { checkoutRouter } from './routes/checkout.js';
import { clientRouter } from './routes/client.js';
import { adminRouter } from './routes/admin.js';

dotenv.config({ path: path.join(__dirname, '../.env') });

const app = express();
const PORT = process.env.PORT || 3001;

// CORS setup
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
        callback(null, true);
      } else {
        callback(null, true);
      }
    },
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Subruta principal del API
app.use('/api/v1', healthRouter);
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/onboarding', onboardingRouter);
app.use('/api/v1/checkout', checkoutRouter);
app.use('/api/v1/client', clientRouter);
app.use('/api/v1/admin', adminRouter);

app.listen(PORT, () => {
  console.log(`🚀 Dreamtek Node.js API Server running on port ${PORT}`);
});

export default app;
