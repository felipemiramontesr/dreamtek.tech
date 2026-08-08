import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerUser, loginUser, logoutUser, getCurrentUser } from '@/lib/auth/client';

describe('FC 001m Client Auth Library Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('registerUser debe realizar fetch POST exitoso y capturar errores HTTP', async () => {
    const mockSuccess = { user: { id: 1, email: 'nuevo@empresa.com', role: 'CLIENT' } };
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => mockSuccess,
    } as Response);

    const result = await registerUser({
      email: 'nuevo@empresa.com',
      password: 'Password123!',
      full_name: 'Nuevo Usuario',
    });
    expect(result).toEqual(mockSuccess);

    // Error case
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: 'El correo ya está registrado.' }),
    } as Response);

    await expect(
      registerUser({
        email: 'nuevo@empresa.com',
        password: 'Password123!',
        full_name: 'Nuevo Usuario',
      }),
    ).rejects.toThrow('Error al registrar el usuario.');
  });

  it('loginUser debe realizar fetch POST exitoso y procesar errores de credenciales', async () => {
    const mockSuccess = { user: { id: 1, email: 'test@empresa.com', role: 'CLIENT' } };
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => mockSuccess,
    } as Response);

    const result = await loginUser({ email: 'test@empresa.com', password: 'SecretPassword123!' });
    expect(result).toEqual(mockSuccess);

    // Error case with custom error message
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Credenciales incorrectas.' }),
    } as Response);

    await expect(loginUser({ email: 'test@empresa.com', password: 'wrong' })).rejects.toThrow(
      'Credenciales incorrectas.',
    );
  });

  it('logoutUser debe enviar POST y manejar respuestas exitosas y de error', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: 'Sesión cerrada' }),
    } as Response);

    const res = await logoutUser();
    expect(res.message).toBe('Sesión cerrada');

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: 'Error' }),
    } as Response);

    await expect(logoutUser()).rejects.toThrow('Error al cerrar la sesión.');
  });

  it('getCurrentUser debe enviar GET /me y manejar sesión no autenticada', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ user: { id: 1, email: 'test@empresa.com' } }),
    } as Response);

    const res = await getCurrentUser();
    expect(res.user?.email).toBe('test@empresa.com');

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Token expirado' }),
    } as Response);

    await expect(getCurrentUser()).rejects.toThrow('Token expirado');

    // Default error string fallback (data.error is undefined)
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      json: async () => ({}),
    } as Response);

    await expect(getCurrentUser()).rejects.toThrow('No autenticado o sesión expirada.');
  });

  it('loginUser debe usar el texto de error por defecto cuando la respuesta no contiene campo error', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      json: async () => ({}),
    } as Response);

    await expect(loginUser({ email: 'test@empresa.com', password: 'wrong' })).rejects.toThrow(
      'Credenciales inválidas o error de inicio de sesión.',
    );
  });
});
