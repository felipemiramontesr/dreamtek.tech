import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchClientProject,
  updateClientProjectBriefing,
  fetchAdminProjects,
  adminUpdateProject,
  adminUpdateMilestone,
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
});
