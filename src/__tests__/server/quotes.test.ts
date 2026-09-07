/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import supertest from 'supertest';
import express from 'express';
import * as db from '../../../server/src/db';
import { quotesRouter, getQuoteClientIp } from '../../../server/src/routes/quotes';
import * as contactModule from '../../../server/src/routes/contact';
import * as auditLoggerModule from '../../../server/src/middleware/auditLogger';
import {
  evaluateQuoteMatrix,
  QUOTE_ESTIMATION_MATRIX,
  QUOTE_ESTIMATION_MATRIX_EN,
  VERTICALS,
  SCALES,
  CURRENCIES,
  LOCALES,
} from '../../../server/src/schemas/quotes.schema';

vi.mock('../../../server/src/db', () => ({
  query: vi.fn(),
  pool: {
    execute: vi.fn().mockResolvedValue([{ insertId: 1 }]),
  },
}));

vi.mock('../../../server/src/middleware/auditLogger', () => ({
  logSecurityEvent: vi.fn().mockResolvedValue(undefined),
}));

const app = express();
app.use(express.json());
app.use('/api/v1/quotes', quotesRouter);

describe('Quote Funnel Diagnostic API & Matrix Suite (FC 039 100% Coverage)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Server-side Matrix Evaluation Unit Tests', () => {
    it('debe validar y calcular valores para todas las combinaciones válidas de la matriz', () => {
      // 8 pares válidos
      const validPairs = [
        { vertical: 'WEB_DEV', scale: 'MVP' },
        { vertical: 'WEB_DEV', scale: 'SCALE' },
        { vertical: 'ARCHON_FLEET', scale: 'SMALL' },
        { vertical: 'ARCHON_FLEET', scale: 'LARGE' },
        { vertical: 'AI_AUTOMATION', scale: 'AGENT' },
        { vertical: 'AI_AUTOMATION', scale: 'ENTERPRISE_VISION' },
        { vertical: 'CYBERSECURITY', scale: 'VULN_ASSESSMENT' },
        { vertical: 'CYBERSECURITY', scale: 'PENTEST_FULL' },
      ];

      for (const pair of validPairs) {
        const result = evaluateQuoteMatrix(pair.vertical, pair.scale);
        expect(result).not.toBeNull();
        expect(result?.valid).toBe(true);
        expect(result?.estimatedBudgetMin).toBeGreaterThan(0);
        expect(result?.estimatedBudgetMax).toBeGreaterThan(result!.estimatedBudgetMin);
        expect(result?.estimatedWeeksMin).toBeGreaterThan(0);
        expect(result?.estimatedWeeksMax).toBeGreaterThanOrEqual(result!.estimatedWeeksMin);
        expect(result?.serviceLabel).toBeTruthy();
        expect(result?.scaleLabel).toBeTruthy();
      }
    });

    it('debe retornar null para verticales o escalas inválidas o cruzadas', () => {
      // Vertical inexistente
      expect(evaluateQuoteMatrix('INVALID_VERTICAL', 'MVP')).toBeNull();

      // Escala inexistente
      expect(evaluateQuoteMatrix('WEB_DEV', 'NON_EXISTENT_SCALE')).toBeNull();

      // Combinación cruzada no permitida (C-039.2)
      expect(evaluateQuoteMatrix('WEB_DEV', 'SMALL')).toBeNull();
      expect(evaluateQuoteMatrix('CYBERSECURITY', 'MVP')).toBeNull();
      expect(evaluateQuoteMatrix('ARCHON_FLEET', 'AGENT')).toBeNull();
    });

    it('debe contener las constantes estáticas declaradas de VERTICALS, SCALES, CURRENCIES y LOCALES', () => {
      expect(VERTICALS.length).toBe(4);
      expect(SCALES.length).toBe(8);
      expect(CURRENCIES).toEqual(['MXN', 'USD']);
      expect(LOCALES).toEqual(['es', 'en']);
      expect(QUOTE_ESTIMATION_MATRIX.WEB_DEV.MVP?.estimatedBudgetMin).toBe(35000);
      expect(QUOTE_ESTIMATION_MATRIX_EN.WEB_DEV.MVP?.estimatedBudgetMin).toBe(2000);
    });

    it('debe validar y calcular valores para la matriz en inglés con escala en USD (FC 042 / Alternativa A)', () => {
      const validPairs = [
        { vertical: 'WEB_DEV', scale: 'MVP', expectedMin: 2000, expectedMax: 3500 },
        { vertical: 'WEB_DEV', scale: 'SCALE', expectedMin: 4500, expectedMax: 9000 },
        { vertical: 'ARCHON_FLEET', scale: 'SMALL', expectedMin: 1200, expectedMax: 2500 },
        { vertical: 'ARCHON_FLEET', scale: 'LARGE', expectedMin: 3500, expectedMax: 7500 },
        { vertical: 'AI_AUTOMATION', scale: 'AGENT', expectedMin: 2500, expectedMax: 5000 },
        {
          vertical: 'AI_AUTOMATION',
          scale: 'ENTERPRISE_VISION',
          expectedMin: 5500,
          expectedMax: 11000,
        },
        {
          vertical: 'CYBERSECURITY',
          scale: 'VULN_ASSESSMENT',
          expectedMin: 1500,
          expectedMax: 3000,
        },
        { vertical: 'CYBERSECURITY', scale: 'PENTEST_FULL', expectedMin: 3500, expectedMax: 6500 },
      ];

      for (const pair of validPairs) {
        const result = evaluateQuoteMatrix(pair.vertical, pair.scale, 'en');
        expect(result).not.toBeNull();
        expect(result?.valid).toBe(true);
        expect(result?.currency).toBe('USD');
        expect(result?.locale).toBe('en');
        expect(result?.estimatedBudgetMin).toBe(pair.expectedMin);
        expect(result?.estimatedBudgetMax).toBe(pair.expectedMax);
      }
    });
  });

  describe('2. POST /api/v1/quotes Endpoint Integration Tests', () => {
    let testIpCounter = 1;
    const getTestIp = () => `198.51.200.${testIpCounter++}`;

    it('debe registrar exitosamente un lead con par válido y persistir en leads vía UPSERT (201 Created)', async () => {
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 } as any);

      const payload = {
        vertical: 'WEB_DEV',
        scale: 'MVP',
        full_name: 'Ing. Carlos Medina',
        email: 'carlos@empresa.com',
        phone: '+52 55 1234 5678',
        company_name: 'Medina Logistics',
        notes: 'Migración desde WordPress a Next.js',
        requirements: { auth: true, db: 'MariaDB' },
      };

      const res = await supertest(app)
        .post('/api/v1/quotes')
        .set('x-forwarded-for', getTestIp())
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data.vertical).toBe('WEB_DEV');
      expect(res.body.data.scale).toBe('MVP');
      expect(res.body.data.estimated_budget_min).toBe(35000);
      expect(res.body.data.estimated_budget_max).toBe(60000);
      expect(res.body.data.currency).toBe('MXN');
      expect(res.body.data.disclaimer).toContain('Estimación paramétrica orientativa');

      // Verificar que db.query fue invocado con ON DUPLICATE KEY UPDATE
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('ON DUPLICATE KEY UPDATE'),
        expect.arrayContaining([
          'carlos@empresa.com',
          'Ing. Carlos Medina',
          '+52 55 1234 5678',
          'Medina Logistics',
          'WEB_DEV',
          'MVP',
          35000,
          60000,
          3,
          5,
          JSON.stringify({ auth: true, db: 'MariaDB' }),
        ]),
      );
    });

    it('debe registrar exitosamente sin campos opcionales (company, notes, requirements)', async () => {
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 } as any);

      const payload = {
        vertical: 'AI_AUTOMATION',
        scale: 'AGENT',
        full_name: 'Dra. Elena Ruiz',
        email: 'elena@techlabs.ai',
        phone: '5544332211',
      };

      const res = await supertest(app)
        .post('/api/v1/quotes')
        .set('x-forwarded-for', getTestIp())
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.data.service_label).toBe('Inteligencia Artificial y Automatización');
      expect(res.body.data.scale_label).toBe('Agente Conversacional y RAG Empresarial');
      expect(db.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([null, null]), // company, requirements
      );
    });

    it('debe procesar cotización en inglés (locale="en") con moneda USD forzada por servidor (C-042.1 / C-042.2)', async () => {
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 } as any);

      const payload = {
        vertical: 'WEB_DEV',
        scale: 'MVP',
        full_name: 'John Miller',
        email: 'john@acme.us',
        phone: '+1 555 123 4567',
        company_name: 'Acme Corp',
        locale: 'en',
        currency: 'MXN', // Mismatch intencional del cliente: el servidor debe coaccionar a USD
      };

      const res = await supertest(app)
        .post('/api/v1/quotes')
        .set('x-forwarded-for', getTestIp())
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.message).toContain('Parametric estimation registered successfully');
      expect(res.body.data.currency).toBe('USD');
      expect(res.body.data.locale).toBe('en');
      expect(res.body.data.estimated_budget_min).toBe(2000);
      expect(res.body.data.estimated_budget_max).toBe(3500);
      expect(res.body.data.service_label).toBe('Web Development & SaaS Platforms');
      expect(res.body.data.disclaimer).toContain('List prices designed for international market');

      // Verificar que db.query recibió 'USD' y 'en'
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('ON DUPLICATE KEY UPDATE'),
        expect.arrayContaining(['USD', 'en', 2000, 3500]),
      );
    });

    it('debe rechazar combinaciones cruzadas de vertical y alcance con 400 Bad Request', async () => {
      const payload = {
        vertical: 'WEB_DEV',
        scale: 'SMALL', // Inválido para WEB_DEV
        full_name: 'Roberto Gómez',
        email: 'roberto@empresa.com',
        phone: '5511223344',
      };

      const res = await supertest(app)
        .post('/api/v1/quotes')
        .set('x-forwarded-for', getTestIp())
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid Combination');
      expect(res.body.message).toContain('La combinación de vertical y alcance');
    });

    it('debe rechazar solicitudes con campos inválidos o incompletos con 400 Bad Request', async () => {
      // 1. Email inválido
      const res1 = await supertest(app)
        .post('/api/v1/quotes')
        .set('x-forwarded-for', getTestIp())
        .send({
          vertical: 'WEB_DEV',
          scale: 'MVP',
          full_name: 'Pedro',
          email: 'not-an-email',
          phone: '12345678',
        });
      expect(res1.status).toBe(400);
      expect(res1.body.error).toBe('Validation Error');

      // 2. Nombre muy corto (< 3 chars)
      const res2 = await supertest(app)
        .post('/api/v1/quotes')
        .set('x-forwarded-for', getTestIp())
        .send({
          vertical: 'WEB_DEV',
          scale: 'MVP',
          full_name: 'Al',
          email: 'al@test.com',
          phone: '12345678',
        });
      expect(res2.status).toBe(400);

      // 3. Teléfono muy corto (< 8 chars)
      const res3 = await supertest(app)
        .post('/api/v1/quotes')
        .set('x-forwarded-for', getTestIp())
        .send({
          vertical: 'WEB_DEV',
          scale: 'MVP',
          full_name: 'Alejandro',
          email: 'al@test.com',
          phone: '123',
        });
      expect(res3.status).toBe(400);
    });

    it('debe ejecutar el despacho de correo fail-open en producción con SMTP_PASS', async () => {
      const origEnv = process.env.NODE_ENV;
      const origPass = process.env.SMTP_PASS;

      try {
        process.env.NODE_ENV = 'production';
        process.env.SMTP_PASS = 'mock_smtp_secret_pass';

        const mockSendMail = vi.fn().mockResolvedValue({ messageId: '12345' });
        vi.spyOn(contactModule, 'getTransporter').mockReturnValue({
          sendMail: mockSendMail,
        } as any);

        vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 } as any);

        const res = await supertest(app)
          .post('/api/v1/quotes')
          .set('x-forwarded-for', getTestIp())
          .send({
            vertical: 'CYBERSECURITY',
            scale: 'PENTEST_FULL',
            full_name: 'Security Officer',
            email: 'sec@bank.com',
            phone: '+52 55 9999 8888',
          });

        expect(res.status).toBe(201);
        expect(mockSendMail).toHaveBeenCalled();
      } finally {
        process.env.NODE_ENV = origEnv;
        process.env.SMTP_PASS = origPass;
      }
    });

    it('debe continuar sin bloquear si el envío de correo lanza una excepción (fail-open)', async () => {
      const origEnv = process.env.NODE_ENV;
      const origPass = process.env.SMTP_PASS;

      try {
        process.env.NODE_ENV = 'production';
        process.env.SMTP_PASS = 'mock_smtp_secret_pass';

        const mockSendMail = vi.fn().mockRejectedValue(new Error('SMTP Network Offline'));
        vi.spyOn(contactModule, 'getTransporter').mockReturnValue({
          sendMail: mockSendMail,
        } as any);

        vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 } as any);

        const res = await supertest(app)
          .post('/api/v1/quotes')
          .set('x-forwarded-for', getTestIp())
          .send({
            vertical: 'ARCHON_FLEET',
            scale: 'LARGE',
            full_name: 'Flotas México',
            email: 'contacto@flotas.mx',
            phone: '+52 55 8888 7777',
          });

        expect(res.status).toBe(201);
        expect(mockSendMail).toHaveBeenCalled();
      } finally {
        process.env.NODE_ENV = origEnv;
        process.env.SMTP_PASS = origPass;
      }
    });

    it('debe manejar errores inesperados de base de datos con 500 status', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('MariaDB connection lost'));

      const res = await supertest(app)
        .post('/api/v1/quotes')
        .set('x-forwarded-for', getTestIp())
        .send({
          vertical: 'WEB_DEV',
          scale: 'MVP',
          full_name: 'Usuario Prueba',
          email: 'prueba@test.com',
          phone: '+52 55 1111 2222',
        });

      expect(res.status).toBe(500);
      expect(res.body.message).toBe('MariaDB connection lost');

      // Error no instancia de Error
      vi.mocked(db.query).mockRejectedValueOnce('Fatal String Exception');

      const resFallback = await supertest(app)
        .post('/api/v1/quotes')
        .set('x-forwarded-for', getTestIp())
        .send({
          vertical: 'WEB_DEV',
          scale: 'MVP',
          full_name: 'Usuario Prueba',
          email: 'prueba@test.com',
          phone: '+52 55 1111 2222',
        });

      expect(resFallback.status).toBe(500);
      expect(resFallback.body.message).toBe('Error inesperado al registrar cotización.');
    });

    it('debe continuar sin fallar si logSecurityEvent lanza una excepción (non-blocking audit)', async () => {
      vi.mocked(db.query).mockResolvedValueOnce({ affectedRows: 1 } as any);
      vi.mocked(auditLoggerModule.logSecurityEvent).mockRejectedValueOnce(
        new Error('Audit logger failed'),
      );

      const res = await supertest(app)
        .post('/api/v1/quotes')
        .set('x-forwarded-for', '198.51.100.99')
        .send({
          vertical: 'WEB_DEV',
          scale: 'SCALE',
          full_name: 'Lead Sin Auditoria',
          email: 'lead@auditfail.com',
          phone: '+52 55 9999 0000',
        });

      expect(res.status).toBe(201);
    });

    it('debe bloquear con 429 Too Many Requests cuando una IP supera el límite de 10 solicitudes', async () => {
      const rateLimitIp = '198.51.100.42';
      // Realizar 10 solicitudes con la misma IP
      for (let i = 0; i < 10; i++) {
        await supertest(app)
          .post('/api/v1/quotes')
          .set('x-forwarded-for', rateLimitIp)
          .send({ invalid: true });
      }

      // La solicitud 11 con la misma IP debe ser bloqueada con 429
      const res = await supertest(app)
        .post('/api/v1/quotes')
        .set('x-forwarded-for', rateLimitIp)
        .send({
          vertical: 'WEB_DEV',
          scale: 'MVP',
          full_name: 'Over Limit User',
          email: 'over@limit.com',
          phone: '12345678',
        });

      expect(res.status).toBe(429);
      expect(res.body.error).toBe('Too Many Requests');
      expect(res.body.message).toContain('Has alcanzado el límite de solicitudes');
    });
  });

  describe('3. getQuoteClientIp Helper Unit Tests', () => {
    it('debe extraer IP desde header x-forwarded-for cuando está presente', () => {
      const mockReq = {
        headers: { 'x-forwarded-for': '203.0.113.195, 70.41.3.18' },
      } as any;
      expect(getQuoteClientIp(mockReq)).toBe('203.0.113.195');
    });

    it('debe extraer IP desde req.ip si no hay header x-forwarded-for', () => {
      const mockReq = {
        headers: {},
        ip: '192.168.1.50',
      } as any;
      expect(getQuoteClientIp(mockReq)).toBe('192.168.1.50');
    });

    it('debe extraer IP desde req.socket.remoteAddress si no hay req.ip', () => {
      const mockReq = {
        headers: {},
        socket: { remoteAddress: '10.0.0.99' },
      } as any;
      expect(getQuoteClientIp(mockReq)).toBe('10.0.0.99');
    });

    it('debe retornar 127.0.0.1 como fallback cuando no hay fuentes de IP disponibles', () => {
      const mockReq = {
        headers: {},
      } as any;
      expect(getQuoteClientIp(mockReq)).toBe('127.0.0.1');
    });
  });
});
