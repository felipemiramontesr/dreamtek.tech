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
