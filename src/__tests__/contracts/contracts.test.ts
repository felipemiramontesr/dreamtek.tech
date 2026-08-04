import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { loginSchema, registerSchema } from '../../../server/src/schemas/auth.schema';
import { contactFormSchema, sendCodeSchema } from '../../../server/src/schemas/contact.schema';
import { leadSchema, domainCheckSchema } from '../../../server/src/schemas/onboarding.schema';
import { checkoutSessionSchema } from '../../../server/src/schemas/checkout.schema';

describe('FC 001i OpenAPI & Zod Boundary Validation Suite', () => {
  it('deben existir los archivos de esquemas Zod en server/src/schemas/', () => {
    const schemasDir = path.join(process.cwd(), 'server', 'src', 'schemas');
    expect(fs.existsSync(path.join(schemasDir, 'auth.schema.ts'))).toBe(true);
    expect(fs.existsSync(path.join(schemasDir, 'contact.schema.ts'))).toBe(true);
    expect(fs.existsSync(path.join(schemasDir, 'onboarding.schema.ts'))).toBe(true);
    expect(fs.existsSync(path.join(schemasDir, 'checkout.schema.ts'))).toBe(true);
  });

  it('debe existir la especificación OpenAPI 3.1 en server/src/docs/openapi.json', () => {
    const openapiPath = path.join(process.cwd(), 'server', 'src', 'docs', 'openapi.json');
    expect(fs.existsSync(openapiPath)).toBe(true);

    const content = fs.readFileSync(openapiPath, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.openapi).toBe('3.1.0');
    expect(parsed.paths['/auth/login']).toBeDefined();
    expect(parsed.paths['/contact']).toBeDefined();
  });

  it('loginSchema debe rechazar emails inválidos y contraseñas de menos de 8 caracteres', () => {
    const invalidRes = loginSchema.safeParse({ email: 'bad-email', password: 'short' });
    expect(invalidRes.success).toBe(false);

    const validRes = loginSchema.safeParse({ email: 'juan@empresa.com', password: 'password123' });
    expect(validRes.success).toBe(true);
  });

  it('registerSchema debe validar nombre, email y contraseña mínima de 8 caracteres', () => {
    const invalidRes = registerSchema.safeParse({
      full_name: 'A',
      email: 'invalid',
      password: '123',
    });
    expect(invalidRes.success).toBe(false);

    const validRes = registerSchema.safeParse({
      full_name: 'Juan Pérez',
      email: 'juan@empresa.com',
      password: 'SuperPassword123!',
    });
    expect(validRes.success).toBe(true);
  });

  it('contactFormSchema y sendCodeSchema deben rechazar campos faltantes o malformados', () => {
    const invalidContact = contactFormSchema.safeParse({
      name: 'J',
      email: 'bad',
      subject: 'x',
      message: 'hi',
    });
    expect(invalidContact.success).toBe(false);

    const validSendCode = sendCodeSchema.safeParse({ email: 'cliente@empresa.com' });
    expect(validSendCode.success).toBe(true);
  });

  it('leadSchema y domainCheckSchema deben validar nombres FQDN de dominio y prospectos', () => {
    const invalidLead = leadSchema.safeParse({ name: 'A', email: 'invalid' });
    expect(invalidLead.success).toBe(false);

    const validLead = leadSchema.safeParse({
      name: 'Juan',
      email: 'juan@empresa.com',
      company: 'Tech Inc',
    });
    expect(validLead.success).toBe(true);

    const invalidDomain = domainCheckSchema.safeParse({ domain: 'sin-tld' });
    expect(invalidDomain.success).toBe(false);

    const validDomain = domainCheckSchema.safeParse({ domain: 'miempresa.com' });
    expect(validDomain.success).toBe(true);
  });

  it('checkoutSessionSchema debe validar el ciclo de facturación', () => {
    const invalidCycle = checkoutSessionSchema.safeParse({ planId: 'p1', billingCycle: 'weekly' });
    expect(invalidCycle.success).toBe(false);

    const validCycle = checkoutSessionSchema.safeParse({ planId: 'p1', billingCycle: 'annual' });
    expect(validCycle.success).toBe(true);
  });
});
