import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

describe('Scripts Unit & Behavioral Harness Suite (FC 001t)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dreamtek-scripts-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('auditDependencies.mjs', () => {
    it('debe ejecutar el script de auditoría y retornar código 0 cuando no hay vulnerabilidades en producción', () => {
      const scriptPath = path.join(process.cwd(), 'scripts', 'auditDependencies.mjs');
      const res = spawnSync('node', [scriptPath], {
        encoding: 'utf-8',
        cwd: process.cwd(),
      });
      expect(res.status).toBe(0);
      expect(res.stdout).toContain('OWASP A06 PASS');
    }, 60000);
  });

  describe('hCheck.mjs', () => {
    it('debe validar la higiene de Canal H con éxito en el proyecto activo', () => {
      const scriptPath = path.join(process.cwd(), 'scripts', 'hCheck.mjs');
      const res = spawnSync('node', [scriptPath, '--last', '5'], {
        encoding: 'utf-8',
        cwd: process.cwd(),
      });
      expect(res.status).toBe(0);
      expect(res.stdout).toContain('[OK] hCheck:');
    });

    it('debe fallar si el archivo 002_NS_Handoff.md no existe en el cwd', () => {
      const scriptPath = path.join(process.cwd(), 'scripts', 'hCheck.mjs');
      const res = spawnSync('node', [scriptPath], {
        encoding: 'utf-8',
        cwd: tempDir,
      });
      expect(res.status).toBe(1);
      expect(res.stderr).toContain('H missing');
    });

    it('debe detectar violaciones de dieta en copias temporales aisladas', () => {
      const scriptPath = path.join(process.cwd(), 'scripts', 'hCheck.mjs');
      const protocolsDir = path.join(tempDir, 'protocols', 'north-star');
      fs.mkdirSync(protocolsDir, { recursive: true });

      const invalidH = `# HANDOFF
Cursores: Alfa=2026-08-19 10:00:00

---

### Alfa · 2026-08-19 10:00:00

Line 1
Line 2
Line 3
Line 4
Line 5
Line 6
Line 7
`;
      fs.writeFileSync(path.join(protocolsDir, '002_NS_Handoff.md'), invalidH, 'utf-8');

      const res = spawnSync('node', [scriptPath, '--strict'], {
        encoding: 'utf-8',
        cwd: tempDir,
      });
      expect(res.status).toBe(1);
      expect(res.stderr).toContain('diet 7>6 lines');
    });
  });

  describe('hPost.mjs', () => {
    it('debe agregar un mensaje correctamente en un archivo H temporal sin mutar el Handoff real', () => {
      const scriptPath = path.join(process.cwd(), 'scripts', 'hPost.mjs');
      const protocolsDir = path.join(tempDir, 'protocols', 'north-star');
      fs.mkdirSync(protocolsDir, { recursive: true });

      fs.writeFileSync(
        path.join(tempDir, 'l-harness.config.json'),
        JSON.stringify({
          agents: [{ name: 'Alfa' }, { name: 'Bravo' }, { name: 'Charlie' }],
          omega: { alias: 'GrayMan' },
        }),
        'utf-8',
      );

      const initialH = `# HANDOFF: GrayMan | Alfa | Bravo | Charlie
Cursores        : Alfa=2026-08-19 10:00:00· Bravo=2026-08-19 10:00:00· Charlie=2026-08-19 10:00:00· Ω=2026-08-19 10:00:00

---

### Alfa · 2026-08-19 10:00:00

Initial test post.
`;
      fs.writeFileSync(path.join(protocolsDir, '002_NS_Handoff.md'), initialH, 'utf-8');

      const res = spawnSync(
        'node',
        [
          scriptPath,
          '--host',
          'Antigravity',
          '--as',
          'Charlie',
          '--message',
          'Test isolated post from unit harness.',
        ],
        {
          encoding: 'utf-8',
          cwd: tempDir,
        },
      );

      expect(res.status).toBe(0);
      expect(res.stdout).toContain('[OK] APPEND');

      const updatedContent = fs.readFileSync(path.join(protocolsDir, '002_NS_Handoff.md'), 'utf-8');
      expect(updatedContent).toContain('Test isolated post from unit harness.');
      expect(updatedContent).toContain('Charlie');
    });

    it('debe rechazar mensajes con autor no permitido o cabeceras prohibidas', () => {
      const scriptPath = path.join(process.cwd(), 'scripts', 'hPost.mjs');
      const res = spawnSync(
        'node',
        [scriptPath, '--author', 'InvalidHost', '--message', 'Test forbidden author'],
        {
          encoding: 'utf-8',
          cwd: process.cwd(),
        },
      );
      expect(res.status).toBe(1);
    });
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

  describe('olrSign.mjs & verifyL.mjs', () => {
    it('debe soportar la firma OLR en un archivo FC temporal aislado', () => {
      const olrPath = path.join(process.cwd(), 'scripts', 'olrSign.mjs');
      const fcDir = path.join(tempDir, 'protocols', 'fc');
      fs.mkdirSync(fcDir, { recursive: true });

      const sampleFcPath = path.join(fcDir, '999_FC_Test_Feature.md');
      fs.writeFileSync(
        sampleFcPath,
        `# 999_FC_Test_Feature\n\n> **Requires OLR:** Yes\n\n- [ ] O\n- [ ] L\n- [ ] R\n`,
        'utf-8',
      );

      const res = spawnSync(
        'node',
        [olrPath, '--fc', '999', '--filter', 'L', '--signer', 'GrayMan'],
        {
          encoding: 'utf-8',
          cwd: tempDir,
        },
      );

      expect(res.status).toBe(0);
      expect(res.stdout).toContain('[OK] OLR L signed by GrayMan');

      const signedContent = fs.readFileSync(sampleFcPath, 'utf8');
      expect(signedContent).toContain('- [x] L');
      expect(signedContent).toContain('GrayMan');
    });

    it('debe validar la estructura y ejecución de verifyL.mjs', () => {
      const verifyPath = path.join(process.cwd(), 'scripts', 'verifyL.mjs');
      expect(fs.existsSync(verifyPath)).toBe(true);

      const verifyRes = spawnSync('node', [verifyPath], {
        encoding: 'utf-8',
        cwd: process.cwd(),
      });
      expect(verifyRes.status).toBe(0);
      expect(verifyRes.stdout).toContain('verifyL: all checks passed');
    });
  });
});
