/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import supertest from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import * as db from '../../../server/src/db';
import { clientRouter } from '../../../server/src/routes/client';
import { adminRouter } from '../../../server/src/routes/admin';
import { authRouter } from '../../../server/src/routes/auth';
import { checkoutRouter } from '../../../server/src/routes/checkout';
import {
  httpsUrlSchema,
  clientBriefingSchema,
  adminUpdateProjectSchema,
  adminUpdateMilestoneSchema,
  adminCreateProjectFromLeadSchema,
} from '../../../server/src/schemas/project.schema';
import {
  seedProjectMilestones,
  provisionClientProjectForLead,
  extractRows,
} from '../../../server/src/utils/project';

vi.mock('../../../server/src/db', () => {
  const mockQuery = vi.fn();
  return {
    query: mockQuery,
    withTransaction: vi.fn(async (cb: any) => cb({ query: mockQuery })),
    pool: {
      execute: vi.fn().mockResolvedValue([{ insertId: 1 }]),
    },
  };
});

const TEST_SECRET = 'dreamtek_dev_jwt_secret_key_2026';

const getAdminToken = (uid = 99) =>
  jwt.sign({ userId: uid, uid, email: `admin_${uid}@dreamtek.tech`, role: 'ADMIN' }, TEST_SECRET, {
    algorithm: 'HS512',
  });

const getClientToken = (uid = 42) =>
  jwt.sign({ userId: uid, uid, email: `client_${uid}@empresa.com`, role: 'CLIENT' }, TEST_SECRET, {
    algorithm: 'HS512',
  });

const adminToken = getAdminToken(99);
const clientToken = getClientToken(42);

// Setup express app for test
const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/v1/client', clientRouter);
app.use('/api/v1/admin', adminRouter);
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/checkout', checkoutRouter);

