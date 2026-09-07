/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import supertest from 'supertest';
import express from 'express';
import * as db from '../../../server/src/db';
import { adminRouter, getAdminEmailClientKey } from '../../../server/src/routes/admin';
import * as contactModule from '../../../server/src/routes/contact';
import {
  LEAD_STATUSES,
  LEAD_ACTIVITY_TYPES,
  FOLLOWUP_TEMPLATE_IDS,
  updateLeadStatusSchema,
  createLeadActivitySchema,
  sendLeadFollowUpEmailSchema,
} from '../../../server/src/schemas/crm.schema';
import {
  escapeHtml,
  escapeLikeWildcards,
  renderLeadFollowUpEmail,
} from '../../../server/src/utils/crm';

vi.mock('../../../server/src/db', () => ({
  query: vi.fn(),
  pool: {
    execute: vi.fn().mockResolvedValue([{ insertId: 1 }]),
  },
}));

import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';

const TEST_SECRET = 'dreamtek_dev_jwt_secret_key_2026';

const adminToken = jwt.sign(
  { userId: 99, uid: 99, email: 'grayman@dreamtek.tech', role: 'ADMIN' },
  TEST_SECRET,
  { algorithm: 'HS512' },
);

const clientToken = jwt.sign(
  { userId: 42, uid: 42, email: 'client@empresa.com', role: 'CLIENT' },
  TEST_SECRET,
  { algorithm: 'HS512' },
);

// Setup test express app
const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/v1/admin', adminRouter);

