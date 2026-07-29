import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { registerUser, loginUser, logoutUser, getCurrentUser } from '@/lib/auth/client';

describe('Auth Engine & RBAC Verification (FC 001b)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('debe existir el script de migración DDL 002_sessions_and_rate_limit.sql con las tablas sessions y login_attempts', () => {
    const migrationPath = path.join(process.cwd(), 'database', 'migrations', '002_sessions_and_rate_limit.sql');
    expect(fs.existsSync(migrationPath)).toBe(true);

    const sqlContent = fs.readFileSync(migrationPath, 'utf-8');
    expect(sqlContent).toContain('CREATE TABLE IF NOT EXISTS `sessions`');
    expect(sqlContent).toContain('CREATE TABLE IF NOT EXISTS `login_attempts`');
    expect(sqlContent).toContain('CONSTRAINT `fk_sessions_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE');
  });

  it('debe existir el script seed 001_admin_bootstrap.sql con la insercion del rol ADMIN', () => {
    const seedPath = path.join(process.cwd(), 'database', 'seeds', '001_admin_bootstrap.sql');
    expect(fs.existsSync(seedPath)).toBe(true);

    const seedContent = fs.readFileSync(seedPath, 'utf-8');
    expect(seedContent).toContain("INSERT INTO `users`");
    expect(seedContent).toContain("'ADMIN'");
  });

  it('deben existir los endpoints PHP PDO de autenticación y middleware RBAC', () => {
    const apiDir = path.join(process.cwd(), 'public', 'api');
    expect(fs.existsSync(path.join(apiDir, 'auth', 'register.php'))).toBe(true);
    expect(fs.existsSync(path.join(apiDir, 'auth', 'login.php'))).toBe(true);
    expect(fs.existsSync(path.join(apiDir, 'auth', 'logout.php'))).toBe(true);
    expect(fs.existsSync(path.join(apiDir, 'auth', 'me.php'))).toBe(true);
    expect(fs.existsSync(path.join(apiDir, 'middleware', 'auth.php'))).toBe(true);
    expect(fs.existsSync(path.join(apiDir, 'admin', '_ping.php'))).toBe(true);
  });

  it('el cliente TS registerUser debe enviar payload con credentials: include', async () => {
    const mockResponse = {
      message: 'Usuario registrado exitosamente',
      user: { id: 1, email: 'test@empresa.com', full_name: 'Test User', role: 'CLIENT' },
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const result = await registerUser({
      email: 'test@empresa.com',
      password: 'password123',
      full_name: 'Test User',
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/auth/register.php',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
      })
    );
    expect(result.user?.email).toBe('test@empresa.com');
  });

  it('el cliente TS loginUser debe procesar la respuesta de sesion exitosa', async () => {
    const mockResponse = {
      message: 'Inicio de sesion exitoso',
      user: { id: 1, email: 'test@empresa.com', full_name: 'Test User', role: 'CLIENT' },
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const result = await loginUser({
      email: 'test@empresa.com',
      password: 'password123',
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/auth/login.php',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
      })
    );
    expect(result.user?.role).toBe('CLIENT');
  });

  it('el cliente TS loginUser debe manejar errores de credenciales invalidas (HTTP 401)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Credenciales invalidas' }),
    } as Response);

    await expect(loginUser({ email: 'test@empresa.com', password: 'wrong' })).rejects.toThrow(
      'Credenciales invalidas'
    );
  });

  it('el cliente TS loginUser debe manejar bloqueo por rate limiting (HTTP 429)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Demasiados intentos fallidos. Intente de nuevo en 15 minutos.' }),
    } as Response);

    await expect(loginUser({ email: 'test@empresa.com', password: 'wrong' })).rejects.toThrow(
      'Demasiados intentos fallidos.'
    );
  });

  it('el cliente TS getCurrentUser debe solicitar /api/auth/me.php con credentials: include', async () => {
    const mockResponse = {
      user: { id: 1, email: 'test@empresa.com', full_name: 'Test User', role: 'CLIENT' },
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const result = await getCurrentUser();

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/auth/me.php',
      expect.objectContaining({
        method: 'GET',
        credentials: 'include',
      })
    );
    expect(result.user?.id).toBe(1);
  });

  it('el cliente TS getCurrentUser debe arrojar error si no hay sesion activa (HTTP 401)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'No autenticado. Sesion requerida.' }),
    } as Response);

    await expect(getCurrentUser()).rejects.toThrow('No autenticado. Sesion requerida.');
  });

  it('el cliente TS logoutUser debe llamar a /api/auth/logout.php', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: 'Sesion cerrada exitosamente' }),
    } as Response);

    const result = await logoutUser();

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/auth/logout.php',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
      })
    );
    expect(result.message).toBe('Sesion cerrada exitosamente');
  });
});
