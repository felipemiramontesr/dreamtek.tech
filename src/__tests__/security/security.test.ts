import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { computeSanitizedPayloadHash } from '../../../server/src/middleware/auditLogger';

describe('FC 001h Security Hardening Suite', () => {
  it('debe existir el script de migración DDL 004_security_audit_logs.sql con la tabla security_audit_logs', () => {
    const migrationPath = path.join(
      process.cwd(),
      'database',
      'migrations',
      '004_security_audit_logs.sql',
    );
    expect(fs.existsSync(migrationPath)).toBe(true);

    const sqlContent = fs.readFileSync(migrationPath, 'utf-8');
    expect(sqlContent).toContain('CREATE TABLE IF NOT EXISTS `security_audit_logs`');
    expect(sqlContent).toContain('`payload_sha256`');
    expect(sqlContent).toContain('`event_type`');
  });

  it('deben existir los middlewares de seguridad rateLimiter.ts y auditLogger.ts', () => {
    const serverMiddlewareDir = path.join(process.cwd(), 'server', 'src', 'middleware');
    expect(fs.existsSync(path.join(serverMiddlewareDir, 'rateLimiter.ts'))).toBe(true);
    expect(fs.existsSync(path.join(serverMiddlewareDir, 'auditLogger.ts'))).toBe(true);
  });

  it('el servidor Express index.ts debe incluir helmet, trust proxy, rate limiters y CORS fail-closed', () => {
    const indexPath = path.join(process.cwd(), 'server', 'src', 'index.ts');
    expect(fs.existsSync(indexPath)).toBe(true);

    const indexContent = fs.readFileSync(indexPath, 'utf-8');
    expect(indexContent).toContain("app.set('trust proxy', 1)");
    expect(indexContent).toContain('helmet(');
    expect(indexContent).toContain('globalRateLimiter');
    expect(indexContent).toContain('sensitiveEndpointLimiter');
    expect(indexContent).toContain("limit: '100kb'");
    expect(indexContent).toContain('CORS Policy: Origin not allowed');
  });

  it('el helper computeSanitizedPayloadHash debe sanitizar contraseñas y calcular hash SHA-256 (Condición C-H6)', () => {
    const rawBody = {
      email: 'test@empresa.com',
      password: 'SuperSecretPassword123!',
      confirmPassword: 'SuperSecretPassword123!',
      secret: 'my_secret_token',
      full_name: 'Juan Perez',
    };

    const hash = computeSanitizedPayloadHash(rawBody);
    expect(hash).not.toBeNull();
    expect(typeof hash).toBe('string');
    expect(hash?.length).toBe(64); // SHA-256 hex length is 64 chars

    // Retesting with different password but same public data should yield SAME hash because password is stripped
    const rawBodySamePublicInfo = {
      email: 'test@empresa.com',
      password: 'DifferentPassword456!',
      confirmPassword: 'DifferentPassword456!',
      secret: 'another_secret',
      full_name: 'Juan Perez',
    };

    const hash2 = computeSanitizedPayloadHash(rawBodySamePublicInfo);
    expect(hash).toBe(hash2);
  });
});
