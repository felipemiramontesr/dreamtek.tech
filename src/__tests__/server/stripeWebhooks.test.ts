import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import app from '../../../server/src/index';
import { setStripeForTest, checkoutRouter } from '../../../server/src/routes/checkout';
import * as db from '../../../server/src/db';

vi.mock('../../../server/src/db', () => ({
  query: vi.fn().mockImplementation((sql: string) => {
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
  }),
  pool: {
    execute: vi.fn().mockResolvedValue([{ affectedRows: 1 }]),
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

    // 4. DB error in verify (fallback to success)
    vi.mocked(db.query).mockRejectedValueOnce(new Error('DB verify fail'));
    const resFallback = await request(app).get('/api/v1/checkout/verify?session_id=cs_db_fail');
    expect(resFallback.status).toBe(200);
    expect(resFallback.body.verified).toBe(true);
  });
});
