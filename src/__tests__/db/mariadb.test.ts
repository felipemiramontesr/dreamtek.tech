/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import type {
  UserEntity,
  SubscriptionEntity,
  SiteEntity,
  OrderEntity,
  SupportTicketEntity,
} from '@/lib/db/types';

describe('MariaDB Schema & Host Model Verification (FC 001a & ADR 005)', () => {
  it('debe existir el archivo DDL de migración inicial y contener la estructura de 5 tablas relacionales con FK RESTRICT/CASCADE', () => {
    const migrationPath = path.join(
      process.cwd(),
      'database',
      'migrations',
      '001_initial_schema.sql',
    );
    expect(fs.existsSync(migrationPath)).toBe(true);

    const sqlContent = fs.readFileSync(migrationPath, 'utf-8');

    // Verificar creación de las 5 tablas relacionales
    expect(sqlContent).toContain('CREATE TABLE IF NOT EXISTS `users`');
    expect(sqlContent).toContain('CREATE TABLE IF NOT EXISTS `subscriptions`');
    expect(sqlContent).toContain('CREATE TABLE IF NOT EXISTS `sites`');
    expect(sqlContent).toContain('CREATE TABLE IF NOT EXISTS `orders`');
    expect(sqlContent).toContain('CREATE TABLE IF NOT EXISTS `support_tickets`');

    // Verificar FK Policy ON DELETE RESTRICT ON UPDATE CASCADE (C-A4)
    expect(sqlContent).toContain('ON DELETE RESTRICT ON UPDATE CASCADE');

    // Verificar Índices dedicados en FKs
    expect(sqlContent).toContain('INDEX `idx_subscriptions_user_id`');
    expect(sqlContent).toContain('INDEX `idx_sites_subscription_id`');
    expect(sqlContent).toContain('INDEX `idx_orders_user_id`');
    expect(sqlContent).toContain('INDEX `idx_tickets_user_id`');
  });

  it('debe existir el módulo de conexión MariaDB/MySQL server/src/db.ts con soporte para pool de conexiones', () => {
    const dbServerPath = path.join(process.cwd(), 'server', 'src', 'db.ts');
    expect(fs.existsSync(dbServerPath)).toBe(true);

    const tsContent = fs.readFileSync(dbServerPath, 'utf-8');
    expect(tsContent).toContain('createPool');
    expect(tsContent).toContain('mysql2/promise');
    expect(tsContent).toContain('export async function query');
  });

  it('debe ejecutar la función query y retornar las filas tipadas', async () => {
    const { query, pool } = await import('../../../server/src/db');
    const mockRows = [{ id: 1, email: 'cliente@empresa.com' }];
    vi.spyOn(pool, 'execute').mockResolvedValueOnce([
      mockRows as unknown as Parameters<Parameters<typeof pool.execute>[0]>[0],
      [],
    ] as never);

    const result = await query<{ id: number; email: string }[]>(
      'SELECT * FROM users WHERE id = ?',
      [1],
    );
    expect(result).toEqual(mockRows);
  });

  it('debe ejecutar withTransaction exitosamente con commit y release (ACID)', async () => {
    const { withTransaction, pool } = await import('../../../server/src/db');
    const mockConn = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      execute: vi.fn().mockResolvedValue([[{ affectedRows: 1 }], []]),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn().mockReturnValue(undefined),
    };
    vi.spyOn(pool, 'getConnection').mockResolvedValueOnce(mockConn as any);

    const result = await withTransaction(async (conn) => {
      const rows = await conn.query('UPDATE accounts SET balance = 100 WHERE id = ?', [1]);
      return { success: true, rows };
    });

    expect(mockConn.beginTransaction).toHaveBeenCalled();
    expect(mockConn.execute).toHaveBeenCalledWith(
      'UPDATE accounts SET balance = 100 WHERE id = ?',
      [1],
    );
    expect(mockConn.commit).toHaveBeenCalled();
    expect(mockConn.rollback).not.toHaveBeenCalled();
    expect(mockConn.release).toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it('debe ejecutar withTransaction y hacer rollback ante error en callback', async () => {
    const { withTransaction, pool } = await import('../../../server/src/db');
    const mockConn = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      execute: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn().mockReturnValue(undefined),
    };
    vi.spyOn(pool, 'getConnection').mockResolvedValueOnce(mockConn as any);

    await expect(
      withTransaction(async () => {
        throw new Error('Simulated transaction failure');
      }),
    ).rejects.toThrow('Simulated transaction failure');

    expect(mockConn.beginTransaction).toHaveBeenCalled();
    expect(mockConn.commit).not.toHaveBeenCalled();
    expect(mockConn.rollback).toHaveBeenCalled();
    expect(mockConn.release).toHaveBeenCalled();
  });

  it('debe hacer fallback en withTransaction si pool.getConnection no existe', async () => {
    const { withTransaction, pool } = await import('../../../server/src/db');
    const origGetConn = pool.getConnection;
    (pool as any).getConnection = undefined;

    try {
      const result = await withTransaction(async (conn) => {
        return { fallback: true, hasQuery: typeof conn.query === 'function' };
      });
      expect(result.fallback).toBe(true);
      expect(result.hasQuery).toBe(true);
    } finally {
      (pool as any).getConnection = origGetConn;
    }
  });

  it('debe ejecutar query sin parámetros usando el arreglo por defecto []', async () => {
    const { query, pool } = await import('../../../server/src/db');
    vi.spyOn(pool, 'execute').mockResolvedValueOnce([[{ count: 1 }], []] as never);

    const result = await query('SELECT 1');
    expect(result).toEqual([{ count: 1 }]);
    expect(pool.execute).toHaveBeenCalledWith('SELECT 1', []);
  });

  it('debe ejecutar conn.query sin parámetros usando el arreglo por defecto [] en withTransaction', async () => {
    const { withTransaction, pool } = await import('../../../server/src/db');
    const mockConn = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      execute: vi.fn().mockResolvedValue([[{ active: 1 }], []]),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn().mockReturnValue(undefined),
    };
    vi.spyOn(pool, 'getConnection').mockResolvedValueOnce(mockConn as any);

    const result = await withTransaction(async (conn) => {
      return conn.query('SELECT 1');
    });

    expect(result).toEqual([{ active: 1 }]);
    expect(mockConn.execute).toHaveBeenCalledWith('SELECT 1', []);
  });

  it('debe retornar configuración por defecto en getDbConfig cuando variables de entorno no están definidas', async () => {
    const { getDbConfig } = await import('../../../server/src/db');
    const origHost = process.env.DB_HOST;
    const origPort = process.env.DB_PORT;
    const origUser = process.env.DB_USER;
    const origPass = process.env.DB_PASSWORD;
    const origName = process.env.DB_NAME;

    delete process.env.DB_HOST;
    delete process.env.DB_PORT;
    delete process.env.DB_USER;
    delete process.env.DB_PASSWORD;
    delete process.env.DB_NAME;

    const cfg = getDbConfig();
    expect(cfg.host).toBe('127.0.0.1');
    expect(cfg.port).toBe(3306);
    expect(cfg.user).toBe('root');
    expect(cfg.password).toBe('');
    expect(cfg.database).toBe('dreamtek');

    if (origHost !== undefined) process.env.DB_HOST = origHost;
    if (origPort !== undefined) process.env.DB_PORT = origPort;
    if (origUser !== undefined) process.env.DB_USER = origUser;
    if (origPass !== undefined) process.env.DB_PASSWORD = origPass;
    if (origName !== undefined) process.env.DB_NAME = origName;
  });

  it('debe retornar configuración personalizada en getDbConfig cuando variables de entorno están definidas', async () => {
    const { getDbConfig } = await import('../../../server/src/db');
    const origHost = process.env.DB_HOST;
    const origPort = process.env.DB_PORT;
    const origUser = process.env.DB_USER;
    const origPass = process.env.DB_PASSWORD;
    const origName = process.env.DB_NAME;

    process.env.DB_HOST = 'custom-host';
    process.env.DB_PORT = '3307';
    process.env.DB_USER = 'custom-user';
    process.env.DB_PASSWORD = 'custom-password';
    process.env.DB_NAME = 'custom-db';

    const cfg = getDbConfig();
    expect(cfg.host).toBe('custom-host');
    expect(cfg.port).toBe(3307);
    expect(cfg.user).toBe('custom-user');
    expect(cfg.password).toBe('custom-password');
    expect(cfg.database).toBe('custom-db');

    if (origHost !== undefined) process.env.DB_HOST = origHost;
    else delete process.env.DB_HOST;
    if (origPort !== undefined) process.env.DB_PORT = origPort;
    else delete process.env.DB_PORT;
    if (origUser !== undefined) process.env.DB_USER = origUser;
    else delete process.env.DB_USER;
    if (origPass !== undefined) process.env.DB_PASSWORD = origPass;
    else delete process.env.DB_PASSWORD;
    if (origName !== undefined) process.env.DB_NAME = origName;
    else delete process.env.DB_NAME;
  });

  it('debe validar la congruencia de los tipos de entidad TypeScript', () => {
    const mockUser: UserEntity = {
      id: 1,
      email: 'cliente@empresa.com',
      full_name: 'Juan Pérez',
      password_hash: 'hashed_pw',
      role: 'CLIENT',
      created_at: '2026-07-25 00:00:00',
    };

    const mockSub: SubscriptionEntity = {
      id: 10,
      user_id: mockUser.id,
      plan_id: 'escolta_web',
      status: 'active',
      start_date: '2026-07-25',
      end_date: '2027-07-25',
      auto_renew: 1,
    };

    const mockSite: SiteEntity = {
      id: 100,
      subscription_id: mockSub.id,
      domain_name: 'empresa.com',
      created_at: '2026-07-25 00:00:00',
    };

    const mockOrder: OrderEntity = {
      id: 1000,
      user_id: mockUser.id,
      checkout_session_id: 'cs_test_123',
      billing_cycle: 'monthly',
      subtotal: 100,
      tax: 16,
      total_amount: 116,
      status: 'paid',
      created_at: '2026-07-25 00:00:00',
    };

    const mockTicket: SupportTicketEntity = {
      id: 500,
      user_id: mockUser.id,
      site_id: mockSite.id,
      subject: 'Error 500 en producción',
      description: 'El sitio no responde.',
      status: 'open',
      created_at: '2026-07-25 00:00:00',
    };

    expect(mockUser.role).toBe('CLIENT');
    expect(mockSub.plan_id).toBe('escolta_web');
    expect(mockSite.subscription_id).toBe(mockSub.id);
    expect(mockOrder.total_amount).toBe(116);
    expect(mockTicket.status).toBe('open');
  });
});
