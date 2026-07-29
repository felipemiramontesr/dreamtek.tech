import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  submitLead,
  checkDomainAvailability,
  createCheckoutSession,
  verifyCheckoutSuccess,
} from '@/lib/onboarding/client';

describe('Onboarding Wizard & Checkout Verification (FC 001c)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('debe existir la migración DDL 003_leads_and_templates.sql con las tablas leads, templates e indice UNIQUE', () => {
    const migrationPath = path.join(process.cwd(), 'database', 'migrations', '003_leads_and_templates.sql');
    expect(fs.existsSync(migrationPath)).toBe(true);

    const sqlContent = fs.readFileSync(migrationPath, 'utf-8');
    expect(sqlContent).toContain('CREATE TABLE IF NOT EXISTS `leads`');
    expect(sqlContent).toContain('`email` VARCHAR(255) NOT NULL UNIQUE');
    expect(sqlContent).toContain('CREATE TABLE IF NOT EXISTS `templates`');
    expect(sqlContent).toContain('ALTER TABLE `orders` ADD UNIQUE INDEX `idx_orders_gateway_id`');
  });

  it('debe existir el script seed 002_templates_seed.sql con la insercion de plantillas predefinidas', () => {
    const seedPath = path.join(process.cwd(), 'database', 'seeds', '002_templates_seed.sql');
    expect(fs.existsSync(seedPath)).toBe(true);

    const seedContent = fs.readFileSync(seedPath, 'utf-8');
    expect(seedContent).toContain("INSERT INTO `templates`");
    expect(seedContent).toContain("'corporate'");
    expect(seedContent).toContain("'services'");
    expect(seedContent).toContain("'ecommerce'");
  });

  it('deben existir todos los endpoints PHP PDO de onboarding y checkout', () => {
    const apiDir = path.join(process.cwd(), 'public', 'api');
    expect(fs.existsSync(path.join(apiDir, 'onboarding', 'lead.php'))).toBe(true);
    expect(fs.existsSync(path.join(apiDir, 'onboarding', 'domain.php'))).toBe(true);
    expect(fs.existsSync(path.join(apiDir, 'checkout', 'session.php'))).toBe(true);
    expect(fs.existsSync(path.join(apiDir, 'checkout', 'webhook.php'))).toBe(true);
    expect(fs.existsSync(path.join(apiDir, 'checkout', 'verify_success.php'))).toBe(true);
  });

  it('el cliente TS submitLead debe enviar datos con credentials: include', async () => {
    const mockResponse = { message: 'Lead guardado exitosamente' };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const result = await submitLead({
      email: 'lead@empresa.com',
      full_name: 'Lead Test',
      phone: '+525512345678',
      company: 'Empresa Test',
      step_reached: 1,
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/onboarding/lead'),
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
      })
    );
    expect(result.message).toBe('Lead guardado exitosamente');
  });

  it('el cliente TS checkDomainAvailability debe consultar la API domain', async () => {
    const mockResponse = { domain: 'miempresa.com', available: true, message: 'Dominio disponible' };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const result = await checkDomainAvailability('miempresa.com');

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/onboarding/domain'),
      expect.objectContaining({
        credentials: 'include',
      })
    );
    expect(result.available).toBe(true);
  });

  it('el cliente TS createCheckoutSession debe invocar session y retornar la URL de checkout', async () => {
    const mockResponse = {
      message: 'Sesion de checkout creada exitosamente',
      checkout_url: 'http://localhost/?session_id=cs_test_123&step=5',
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const result = await createCheckoutSession({
      email: 'lead@empresa.com',
      billing_cycle: 'monthly',
      template_id: 'corporate',
      domain_name: 'miempresa.com',
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/checkout/session'),
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
      })
    );
    expect(result.checkout_url).toContain('session_id=cs_test_123');
  });

  it('el cliente TS verifyCheckoutSuccess debe invocar verify', async () => {
    const mockResponse = {
      message: 'Verificacion de pago exitosa. Sesion de usuario activada.',
      user: { id: 1, email: 'lead@empresa.com', full_name: 'Lead Test', role: 'CLIENT' },
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const result = await verifyCheckoutSuccess('cs_test_123');

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/checkout/verify'),
      expect.objectContaining({
        method: 'GET',
        credentials: 'include',
      })
    );
    expect(result.user?.id).toBe(1);
  });

  it('el cliente TS submitLead debe arrojar error si se excede el rate limit (HTTP 429)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Demasiadas solicitudes. Intente de nuevo en 15 minutos.' }),
    } as Response);

    await expect(
      submitLead({ email: 'spam@empresa.com', full_name: 'Spam', phone: '123' })
    ).rejects.toThrow('Demasiadas solicitudes.');
  });
});
