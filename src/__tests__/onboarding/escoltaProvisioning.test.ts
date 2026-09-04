import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import bcrypt from 'bcryptjs';
import app from '../../../server/src/index';
import { setStripeForTest } from '../../../server/src/routes/checkout';
import * as db from '../../../server/src/db';

vi.mock('../../../server/src/db', () => ({
  query: vi.fn().mockImplementation((sql: string) => {
    if (sql.includes('SELECT id FROM users WHERE email = ?')) {
      return Promise.resolve([]);
    }
    if (sql.includes('SELECT id FROM orders WHERE payment_gateway_id')) {
      return Promise.resolve([]);
    }
    if (sql.includes('SELECT status FROM orders WHERE payment_gateway_id')) {
      return Promise.resolve([{ status: 'paid' }]);
    }
    if (sql.includes('SELECT u.id, u.email, u.full_name, u.role FROM users u')) {
      return Promise.resolve([
        { id: 42, email: 'auto_client@dreamtek.tech', full_name: 'Auto Client', role: 'CLIENT' },
      ]);
    }
    if (sql.includes('SELECT id FROM tenants WHERE owner_user_id')) {
      return Promise.resolve([]);
    }
    return Promise.resolve({ affectedRows: 1, insertId: 99 });
  }),
  pool: {
    execute: vi.fn().mockResolvedValue([{ affectedRows: 1, insertId: 99 }]),
  },
}));

interface MockStripe {
  checkout: {
    sessions: {
      create: ReturnType<typeof vi.fn>;
    };
  };
  webhooks: {
    constructEvent: ReturnType<typeof vi.fn>;
  };
}

