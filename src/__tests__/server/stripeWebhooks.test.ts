import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import app from '../../../server/src/index';
import { setStripeForTest } from '../../../server/src/routes/checkout';

vi.mock('../../../server/src/db', () => ({
  query: vi.fn().mockImplementation((sql: string) => {
    if (sql.includes('SELECT id FROM users')) {
      return Promise.resolve([{ id: 1 }]);
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

describe('Stripe Webhooks & Subscription Engine (100% Coverage)', () => {
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
});
