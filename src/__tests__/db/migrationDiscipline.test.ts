import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('FC 048 Sovereign Database Migrations Discipline & Workflow Suite', () => {
  const migrationsDir = path.join(process.cwd(), 'database', 'migrations');
  const workflowPath = path.join(process.cwd(), '.github', 'workflows', 'db-migrations.yml');

  it('debe existir el nuevo workflow soberano .github/workflows/db-migrations.yml', () => {
    expect(fs.existsSync(workflowPath)).toBe(true);

    const workflowContent = fs.readFileSync(workflowPath, 'utf-8');
    // Condición C-1: Exclusivamente workflow_dispatch
    expect(workflowContent).toContain('workflow_dispatch:');
    expect(workflowContent).not.toMatch(/^\s*push:/m);
    expect(workflowContent).not.toMatch(/^\s*pull_request:/m);
    expect(workflowContent).not.toMatch(/^\s*schedule:/m);

    // Condición C-2: Un archivo por run
    expect(workflowContent).toContain('migration_file:');

    // Condición C-3: Environment production-db
    expect(workflowContent).toContain('environment: production-db');

    // Condición C-4: Formal Gate T1.A (Charset allowlist)
    expect(workflowContent).toContain('^[0-9]{3}_[a-z0-9_]+\\.sql$');
    expect(workflowContent).toContain('git ls-files');

    // Condición C-5: Formal Gate T1.B (AES-256-CBC backup pre-vuelo >= 1024 bytes)
    expect(workflowContent).toContain('DB_BACKUP_ENCRYPTION_KEY');
    expect(workflowContent).toContain('openssl enc -aes-256-cbc');
    expect(workflowContent).toContain('-lt 1024');

    // Condición C-7: Túnel SSH con StrictHostKeyChecking=accept-new (TOFU)
    expect(workflowContent).toContain('StrictHostKeyChecking=accept-new');

    // Condición C-6: Concurrency sin matar runs
    expect(workflowContent).toContain('group: db-migrations-prod');
    expect(workflowContent).toContain('cancel-in-progress: false');
  });

  it('todos los archivos en database/migrations/ deben cumplir el formato soberano NNN_snake_case.sql', () => {
    expect(fs.existsSync(migrationsDir)).toBe(true);

    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
    expect(files.length).toBeGreaterThanOrEqual(45);

    const regex = /^[0-9]{3}_[a-z0-9_]+\.sql$/;
    for (const file of files) {
      expect(file).toMatch(regex);
    }
  });

  it('la secuencia de migraciones debe ser monótona creciente y sin duplicidad de prefijos NNN', () => {
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort((a, b) => a.localeCompare(b));

    const prefixes = files.map((f) => f.slice(0, 3));
    const uniquePrefixes = new Set(prefixes);

    // 1 archivo = 1 número (sin colisiones NNN_a, NNN_b)
    expect(uniquePrefixes.size).toBe(files.length);

    // Comienza en 001 y es secuencialmente coherente
    expect(prefixes[0]).toBe('001');
  });

  it('las migraciones no deben contener consultas peligrosas sin WHERE ni SELECT * con PII', () => {
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));

    for (const file of files) {
      const content = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');

      // Prohibir SELECT * en tablas de usuarios o sesiones
      expect(content).not.toMatch(/SELECT\s+\*\s+FROM\s+[`'"]?users[`'"]?/i);
      expect(content).not.toMatch(/SELECT\s+\*\s+FROM\s+[`'"]?user_sessions[`'"]?/i);

      // Prohibir passwords en claro
      expect(content).not.toMatch(/password\s*=\s*['"][^'"]{1,15}['"]/i);
    }
  });

  it('el validador formal T1.A debe rechazar nombres maliciosos y aceptar nombres válidos', () => {
    const regex = /^[0-9]{3}_[a-z0-9_]+\.sql$/;

    // Válidos
    expect(regex.test('001_initial_schema.sql')).toBe(true);
    expect(regex.test('045_auth_mfa_2fa.sql')).toBe(true);
    expect(regex.test('046_future_migration.sql')).toBe(true);

    // Inválidos / Path traversal / Shell injection
    expect(regex.test('../001_exploit.sql')).toBe(false);
    expect(regex.test('001_exploit;rm -rf.sql')).toBe(false);
    expect(regex.test('01_short.sql')).toBe(false);
    expect(regex.test('0001_long.sql')).toBe(false);
    expect(regex.test('001_CamelCase.sql')).toBe(false);
    expect(regex.test('001_spaces in name.sql')).toBe(false);
  });
});
