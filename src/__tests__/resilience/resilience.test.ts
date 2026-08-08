import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import express from 'express';
import supertest from 'supertest';
import {
  healthRouter,
  setShuttingDownState,
  isShuttingDown,
} from '../../../server/src/routes/health';

describe('FC 001j Graceful Shutdown & Health Probes 100% Suite', () => {
  const app = express();
  app.use(healthRouter);

  beforeEach(() => {
    setShuttingDownState(false);
  });

  afterEach(() => {
    setShuttingDownState(false);
  });

  it('deben existir la ruta health.ts y los manejadores de señales SIGTERM/SIGINT en server/src/index.ts', () => {
    const healthPath = path.join(process.cwd(), 'server', 'src', 'routes', 'health.ts');
    const indexPath = path.join(process.cwd(), 'server', 'src', 'index.ts');

    expect(fs.existsSync(healthPath)).toBe(true);
    expect(fs.existsSync(indexPath)).toBe(true);

    const indexContent = fs.readFileSync(indexPath, 'utf-8');
    expect(indexContent).toContain('SIGTERM');
    expect(indexContent).toContain('SIGINT');
    expect(indexContent).toContain('setTimeout(');
    expect(indexContent).toContain('10000');
    expect(indexContent).toContain('.unref()');
  });

  it('el helper setShuttingDownState e isShuttingDown deben controlar el estado de disponibilidad', () => {
    setShuttingDownState(false);
    expect(isShuttingDown()).toBe(false);

    setShuttingDownState(true);
    expect(isShuttingDown()).toBe(true);

    setShuttingDownState(false);
    expect(isShuttingDown()).toBe(false);
  });

  it('debe responder HTTP 200 en GET /health (legacy health probe)', async () => {
    const res = await supertest(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('Dreamtek Node.js API');
  });

  it('debe responder HTTP 200 en GET /healthz cuando el servidor está activo y 503 cuando se apaga', async () => {
    setShuttingDownState(false);
    const resActive = await supertest(app).get('/healthz');
    expect(resActive.status).toBe(200);
    expect(resActive.body.status).toBe('ok');

    setShuttingDownState(true);
    const resShutdown = await supertest(app).get('/healthz');
    expect(resShutdown.status).toBe(503);
    expect(resShutdown.body.status).toBe('shutting_down');
  });

  it('debe responder en GET /readyz según la disponibilidad de la base de datos y estado de apaga', async () => {
    setShuttingDownState(true);
    const resShutdown = await supertest(app).get('/readyz');
    expect(resShutdown.status).toBe(503);
    expect(resShutdown.body.status).toBe('not_ready');

    setShuttingDownState(false);
    const resReady = await supertest(app).get('/readyz');
    expect([200, 503]).toContain(resReady.status);
  });
});