describe('FC 044 B2B Client Projects & Onboarding Workspace Engine Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Zod Schemas & Anti-SSRF Validation (Conditions C-044.4 & C-044.5)', () => {
    it('httpsUrlSchema debe aceptar únicamente URLs https:// y rechazar http:// u otros esquemas', () => {
      expect(httpsUrlSchema.safeParse('https://staging.dreamtek.tech').success).toBe(true);
      expect(httpsUrlSchema.safeParse('https://github.com/org/repo').success).toBe(true);

      const httpRes = httpsUrlSchema.safeParse('http://insecure.dreamtek.tech');
      expect(httpRes.success).toBe(false);

      const ftpRes = httpsUrlSchema.safeParse('ftp://ftp.dreamtek.tech');
      expect(ftpRes.success).toBe(false);

      const notUrl = httpsUrlSchema.safeParse('not-a-url');
      expect(notUrl.success).toBe(false);
    });

    it('clientBriefingSchema debe validar longitud mínima de objetivos y límite de URLs', () => {
      const valid = clientBriefingSchema.safeParse({
        business_goals: 'Construir una plataforma SaaS escalable con pasarela Stripe.',
        target_audience: 'Empresas B2B del sector logístico',
        technical_stack_preferences: 'Next.js, Node.js, PostgreSQL',
        infrastructure_notes: 'AWS ECS Fargate existente',
        reference_urls: ['https://example.com/spec', 'https://figma.com/design'],
        contact_lead_notes: 'Llamar después de las 2 PM',
      });
      expect(valid.success).toBe(true);

      // Falla por objetivos muy cortos
      const tooShort = clientBriefingSchema.safeParse({
        business_goals: 'No',
      });
      expect(tooShort.success).toBe(false);

      // Falla si URL no es https
      const invalidUrl = clientBriefingSchema.safeParse({
        business_goals: 'Objetivo válido con más de 10 caracteres',
        reference_urls: ['http://insecure-site.com'],
      });
      expect(invalidUrl.success).toBe(false);
    });

    it('adminUpdateProjectSchema debe validar campos opcionales y URLs https estrictas', () => {
      const valid = adminUpdateProjectSchema.safeParse({
        status: 'IN_DEVELOPMENT',
        staging_url: 'https://staging.dreamtek.tech/demo',
        repository_url: 'https://github.com/dreamtek/repo-b2b',
        project_name: 'Proyecto Alpha Enterprise',
      });
      expect(valid.success).toBe(true);

      const invalidStaging = adminUpdateProjectSchema.safeParse({
        staging_url: 'http://insecure-staging.com',
      });
      expect(invalidStaging.success).toBe(false);
    });

    it('adminUpdateMilestoneSchema debe validar status permitidos y target_week', () => {
      expect(adminUpdateMilestoneSchema.safeParse({ status: 'COMPLETED' }).success).toBe(true);
      expect(
        adminUpdateMilestoneSchema.safeParse({ status: 'IN_PROGRESS', target_week: 4 }).success,
      ).toBe(true);
      expect(adminUpdateMilestoneSchema.safeParse({ status: 'INVALID_STATUS' }).success).toBe(
        false,
      );
      expect(
        adminUpdateMilestoneSchema.safeParse({ status: 'PENDING', target_week: 99 }).success,
      ).toBe(false);
    });

    it('adminCreateProjectFromLeadSchema debe validar parámetros opcionales de provisión', () => {
      const valid = adminCreateProjectFromLeadSchema.safeParse({
        project_name: 'Proyecto SPEI #123',
        vertical: 'custom_dev',
        estimated_weeks: 8,
        paid_amount_cents: 500000,
      });
      expect(valid.success).toBe(true);
    });
  });

  describe('2. Project Utils & Milestones Seeding (Condition C-044.6)', () => {
    it('seedProjectMilestones debe escalar proporcionalmente los 4 hitos según estimatedWeeks', async () => {
      const mockConn = { query: vi.fn().mockResolvedValue([{ affectedRows: 1 }]) };

      // Caso 1: 4 semanas -> 1, 2, 3, 4
      const m4 = await seedProjectMilestones(mockConn, 10, 4);
      expect(m4.length).toBe(4);
      expect(m4[0].target_week).toBe(1);
      expect(m4[1].target_week).toBe(2);
      expect(m4[2].target_week).toBe(3);
      expect(m4[3].target_week).toBe(4);

      // Caso 2: 12 semanas -> 3, 6, 9, 12
      const m12 = await seedProjectMilestones(mockConn, 11, 12);
      expect(m12[0].target_week).toBe(3);
      expect(m12[1].target_week).toBe(6);
      expect(m12[2].target_week).toBe(9);
      expect(m12[3].target_week).toBe(12);

      // Caso 3: fallback para semanas <= 0
      const mFallback = await seedProjectMilestones(mockConn, 12, 0);
      expect(mFallback.length).toBe(4);
      expect(mFallback[3].target_week).toBe(4);
    });

    it('provisionClientProjectForLead debe ser idempotente si el proyecto ya existe (C-044.2)', async () => {
      const mockConn = {
        query: vi.fn().mockImplementation((sql: string) => {
          if (
            sql.includes('SELECT id, tenant_id, user_id FROM client_projects WHERE lead_id = ?')
          ) {
            return Promise.resolve([{ id: 77, tenant_id: 10, user_id: 42 }]);
          }
          return Promise.resolve([]);
        }),
      };

      const res = await provisionClientProjectForLead(mockConn, 999);
      expect(res.created).toBe(false);
      expect(res.projectId).toBe(77);
      expect(res.userId).toBe(42);
      expect(res.tenantId).toBe(10);
    });

    it('provisionClientProjectForLead debe crear usuario, tenant y proyecto si no existen (C-044.1, C-044.3, C-044.4)', async () => {
      const mockConn = {
        query: vi.fn().mockImplementation((sql: string) => {
          if (sql.includes('SELECT id, tenant_id, user_id FROM client_projects')) {
            return Promise.resolve([]);
          }
          if (sql.includes('SELECT * FROM leads WHERE id = ?')) {
            return Promise.resolve([
              {
                id: 100,
                email: 'nuevo@empresa.com',
                name: 'Roberto Gomez',
                company: 'Logística Express',
                project_vertical: 'saas_platform',
                estimated_budget_min: 10000,
                estimated_weeks_min: 8,
                currency: 'USD',
              },
            ]);
          }
          if (sql.includes('SELECT id FROM users WHERE email = ?')) {
            return Promise.resolve([]); // usuario no existe
          }
          if (sql.includes('INSERT INTO users')) {
            return Promise.resolve({ insertId: 55 });
          }
          if (sql.includes('SELECT id FROM tenants WHERE owner_user_id = ?')) {
            return Promise.resolve([]); // tenant no existe
          }
          if (sql.includes('INSERT INTO tenants')) {
            return Promise.resolve({ insertId: 33 });
          }
          if (sql.includes('INSERT INTO client_projects')) {
            return Promise.resolve({ insertId: 88 });
          }
          if (sql.includes('INSERT INTO client_project_milestones')) {
            return Promise.resolve({ affectedRows: 1 });
          }
          return Promise.resolve([]);
        }),
      };

      const res = await provisionClientProjectForLead(mockConn, 100, { paidAmountCents: 500000 });
      expect(res.created).toBe(true);
      expect(res.projectId).toBe(88);
      expect(res.userId).toBe(55);
      expect(res.tenantId).toBe(33);
    });

    it('provisionClientProjectForLead debe reutilizar usuario y tenant existentes si ya fueron creados', async () => {
      const mockConn = {
        query: vi.fn().mockImplementation((sql: string) => {
          if (sql.includes('SELECT id, tenant_id, user_id FROM client_projects')) {
            return Promise.resolve([]);
          }
          if (sql.includes('SELECT * FROM leads WHERE id = ?')) {
            return Promise.resolve([
              {
                id: 101,
                email: 'existente@empresa.com',
                name: 'Ana Perez',
                company: 'Retail Co',
              },
            ]);
          }
          if (sql.includes('SELECT id FROM users WHERE email = ?')) {
            return Promise.resolve([{ id: 40 }]); // usuario existe
          }
          if (sql.includes('SELECT id FROM tenants WHERE owner_user_id = ?')) {
            return Promise.resolve([{ id: 25 }]); // tenant existe
          }
          if (sql.includes('INSERT INTO client_projects')) {
            return Promise.resolve({ insertId: 90 });
          }
          if (sql.includes('INSERT INTO client_project_milestones')) {
            return Promise.resolve({ affectedRows: 1 });
          }
          return Promise.resolve([]);
        }),
      };

      const res = await provisionClientProjectForLead(mockConn, 101);
      expect(res.created).toBe(true);
      expect(res.projectId).toBe(90);
      expect(res.userId).toBe(40);
      expect(res.tenantId).toBe(25);
    });
  });

  describe('3. Client Endpoints (/api/v1/client) & Anti-IDOR (Condition C-044.7)', () => {
    it('GET /api/v1/client/dashboard debe incluir proyectos y calcular progreso de hitos', async () => {
      vi.mocked(db.query).mockImplementation((sql: string) => {
        if (sql.includes('SELECT id, full_name, email, role, created_at FROM users')) {
          return Promise.resolve([
            {
              id: 42,
              full_name: 'Cliente Test',
              email: 'client_42@empresa.com',
              role: 'CLIENT',
              created_at: new Date(),
            },
          ]);
        }
        if (sql.includes('SELECT id, domain, status, ssl FROM client_sites')) {
          return Promise.resolve([]);
        }
        if (
          sql.includes(
            'SELECT id, plan_id, billing_cycle, status, amount, renews_at FROM subscriptions',
          )
        ) {
          return Promise.resolve([]);
        }
        if (sql.includes('SELECT id, tenant_id, user_id, lead_id, project_name')) {
          return Promise.resolve([
            {
              id: 10,
              tenant_id: 1,
              user_id: 42,
              project_name: 'E-Commerce Global',
              vertical: 'ecommerce',
              status: 'IN_DEVELOPMENT',
              currency: 'USD',
              budget_cents: 600000,
              paid_amount_cents: 300000,
              pending_balance_cents: 300000,
              estimated_weeks: 6,
              briefing_data: JSON.stringify({ business_goals: 'Vender online' }),
              staging_url: 'https://staging.ecommerce.dreamtek.tech',
              repository_url: 'https://github.com/dreamtek/ecommerce',
              created_at: new Date(),
              updated_at: new Date(),
            },
          ]);
        }
        if (sql.includes('client_project_milestones')) {
          return Promise.resolve([
            { id: 1, project_id: 10, milestone_index: 1, title: 'Hito 1', status: 'COMPLETED' },
            { id: 2, project_id: 10, milestone_index: 2, title: 'Hito 2', status: 'IN_PROGRESS' },
          ]);
        }
        return Promise.resolve([]);
      });

      const res = await supertest(app)
        .get('/api/v1/client/dashboard')
        .set('Cookie', [`dreamtek_session=${clientToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.projects).toBeDefined();
      expect(res.body.projects.length).toBe(1);
      expect(res.body.projects[0].progress_percent).toBe(50); // 1 de 2 completado
      expect(res.body.projects[0].briefing_data.business_goals).toBe('Vender online');
    });

    it('GET /api/v1/client/projects/:id debe retornar expediente si pertenece al usuario', async () => {
      vi.mocked(db.query).mockImplementation((sql: string) => {
        if (sql.includes('SELECT id, tenant_id, user_id, lead_id, project_name')) {
          return Promise.resolve([
            {
              id: 10,
              tenant_id: 1,
              user_id: 42,
              project_name: 'App Móvil',
              vertical: 'mobile_app',
              status: 'ONBOARDING_BRIEF',
              currency: 'USD',
              budget_cents: 500000,
              paid_amount_cents: 250000,
              pending_balance_cents: 250000,
              estimated_weeks: 4,
              briefing_data: null,
            },
          ]);
        }
        if (sql.includes('FROM client_project_milestones')) {
          return Promise.resolve([]);
        }
        return Promise.resolve([]);
      });

      const res = await supertest(app)
        .get('/api/v1/client/projects/10')
        .set('Cookie', [`dreamtek_session=${clientToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.project.project_name).toBe('App Móvil');
      expect(res.body.project.progress_percent).toBe(0);
    });

    it('GET /api/v1/client/projects/:id debe retornar 400 con ID inválido y 404 si no pertenece al usuario (Anti-IDOR)', async () => {
      const resInvalid = await supertest(app)
        .get('/api/v1/client/projects/abc')
        .set('Cookie', [`dreamtek_session=${clientToken}`]);
      expect(resInvalid.status).toBe(400);

      vi.mocked(db.query).mockResolvedValueOnce([]); // no project found for this user
      const resNotFound = await supertest(app)
        .get('/api/v1/client/projects/999')
        .set('Cookie', [`dreamtek_session=${clientToken}`]);
      expect(resNotFound.status).toBe(404);
    });

    it('PUT /api/v1/client/projects/:id/briefing debe sanitizar HTML anti-XSS y transicionar a ARCHITECTURE_DESIGN', async () => {
      vi.mocked(db.query).mockImplementation((sql: string) => {
        if (sql.includes('SELECT id, status FROM client_projects WHERE id = ? AND user_id = ?')) {
          return Promise.resolve([{ id: 10, status: 'ONBOARDING_BRIEF' }]);
        }
        if (sql.includes('UPDATE client_projects SET briefing_data = ?')) {
          return Promise.resolve({ affectedRows: 1 });
        }
        return Promise.resolve([]);
      });

      const payload = {
        business_goals: '<script>alert("XSS")</script> Objetivos de la plataforma',
        target_audience: 'Usuarios <b>finales</b>',
        technical_stack_preferences: 'Node.js & React',
        infrastructure_notes: 'AWS & Cloudflare',
        reference_urls: ['https://dreamtek.tech'],
        contact_lead_notes: 'Llamar al "CEO"',
      };

      const res = await supertest(app)
        .put('/api/v1/client/projects/10/briefing')
        .set('Cookie', [`dreamtek_session=${clientToken}`])
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.status_updated).toBe('ARCHITECTURE_DESIGN');
      expect(res.body.briefing.business_goals).not.toContain('<script>');
      expect(res.body.briefing.business_goals).toContain('&lt;script&gt;');
      expect(res.body.briefing.target_audience).toContain('&lt;b&gt;');
    });

    it('PUT /api/v1/client/projects/:id/briefing debe rechazar payload inválido o proyecto inexistente', async () => {
      // ID inválido
      const resInvalidId = await supertest(app)
        .put('/api/v1/client/projects/invalid/briefing')
        .set('Cookie', [`dreamtek_session=${clientToken}`])
        .send({});
      expect(resInvalidId.status).toBe(400);

      // Proyecto no encontrado
      vi.mocked(db.query).mockResolvedValueOnce([]);
      const resNotFound = await supertest(app)
        .put('/api/v1/client/projects/999/briefing')
        .set('Cookie', [`dreamtek_session=${clientToken}`])
        .send({ business_goals: 'Objetivo válido de prueba' });
      expect(resNotFound.status).toBe(404);

      // Validación Zod fallida
      vi.mocked(db.query).mockResolvedValueOnce([{ id: 10, status: 'ONBOARDING_BRIEF' }]);
      const resValFail = await supertest(app)
        .put('/api/v1/client/projects/10/briefing')
        .set('Cookie', [`dreamtek_session=${clientToken}`])
        .send({ business_goals: '123' }); // muy corto
      expect(resValFail.status).toBe(400);
      expect(resValFail.body.error).toBe('Validation Error');
    });
  });

  describe('4. Admin Endpoints (/api/v1/admin) (Conditions C-044.4 & C-044.5)', () => {
    it('GET /api/v1/admin/projects debe listar proyectos con filtros y búsqueda, cubriendo parseo de briefing', async () => {
      vi.mocked(db.query).mockImplementation((sql: string) => {
        if (sql.includes('SELECT COUNT(*) as total FROM')) {
          return Promise.resolve([{ total: 3 }]);
        }
        if (sql.includes('FROM client_projects p')) {
          return Promise.resolve([
            {
              id: 1,
              project_name: 'Portal Corporativo',
              vertical: 'saas_platform',
              status: 'IN_DEVELOPMENT',
              currency: 'USD',
              budget_cents: 800000,
              paid_amount_cents: 400000,
              pending_balance_cents: 400000,
              estimated_weeks: 8,
              tenant_name: 'Empresa SA',
              user_email: 'ceo@empresa.com',
              briefing_data: JSON.stringify({ business_goals: 'Escalar ventas' }),
            },
            {
              id: 2,
              project_name: 'App Móvil Corrupt Briefing',
              vertical: 'custom_dev',
              status: 'ONBOARDING_BRIEF',
              currency: 'USD',
              budget_cents: 500000,
              paid_amount_cents: 250000,
              pending_balance_cents: 250000,
              estimated_weeks: 6,
              tenant_name: 'Corrupt SA',
              user_email: 'dev@corrupt.com',
              briefing_data: '{invalid-json-content',
            },
            {
              id: 3,
              project_name: 'App Direct Object',
              vertical: 'saas_platform',
              status: 'COMPLETED',
              currency: 'USD',
              budget_cents: 600000,
              paid_amount_cents: 600000,
              pending_balance_cents: 0,
              estimated_weeks: 4,
              tenant_name: 'Direct SA',
              user_email: 'admin@direct.com',
              briefing_data: { direct_key: 'direct_val' },
            },
          ]);
        }
        if (sql.includes('FROM client_project_milestones')) {
          return Promise.resolve([
            { id: 101, status: 'COMPLETED' },
            { id: 102, status: 'PENDING' },
          ]);
        }
        return Promise.resolve([]);
      });

      const res = await supertest(app)
        .get('/api/v1/admin/projects?status=IN_DEVELOPMENT&vertical=saas_platform&search=Portal')
        .set('Cookie', [`dreamtek_session=${adminToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.total).toBe(3);
      expect(res.body.projects.length).toBe(3);
      expect(res.body.projects[0].tenant_name).toBe('Empresa SA');
      expect(res.body.projects[0].briefing_data.business_goals).toBe('Escalar ventas');
      expect(res.body.projects[1].briefing_data).toBe('{invalid-json-content');
      expect(res.body.projects[2].briefing_data.direct_key).toBe('direct_val');
      expect(res.body.projects[0].progress_percent).toBe(50);
    });

    it('GET /api/v1/admin/projects debe tolerar rechazo en consulta de conteo e hitos y probar paginación límite', async () => {
      vi.mocked(db.query).mockImplementation((sql: string) => {
        // Rechazar count query para ejecutar la función catch(() => [{ total: 0 }]) en admin.ts línea 741
        if (sql.includes('SELECT COUNT(*) as total FROM'))
          return Promise.reject(new Error('Count failure'));
        if (sql.includes('FROM client_projects p')) {
          return Promise.resolve([
            {
              id: 99,
              project_name: 'Fallback Milestones Project',
              briefing_data: null,
            },
          ]);
        }
        if (sql.includes('FROM client_project_milestones')) {
          return Promise.reject(new Error('Milestones query failure'));
        }
        return Promise.resolve([]);
      });

      // Paginación con valores no numéricos y límites excedidos
      const res = await supertest(app)
        .get('/api/v1/admin/projects?page=invalid&limit=999')
        .set('Cookie', [`dreamtek_session=${adminToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.page).toBe(1);
      expect(res.body.limit).toBe(100);
      expect(res.body.total).toBe(0);
      expect(res.body.projects[0].milestones).toEqual([]);
      expect(res.body.projects[0].progress_percent).toBe(0);

      // Paginación con valores negativos y límite inválido
      const res2 = await supertest(app)
        .get('/api/v1/admin/projects?page=-5&limit=invalid')
        .set('Cookie', [`dreamtek_session=${adminToken}`]);
      expect(res2.status).toBe(200);
      expect(res2.body.page).toBe(1);
      expect(res2.body.limit).toBe(20);
    });

    it('GET /api/v1/admin/projects debe manejar error de DB sin mensaje (fallback 500)', async () => {
      vi.mocked(db.query).mockImplementation((sql: string) => {
        if (sql.includes('SELECT COUNT(*) as total FROM')) return Promise.resolve([{ total: 1 }]);
        if (sql.includes('FROM client_projects p')) return Promise.reject({});
        return Promise.resolve([]);
      });

      const res = await supertest(app)
        .get('/api/v1/admin/projects')
        .set('Cookie', [`dreamtek_session=${adminToken}`]);

      expect(res.status).toBe(500);
      expect(res.body.message).toBe('Error al consultar proyectos B2B.');
    });

    it('POST /api/v1/admin/leads/:id/create-project debe manejar respuesta idempotente (created=false, status 200)', async () => {
      vi.mocked(db.query).mockImplementation((sql: string) => {
        if (sql.includes('SELECT * FROM leads WHERE id = ? LIMIT 1')) {
          return Promise.resolve([{ id: 70, email: 'spei@cliente.com' }]);
        }
        return Promise.resolve([]);
      });
      vi.mocked(db.withTransaction).mockImplementationOnce(async () => {
        return { created: false, projectId: 77 };
      });

      const res = await supertest(app)
        .post('/api/v1/admin/leads/70/create-project')
        .set('Cookie', [`dreamtek_session=${adminToken}`])
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('El proyecto ya existía para este prospecto (idempotente).');
    });

    it('POST /api/v1/admin/leads/:id/create-project debe aprovisionar manualmente un proyecto', async () => {
      vi.mocked(db.query).mockImplementation((sql: string) => {
        if (sql.includes('SELECT * FROM leads WHERE id = ? LIMIT 1')) {
          return Promise.resolve([
            {
              id: 70,
              email: 'spei@cliente.com',
              name: 'Cliente SPEI',
              company: 'Fintech SPEI',
              estimated_budget_min: 5000,
              estimated_weeks_min: 6,
              currency: 'USD',
            },
          ]);
        }
        if (sql.includes('INSERT INTO')) {
          return Promise.resolve({ insertId: 77, affectedRows: 1 });
        }
        return Promise.resolve([]);
      });

      const res = await supertest(app)
        .post('/api/v1/admin/leads/70/create-project')
        .set('Cookie', [`dreamtek_session=${adminToken}`])
        .send({
          project_name: 'Plataforma Fintech B2B',
          vertical: 'saas_platform',
          estimated_weeks: 6,
          paid_amount_cents: 250000,
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
    });

    it('POST /api/v1/admin/leads/:id/create-project debe fallar con ID o schema inválido o lead inexistente', async () => {
      const resInvalidId = await supertest(app)
        .post('/api/v1/admin/leads/abc/create-project')
        .set('Cookie', [`dreamtek_session=${adminToken}`])
        .send({});
      expect(resInvalidId.status).toBe(400);

      const resInvalidSchema = await supertest(app)
        .post('/api/v1/admin/leads/70/create-project')
        .set('Cookie', [`dreamtek_session=${adminToken}`])
        .send({ estimated_weeks: 999 }); // semana fuera de rango
      expect(resInvalidSchema.status).toBe(400);

      vi.mocked(db.query).mockResolvedValueOnce([]);
      const resNotFound = await supertest(app)
        .post('/api/v1/admin/leads/999/create-project')
        .set('Cookie', [`dreamtek_session=${adminToken}`])
        .send({});
      expect(resNotFound.status).toBe(404);
    });

    it('PUT /api/v1/admin/projects/:id debe actualizar URLs y fase aplicando anti-SSRF (C-044.5)', async () => {
      vi.mocked(db.query).mockImplementation((sql: string) => {
        if (sql.includes('SELECT id FROM client_projects WHERE id = ? LIMIT 1')) {
          return Promise.resolve([{ id: 10 }]);
        }
        if (sql.includes('UPDATE client_projects SET')) {
          return Promise.resolve({ affectedRows: 1 });
        }
        if (sql.includes('SELECT * FROM client_projects WHERE id = ? LIMIT 1')) {
          return Promise.resolve([{ id: 10, staging_url: 'https://staging.dreamtek.tech' }]);
        }
        return Promise.resolve([]);
      });

      // Rechazar http://
      const resHttp = await supertest(app)
        .put('/api/v1/admin/projects/10')
        .set('Cookie', [`dreamtek_session=${adminToken}`])
        .send({ staging_url: 'http://insecure-staging.com' });
      expect(resHttp.status).toBe(400);

      // Aceptar https://
      const resHttps = await supertest(app)
        .put('/api/v1/admin/projects/10')
        .set('Cookie', [`dreamtek_session=${adminToken}`])
        .send({
          status: 'STAGING_REVIEW',
          staging_url: 'https://staging.dreamtek.tech',
          repository_url: 'https://github.com/dreamtek/repo-secure',
        });
      expect(resHttps.status).toBe(200);
      expect(resHttps.body.message).toContain('actualizado con éxito');
    });

    it('PUT /api/v1/admin/projects/:id/milestones/:milestoneId debe actualizar estado de hito', async () => {
      vi.mocked(db.query).mockImplementation((sql: string) => {
        if (
          sql.includes('SELECT id FROM client_project_milestones WHERE id = ? AND project_id = ?')
        ) {
          return Promise.resolve([{ id: 2 }]);
        }
        if (sql.includes('UPDATE client_project_milestones SET')) {
          return Promise.resolve({ affectedRows: 1 });
        }
        if (sql.includes('SELECT * FROM client_project_milestones WHERE id = ? LIMIT 1')) {
          return Promise.resolve([{ id: 2, status: 'COMPLETED', completed_at: new Date() }]);
        }
        return Promise.resolve([]);
      });

      const res = await supertest(app)
        .put('/api/v1/admin/projects/10/milestones/2')
        .set('Cookie', [`dreamtek_session=${adminToken}`])
        .send({
          status: 'COMPLETED',
          title: 'Arquitectura Aprobada',
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.milestone.status).toBe('COMPLETED');
    });

    it('PUT /api/v1/admin/projects/:id/milestones/:milestoneId debe retornar 404 si el hito no pertenece al proyecto', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]); // hito no encontrado en proyecto
      const res = await supertest(app)
        .put('/api/v1/admin/projects/10/milestones/999')
        .set('Cookie', [`dreamtek_session=${adminToken}`])
        .send({ status: 'IN_PROGRESS' });

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('Hito no encontrado');
    });

    it('debe manejar errores y casos bordes en endpoints administrativos de proyectos e hitos', async () => {
      // GET /projects fallo en DB
      vi.mocked(db.query).mockImplementation((sql: string) => {
        if (sql.includes('SELECT COUNT(*) as total FROM')) return Promise.resolve([{ total: 1 }]);
        if (sql.includes('ORDER BY p.created_at DESC'))
          return Promise.reject(new Error('DB Query Error'));
        return Promise.resolve([]);
      });
      const resListErr = await supertest(app)
        .get('/api/v1/admin/projects')
        .set('Cookie', [`dreamtek_session=${adminToken}`]);
      expect(resListErr.status).toBe(500);

      // POST /leads/:id/create-project ID inválido
      const resPostInvId = await supertest(app)
        .post('/api/v1/admin/leads/invalid/create-project')
        .set('Cookie', [`dreamtek_session=${adminToken}`])
        .send({});
      expect(resPostInvId.status).toBe(400);

      // POST /leads/:id/create-project Zod error
      const resPostZodErr = await supertest(app)
        .post('/api/v1/admin/leads/10/create-project')
        .set('Cookie', [`dreamtek_session=${adminToken}`])
        .send({ paid_amount_cents: -500 });
      expect(resPostZodErr.status).toBe(400);

      // POST /leads/:id/create-project fallo en DB
      vi.mocked(db.query).mockResolvedValueOnce([{ id: 10 }]); // lead exists
      vi.mocked(db.withTransaction).mockRejectedValueOnce(new Error('Txn fail'));
      const resPostTxnErr = await supertest(app)
        .post('/api/v1/admin/leads/10/create-project')
        .set('Cookie', [`dreamtek_session=${adminToken}`])
        .send({});
      expect(resPostTxnErr.status).toBe(500);

      // POST /leads/:id/create-project fallo en DB sin mensaje
      vi.mocked(db.query).mockResolvedValueOnce([{ id: 10 }]);
      vi.mocked(db.withTransaction).mockRejectedValueOnce({});
      const resPostTxnNoMsg = await supertest(app)
        .post('/api/v1/admin/leads/10/create-project')
        .set('Cookie', [`dreamtek_session=${adminToken}`])
        .send({});
      expect(resPostTxnNoMsg.status).toBe(500);
      expect(resPostTxnNoMsg.body.message).toBe('Error al aprovisionar proyecto B2B.');

      // PUT /projects/:id ID inválido
      const resPutInvId = await supertest(app)
        .put('/api/v1/admin/projects/0')
        .set('Cookie', [`dreamtek_session=${adminToken}`])
        .send({ project_name: 'Nuevo' });
      expect(resPutInvId.status).toBe(400);

      // PUT /projects/:id Proyecto no encontrado
      vi.mocked(db.query).mockResolvedValueOnce([]);
      const resPutNotFound = await supertest(app)
        .put('/api/v1/admin/projects/999')
        .set('Cookie', [`dreamtek_session=${adminToken}`])
        .send({ project_name: 'Nuevo' });
      expect(resPutNotFound.status).toBe(404);

      // PUT /projects/:id Sin campos válidos enviados
      vi.mocked(db.query).mockResolvedValueOnce([{ id: 10 }]);
      const resPutEmpty = await supertest(app)
        .put('/api/v1/admin/projects/10')
        .set('Cookie', [`dreamtek_session=${adminToken}`])
        .send({});
      expect(resPutEmpty.status).toBe(400);
      expect(resPutEmpty.body.message).toContain('No se enviaron campos válidos');

      // PUT /projects/:id Actualizar project_name exitosamente
      vi.mocked(db.query).mockImplementation((sql: string) => {
        if (sql.includes('SELECT id FROM client_projects')) return Promise.resolve([{ id: 10 }]);
        if (sql.includes('UPDATE client_projects')) return Promise.resolve({ affectedRows: 1 });
        if (sql.includes('SELECT * FROM client_projects')) {
          return Promise.resolve([{ id: 10, project_name: 'Nombre Actualizado' }]);
        }
        return Promise.resolve([]);
      });
      const resPutName = await supertest(app)
        .put('/api/v1/admin/projects/10')
        .set('Cookie', [`dreamtek_session=${adminToken}`])
        .send({ project_name: 'Nombre Actualizado' });
      expect(resPutName.status).toBe(200);
      expect(resPutName.body.project.project_name).toBe('Nombre Actualizado');

      // PUT /projects/:id DB error con mensaje
      vi.mocked(db.query).mockResolvedValueOnce([{ id: 10 }]);
      vi.mocked(db.query).mockRejectedValueOnce(new Error('Update project fail'));
      const resPutErr = await supertest(app)
        .put('/api/v1/admin/projects/10')
        .set('Cookie', [`dreamtek_session=${adminToken}`])
        .send({ project_name: 'Nombre Fail' });
      expect(resPutErr.status).toBe(500);

      // PUT /projects/:id DB error sin mensaje
      vi.mocked(db.query).mockResolvedValueOnce([{ id: 10 }]);
      vi.mocked(db.query).mockRejectedValueOnce({});
      const resPutErrNoMsg = await supertest(app)
        .put('/api/v1/admin/projects/10')
        .set('Cookie', [`dreamtek_session=${adminToken}`])
        .send({ project_name: 'Nombre Fail' });
      expect(resPutErrNoMsg.status).toBe(500);
      expect(resPutErrNoMsg.body.message).toBe('Error al actualizar proyecto.');

      // PUT /projects/:id/milestones/:milestoneId IDs inválidos
      const resMilestoneInvId = await supertest(app)
        .put('/api/v1/admin/projects/0/milestones/invalid')
        .set('Cookie', [`dreamtek_session=${adminToken}`])
        .send({ status: 'PENDING' });
      expect(resMilestoneInvId.status).toBe(400);

      // PUT /projects/:id/milestones/:milestoneId Zod fail
      vi.mocked(db.query).mockResolvedValueOnce([{ id: 5 }]);
      const resMilestoneZodFail = await supertest(app)
        .put('/api/v1/admin/projects/10/milestones/5')
        .set('Cookie', [`dreamtek_session=${adminToken}`])
        .send({ status: 'INVALID_STATUS' });
      expect(resMilestoneZodFail.status).toBe(400);

      // PUT /projects/:id/milestones/:milestoneId actualizar con status IN_PROGRESS, description, target_week
      vi.mocked(db.query).mockImplementation((sql: string) => {
        if (sql.includes('SELECT id FROM client_project_milestones'))
          return Promise.resolve([{ id: 5 }]);
        if (sql.includes('UPDATE client_project_milestones'))
          return Promise.resolve({ affectedRows: 1 });
        if (sql.includes('SELECT * FROM client_project_milestones')) {
          return Promise.resolve([
            { id: 5, status: 'IN_PROGRESS', description: 'Desc', target_week: 3 },
          ]);
        }
        return Promise.resolve([]);
      });
      const resMilestoneSuccess = await supertest(app)
        .put('/api/v1/admin/projects/10/milestones/5')
        .set('Cookie', [`dreamtek_session=${adminToken}`])
        .send({
          status: 'IN_PROGRESS',
          description: 'Desc',
          target_week: 3,
        });
      expect(resMilestoneSuccess.status).toBe(200);
      expect(resMilestoneSuccess.body.milestone.status).toBe('IN_PROGRESS');

      // PUT /projects/:id/milestones/:milestoneId DB error con mensaje
      vi.mocked(db.query).mockResolvedValueOnce([{ id: 5 }]);
      vi.mocked(db.query).mockRejectedValueOnce(new Error('Update milestone fail'));
      const resMilestoneErr = await supertest(app)
        .put('/api/v1/admin/projects/10/milestones/5')
        .set('Cookie', [`dreamtek_session=${adminToken}`])
        .send({ status: 'PENDING' });
      expect(resMilestoneErr.status).toBe(500);

      // PUT /projects/:id/milestones/:milestoneId DB error sin mensaje
      vi.mocked(db.query).mockResolvedValueOnce([{ id: 5 }]);
      vi.mocked(db.query).mockRejectedValueOnce({});
      const resMilestoneErrNoMsg = await supertest(app)
        .put('/api/v1/admin/projects/10/milestones/5')
        .set('Cookie', [`dreamtek_session=${adminToken}`])
        .send({ status: 'PENDING' });
      expect(resMilestoneErrNoMsg.status).toBe(500);
      expect(resMilestoneErrNoMsg.body.message).toBe('Error al actualizar hito.');
    });
  });

  describe('5. Client Endpoints & Money Read-Only Deny (Condition C-044.4)', () => {
    it('GET /api/v1/client/projects/:id debe manejar ID inválido, no encontrado y errores de DB', async () => {
      // ID inválido
      const resInv = await supertest(app)
        .get('/api/v1/client/projects/0')
        .set('Cookie', [`dreamtek_session=${clientToken}`]);
      expect(resInv.status).toBe(400);

      // No encontrado
      vi.mocked(db.query).mockResolvedValueOnce([]);
      const res404 = await supertest(app)
        .get('/api/v1/client/projects/999')
        .set('Cookie', [`dreamtek_session=${clientToken}`]);
      expect(res404.status).toBe(404);

      // Error en DB con mensaje
      vi.mocked(db.query).mockRejectedValueOnce(new Error('DB Error Client Project'));
      const res500 = await supertest(app)
        .get('/api/v1/client/projects/10')
        .set('Cookie', [`dreamtek_session=${clientToken}`]);
      expect(res500.status).toBe(500);

      // Error en DB sin mensaje
      vi.mocked(db.query).mockRejectedValueOnce({});
      const res500NoMsg = await supertest(app)
        .get('/api/v1/client/projects/10')
        .set('Cookie', [`dreamtek_session=${clientToken}`]);
      expect(res500NoMsg.status).toBe(500);
      expect(res500NoMsg.body.message).toBe('Error al consultar proyecto.');
    });

    it('GET /api/v1/client/projects/:id debe retornar detalle con hitos y parseo de briefing', async () => {
      // Caso 1: JSON válido y hitos
      vi.mocked(db.query).mockImplementation((sql: string) => {
        if (sql.includes('FROM client_projects') && sql.includes('WHERE id = ? AND user_id = ?')) {
          return Promise.resolve([
            {
              id: 10,
              tenant_id: 1,
              user_id: 42,
              project_name: 'Proyecto Éxito Cliente',
              vertical: 'saas_platform',
              status: 'IN_DEVELOPMENT',
              currency: 'USD',
              budget_cents: 800000,
              paid_amount_cents: 400000,
              pending_balance_cents: 400000,
              estimated_weeks: 8,
              briefing_data: JSON.stringify({ business_goals: 'Meta de cliente' }),
            },
          ]);
        }
        if (sql.includes('FROM client_project_milestones')) {
          return Promise.resolve([
            { id: 1, milestone_index: 1, title: 'Hito 1', status: 'COMPLETED' },
            { id: 2, milestone_index: 2, title: 'Hito 2', status: 'PENDING' },
          ]);
        }
        return Promise.resolve([]);
      });

      const resSuccess = await supertest(app)
        .get('/api/v1/client/projects/10')
        .set('Cookie', [`dreamtek_session=${clientToken}`]);

      expect(resSuccess.status).toBe(200);
      expect(resSuccess.body.status).toBe('success');
      expect(resSuccess.body.project.project_name).toBe('Proyecto Éxito Cliente');
      expect(resSuccess.body.project.progress_percent).toBe(50);
      expect(resSuccess.body.project.briefing_data.business_goals).toBe('Meta de cliente');

      // Caso 2: briefing_data con JSON inválido y error en milestones query
      vi.mocked(db.query).mockImplementation((sql: string) => {
        if (sql.includes('FROM client_projects')) {
          return Promise.resolve([
            {
              id: 10,
              user_id: 42,
              project_name: 'Proyecto Invalido Briefing',
              briefing_data: '{bad-json-syntax',
            },
          ]);
        }
        if (sql.includes('FROM client_project_milestones')) {
          return Promise.reject(new Error('Milestone query error'));
        }
        return Promise.resolve([]);
      });

      const resCorrupt = await supertest(app)
        .get('/api/v1/client/projects/10')
        .set('Cookie', [`dreamtek_session=${clientToken}`]);

      expect(resCorrupt.status).toBe(200);
      expect(resCorrupt.body.project.briefing_data).toBe('{bad-json-syntax');
      expect(resCorrupt.body.project.milestones).toEqual([]);
      expect(resCorrupt.body.project.progress_percent).toBe(0);

      // Caso 3: briefing_data es null (cubre rama else de if (proj.briefing_data) en client.ts línea 229)
      vi.mocked(db.query).mockImplementation((sql: string) => {
        if (sql.includes('FROM client_projects')) {
          return Promise.resolve([
            {
              id: 10,
              user_id: 42,
              project_name: 'Proyecto Sin Briefing',
              briefing_data: null,
            },
          ]);
        }
        if (sql.includes('FROM client_project_milestones')) {
          return Promise.resolve([]);
        }
        return Promise.resolve([]);
      });

      const resNoBriefing = await supertest(app)
        .get('/api/v1/client/projects/10')
        .set('Cookie', [`dreamtek_session=${clientToken}`]);

      expect(resNoBriefing.status).toBe(200);
      expect(resNoBriefing.body.project.briefing_data).toBeNull();

      // Caso 4: briefing_data ya es un objeto (cubre rama ternaria else en client.ts línea 232)
      vi.mocked(db.query).mockImplementation((sql: string) => {
        if (sql.includes('FROM client_projects')) {
          return Promise.resolve([
            {
              id: 10,
              user_id: 42,
              project_name: 'Proyecto Con Objeto Briefing',
              briefing_data: { parsedAlready: true },
            },
          ]);
        }
        if (sql.includes('FROM client_project_milestones')) {
          return Promise.resolve([]);
        }
        return Promise.resolve([]);
      });

      const resObjBriefing = await supertest(app)
        .get('/api/v1/client/projects/10')
        .set('Cookie', [`dreamtek_session=${clientToken}`]);

      expect(resObjBriefing.status).toBe(200);
      expect(resObjBriefing.body.project.briefing_data).toEqual({ parsedAlready: true });
    });

    it('GET /api/v1/client/dashboard debe procesar briefing_data como objeto, fallback catch y error en client_projects', async () => {
      // Caso briefing_data ya es objeto, briefing_data corrupto, y briefing_data null (cubre línea 112 else)
      vi.mocked(db.query).mockImplementation((sql: string) => {
        if (sql.includes('FROM users WHERE id = ?')) {
          return Promise.resolve([
            { id: 42, full_name: 'Cliente Test', email: 'c@dtk.com', role: 'CLIENT' },
          ]);
        }
        if (sql.includes('FROM client_sites WHERE tenant_id = ?')) {
          return Promise.resolve([]);
        }
        if (sql.includes('FROM subscriptions WHERE user_id = ?')) {
          return Promise.resolve([]);
        }
        if (sql.includes('FROM client_projects') && sql.includes('WHERE user_id = ?')) {
          return Promise.resolve([
            {
              id: 30,
              tenant_id: 1,
              user_id: 42,
              project_name: 'App Objeto Briefing',
              vertical: 'custom_dev',
              status: 'IN_DEVELOPMENT',
              currency: 'USD',
              budget_cents: 100000,
              paid_amount_cents: 50000,
              pending_balance_cents: 50000,
              estimated_weeks: 4,
              briefing_data: { business_goals: 'Objetivos en objeto' }, // no string
            },
            {
              id: 31,
              tenant_id: 1,
              user_id: 42,
              project_name: 'App Corrupt Briefing & Milestone Fail',
              vertical: 'saas_platform',
              status: 'ONBOARDING_BRIEF',
              currency: 'USD',
              budget_cents: 200000,
              paid_amount_cents: 100000,
              pending_balance_cents: 100000,
              estimated_weeks: 6,
              briefing_data: '{invalid-json-str',
            },
            {
              id: 32,
              tenant_id: 1,
              user_id: 42,
              project_name: 'App Null Briefing',
              vertical: 'custom_dev',
              status: 'IN_DEVELOPMENT',
              currency: 'USD',
              budget_cents: 100000,
              paid_amount_cents: 50000,
              pending_balance_cents: 50000,
              estimated_weeks: 4,
              briefing_data: null, // null briefing cubre rama else línea 112
            },
          ]);
        }
        if (sql.includes('FROM client_project_milestones')) {
          // Rechazar para forzar la ejecución de .catch(() => []) en client.ts línea 105
          return Promise.reject(new Error('Milestone query error'));
        }
        return Promise.resolve([]);
      });

      const resObjBriefing = await supertest(app)
        .get('/api/v1/client/dashboard')
        .set('Cookie', [`dreamtek_session=${clientToken}`]);
      expect(resObjBriefing.status).toBe(200);
      expect(resObjBriefing.body.projects[0].briefing_data.business_goals).toBe(
        'Objetivos en objeto',
      );
      expect(resObjBriefing.body.projects[1].briefing_data).toBe('{invalid-json-str');
      expect(resObjBriefing.body.projects[1].milestones).toEqual([]);
      expect(resObjBriefing.body.projects[2].briefing_data).toBeNull();

      // Error en client_projects query con objeto Error estándar
      vi.mocked(db.query).mockImplementation((sql: string) => {
        if (sql.includes('FROM users WHERE id = ?')) {
          return Promise.resolve([
            { id: 42, full_name: 'Cliente Test', email: 'c@dtk.com', role: 'CLIENT' },
          ]);
        }
        if (sql.includes('FROM client_projects') && sql.includes('WHERE user_id = ?')) {
          return Promise.reject(new Error('Fail client_projects'));
        }
        return Promise.resolve([]);
      });

      const resFailProjects = await supertest(app)
        .get('/api/v1/client/dashboard')
        .set('Cookie', [`dreamtek_session=${clientToken}`]);
      expect(resFailProjects.status).toBe(200);
      expect(resFailProjects.body.projects).toEqual([]);

      // Error en client_projects query sin propiedad .message (cubre fallback || projErr en client.ts línea 131)
      vi.mocked(db.query).mockImplementation((sql: string) => {
        if (sql.includes('FROM users WHERE id = ?')) {
          return Promise.resolve([
            { id: 42, full_name: 'Cliente Test', email: 'c@dtk.com', role: 'CLIENT' },
          ]);
        }
        if (sql.includes('FROM client_projects') && sql.includes('WHERE user_id = ?')) {
          return Promise.reject('Raw string DB error');
        }
        return Promise.resolve([]);
      });

      const resFailRawStr = await supertest(app)
        .get('/api/v1/client/dashboard')
        .set('Cookie', [`dreamtek_session=${clientToken}`]);
      expect(resFailRawStr.status).toBe(200);
      expect(resFailRawStr.body.projects).toEqual([]);
    });

    it('PUT /api/v1/client/projects/:id/briefing debe manejar errores de base de datos con y sin mensaje', async () => {
      // Con mensaje
      vi.mocked(db.query).mockImplementation((sql: string) => {
        if (sql.includes('SELECT id, status FROM client_projects')) {
          return Promise.resolve([{ id: 10, status: 'ONBOARDING_BRIEF' }]);
        }
        if (sql.includes('UPDATE client_projects')) {
          return Promise.reject(new Error('Update briefing DB crash'));
        }
        return Promise.resolve([]);
      });

      const res = await supertest(app)
        .put('/api/v1/client/projects/10/briefing')
        .set('Cookie', [`dreamtek_session=${clientToken}`])
        .send({
          business_goals: 'Objetivos comerciales válidos para provocar error en DB',
        });

      expect(res.status).toBe(500);
      expect(res.body.message).toContain('Update briefing DB crash');

      // Sin mensaje (fallback línea 331)
      vi.mocked(db.query).mockImplementation((sql: string) => {
        if (sql.includes('SELECT id, status FROM client_projects')) {
          return Promise.resolve([{ id: 10, status: 'ONBOARDING_BRIEF' }]);
        }
        if (sql.includes('UPDATE client_projects')) {
          return Promise.reject({});
        }
        return Promise.resolve([]);
      });

      const resNoMsg = await supertest(app)
        .put('/api/v1/client/projects/10/briefing')
        .set('Cookie', [`dreamtek_session=${clientToken}`])
        .send({
          business_goals: 'Objetivos comerciales válidos para provocar error en DB',
        });
      expect(resNoMsg.status).toBe(500);
      expect(resNoMsg.body.message).toBe('Error al actualizar el briefing.');
    });

    it('PUT /api/v1/client/projects/:id/briefing debe conservar status si no es ONBOARDING_BRIEF y usar fallbacks de briefing', async () => {
      vi.mocked(db.query).mockImplementation((sql: string) => {
        if (sql.includes('SELECT id, status FROM client_projects')) {
          // Status diferente a ONBOARDING_BRIEF (cubre rama ternaria en client.ts línea 313)
          return Promise.resolve([{ id: 10, status: 'IN_DEVELOPMENT' }]);
        }
        if (sql.includes('UPDATE client_projects')) {
          return Promise.resolve({ affectedRows: 1 });
        }
        return Promise.resolve([]);
      });

      const res = await supertest(app)
        .put('/api/v1/client/projects/10/briefing')
        .set('Cookie', [`dreamtek_session=${clientToken}`])
        .send({
          business_goals: 'Actualización técnica en fase de desarrollo',
          // Sin reference_urls ni target_audience para cubrir fallbacks
        });

      expect(res.status).toBe(200);
      expect(res.body.status_updated).toBe('IN_DEVELOPMENT');
      expect(res.body.briefing.reference_urls).toEqual([]);
      expect(res.body.briefing.target_audience).toBe('');
    });

    it('PUT /api/v1/client/projects/:id/briefing debe transicionar a ARCHITECTURE_DESIGN y guardar reference_urls', async () => {
      vi.mocked(db.query).mockImplementation((sql: string) => {
        if (sql.includes('SELECT id, status FROM client_projects')) {
          return Promise.resolve([{ id: 10, status: 'ONBOARDING_BRIEF' }]);
        }
        if (sql.includes('UPDATE client_projects')) {
          return Promise.resolve({ affectedRows: 1 });
        }
        return Promise.resolve([]);
      });

      const res = await supertest(app)
        .put('/api/v1/client/projects/10/briefing')
        .set('Cookie', [`dreamtek_session=${clientToken}`])
        .send({
          business_goals: 'Objetivos de negocio completos y detallados para la app',
          target_audience: 'Empresas B2B',
          technical_stack_preferences: 'Next.js 15, MariaDB',
          infrastructure_notes: 'AWS ECS',
          reference_urls: ['https://dreamtek.tech/ref'],
          contact_lead_notes: 'Contactar via Slack',
        });

      expect(res.status).toBe(200);
      expect(res.body.status_updated).toBe('ARCHITECTURE_DESIGN');
      expect(res.body.briefing.reference_urls).toEqual(['https://dreamtek.tech/ref']);
      expect(res.body.briefing.target_audience).toBe('Empresas B2B');
    });

    it('Deny C-044.4: El cliente no puede modificar montos o balances financieros', async () => {
      // El cliente intenta enviar un PATCH a /client/projects/:id con budget_cents
      const resPatch = await supertest(app)
        .patch('/api/v1/client/projects/10')
        .set('Cookie', [`dreamtek_session=${clientToken}`])
        .send({ budget_cents: 0, paid_amount_cents: 999999 });

      // No existe endpoint PATCH para cliente modificando dinero (404)
      expect(resPatch.status).toBe(404);

      // Si intenta enviar montos en briefing, Zod los ignora/rechaza
      vi.mocked(db.query).mockImplementation((sql: string) => {
        if (sql.includes('SELECT id, status FROM client_projects')) {
          return Promise.resolve([{ id: 10, status: 'ONBOARDING_BRIEF' }]);
        }
        if (sql.includes('UPDATE client_projects')) {
          return Promise.resolve({ affectedRows: 1 });
        }
        return Promise.resolve([]);
      });

      const resBriefing = await supertest(app)
        .put('/api/v1/client/projects/10/briefing')
        .set('Cookie', [`dreamtek_session=${clientToken}`])
        .send({
          business_goals: 'Objetivos comerciales válidos',
          budget_cents: 0,
        });

      expect(resBriefing.status).toBe(200);
      expect((resBriefing.body.briefing as any).budget_cents).toBeUndefined();
    });
  });

  describe('6. Project Utilities & Row Extraction Edge Cases', () => {
    it('extractRows debe manejar arrays simples, arrays anidados y valores no-array', () => {
      expect(extractRows(null)).toEqual([]);
      expect(extractRows(undefined)).toEqual([]);
      expect(extractRows('string')).toEqual([]);
      expect(extractRows([{ id: 1 }])).toEqual([{ id: 1 }]);
      expect(extractRows([[{ id: 2 }]])).toEqual([{ id: 2 }]);
    });

    it('provisionClientProjectForLead debe cubrir opciones personalizadas, budgets cero y fallbacks', async () => {
      const mockConn = {
        query: vi.fn(),
      };

      // 1. Proyecto ya existe (replay idempotente) retornando inviteToken
      mockConn.query.mockImplementation((sql: string) => {
        if (sql.includes('FROM client_projects WHERE lead_id = ?')) {
          return Promise.resolve([{ id: 8, tenant_id: 2, user_id: 15 }]);
        }
        if (sql.includes('FROM leads WHERE id = ?')) {
          return Promise.resolve([{ id: 100, email: 'lead_existing@test.com' }]);
        }
        return Promise.resolve([]);
      });

      const replayRes = await provisionClientProjectForLead(mockConn, 100);
      expect(replayRes.created).toBe(false);
      expect(replayRes.projectId).toBe(8);
      expect(replayRes.inviteToken).toBeDefined();
      expect(replayRes.inviteUrl).toContain('/auth/activate?token=');

      // 2. Nuevo proyecto con budget = 0 y paid = 0 (fallback a 100000 cents), lead sin company
      mockConn.query.mockImplementation((sql: string) => {
        if (sql.includes('FROM client_projects WHERE lead_id = ?')) return Promise.resolve([]);
        if (sql.includes('FROM leads WHERE id = ?')) {
          return Promise.resolve([
            {
              id: 101,
              email: 'lead_no_budget@test.com',
              name: 'Juan Perez',
              company: null,
              estimated_budget_min: 0,
              currency: 'MXN',
            },
          ]);
        }
        if (sql.includes('FROM users WHERE email = ?')) return Promise.resolve([]);
        if (sql.includes('INSERT INTO users')) return Promise.resolve({ insertId: 55 });
        if (sql.includes('FROM tenants WHERE owner_user_id = ?')) return Promise.resolve([]);
        if (sql.includes('INSERT INTO tenants')) return Promise.resolve({ insertId: 66 });
        if (sql.includes('INSERT INTO client_projects')) return Promise.resolve({ insertId: 77 });
        if (sql.includes('INSERT INTO client_project_milestones'))
          return Promise.resolve({ insertId: 1 });
        return Promise.resolve([]);
      });

      const resZeroBudget = await provisionClientProjectForLead(mockConn, 101, {
        projectName: 'Nombre Forzado',
        vertical: 'saas_custom',
        estimatedWeeks: 6,
      });

      expect(resZeroBudget.created).toBe(true);
      expect(resZeroBudget.projectId).toBe(77);
      expect(resZeroBudget.inviteToken).toBeDefined();

      // 3. Lead con usuario y tenant ya existentes, y paidAmountCents > 0
      mockConn.query.mockImplementation((sql: string) => {
        if (sql.includes('FROM client_projects WHERE lead_id = ?')) return Promise.resolve([]);
        if (sql.includes('FROM leads WHERE id = ?')) {
          return Promise.resolve([
            {
              id: 102,
              email: 'lead_user_exists@test.com',
              name: 'Pedro Gomez',
              company: 'Gomez Corp',
              estimated_budget_min: 0,
            },
          ]);
        }
        if (sql.includes('FROM users WHERE email = ?')) return Promise.resolve([{ id: 88 }]);
        if (sql.includes('FROM tenants WHERE owner_user_id = ?'))
          return Promise.resolve([{ id: 99 }]);
        if (sql.includes('INSERT INTO client_projects'))
          return Promise.resolve([{ insertId: 111 }]);
        if (sql.includes('INSERT INTO client_project_milestones'))
          return Promise.resolve({ insertId: 1 });
        return Promise.resolve([]);
      });

      const resUserExists = await provisionClientProjectForLead(mockConn, 102, {
        paidAmountCents: 50000,
      });

      expect(resUserExists.created).toBe(true);
      expect(resUserExists.userId).toBe(88);
      expect(resUserExists.tenantId).toBe(99);
    });
  });

  describe('7. Auth Invite Verification & Account Activation (Condition C-044.1)', () => {
    it('GET /api/v1/auth/invite/verify debe validar tokens de invitación B2B', async () => {
      // Sin token
      const resNoToken = await supertest(app).get('/api/v1/auth/invite/verify');
      expect(resNoToken.status).toBe(400);

      // Token inválido
      const resInvToken = await supertest(app).get(
        '/api/v1/auth/invite/verify?token=invalid.jwt.token',
      );
      expect(resInvToken.status).toBe(400);

      // Token con acción incorrecta
      const wrongActionToken = jwt.sign(
        { userId: 10, email: 'w@test.com', action: 'WRONG_ACTION' },
        TEST_SECRET,
        { algorithm: 'HS512' },
      );
      const resWrongAction = await supertest(app).get(
        `/api/v1/auth/invite/verify?token=${wrongActionToken}`,
      );
      expect(resWrongAction.status).toBe(400);

      // Token válido
      const validInviteToken = jwt.sign(
        { userId: 10, email: 'cliente_invite@dreamtek.tech', action: 'B2B_PORTAL_INVITE' },
        TEST_SECRET,
        { algorithm: 'HS512' },
      );
      const resValid = await supertest(app).get(
        `/api/v1/auth/invite/verify?token=${validInviteToken}`,
      );
      expect(resValid.status).toBe(200);
      expect(resValid.body.valid).toBe(true);
      expect(resValid.body.email).toBe('cliente_invite@dreamtek.tech');
    });

    it('POST /api/v1/auth/activate debe configurar contraseña y activar sesión cliente B2B', async () => {
      // Falta token o password
      const resMissing = await supertest(app).post('/api/v1/auth/activate').send({});
      expect(resMissing.status).toBe(400);

      // Contraseña corta (< 8)
      const resShort = await supertest(app)
        .post('/api/v1/auth/activate')
        .send({ token: 'abc', password: '123' });
      expect(resShort.status).toBe(400);

      // Token expirado o inválido
      const resBadToken = await supertest(app)
        .post('/api/v1/auth/activate')
        .send({ token: 'bad.token', password: 'password1234' });
      expect(resBadToken.status).toBe(400);

      // Token con acción errónea
      const wrongToken = jwt.sign({ userId: 10, action: 'OTHER' }, TEST_SECRET, {
        algorithm: 'HS512',
      });
      const resWrongType = await supertest(app)
        .post('/api/v1/auth/activate')
        .send({ token: wrongToken, password: 'password1234' });
      expect(resWrongType.status).toBe(400);

      // Usuario no encontrado en DB
      const validToken = jwt.sign(
        { userId: 999, email: 'notfound@test.com', action: 'B2B_PORTAL_INVITE' },
        TEST_SECRET,
        { algorithm: 'HS512' },
      );
      vi.mocked(db.query).mockResolvedValueOnce([]);
      const resNotFound = await supertest(app)
        .post('/api/v1/auth/activate')
        .send({ token: validToken, password: 'password1234' });
      expect(resNotFound.status).toBe(404);

      // Activación exitosa (con role explícito)
      vi.mocked(db.query).mockImplementation((sql: string) => {
        if (sql.includes('FROM users WHERE id = ?')) {
          return Promise.resolve([
            { id: 42, email: 'activado@test.com', full_name: 'Cliente Activado', role: 'CLIENT' },
          ]);
        }
        if (sql.includes('UPDATE users SET password_hash')) {
          return Promise.resolve({ affectedRows: 1 });
        }
        return Promise.resolve([]);
      });

      const resSuccess = await supertest(app)
        .post('/api/v1/auth/activate')
        .send({ token: validToken, password: 'SecurePassword2026!' });

      expect(resSuccess.status).toBe(200);
      expect(resSuccess.body.status).toBe('success');
      expect(resSuccess.body.user.email).toBe('activado@test.com');
      expect(resSuccess.headers['set-cookie']).toBeDefined();

      // Activación exitosa con role null (para fallback 'CLIENT')
      vi.mocked(db.query).mockImplementation((sql: string) => {
        if (sql.includes('FROM users WHERE id = ?')) {
          return Promise.resolve([
            { id: 43, email: 'norole@test.com', full_name: 'Sin Rol', role: null },
          ]);
        }
        if (sql.includes('UPDATE users SET password_hash')) {
          return Promise.resolve({ affectedRows: 1 });
        }
        return Promise.resolve([]);
      });

      const resNoRole = await supertest(app)
        .post('/api/v1/auth/activate')
        .send({ token: validToken, password: 'SecurePassword2026!' });
      expect(resNoRole.status).toBe(200);

      // Error interno con mensaje
      vi.mocked(db.query).mockImplementation((sql: string) => {
        if (sql.includes('FROM users WHERE id = ?')) {
          return Promise.resolve([{ id: 42, email: 'activado@test.com', role: 'CLIENT' }]);
        }
        if (sql.includes('UPDATE users SET password_hash')) {
          return Promise.reject(new Error('DB crash on password update'));
        }
        return Promise.resolve([]);
      });
      const resCrash = await supertest(app)
        .post('/api/v1/auth/activate')
        .send({ token: validToken, password: 'SecurePassword2026!' });
      expect(resCrash.status).toBe(500);

      // Error interno sin mensaje (fallback)
      vi.mocked(db.query).mockImplementation((sql: string) => {
        if (sql.includes('FROM users WHERE id = ?')) {
          return Promise.resolve([{ id: 42, email: 'activado@test.com', role: 'CLIENT' }]);
        }
        if (sql.includes('UPDATE users SET password_hash')) {
          return Promise.reject({});
        }
        return Promise.resolve([]);
      });
      const resCrashNoMsg = await supertest(app)
        .post('/api/v1/auth/activate')
        .send({ token: validToken, password: 'SecurePassword2026!' });
      expect(resCrashNoMsg.status).toBe(500);
      expect(resCrashNoMsg.body.message).toBe('Error al activar cuenta.');
    });
  });

  describe('8. Checkout Session Verify B2B Deposit Integration (Condition C-044.1)', () => {
    it('GET /api/v1/checkout/verify debe autenticar clientes B2B con depósito verificado y cubrir branches', async () => {
      // 1. Simular que no hay orden B2C pero hay lead_payment en status PAID con usuario
      vi.mocked(db.query).mockImplementation((sql: string) => {
        if (sql.includes('FROM orders WHERE payment_gateway_id = ?')) {
          return Promise.resolve([]);
        }
        if (sql.includes('FROM lead_payments lp')) {
          return Promise.resolve([
            {
              status: 'PAID',
              email: 'b2b_paid@empresa.com',
              user_id: 50,
              full_name: 'Cliente B2B Verificado',
              role: 'CLIENT',
            },
          ]);
        }
        return Promise.resolve([]);
      });

      const res = await supertest(app).get(
        '/api/v1/checkout/verify?session_id=cs_b2b_deposit_test',
      );

      expect(res.status).toBe(200);
      expect(res.body.verified).toBe(true);
      expect(res.headers['set-cookie']).toBeDefined();

      // 2. Lead payment en status PAID pero sin usuario asociado (user_id null)
      vi.mocked(db.query).mockImplementation((sql: string) => {
        if (sql.includes('FROM orders WHERE payment_gateway_id = ?')) {
          return Promise.resolve([]);
        }
        if (sql.includes('FROM lead_payments lp')) {
          return Promise.resolve([
            {
              status: 'PAID',
              email: 'no_user@empresa.com',
              user_id: null,
            },
          ]);
        }
        return Promise.resolve([]);
      });

      const resNoUser = await supertest(app).get(
        '/api/v1/checkout/verify?session_id=cs_b2b_no_user',
      );
      expect(resNoUser.status).toBe(200);
      expect(resNoUser.body.verified).toBe(true);
      expect(resNoUser.headers['set-cookie']).toBeUndefined();

      // 3. Lead payment en status PAID con usuario pero sin role ni full_name (fallback branches)
      vi.mocked(db.query).mockImplementation((sql: string) => {
        if (sql.includes('FROM orders WHERE payment_gateway_id = ?')) {
          return Promise.resolve([]);
        }
        if (sql.includes('FROM lead_payments lp')) {
          return Promise.resolve([
            {
              status: 'PAID',
              email: 'fallback@empresa.com',
              user_id: 60,
              role: null,
              full_name: null,
            },
          ]);
        }
        return Promise.resolve([]);
      });

      const resFallback = await supertest(app).get(
        '/api/v1/checkout/verify?session_id=cs_b2b_fallbacks',
      );
      expect(resFallback.status).toBe(200);
      expect(resFallback.body.verified).toBe(true);
      expect(resFallback.headers['set-cookie']).toBeDefined();

      // 4. Excepción en query de lead_payments (catch soft ignore)
      vi.mocked(db.query).mockImplementation((sql: string) => {
        if (sql.includes('FROM orders WHERE payment_gateway_id = ?')) {
          return Promise.resolve([]);
        }
        if (sql.includes('FROM lead_payments lp')) {
          return Promise.reject(new Error('DB failure lead_payments'));
        }
        return Promise.resolve([]);
      });

      const resCatch = await supertest(app).get('/api/v1/checkout/verify?session_id=cs_b2b_catch');
      expect(resCatch.status).toBe(200);
      expect(resCatch.body.verified).toBe(false);
    });
  });
});
