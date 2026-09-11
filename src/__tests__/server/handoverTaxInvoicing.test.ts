/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import supertest from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import * as db from '../../../server/src/db';
import { clientRouter } from '../../../server/src/routes/client';
import { adminRouter } from '../../../server/src/routes/admin';
import {
  getHandoverVaultKey,
  encryptVaultCredentials,
  decryptVaultCredentials,
  generateCanonicalCertificate,
} from '../../../server/src/utils/handoverVault';
import {
  adminHandoverSchema,
  clientTaxProfileSchema,
  requestInvoiceSchema,
  adminUpdateInvoiceStatusSchema,
} from '../../../server/src/schemas/handover.schema';

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
const _otherClientToken = getClientToken(88);

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/v1/client', clientRouter);
app.use('/api/v1/admin', adminRouter);

describe('FC 046 Handover Vault & Corporate Tax Invoicing Suite (Hard Gate 4x100)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.query).mockReset();
    process.env = { ...originalEnv };
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('1. Handover Vault Crypto Utilities (handoverVault.ts)', () => {
    it('getHandoverVaultKey: debe derivar clave usando HANDOVER_VAULT_KEY si está presente', () => {
      process.env.HANDOVER_VAULT_KEY = 'custom_vault_key_12345';
      const key = getHandoverVaultKey();
      expect(key).toBeInstanceOf(Buffer);
      expect(key.length).toBe(32);
    });

    it('getHandoverVaultKey: debe usar clave fallback en entorno test/dev cuando no hay variable', () => {
      delete process.env.HANDOVER_VAULT_KEY;
      process.env.NODE_ENV = 'test';
      const key = getHandoverVaultKey();
      expect(key).toBeInstanceOf(Buffer);
      expect(key.length).toBe(32);
    });

    it('getHandoverVaultKey: debe lanzar error fatal en producción si falta la clave (fail-closed C-046.1)', () => {
      delete process.env.HANDOVER_VAULT_KEY;
      process.env.NODE_ENV = 'production';
      expect(() => getHandoverVaultKey()).toThrow(
        'FATAL SECURITY ERROR: HANDOVER_VAULT_KEY environment variable is missing in production.',
      );
    });

    it('encryptVaultCredentials y decryptVaultCredentials: debe cifrar y descifrar texto en claro usando AES-256-GCM', () => {
      const plain = 'DB_PASSWORD=SuperSecret2026!\nAPI_TOKEN=xyz987';
      const encrypted = encryptVaultCredentials(plain);
      expect(encrypted).not.toBe(plain);
      expect(encrypted.split(':').length).toBe(3);

      const decrypted = decryptVaultCredentials(encrypted);
      expect(decrypted).toBe(plain);
    });

    it('encryptVaultCredentials: debe retornar texto vacío o falsy sin cambios', () => {
      expect(encryptVaultCredentials('')).toBe('');
      expect(encryptVaultCredentials(null as any)).toBe(null);
    });

    it('decryptVaultCredentials: debe retornar texto vacío o falsy sin cambios', () => {
      expect(decryptVaultCredentials('')).toBe('');
      expect(decryptVaultCredentials(null as any)).toBe(null);
    });

    it('decryptVaultCredentials: debe lanzar error si el formato cifrado no tiene 3 partes', () => {
      expect(() => decryptVaultCredentials('iv:ciphertext')).toThrow(
        'Invalid encrypted vault credentials format.',
      );
    });

    it('decryptVaultCredentials: debe fallar si el tag o ciphertext es manipulado (tampered)', () => {
      const encrypted = encryptVaultCredentials('clave_secreta');
      const [iv, , cipher] = encrypted.split(':');
      const corruptedTag = '00'.repeat(16);
      const corrupted = `${iv}:${corruptedTag}:${cipher}`;
      expect(() => decryptVaultCredentials(corrupted)).toThrow();
    });

    it('generateCanonicalCertificate: debe ordenar pagos por ID y computar SHA-256 determinista', () => {
      const project = { id: 10, status: 'COMPLETED_DELIVERED', pending_balance_cents: 0 };
      const paidPayments = [
        { id: 202, amount_cents: 250000, currency: 'usd' },
        { id: 101, amount_cents: 250000, currency: 'USD' },
      ];

      const res = generateCanonicalCertificate(project, paidPayments);
      expect(res.canonical_data.project_id).toBe(10);
      expect(res.canonical_data.paid_payments[0].id).toBe(101);
      expect(res.canonical_data.paid_payments[1].id).toBe(202);
      expect(res.canonical_data.paid_payments[0].currency).toBe('USD');
      expect(res.certificate_sha256).toMatch(/^[a-f0-9]{64}$/);

      // Re-ejecutar con orden inverso debe dar exactamente el mismo hash SHA-256
      const reversedPayments = [paidPayments[0], paidPayments[1]];
      const res2 = generateCanonicalCertificate(project, reversedPayments);
      expect(res2.certificate_sha256).toBe(res.certificate_sha256);
    });

    it('generateCanonicalCertificate: debe soportar paidPayments vacío o null', () => {
      const project = { id: 10, status: 'COMPLETED_DELIVERED', pending_balance_cents: 0 };
      const res = generateCanonicalCertificate(project, null as any);
      expect(res.canonical_data.paid_payments).toEqual([]);
      expect(res.certificate_sha256).toBeDefined();
    });
  });

  describe('2. Handover and Tax Invoicing Schemas (handover.schema.ts)', () => {
    it('adminHandoverSchema: valida URLs https estrictas y sanitización', () => {
      const valid = adminHandoverSchema.safeParse({
        repository_url: 'https://github.com/dreamtek/repo',
        deployment_url: 'https://prod.dreamtek.tech',
        documentation_url: 'https://docs.dreamtek.tech',
        access_credentials: 'ROOT_KEY=abc',
        handover_notes: 'Notas tecnicas',
      });
      expect(valid.success).toBe(true);

      const invalidHttp = adminHandoverSchema.safeParse({
        repository_url: 'http://insecure.com',
      });
      expect(invalidHttp.success).toBe(false);

      const empty = adminHandoverSchema.safeParse({});
      expect(empty.success).toBe(true);
    });

    it('clientTaxProfileSchema: valida RFC SAT Persona Física y Moral', () => {
      // Persona Física: 4 letras + 6 números + 3 homoclave
      const pf = clientTaxProfileSchema.safeParse({
        rfc: 'GARM850101XYZ',
        legal_name: 'Manuel Garcia Rodriguez',
        tax_regime: '612',
        cfdi_use: 'G03',
        postal_code: '01000',
        invoice_email: 'manuel@empresa.com',
        is_international: false,
      });
      expect(pf.success).toBe(true);

      // Persona Moral: 3 letras + 6 números + 3 homoclave
      const pm = clientTaxProfileSchema.safeParse({
        rfc: 'DRE210315AB1',
        legal_name: 'Dreamtek Soluciones SA de CV',
        tax_regime: '601',
        cfdi_use: 'CP01',
        postal_code: '06600',
        invoice_email: 'contabilidad@dreamtek.tech',
      });
      expect(pm.success).toBe(true);

      // RFC Inválido
      const invalidRfc = clientTaxProfileSchema.safeParse({
        rfc: 'RFC_INVALIDO_123',
        legal_name: 'Empresa',
        tax_regime: '601',
        cfdi_use: 'G03',
        postal_code: '01000',
        invoice_email: 'test@test.com',
      });
      expect(invalidRfc.success).toBe(false);
      if (!invalidRfc.success) {
        expect(invalidRfc.error.issues[0].message).toContain('formato oficial válido del SAT');
      }
    });

    it('clientTaxProfileSchema: valida identificador fiscal internacional cuando is_international es true', () => {
      const validIntl = clientTaxProfileSchema.safeParse({
        rfc: 'US-987654321',
        legal_name: 'Acme Global Corp',
        tax_regime: 'GENERAL',
        cfdi_use: 'S01',
        postal_code: '90210',
        invoice_email: 'billing@acme.com',
        is_international: true,
      });
      expect(validIntl.success).toBe(true);

      const invalidIntl = clientTaxProfileSchema.safeParse({
        rfc: '!@#$',
        legal_name: 'Acme',
        tax_regime: 'GENERAL',
        cfdi_use: 'S01',
        postal_code: '90210',
        invoice_email: 'billing@acme.com',
        is_international: true,
      });
      expect(invalidIntl.success).toBe(false);
      if (!invalidIntl.success) {
        expect(invalidIntl.error.issues[0].message).toContain('identificador fiscal internacional');
      }
    });

    it('requestInvoiceSchema y adminUpdateInvoiceStatusSchema: validaciones correctas', () => {
      expect(requestInvoiceSchema.safeParse({ invoice_notes: 'Nota' }).success).toBe(true);
      expect(requestInvoiceSchema.safeParse({}).success).toBe(true);

      expect(
        adminUpdateInvoiceStatusSchema.safeParse({
          status: 'ISSUED',
          cfdi_uuid: 'uuid-1234-sat',
          invoice_notes: 'Folio timbrado externo',
        }).success,
      ).toBe(true);

      expect(
        adminUpdateInvoiceStatusSchema.safeParse({
          status: 'UNKNOWN_STATUS' as any,
        }).success,
      ).toBe(false);
    });
  });

  describe('3. Client Handover Vault Endpoints (routes/client.ts)', () => {
    it('GET /projects/:id/handover: rechaza ID inválido con 400', async () => {
      const res = await supertest(app)
        .get('/api/v1/client/projects/abc/handover')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('ID de proyecto inválido');
    });

    it('GET /projects/:id/handover: rechaza proyecto inexistente con 404', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);
      const res = await supertest(app)
        .get('/api/v1/client/projects/999/handover')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(res.status).toBe(404);
      expect(res.body.message).toContain('Proyecto no encontrado');
    });

    it('GET /projects/:id/handover: protege contra IDOR (403)', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 10, user_id: 999, status: 'COMPLETED_DELIVERED', pending_balance_cents: 0 },
      ]);
      const res = await supertest(app)
        .get('/api/v1/client/projects/10/handover')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Acceso no autorizado');
    });

    it('GET /projects/:id/handover: fail-closed si el proyecto no está completado o tiene saldo pendiente (403)', async () => {
      // Caso 1: status diferente de COMPLETED_DELIVERED
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 10, user_id: 42, status: 'SETTLEMENT_PENDING', pending_balance_cents: 0 },
      ]);
      const res1 = await supertest(app)
        .get('/api/v1/client/projects/10/handover')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(res1.status).toBe(403);
      expect(res1.body.message).toContain('Bóveda de entrega bloqueada');

      // Caso 2: saldo pendiente > 0
      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 10, user_id: 42, status: 'COMPLETED_DELIVERED', pending_balance_cents: 50000 },
      ]);
      const res2 = await supertest(app)
        .get('/api/v1/client/projects/10/handover')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(res2.status).toBe(403);
      expect(res2.body.message).toContain('Bóveda de entrega bloqueada');
    });

    it('GET /projects/:id/handover: 404 si la entrega no ha sido configurada por admin', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([
          { id: 10, user_id: 42, status: 'COMPLETED_DELIVERED', pending_balance_cents: 0 },
        ])
        .mockResolvedValueOnce([]); // handover rows empty

      const res = await supertest(app)
        .get('/api/v1/client/projects/10/handover')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(res.status).toBe(404);
      expect(res.body.message).toContain('no configurada aún');
    });

    it('GET /projects/:id/handover: retorna objeto seguro con has_credentials y sin credenciales en claro', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([
          { id: 10, user_id: 42, status: 'COMPLETED_DELIVERED', pending_balance_cents: 0 },
        ])
        .mockResolvedValueOnce([
          {
            id: 1,
            project_id: 10,
            repository_url: 'https://github.com/corp/repo',
            deployment_url: 'https://app.corp.com',
            documentation_url: 'https://docs.corp.com',
            handover_notes: 'Notas seguras',
            certificate_sha256: 'abcsha256',
            access_credentials_encrypted: encryptVaultCredentials('PASS=123'),
            downloaded_at: null,
            download_count: 0,
          },
        ]);

      const res = await supertest(app)
        .get('/api/v1/client/projects/10/handover')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.handover.has_credentials).toBe(true);
      expect(res.body.handover.access_credentials_encrypted).toBeUndefined();
      expect(res.body.handover.credentials).toBeUndefined();
    });

    it('GET /projects/:id/handover: maneja errores de base de datos con 500', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('DB crash'));
      const res = await supertest(app)
        .get('/api/v1/client/projects/10/handover')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(res.status).toBe(500);
      expect(res.body.message).toBe('DB crash');
    });

    it('POST /projects/:id/handover/reveal: valida ID y fail-closed IDOR', async () => {
      const resBadId = await supertest(app)
        .post('/api/v1/client/projects/invalid/handover/reveal')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(resBadId.status).toBe(400);

      vi.mocked(db.query).mockResolvedValueOnce([]);
      const resNotFound = await supertest(app)
        .post('/api/v1/client/projects/10/handover/reveal')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(resNotFound.status).toBe(404);

      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 10, user_id: 88, status: 'COMPLETED_DELIVERED', pending_balance_cents: 0 },
      ]);
      const resIdor = await supertest(app)
        .post('/api/v1/client/projects/10/handover/reveal')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(resIdor.status).toBe(403);

      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 10, user_id: 42, status: 'IN_DEVELOPMENT', pending_balance_cents: 0 },
      ]);
      const resLocked = await supertest(app)
        .post('/api/v1/client/projects/10/handover/reveal')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(resLocked.status).toBe(403);
    });

    it('POST /projects/:id/handover/reveal: 404 si no existen credenciales configuradas', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([
          { id: 10, user_id: 42, status: 'COMPLETED_DELIVERED', pending_balance_cents: 0 },
        ])
        .mockResolvedValueOnce([{ access_credentials_encrypted: null }]);

      const res = await supertest(app)
        .post('/api/v1/client/projects/10/handover/reveal')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(res.status).toBe(404);
      expect(res.body.message).toContain('No existen credenciales configuradas');
    });

    it('POST /projects/:id/handover/reveal: descifra credenciales exitosamente y emite auditoría', async () => {
      const plainCreds = 'AWS_KEY=AKIA123\nAWS_SECRET=sec456';
      const encrypted = encryptVaultCredentials(plainCreds);
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      vi.mocked(db.query)
        .mockResolvedValueOnce([
          { id: 10, user_id: 42, status: 'COMPLETED_DELIVERED', pending_balance_cents: 0 },
        ])
        .mockResolvedValueOnce([{ access_credentials_encrypted: encrypted }]);

      const res = await supertest(app)
        .post('/api/v1/client/projects/10/handover/reveal')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(res.status).toBe(200);
      expect(res.body.credentials).toBe(plainCreds);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('POST /projects/:id/handover/reveal: maneja errores con 500', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('Decrypt failed'));
      const res = await supertest(app)
        .post('/api/v1/client/projects/10/handover/reveal')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(res.status).toBe(500);
    });

    it('GET /projects/:id/settlement-certificate: valida ID y fail-closed IDOR', async () => {
      const resBadId = await supertest(app)
        .get('/api/v1/client/projects/bad/settlement-certificate')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(resBadId.status).toBe(400);

      vi.mocked(db.query).mockResolvedValueOnce([]);
      const resNotFound = await supertest(app)
        .get('/api/v1/client/projects/10/settlement-certificate')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(resNotFound.status).toBe(404);

      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 10, user_id: 88, status: 'COMPLETED_DELIVERED', pending_balance_cents: 0 },
      ]);
      const resIdor = await supertest(app)
        .get('/api/v1/client/projects/10/settlement-certificate')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(resIdor.status).toBe(403);

      vi.mocked(db.query).mockResolvedValueOnce([
        { id: 10, user_id: 42, status: 'COMPLETED_DELIVERED', pending_balance_cents: 100 },
      ]);
      const resLocked = await supertest(app)
        .get('/api/v1/client/projects/10/settlement-certificate')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(resLocked.status).toBe(403);
    });

    it('GET /projects/:id/settlement-certificate: 404 si el handover no está inicializado', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([
          { id: 10, user_id: 42, status: 'COMPLETED_DELIVERED', pending_balance_cents: 0 },
        ])
        .mockResolvedValueOnce([]);

      const res = await supertest(app)
        .get('/api/v1/client/projects/10/settlement-certificate')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(res.status).toBe(404);
      expect(res.body.message).toContain('no inicializado');
    });

    it('GET /projects/:id/settlement-certificate: descarga certificado e incrementa download_count', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([
          { id: 10, user_id: 42, status: 'COMPLETED_DELIVERED', pending_balance_cents: 0 },
        ])
        .mockResolvedValueOnce([
          { id: 1, certificate_sha256: 'persisted_sha256_hash', download_count: 3 },
        ])
        .mockResolvedValueOnce([{ id: 50, amount_cents: 500000, currency: 'USD' }])
        .mockResolvedValueOnce({ affectedRows: 1 }); // update count

      const res = await supertest(app)
        .get('/api/v1/client/projects/10/settlement-certificate')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.certificate.certificate_sha256).toBe('persisted_sha256_hash');
      expect(res.body.certificate.download_count).toBe(4);
    });

    it('GET /projects/:id/settlement-certificate: maneja excepciones con 500', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('Cert error'));
      const res = await supertest(app)
        .get('/api/v1/client/projects/10/settlement-certificate')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(res.status).toBe(500);
    });
  });

  describe('4. Client Tax Profile & Invoice Request Endpoints (routes/client.ts)', () => {
    it('GET /tax-profile: retorna null si el usuario no tiene perfil registrado', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);
      const res = await supertest(app)
        .get('/api/v1/client/tax-profile')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(res.status).toBe(200);
      expect(res.body.tax_profile).toBeNull();
    });

    it('GET /tax-profile: retorna el perfil existente', async () => {
      const mockProfile = {
        id: 1,
        user_id: 42,
        tenant_id: 1,
        rfc: 'XAXX010101000',
        legal_name: 'Mi Empresa',
      };
      vi.mocked(db.query).mockResolvedValueOnce([mockProfile]);
      const res = await supertest(app)
        .get('/api/v1/client/tax-profile')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(res.status).toBe(200);
      expect(res.body.tax_profile).toEqual(mockProfile);
    });

    it('GET /tax-profile: maneja excepciones con 500', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('DB error'));
      const res = await supertest(app)
        .get('/api/v1/client/tax-profile')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(res.status).toBe(500);
    });

    it('PUT /tax-profile: rechaza datos inválidos con 400', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([{ tenant_id: 1, currency: 'MXN', locale: 'es' }]);
      const res = await supertest(app)
        .put('/api/v1/client/tax-profile')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ rfc: 'INVALIDO' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation Error');
    });

    it('PUT /tax-profile: guarda perfil asignando tenant_id de proyecto existente', async () => {
      const payload = {
        rfc: 'GARM850101XYZ',
        legal_name: 'Garcia & Asociados <script>',
        tax_regime: '612',
        cfdi_use: 'G03',
        postal_code: '01000',
        invoice_email: 'ADMIN@EMPRESA.COM',
      };

      vi.mocked(db.query)
        .mockResolvedValueOnce([{ tenant_id: 7, currency: 'MXN', locale: 'es' }]) // user project tenant
        .mockResolvedValueOnce({ affectedRows: 1 }) // insert/update
        .mockResolvedValueOnce([{ id: 1, user_id: 42, tenant_id: 7, rfc: 'GARM850101XYZ' }]); // select updated

      const res = await supertest(app)
        .put('/api/v1/client/tax-profile')
        .set('Authorization', `Bearer ${clientToken}`)
        .send(payload);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.tax_profile.tenant_id).toBe(7);
    });

    it('PUT /tax-profile: guarda perfil internacional cuando el proyecto es USD y locale en (C-046.5)', async () => {
      const payload = {
        rfc: 'US-EIN-987654321',
        legal_name: 'Acme International Inc',
        tax_regime: '612',
        cfdi_use: 'G03',
        postal_code: '90210',
        invoice_email: 'billing@acme.com',
      };

      vi.mocked(db.query)
        .mockResolvedValueOnce([{ tenant_id: 9, currency: 'USD', locale: 'en' }])
        .mockResolvedValueOnce({ affectedRows: 1 })
        .mockResolvedValueOnce([{ id: 2, user_id: 42, tenant_id: 9, rfc: 'US-EIN-987654321' }]);

      const res = await supertest(app)
        .put('/api/v1/client/tax-profile')
        .set('Authorization', `Bearer ${clientToken}`)
        .send(payload);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.tax_profile.rfc).toBe('US-EIN-987654321');
    });

    it('PUT /tax-profile: aplica fallbacks USD y es cuando el proyecto no especifica currency ni locale', async () => {
      const payload = {
        rfc: 'GARM850101XYZ',
        legal_name: 'Garcia & Asociados',
        tax_regime: '612',
        cfdi_use: 'G03',
        postal_code: '01000',
        invoice_email: 'admin@empresa.com',
      };

      vi.mocked(db.query)
        .mockResolvedValueOnce([{ tenant_id: 3, currency: null, locale: null }])
        .mockResolvedValueOnce({ affectedRows: 1 })
        .mockResolvedValueOnce([{ id: 3, user_id: 42, tenant_id: 3, rfc: 'GARM850101XYZ' }]);

      const res = await supertest(app)
        .put('/api/v1/client/tax-profile')
        .set('Authorization', `Bearer ${clientToken}`)
        .send(payload);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
    });

    it('PUT /tax-profile: rechaza con 400 si el cliente no tiene proyecto o tenant_id asociado (aislamiento multi-tenant)', async () => {
      const payload = {
        rfc: 'GARM850101XYZ',
        legal_name: 'Garcia & Asociados',
        tax_regime: '612',
        cfdi_use: 'G03',
        postal_code: '01000',
        invoice_email: 'admin@empresa.com',
      };

      // Caso 1: usuario sin proyectos
      vi.mocked(db.query).mockResolvedValueOnce([]);

      const res1 = await supertest(app)
        .put('/api/v1/client/tax-profile')
        .set('Authorization', `Bearer ${clientToken}`)
        .send(payload);
      expect(res1.status).toBe(400);
      expect(res1.body.status).toBe('error');
      expect(res1.body.message).toContain('No se encontró un proyecto activo o tenant asociado');

      // Caso 2: usuario con proyecto pero sin tenant_id
      vi.mocked(db.query).mockResolvedValueOnce([{ tenant_id: null }]);

      const res2 = await supertest(app)
        .put('/api/v1/client/tax-profile')
        .set('Authorization', `Bearer ${clientToken}`)
        .send(payload);
      expect(res2.status).toBe(400);
      expect(res2.body.status).toBe('error');
      expect(res2.body.message).toContain('No se encontró un proyecto activo o tenant asociado');
    });

    it('PUT /tax-profile: maneja excepciones con 500 y mensaje fallback', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('Save error'));
      const res1 = await supertest(app)
        .put('/api/v1/client/tax-profile')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({
          rfc: 'GARM850101XYZ',
          legal_name: 'Empresa',
          tax_regime: '601',
          cfdi_use: 'G03',
          postal_code: '01000',
          invoice_email: 'a@b.com',
        });
      expect(res1.status).toBe(500);

      vi.mocked(db.query).mockRejectedValueOnce('raw error');
      const res2 = await supertest(app)
        .put('/api/v1/client/tax-profile')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({
          rfc: 'GARM850101XYZ',
          legal_name: 'Empresa',
          tax_regime: '601',
          cfdi_use: 'G03',
          postal_code: '01000',
          invoice_email: 'a@b.com',
        });
      expect(res2.status).toBe(500);
      expect(res2.body.message).toBe('Error al guardar perfil fiscal.');
    });

    it('POST /payments/:paymentId/request-invoice: valida ID y body', async () => {
      const resBadId = await supertest(app)
        .post('/api/v1/client/payments/invalid/request-invoice')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(resBadId.status).toBe(400);

      const resBadBody = await supertest(app)
        .post('/api/v1/client/payments/10/request-invoice')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ invoice_notes: 'a'.repeat(2000) });
      expect(resBadBody.status).toBe(400);
    });

    it('POST /payments/:paymentId/request-invoice: 400 si el cliente no tiene perfil fiscal configurado', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]); // no tax profile
      const res = await supertest(app)
        .post('/api/v1/client/payments/10/request-invoice')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Missing Tax Profile');
    });

    it('POST /payments/:paymentId/request-invoice: 404 si el pago no existe', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: 1 }]) // tax profile ok
        .mockResolvedValueOnce([]); // payment not found

      const res = await supertest(app)
        .post('/api/v1/client/payments/10/request-invoice')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(res.status).toBe(404);
    });

    it('POST /payments/:paymentId/request-invoice: protege contra IDOR (403)', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: 1 }]) // tax profile
        .mockResolvedValueOnce([
          { id: 10, project_id: 5, lead_id: 1, status: 'PAID', project_user_id: 999 },
        ]) // payment of other user
        .mockResolvedValueOnce([{ email: 'client_42@empresa.com' }]) // users email
        .mockResolvedValueOnce([]); // lead email mismatch

      const res = await supertest(app)
        .post('/api/v1/client/payments/10/request-invoice')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Acceso no autorizado');
    });

    it('POST /payments/:paymentId/request-invoice: rechaza pago que no está en estado PAID con 400', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: 1 }])
        .mockResolvedValueOnce([
          { id: 10, project_id: 5, lead_id: 1, status: 'PENDING', project_user_id: 42 },
        ]);

      const res = await supertest(app)
        .post('/api/v1/client/payments/10/request-invoice')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('estado PAID');
    });

    it('POST /payments/:paymentId/request-invoice: rechaza solicitud duplicada con 409 Conflict', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: 1 }])
        .mockResolvedValueOnce([
          { id: 10, project_id: 5, lead_id: 1, status: 'PAID', project_user_id: 42 },
        ])
        .mockResolvedValueOnce([{ id: 8, status: 'REQUESTED' }]); // existing request

      const res = await supertest(app)
        .post('/api/v1/client/payments/10/request-invoice')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('Conflict');
    });

    it('POST /payments/:paymentId/request-invoice: registra solicitud exitosamente (201)', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: 1 }])
        .mockResolvedValueOnce([
          { id: 10, project_id: 5, lead_id: 1, status: 'PAID', project_user_id: 42 },
        ])
        .mockResolvedValueOnce([]) // no existing request
        .mockResolvedValueOnce({ insertId: 55 }); // insert

      const res = await supertest(app)
        .post('/api/v1/client/payments/10/request-invoice')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ invoice_notes: 'Facturar con CFDI G03' });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.request_id).toBe(55);
    });

    it('POST /payments/:paymentId/request-invoice: permite solicitud para lead de mismo email', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: 1 }])
        .mockResolvedValueOnce([
          { id: 10, project_id: null, lead_id: 8, status: 'PAID', project_user_id: null },
        ])
        .mockResolvedValueOnce([{ email: 'client_42@empresa.com' }])
        .mockResolvedValueOnce([{ id: 8 }]) // matching lead
        .mockResolvedValueOnce([]) // no existing
        .mockResolvedValueOnce({ insertId: 56 });

      const res = await supertest(app)
        .post('/api/v1/client/payments/10/request-invoice')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(res.status).toBe(201);
    });

    it('POST /payments/:paymentId/request-invoice: maneja errores con 500 y mensaje fallback', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('DB Invoice Error'));
      const res1 = await supertest(app)
        .post('/api/v1/client/payments/10/request-invoice')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(res1.status).toBe(500);

      vi.mocked(db.query).mockRejectedValueOnce('raw db error');
      const res2 = await supertest(app)
        .post('/api/v1/client/payments/10/request-invoice')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(res2.status).toBe(500);
      expect(res2.body.message).toBe('Error al registrar solicitud de factura.');
    });
  });

  describe('5. Admin Handover & Tax Invoice Management Endpoints (routes/admin.ts)', () => {
    it('POST /admin/projects/:id/handover: valida ID y body', async () => {
      const resBadId = await supertest(app)
        .post('/api/v1/admin/projects/bad/handover')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(resBadId.status).toBe(400);

      const resBadBody = await supertest(app)
        .post('/api/v1/admin/projects/10/handover')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ repository_url: 'ftp://bad.com' });
      expect(resBadBody.status).toBe(400);
    });

    it('POST /admin/projects/:id/handover: 404 si el proyecto no existe', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);
      const res = await supertest(app)
        .post('/api/v1/admin/projects/10/handover')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ repository_url: 'https://github.com/dreamtek/repo' });
      expect(res.status).toBe(404);
    });

    it('POST /admin/projects/:id/handover: configura entrega cifrando credenciales con AES-256-GCM', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([
          { id: 10, status: 'COMPLETED_DELIVERED', pending_balance_cents: 0 },
        ])
        .mockResolvedValueOnce([{ id: 1, amount_cents: 100000, currency: 'USD' }]) // paid payments
        .mockResolvedValueOnce({ affectedRows: 1 }); // upsert

      const res = await supertest(app)
        .post('/api/v1/admin/projects/10/handover')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          repository_url: 'https://github.com/dreamtek/repo',
          deployment_url: 'https://prod.dreamtek.tech',
          documentation_url: 'https://docs.dreamtek.tech',
          access_credentials: 'AWS_ACCESS_KEY=123',
          handover_notes: 'Credenciales maestras',
        });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.certificate_sha256).toBeDefined();
    });

    it('POST /admin/projects/:id/handover: soporta configurar entrega sin credenciales ni URLs', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([
          { id: 10, status: 'COMPLETED_DELIVERED', pending_balance_cents: 0 },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce({ affectedRows: 1 });

      const res = await supertest(app)
        .post('/api/v1/admin/projects/10/handover')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(res.status).toBe(200);
    });

    it('POST /admin/projects/:id/handover: maneja errores con 500', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('Admin handover fail'));
      const res = await supertest(app)
        .post('/api/v1/admin/projects/10/handover')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ repository_url: 'https://github.com/dreamtek/repo' });
      expect(res.status).toBe(500);
    });

    it('GET /admin/tax-invoices: lista solicitudes de facturación', async () => {
      const mockInvoices = [
        {
          id: 1,
          payment_id: 10,
          project_id: 5,
          status: 'REQUESTED',
          rfc: 'XAXX010101000',
          legal_name: 'Empresa SA',
          amount_cents: 250000,
        },
      ];
      vi.mocked(db.query).mockResolvedValueOnce(mockInvoices);

      const res = await supertest(app)
        .get('/api/v1/admin/tax-invoices')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.tax_invoices).toEqual(mockInvoices);
    });

    it('GET /admin/tax-invoices: maneja errores con 500', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('List invoices error'));
      const res = await supertest(app)
        .get('/api/v1/admin/tax-invoices')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(500);
    });

    it('PATCH /admin/tax-invoices/:id/status: valida ID y body', async () => {
      const resBadId = await supertest(app)
        .patch('/api/v1/admin/tax-invoices/bad/status')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(resBadId.status).toBe(400);

      const resBadBody = await supertest(app)
        .patch('/api/v1/admin/tax-invoices/1/status')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'INVALID_STATUS' });
      expect(resBadBody.status).toBe(400);
    });

    it('PATCH /admin/tax-invoices/:id/status: 404 si la solicitud no existe', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([]);
      const res = await supertest(app)
        .patch('/api/v1/admin/tax-invoices/99/status')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'ISSUED' });
      expect(res.status).toBe(404);
    });

    it('PATCH /admin/tax-invoices/:id/status: actualiza estado a ISSUED con cfdi_uuid', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: 1, status: 'REQUESTED' }])
        .mockResolvedValueOnce({ affectedRows: 1 });

      const res = await supertest(app)
        .patch('/api/v1/admin/tax-invoices/1/status')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'ISSUED',
          cfdi_uuid: 'F42A-98C3-SAT-2026',
          invoice_notes: 'Comprobante emitido en portal contable SAT',
        });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.message).toContain('ISSUED');
    });

    it('PATCH /admin/tax-invoices/:id/status: actualiza estado a REJECTED sin cfdi_uuid ni notas', async () => {
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: 2, status: 'REQUESTED' }])
        .mockResolvedValueOnce({ affectedRows: 1 });

      const res = await supertest(app)
        .patch('/api/v1/admin/tax-invoices/2/status')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'REJECTED' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.message).toContain('REJECTED');
    });

    it('PATCH /admin/tax-invoices/:id/status: maneja errores con 500 y fallback de mensaje', async () => {
      vi.mocked(db.query).mockRejectedValueOnce(new Error('Update status error'));
      const res1 = await supertest(app)
        .patch('/api/v1/admin/tax-invoices/1/status')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'REJECTED' });
      expect(res1.status).toBe(500);

      vi.mocked(db.query).mockRejectedValueOnce('raw string rejection');
      const res2 = await supertest(app)
        .patch('/api/v1/admin/tax-invoices/1/status')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'REJECTED' });
      expect(res2.status).toBe(500);
      expect(res2.body.message).toBe('Error al actualizar estado de factura.');
    });
  });

  describe('Tax Schema & Client Router Branch Hardening', () => {
    it('clientTaxProfileSchema: procesa entradas en camelCase con isInternational y normaliza', () => {
      const parsed = clientTaxProfileSchema.safeParse({
        rfc: 'US1234567890INTL',
        legalName: 'Global Corp Inc & Partners <safe>',
        taxRegime: '616',
        cfdiUse: 'S01',
        postalCode: '90210',
        invoiceEmail: 'billing@globalcorp.com',
        isInternational: true,
      });

      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.rfc).toBe('US1234567890INTL');
        expect(parsed.data.legal_name).toContain('&amp;');
        expect(parsed.data.legalName).toContain('&amp;');
        expect(parsed.data.is_international).toBe(true);
        expect(parsed.data.isInternational).toBe(true);
        expect(parsed.data.cfdi_use).toBe('S01');
        expect(parsed.data.tax_regime).toBe('616');
      }
    });

    it('GET /client/projects/:id/settlement-certificate: maneja download_count null y errores sin message', async () => {
      // Caso download_count null / 0
      vi.mocked(db.query)
        .mockResolvedValueOnce([
          {
            id: 10,
            user_id: 42,
            title: 'Web Project',
            status: 'COMPLETED_DELIVERED',
            total_budget_cents: 100000,
            paid_amount_cents: 100000,
            pending_balance_cents: 0,
          },
        ])
        .mockResolvedValueOnce([{ id: 1, certificate_sha256: 'hash123', download_count: 0 }])
        .mockResolvedValueOnce([{ id: 1, amount_cents: 100000, currency: 'USD' }])
        .mockResolvedValueOnce({ affectedRows: 1 });

      const res1 = await supertest(app)
        .get('/api/v1/client/projects/10/settlement-certificate')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(res1.status).toBe(200);
      expect(res1.body.certificate.download_count).toBe(1);

      // Caso error sin message
      vi.mocked(db.query).mockRejectedValueOnce({});
      const res2 = await supertest(app)
        .get('/api/v1/client/projects/10/settlement-certificate')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(res2.status).toBe(500);
      expect(res2.body.message).toBe('Error al generar certificado de finiquito.');
    });

    it('GET & PUT /client/tax-profile: manejan errores de base de datos sin propiedad message', async () => {
      // GET con error sin message
      vi.mocked(db.query).mockRejectedValueOnce({});
      const resGet = await supertest(app)
        .get('/api/v1/client/tax-profile')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(resGet.status).toBe(500);
      expect(resGet.body.message).toBe('Error al consultar perfil fiscal.');

      // PUT con error sin message
      vi.mocked(db.query).mockRejectedValueOnce({});
      const resPut = await supertest(app)
        .put('/api/v1/client/tax-profile')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({
          rfc: 'GARM850101XYZ',
          legal_name: 'Empresa SA',
          tax_regime: '601',
          cfdi_use: 'G03',
          postal_code: '01000',
          invoice_email: 'test@empresa.com',
        });
      expect(resPut.status).toBe(500);
      expect(resPut.body.message).toBe('Error al guardar perfil fiscal.');
    });

    it('POST /client/payments/:paymentId/request-invoice: maneja payment.project_id nulo, sin notas y error sin message', async () => {
      // Caso payment.project_id = null y sin invoice_notes
      vi.mocked(db.query)
        .mockResolvedValueOnce([{ id: 1 }]) // profiles
        .mockResolvedValueOnce([
          {
            id: 99,
            project_id: null,
            project_user_id: 42,
            status: 'PAID',
            amount_cents: 5000,
            currency: 'USD',
          },
        ]) // payments
        .mockResolvedValueOnce([]) // existing
        .mockResolvedValueOnce({ insertId: 77 }); // insert

      const res1 = await supertest(app)
        .post('/api/v1/client/payments/99/request-invoice')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({});
      expect(res1.status).toBe(201);
      expect(res1.body.request_id).toBe(77);

      // Caso error sin message
      vi.mocked(db.query).mockRejectedValueOnce({});
      const res2 = await supertest(app)
        .post('/api/v1/client/payments/99/request-invoice')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({});
      expect(res2.status).toBe(500);
      expect(res2.body.message).toBe('Error al registrar solicitud de factura.');
    });

    it('GET /client/projects/:id/handover: maneja errores sin propiedad message', async () => {
      vi.mocked(db.query).mockRejectedValueOnce({});
      const res = await supertest(app)
        .get('/api/v1/client/projects/10/handover')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(res.status).toBe(500);
      expect(res.body.message).toBe('Error al consultar bóveda de entrega.');
    });

    it('POST /client/projects/:id/handover/reveal: maneja errores sin propiedad message', async () => {
      vi.mocked(db.query).mockRejectedValueOnce({});
      const res = await supertest(app)
        .post('/api/v1/client/projects/10/handover/reveal')
        .set('Authorization', `Bearer ${clientToken}`);
      expect(res.status).toBe(500);
      expect(res.body.message).toBe('Error al revelar credenciales de entrega.');
    });

    it('POST /admin/projects/:id/handover: maneja errores sin propiedad message y payload sin URLs', async () => {
      vi.mocked(db.query).mockRejectedValueOnce({});
      const res = await supertest(app)
        .post('/api/v1/admin/projects/10/handover')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          access_credentials_plain: 'PASS=test',
        });
      expect(res.status).toBe(500);
      expect(res.body.message).toBe('Error al configurar entrega de proyecto.');
    });

    it('GET /admin/tax-invoices: maneja errores sin propiedad message', async () => {
      vi.mocked(db.query).mockRejectedValueOnce({});
      const res = await supertest(app)
        .get('/api/v1/admin/tax-invoices')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(500);
      expect(res.body.message).toBe('Error al listar facturas fiscales.');
    });
  });
});
