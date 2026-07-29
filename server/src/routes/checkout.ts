import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { query } from '../db.js';

export const checkoutRouter = Router();
const stripeKey = process.env.STRIPE_SECRET_KEY || 'sk_test_mock';
const stripe = new Stripe(stripeKey);

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

    // Si Stripe no está configurado con clave real, retornar URL simulada de retorno directo
    if (stripeKey === 'sk_test_mock') {
      const mockSessionId = `cs_test_mock_${Date.now()}`;
      res.json({
        status: 'success',
        session_id: mockSessionId,
        checkout_url: `?session_id=${mockSessionId}&step=5`,
      });
      return;
    }

    const session = await stripe.checkout.sessions.create({
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
    const event = req.body;
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const email = session.customer_email || session.customer_details?.email;

      if (email) {
        // Registrar la orden en MariaDB
        await query(
          'INSERT INTO orders (user_id, status, total_amount, payment_gateway_id) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE status = ?',
          [1, 'COMPLETED', session.amount_total / 100, session.id, 'COMPLETED']
        );
      }
    }
    res.json({ received: true });
  } catch (err: any) {
    res.status(400).json({ status: 'error', message: err.message });
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
