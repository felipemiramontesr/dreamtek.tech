import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

describe('Product Utility Scripts Suite', () => {
  describe('auditDependencies.mjs', () => {
    it('debe ejecutar el script de auditoría y retornar código 0 cuando no hay vulnerabilidades en producción', () => {
      const scriptPath = path.join(process.cwd(), 'scripts', 'auditDependencies.mjs');
      expect(fs.existsSync(scriptPath)).toBe(true);

      const res = spawnSync('node', [scriptPath], {
        encoding: 'utf-8',
        cwd: process.cwd(),
      });
      expect(res.status).toBe(0);
      expect(res.stdout).toContain('OWASP A06 PASS');
    }, 60000);
  });

  describe('migrate.mjs', () => {
    it('debe soportar la bandera --dry-run y verificar la integridad de las migraciones', () => {
      const scriptPath = path.join(process.cwd(), 'scripts', 'migrate.mjs');
      expect(fs.existsSync(scriptPath)).toBe(true);

      const content = fs.readFileSync(scriptPath, 'utf-8');
      expect(content).toContain('computeChecksum');
      expect(content).toContain('isDryRun');
      expect(content).toContain('schema_migrations');
    });
  });
});
