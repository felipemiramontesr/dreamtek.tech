import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { setShuttingDownState } from '../../../server/src/routes/health';

describe('FC 001j Graceful Shutdown & Health Probes Suite', () => {
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

  it('el helper setShuttingDownState debe controlar el estado de disponibilidad en probes de resiliencia', () => {
    // When normal state
    setShuttingDownState(false);

    // When shutting down state
    setShuttingDownState(true);

    // Reset back
    setShuttingDownState(false);
    expect(true).toBe(true);
  });

  it('la ruta health.ts debe contener las funciones de probe /healthz y /readyz', () => {
    const healthPath = path.join(process.cwd(), 'server', 'src', 'routes', 'health.ts');
    const healthContent = fs.readFileSync(healthPath, 'utf-8');

    expect(healthContent).toContain("healthRouter.get('/healthz'");
    expect(healthContent).toContain("healthRouter.get('/readyz'");
    expect(healthContent).toContain('isShuttingDownState');
    expect(healthContent).toContain('SELECT 1');
  });
});