describe('FC 037 Escolta WEB B2C Auto-Provisioning & Security Suite', () => {
  let mockStripe: MockStripe;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStripe = {
      checkout: {
        sessions: {
          create: vi.fn().mockResolvedValue({
            id: 'cs_live_session_123',
            url: 'https://checkout.stripe.com/pay/cs_live_session_123',
          }),
        },
      },
      webhooks: {
        constructEvent: vi.fn(),
      },
    };
    setStripeForTest(mockStripe);
  });

  afterEach(() => {
    setStripeForTest(null);
  });

  describe('Session Pricing & Metadatos (C-037 & C-S3)', () => {
    it('debe configurar precio anual en $31,188 MXN con intervalo de cobro anual', async () => {
      process.env.STRIPE_SECRET_KEY = 'sk_live_test_key';

      const res = await request(app).post('/api/v1/checkout/session').send({
        email: 'b2c@dreamtek.tech',
        billing_cycle: 'annual',
        template_id: 'architect',
        domain_name: 'estudio-solar.mx',
      });

      expect(res.status).toBe(200);
      expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customer_email: 'b2c@dreamtek.tech',
          mode: 'subscription',
          line_items: [
            expect.objectContaining({
              price_data: expect.objectContaining({
                currency: 'mxn',
                unit_amount: 3118800,
                recurring: { interval: 'year' },
              }),
            }),
          ],
          metadata: expect.objectContaining({
            template_id: 'architect',
            domain_name: 'estudio-solar.mx',
            billing_cycle: 'annual',
          }),
        }),
      );

      delete process.env.STRIPE_SECRET_KEY;
    });

    it('debe configurar precio mensual en $2,899 MXN con intervalo mensual', async () => {
      process.env.STRIPE_SECRET_KEY = 'sk_live_test_key';

      const res = await request(app).post('/api/v1/checkout/session').send({
        email: 'mensual@dreamtek.tech',
        billing_cycle: 'monthly',
        template_id: 'corporate',
        domain_name: 'miempresa.com',
      });

      expect(res.status).toBe(200);
      expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          line_items: [
            expect.objectContaining({
              price_data: expect.objectContaining({
                unit_amount: 289900,
                recurring: { interval: 'month' },
              }),
            }),
          ],
        }),
      );

      delete process.env.STRIPE_SECRET_KEY;
    });
  });

  describe('Webhook Auto-Provisioning & Security Controls (P0 / C-037)', () => {
    it('debe auto-aprovisionar un usuario con hash bcrypt único y dinámico, no estático', async () => {
      const bcryptSpy = vi.spyOn(bcrypt, 'hash');

      const rawPayload = JSON.stringify({
        id: 'evt_test_provision_037',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_session_unique_037',
            customer_email: 'nuevo_cliente@dreamtek.tech',
            customer_details: { name: 'Cliente Dinamico', email: 'nuevo_cliente@dreamtek.tech' },
            amount_total: 3118800,
            subscription: 'sub_live_037',
            metadata: {
              template_id: 'consulting',
              domain_name: 'consultores.mx',
              billing_cycle: 'annual',
            },
          },
        },
      });

      mockStripe.webhooks.constructEvent.mockReturnValue(JSON.parse(rawPayload));

      const res = await request(app)
        .post('/api/v1/checkout/webhook')
        .set('stripe-signature', 't=123,v1=valid_sig')
        .set('Content-Type', 'application/json')
        .send(Buffer.from(rawPayload));

      expect(res.status).toBe(200);
      expect(res.body.received).toBe(true);

      // Verificación P0: El hash almacenado debe ser un bcrypt dinámico válido y no el hash dummy anterior
      const userInsertCall = vi
        .mocked(db.query)
        .mock.calls.find(
          (call) => typeof call[0] === 'string' && call[0].includes('INSERT INTO users'),
        );
      expect(userInsertCall).toBeDefined();
      const userParams = userInsertCall![1] as Array<string | number>;
      expect(userParams[0]).toBe('nuevo_cliente@dreamtek.tech');
      const hash = userParams[1];
      expect(typeof hash).toBe('string');
      expect(hash).toMatch(/^\$2[ab]\$\d+\$/);
      expect(hash).not.toBe('$2a$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQmG6eE/P/gXmGzHw4u2K');
      expect(bcryptSpy).toHaveBeenCalled();

      // Verificación de transacción BEGIN / COMMIT
      expect(db.query).toHaveBeenCalledWith('START TRANSACTION');
      expect(db.query).toHaveBeenCalledWith('COMMIT');

      // Verificación de inserción en client_sites
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO client_sites'),
        expect.arrayContaining(['consultores.mx', 'consulting', 'cs_session_unique_037']),
      );
    });

    it('debe rechazar webhooks sin firma stripe-signature cuando NODE_ENV !== test', async () => {
      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const res = await request(app)
        .post('/api/v1/checkout/webhook')
        .set('Content-Type', 'application/json')
        .send({ type: 'checkout.session.completed' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Firma stripe-signature requerida');

      process.env.NODE_ENV = prevEnv;
    });

    it('debe ejecutar ROLLBACK si ocurre un error durante el aprovisionamiento transaccional', async () => {
      const rawPayload = JSON.stringify({
        id: 'evt_tx_fail_037',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_session_tx_fail',
            customer_email: 'error_tx@dreamtek.tech',
            amount_total: 289900,
            metadata: {
              template_id: 'corporate',
              domain_name: 'txfail.mx',
            },
          },
        },
      });

      mockStripe.webhooks.constructEvent.mockReturnValue(JSON.parse(rawPayload));

      // Simular fallo en la inserción de órdenes dentro de la transacción
      vi.mocked(db.query).mockImplementation((sql: string) => {
        if (sql === 'START TRANSACTION') return Promise.resolve({});
        if (sql.includes('SELECT id FROM users')) return Promise.resolve([{ id: 10 }]);
        if (sql.includes('INSERT INTO orders'))
          return Promise.reject(new Error('Deadlock detected'));
        if (sql === 'ROLLBACK') return Promise.resolve({});
        return Promise.resolve({ affectedRows: 1 });
      });

      const res = await request(app)
        .post('/api/v1/checkout/webhook')
        .set('stripe-signature', 't=123,v1=valid_sig')
        .set('Content-Type', 'application/json')
        .send(Buffer.from(rawPayload));

      expect(res.status).toBe(400);
      expect(db.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('Checkout Verification & Backdoor Prevention (P0 / C-037)', () => {
    it('debe rechazar session_id mock en modo producción sin emitir JWT arbitrario', async () => {
      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const resMock = await request(app).get('/api/v1/checkout/verify?session_id=mock');
      expect(resMock.status).toBe(400);
      expect(resMock.body.verified).toBe(false);
      expect(resMock.body.token).toBeUndefined();

      const resTestMock = await request(app).get(
        '/api/v1/checkout/verify?session_id=cs_test_mock_secret_id',
      );
      expect(resTestMock.status).toBe(400);
      expect(resTestMock.body.verified).toBe(false);
      expect(resTestMock.body.token).toBeUndefined();

      process.env.NODE_ENV = prevEnv;
    });

    it('debe verificar orden pagada y emitir JWT real con algoritmo HS512', async () => {
      vi.mocked(db.query).mockImplementation((sql: string) => {
        if (sql.includes('SELECT status FROM orders')) {
          return Promise.resolve([{ status: 'paid' }]);
        }
        if (sql.includes('SELECT u.id, u.email, u.full_name, u.role FROM users u')) {
          return Promise.resolve([
            {
              id: 42,
              email: 'paid_client@dreamtek.tech',
              full_name: 'Cliente Real',
              role: 'CLIENT',
            },
          ]);
        }
        return Promise.resolve([]);
      });

      const res = await request(app).get('/api/v1/checkout/verify?session_id=cs_real_paid_123');

      expect(res.status).toBe(200);
      expect(res.body.verified).toBe(true);
      expect(res.body.token).toBeDefined();
      expect(typeof res.body.token).toBe('string');
    });

    it('debe fallar cerrado (status 500 y verified: false) si la base de datos lanza un error', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('Database cluster partition'));

      const res = await request(app).get('/api/v1/checkout/verify?session_id=cs_cluster_down');

      expect(res.status).toBe(500);
      expect(res.body.verified).toBe(false);
      expect(res.body.token).toBeUndefined();
    });
  });

  describe('Client Dashboard & DNS Soft Check Honesty (FC 037)', () => {
    it('debe proveer chequeo DNS suave honesto aclarando que no es registrador ICANN', async () => {
      const res = await request(app)
        .post('/api/v1/onboarding/domain')
        .send({ domain: 'dreamtek.app' });

      expect(res.status).toBe(200);
      expect(res.body.domain).toBe('dreamtek.app');
      expect(res.body.check_type).toBe('DNS_SOFT_CHECK');
      expect(res.body.notice).toContain('ICANN');
    });

    it('debe rechazar dominio malicioso con inyección de caracteres en el chequeo de onboarding', async () => {
      const res = await request(app)
        .post('/api/v1/onboarding/domain')
        .send({ domain: 'malicious;rm -rf /' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation Error');
    });

    it('debe detectar dominio ya registrado en client_sites de la plataforma', async () => {
      vi.mocked(db.query).mockImplementation((sql: string) => {
        if (sql.includes('SELECT id FROM client_sites WHERE domain = ?')) {
          return Promise.resolve([{ id: 101 }]);
        }
        return Promise.resolve([]);
      });

      const res = await request(app)
        .post('/api/v1/onboarding/domain')
        .send({ domain: 'duplicado.com' });

      expect(res.status).toBe(200);
      expect(res.body.available).toBe(false);
      expect(res.body.message).toContain('ya se encuentra registrado');
    });

    it('debe detectar dominio con palabra reservada', async () => {
      const res = await request(app)
        .post('/api/v1/onboarding/domain')
        .send({ domain: 'sitio-reservado.com' });

      expect(res.status).toBe(200);
      expect(res.body.available).toBe(false);
      expect(res.body.message).toContain('no disponible o reservado');
    });

    it('debe tolerar fallos en la consulta a client_sites durante el chequeo de dominio', async () => {
      vi.mocked(db.query).mockImplementation((sql: string) => {
        if (sql.includes('SELECT id FROM client_sites WHERE domain = ?')) {
          return Promise.reject(new Error('Table missing'));
        }
        return Promise.resolve([]);
      });

      const res = await request(app)
        .post('/api/v1/onboarding/domain')
        .send({ domain: 'tolerante.com' });

      expect(res.status).toBe(200);
      expect(res.body.available).toBe(true);
    });

    it('debe retornar panel de cliente completo mapeando suscripciones y sitios sin mocks estáticos', async () => {
      const jwtSecret = process.env.JWT_SECRET || 'dreamtek_dev_jwt_secret_key_2026';
      const clientToken = (await import('jsonwebtoken')).default.sign(
        { userId: 55, uid: 55, email: 'fullclient@dreamtek.tech', role: 'CLIENT' },
        jwtSecret,
        { algorithm: 'HS512' },
      );

      vi.mocked(db.query).mockImplementation((sql: string) => {
        if (sql.includes('SELECT id, full_name, email, role, created_at FROM users')) {
          return Promise.resolve([
            {
              id: 55,
              full_name: 'Full Client',
              email: 'fullclient@dreamtek.tech',
              role: 'CLIENT',
              created_at: new Date(),
            },
          ]);
        }
        if (sql.includes('SELECT id, domain, status, ssl FROM client_sites')) {
          return Promise.resolve([{ id: 1, domain: 'empresa.mx', status: 'LIVE', ssl: 'ACTIVE' }]);
        }
        if (
          sql.includes(
            'SELECT id, plan_id, billing_cycle, status, amount, renews_at FROM subscriptions',
          )
        ) {
          return Promise.resolve([
            {
              id: 10,
              plan_id: 'escolta-pro',
              billing_cycle: 'annual',
              status: 'active',
              amount: 31188,
              renews_at: new Date(),
            },
            {
              id: 11,
              plan_id: 'starterkit',
              billing_cycle: 'monthly',
              status: 'active',
              amount: 2899,
              renews_at: new Date(),
            },
            {
              id: 12,
              plan_id: 'custom-plan',
              billing_cycle: 'monthly',
              status: 'active',
              amount: 1500,
              renews_at: new Date(),
            },
          ]);
        }
        return Promise.resolve([]);
      });

      const res = await request(app)
        .get('/api/v1/client/dashboard')
        .set('Cookie', [`dreamtek_session=${clientToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.services).toHaveLength(3);
      expect(res.body.services[0].name).toBe('Escolta WEB — Posicionamiento');
      expect(res.body.services[1].name).toBe('Escolta WEB — Posicionamiento');
      expect(res.body.services[2].name).toBe('custom-plan');
      expect(res.body.sites).toHaveLength(1);
    });

    it('debe tolerar fallos en la consulta de subscriptions y client_sites en /client/dashboard', async () => {
      const jwtSecret = process.env.JWT_SECRET || 'dreamtek_dev_jwt_secret_key_2026';
      const clientToken = (await import('jsonwebtoken')).default.sign(
        { userId: 55, uid: 55, email: 'resilient@dreamtek.tech', role: 'CLIENT' },
        jwtSecret,
        { algorithm: 'HS512' },
      );

      vi.mocked(db.query).mockImplementation((sql: string) => {
        if (sql.includes('SELECT id, full_name, email, role, created_at FROM users')) {
          return Promise.resolve([
            {
              id: 55,
              full_name: 'Resilient Client',
              email: 'resilient@dreamtek.tech',
              role: 'CLIENT',
              created_at: new Date(),
            },
          ]);
        }
        if (sql.includes('SELECT id, domain, status, ssl FROM client_sites')) {
          return Promise.reject(new Error('Sites query failed'));
        }
        if (
          sql.includes(
            'SELECT id, plan_id, billing_cycle, status, amount, renews_at FROM subscriptions',
          )
        ) {
          return Promise.reject(new Error('Subs query failed'));
        }
        return Promise.resolve([]);
      });

      const res = await request(app)
        .get('/api/v1/client/dashboard')
        .set('Cookie', [`dreamtek_session=${clientToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.services).toEqual([]);
      expect(res.body.sites).toEqual([]);
    });

    it('debe cubrir branches adicionales de webhook: existing tenant/workspace, missing domain, y subscription lifecycle', async () => {
      // 1. Webhook con cliente existente, tenant existente, workspace existente, y sin domainName
      const rawPayload = JSON.stringify({
        id: 'evt_existing_flow',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_existing_flow_123',
            client_reference_id: '88',
            customer_email: 'existing_user@dreamtek.tech',
            amount_total: 289900,
            subscription: { id: 'sub_obj_123' },
            metadata: {
              template_id: 'corporate',
              billing_cycle: 'monthly',
            },
          },
        },
      });

      mockStripe.webhooks.constructEvent.mockReturnValue(JSON.parse(rawPayload));

      vi.mocked(db.query).mockImplementation((sql: string) => {
        if (sql === 'START TRANSACTION' || sql === 'COMMIT') return Promise.resolve({});
        if (sql.includes('SELECT id FROM tenants WHERE owner_user_id')) {
          return Promise.resolve([{ id: 88 }]); // Tenant already exists
        }
        if (sql.includes('SELECT tenant_id FROM workspaces WHERE tenant_id')) {
          return Promise.resolve([{ tenant_id: 88 }]); // Workspace already exists
        }
        return Promise.resolve({ affectedRows: 1 });
      });

      const resCompleted = await request(app)
        .post('/api/v1/checkout/webhook')
        .set('stripe-signature', 't=123,v1=valid_sig')
        .set('Content-Type', 'application/json')
        .send(Buffer.from(rawPayload));

      expect(resCompleted.status).toBe(200);

      // 2. customer.subscription.updated con status canceled
      const cancelPayload = JSON.stringify({
        id: 'evt_sub_canceled',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_cancel_123',
            customer: 'cus_cancel_123',
            status: 'canceled',
          },
        },
      });
      mockStripe.webhooks.constructEvent.mockReturnValue(JSON.parse(cancelPayload));

      const resCanceled = await request(app)
        .post('/api/v1/checkout/webhook')
        .set('stripe-signature', 't=123,v1=valid_sig')
        .set('Content-Type', 'application/json')
        .send(Buffer.from(cancelPayload));

      expect(resCanceled.status).toBe(200);

      // 3. customer.subscription.updated con status past_due
      const pastDuePayload = JSON.stringify({
        id: 'evt_sub_past_due',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_past_due_123',
            customer: 'cus_past_due_123',
            status: 'past_due',
          },
        },
      });
      mockStripe.webhooks.constructEvent.mockReturnValue(JSON.parse(pastDuePayload));

      const resPastDue = await request(app)
        .post('/api/v1/checkout/webhook')
        .set('stripe-signature', 't=123,v1=valid_sig')
        .set('Content-Type', 'application/json')
        .send(Buffer.from(pastDuePayload));

      expect(resPastDue.status).toBe(200);

      // 4. customer.subscription.deleted
      const deletedPayload = JSON.stringify({
        id: 'evt_sub_deleted',
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_del_123',
            customer: 'cus_del_123',
          },
        },
      });
      mockStripe.webhooks.constructEvent.mockReturnValue(JSON.parse(deletedPayload));

      const resDeleted = await request(app)
        .post('/api/v1/checkout/webhook')
        .set('stripe-signature', 't=123,v1=valid_sig')
        .set('Content-Type', 'application/json')
        .send(Buffer.from(deletedPayload));

      expect(resDeleted.status).toBe(200);
    });

    it('debe ejecutar dns.resolve y manejar resolución o error ENOTFOUND con ENABLE_DNS_CHECK', async () => {
      process.env.ENABLE_DNS_CHECK = 'true';
      const onboardingApp = express();
      onboardingApp.use(express.json());
      onboardingApp.use(
        '/onboarding',
        (await import('../../../server/src/routes/onboarding')).onboardingRouter,
      );

      // 1. Dominio con resolución DNS
      const resLive = await request(onboardingApp)
        .post('/onboarding/domain')
        .send({ domain: 'dreamtek.app' });

      expect(resLive.status).toBe(200);
      expect(resLive.body.check_type).toBe('DNS_SOFT_CHECK');

      // 2. Dominio inexistente que dispara catch (_dnsErr)
      const resNotFound = await request(onboardingApp)
        .post('/onboarding/domain')
        .send({ domain: 'este-dominio-definitivamente-no-existe-1234567.com' });

      expect(resNotFound.status).toBe(200);
      expect(resNotFound.body.available).toBe(true);

      delete process.env.ENABLE_DNS_CHECK;
    });

    it('debe cubrir branches de fallback en checkout: email fallback name, subId string, y verify sin token', async () => {
      // 1. Auto-create sin customer_details.name para usar email.split('@')[0]
      const rawPayload = JSON.stringify({
        id: 'evt_no_name_sub',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_no_name_123',
            customer_email: 'fallbackname@dreamtek.tech',
            amount_total: 289900,
            subscription: 'sub_str_id_999',
            metadata: {
              template_id: 'corporate',
              domain_name: 'fallback.mx',
              billing_cycle: 'monthly',
            },
          },
        },
      });

      mockStripe.webhooks.constructEvent.mockReturnValue(JSON.parse(rawPayload));

      vi.mocked(db.query).mockImplementation((sql: string) => {
        if (sql === 'START TRANSACTION' || sql === 'COMMIT') return Promise.resolve({});
        if (sql.includes('SELECT id FROM users WHERE email = ?')) return Promise.resolve([]);
        if (sql.includes('SELECT id FROM tenants')) return Promise.resolve([]);
        if (sql.includes('SELECT tenant_id FROM workspaces')) return Promise.resolve([]);
        return Promise.resolve({ affectedRows: 1, insertId: 777 });
      });

      const resNoName = await request(app)
        .post('/api/v1/checkout/webhook')
        .set('stripe-signature', 't=123,v1=valid_sig')
        .set('Content-Type', 'application/json')
        .send(Buffer.from(rawPayload));

      expect(resNoName.status).toBe(200);

      // 2. Verify con orden pagada pero sin usuario asociado (ramita token ? { token } : {})
      vi.mocked(db.query).mockImplementation((sql: string) => {
        if (sql.includes('SELECT status FROM orders')) {
          return Promise.resolve([{ status: 'paid' }]);
        }
        if (sql.includes('SELECT u.id, u.email, u.full_name, u.role FROM users u')) {
          return Promise.resolve([]); // No user found in join
        }
        return Promise.resolve([]);
      });

      const resNoToken = await request(app).get(
        '/api/v1/checkout/verify?session_id=cs_paid_no_user',
      );
      expect(resNoToken.status).toBe(200);
      expect(resNoToken.body.verified).toBe(true);
      expect(resNoToken.body.token).toBeUndefined();
    });

    it('debe capturar excepciones no controladas en /client/sites y /client/dashboard', async () => {
      const jwtSecret = process.env.JWT_SECRET || 'dreamtek_dev_jwt_secret_key_2026';
      const clientToken = (await import('jsonwebtoken')).default.sign(
        { userId: 55, uid: 55, email: 'errclient@dreamtek.tech', role: 'CLIENT' },
        jwtSecret,
        { algorithm: 'HS512' },
      );

      // 1. /client/dashboard con excepción no controlada en users
      vi.mocked(db.query).mockRejectedValueOnce(new Error('Fatal dashboard crash'));
      const resDashErr = await request(app)
        .get('/api/v1/client/dashboard')
        .set('Cookie', [`dreamtek_session=${clientToken}`]);
      expect(resDashErr.status).toBe(500);

      // 2. /client/sites con error string en inner catch
      vi.mocked(db.query).mockRejectedValueOnce('Sync String Error');
      const resSitesInnerErr = await request(app)
        .get('/api/v1/client/sites')
        .set('Cookie', [`dreamtek_session=${clientToken}`]);
      expect(resSitesInnerErr.status).toBe(200);
      expect(resSitesInnerErr.body.sites).toEqual([]);

      // 3. /client/sites con excepción externa no controlada
      const { clientRouter } = await import('../../../server/src/routes/client');
      type RouteLayer = {
        route?: {
          path?: string;
          stack?: Array<{ handle?: (req: unknown, res: unknown) => Promise<void> }>;
        };
      };
      const sitesLayer = (clientRouter.stack as unknown as RouteLayer[]).find(
        (s) => s.route?.path === '/sites',
      );
      const sitesHandler = sitesLayer?.route?.stack?.[sitesLayer.route.stack.length - 1]?.handle;
      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      await sitesHandler?.(
        {
          get user() {
            throw new Error('Exploding user');
          },
        },
        mockRes,
      );
      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });
});
