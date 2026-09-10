import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchClientProject,
  updateClientProjectBriefing,
  fetchAdminProjects,
  adminUpdateProject,
  adminUpdateMilestone,
  signOffClientMilestone,
  createProjectSettlementSession,
  getClientProjectHandover,
  revealProjectHandoverCredentials,
  getProjectSettlementCertificate,
  getClientTaxProfile,
  saveClientTaxProfile,
  requestPaymentInvoice,
} from '@/lib/auth/client';

describe('Client Project Auth Helper Functions Suite (FC 044 100% Coverage)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchClientProject', () => {
    it('debe retornar proyecto cuando la llamada es exitosa', async () => {
      const mockData = { status: 'success', project: { id: 1, project_name: 'App Test' } };
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockData),
      });

      const res = await fetchClientProject(1);
      expect(res).toEqual(mockData);
    });

    it('debe lanzar error cuando response no es ok', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: vi.fn().mockResolvedValue({ message: 'No autorizado' }),
      });

      await expect(fetchClientProject(999)).rejects.toThrow('No autorizado');
    });

    it('debe lanzar error con mensaje fallback cuando json no trae message ni error', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: vi.fn().mockResolvedValue({}),
      });

      await expect(fetchClientProject(999)).rejects.toThrow('Error al obtener el proyecto.');
    });
  });

  describe('updateClientProjectBriefing', () => {
    it('debe enviar briefing y retornar resultado exitoso', async () => {
      const mockBriefing = { business_goals: 'Objetivo de prueba' };
      const mockRes = {
        status: 'success',
        message: 'OK',
        briefing: mockBriefing,
        status_updated: 'ARCHITECTURE_DESIGN',
      };
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockRes),
      });

      const res = await updateClientProjectBriefing(1, mockBriefing);
      expect(res).toEqual(mockRes);
    });

    it('debe lanzar error cuando response no es ok', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: vi.fn().mockResolvedValue({ error: 'Validación fallida' }),
      });

      await expect(updateClientProjectBriefing(1, { business_goals: 'Test' })).rejects.toThrow(
        'Validación fallida',
      );
    });

    it('debe lanzar error fallback cuando json está vacío', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: vi.fn().mockResolvedValue({}),
      });

      await expect(updateClientProjectBriefing(1, { business_goals: 'Test' })).rejects.toThrow(
        'Error al actualizar el briefing del proyecto.',
      );
    });
  });

  describe('fetchAdminProjects', () => {
    it('debe consultar proyectos con filtros y sin filtros', async () => {
      const mockRes = { status: 'success', total: 1, projects: [] };
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockRes),
      });

      const resNoFilters = await fetchAdminProjects();
      expect(resNoFilters).toEqual(mockRes);

      const resWithFilters = await fetchAdminProjects({
        status: 'IN_DEV',
        vertical: 'saas',
        search: 'corp',
      });
      expect(resWithFilters).toEqual(mockRes);
    });

    it('debe lanzar error cuando response no es ok', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: vi.fn().mockResolvedValue({ message: 'Error en servidor' }),
      });

      await expect(fetchAdminProjects()).rejects.toThrow('Error en servidor');
    });

    it('debe lanzar error fallback cuando json está vacío', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: vi.fn().mockResolvedValue({}),
      });

      await expect(fetchAdminProjects()).rejects.toThrow(
        'Error al obtener proyectos administrativos.',
      );
    });
  });

  describe('adminUpdateProject', () => {
    it('debe actualizar proyecto y retornar resultado', async () => {
      const mockRes = { status: 'success', message: 'Updated', project: { id: 1 } };
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockRes),
      });

      const res = await adminUpdateProject(1, { staging_url: 'https://staging.com' });
      expect(res).toEqual(mockRes);
    });

    it('debe lanzar error cuando response no es ok', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: vi.fn().mockResolvedValue({ message: 'URL inválida' }),
      });

      await expect(adminUpdateProject(1, {})).rejects.toThrow('URL inválida');
    });

    it('debe lanzar error fallback cuando json está vacío', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: vi.fn().mockResolvedValue({}),
      });

      await expect(adminUpdateProject(1, {})).rejects.toThrow('Error al actualizar el proyecto.');
    });
  });

  describe('adminUpdateMilestone', () => {
    it('debe actualizar hito y retornar resultado', async () => {
      const mockRes = {
        status: 'success',
        message: 'Updated',
        milestone: { id: 2, status: 'COMPLETED' },
      };
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockRes),
      });

      const res = await adminUpdateMilestone(1, 2, { status: 'COMPLETED' });
      expect(res).toEqual(mockRes);
    });

    it('debe lanzar error cuando response no es ok', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: vi.fn().mockResolvedValue({ message: 'Hito no encontrado' }),
      });

      await expect(adminUpdateMilestone(1, 999, { status: 'COMPLETED' })).rejects.toThrow(
        'Hito no encontrado',
      );
    });

    it('debe lanzar error fallback cuando json está vacío', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: vi.fn().mockResolvedValue({}),
      });

      await expect(adminUpdateMilestone(1, 999, { status: 'COMPLETED' })).rejects.toThrow(
        'Error al actualizar el hito.',
      );
    });
  });

  describe('signOffClientMilestone (FC 045 Phase 1)', () => {
    it('debe enviar aprobación de hito exitosamente', async () => {
      const mockRes = { status: 'success', message: 'Entregable aprobado con éxito.' };
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockRes),
      });

      const res = await signOffClientMilestone(1, 10, {
        accepted: true,
        feedback: 'Todo en orden',
      });
      expect(res).toEqual(mockRes);
    });

    it('debe lanzar error cuando respuesta no es ok con mensaje', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: vi.fn().mockResolvedValue({ message: 'Hito no encontrado' }),
      });

      await expect(signOffClientMilestone(1, 999, { accepted: true })).rejects.toThrow(
        'Hito no encontrado',
      );
    });

    it('debe lanzar error fallback cuando respuesta no es ok sin mensaje', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: vi.fn().mockResolvedValue({}),
      });

      await expect(signOffClientMilestone(1, 999, { accepted: true })).rejects.toThrow(
        'Error al aprobar el hito.',
      );
    });
  });

  describe('createProjectSettlementSession (FC 045 Phase 2)', () => {
    it('debe generar sesión de finiquito exitosamente', async () => {
      const mockRes = {
        status: 'success',
        checkout_url: 'https://checkout.stripe.com/pay/cs_123',
        session_id: 'cs_123',
        amount_cents: 500000,
        currency: 'USD',
      };
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockRes),
      });

      const res = await createProjectSettlementSession(1);
      expect(res).toEqual(mockRes);
    });

    it('debe lanzar error cuando respuesta no es ok con mensaje', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: vi.fn().mockResolvedValue({ message: 'No hay saldo pendiente' }),
      });

      await expect(createProjectSettlementSession(1)).rejects.toThrow('No hay saldo pendiente');
    });

    it('debe lanzar error fallback cuando respuesta no es ok sin mensaje', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: vi.fn().mockResolvedValue({}),
      });

      await expect(createProjectSettlementSession(1)).rejects.toThrow(
        'Error al generar sesión de finiquito.',
      );
    });
  });

  describe('getClientProjectHandover (FC 046 Phase 1)', () => {
    it('debe retornar datos de entrega cuando la llamada es exitosa', async () => {
      const mockData = {
        status: 'success',
        handover: {
          project_id: 1,
          repository_url: 'https://github.com/org/repo',
          deployment_url: 'https://app.dreamtek.tech',
          documentation_url: 'https://docs.dreamtek.tech',
          handover_notes: 'Notas de entrega',
          certificate_sha256: 'abc123sha',
          has_credentials: true,
          downloaded_at: null,
          download_count: 0,
        },
      };
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockData),
      });

      const res = await getClientProjectHandover(1);
      expect(res).toEqual(mockData);
    });

    it('debe lanzar error cuando respuesta no es ok con mensaje', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: vi.fn().mockResolvedValue({ message: 'Bóveda bloqueada' }),
      });

      await expect(getClientProjectHandover(1)).rejects.toThrow('Bóveda bloqueada');
    });

    it('debe lanzar error fallback cuando respuesta no es ok sin mensaje', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: vi.fn().mockResolvedValue({}),
      });

      await expect(getClientProjectHandover(1)).rejects.toThrow(
        'Error al consultar la bóveda de entrega.',
      );
    });
  });

  describe('revealProjectHandoverCredentials (FC 046 Phase 1)', () => {
    it('debe revelar credenciales exitosamente', async () => {
      const mockData = { status: 'success', credentials: 'USER=admin\nPASS=secret' };
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockData),
      });

      const res = await revealProjectHandoverCredentials(1);
      expect(res).toEqual(mockData);
    });

    it('debe lanzar error con mensaje custom', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: vi.fn().mockResolvedValue({ message: 'No existen credenciales' }),
      });

      await expect(revealProjectHandoverCredentials(1)).rejects.toThrow('No existen credenciales');
    });

    it('debe lanzar error fallback sin mensaje', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: vi.fn().mockResolvedValue({}),
      });

      await expect(revealProjectHandoverCredentials(1)).rejects.toThrow(
        'Error al revelar las credenciales de entrega.',
      );
    });
  });

  describe('getProjectSettlementCertificate (FC 046 Phase 1)', () => {
    it('debe descargar constancia de finiquito exitosamente', async () => {
      const mockData = {
        status: 'success',
        certificate: {
          canonical_data: { project_id: 1 },
          certificate_sha256: 'sha256hash',
          downloaded_at: '2026-09-09T00:00:00Z',
          download_count: 1,
        },
      };
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockData),
      });

      const res = await getProjectSettlementCertificate(1);
      expect(res).toEqual(mockData);
    });

    it('debe lanzar error con mensaje custom', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: vi.fn().mockResolvedValue({ message: 'Requiere saldo liquidado' }),
      });

      await expect(getProjectSettlementCertificate(1)).rejects.toThrow('Requiere saldo liquidado');
    });

    it('debe lanzar error fallback sin mensaje', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: vi.fn().mockResolvedValue({}),
      });

      await expect(getProjectSettlementCertificate(1)).rejects.toThrow(
        'Error al descargar la constancia de finiquito.',
      );
    });
  });

  describe('getClientTaxProfile (FC 046 Phase 2)', () => {
    it('debe obtener perfil fiscal exitosamente', async () => {
      const mockData = {
        status: 'success',
        tax_profile: {
          id: 1,
          user_id: 42,
          tenant_id: 1,
          rfc: 'XAXX010101000',
          legal_name: 'Empresa SA de CV',
          tax_regime: '601',
          cfdi_use: 'G03',
          postal_code: '01000',
          invoice_email: 'facturas@empresa.com',
          created_at: '2026-09-09',
          updated_at: '2026-09-09',
        },
      };
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockData),
      });

      const res = await getClientTaxProfile();
      expect(res).toEqual(mockData);
    });

    it('debe lanzar error con mensaje', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: vi.fn().mockResolvedValue({ message: 'Error DB' }),
      });

      await expect(getClientTaxProfile()).rejects.toThrow('Error DB');
    });

    it('debe lanzar error fallback', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: vi.fn().mockResolvedValue({}),
      });

      await expect(getClientTaxProfile()).rejects.toThrow(
        'Error al consultar el expediente fiscal.',
      );
    });
  });

  describe('saveClientTaxProfile (FC 046 Phase 2)', () => {
    it('debe guardar perfil fiscal exitosamente', async () => {
      const payload = {
        rfc: 'XAXX010101000',
        legal_name: 'Empresa SA de CV',
        tax_regime: '601',
        cfdi_use: 'G03',
        postal_code: '01000',
        invoice_email: 'facturas@empresa.com',
      };
      const mockData = {
        status: 'success',
        message: 'Guardado',
        tax_profile: { id: 1, ...payload },
      };
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockData),
      });

      const res = await saveClientTaxProfile(payload);
      expect(res).toEqual(mockData);
    });

    it('debe lanzar error con mensaje', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: vi.fn().mockResolvedValue({ message: 'RFC inválido' }),
      });

      await expect(
        saveClientTaxProfile({
          rfc: 'INV',
          legal_name: 'Empresa',
          tax_regime: '601',
          cfdi_use: 'G03',
          postal_code: '01000',
          invoice_email: 'a@b.com',
        }),
      ).rejects.toThrow('RFC inválido');
    });

    it('debe lanzar error fallback', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: vi.fn().mockResolvedValue({}),
      });

      await expect(
        saveClientTaxProfile({
          rfc: 'INV',
          legal_name: 'Empresa',
          tax_regime: '601',
          cfdi_use: 'G03',
          postal_code: '01000',
          invoice_email: 'a@b.com',
        }),
      ).rejects.toThrow('Error al guardar el expediente fiscal.');
    });
  });

  describe('requestPaymentInvoice (FC 046 Phase 2)', () => {
    it('debe solicitar factura exitosamente con y sin notas', async () => {
      const mockData = { status: 'success', message: 'Registrado', request_id: 10 };
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockData),
      });

      const resWithNotes = await requestPaymentInvoice(100, { invoice_notes: 'Comprobante' });
      expect(resWithNotes).toEqual(mockData);

      const resWithoutNotes = await requestPaymentInvoice(100);
      expect(resWithoutNotes).toEqual(mockData);
    });

    it('debe lanzar error con mensaje', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: vi.fn().mockResolvedValue({ message: 'Ya existe solicitud previa' }),
      });

      await expect(requestPaymentInvoice(100)).rejects.toThrow('Ya existe solicitud previa');
    });

    it('debe lanzar error fallback', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: vi.fn().mockResolvedValue({}),
      });

      await expect(requestPaymentInvoice(100)).rejects.toThrow(
        'Error al solicitar la factura fiscal.',
      );
    });
  });
});
