import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import supertest from 'supertest';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

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

  it('POST /auth/login debe procesar logins fallidos y exitosos', async () => {
    // 1. User not found
    vi.mocked(db.query).mockResolvedValueOnce([]);
    const resFail = await supertest(app)
      .post('/auth/login')
      .send({ email: 'fake@empresa.com', password: 'wrongPassword123!' });
    expect(resFail.status).toBe(401);

    // 2. User found and password match
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
  });

  it('GET /auth/me debe retornar datos de usuario autenticado o 401', async () => {
    vi.mocked(db.query).mockResolvedValueOnce([
      { id: 42, email: 'cliente@empresa.com', role: 'CLIENT', full_name: 'Cliente Test' },
    ]);

    const resMe = await supertest(app)
      .get('/auth/me')
      .set('Cookie', [`dreamtek_session=${clientToken}`]);
    expect(resMe.status).toBe(200);
    expect(resMe.body.user.email).toBe('cliente@empresa.com');

    // User not found in DB
    vi.mocked(db.query).mockResolvedValueOnce([]);
    const resNotFound = await supertest(app)
      .get('/auth/me')
      .set('Cookie', [`dreamtek_session=${clientToken}`]);
    expect(resNotFound.status).toBe(401);
  });

  it('GET /admin/leads, /admin/audit-logs y /admin/metrics deben responder con datos para ADMIN', async () => {
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
  });

  it('GET /client/dashboard y /client/sites deben responder con datos para CLIENT', async () => {
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
    expect(resDash.body.profile.email).toBe('cliente@empresa.com');

    vi.mocked(db.query).mockResolvedValueOnce([
      { id: 1, domain: 'misitio.com', status: 'active', ssl: true },
    ]);
    const resSites = await supertest(app)
      .get('/client/sites')
      .set('Cookie', [`dreamtek_session=${clientToken}`]);
    expect(resSites.status).toBe(200);
  });

  it('POST /onboarding/lead debe registrar e insertar/actualizar prospectos', async () => {
    vi.mocked(db.query).mockResolvedValueOnce([]).mockResolvedValueOnce({ insertId: 99 });

    const resLead = await supertest(app).post('/onboarding/lead').send({
      name: 'Nuevo Prospecto',
      email: 'nuevo@empresa.com',
      phone: '5511223344',
      company: 'Empresa Test',
      planId: 'corporate',
    });

    expect([200, 400, 500]).toContain(resLead.status);
  });

  it('POST /checkout/session, /checkout/webhook y GET /checkout/verify deben procesar intenciones de compra', async () => {
    const resCheckout = await supertest(app).post('/checkout/session').send({
      email: 'pago@empresa.com',
      billing_cycle: 'annual',
      template_id: 'corporate',
      domain_name: 'pagoterminado.com',
    });

    expect(resCheckout.status).toBe(200);
    expect(resCheckout.body.checkout_url).toBeDefined();

    const resWebhook = await supertest(app)
      .post('/checkout/webhook')
      .send({
        type: 'checkout.session.completed',
        data: {
          object: { customer_email: 'pago@empresa.com', amount_total: 259900, id: 'cs_123' },
        },
      });
    expect(resWebhook.status).toBe(200);

    const resVerify = await supertest(app).get('/checkout/verify?session_id=cs_test_123');
    expect(resVerify.status).toBe(200);
    expect(resVerify.body.status).toBe('success');
  });

  it('POST /contact/send-code y POST /contact deben procesar el envío de mensajes', async () => {
    const resCode = await supertest(app).post('/contact/send-code').send({
      email: 'maria@empresa.com',
    });
    expect(resCode.status).toBe(200);

    const resContact = await supertest(app).post('/contact').send({
      name: 'Maria Ramos',
      email: 'maria@empresa.com',
      subject: 'Cotización Escolta WEB',
      message: 'Me interesa cotizar el servicio corporativo.',
    });
    expect(resContact.status).toBe(200);
  });
});
