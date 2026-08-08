import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  submitLead,
  checkDomainAvailability,
  createCheckoutSession,
  verifyCheckoutSuccess,
} from '@/lib/onboarding/client';

describe('FC 001m Client Onboarding Library Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('submitLead debe enviar POST /onboarding/lead y manejar errores HTTP', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'success', lead_id: 10 }),
    } as Response);

    const result = await submitLead({
      email: 'lead@empresa.com',
      full_name: 'Lead Test',
      phone: '5511223344',
    });

    expect(result.status).toBe('success');

    // Error branch
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Error de servidor' }),
    } as Response);

    await expect(
      submitLead({
        email: 'lead@empresa.com',
        full_name: 'Lead Test',
        phone: '5511223344',
      }),
    ).rejects.toThrow('Error de servidor');
  });

  it('checkDomainAvailability debe enviar POST /onboarding/domain y manejar errores HTTP', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        domain: 'miempresa.com',
        available: true,
        message: 'Dominio disponible',
      }),
    } as Response);

    const res = await checkDomainAvailability('miempresa.com');
    expect(res.available).toBe(true);

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: 'Dominio reservado' }),
    } as Response);

    await expect(checkDomainAvailability('google.com')).rejects.toThrow('Dominio reservado');
  });

  it('createCheckoutSession debe enviar POST /checkout/session y manejar errores HTTP', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ checkout_url: 'https://checkout.stripe.com/pay' }),
    } as Response);

    const res = await createCheckoutSession({
      email: 'client@empresa.com',
      billing_cycle: 'annual',
    });
    expect(res.checkout_url).toBeDefined();

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Error Stripe' }),
    } as Response);

    await expect(
      createCheckoutSession({ email: 'client@empresa.com', billing_cycle: 'monthly' }),
    ).rejects.toThrow('Error Stripe');
  });

  it('verifyCheckoutSuccess debe enviar GET /checkout/verify y manejar errores HTTP', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'success', message: 'Pago verificado' }),
    } as Response);

    const res = await verifyCheckoutSuccess('cs_123');
    expect(res.status).toBe('success');

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: 'Sesión no válida' }),
    } as Response);

    await expect(verifyCheckoutSuccess('cs_invalid')).rejects.toThrow('Sesión no válida');
  });
});
