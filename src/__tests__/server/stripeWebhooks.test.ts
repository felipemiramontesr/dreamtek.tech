import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import app from '../../../server/src/index';
import { setStripeForTest } from '../../../server/src/routes/checkout';
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
});
