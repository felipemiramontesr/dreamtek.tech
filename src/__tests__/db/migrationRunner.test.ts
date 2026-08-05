import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { computeChecksum } from '../../../scripts/migrate.mjs';

describe('FC 001k Production DB Migration Runner Suite', () => {
  it('debe existir el script ejecutor scripts/migrate.mjs y el workflow .github/workflows/db-migrate.yml', () => {
    const migrateScriptPath = path.join(process.cwd(), 'scripts', 'migrate.mjs');
    const workflowPath = path.join(process.cwd(), '.github', 'workflows', 'db-migrate.yml');

    expect(fs.existsSync(migrateScriptPath)).toBe(true);
    expect(fs.existsSync(workflowPath)).toBe(true);

    const workflowContent = fs.readFileSync(workflowPath, 'utf-8');
    expect(workflowContent).toContain('runs-on: self-hosted');
    expect(workflowContent).toContain('3307:127.0.0.1:3306');
    expect(workflowContent).toContain('dry_run');
  });

  it('computeChecksum debe calcular un hash SHA-256 determinista de 64 caracteres hex', () => {
    const sampleContent = 'CREATE TABLE test (id INT);';
    const hash1 = computeChecksum(sampleContent);
    const hash2 = computeChecksum(sampleContent);

    expect(hash1).toHaveLength(64);
    expect(hash1).toBe(hash2);
  });

  it('debe verificar y calcular los checksums SHA-256 de todas las migraciones en database/migrations/', () => {
    const migrationsDir = path.join(process.cwd(), 'database', 'migrations');
    expect(fs.existsSync(migrationsDir)).toBe(true);

    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort((a, b) => a.localeCompare(b));

    expect(files.length).toBeGreaterThanOrEqual(4);

    for (const filename of files) {
      const filePath = path.join(migrationsDir, filename);
      const sqlContent = fs.readFileSync(filePath, 'utf-8');
      const checksum = computeChecksum(sqlContent);

      expect(checksum).toHaveLength(64);
      expect(sqlContent.length).toBeGreaterThan(0);
    }
  });

  it('el script migrate.mjs debe soportar la bandera --dry-run y enrutamiento 127.0.0.1:3307', () => {
    const migrateScriptPath = path.join(process.cwd(), 'scripts', 'migrate.mjs');
    const scriptContent = fs.readFileSync(migrateScriptPath, 'utf-8');

    expect(scriptContent).toContain('--dry-run');
    expect(scriptContent).toContain('3307');
    expect(scriptContent).toContain('schema_migrations');
    expect(scriptContent).toContain('CHECKSUM MISMATCH HALT');
  });
});
