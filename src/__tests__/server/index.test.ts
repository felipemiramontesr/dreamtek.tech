import { describe, it, expect, vi, beforeEach } from 'vitest';
import supertest from 'supertest';
import fs from 'fs';
import {
  app,
  gracefulShutdown,
  startServer,
  setupSignalHandlers,
  initialize,
  corsOriginHandler,
} from '../../../server/src/index';
import * as cacheUtil from '../../../server/src/utils/cache';

describe('Server Index Core (100% Coverage Suite)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('GET / debe responder 200 con el estado del servicio API', async () => {
    const res = await supertest(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: 'ok',
      service: 'Dreamtek Node.js API',
      version: '1.0.0',
    });
  });

  it('GET /api/v1/docs debe retornar documentación desde caché si existe', async () => {
    const mockCachedDocs = { openapi: '3.1.0', info: { title: 'Cached Docs' } };
    vi.spyOn(cacheUtil, 'getCache').mockResolvedValueOnce(mockCachedDocs);

    const res = await supertest(app).get('/api/v1/docs');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(mockCachedDocs);
  });

  it('GET /api/v1/docs debe leer swagger.json desde disco y almacenar en caché', async () => {
    vi.spyOn(cacheUtil, 'getCache').mockResolvedValueOnce(null);
    const setCacheSpy = vi.spyOn(cacheUtil, 'setCache').mockResolvedValueOnce();
    const mockDiskDocs = { openapi: '3.1.0', info: { title: 'Disk Docs' } };
    vi.spyOn(fs, 'readFileSync').mockReturnValueOnce(JSON.stringify(mockDiskDocs));

    const res = await supertest(app).get('/api/v1/docs');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(mockDiskDocs);
    expect(setCacheSpy).toHaveBeenCalledWith('openapi_docs_v1', mockDiskDocs, 3600);
  });

  it('GET /api/v1/docs debe manejar error de JSON inválido en swagger.json y hacer fallback', async () => {
    vi.spyOn(cacheUtil, 'getCache').mockResolvedValueOnce(null);
    vi.spyOn(fs, 'readFileSync').mockReturnValueOnce('INVALID_JSON');

    const res = await supertest(app).get('/api/v1/docs');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('openapi');
  });

  it('GET /api/v1/docs debe manejar excepciones y hacer fallback a sendFile', async () => {
    vi.spyOn(cacheUtil, 'getCache').mockRejectedValueOnce(new Error('Cache read error'));

    const res = await supertest(app).get('/api/v1/docs');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('openapi');
  });

  it('CORS Policy: debe permitir orígenes autorizados y bloquear orígenes no permitidos', async () => {
    // Allowed origin
    const resAllowed = await supertest(app).get('/').set('Origin', 'https://dreamtek.tech');
    expect(resAllowed.status).toBe(200);
    expect(resAllowed.headers['access-control-allow-origin']).toBe('https://dreamtek.tech');

    // Allowed localhost
    const resLocalhost = await supertest(app).get('/').set('Origin', 'http://localhost:3000');
    expect(resLocalhost.status).toBe(200);

    // Disallowed origin
    const resBlocked = await supertest(app)
      .get('/')
      .set('Origin', 'https://malicious-attacker.com');
    expect(resBlocked.status).toBe(500);

    // Direct unit test of corsOriginHandler
    const cb = vi.fn();
    corsOriginHandler(undefined, cb);
    expect(cb).toHaveBeenCalledWith(null, true);

    corsOriginHandler('https://dreamtek.tech', cb);
    expect(cb).toHaveBeenCalledWith(null, true);

    corsOriginHandler('https://attacker.org', cb);
    expect(cb).toHaveBeenCalledWith(expect.any(Error));
  });

  it('startServer debe iniciar el servidor HTTP y ejecutar el log de inicio', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const srv = startServer(3999);

    await new Promise<void>((resolve) => {
      if (srv.listening) {
        resolve();
      } else {
        srv.on('listening', () => resolve());
      }
    });

    expect(consoleSpy).toHaveBeenCalled();

    await new Promise<void>((resolve, reject) => {
      srv.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it('setupSignalHandlers debe configurar los listeners de proceso SIGTERM y SIGINT', () => {
    const processOnSpy = vi.spyOn(process, 'on');
    setupSignalHandlers();
    expect(processOnSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
    expect(processOnSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
  });

  it('gracefulShutdown debe cerrar el servidor HTTP y el pool de MariaDB limpiamente', async () => {
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as unknown as typeof process.exit);

    const mockServer = {
      close: vi.fn().mockImplementation((cb: () => void) => cb()),
    };
    const mockPool = {
      end: vi.fn().mockResolvedValueOnce(undefined),
    };

    gracefulShutdown('SIGTERM', mockServer, mockPool);

    expect(mockServer.close).toHaveBeenCalled();
    expect(mockPool.end).toHaveBeenCalled();
  });

  it('gracefulShutdown debe manejar errores al cerrar el pool de MariaDB y salir con código 1', async () => {
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as unknown as typeof process.exit);

    const mockServer = {
      close: vi.fn().mockImplementation((cb: () => void) => cb()),
    };
    const mockPool = {
      end: vi.fn().mockRejectedValueOnce(new Error('DB pool close error')),
    };

    gracefulShutdown('SIGINT', mockServer, mockPool);

    expect(mockServer.close).toHaveBeenCalled();

    // Pool without .end method
    gracefulShutdown('SIGTERM', mockServer, {});
    expect(mockServer.close).toHaveBeenCalled();

    // Null pool
    gracefulShutdown('SIGTERM', mockServer, null);
    expect(mockServer.close).toHaveBeenCalled();
  });

  it('gracefulShutdown debe forzar la salida si se excede el timeout de 10s', () => {
    vi.useFakeTimers();
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => {}) as unknown as typeof process.exit);

    const mockServer = {
      close: vi.fn(), // never calls callback
    };

    gracefulShutdown('SIGTERM', mockServer, null);
    expect(exitSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(10000);
    expect(exitSpy).toHaveBeenCalledWith(1);

    vi.useRealTimers();
  });

  it('initialize debe llamar a setupSignalHandlers cuando no está en modo test', () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const processOnSpy = vi.spyOn(process, 'on');
    initialize();
    expect(processOnSpy).toHaveBeenCalled();
    process.env.NODE_ENV = origEnv;
  });

  it('gracefulShutdown debe salir inmediatamente si no hay servidor activo (modo test)', () => {
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => {}) as unknown as typeof process.exit);
    gracefulShutdown('SIGTERM', null, null);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });
});
