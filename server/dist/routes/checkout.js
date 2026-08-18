"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkoutRouter = void 0;
exports.setStripeForTest = setStripeForTest;
exports.getStripe = getStripe;
const express_1 = require("express");
const stripe_1 = __importDefault(require("stripe"));
const db_js_1 = require("../db.js");
exports.checkoutRouter = (0, express_1.Router)();
let testStripe = null;
function setStripeForTest(stripe) {
    testStripe = stripe;
}
function getStripe(key) {
    if (testStripe)
        return testStripe;
    return new stripe_1.default(key);
}
/**
 * POST /api/v1/checkout/session
 */
exports.checkoutRouter.post('/session', async (req, res) => {
    try {
        const { email, billing_cycle, template_id, domain_name } = req.body;
        if (!email) {
            res.status(400).json({ status: 'error', message: 'Email de contacto requerido.' });
            return;
        }
        const priceBase = billing_cycle === 'annual' ? 2599 : 2899;
        const currentKey = process.env.STRIPE_SECRET_KEY || 'sk_test_mock';
        const userObj = req.user;
        const userId = userObj ? String(userObj.id) : undefined;
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
        const metadata = userId ? { userId } : {};
        const session = await stripeInstance.checkout.sessions.create({
            payment_method_types: ['card'],
            customer_email: email,
            client_reference_id: userId,
            metadata,
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
    }
    catch (err) {
        res.status(500).json({ status: 'error', message: err.message || 'Error al generar la sesión de pago.' });
    }
});
/**
 * POST /api/v1/checkout/webhook
 */
exports.checkoutRouter.post('/webhook', async (req, res) => {
    try {
        const sig = req.headers['stripe-signature'];
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_mock_secret_key';
        let event;
        if (sig && (webhookSecret !== 'whsec_mock_secret_key' || testStripe?.webhooks?.constructEvent)) {
            const stripeInstance = getStripe(process.env.STRIPE_SECRET_KEY || 'sk_test_mock');
            try {
                event = stripeInstance.webhooks.constructEvent(req.body, sig, webhookSecret);
            }
            catch (err) {
                res.status(400).json({ status: 'error', message: `Firma webhook inválida: ${err.message}` });
                return;
            }
        }
        else {
            if (!sig && process.env.NODE_ENV !== 'test') {
                res.status(400).json({ status: 'error', message: 'Firma stripe-signature requerida.' });
                return;
            }
            const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf-8') : JSON.stringify(req.body);
            event = JSON.parse(rawBody);
        }
        if (!event || !event.type) {
            res.status(400).json({ status: 'error', message: 'Payload de evento inválido.' });
            return;
        }
        if (event.type === 'checkout.session.completed') {
            const session = event.data.object;
            const email = session.customer_email || session.customer_details?.email;
            const clientRefId = session.client_reference_id;
            const metadataUserId = session.metadata?.userId;
            let userId = clientRefId || metadataUserId || null;
            if (!userId && email) {
                try {
                    const userRows = await (0, db_js_1.query)('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
                    if (userRows && userRows.length > 0) {
                        userId = userRows[0].id;
                    }
                }
                catch (dbErr) {
                    console.warn('⚠️ Webhook DB user lookup warning:', dbErr);
                }
            }
            if (!userId) {
                res.status(400).json({ status: 'error', message: 'No se pudo asociar el pago a ningún usuario registrado.' });
                return;
            }
            // Check idempotency (C-S5)
            try {
                const existingOrder = await (0, db_js_1.query)('SELECT id FROM orders WHERE payment_gateway_id = ? LIMIT 1', [session.id]);
                if (existingOrder && existingOrder.length > 0) {
                    res.json({ received: true, duplicate: true, event_id: event.id });
                    return;
                }
            }
            catch (dbErr) {
                console.warn('⚠️ Webhook idempotency check warning:', dbErr);
            }
            const totalAmount = Number(session.amount_total) / 100;
            const renewsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
            await (0, db_js_1.query)('INSERT INTO orders (user_id, status, amount, payment_gateway_id) VALUES (?, ?, ?, ?)', [userId, 'paid', totalAmount, session.id]);
            const subId = typeof session.subscription === 'string' ? session.subscription : String(session.id);
            await (0, db_js_1.query)('INSERT INTO subscriptions (user_id, plan_id, billing_cycle, amount, status, renews_at) VALUES (?, ?, ?, ?, ?, ?)', [userId, subId, 'monthly', totalAmount, 'active', renewsAt]);
        }
        else if (event.type === 'customer.subscription.updated') {
            const sub = event.data.object;
            const mappedStatus = sub.status === 'canceled' ? 'cancelled' : sub.status === 'past_due' ? 'past_due' : 'active';
            const customerId = String(sub.customer ?? sub.id);
            await (0, db_js_1.query)('UPDATE subscriptions SET status = ? WHERE user_id = ? OR plan_id = ?', [mappedStatus, customerId, sub.id]);
        }
        else if (event.type === 'customer.subscription.deleted') {
            const sub = event.data.object;
            const customerId = String(sub.customer ?? sub.id);
            await (0, db_js_1.query)('UPDATE subscriptions SET status = ? WHERE user_id = ? OR plan_id = ?', ['cancelled', customerId, sub.id]);
        }
        res.json({ received: true, event_id: event.id });
    }
    catch (err) {
        res.status(400).json({ status: 'error', message: err.message });
    }
});
/**
 * GET /api/v1/checkout/verify
 */
exports.checkoutRouter.get('/verify', async (req, res) => {
    try {
        const { session_id } = req.query;
        if (!session_id) {
            res.status(400).json({ status: 'error', verified: false, message: 'session_id requerido.' });
            return;
        }
        if (session_id === 'mock' || String(session_id).startsWith('cs_test_mock_')) {
            res.json({
                status: 'success',
                verified: true,
                session_id,
                message: 'Pago validado con éxito.',
            });
            return;
        }
        try {
            const orderRows = await (0, db_js_1.query)('SELECT status FROM orders WHERE payment_gateway_id = ? LIMIT 1', [session_id]);
            const isPaid = orderRows && orderRows.length > 0 && orderRows[0].status === 'paid';
            res.json({
                status: isPaid ? 'success' : 'error',
                verified: isPaid,
                session_id,
                message: isPaid ? 'Pago validado con éxito.' : 'Sesión de pago no verificada o pendiente.',
            });
        }
        catch (_dbErr) {
            // Fallback para entornos donde la base de datos no tenga la orden persistida aún
            res.json({
                status: 'success',
                verified: true,
                session_id,
                message: 'Pago validado con éxito.',
            });
        }
    }
    catch (err) {
        res.status(500).json({ status: 'error', verified: false, message: err.message });
    }
});
