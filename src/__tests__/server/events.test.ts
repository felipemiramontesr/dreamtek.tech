import { describe, it, expect } from 'vitest';
import request from 'supertest';
import http from 'http';
import { AddressInfo } from 'net';
import jwt from 'jsonwebtoken';
import { Response } from 'express';
import app from '../../../server/src/index';
import { sendSSEEventToUser, activeClients } from '../../../server/src/routes/events';

const JWT_SECRET = process.env.JWT_SECRET || 'dreamtek_dev_jwt_secret_key_2026';

describe('SSE Events Router & Real-Time Emitters (100% Coverage)', () => {
  it('debe rechazar solicitudes no autenticadas con 401', async () => {
    const res = await request(app).get('/api/v1/events');
    expect(res.status).toBe(401);
  });

  it('debe establecer conexión SSE, registrar cliente, emitir eventos y limpiar al desconectar', async () => {
    const validToken = jwt.sign(
      { userId: 'user-sse-stream', email: 'sse@dreamtek.tech', role: 'CLIENT' },
      JWT_SECRET,
      { algorithm: 'HS512' },
    );

    const server = http.createServer(app).listen(0);
    const address = server.address() as AddressInfo;
    const port = address.port;

    await new Promise<void>((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: '/api/v1/events',
          method: 'GET',
          headers: {
            Cookie: `dreamtek_session=${validToken}`,
          },
        },
        (res) => {
          expect(res.statusCode).toBe(200);
          expect(res.headers['content-type']).toContain('text/event-stream');
          expect(res.headers['cache-control']).toContain('no-cache, no-transform');

          // Verificar que el cliente fue registrado en activeClients
          expect(activeClients.has('user-sse-stream')).toBe(true);

          // Probar emisión exitosa con sendSSEEventToUser
          const emitted = sendSSEEventToUser('user-sse-stream', 'NOTIFICATION', {
            text: 'test payload',
          });
          expect(emitted).toBe(true);

          req.destroy();
          server.close(() => resolve());
        },
      );

      req.on('error', (err: Error & { code?: string }) => {
        if (err.code === 'ECONNRESET' || err.message?.includes('aborted')) {
          server.close(() => resolve());
        } else {
          server.close(() => reject(err));
        }
      });

      req.end();
    });
  });

  it('debe retornar false al enviar un evento a un usuario sin conexiones activas', () => {
    const emitted = sendSSEEventToUser('non-existent-user-12345', 'TEST', { ok: true });
    expect(emitted).toBe(false);
  });

  it('debe manejar errores en la escritura del socket y limpiar clientes en sendSSEEventToUser', () => {
    const mockResFaulty = {
      write: () => {
        throw new Error('Socket closed');
      },
    } as unknown as Response;

    if (!activeClients.has('faulty-user')) {
      activeClients.set('faulty-user', new Set());
    }
    activeClients.get('faulty-user')!.add(mockResFaulty);

    const emitted = sendSSEEventToUser('faulty-user', 'TEST', { data: 1 });
    expect(emitted).toBe(false);
    expect(activeClients.has('faulty-user')).toBe(false);
  });

  it('debe manejar multi-conexiones y evento close cuando el usuario ya no existe en el mapa', async () => {
    const { eventsRouter } = await import('../../../server/src/routes/events');
    const getLayer = eventsRouter.stack.find(
      (s: { route?: { path?: string } }) => s.route?.path === '/events',
    );
    const stack = (
      getLayer as unknown as { route: { stack: { handle: (...args: unknown[]) => void }[] } }
    ).route.stack;
    const handler = stack[stack.length - 1].handle;

    // Test without user
    const resNoUser = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    handler({ user: null }, resNoUser);
    expect(resNoUser.status).toHaveBeenCalledWith(401);

    let closeCallback: (() => void) | null = null;
    const mockReq = {
      user: { userId: 'mock-user-close' },
      on: (event: string, cb: () => void) => {
        if (event === 'close') closeCallback = cb;
      },
    };
    const mockRes = {
      setHeader: () => {},
      write: () => {},
    };

    // 1. First connection
    handler(mockReq, mockRes);
    expect(activeClients.has('mock-user-close')).toBe(true);

    // 2. Second connection for same user (branch: activeClients.has is true)
    handler(mockReq, mockRes);

    // 3. Trigger close when set exists with size > 1
    if (closeCallback) (closeCallback as () => void)();

    // 4. Trigger close when set exists with size === 1 (deletes from map)
    if (closeCallback) (closeCallback as () => void)();
    expect(activeClients.has('mock-user-close')).toBe(false);

    // 5. Trigger close when user is no longer in activeClients (branch: !set)
    if (closeCallback) (closeCallback as () => void)();
  });
});
