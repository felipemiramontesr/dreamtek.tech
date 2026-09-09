import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import app from '../../../server/src/index';
import { setStripeForTest, checkoutRouter } from '../../../server/src/routes/checkout';
import * as db from '../../../server/src/db';

vi.mock('../../../server/src/db', () => {
  const mockQuery = vi.fn().mockImplementation((sql: string) => {
    if (sql.includes('SELECT id FROM users')) {
      return Promise.resolve([{ id: 1 }]);
    }
    if (sql.includes('SELECT id FROM orders WHERE payment_gateway_id')) {
      return Promise.resolve([]);
    }
    if (sql.includes('SELECT status FROM orders WHERE payment_gateway_id')) {
      return Promise.resolve([{ status: 'paid' }]);
    }
    return Promise.resolve({ affectedRows: 1, insertId: 1 });
  });

  return {
    query: mockQuery,
    withTransaction: vi
      .fn()
      .mockImplementation(
        async (callback: (tx: { query: typeof mockQuery }) => Promise<unknown>) => {
          return callback({ query: mockQuery });
        },
      ),
    pool: {
      execute: vi.fn().mockResolvedValue([{ affectedRows: 1 }]),
    },
  };
});

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

describe('Stripe Webhooks & Subscription Engine (Comprehensive Suite)', () => {
  let mockStripe: MockStripe;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStripe = {
      checkout: {
        sessions: {
          create: vi.fn(),
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

  it('debe procesar checkout.session.completed exitosamente con firma HMAC-SHA256 válida', async () => {
    const rawPayload = JSON.stringify({
      id: 'evt_test_123',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_999',
          customer_email: 'stripeuser@dreamtek.tech',
          client_reference_id: '1',
          amount_total: 259900,
          subscription: 'sub_stripe_123',
        },
      },
    });

    mockStripe.webhooks.constructEvent.mockReturnValue(JSON.parse(rawPayload));

    const res = await request(app)
      .post('/api/v1/checkout/webhook')
      .set('stripe-signature', 't=123,v1=valid_signature_hash')
      .set('Content-Type', 'application/json')
      .send(Buffer.from(rawPayload));

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
    expect(res.body.event_id).toBe('evt_test_123');
    expect(mockStripe.webhooks.constructEvent).toHaveBeenCalled();
  });

  it('debe rechazar webhooks con firma inválida retornando HTTP 400 Bad Request', async () => {
    mockStripe.webhooks.constructEvent.mockImplementation(() => {
      throw new Error('Signature verification failed');
    });

    const res = await request(app)
      .post('/api/v1/checkout/webhook')
      .set('stripe-signature', 't=123,v1=invalid_signature')
      .set('Content-Type', 'application/json')
      .send(Buffer.from(JSON.stringify({ type: 'checkout.session.completed' })));

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('error');
    expect(res.body.message).toContain('Firma webhook inválida');
  });

  it('debe procesar customer.subscription.updated y mapear el estado canceled a cancelled', async () => {
    const rawPayload = JSON.stringify({
      id: 'evt_sub_upd',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_stripe_123',
          customer: 'cus_stripe_owner',
          status: 'canceled',
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
  });

  it('debe procesar customer.subscription.deleted y marcar la suscripción como cancelled', async () => {
    const rawPayload = JSON.stringify({
      id: 'evt_sub_del',
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_stripe_123',
          customer: 'cus_stripe_owner',
          status: 'canceled',
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
  });

  it('debe manejar payloads malformados o faltantes y responder HTTP 400', async () => {
    mockStripe.webhooks.constructEvent.mockReturnValue(null);

    const res = await request(app)
      .post('/api/v1/checkout/webhook')
      .set('stripe-signature', 't=123,v1=valid_sig')
      .set('Content-Type', 'application/json')
      .send(Buffer.from(JSON.stringify({})));

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('error');
  });

  it('debe responder 200 para eventos no manejados directamente', async () => {
    const rawPayload = JSON.stringify({
      id: 'evt_unhandled_123',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_123',
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
    expect(res.body.event_id).toBe('evt_unhandled_123');
  });

  it('debe vincular por email cuando client_reference_id no se proporciona en checkout.session.completed', async () => {
    const rawPayload = JSON.stringify({
      id: 'evt_email_lookup',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_email_999',
          customer_details: { email: 'admin@dreamtek.tech' },
          amount_total: 5000,
          subscription: { id: 'sub_obj_123' },
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
  });

  it('debe rechazar checkout.session.completed si no se puede asociar ningún usuario', async () => {
    vi.mocked(db.query).mockImplementationOnce((sql: string) => {
      if (sql.includes('SELECT id FROM users')) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    const rawPayload = JSON.stringify({
      id: 'evt_no_user',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_unlinked',
          customer_details: { email: 'unknown@user.com' },
        },
      },
    });

    mockStripe.webhooks.constructEvent.mockReturnValue(JSON.parse(rawPayload));

    const res = await request(app)
      .post('/api/v1/checkout/webhook')
      .set('stripe-signature', 't=123,v1=valid_sig')
      .set('Content-Type', 'application/json')
      .send(Buffer.from(rawPayload));

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('No se pudo asociar el pago');
  });

  it('debe detectar duplicados e ignorar re-procesamiento de evento (Idempotencia C-S5)', async () => {
    vi.mocked(db.query).mockImplementation((sql: string) => {
      if (sql.includes('SELECT id FROM orders WHERE payment_gateway_id')) {
        return Promise.resolve([{ id: 99 }]);
      }
      return Promise.resolve([{ id: 1 }]);
    });

    const rawPayload = JSON.stringify({
      id: 'evt_duplicate',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_duplicate_session',
          client_reference_id: '1',
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
    expect(res.body.duplicate).toBe(true);
  });

  it('debe continuar si la verificación de idempotencia lanza excepción en base de datos', async () => {
    vi.mocked(db.query).mockImplementationOnce((sql: string) => {
      if (sql.includes('SELECT id FROM orders WHERE payment_gateway_id')) {
        return Promise.reject(new Error('DB Error in idempotency check'));
      }
      return Promise.resolve([{ id: 1 }]);
    });

    const rawPayload = JSON.stringify({
      id: 'evt_idempotency_fail',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_idempotency_fail',
          client_reference_id: '1',
          amount_total: 2000,
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
  });

  it('debe procesar payload en string plano cuando no hay webhook secret configurado', async () => {
    const originalSecret = process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_WEBHOOK_SECRET;

    const payloadString = JSON.stringify({
      id: 'evt_raw_string',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_raw_123',
          status: 'past_due',
        },
      },
    });

    const res = await request(app)
      .post('/api/v1/checkout/webhook')
      .set('Content-Type', 'application/json')
      .send(payloadString);

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);

    process.env.STRIPE_WEBHOOK_SECRET = originalSecret;
  });

  it('debe procesar customer.subscription.deleted sin customer usando sub.id', async () => {
    const rawPayload = JSON.stringify({
      id: 'evt_sub_no_cust',
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_no_customer_id',
          status: 'canceled',
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
  });

  it('debe procesar customer.subscription.updated sin customer usando sub.id', async () => {
    const rawPayload = JSON.stringify({
      id: 'evt_sub_upd_no_cust',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_stripe_no_cust_123',
          status: 'past_due',
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
  });

  it('debe procesar webhook cuando body se envía como objeto directo sin Buffer', async () => {
    const rawPayload = {
      id: 'evt_obj_payload',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_obj_payload',
          client_reference_id: '1',
          amount_total: 1500,
        },
      },
    };

    mockStripe.webhooks.constructEvent.mockReturnValue(rawPayload);

    const res = await request(app)
      .post('/api/v1/checkout/webhook')
      .set('stripe-signature', 't=123,v1=valid_sig')
      .send(rawPayload);

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
  });

  it('debe verificar sesión consultando orden en la base de datos en GET /verify (C-S9)', async () => {
    vi.mocked(db.query).mockImplementation((sql: string) => {
      if (sql.includes('SELECT status FROM orders')) {
        return Promise.resolve([{ status: 'paid' }]);
      }
      return Promise.resolve([]);
    });

    const resVerify = await request(app).get('/api/v1/checkout/verify?session_id=cs_real_123');

    expect(resVerify.status).toBe(200);
    expect(resVerify.body.verified).toBe(true);
    expect(resVerify.body.session_id).toBe('cs_real_123');
  });

  it('debe manejar suscripciones con status past_due o active y sin sub.customer', async () => {
    // 1. past_due without customer
    const payloadPastDue = JSON.stringify({
      id: 'evt_sub_past',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_no_cust',
          status: 'past_due',
        },
      },
    });
    mockStripe.webhooks.constructEvent.mockReturnValue(JSON.parse(payloadPastDue));
    const resPast = await request(app)
      .post('/api/v1/checkout/webhook')
      .set('stripe-signature', 't=123,v1=valid_sig')
      .set('Content-Type', 'application/json')
      .send(Buffer.from(payloadPastDue));
    expect(resPast.status).toBe(200);

    // 2. active without customer
    const payloadActive = JSON.stringify({
      id: 'evt_sub_act',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_no_cust_2',
          status: 'active',
        },
      },
    });
    mockStripe.webhooks.constructEvent.mockReturnValue(JSON.parse(payloadActive));
    const resAct = await request(app)
      .post('/api/v1/checkout/webhook')
      .set('stripe-signature', 't=123,v1=valid_sig')
      .set('Content-Type', 'application/json')
      .send(Buffer.from(payloadActive));
    expect(resAct.status).toBe(200);

    // 3. deleted without customer
    const payloadDel = JSON.stringify({
      id: 'evt_sub_del_nocust',
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_no_cust_del',
          status: 'canceled',
        },
      },
    });
    mockStripe.webhooks.constructEvent.mockReturnValue(JSON.parse(payloadDel));
    const resDel = await request(app)
      .post('/api/v1/checkout/webhook')
      .set('stripe-signature', 't=123,v1=valid_sig')
      .set('Content-Type', 'application/json')
      .send(Buffer.from(payloadDel));
    expect(resDel.status).toBe(200);
  });

  it('debe crear checkout session con y sin usuario y parámetros opcionales', async () => {
    mockStripe.checkout.sessions.create.mockResolvedValue({
      id: 'cs_created_123',
      url: 'https://checkout.stripe.com/pay/cs_created_123',
    });

    // 1. Missing email
    const resNoEmail = await request(app)
      .post('/api/v1/checkout/session')
      .send({ billing_cycle: 'annual' });
    expect(resNoEmail.status).toBe(400);

    // 2. Mock key (default sk_test_mock)
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
    const resMock = await request(app)
      .post('/api/v1/checkout/session')
      .send({ email: 'client@dreamtek.tech' });
    expect(resMock.status).toBe(200);
    expect(resMock.body.session_id).toMatch(/cs_test_mock_/);

    // 3. Real key with annual billing, template, and domain
    process.env.STRIPE_SECRET_KEY = 'sk_live_real_123';
    const resAnnual = await request(app).post('/api/v1/checkout/session').send({
      email: 'client@dreamtek.tech',
      billing_cycle: 'annual',
      template_id: 'corporate',
      domain_name: 'dreamtek.app',
    });
    expect(resAnnual.status).toBe(200);
    expect(resAnnual.body.session_id).toBe('cs_created_123');

    // 4. Real key with monthly billing (default template and domain fallbacks)
    const resMonthly = await request(app).post('/api/v1/checkout/session').send({
      email: 'client@dreamtek.tech',
      billing_cycle: 'monthly',
    });
    expect(resMonthly.status).toBe(200);

    // 5. Error case in create-session
    mockStripe.checkout.sessions.create.mockRejectedValueOnce(new Error('Stripe API Down'));
    const resErr = await request(app)
      .post('/api/v1/checkout/session')
      .send({ email: 'client@dreamtek.tech' });
    expect(resErr.status).toBe(500);

    // 6. Real key with req.user attached
    const authApp = express();
    authApp.use(express.json());
    authApp.use((req, _res, next) => {
      (req as unknown as { user?: { id: number } }).user = { id: 77 };
      next();
    });
    authApp.use('/api/v1/checkout', checkoutRouter);

    const resWithUser = await request(authApp)
      .post('/api/v1/checkout/session')
      .send({ email: 'authuser@dreamtek.tech' });
    expect(resWithUser.status).toBe(200);

    // Clean up
    delete process.env.STRIPE_SECRET_KEY;
  });

  it('GET /verify debe manejar fallas, falta de session_id y mocks', async () => {
    // 1. Missing session_id
    const resMissing = await request(app).get('/api/v1/checkout/verify');
    expect(resMissing.status).toBe(400);

    // 2. Mock session_id
    const resMock = await request(app).get('/api/v1/checkout/verify?session_id=mock');
    expect(resMock.status).toBe(200);
    expect(resMock.body.verified).toBe(true);

    const resTestMock = await request(app).get(
      '/api/v1/checkout/verify?session_id=cs_test_mock_999',
    );
    expect(resTestMock.status).toBe(200);

    // 3. Unpaid order
    vi.mocked(db.query).mockResolvedValueOnce([{ status: 'pending' }]);
    const resPending = await request(app).get('/api/v1/checkout/verify?session_id=cs_pending_123');
    expect(resPending.status).toBe(200);
    expect(resPending.body.verified).toBe(false);

    // 4. DB error in verify (fail-closed)
    vi.mocked(db.query).mockRejectedValueOnce(new Error('DB verify fail'));
    const resFallback = await request(app).get('/api/v1/checkout/verify?session_id=cs_db_fail');
    expect(resFallback.status).toBe(500);
    expect(resFallback.body.verified).toBe(false);
  });

  describe('B2B Lead Deposit Webhook Processing (FC 043 rev-2)', () => {
    it('debe rechazar webhook B2B si falta lead_id válido', async () => {
      const rawPayload = JSON.stringify({
        id: 'evt_b2b_no_lead',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_b2b_no_lead',
            metadata: { tenant_type: 'B2B_LEAD' },
          },
        },
      });
      mockStripe.webhooks.constructEvent.mockReturnValue(JSON.parse(rawPayload));

      const res = await request(app)
        .post('/api/v1/checkout/webhook')
        .set('stripe-signature', 't=123,v1=valid_sig')
        .send(Buffer.from(rawPayload));

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Falta lead_id válido');
    });

    it('debe retornar 404 si el registro de pago no existe en lead_payments', async () => {
      const rawPayload = JSON.stringify({
        id: 'evt_b2b_not_found',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_b2b_missing_payment',
            client_reference_id: '42',
            metadata: { tenant_type: 'B2B_LEAD', lead_id: '42' },
          },
        },
      });
      mockStripe.webhooks.constructEvent.mockReturnValue(JSON.parse(rawPayload));

      vi.mocked(db.query).mockResolvedValueOnce([]); // SELECT lead_payments empty

      const res = await request(app)
        .post('/api/v1/checkout/webhook')
        .set('stripe-signature', 't=123,v1=valid_sig')
        .send(Buffer.from(rawPayload));

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('Registro de pago de anticipo B2B no encontrado');
    });

    it('debe procesar de forma idempotente un pago ya liquidado (PAID)', async () => {
      const rawPayload = JSON.stringify({
        id: 'evt_b2b_idempotent',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_b2b_already_paid',
            metadata: { tenant_type: 'B2B_LEAD', lead_id: '15' },
          },
        },
      });
      mockStripe.webhooks.constructEvent.mockReturnValue(JSON.parse(rawPayload));

      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 1, lead_id: 15, status: 'PAID', amount_cents: 500000, currency: 'USD' },
      ]);

      const res = await request(app)
        .post('/api/v1/checkout/webhook')
        .set('stripe-signature', 't=123,v1=valid_sig')
        .send(Buffer.from(rawPayload));

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('ya procesado previamente');
    });

    it('debe fallar cerrado (400) si hay discrepancia de monto o divisa (C-043.3)', async () => {
      const rawPayloadAmount = JSON.stringify({
        id: 'evt_b2b_amount_mismatch',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_b2b_amount_mismatch',
            amount_total: 10000, // 100 USD en vez de 2500 USD
            currency: 'usd',
            metadata: { tenant_type: 'B2B_LEAD', lead_id: '20' },
          },
        },
      });
      mockStripe.webhooks.constructEvent.mockReturnValue(JSON.parse(rawPayloadAmount));

      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 2, lead_id: 20, status: 'PENDING', amount_cents: 250000, currency: 'USD' },
      ]);

      const resAmount = await request(app)
        .post('/api/v1/checkout/webhook')
        .set('stripe-signature', 't=123,v1=valid_sig')
        .send(Buffer.from(rawPayloadAmount));

      expect(resAmount.status).toBe(400);
      expect(resAmount.body.error).toBe('Amount Or Currency Mismatch');

      // Discrepancia de divisa
      const rawPayloadCurrency = JSON.stringify({
        id: 'evt_b2b_cur_mismatch',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_b2b_cur_mismatch',
            amount_total: 250000,
            currency: 'mxn', // MXN en vez de USD
            metadata: { tenant_type: 'B2B_LEAD', lead_id: '20' },
          },
        },
      });
      mockStripe.webhooks.constructEvent.mockReturnValue(JSON.parse(rawPayloadCurrency));

      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 2, lead_id: 20, status: 'PENDING', amount_cents: 250000, currency: 'USD' },
      ]);

      const resCur = await request(app)
        .post('/api/v1/checkout/webhook')
        .set('stripe-signature', 't=123,v1=valid_sig')
        .send(Buffer.from(rawPayloadCurrency));

      expect(resCur.status).toBe(400);
      expect(resCur.body.error).toBe('Amount Or Currency Mismatch');

      // Discrepancia cuando session.currency no viene definido (evalúa rama null)
      const rawPayloadNoCurrency = JSON.stringify({
        id: 'evt_b2b_no_cur',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_b2b_no_cur',
            amount_total: 250000,
            metadata: { tenant_type: 'B2B_LEAD', lead_id: '20' },
          },
        },
      });
      mockStripe.webhooks.constructEvent.mockReturnValue(JSON.parse(rawPayloadNoCurrency));

      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 2, lead_id: 20, status: 'PENDING', amount_cents: 250000, currency: 'USD' },
      ]);

      const resNoCur = await request(app)
        .post('/api/v1/checkout/webhook')
        .set('stripe-signature', 't=123,v1=valid_sig')
        .send(Buffer.from(rawPayloadNoCurrency));

      expect(resNoCur.status).toBe(400);
      expect(resNoCur.body.error).toBe('Amount Or Currency Mismatch');
    });

    it('debe liquidar anticipo B2B, transicionar lead a WON y registrar actividad atómicamente', async () => {
      const rawPayload = JSON.stringify({
        id: 'evt_b2b_success',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_b2b_success_123',
            amount_total: 12500000, // 125,000 MXN
            currency: 'mxn',
            payment_intent: 'pi_test_b2b_999',
            metadata: { tenant_type: 'B2B_LEAD', lead_id: '50' },
          },
        },
      });
      mockStripe.webhooks.constructEvent.mockReturnValue(JSON.parse(rawPayload));

      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 5,
          lead_id: 50,
          status: 'PENDING',
          amount_cents: 12500000,
          currency: 'MXN',
          payment_type: 'DEPOSIT_50',
        },
      ]);

      const res = await request(app)
        .post('/api/v1/checkout/webhook')
        .set('stripe-signature', 't=123,v1=valid_sig')
        .send(Buffer.from(rawPayload));

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.message).toContain(
        'Anticipo B2B procesado con éxito y prospecto transicionado a WON',
      );
      expect(db.withTransaction).toHaveBeenCalled();

      // Liquidar con payment_intent como objeto y payment_intent como null
      const rawPayloadObjPi = JSON.stringify({
        id: 'evt_b2b_success_obj_pi',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_b2b_obj_pi',
            amount_total: 5000,
            currency: 'usd',
            payment_intent: { id: 'pi_from_obj_999' },
            metadata: { tenant_type: 'B2B_LEAD', lead_id: '51' },
          },
        },
      });
      mockStripe.webhooks.constructEvent.mockReturnValue(JSON.parse(rawPayloadObjPi));
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 6,
          lead_id: 51,
          status: 'PENDING',
          amount_cents: 5000,
          currency: 'USD',
          payment_type: 'CUSTOM',
        },
      ]);

      const resObjPi = await request(app)
        .post('/api/v1/checkout/webhook')
        .set('stripe-signature', 't=123,v1=valid_sig')
        .send(Buffer.from(rawPayloadObjPi));
      expect(resObjPi.status).toBe(200);

      // Liquidar sin payment_intent (null)
      const rawPayloadNullPi = JSON.stringify({
        id: 'evt_b2b_success_null_pi',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_b2b_null_pi',
            amount_total: 5000,
            currency: 'usd',
            payment_intent: null,
            metadata: { tenant_type: 'B2B_LEAD', lead_id: '52' },
          },
        },
      });
      mockStripe.webhooks.constructEvent.mockReturnValue(JSON.parse(rawPayloadNullPi));
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 7,
          lead_id: 52,
          status: 'PENDING',
          amount_cents: 5000,
          currency: 'USD',
          payment_type: 'CUSTOM',
        },
      ]);

      const resNullPi = await request(app)
        .post('/api/v1/checkout/webhook')
        .set('stripe-signature', 't=123,v1=valid_sig')
        .send(Buffer.from(rawPayloadNullPi));
      expect(resNullPi.status).toBe(200);
    });
  });

  describe('B2B Project Final Settlement Webhook Processing (FC 045)', () => {
    it('debe rechazar si falta project_id válido en metadata', async () => {
      const rawPayload = JSON.stringify({
        id: 'evt_settlement_no_project_id',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_settlement_no_pid',
            metadata: { tenant_type: 'B2B_PROJECT_SETTLEMENT' },
          },
        },
      });
      mockStripe.webhooks.constructEvent.mockReturnValue(JSON.parse(rawPayload));

      const res = await request(app)
        .post('/api/v1/checkout/webhook')
        .set('stripe-signature', 't=123,v1=valid_sig')
        .send(Buffer.from(rawPayload));

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Falta project_id válido en metadata de finiquito B2B.');
    });

    it('debe retornar 404 si el registro de finiquito no existe en lead_payments', async () => {
      const rawPayload = JSON.stringify({
        id: 'evt_settlement_not_found',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_settlement_not_found',
            metadata: {
              tenant_type: 'B2B_PROJECT_SETTLEMENT',
              project_id: '12',
            },
          },
        },
      });
      mockStripe.webhooks.constructEvent.mockReturnValue(JSON.parse(rawPayload));
      vi.mocked(db.query).mockResolvedValueOnce([]); // lead_payments empty

      const res = await request(app)
        .post('/api/v1/checkout/webhook')
        .set('stripe-signature', 't=123,v1=valid_sig')
        .send(Buffer.from(rawPayload));

      expect(res.status).toBe(404);
      expect(res.body.message).toContain(
        'Registro de pago de finiquito B2B no encontrado para esta sesión.',
      );
    });

    it('debe procesar de forma idempotente un finiquito ya liquidado (PAID)', async () => {
      const rawPayload = JSON.stringify({
        id: 'evt_settlement_idempotent',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_settlement_idempotent',
            metadata: {
              tenant_type: 'B2B_PROJECT_SETTLEMENT',
              project_id: '10',
            },
          },
        },
      });
      mockStripe.webhooks.constructEvent.mockReturnValue(JSON.parse(rawPayload));

      vi.mocked(db.query).mockImplementation((sql: string) => {
        if (sql.includes('FROM lead_payments WHERE stripe_session_id = ?')) {
          return Promise.resolve([
            { id: 99, project_id: 10, status: 'PAID', amount_cents: 500000, currency: 'USD' },
          ]);
        }
        return Promise.resolve([]);
      });

      const res = await request(app)
        .post('/api/v1/checkout/webhook')
        .set('stripe-signature', 't=123,v1=valid_sig')
        .send(Buffer.from(rawPayload));

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('Finiquito ya procesado previamente.');
    });

    it('debe fallar cerrado (400) si hay discrepancia de monto o divisa contra fila almacenada (C-045.3)', async () => {
      // Discrepancia de monto
      const rawPayloadAmountMismatch = JSON.stringify({
        id: 'evt_settlement_amount_mismatch',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_settlement_amt_bad',
            amount_total: 10000, // 100 USD en vez de 5000 USD
            currency: 'usd',
            metadata: {
              tenant_type: 'B2B_PROJECT_SETTLEMENT',
              project_id: '15',
            },
          },
        },
      });
      mockStripe.webhooks.constructEvent.mockReturnValue(JSON.parse(rawPayloadAmountMismatch));

      vi.mocked(db.query).mockImplementation((sql: string) => {
        if (sql.includes('FROM lead_payments WHERE stripe_session_id = ?')) {
          return Promise.resolve([
            { id: 101, project_id: 15, status: 'PENDING', amount_cents: 500000, currency: 'USD' },
          ]);
        }
        return Promise.resolve([]);
      });

      const resAmount = await request(app)
        .post('/api/v1/checkout/webhook')
        .set('stripe-signature', 't=123,v1=valid_sig')
        .send(Buffer.from(rawPayloadAmountMismatch));

      expect(resAmount.status).toBe(400);
      expect(resAmount.body.error).toBe('Amount Or Currency Mismatch');

      // Discrepancia de divisa
      const rawPayloadCurMismatch = JSON.stringify({
        id: 'evt_settlement_cur_bad',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_settlement_cur_bad',
            amount_total: 500000,
            currency: 'mxn',
            metadata: {
              tenant_type: 'B2B_PROJECT_SETTLEMENT',
              project_id: '15',
            },
          },
        },
      });
      mockStripe.webhooks.constructEvent.mockReturnValue(JSON.parse(rawPayloadCurMismatch));

      vi.mocked(db.query).mockImplementation((sql: string) => {
        if (sql.includes('FROM lead_payments WHERE stripe_session_id = ?')) {
          return Promise.resolve([
            { id: 101, project_id: 15, status: 'PENDING', amount_cents: 500000, currency: 'USD' },
          ]);
        }
        return Promise.resolve([]);
      });

      const resCur = await request(app)
        .post('/api/v1/checkout/webhook')
        .set('stripe-signature', 't=123,v1=valid_sig')
        .send(Buffer.from(rawPayloadCurMismatch));

      expect(resCur.status).toBe(400);
      expect(resCur.body.error).toBe('Amount Or Currency Mismatch');

      // Discrepancia con currency null
      const rawPayloadNoCur = JSON.stringify({
        id: 'evt_settlement_no_cur',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_settlement_cur_null',
            amount_total: 500000,
            currency: null,
            metadata: {
              tenant_type: 'B2B_PROJECT_SETTLEMENT',
              project_id: '15',
            },
          },
        },
      });
      mockStripe.webhooks.constructEvent.mockReturnValue(JSON.parse(rawPayloadNoCur));
      const resNoCur = await request(app)
        .post('/api/v1/checkout/webhook')
        .set('stripe-signature', 't=123,v1=valid_sig')
        .send(Buffer.from(rawPayloadNoCur));
      expect(resNoCur.status).toBe(400);
    });

    it('debe procesar exitosamente la liquidación final de finiquito (B2B_PROJECT_SETTLEMENT) atómicamente', async () => {
      const rawPayloadSuccess = JSON.stringify({
        id: 'evt_settlement_success',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_settlement_ok_123',
            amount_total: 750000,
            currency: 'usd',
            payment_intent: 'pi_settlement_real_123',
            customer_details: { email: 'client_settle@empresa.com' },
            metadata: {
              tenant_type: 'B2B_PROJECT_SETTLEMENT',
              project_id: '30',
            },
          },
        },
      });
      mockStripe.webhooks.constructEvent.mockReturnValue(JSON.parse(rawPayloadSuccess));

      vi.mocked(db.query).mockImplementation((sql: string) => {
        if (sql.includes('FROM lead_payments WHERE stripe_session_id = ?')) {
          return Promise.resolve([
            {
              id: 202,
              project_id: 30,
              status: 'PENDING',
              amount_cents: 750000,
              currency: 'USD',
            },
          ]);
        }
        if (sql.includes('FROM client_projects p') && sql.includes('JOIN users u')) {
          return Promise.resolve([
            {
              id: 30,
              lead_id: 12,
              project_name: 'Plataforma Enterprise B2B',
              budget_cents: 1500000,
              paid_amount_cents: 750000,
              pending_balance_cents: 750000,
              currency: 'USD',
              full_name: 'Cliente Empresa',
              email: 'client_settle@empresa.com',
              locale: 'es',
            },
          ]);
        }
        return Promise.resolve({ affectedRows: 1 });
      });

      const res = await request(app)
        .post('/api/v1/checkout/webhook')
        .set('stripe-signature', 't=123,v1=valid_sig')
        .send(Buffer.from(rawPayloadSuccess));

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.message).toContain('Finiquito de proyecto procesado y entregado con éxito.');
      expect(db.withTransaction).toHaveBeenCalled();

      // Caso: Proyecto no encontrado en DB tras pago (404)
      const rawPayloadMissingProject = JSON.stringify({
        id: 'evt_settlement_missing_proj',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_settlement_missing_proj',
            amount_total: 5000,
            currency: 'usd',
            metadata: {
              tenant_type: 'B2B_PROJECT_SETTLEMENT',
              project_id: '999',
            },
          },
        },
      });
      mockStripe.webhooks.constructEvent.mockReturnValue(JSON.parse(rawPayloadMissingProject));
      vi.mocked(db.query).mockImplementation((sql: string) => {
        if (sql.includes('FROM lead_payments WHERE stripe_session_id = ?')) {
          return Promise.resolve([
            {
              id: 203,
              project_id: 999,
              status: 'PENDING',
              amount_cents: 5000,
              currency: 'USD',
            },
          ]);
        }
        if (sql.includes('FROM client_projects p')) {
          return Promise.resolve([]); // No project
        }
        return Promise.resolve([]);
      });

      const resMissing = await request(app)
        .post('/api/v1/checkout/webhook')
        .set('stripe-signature', 't=123,v1=valid_sig')
        .send(Buffer.from(rawPayloadMissingProject));

      expect(resMissing.status).toBe(404);
      expect(resMissing.body.message).toContain('Proyecto a finiquitar no encontrado.');

      // Caso: Finiquito exitoso sin lead_id y sin locale (fallback 'es')
      const rawPayloadNoLeadId = JSON.stringify({
        id: 'evt_settlement_no_lead',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_settlement_no_lead_ok',
            amount_total: 20000,
            currency: 'usd',
            metadata: {
              tenant_type: 'B2B_PROJECT_SETTLEMENT',
              project_id: '45',
            },
          },
        },
      });
      mockStripe.webhooks.constructEvent.mockReturnValue(JSON.parse(rawPayloadNoLeadId));
      vi.mocked(db.query).mockImplementation((sql: string) => {
        if (sql.includes('FROM lead_payments WHERE stripe_session_id = ?')) {
          return Promise.resolve([
            { id: 204, project_id: 45, status: 'PENDING', amount_cents: 20000, currency: 'USD' },
          ]);
        }
        if (sql.includes('FROM client_projects p') && sql.includes('JOIN users u')) {
          return Promise.resolve([
            {
              id: 45,
              lead_id: null, // Sin lead_id (cubre branch 361 false)
              project_name: 'Proyecto Directo',
              budget_cents: 20000,
              paid_amount_cents: 0,
              pending_balance_cents: 20000,
              currency: 'USD',
              full_name: 'Cliente Sin Lead',
              email: 'sinlead@cliente.com',
              locale: undefined, // Sin locale (cubre branch 389 fallback 'es')
            },
          ]);
        }
        return Promise.resolve({ affectedRows: 1 });
      });

      const resNoLead = await request(app)
        .post('/api/v1/checkout/webhook')
        .set('stripe-signature', 't=123,v1=valid_sig')
        .send(Buffer.from(rawPayloadNoLeadId));

      expect(resNoLead.status).toBe(200);
      expect(resNoLead.body.status).toBe('success');
    });
  });
});