describe('CRM Pipeline Backend & Formal Verification Suite (FC 041 100% Coverage)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Zod Schemas & Enums Unit Tests', () => {
    it('debe validar enums y constantes de ciclo comercial', () => {
      expect(LEAD_STATUSES).toEqual([
        'NEW',
        'CONTACTED',
        'QUALIFIED',
        'PROPOSAL_SENT',
        'NEGOTIATION',
        'WON',
        'LOST',
      ]);
      expect(LEAD_ACTIVITY_TYPES).toEqual([
        'STATUS_CHANGE',
        'NOTE',
        'EMAIL_SENT',
        'CALL_LOG',
        'MEETING_SCHEDULED',
      ]);
      expect(FOLLOWUP_TEMPLATE_IDS).toEqual([
        'DIAGNOSTIC_INVITATION',
        'PROPOSAL_SUBMITTED',
        'CUSTOM_FOLLOWUP',
      ]);
    });

    it('debe validar updateLeadStatusSchema correctamente', () => {
      const valid = updateLeadStatusSchema.safeParse({
        status: 'QUALIFIED',
        note: 'Buen prospecto',
      });
      expect(valid.success).toBe(true);

      const invalidStatus = updateLeadStatusSchema.safeParse({ status: 'INVALID_STATUS' });
      expect(invalidStatus.success).toBe(false);

      const longNote = updateLeadStatusSchema.safeParse({
        status: 'NEW',
        note: 'a'.repeat(1001),
      });
      expect(longNote.success).toBe(false);
    });

    it('debe validar createLeadActivitySchema correctamente', () => {
      const valid = createLeadActivitySchema.safeParse({
        activity_type: 'NOTE',
        title: 'Reunión inicial',
        details: 'Acuerdos clave',
      });
      expect(valid.success).toBe(true);

      const invalidType = createLeadActivitySchema.safeParse({
        activity_type: 'INVALID_TYPE',
        title: 'Título válido',
      });
      expect(invalidType.success).toBe(false);

      const shortTitle = createLeadActivitySchema.safeParse({
        activity_type: 'NOTE',
        title: 'ab',
      });
      expect(shortTitle.success).toBe(false);

      const longTitle = createLeadActivitySchema.safeParse({
        activity_type: 'NOTE',
        title: 'a'.repeat(129),
      });
      expect(longTitle.success).toBe(false);

      const longDetails = createLeadActivitySchema.safeParse({
        activity_type: 'NOTE',
        title: 'Título válido',
        details: 'a'.repeat(4001),
      });
      expect(longDetails.success).toBe(false);
    });

    it('debe validar sendLeadFollowUpEmailSchema correctamente', () => {
      const valid = sendLeadFollowUpEmailSchema.safeParse({
        template_id: 'DIAGNOSTIC_INVITATION',
        subject: 'Asunto personalizado',
        custom_message: 'Mensaje libre',
      });
      expect(valid.success).toBe(true);

      const invalidTemplate = sendLeadFollowUpEmailSchema.safeParse({
        template_id: 'INVALID_TEMPLATE',
      });
      expect(invalidTemplate.success).toBe(false);

      const longSubject = sendLeadFollowUpEmailSchema.safeParse({
        template_id: 'CUSTOM_FOLLOWUP',
        subject: 'a'.repeat(129),
      });
      expect(longSubject.success).toBe(false);

      const longCustomMessage = sendLeadFollowUpEmailSchema.safeParse({
        template_id: 'CUSTOM_FOLLOWUP',
        custom_message: 'a'.repeat(2001),
      });
      expect(longCustomMessage.success).toBe(false);
    });
  });

  describe('2. CRM Utilities Unit Tests (Sanitization & Templates)', () => {
    it('debe sanitizar cadenas con escapeHtml evitando inyecciones XSS (C-041.5)', () => {
      expect(escapeHtml('')).toBe('');
      expect(escapeHtml(null as any)).toBe('');
      expect(escapeHtml(undefined as any)).toBe('');
      expect(escapeHtml('<script>alert("xss")</script> & \'test\'')).toBe(
        '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; &amp; &#39;test&#39;',
      );
    });

    it('debe escapar comodines LIKE (escapeLikeWildcards) para prevenir inyecciones (C-041.3)', () => {
      expect(escapeLikeWildcards('')).toBe('');
      expect(escapeLikeWildcards(null as any)).toBe('');
      expect(escapeLikeWildcards('100% discount_deal\\test')).toBe(
        '100\\% discount\\_deal\\\\test',
      );
    });

    it('debe renderizar DIAGNOSTIC_INVITATION con y sin mensajes personalizados', () => {
      const context = {
        fullName: 'John Doe',
        email: 'john@example.com',
        company: 'Acme Corp',
        projectVertical: 'CYBERSECURITY',
      };

      const renderedDefault = renderLeadFollowUpEmail(context, 'DIAGNOSTIC_INVITATION');
      expect(renderedDefault.subject).toContain('Invitación a Diagnóstico Técnico');
      expect(renderedDefault.html).toContain('John Doe');
      expect(renderedDefault.html).toContain('Acme Corp');
      expect(renderedDefault.text).toContain('John Doe');

      const renderedCustom = renderLeadFollowUpEmail(
        context,
        'DIAGNOSTIC_INVITATION',
        'Asunto Especial',
        'Mensaje libre de prueba',
      );
      expect(renderedCustom.subject).toBe('Asunto Especial');
      expect(renderedCustom.html).toContain('Mensaje libre de prueba');
      expect(renderedCustom.text).toContain('Mensaje libre de prueba');
    });

    it('debe renderizar PROPOSAL_SUBMITTED con estimaciones numéricas paramétricas', () => {
      const context = {
        fullName: 'Jane Smith',
        email: 'jane@example.com',
        company: 'Global Inc',
        projectVertical: 'WEB_DEV',
        estimatedBudgetMin: 1500,
        estimatedBudgetMax: 3000,
        estimatedWeeksMin: 2,
        estimatedWeeksMax: 4,
      };

      const rendered = renderLeadFollowUpEmail(
        context,
        'PROPOSAL_SUBMITTED',
        undefined,
        'Descuento especial incluido',
      );
      expect(rendered.subject).toContain('Propuesta Comercial y Técnica');
      expect(rendered.html).toContain('1,500');
      expect(rendered.html).toContain('3,000');
      expect(rendered.html).toContain('2 a 4 semanas');
      expect(rendered.html).toContain('Descuento especial incluido');
      expect(rendered.text).toContain('Global Inc');
    });

    it('debe renderizar CUSTOM_FOLLOWUP con fallbacks cuando los campos son nulos', () => {
      const context = {
        fullName: '',
        email: 'lead@test.com',
        company: null,
        projectVertical: null,
      };

      const renderedDefault = renderLeadFollowUpEmail(context, 'CUSTOM_FOLLOWUP');
      expect(renderedDefault.subject).toContain('Seguimiento a tu solicitud');
      const renderedCustom = renderLeadFollowUpEmail(
        context,
        'CUSTOM_FOLLOWUP',
        'Custom Subject',
        'Custom note body',
      );
      expect(renderedCustom.subject).toBe('Custom Subject');
      expect(renderedCustom.html).toContain('Custom note body');
      expect(renderedCustom.text).toContain('Custom note body');
    });

    it('debe renderizar PROPOSAL_SUBMITTED sin rangos paramétricos ni mensaje personalizado', () => {
      const context = {
        fullName: '',
        email: 'carlos@test.com',
        company: null,
        projectVertical: null,
        estimatedBudgetMin: null,
        estimatedBudgetMax: null,
        estimatedWeeksMin: null,
        estimatedWeeksMax: null,
      };

      const rendered = renderLeadFollowUpEmail(context, 'PROPOSAL_SUBMITTED');
      expect(rendered.subject).toBe('Propuesta Comercial y Técnica Personalizada — Dreamtek');
      expect(rendered.html).toContain('su organización');
      expect(rendered.html).not.toContain('Rango de Inversión Proyectado');
      expect(rendered.html).not.toContain('Tiempo Estimado de Entrega');
      expect(rendered.text).toContain('su organización');
    });

    it('debe renderizar DIAGNOSTIC_INVITATION sin mensaje adicional y sin nombre', () => {
      const context = {
        fullName: '',
        email: 'anon@test.com',
        company: null,
        projectVertical: null,
      };

      const rendered = renderLeadFollowUpEmail(context, 'DIAGNOSTIC_INVITATION');
      expect(rendered.subject).toContain('Invitación a Diagnóstico Técnico');
      expect(rendered.html).toContain('Estimado/a');
      expect(rendered.html).not.toContain('Mensaje adicional');
      expect(rendered.text).toContain('Estimado/a');
    });

    it('debe renderizar plantillas de correo en inglés cuando locale="en" (FC 042)', () => {
      const enContext = {
        fullName: 'Alexander Wright',
        email: 'alex@uscorp.com',
        company: 'US Corp LLC',
        projectVertical: 'WEB_DEV',
        estimatedBudgetMin: 2000,
        estimatedBudgetMax: 3500,
        estimatedWeeksMin: 3,
        estimatedWeeksMax: 5,
        currency: 'USD',
        locale: 'en',
      };

      // 1. DIAGNOSTIC_INVITATION en inglés con nota personalizada
      const diagEn = renderLeadFollowUpEmail(
        enContext,
        'DIAGNOSTIC_INVITATION',
        undefined,
        'Custom note',
      );
      expect(diagEn.subject).toContain(
        'Technical Architecture Diagnostic Invitation — Dreamtek & US Corp LLC',
      );
      expect(diagEn.html).toContain('Hello <strong>Alexander Wright</strong>');
      expect(diagEn.html).toContain('Schedule Diagnostic Session');
      expect(diagEn.html).toContain('Custom note');
      expect(diagEn.text).toContain('30-minute technical architecture diagnostic session');
      expect(diagEn.text).toContain('US Corp LLC');

      // 1.b DIAGNOSTIC_INVITATION sin company ni custom note (cubre fallback a fullName y sin safeCustomMsg)
      const diagEnNoCompany = renderLeadFollowUpEmail(
        { fullName: 'David Clark', email: 'david@clark.io', locale: 'en' },
        'DIAGNOSTIC_INVITATION',
      );
      expect(diagEnNoCompany.subject).toContain(
        'Technical Architecture Diagnostic Invitation — Dreamtek & David Clark',
      );
      expect(diagEnNoCompany.html).not.toContain('Custom note');
      expect(diagEnNoCompany.text).not.toContain('Additional notes:');

      // 2. PROPOSAL_SUBMITTED en inglés con USD y sin custom message
      const propEn = renderLeadFollowUpEmail(enContext, 'PROPOSAL_SUBMITTED');
      expect(propEn.subject).toBe('Tailored Commercial & Technical Proposal — Dreamtek');
      expect(propEn.html).toContain('Projected Investment Range:');
      expect(propEn.html).toContain('$2,000 - $3,500 USD');
      expect(propEn.html).toContain('Estimated Delivery Time:');
      expect(propEn.html).toContain('3 to 5 weeks');
      expect(propEn.text).toContain('US Corp LLC');

      // 2.b PROPOSAL_SUBMITTED con custom message y sin rangos numéricos
      const propEnCustom = renderLeadFollowUpEmail(
        { fullName: 'Sarah Connor', email: 'sarah@resistance.org', locale: 'en' },
        'PROPOSAL_SUBMITTED',
        undefined,
        'Special enterprise pricing applied.',
      );
      expect(propEnCustom.html).toContain('Special enterprise pricing applied.');
      expect(propEnCustom.html).not.toContain('Projected Investment Range:');
      expect(propEnCustom.html).not.toContain('Estimated Delivery Time:');
      expect(propEnCustom.text).toContain('Details:\nSpecial enterprise pricing applied.');

      // 3. CUSTOM_FOLLOWUP en inglés sin mensaje libre
      const customEn = renderLeadFollowUpEmail(enContext, 'CUSTOM_FOLLOWUP');
      expect(customEn.subject).toBe('Follow-up regarding your project inquiry — Dreamtek');
      expect(customEn.html).toContain(
        'We are reaching out to follow up on your recent inquiry at Dreamtek',
      );
      expect(customEn.text).toContain('US Corp LLC');

      // 3.b CUSTOM_FOLLOWUP en inglés con mensaje libre
      const customEnMsg = renderLeadFollowUpEmail(
        enContext,
        'CUSTOM_FOLLOWUP',
        'Custom English Subject',
        'Custom English message body text.',
      );
      expect(customEnMsg.subject).toBe('Custom English Subject');
      expect(customEnMsg.html).toContain('Custom English message body text.');
      expect(customEnMsg.text).toContain('Custom English message body text.');

      // 4. Fallbacks en inglés cuando todos los campos son nulos
      const emptyEn = {
        fullName: '',
        email: 'empty@en.com',
        locale: 'en',
      };
      const emptyRender = renderLeadFollowUpEmail(emptyEn, 'CUSTOM_FOLLOWUP');
      expect(emptyRender.html).toContain('Hello <strong>Valued Client</strong>');
      expect(emptyRender.html).toContain('your organization');
      expect(emptyRender.text).toContain('Valued Client');

      const emptyDiag = renderLeadFollowUpEmail(emptyEn, 'DIAGNOSTIC_INVITATION');
      expect(emptyDiag.text).toContain('Valued Client');
      expect(emptyDiag.text).toContain('your organization');

      const emptyProp = renderLeadFollowUpEmail(emptyEn, 'PROPOSAL_SUBMITTED');
      expect(emptyProp.text).toContain('Valued Client');
      expect(emptyProp.text).toContain('your organization');
      expect(emptyProp.text).not.toContain('Details:');
    });

    it('debe resolver la clave de cliente en getAdminEmailClientKey', () => {
      // 1. Con usuario autenticado
      const reqWithUser: any = { user: { userId: 42 }, headers: {} };
      expect(getAdminEmailClientKey(reqWithUser)).toBe('admin_42');

      // 2. Con x-forwarded-for
      const reqWithXff: any = { headers: { 'x-forwarded-for': '203.0.113.195, 70.41.3.18' } };
      expect(getAdminEmailClientKey(reqWithXff)).toBe('203.0.113.195');

      // 3. Con socket remoteAddress
      const reqWithSocket: any = { headers: {}, socket: { remoteAddress: '10.0.0.1' } };
      expect(getAdminEmailClientKey(reqWithSocket)).toBe('10.0.0.1');

      // 4. Fallback 127.0.0.1
      const reqEmpty: any = { headers: {} };
      expect(getAdminEmailClientKey(reqEmpty)).toBe('127.0.0.1');
    });
  });

  describe('3. Admin CRM Endpoints Integration Tests', () => {
    it('debe verificar control de acceso RBAC según Tabla T1.1', async () => {
      // 1. Anónimo -> 401
      const resAnon = await supertest(app).get('/api/v1/admin/leads');
      expect(resAnon.status).toBe(401);

      // 2. Rol CLIENT -> 403
      const resClient = await supertest(app)
        .get('/api/v1/admin/leads')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(resClient.status).toBe(403);
    });

    it('GET /api/v1/admin/leads debe retornar lista de leads con filtros aplicados', async () => {
      const mockLeads = [
        { id: 1, full_name: 'Lead 1', status: 'NEW', project_vertical: 'WEB_DEV' },
        { id: 2, full_name: 'Lead 2', status: 'QUALIFIED', project_vertical: 'CYBERSECURITY' },
      ];

      vi.mocked(db.query).mockResolvedValueOnce(mockLeads);

      // Sin filtros
      const res = await supertest(app)
        .get('/api/v1/admin/leads')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.total).toBe(2);
      expect(res.body.leads).toHaveLength(2);

      // Con filtros de status, vertical y búsqueda
      vi.mocked(db.query).mockResolvedValueOnce([mockLeads[0]]);
      const resFiltered = await supertest(app)
        .get('/api/v1/admin/leads?status=NEW&vertical=WEB_DEV&search=Lead')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(resFiltered.status).toBe(200);
      expect(resFiltered.body.leads).toHaveLength(1);

      // Excepción en DB debe retornar 500
      vi.mocked(db.query).mockImplementationOnce(() => {
        throw new Error('Database connection failed');
      });
      const resErr = await supertest(app)
        .get('/api/v1/admin/leads')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(resErr.status).toBe(500);
      expect(resErr.body.message).toBe('Database connection failed');

      // Excepción sin message
      vi.mocked(db.query).mockImplementationOnce(() => {
        throw {};
      });
      const resErrNoMsg = await supertest(app)
        .get('/api/v1/admin/leads')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(resErrNoMsg.status).toBe(500);
      expect(resErrNoMsg.body.message).toBe('Error al consultar prospectos.');
    });

    it('GET /api/v1/admin/leads/:id debe validar ID y retornar expediente con actividades', async () => {
      // ID inválido
      const resInvalidId = await supertest(app)
        .get('/api/v1/admin/leads/abc')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(resInvalidId.status).toBe(400);
      expect(resInvalidId.body.message).toContain('ID de prospecto inválido');

      // Lead no encontrado (404)
      vi.mocked(db.query).mockResolvedValueOnce([]);
      const resNotFound = await supertest(app)
        .get('/api/v1/admin/leads/999')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(resNotFound.status).toBe(404);

      // Éxito con actividades
      const mockLead = { id: 10, email: 'lead@test.com', full_name: 'Prospecto 10' };
      const mockActivities = [
        { id: 1, activity_type: 'STATUS_CHANGE', title: 'Transición a CONTACTED' },
      ];
      vi.mocked(db.query).mockResolvedValueOnce([mockLead]).mockResolvedValueOnce(mockActivities);

      const resSuccess = await supertest(app)
        .get('/api/v1/admin/leads/10')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(resSuccess.status).toBe(200);
      expect(resSuccess.body.lead.id).toBe(10);
      expect(resSuccess.body.lead.activities).toHaveLength(1);

      // Excepción en DB
      vi.mocked(db.query).mockImplementationOnce(() => {
        throw {};
      });
      const resErr = await supertest(app)
        .get('/api/v1/admin/leads/10')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(resErr.status).toBe(500);
      expect(resErr.body.message).toBe('Error al consultar expediente de prospecto.');
    });

    it('PATCH /api/v1/admin/leads/:id/status debe actualizar estado y registrar actividad (T1.1)', async () => {
      // ID inválido
      const resInvalidId = await supertest(app)
        .patch('/api/v1/admin/leads/-5/status')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'QUALIFIED' });
      expect(resInvalidId.status).toBe(400);

      // Validación Zod fallida
      const resInvalidEnum = await supertest(app)
        .patch('/api/v1/admin/leads/10/status')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'NOT_VALID_STATUS' });
      expect(resInvalidEnum.status).toBe(400);

      // Lead no encontrado (404)
      vi.mocked(db.query).mockResolvedValueOnce([]);
      const resNotFound = await supertest(app)
        .patch('/api/v1/admin/leads/999/status')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'QUALIFIED' });
      expect(resNotFound.status).toBe(404);

      // Éxito con nota
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: 10, status: 'NEW' }]) // check lead
        .mockResolvedValueOnce({ affectedRows: 1 }) // update lead
        .mockResolvedValueOnce({ insertId: 50 }); // insert activity

      const resSuccess = await supertest(app)
        .patch('/api/v1/admin/leads/10/status')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'QUALIFIED',
          note: 'Calificación aprobada tras revisión técnica',
        });
      expect(resSuccess.status).toBe(200);
      expect(resSuccess.body.new_status).toBe('QUALIFIED');
      expect(resSuccess.body.previous_status).toBe('NEW');

      // Éxito sin nota y con previousStatus nulo
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: 10, status: null }])
        .mockResolvedValueOnce({ affectedRows: 1 })
        .mockResolvedValueOnce({ insertId: 51 });
      const resSinNota = await supertest(app)
        .patch('/api/v1/admin/leads/10/status')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'CONTACTED' });
      expect(resSinNota.status).toBe(200);
      expect(resSinNota.body.new_status).toBe('CONTACTED');

      // Excepción en DB
      vi.mocked(db.query).mockImplementationOnce(() => {
        throw {};
      });
      const resErr = await supertest(app)
        .patch('/api/v1/admin/leads/10/status')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'WON' });
      expect(resErr.status).toBe(500);
      expect(resErr.body.message).toBe('Error al actualizar estado del prospecto.');
    });

    it('POST /api/v1/admin/leads/:id/activities debe validar y registrar notas en bitácora', async () => {
      // ID inválido
      const resInvalidId = await supertest(app)
        .post('/api/v1/admin/leads/0/activities')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          activity_type: 'NOTE',
          title: 'Nota de llamada',
        });
      expect(resInvalidId.status).toBe(400);

      // Validación Zod
      const resInvalidBody = await supertest(app)
        .post('/api/v1/admin/leads/10/activities')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          activity_type: 'NOTE',
          title: '',
        });
      expect(resInvalidBody.status).toBe(400);

      // Lead inexistente
      vi.mocked(db.query).mockResolvedValueOnce([]);
      const resNotFound = await supertest(app)
        .post('/api/v1/admin/leads/999/activities')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          activity_type: 'NOTE',
          title: 'Reunión acordada',
        });
      expect(resNotFound.status).toBe(404);

      // Éxito
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: 10 }]) // check lead
        .mockResolvedValueOnce({ insertId: 77 }) // insert activity
        .mockResolvedValueOnce({ affectedRows: 1 }); // update lead last_contacted_at

      const resSuccess = await supertest(app)
        .post('/api/v1/admin/leads/10/activities')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          activity_type: 'NOTE',
          title: 'Llamada de seguimiento',
          details: 'Detalles confidenciales',
        });
      expect(resSuccess.status).toBe(201);
      expect(resSuccess.body.activity_id).toBe(77);

      // Éxito sin details y con insertResult sin insertId
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: 10 }])
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ affectedRows: 1 });
      const resSinDetails = await supertest(app)
        .post('/api/v1/admin/leads/10/activities')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          activity_type: 'CALL_LOG',
          title: 'Llamada sin detalles',
        });
      expect(resSinDetails.status).toBe(201);
      expect(resSinDetails.body.activity_id).toBeNull();

      // Excepción DB
      vi.mocked(db.query).mockImplementationOnce(() => {
        throw {};
      });
      const resErr = await supertest(app)
        .post('/api/v1/admin/leads/10/activities')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          activity_type: 'NOTE',
          title: 'Nota de prueba',
        });
      expect(resErr.status).toBe(500);
      expect(resErr.body.message).toBe('Error al registrar actividad.');
    });

    it('POST /api/v1/admin/leads/:id/send-email debe cumplir T1.2, C-041.4 (502 en SMTP error sin falso EMAIL_SENT)', async () => {
      // 1. ID inválido
      const resInvalidId = await supertest(app)
        .post('/api/v1/admin/leads/bad/send-email')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          template_id: 'DIAGNOSTIC_INVITATION',
        });
      expect(resInvalidId.status).toBe(400);

      // 2. Validación Zod fallida
      const resInvalidBody = await supertest(app)
        .post('/api/v1/admin/leads/10/send-email')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          template_id: 'INVALID_TEMPLATE',
        });
      expect(resInvalidBody.status).toBe(400);

      // 3. Lead inexistente (404)
      vi.mocked(db.query).mockResolvedValueOnce([]);
      const resNotFound = await supertest(app)
        .post('/api/v1/admin/leads/999/send-email')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          template_id: 'DIAGNOSTIC_INVITATION',
        });
      expect(resNotFound.status).toBe(404);

      // 4. Lead sin correo válido (400)
      vi.mocked(db.query).mockResolvedValueOnce([{ id: 10, email: 'not-an-email' }]);
      const resNoEmail = await supertest(app)
        .post('/api/v1/admin/leads/10/send-email')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          template_id: 'DIAGNOSTIC_INVITATION',
        });
      expect(resNoEmail.status).toBe(400);
      expect(resNoEmail.body.message).toContain('correo electrónico válido');

      // 5. Fallo de SMTP: debe responder 502 Bad Gateway y NO registrar actividad (C-041.4)
      const mockLead = {
        id: 10,
        email: 'client@example.com',
        full_name: 'Lead Prueba',
        status: 'NEW',
      };
      vi.mocked(db.query).mockResolvedValueOnce([mockLead]);

      const mockFailingTransporter = {
        sendMail: vi.fn().mockRejectedValue(new Error('SMTP Connection Offline')),
      };
      contactModule.setTransporterForTest(mockFailingTransporter);

      const resSmtpError = await supertest(app)
        .post('/api/v1/admin/leads/10/send-email')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          template_id: 'DIAGNOSTIC_INVITATION',
        });
      expect(resSmtpError.status).toBe(502);
      expect(resSmtpError.body.error).toBe('Bad Gateway');
      // Verificamos que NO se llamó al insert de actividad tras el fallo (C-041.4)
      const insertCalls = vi
        .mocked(db.query)
        .mock.calls.filter(
          (c) => typeof c[0] === 'string' && c[0].includes('INSERT INTO lead_activities'),
        );
      expect(insertCalls).toHaveLength(0);

      // 6. Éxito de SMTP: debe responder 200 OK y registrar actividad EMAIL_SENT
      vi.mocked(db.query)
        .mockResolvedValueOnce([mockLead]) // select lead
        .mockResolvedValueOnce({ insertId: 99 }) // insert activity EMAIL_SENT
        .mockResolvedValueOnce({ affectedRows: 1 }); // update lead status to CONTACTED

      const mockSuccessTransporter = {
        sendMail: vi.fn().mockResolvedValue({ messageId: 'msg-123' }),
      };
      contactModule.setTransporterForTest(mockSuccessTransporter);

      const resSuccess = await supertest(app)
        .post('/api/v1/admin/leads/10/send-email')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          template_id: 'DIAGNOSTIC_INVITATION',
          custom_message: 'Mensaje especial para el prospecto',
        });
      expect(resSuccess.status).toBe(200);
      expect(resSuccess.body.status).toBe('success');
      expect(resSuccess.body.template_id).toBe('DIAGNOSTIC_INVITATION');
      expect(mockSuccessTransporter.sendMail).toHaveBeenCalled();

      // Lead con name (sin full_name), company_name (sin company), y sin custom_message
      const mockLeadAlt = {
        id: 11,
        email: 'alt@example.com',
        name: 'Lead Alt',
        company_name: 'Empresa Alt',
        status: 'NEW',
      };
      vi.mocked(db.query)
        .mockResolvedValueOnce([mockLeadAlt])
        .mockResolvedValueOnce({ insertId: 101 })
        .mockResolvedValueOnce({ affectedRows: 1 });

      const resAlt = await supertest(app)
        .post('/api/v1/admin/leads/11/send-email')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          template_id: 'DIAGNOSTIC_INVITATION',
        });
      expect(resAlt.status).toBe(200);

      // Lead sin full_name ni name, y status CONTACTED
      const mockLeadNoName = {
        id: 12,
        email: 'noname@example.com',
        status: 'CONTACTED',
      };
      vi.mocked(db.query)
        .mockResolvedValueOnce([mockLeadNoName])
        .mockResolvedValueOnce({ insertId: 102 })
        .mockResolvedValueOnce({ affectedRows: 1 });

      const resNoName = await supertest(app)
        .post('/api/v1/admin/leads/12/send-email')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          template_id: 'DIAGNOSTIC_INVITATION',
        });
      expect(resNoName.status).toBe(200);

      // Limpiamos test transporter
      contactModule.setTransporterForTest(null);

      // 7. Excepción general en ruta
      vi.mocked(db.query).mockImplementationOnce(() => {
        throw {};
      });
      const resErr = await supertest(app)
        .post('/api/v1/admin/leads/10/send-email')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          template_id: 'CUSTOM_FOLLOWUP',
        });
      expect(resErr.status).toBe(500);
      expect(resErr.body.message).toBe('Error al procesar envío de correo.');
    });
  });
});
