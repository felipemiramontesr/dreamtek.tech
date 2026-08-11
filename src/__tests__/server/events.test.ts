import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { eventsRouter, sendSSEEventToUser } from '../../../server/src/routes/events';

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/v1', eventsRouter);

const JWT_SECRET = process.env.JWT_SECRET || 'dreamtek_dev_jwt_secret_key_2026';

describe('SSE Events Router & Real-Time Emitters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('debe rechazar solicitudes a GET /api/v1/events sin autenticación (401)', async () => {
    const res = await request(app).get('/api/v1/events');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });

  it('debe establecer conexión SSE con encabezados de streaming y responder con evento connected', async () => {
    const validToken = jwt.sign(
      { userId: 'user-sse-1', email: 'sse@dreamtek.tech', role: 'CLIENT' },
      JWT_SECRET,
      { algorithm: 'HS512' },
    );

    const res = await request(app)
      .get('/api/v1/events')
      .set('Cookie', [`dreamtek_session=${validToken}`]);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.headers['cache-control']).toContain('no-cache');
    expect(res.headers['connection']).toBe('keep-alive');
    expect(res.text).toContain('event: connected');
    expect(res.text).toContain('user-sse-1');
  });

  it('debe retornar false al enviar un evento a un usuario sin conexiones activas', () => {
    const result = sendSSEEventToUser('non-existent-user', 'notification', { text: 'hola' });
    expect(result).toBe(false);
  });
});
