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

describe('MariaDB Schema & Host Model Verification (FC 001a)', () => {
  it('debe existir el archivo DDL de migración inicial y contener la estructura de 5 tablas relacionales con FK RESTRICT/CASCADE', () => {
    const migrationPath = path.join(process.cwd(), 'database', 'migrations', '001_initial_schema.sql');
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

  it('debe contener las reglas de denegación web .htaccess para proteger .env (OWASP A02/A05)', () => {
    const htaccessPath = path.join(process.cwd(), 'public', 'api', '.htaccess');
    expect(fs.existsSync(htaccessPath)).toBe(true);

    const htaccessContent = fs.readFileSync(htaccessPath, 'utf-8');
    expect(htaccessContent).toContain('<FilesMatch "^\\.env">');
    expect(htaccessContent).toContain('Deny from all');
  });

  it('debe existir la helper de conexión PHP PDO en public/api/config/db.php con soporte para sentencias preparadas y fail-closed', () => {
    const dbPhpPath = path.join(process.cwd(), 'public', 'api', 'config', 'db.php');
    expect(fs.existsSync(dbPhpPath)).toBe(true);

    const phpContent = fs.readFileSync(dbPhpPath, 'utf-8');
    expect(phpContent).toContain('function getDbConnection(): PDO');
    expect(phpContent).toContain('function executeQuery(string $sql, array $params = []): PDOStatement');
    expect(phpContent).toContain('PDO::ATTR_PERSISTENT');
    expect(phpContent).toContain('Database credentials not configured.');
  });

  it('debe validar la congruencia de los tipos de entidad TypeScript', () => {
    const mockUser: UserEntity = {
      id: 1,
      email: 'cliente@empresa.com',
      full_name: 'Juan Pérez',
      role: 'CLIENT',
      created_at: '2026-07-25 12:00:00',
    };

    const mockSub: SubscriptionEntity = {
      id: 10,
      user_id: mockUser.id,
      plan_id: 'starterkit',
      billing_cycle: 'monthly',
      amount: 2899.0,
      status: 'active',
      renews_at: '2026-08-25 12:00:00',
    };

    const mockSite: SiteEntity = {
      id: 100,
      subscription_id: mockSub.id,
      domain_name: 'miempresa.com',
      ssl_active: true,
      template_id: 'corporate_v1',
      status: 'live',
    };

    const mockOrder: OrderEntity = {
      id: 1000,
      user_id: mockUser.id,
      subscription_id: mockSub.id,
      amount: 2899.0,
      status: 'paid',
      created_at: '2026-07-25 12:00:00',
    };

    const mockTicket: SupportTicketEntity = {
      id: 500,
      user_id: mockUser.id,
      site_id: mockSite.id,
      title: 'Cambio de horario de atención',
      description: 'Favor de actualizar el horario en la sección contacto.',
      hours_spent: 0.5,
      status: 'open',
    };

    expect(mockUser.role).toBe('CLIENT');
    expect(mockSub.amount).toBe(2899.0);
    expect(mockSite.ssl_active).toBe(true);
    expect(mockOrder.status).toBe('paid');
    expect(mockTicket.hours_spent).toBe(0.5);
  });
});
