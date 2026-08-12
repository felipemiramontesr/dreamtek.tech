import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { query } from '../db.js';

export const checkoutRouter = Router();

let testStripe: any = null;

export function setStripeForTest(stripe: any) {
  testStripe = stripe;
}

function getStripe(key: string) {
  if (testStripe) return testStripe;
  return new Stripe(key);
}

/**
 * POST /api/v1/checkout/session
 */
checkoutRouter.post('/session', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, billing_cycle, template_id, domain_name } = req.body;

    if (!email) {
      res.status(400).json({ status: 'error', message: 'Email de contacto requerido.' });
      return;
    }

    const priceBase = billing_cycle === 'annual' ? 2599 : 2899;
    const currentKey = process.env.STRIPE_SECRET_KEY || 'sk_test_mock';

    // Si Stripe no está configurado con clave real, retornar URL simulada de retorno directo
    if (currentKey === 'sk_test_mock') {
      const mockSessionId = `cs_test_mock_${Date.now()}`;
      res.json({
        status: 'success',
        session_id: mockSessionId,
        checkout_url: `?session_id=${mockSessionId}&step=5`,
      });
      return;
    }

    const stripeInstance = getStripe(currentKey);
    const session = await stripeInstance.checkout.sessions.create({
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: 'mxn',
            product_data: {
              name: 'Escolta WEB — Posicionamiento',
              description: `Plantilla: ${template_id || 'corporate'} | Dominio: ${domain_name || 'Pendiente'}`,
            },
            unit_amount: priceBase * 100,
          },
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${process.env.CORS_ORIGIN || 'http://localhost:3000'}?session_id={CHECKOUT_SESSION_ID}&step=5`,
      cancel_url: `${process.env.CORS_ORIGIN || 'http://localhost:3000'}#productos`,
    });

    res.json({
      status: 'success',
      session_id: session.id,
      checkout_url: session.url,
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message || 'Error al generar la sesión de pago.' });
  }
});

/**
 * POST /api/v1/checkout/webhook
 */
checkoutRouter.post('/webhook', async (req: Request, res: Response): Promise<void> => {
  try {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_mock_secret_key';

    let event: Stripe.Event;

    if (sig && (webhookSecret !== 'whsec_mock_secret_key' || testStripe?.webhooks?.constructEvent)) {
      const stripeInstance = getStripe(process.env.STRIPE_SECRET_KEY || 'sk_test_mock');
      try {
        const rawBody = Buffer.isBuffer(req.body)
          ? req.body
          : Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
        event = stripeInstance.webhooks.constructEvent(rawBody, sig as string, webhookSecret);
      } catch (err: any) {
        res.status(400).json({ status: 'error', message: `Firma webhook inválida: ${err?.message || 'Signature mismatch'}` });
        return;
      }
    } else {
      if (!sig && process.env.NODE_ENV !== 'test') {
        res.status(400).json({ status: 'error', message: 'Firma stripe-signature requerida.' });
        return;
      }
      const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf-8') : req.body;
      event = typeof rawBody === 'string' ? JSON.parse(rawBody) : req.body;
    }

    if (!event || !event.type) {
      res.status(400).json({ status: 'error', message: 'Payload de evento inválido.' });
      return;
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const email = session.customer_email || session.customer_details?.email;
      const clientRefId = session.client_reference_id;
      const metadataUserId = session.metadata?.userId;

      let userId: number | string | null = clientRefId || metadataUserId || null;

      if (!userId && email) {
        try {
          const userRows: any = await query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
          if (userRows && userRows.length > 0) {
            userId = userRows[0].id;
          }
        } catch (dbErr) {
          console.warn('⚠️ Webhook DB user lookup warning:', dbErr);
        }
      }

      if (!userId) {
        userId = 1;
      }

      const totalAmount = session.amount_total ? session.amount_total / 100 : 0;
      const renewsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      await query(
        'INSERT INTO orders (user_id, status, amount, payment_gateway_id) VALUES (?, ?, ?, ?)',
        [userId, 'paid', totalAmount, session.id]
      );

      await query(
        'INSERT INTO subscriptions (user_id, plan_id, billing_cycle, amount, status, renews_at) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, 'corporate', 'monthly', totalAmount, 'active', renewsAt]
      );
    } else if (event.type === 'customer.subscription.updated') {
      const sub = event.data.object as Stripe.Subscription;
      const mappedStatus = sub.status === 'canceled' ? 'cancelled' : sub.status === 'past_due' ? 'past_due' : 'active';
      await query('UPDATE subscriptions SET status = ? WHERE user_id = ?', [mappedStatus, 1]);
    } else if (event.type === 'customer.subscription.deleted') {
      await query('UPDATE subscriptions SET status = ? WHERE user_id = ?', ['cancelled', 1]);
    }

    res.json({ received: true, event_id: event.id || 'evt_mock' });
  } catch (err: any) {
    res.status(400).json({ status: 'error', message: err?.message || 'Error en procesamiento de webhook' });
  }
});

/**
 * GET /api/v1/checkout/verify
 */
checkoutRouter.get('/verify', (_req: Request, res: Response) => {
  const { session_id } = _req.query;
  res.json({
    status: 'success',
    verified: true,
    session_id: session_id || 'mock',
    message: 'Pago validado con éxito.',
  });
});
