import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  registerUser,
  loginUser,
  logoutUser,
  getCurrentUser,
  fetchClientDashboard,
  fetchArchonBridgeUrl,
  fetchAdminLeads,
  fetchAdminAuditLogs,
} from '@/lib/auth/client';

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

  it('fetchClientDashboard debe obtener datos del panel o arrojar error', async () => {
    const mockDashboard = {
      status: 'success',
      profile: { id: 1, full_name: 'Test', email: 'test@dtk.com', role: 'CLIENT', created_at: '' },
      services: [],
      sites: [],
    };
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => mockDashboard,
    } as Response);

    const res = await fetchClientDashboard();
    expect(res).toEqual(mockDashboard);

    // Error con message
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: 'No autorizado' }),
    } as Response);
    await expect(fetchClientDashboard()).rejects.toThrow('No autorizado');

    // Error con fallback
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      json: async () => ({}),
    } as Response);
    await expect(fetchClientDashboard()).rejects.toThrow('Error al obtener datos del panel.');
  });

  it('fetchArchonBridgeUrl debe retornar url HMAC o arrojar error', async () => {
    const mockPayload = { url: 'https://fleet.archon.dreamtek.tech/bridge', expires_in: 300 };
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => mockPayload,
    } as Response);

    const res = await fetchArchonBridgeUrl();
    expect(res).toEqual(mockPayload);

    // Error con message
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: 'Sin suscripción' }),
    } as Response);
    await expect(fetchArchonBridgeUrl()).rejects.toThrow('Sin suscripción');

    // Error fallback
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      json: async () => ({}),
    } as Response);
    await expect(fetchArchonBridgeUrl()).rejects.toThrow(
      'Error al generar enlace seguro a ARCHON.',
    );
  });

  it('fetchAdminLeads debe retornar lista de prospectos o arrojar error', async () => {
    const mockLeads = { leads: [{ id: 1, name: 'Lead 1' }] };
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => mockLeads,
    } as Response);

    const res = await fetchAdminLeads();
    expect(res).toEqual(mockLeads);

    // Error con message
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: 'Fallo de base de datos' }),
    } as Response);
    await expect(fetchAdminLeads()).rejects.toThrow('Fallo de base de datos');

    // Error fallback
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      json: async () => ({}),
    } as Response);
    await expect(fetchAdminLeads()).rejects.toThrow('Error al obtener prospectos administrativos.');
  });

  it('fetchAdminAuditLogs debe retornar lista de logs o arrojar error', async () => {
    const mockLogs = { logs: [{ id: 10 }] };
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => mockLogs,
    } as Response);

    const res = await fetchAdminAuditLogs(2, 20);
    expect(res).toEqual(mockLogs);

    // Con parámetros por defecto
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => mockLogs,
    } as Response);
    const resDefault = await fetchAdminAuditLogs();
    expect(resDefault).toEqual(mockLogs);

    // Error con message
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: 'Error de servidor' }),
    } as Response);
    await expect(fetchAdminAuditLogs()).rejects.toThrow('Error de servidor');

    // Error fallback
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      json: async () => ({}),
    } as Response);
    await expect(fetchAdminAuditLogs()).rejects.toThrow('Error al obtener logs de auditoría.');
  });
});
