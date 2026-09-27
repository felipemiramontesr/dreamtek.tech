import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  CUTOFF_MIGRATION_NUMBER,
  FROZEN_HISTORICAL_MIGRATIONS,
  CANONICAL_MIGRATION_REGEX,
  isValidGregorianDate,
  validateSqlHeader,
  verifyMigrationFile,
  verifyMigrationsDirectory,
  runCli,
} from '../../../scripts/verifyMigrations.mjs';

describe('verifyMigrations Suite (FC 054)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dreamtek-migration-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  describe('Constantes y Esquema Canónico', () => {
    it('debe tener punto de corte exactamente en 49', () => {
      expect(CUTOFF_MIGRATION_NUMBER).toBe(49);
    });

    it('debe tener exactamente 48 migraciones históricas congeladas', () => {
      expect(FROZEN_HISTORICAL_MIGRATIONS).toHaveLength(48);
      expect(FROZEN_HISTORICAL_MIGRATIONS[0]).toBe('001_initial_schema.sql');
      expect(FROZEN_HISTORICAL_MIGRATIONS[47]).toBe('048_client_notifications_and_webhooks.sql');
    });

    it('debe validar la estructura regex canónica', () => {
      const valid = '049_V0.1.104_FC054-F1_20260926_test_migration.sql';
      expect(CANONICAL_MIGRATION_REGEX.test(valid)).toBe(true);

      const invalidNoVersion = '049_FC054-F1_20260926_test_migration.sql';
      expect(CANONICAL_MIGRATION_REGEX.test(invalidNoVersion)).toBe(false);

      const invalidUppercaseDesc = '049_V0.1.104_FC054-F1_20260926_Test_Migration.sql';
      expect(CANONICAL_MIGRATION_REGEX.test(invalidUppercaseDesc)).toBe(false);
    });
  });

  describe('isValidGregorianDate', () => {
    it('debe aceptar fechas válidas en formato AAAAMMDD', () => {
      expect(isValidGregorianDate('20260926')).toBe(true);
      expect(isValidGregorianDate('20240229')).toBe(true); // Bisiesto
      expect(isValidGregorianDate('20231231')).toBe(true);
    });

    it('debe rechazar formatos que no tengan 8 dígitos', () => {
      expect(isValidGregorianDate('2026926')).toBe(false);
      expect(isValidGregorianDate('2026-09-26')).toBe(false);
      expect(isValidGregorianDate('abcdefgh')).toBe(false);
    });

    it('debe rechazar meses fuera de rango (1-12)', () => {
      expect(isValidGregorianDate('20260015')).toBe(false);
      expect(isValidGregorianDate('20261315')).toBe(false);
    });

    it('debe rechazar días fuera de rango (1-31)', () => {
      expect(isValidGregorianDate('20260500')).toBe(false);
      expect(isValidGregorianDate('20260532')).toBe(false);
    });

    it('debe rechazar días imposibles según el mes y año (calendario gregoriano)', () => {
      expect(isValidGregorianDate('20260229')).toBe(false); // 2026 no es bisiesto
      expect(isValidGregorianDate('20260231')).toBe(false);
      expect(isValidGregorianDate('20260431')).toBe(false); // Abril tiene 30 días
      expect(isValidGregorianDate('20260631')).toBe(false); // Junio tiene 30 días
    });
  });

  describe('validateSqlHeader', () => {
    it('debe validar cabeceras correctas con viñeta, punto o guion', () => {
      expect(validateSqlHeader('-- FC054-F1 · 2026-09-26', 'FC054-F1', '20260926').valid).toBe(
        true,
      );
      expect(validateSqlHeader('-- FC054 • 2026-09-26', 'FC054', '20260926').valid).toBe(true);
      expect(validateSqlHeader('-- FC054-F3 - 2026-09-26', 'FC054-F3', '20260926').valid).toBe(
        true,
      );
    });

    it('debe rechazar si la primera línea no empieza con --', () => {
      const res = validateSqlHeader('CREATE TABLE test;', 'FC054-F1', '20260926');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('debe ser un comentario');
    });

    it('debe rechazar si la primera línea no tiene el formato de cabecera', () => {
      const res = validateSqlHeader(
        '-- Archivo de migración sin milestone',
        'FC054-F1',
        '20260926',
      );
      expect(res.valid).toBe(false);
      expect(res.error).toContain('Formato de cabecera inválido');
    });

    it('debe rechazar si el milestone no coincide', () => {
      const res = validateSqlHeader('-- FC050-F1 · 2026-09-26', 'FC054-F1', '20260926');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('Milestone en cabecera');
    });

    it('debe rechazar si la fecha no coincide', () => {
      const res = validateSqlHeader('-- FC054-F1 · 2026-09-25', 'FC054-F1', '20260926');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('Fecha en cabecera');
    });
  });

  describe('verifyMigrationFile', () => {
    it('debe reconocer archivos congelados históricos', () => {
      const res = verifyMigrationFile('001_initial_schema.sql');
      expect(res.valid).toBe(true);
      expect(res.isHistorical).toBe(true);
    });

    it('debe fallar si el nombre no inicia con 3 dígitos NNN_', () => {
      const res = verifyMigrationFile('bad_migration.sql');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('NOMBRE_INVALIDO');
    });

    it('debe fallar si hay un archivo con número < 49 que no está en la lista congelada', () => {
      const res = verifyMigrationFile('030_unknown_patch.sql');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('CUTOFF_VIOLATION');
    });

    it('debe fallar si el archivo >= 49 no cumple el regex canónico', () => {
      const res = verifyMigrationFile('049_mal_formato.sql');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('FORMATO_INVALIDO');
    });

    it('debe fallar si el archivo >= 49 tiene fecha inexistente', () => {
      const res = verifyMigrationFile(
        '049_V0.1.104_FC054-F1_20260231_test.sql',
        '-- FC054-F1 · 2026-02-31\nCREATE TABLE test;',
      );
      expect(res.valid).toBe(false);
      expect(res.error).toContain('FECHA_INVALIDA');
    });

    it('debe fallar si la cabecera SQL es inválida o no coincide', () => {
      const res = verifyMigrationFile(
        '049_V0.1.104_FC054-F1_20260926_test.sql',
        '-- FC001-F1 · 2026-09-26\nCREATE TABLE test;',
      );
      expect(res.valid).toBe(false);
      expect(res.error).toContain('CABECERA_INVALIDA');
    });

    it('debe validar exitosamente una migración canónica con cabecera correcta', () => {
      const res = verifyMigrationFile(
        '049_V0.1.104_FC054-F1_20260926_test_lock.sql',
        '-- FC054-F1 · 2026-09-26\nCREATE TABLE test;',
      );
      expect(res.valid).toBe(true);
      expect(res.isHistorical).toBe(false);
      expect(res.details?.number).toBe(49);
      expect(res.details?.milestone).toBe('FC054-F1');
    });

    it('debe leer el contenido desde migrationsDir si fileContent es null', () => {
      const filePath = path.join(tempDir, '049_V0.1.104_FC054-F1_20260926_test_disk.sql');
      fs.writeFileSync(filePath, '-- FC054-F1 · 2026-09-26\nCREATE TABLE test;', 'utf8');

      const res = verifyMigrationFile(
        '049_V0.1.104_FC054-F1_20260926_test_disk.sql',
        null,
        tempDir,
      );
      expect(res.valid).toBe(true);
      expect(res.isHistorical).toBe(false);
    });
  });

  describe('verifyMigrationsDirectory', () => {
    it('debe retornar error si el directorio no existe', () => {
      const nonExistent = path.join(tempDir, 'does-not-exist');
      const res = verifyMigrationsDirectory(nonExistent);
      expect(res.valid).toBe(false);
      expect(res.errors[0]).toContain('Directorio no encontrado');
    });

    it('debe retornar error si el directorio está vacío', () => {
      const emptyDir = path.join(tempDir, 'empty');
      fs.mkdirSync(emptyDir);
      const res = verifyMigrationsDirectory(emptyDir);
      expect(res.valid).toBe(false);
      expect(res.errors[0]).toContain('No se encontraron archivos');
    });

    it('debe detectar números duplicados en el directorio', () => {
      fs.writeFileSync(path.join(tempDir, '001_initial_schema.sql'), 'CREATE TABLE a;', 'utf8');
      fs.writeFileSync(path.join(tempDir, '001_dup_schema.sql'), 'CREATE TABLE b;', 'utf8');

      const res = verifyMigrationsDirectory(tempDir);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes('NUMERO_DUPLICADO'))).toBe(true);
    });

    it('debe detectar saltos en la monotonicidad', () => {
      fs.writeFileSync(path.join(tempDir, '001_initial_schema.sql'), 'CREATE TABLE a;', 'utf8');
      fs.writeFileSync(
        path.join(tempDir, '003_leads_and_templates.sql'),
        'CREATE TABLE c;',
        'utf8',
      );

      const res = verifyMigrationsDirectory(tempDir);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes('SECUENCIA_ROTA'))).toBe(true);
    });

    it('debe validar un directorio sintético con archivos históricos y canónicos', () => {
      // 001 histórico
      fs.writeFileSync(path.join(tempDir, '001_initial_schema.sql'), 'CREATE TABLE a;', 'utf8');
      // 002 histórico
      fs.writeFileSync(
        path.join(tempDir, '002_sessions_and_rate_limit.sql'),
        'CREATE TABLE b;',
        'utf8',
      );

      const res = verifyMigrationsDirectory(tempDir);
      expect(res.valid).toBe(true);
      expect(res.verifiedCount).toBe(2);
      expect(res.historicalCount).toBe(2);
    });

    it('debe validar las migraciones reales del repositorio de Dreamtek', () => {
      const realMigrationsDir = path.join(process.cwd(), 'database', 'migrations');
      const res = verifyMigrationsDirectory(realMigrationsDir);
      expect(res.valid).toBe(true);
      expect(res.totalFiles).toBeGreaterThanOrEqual(48);
      expect(res.historicalCount).toBe(48);
      expect(res.errors).toHaveLength(0);
    });
  });

  describe('runCli', () => {
    it('debe retornar 0 en ejecución normal sobre el repo real', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const code = runCli([]);
      expect(code).toBe(0);
      expect(logSpy).toHaveBeenCalled();
    });

    it('debe retornar 0 en modo --file para un archivo histórico válido', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const code = runCli(['--file', '001_initial_schema.sql']);
      expect(code).toBe(0);
      expect(logSpy).toHaveBeenCalled();
    });

    it('debe retornar 1 en modo --file si el archivo no existe', () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const code = runCli(['--file', '999_non_existent.sql']);
      expect(code).toBe(1);
      expect(errSpy).toHaveBeenCalled();
    });

    it('debe retornar 1 en modo --file si el archivo es inválido', () => {
      const badFile = path.join(tempDir, 'bad_migration.sql');
      fs.writeFileSync(badFile, 'CREATE TABLE foo;', 'utf8');

      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const code = runCli(['--file', badFile]);
      expect(code).toBe(1);
      expect(errSpy).toHaveBeenCalled();
    });

    it('debe retornar 1 en escaneo general si hay errores en el directorio', () => {
      // Mock process.cwd() apuntando a tempDir con errores
      const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tempDir);
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const code = runCli([]);
      expect(code).toBe(1);
      expect(errSpy).toHaveBeenCalled();
      cwdSpy.mockRestore();
    });
  });
});
