/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import express from 'express';
import supertest from 'supertest';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const mockSendMail = vi.fn().mockImplementation(() => Promise.resolve({ messageId: 'msg-123' }));
vi.mock('nodemailer', () => {
  const transportObj = {
    sendMail: (...args: unknown[]) => mockSendMail(...args),
  };
  return {
    default: {
      createTransport: () => transportObj,
    },
    createTransport: () => transportObj,
  };
});

import * as db from '../../../server/src/db';
import { adminRouter } from '../../../server/src/routes/admin';
import { clientRouter } from '../../../server/src/routes/client';
import { contactRouter } from '../../../server/src/routes/contact';
import { onboardingRouter } from '../../../server/src/routes/onboarding';
import { checkoutRouter } from '../../../server/src/routes/checkout';
import { authRouter } from '../../../server/src/routes/auth';

vi.mock('../../../server/src/db', () => ({
  query: vi.fn(),
  pool: {
    execute: vi.fn().mockResolvedValue([{ affectedRows: 1 }]),
  },
}));

const TEST_SECRET = 'dreamtek_dev_jwt_secret_key_2026';

describe('Server Express Routes 100% Comprehensive Suite', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  app.use('/admin', adminRouter);
  app.use('/client', clientRouter);
  app.use('/contact', contactRouter);
  app.use('/onboarding', onboardingRouter);
  app.use('/checkout', checkoutRouter);
  app.use('/auth', authRouter);

  const adminToken = jwt.sign(
    { userId: 1, uid: 1, email: 'admin@dreamtek.tech', role: 'ADMIN' },
    TEST_SECRET,
    { algorithm: 'HS512' },
  );
  const clientToken = jwt.sign(
    { userId: 42, uid: 42, email: 'cliente@empresa.com', role: 'CLIENT' },
    TEST_SECRET,
    { algorithm: 'HS512' },
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // AUTH ROUTES
  it('POST /auth/login debe validar campos requeridos y procesar logins fallidos y exitosos', async () => {
    // Missing email or password
    const resEmpty = await supertest(app).post('/auth/login').send({ email: '' });
    expect(resEmpty.status).toBe(400);

    // User not found
    vi.mocked(db.query).mockResolvedValueOnce([]);
    const resFail = await supertest(app)
      .post('/auth/login')
      .send({ email: 'fake@empresa.com', password: 'wrongPassword123!' });
    expect(resFail.status).toBe(401);

    // User found and password match
    const hashedPassword = await bcrypt.hash('CorrectPass123!', 10);
    vi.mocked(db.query).mockResolvedValueOnce([
      {
        id: 42,
        email: 'cliente@empresa.com',
        password_hash: hashedPassword,
        role: 'CLIENT',
        full_name: 'Cliente Test',
      },
    ]);

    const resSuccess = await supertest(app)
      .post('/auth/login')
      .send({ email: 'cliente@empresa.com', password: 'CorrectPass123!' });
    expect(resSuccess.status).toBe(200);
    expect(resSuccess.body.status).toBe('success');
    expect(resSuccess.body.user.email).toBe('cliente@empresa.com');

    // Exception branch
    vi.mocked(db.query).mockRejectedValueOnce(new Error('DB Error'));
    const resErr = await supertest(app)
      .post('/auth/login')
      .send({ email: 'cliente@empresa.com', password: 'CorrectPass123!' });
    expect(resErr.status).toBe(500);
  });

  it('GET /auth/me debe validar token de sesión y responder con usuario', async () => {
    // Missing token
    const resNoToken = await supertest(app).get('/auth/me');
    expect(resNoToken.status).toBe(401);

    // Token valid, user found
    vi.mocked(db.query).mockResolvedValueOnce([
      { id: 42, email: 'cliente@empresa.com', role: 'CLIENT', full_name: 'Cliente Test' },
    ]);
    const resMe = await supertest(app)
      .get('/auth/me')
      .set('Cookie', [`dreamtek_session=${clientToken}`]);
    expect(resMe.status).toBe(200);

    // User not found in DB
    vi.mocked(db.query).mockResolvedValueOnce([]);
    const resNotFound = await supertest(app)
      .get('/auth/me')
      .set('Cookie', [`dreamtek_session=${clientToken}`]);
    expect(resNotFound.status).toBe(401);
  });

  // ADMIN ROUTES
  it('GET /admin/leads, /admin/audit-logs y /admin/metrics deben responder con datos para ADMIN y manejar fallas de DB', async () => {
    vi.mocked(db.query).mockResolvedValue([{ id: 1, email: 'lead@empresa.com' }]);

    const resLeads = await supertest(app)
      .get('/admin/leads')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(resLeads.status).toBe(200);

    const resLogs = await supertest(app)
      .get('/admin/audit-logs?page=1&limit=5')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(resLogs.status).toBe(200);

    const resMetrics = await supertest(app)
      .get('/admin/metrics')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(resMetrics.status).toBe(200);

    // DB query reject fallbacks
    vi.mocked(db.query).mockRejectedValue(new Error('DB Error'));
    const resLeadsErr = await supertest(app)
      .get('/admin/leads')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(resLeadsErr.status).toBe(200);
    expect(resLeadsErr.body.leads).toEqual([]);

    const resMetricsErr = await supertest(app)
      .get('/admin/metrics')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(resMetricsErr.status).toBe(200);
    expect(resMetricsErr.body.metrics.total_leads).toBe(0);
  });

  // CLIENT ROUTES
  it('GET /client/dashboard y /client/sites deben responder para CLIENT o retornar 404', async () => {
    // 404 User not found
    vi.mocked(db.query).mockResolvedValueOnce([]);
    const res404 = await supertest(app)
      .get('/client/dashboard')
      .set('Cookie', [`dreamtek_session=${clientToken}`]);
    expect(res404.status).toBe(404);

    // 200 User found
    vi.mocked(db.query)
      .mockResolvedValueOnce([
        {
          id: 42,
          full_name: 'Cliente Test',
          email: 'cliente@empresa.com',
          role: 'CLIENT',
          created_at: '2026-01-01',
        },
      ])
      .mockResolvedValueOnce([{ id: 1, domain: 'misitio.com', status: 'active', ssl: true }]);

    const resDash = await supertest(app)
      .get('/client/dashboard')
      .set('Cookie', [`dreamtek_session=${clientToken}`]);
    expect(resDash.status).toBe(200);

    // sites endpoint with DB error catch
    vi.mocked(db.query).mockRejectedValueOnce(new Error('DB Error'));
    const resSites = await supertest(app)
      .get('/client/sites')
      .set('Cookie', [`dreamtek_session=${clientToken}`]);
    expect(resSites.status).toBe(200);
    expect(resSites.body.sites).toEqual([]);
  });

  // ONBOARDING ROUTES
  it('POST /onboarding/lead debe insertar o actualizar prospectos existentes', async () => {
    // Missing required fields
    const resBad = await supertest(app)
      .post('/onboarding/lead')
      .send({ email: 'test@empresa.com' });
    expect(resBad.status).toBe(400);

    // Existing lead update
    vi.mocked(db.query)
      .mockResolvedValueOnce([{ id: 88 }])
      .mockResolvedValueOnce({ affectedRows: 1 });
    const resUpdate = await supertest(app).post('/onboarding/lead').send({
      name: 'Prospecto Existente',
      email: 'existente@empresa.com',
      phone: '5511223344',
      company: 'Empresa',
    });
    expect(resUpdate.status).toBe(200);
    expect(resUpdate.body.lead_id).toBe(88);

    // New lead insert
    vi.mocked(db.query).mockResolvedValueOnce([]).mockResolvedValueOnce({ insertId: 99 });
    const resNew = await supertest(app).post('/onboarding/lead').send({
      name: 'Nuevo Prospecto',
      email: 'nuevo@empresa.com',
      phone: '5511223344',
    });
    expect(resNew.status).toBe(200);
    expect(resNew.body.lead_id).toBe(99);

    // DB exception
    vi.mocked(db.query).mockRejectedValueOnce(new Error('DB Error'));
    const resErr = await supertest(app).post('/onboarding/lead').send({
      name: 'Error Prospecto',
      email: 'error@empresa.com',
      phone: '5511223344',
    });
    expect(resErr.status).toBe(500);
  });

  it('POST /onboarding/domain debe evaluar disponibilidad de dominios', async () => {
    const resAvail = await supertest(app)
      .post('/onboarding/domain')
      .send({ domain: 'miempresa.com' });
    expect(resAvail.status).toBe(200);
    expect(resAvail.body.available).toBe(true);

    const resReserved = await supertest(app)
      .post('/onboarding/domain')
      .send({ domain: 'google.com' });
    expect(resReserved.status).toBe(200);
    expect(resReserved.body.available).toBe(false);
  });

  // CHECKOUT ROUTES
  it('POST /checkout/session, /checkout/webhook y GET /checkout/verify deben procesar intenciones de compra', async () => {
    // Missing email validation
    const resNoEmail = await supertest(app)
      .post('/checkout/session')
      .send({ billing_cycle: 'monthly' });
    expect(resNoEmail.status).toBe(400);

    // Mock Sk session creation
    const resCheckout = await supertest(app).post('/checkout/session').send({
      email: 'pago@empresa.com',
      billing_cycle: 'annual',
      template_id: 'corporate',
      domain_name: 'pagoterminado.com',
    });
    expect(resCheckout.status).toBe(200);
    expect(resCheckout.body.checkout_url).toBeDefined();

    // Webhook event
    vi.mocked(db.query)
      .mockResolvedValueOnce([{ id: 1 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ affectedRows: 1 })
      .mockResolvedValueOnce({ affectedRows: 1 });
    const resWebhook = await supertest(app)
      .post('/checkout/webhook')
      .set('stripe-signature', 't=123,v1=mock_signature')
      .send({
        type: 'checkout.session.completed',
        data: {
          object: { customer_email: 'pago@empresa.com', amount_total: 259900, id: 'cs_123' },
        },
      });
    expect(resWebhook.status).toBe(200);

    // Webhook error catch
    vi.mocked(db.query).mockRejectedValueOnce(new Error('Webhook DB Error'));
    const resWebErr = await supertest(app)
      .post('/checkout/webhook')
      .set('stripe-signature', 't=123,v1=mock_signature')
      .send({
        type: 'checkout.session.completed',
        data: {
          object: { customer_email: 'pago@empresa.com', amount_total: 259900, id: 'cs_123' },
        },
      });
    expect(resWebErr.status).toBe(400);

    // Verify session
    const resVerify = await supertest(app).get('/checkout/verify?session_id=cs_test_123');
    expect(resVerify.status).toBe(200);
    expect(resVerify.body.status).toBe('success');
  });

  // CONTACT ROUTES
  it('POST /contact/send-code y POST /contact deben procesar el envío de mensajes y evaluar SMTP', async () => {
    // Send code valid
    const resCode = await supertest(app).post('/contact/send-code').send({
      email: 'maria@empresa.com',
    });
    expect(resCode.status).toBe(200);

    // Contact form valid
    const resContact = await supertest(app).post('/contact').send({
      name: 'Maria Ramos',
      email: 'maria@empresa.com',
      subject: 'Cotización Escolta WEB',
      message: 'Me interesa cotizar el servicio corporativo.',
    });
    expect(resContact.status).toBe(200);
  });

  it('POST /auth/logout y GET /auth/me excepcion deben responder adecuadamente', async () => {
    const resLogout = await supertest(app).post('/auth/logout');
    expect(resLogout.status).toBe(200);
    expect(resLogout.body.message).toBe('Sesión cerrada exitosamente.');

    // GET /auth/me with invalid token exception
    const resBadToken = await supertest(app)
      .get('/auth/me')
      .set('Cookie', ['dreamtek_session=invalid_token']);
    expect(resBadToken.status).toBe(401);
    expect(resBadToken.body.message).toBe('Sesión expirada o inválida.');
  });

  it('health.ts /health, /healthz y /readyz deben reportar estado del servicio y handles shutting down', async () => {
    const { healthRouter, setShuttingDownState } =
      await import('../../../server/src/routes/health');
    const healthApp = express();
    healthApp.use('/health-test', healthRouter);

    const resHealth = await supertest(healthApp).get('/health-test/health');
    expect(resHealth.status).toBe(200);
    expect(resHealth.body.status).toBe('ok');

    delete process.env.NODE_ENV;
    const resHealthDev = await supertest(healthApp).get('/health-test/health');
    expect(resHealthDev.status).toBe(200);
    expect(resHealthDev.body.env).toBe('development');

    const resHealthz = await supertest(healthApp).get('/health-test/healthz');
    expect(resHealthz.status).toBe(200);

    vi.mocked(db.query).mockResolvedValueOnce([{ 1: 1 }]);
    const resReadyz = await supertest(healthApp).get('/health-test/readyz');
    expect(resReadyz.status).toBe(200);

    // Readyz DB Error
    vi.mocked(db.query).mockRejectedValueOnce(new Error('DB Down'));
    const resReadyzErr = await supertest(healthApp).get('/health-test/readyz');
    expect(resReadyzErr.status).toBe(503);
    expect(resReadyzErr.body.database).toBe('disconnected');

    // Shutting down state
    setShuttingDownState(true);
    const resDownHealthz = await supertest(healthApp).get('/health-test/healthz');
    expect(resDownHealthz.status).toBe(503);

    const resDownReadyz = await supertest(healthApp).get('/health-test/readyz');
    expect(resDownReadyz.status).toBe(503);

    setShuttingDownState(false);
  });

  it('contact.ts send-code e inputs inválidos deben retornar 400 y capturar excepciones', async () => {
    const resInvalidEmail = await supertest(app)
      .post('/contact/send-code')
      .send({ email: 'bademail' });
    expect(resInvalidEmail.status).toBe(400);

    const resMissingForm = await supertest(app)
      .post('/contact')
      .send({ name: 'Juan', email: 'j@e.com' });
    expect(resMissingForm.status).toBe(400);

    // Direct invocation to test handler branch checks
    const { contactRouter } = await import('../../../server/src/routes/contact');
    const rawApp = express();
    rawApp.use(express.json());
    rawApp.use('/raw-contact', contactRouter);

    const resRaw1 = await supertest(rawApp)
      .post('/raw-contact/send-code')
      .send({ email: 'no_at_sign' });
    expect(resRaw1.status).toBe(400);

    const resRaw2 = await supertest(rawApp).post('/raw-contact').send({ name: '' });
    expect(resRaw2.status).toBe(400);
  });

  it('contact.ts en producción debe enviar correos con nodemailer o manejar excepciones SMTP', async () => {
    process.env.NODE_ENV = 'production';
    process.env.SMTP_PASS = 'mock_smtp_password';

    const { contactRouter, setTransporterForTest } =
      await import('../../../server/src/routes/contact');
    setTransporterForTest({
      sendMail: (...args: unknown[]) => mockSendMail(...args),
    });
    mockSendMail.mockResolvedValue({ messageId: 'msg-123' });
    const prodApp = express();
    prodApp.use(express.json());
    prodApp.use('/prod-contact', contactRouter);

    // Test send-code in production (successful sendMail)
    const resProdCode = await supertest(prodApp)
      .post('/prod-contact/send-code')
      .send({ email: 'contacto@empresa.com' });
    expect(resProdCode.status).toBe(200);
    expect(resProdCode.body.code).toBeUndefined();

    // Test contact form in production (successful sendMail)
    const resProdMsg = await supertest(prodApp).post('/prod-contact').send({
      name: 'Carlos',
      email: 'carlos@empresa.com',
      subject: 'Consulta Comercial',
      message: 'Hola Dreamtek',
    });
    expect(resProdMsg.status).toBe(200);

    // Test SMTP send error catch blocks
    mockSendMail.mockRejectedValueOnce(new Error('SMTP Connection Failed'));
    const resSendCodeErr = await supertest(prodApp)
      .post('/prod-contact/send-code')
      .send({ email: 'contacto@empresa.com' });
    expect(resSendCodeErr.status).toBe(500);

    mockSendMail.mockRejectedValueOnce(new Error('SMTP Send Failed'));
    const resContactErr = await supertest(prodApp).post('/prod-contact').send({
      name: 'Carlos',
      email: 'carlos@empresa.com',
      subject: 'Consulta Comercial',
      message: 'Hola Dreamtek',
    });
    expect(resContactErr.status).toBe(500);
  });

  it('client.ts y admin.ts deben capturar excepciones síncronas de DB y fallbacks de mensaje', async () => {
    // Sync string exception in client dashboard sites query
    vi.mocked(db.query)
      .mockResolvedValueOnce([
        { id: 1, full_name: 'Cliente', email: 'c@e.com', role: 'CLIENT', created_at: '2026-01-01' },
      ]) // user query
      .mockImplementationOnce(() => {
        throw 'String DB Error';
      });

    const resDashErr = await supertest(app)
      .get('/client/dashboard')
      .set('Cookie', [`dreamtek_session=${clientToken}`]);
    expect(resDashErr.status).toBe(200);

    // Outer exception without message property
    vi.mocked(db.query).mockImplementationOnce(() => {
      throw { noMessageField: true };
    });
    const resDashNoMsg = await supertest(app)
      .get('/client/dashboard')
      .set('Cookie', [`dreamtek_session=${clientToken}`]);
    expect(resDashNoMsg.status).toBe(500);

    // Sync exception in client sites
    vi.mocked(db.query).mockImplementationOnce(() => {
      throw 'Sync String DB Error';
    });
    const resSitesErr = await supertest(app)
      .get('/client/sites')
      .set('Cookie', [`dreamtek_session=${clientToken}`]);
    expect(resSitesErr.status).toBe(200);

    // Sync outer exception in client sites without message field
    const { clientRouter: rawClientRouter } = await import('../../../server/src/routes/client');
    const reqMock: Record<string, unknown> = {};
    Object.defineProperty(reqMock, 'user', {
      get() {
        throw { rawStringError: true };
      },
    });
    const resMock = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as Response;

    const sitesRoute = rawClientRouter.stack.find(
      (layer: { route?: { path: string } }) => layer.route?.path === '/sites',
    )?.route;
    if (sitesRoute) {
      const handler = sitesRoute.stack[0].handle;
      await handler(reqMock, resMock);
      expect(resMock.status).toHaveBeenCalledWith(500);
      expect(resMock.json).toHaveBeenCalledWith({
        status: 'error',
        message: 'Error al obtener sitios web del cliente.',
      });
    }

    // Sync exceptions in admin routes
    vi.mocked(db.query).mockImplementation(() => {
      throw new Error('Sync Admin Error');
    });
    const resAdminLeads = await supertest(app)
      .get('/admin/leads')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(resAdminLeads.status).toBe(500);

    const resAdminAudit = await supertest(app)
      .get('/admin/audit-logs')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(resAdminAudit.status).toBe(500);

    const resAdminMetrics = await supertest(app)
      .get('/admin/metrics')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(resAdminMetrics.status).toBe(500);
  });

  it('admin.ts audit-logs debe manejar fallo en la consulta de total count o arreglo vacío', async () => {
    vi.mocked(db.query)
      .mockResolvedValueOnce([{ id: 1, event_type: 'LOGIN_SUCCESS' }]) // logs query
      .mockRejectedValueOnce(new Error('Count query rejected')); // count query rejected

    const resLogsRej = await supertest(app)
      .get('/admin/audit-logs')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(resLogsRej.status).toBe(200);
    expect(resLogsRej.body.total).toBe(0);

    vi.mocked(db.query)
      .mockResolvedValueOnce([{ id: 1, event_type: 'LOGIN_SUCCESS' }]) // logs query
      .mockResolvedValueOnce([] as unknown as Array<{ total: number }>); // count query returns empty array

    const resLogs = await supertest(app)
      .get('/admin/audit-logs')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(resLogs.status).toBe(200);
    expect(resLogs.body.total).toBe(0);
  });

  it('auth.ts debe procesar logins exitosos en producción y validación de campos requeridos', async () => {
    const { authRouter } = await import('../../../server/src/routes/auth');
    const rawAuthApp = express();
    rawAuthApp.use(express.json());
    rawAuthApp.use('/raw-auth', authRouter);

    // Missing password direct invocation
    const resNoPass = await supertest(rawAuthApp)
      .post('/raw-auth/login')
      .send({ email: 'test@e.com' });
    expect(resNoPass.status).toBe(400);

    // Login in production mode
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'prod_secret_key_12345';

    vi.mocked(db.query).mockResolvedValueOnce([
      {
        id: 1,
        email: 'admin@dreamtek.tech',
        password_hash: await bcrypt.hash('SuperPassword123!', 1),
        role: null,
        full_name: 'Admin Prod',
      },
    ]);

    const resProdLogin = await supertest(rawAuthApp).post('/raw-auth/login').send({
      email: 'admin@dreamtek.tech',
      password: 'SuperPassword123!',
    });
    expect(resProdLogin.status).toBe(200);
  });

  it('auth.ts debe responder con 500 si falta JWT_SECRET en producción durante login', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;

    const resProdAuth = await supertest(app).post('/auth/login').send({
      email: 'admin@dreamtek.tech',
      password: 'SuperPassword123!',
    });
    expect(resProdAuth.status).toBe(500);
  });

  it('checkout.ts debe procesar sesiones de Stripe o manejar errores cuando STRIPE_SECRET_KEY está configurada', async () => {
    const { setStripeForTest } = await import('../../../server/src/routes/checkout');
    const mockCreate = vi.fn().mockResolvedValueOnce({
      id: 'cs_real_123',
      url: 'https://checkout.stripe.com/pay',
    });

    setStripeForTest({
      checkout: {
        sessions: {
          create: mockCreate,
        },
      },
    });

    process.env.STRIPE_SECRET_KEY = 'sk_test_valid_key_for_testing';

    const resStripeOk = await supertest(app).post('/checkout/session').send({
      email: 'pago@empresa.com',
      billing_cycle: 'annual',
      template_id: 'corporate',
      domain_name: 'pagoterminado.com',
    });
    expect(resStripeOk.status).toBe(200);
    expect(resStripeOk.body.session_id).toBe('cs_real_123');

    // Error case
    mockCreate.mockRejectedValueOnce(new Error('Stripe API Error'));
    const resStripeErr = await supertest(app).post('/checkout/session').send({
      email: 'pago@empresa.com',
      billing_cycle: 'annual',
      template_id: 'corporate',
      domain_name: 'pagoterminado.com',
    });
    expect(resStripeErr.status).toBe(500);
    expect(resStripeErr.body.status).toBe('error');
  });

  it('onboarding.ts debe validar que el dominio sea una cadena de texto válida', async () => {
    const resBadDomain = await supertest(app).post('/onboarding/domain').send({
      domain: 12345,
    });
    expect(resBadDomain.status).toBe(400);

    const { onboardingRouter } = await import('../../../server/src/routes/onboarding');
    const rawOnboardingApp = express();
    rawOnboardingApp.use(express.json());
    rawOnboardingApp.use('/raw-onboarding', onboardingRouter);

    const resRawBadDomain = await supertest(rawOnboardingApp)
      .post('/raw-onboarding/domain')
      .send({});
    expect(resRawBadDomain.status).toBe(400);
  });

  it('contact.ts debe manejar errores de envío de correo y validaciones en send-code', async () => {
    const { contactRouter, setTransporterForTest } =
      await import('../../../server/src/routes/contact');
    const rawContactApp = express();
    rawContactApp.use(express.json());
    rawContactApp.use('/raw-contact', contactRouter);

    // Direct invocation with invalid email
    const resBadEmail = await supertest(rawContactApp)
      .post('/raw-contact/send-code')
      .send({ email: 'no-at-sign' });
    expect(resBadEmail.status).toBe(400);

    // Direct invocation with missing code
    const resNoCode = await supertest(rawContactApp)
      .post('/raw-contact')
      .send({ email: 'test@example.com' });
    expect(resNoCode.status).toBe(400);

    // Production SMTP error branch
    process.env.NODE_ENV = 'production';
    process.env.SMTP_PASS = 'secret_pass';
    setTransporterForTest({
      sendMail: vi.fn().mockRejectedValueOnce(new Error('SMTP Transport Error')),
    });

    const resSmtpErr = await supertest(rawContactApp)
      .post('/raw-contact/send-code')
      .send({ email: 'test@example.com' });
    expect(resSmtpErr.status).toBe(500);
  });

  it('events.ts debe manejar desconexión de cliente y envío de eventos', async () => {
    const { sendSSEEventToUser, activeClients } = await import('../../../server/src/routes/events');

    // Mock response object for sendSSEEventToUser
    const mockRes = {
      write: vi.fn(),
    } as unknown as express.Response;
    activeClients.set('42', new Set([mockRes]));
    const sent = sendSSEEventToUser('42', 'message', { text: 'Hello' });
    expect(sent).toBe(true);
    expect(mockRes.write).toHaveBeenCalled();

    // Error during write
    (mockRes.write as any).mockImplementationOnce(() => {
      throw new Error('Write Error');
    });
    sendSSEEventToUser('42', 'fail', {});
    expect(activeClients.has('42')).toBe(false);
  });

  it('onboarding.ts y admin.ts deben capturar excepciones de base de datos en endpoints', async () => {
    vi.mocked(db.query).mockRejectedValueOnce(new Error('Lead DB error'));
    const resLeadErr = await supertest(app).post('/onboarding/lead').send({
      full_name: 'Error Lead',
      email: 'lead@error.com',
      phone: '5551234567',
    });
    expect(resLeadErr.status).toBe(500);

    vi.mocked(db.query).mockRejectedValueOnce(new Error('Admin metrics DB error'));
    const adminToken = jwt.sign(
      { userId: 1, email: 'admin@dreamtek.tech', role: 'ADMIN' },
      TEST_SECRET,
      { algorithm: 'HS512' },
    );
    const resAdminMetricsErr = await supertest(app)
      .get('/admin/metrics')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(resAdminMetricsErr.status).toBe(500);

    // admin audit-logs catch on logs query
    vi.mocked(db.query).mockRejectedValueOnce(new Error('Audit logs query error'));
    vi.mocked(db.query).mockResolvedValueOnce([{ total: 0 }]);
    const resAuditCatch = await supertest(app)
      .get('/admin/audit-logs')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(resAuditCatch.status).toBe(200);
    expect(resAuditCatch.body.logs).toEqual([]);
  });

  it('checkout.ts /verify y /webhook deben cubrir mock session_id y validaciones de firma', async () => {
    const resMockVerify = await supertest(app).get('/checkout/verify?session_id=mock');
    expect(resMockVerify.status).toBe(200);
    expect(resMockVerify.body.verified).toBe(true);

    const resMockPrefixVerify = await supertest(app).get(
      '/checkout/verify?session_id=cs_test_mock_999',
    );
    expect(resMockPrefixVerify.status).toBe(200);
    expect(resMockPrefixVerify.body.verified).toBe(true);

    // Test webhook missing signature in production
    const origEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      const resNoSig = await supertest(app).post('/checkout/webhook').send({ type: 'test' });
      expect(resNoSig.status).toBe(400);
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });

  it('contact.ts getTransporter debe crear instancia real de nodemailer cuando testTransporter es null', async () => {
    const { getTransporter, setTransporterForTest } =
      await import('../../../server/src/routes/contact');
    setTransporterForTest(null);
    const transporter = getTransporter();
    expect(transporter).toBeDefined();
  });

  it('events.ts stream route debe registrar cliente, disparar heartbeat y limpiar al cerrar', async () => {
    const { eventsRouter, activeClients } = await import('../../../server/src/routes/events');
    const { EventEmitter } = await import('events');

    // Test unauthorized when token missing
    const sseApp = express();
    sseApp.use(cookieParser());
    sseApp.use('/', eventsRouter);
    const resUnauth = await supertest(sseApp).get('/events');
    expect(resUnauth.status).toBe(401);

    // Test route handler logic directly with mock req and res
    const mockReq: any = new EventEmitter();
    mockReq.user = { userId: 100 };
    mockReq.headers = {};
    const mockRes: any = {
      setHeader: vi.fn(),
      write: vi.fn(),
    };

    const routeLayer = eventsRouter.stack.find((s: any) => s.route?.path === '/events');
    const handler = routeLayer.route.stack[routeLayer.route.stack.length - 1].handle;

    vi.useFakeTimers();
    handler(mockReq, mockRes);

    expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
    expect(mockRes.write).toHaveBeenCalled();
    expect(activeClients.has('100')).toBe(true);

    // Fast-forward heartbeat timer
    vi.advanceTimersByTime(16000);
    expect(mockRes.write).toHaveBeenCalledWith(expect.stringContaining(':heartbeat'));

    // Heartbeat error catch (line 68)
    mockRes.write.mockImplementationOnce(() => {
      throw new Error('Heartbeat write failure');
    });
    vi.advanceTimersByTime(16000);

    // Trigger close
    mockReq.emit('close');
    expect(activeClients.has('100')).toBe(false);
    vi.useRealTimers();

    // Test events handler without userId
    const mockReqNoUser: any = new EventEmitter();
    const mockResNoUser: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    handler(mockReqNoUser, mockResNoUser);
    expect(mockResNoUser.status).toHaveBeenCalledWith(401);
  });

  it('debe ejecutar validaciones internas defensivas en handlers de auth, contact, onboarding y checkout', async () => {
    // 1. Auth Login internal guard (lines 27-28)
    const { authRouter } = await import('../../../server/src/routes/auth');
    const authPostLayer = authRouter.stack.find((s: any) => s.route?.path === '/login');
    const authHandler = authPostLayer.route.stack[authPostLayer.route.stack.length - 1].handle;
    const authRes: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    await authHandler({ body: {} }, authRes);
    expect(authRes.status).toHaveBeenCalledWith(400);

    // 2. Contact send-code and form internal guards (lines 37-38, 71-72)
    const { contactRouter } = await import('../../../server/src/routes/contact');
    const sendCodeLayer = contactRouter.stack.find((s: any) => s.route?.path === '/send-code');
    const sendCodeHandler = sendCodeLayer.route.stack[sendCodeLayer.route.stack.length - 1].handle;
    const sendCodeRes: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    await sendCodeHandler({ body: { email: 'invalid' } }, sendCodeRes);
    expect(sendCodeRes.status).toHaveBeenCalledWith(400);

    const contactPostLayer = contactRouter.stack.find((s: any) => s.route?.path === '/');
    const contactPostHandler =
      contactPostLayer.route.stack[contactPostLayer.route.stack.length - 1].handle;
    const contactPostRes: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    await contactPostHandler({ body: {} }, contactPostRes);
    expect(contactPostRes.status).toHaveBeenCalledWith(400);

    // 3. Onboarding domain check internal guard (lines 58-59)
    const { onboardingRouter } = await import('../../../server/src/routes/onboarding');
    const domainLayer = onboardingRouter.stack.find((s: any) => s.route?.path === '/domain');
    const domainHandler = domainLayer.route.stack[domainLayer.route.stack.length - 1].handle;
    const domainRes: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    domainHandler({ body: {} }, domainRes);
    expect(domainRes.status).toHaveBeenCalledWith(400);

    // 4. Checkout verify catch block (line 220) and no session_id (lines 186-187)
    const { checkoutRouter } = await import('../../../server/src/routes/checkout');
    const verifyLayer = checkoutRouter.stack.find((s: any) => s.route?.path === '/verify');
    const verifyHandler = verifyLayer.route.stack[verifyLayer.route.stack.length - 1].handle;
    const verifyRes: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };

    // No session_id
    await verifyHandler({ query: {} }, verifyRes);
    expect(verifyRes.status).toHaveBeenCalledWith(400);

    // Pass non-object query to trigger exception
    const badReq: any = {
      get query() {
        throw new Error('Query Exception');
      },
    };
    await verifyHandler(badReq, verifyRes);
    expect(verifyRes.status).toHaveBeenCalledWith(500);

    // 5. Auth getJwtSecret production exception (line 11)
    const { getJwtSecret } = await import('../../../server/src/routes/auth');
    const origEnv = process.env.NODE_ENV;
    const origSecret = process.env.JWT_SECRET;
    try {
      process.env.NODE_ENV = 'production';
      delete process.env.JWT_SECRET;
      expect(() => getJwtSecret()).toThrow('FATAL SECURITY ERROR: JWT_SECRET');
    } finally {
      process.env.NODE_ENV = origEnv;
      process.env.JWT_SECRET = origSecret;
    }
  });

  it('checkout.ts webhook debe manejar fallos en chequeo de idempotencia y excepciones generales', async () => {
    const { checkoutRouter, setStripeForTest, getStripe } =
      await import('../../../server/src/routes/checkout');

    // Test getStripe when testStripe is null (line 15)
    setStripeForTest(null);
    const stripeInst = getStripe('sk_test_mock_key');
    expect(stripeInst).toBeDefined();

    const webhookLayer = checkoutRouter.stack.find((s: any) => s.route?.path === '/webhook');

    const webhookHandler = webhookLayer.route.stack[webhookLayer.route.stack.length - 1].handle;
    const webhookRes: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };

    // Idempotency DB query failure
    vi.mocked(db.query)
      .mockResolvedValueOnce([{ id: 10 }]) // user lookup
      .mockRejectedValueOnce(new Error('Idempotency query fail')) // idempotency check
      .mockResolvedValueOnce({}) // orders insert
      .mockResolvedValueOnce({}); // subscriptions insert

    await webhookHandler(
      {
        headers: {},
        body: {
          type: 'checkout.session.completed',
          data: {
            object: {
              id: 'cs_test_idemp_fail',
              customer_email: 'idemp@dreamtek.tech',
              amount_total: 5000,
            },
          },
        },
      },
      webhookRes,
    );
    expect(webhookRes.json).toHaveBeenCalled();

    // General error in webhook catch block (line 174)
    const badWebhookRes: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    await webhookHandler(
      {
        get headers() {
          throw new Error('Webhook Header Error');
        },
      },
      badWebhookRes,
    );
    expect(badWebhookRes.status).toHaveBeenCalledWith(400);
  });

  it('debe cubrir branches de fallback de mensajes de error y multi-conexión SSE', async () => {
    // 1. Admin fallback error messages when err.message is empty
    const { adminRouter } = await import('../../../server/src/routes/admin');
    const leadsLayer = adminRouter.stack.find((s: any) => s.route?.path === '/leads');
    const leadsHandler = leadsLayer.route.stack[leadsLayer.route.stack.length - 1].handle;
    const adminRes: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    vi.mocked(db.query).mockImplementationOnce(() => {
      throw {};
    });
    await leadsHandler({}, adminRes);
    expect(adminRes.status).toHaveBeenCalledWith(500);

    const metricsLayer = adminRouter.stack.find((s: any) => s.route?.path === '/metrics');
    const metricsHandler = metricsLayer.route.stack[metricsLayer.route.stack.length - 1].handle;
    vi.mocked(db.query).mockImplementationOnce(() => {
      throw {};
    });
    await metricsHandler({}, adminRes);
    expect(adminRes.status).toHaveBeenCalledWith(500);

    const auditLayer = adminRouter.stack.find((s: any) => s.route?.path === '/audit-logs');
    const auditHandler = auditLayer.route.stack[auditLayer.route.stack.length - 1].handle;
    await auditHandler(
      {
        get query() {
          throw {};
        },
      },
      adminRes,
    );
    expect(adminRes.status).toHaveBeenCalledWith(500);

    // 2. Auth fallback error message
    const { authRouter } = await import('../../../server/src/routes/auth');
    const authPostLayer = authRouter.stack.find((s: any) => s.route?.path === '/login');
    const authHandler = authPostLayer.route.stack[authPostLayer.route.stack.length - 1].handle;
    const authRes: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    await authHandler(
      {
        get body() {
          throw {};
        },
      },
      authRes,
    );
    expect(authRes.status).toHaveBeenCalledWith(500);

    // 3. Onboarding update lead with empty company and catch block without message
    const { onboardingRouter } = await import('../../../server/src/routes/onboarding');
    const leadLayer = onboardingRouter.stack.find((s: any) => s.route?.path === '/lead');
    const leadHandler = leadLayer.route.stack[leadLayer.route.stack.length - 1].handle;
    const leadRes: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    vi.mocked(db.query)
      .mockResolvedValueOnce([{ id: 99 }]) // existing
      .mockResolvedValueOnce({}); // update
    await leadHandler(
      { body: { email: 'update@test.com', phone: '123', full_name: 'Update Name' } },
      leadRes,
    );
    expect(leadRes.json).toHaveBeenCalled();

    await leadHandler(
      {
        get body() {
          throw {};
        },
      },
      leadRes,
    );
    expect(leadRes.status).toHaveBeenCalledWith(500);

    // 4. Checkout verify when order is not paid (status pending)
    const { checkoutRouter } = await import('../../../server/src/routes/checkout');
    const verifyLayer = checkoutRouter.stack.find((s: any) => s.route?.path === '/verify');
    const verifyHandler = verifyLayer.route.stack[verifyLayer.route.stack.length - 1].handle;
    const verifyRes: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    vi.mocked(db.query).mockResolvedValueOnce([{ status: 'pending' }]);
    await verifyHandler({ query: { session_id: 'cs_pending_123' } }, verifyRes);
    expect(verifyRes.json).toHaveBeenCalledWith(expect.objectContaining({ verified: false }));

    const sessionLayer = checkoutRouter.stack.find((s: any) => s.route?.path === '/session');
    const sessionHandler = sessionLayer.route.stack[sessionLayer.route.stack.length - 1].handle;
    const sessionRes: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    await sessionHandler(
      {
        get body() {
          throw {};
        },
      },
      sessionRes,
    );
    expect(sessionRes.status).toHaveBeenCalledWith(500);

    // 5. Events multi-connection for same user
    const { eventsRouter, activeClients } = await import('../../../server/src/routes/events');
    const { EventEmitter } = await import('events');
    const routeLayer = eventsRouter.stack.find((s: any) => s.route?.path === '/events');
    const sseHandler = routeLayer.route.stack[routeLayer.route.stack.length - 1].handle;

    const req1: any = new EventEmitter();
    req1.user = { userId: 500 };
    const res1: any = { setHeader: vi.fn(), write: vi.fn() };

    const req2: any = new EventEmitter();
    req2.user = { userId: 500 };
    const res2: any = { setHeader: vi.fn(), write: vi.fn() };

    sseHandler(req1, res1);
    expect(activeClients.get('500')?.size).toBe(1);

    sseHandler(req2, res2);
    expect(activeClients.get('500')?.size).toBe(2);

    // Close one connection while another remains active
    req1.emit('close');
    expect(activeClients.get('500')?.size).toBe(1);

    req2.emit('close');
    expect(activeClients.has('500')).toBe(false);
  });
});
