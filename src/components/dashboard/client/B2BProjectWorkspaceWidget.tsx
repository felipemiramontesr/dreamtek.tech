'use client';

import React, { useState } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import {
  ClientProject,
  ClientProjectBriefing,
  updateClientProjectBriefing,
} from '@/lib/auth/client';

interface B2BProjectWorkspaceWidgetProps {
  projects?: ClientProject[];
  onProjectUpdated?: () => void;
}

export function B2BProjectWorkspaceWidget({
  projects = [],
  onProjectUpdated,
}: B2BProjectWorkspaceWidgetProps) {
  const [activeBriefingProject, setActiveBriefingProject] = useState<ClientProject | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form state for briefing modal
  const [formData, setFormData] = useState({
    business_goals: '',
    target_audience: '',
    technical_stack_preferences: '',
    infrastructure_notes: '',
    reference_urls_text: '',
    contact_lead_notes: '',
  });

  const handleOpenBriefing = (proj: ClientProject) => {
    setActiveBriefingProject(proj);
    setErrorMessage(null);
    setSuccessMessage(null);
    const existing = proj.briefing_data;
    setFormData({
      business_goals: existing?.business_goals || '',
      target_audience: existing?.target_audience || '',
      technical_stack_preferences: existing?.technical_stack_preferences || '',
      infrastructure_notes: existing?.infrastructure_notes || '',
      reference_urls_text: (existing?.reference_urls || []).join('\n'),
      contact_lead_notes: existing?.contact_lead_notes || '',
    });
  };

  const handleCloseBriefing = () => {
    setActiveBriefingProject(null);
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const handleSubmitBriefing = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.business_goals || formData.business_goals.trim().length < 5) {
      setErrorMessage('Los objetivos del proyecto deben tener al menos 5 caracteres.');
      return;
    }

    const urls = formData.reference_urls_text
      .split('\n')
      .map((u) => u.trim())
      .filter((u) => u.length > 0);

    // Validate that all URLs start with https://
    for (const u of urls) {
      if (!u.startsWith('https://')) {
        setErrorMessage(`La URL "${u}" debe comenzar estrictamente con https://`);
        return;
      }
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const payload: ClientProjectBriefing = {
        business_goals: formData.business_goals.trim(),
        target_audience: formData.target_audience.trim(),
        technical_stack_preferences: formData.technical_stack_preferences.trim(),
        infrastructure_notes: formData.infrastructure_notes.trim(),
        reference_urls: urls,
        contact_lead_notes: formData.contact_lead_notes.trim(),
      };

      await updateClientProjectBriefing(activeBriefingProject!.id, payload);
      setSuccessMessage('Briefing técnico enviado y registrado con éxito.');
      setTimeout(() => {
        handleCloseBriefing();
        if (onProjectUpdated) {
          onProjectUpdated();
        }
      }, 1200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al guardar el briefing técnico.';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatCurrency = (cents: number, currency: string) => {
    return `$${(cents / 100).toLocaleString()} ${currency}`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ONBOARDING_BRIEF':
        return (
          <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
            Fase: Briefing Inicial
          </span>
        );
      case 'ARCHITECTURE_DESIGN':
        return (
          <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
            Fase: Arquitectura & Diseño
          </span>
        );
      case 'IN_DEVELOPMENT':
        return (
          <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/30">
            Fase: En Desarrollo Activo
          </span>
        );
      case 'STAGING_REVIEW':
        return (
          <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-teal-500/10 text-teal-400 border border-teal-500/30">
            Fase: Revisión en Staging
          </span>
        );
      case 'COMPLETED_DELIVERED':
        return (
          <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            Fase: Completado & Entregado
          </span>
        );
      case 'ON_HOLD':
        return (
          <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-slate-500/10 text-slate-400 border border-slate-500/30">
            Fase: En Pausa
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-slate-500/10 text-slate-300 border border-slate-600">
            {status}
          </span>
        );
    }
  };

  const getMilestoneStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return (
          <span className="px-2 py-0.5 text-[11px] font-semibold rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            ✓ Completado
          </span>
        );
      case 'IN_PROGRESS':
        return (
          <span className="px-2 py-0.5 text-[11px] font-semibold rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 animate-pulse">
            ● En Progreso
          </span>
        );
      case 'REVIEW':
        return (
          <span className="px-2 py-0.5 text-[11px] font-semibold rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
            Revisión
          </span>
        );
      case 'PENDING':
      default:
        return (
          <span className="px-2 py-0.5 text-[11px] font-semibold rounded bg-slate-800 text-slate-400 border border-slate-700">
            Pendiente
          </span>
        );
    }
  };

  if (projects.length === 0) {
    return (
      <GlassCard className="p-6 border-cyan-500/20 bg-slate-900/40 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-bold text-white tracking-wide">
              Proyectos B2B & Workspace de Desarrollo
            </h3>
            <p className="text-xs text-slate-400">
              No cuentas con proyectos corporativos activos en este momento.
            </p>
          </div>
        </div>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-6">
      {projects.map((proj) => {
        const milestones = proj.milestones || [];
        let progressPercent = 0;
        if (typeof proj.progress_percent === 'number') {
          progressPercent = proj.progress_percent;
        } else if (milestones.length > 0) {
          const completedCount = milestones.filter((m) => m.status === 'COMPLETED').length;
          progressPercent = Math.round((completedCount / milestones.length) * 100);
        }
        const hasBriefing = !!proj.briefing_data;

        return (
          <GlassCard
            key={proj.id}
            className="p-6 border-cyan-500/30 bg-slate-900/60 backdrop-blur-xl space-y-6"
          >
            {/* Cabecera del Proyecto */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-white/10">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-black text-white tracking-wide">
                    {proj.project_name}
                  </h2>
                  <span className="px-2 py-0.5 text-xs font-mono rounded bg-slate-800 text-slate-300 border border-slate-700">
                    {proj.vertical.toUpperCase()}
                  </span>
                  {getStatusBadge(proj.status)}
                </div>
                <p className="text-xs text-slate-400">
                  ID Proyecto: <span className="font-mono text-cyan-300">DTK-PRJ-{proj.id}</span> ·
                  Duración estimada:{' '}
                  <span className="text-slate-200 font-semibold">
                    {proj.estimated_weeks} semanas
                  </span>
                </p>
              </div>

              {/* Medidor de Avance Global */}
              <div className="flex items-center gap-4 bg-slate-800/60 px-4 py-2 rounded-xl border border-slate-700/60">
                <div className="text-right">
                  <p className="text-[10px] uppercase font-bold text-slate-400">Avance General</p>
                  <p className="text-lg font-black text-cyan-400">{progressPercent}%</p>
                </div>
                <div className="w-24 bg-slate-700 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-cyan-500 to-emerald-400 h-2.5 rounded-full transition-all duration-500"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Grid de Balances y Ambientes */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Balance Financiero (Read-Only C-044.4) */}
              <div className="bg-slate-800/40 p-4 rounded-xl border border-white/5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">Anticipo Liquidado (50%)</span>
                  <span className="text-xs font-bold text-emerald-400">PAGADO</span>
                </div>
                <p className="text-lg font-black text-white">
                  {formatCurrency(proj.paid_amount_cents, proj.currency)}
                </p>
                <div className="pt-2 border-t border-slate-700/50 flex justify-between text-xs">
                  <span className="text-slate-400">Saldo Contra Entrega:</span>
                  <span className="font-semibold text-amber-300">
                    {formatCurrency(proj.pending_balance_cents, proj.currency)}
                  </span>
                </div>
              </div>

              {/* Ambiente Staging */}
              <div className="bg-slate-800/40 p-4 rounded-xl border border-white/5 space-y-2">
                <span className="text-xs text-slate-400">Ambiente de Pruebas (Staging)</span>
                {proj.staging_url ? (
                  <div>
                    <a
                      href={proj.staging_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm font-bold text-cyan-400 hover:text-cyan-300 hover:underline"
                    >
                      <span>Abrir Staging</span>
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                        />
                      </svg>
                    </a>
                    <p className="text-[10px] text-slate-500 truncate mt-1">{proj.staging_url}</p>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 italic">
                    En configuración por el equipo técnico durante la fase de integración.
                  </p>
                )}
              </div>

              {/* Repositorio & Código */}
              <div className="bg-slate-800/40 p-4 rounded-xl border border-white/5 space-y-2">
                <span className="text-xs text-slate-400">Control de Versiones (Repo)</span>
                {proj.repository_url ? (
                  <div>
                    <a
                      href={proj.repository_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm font-bold text-purple-400 hover:text-purple-300 hover:underline"
                    >
                      <span>Ver Repositorio</span>
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                        />
                      </svg>
                    </a>
                    <p className="text-[10px] text-slate-500 truncate mt-1">
                      {proj.repository_url}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 italic">
                    Repositorio privado gestionado bajo auditoría estricta de Dreamtek.
                  </p>
                )}
              </div>
            </div>

            {/* Módulo de Briefing Técnico */}
            <div className="bg-slate-900/80 p-4 rounded-xl border border-cyan-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold text-white">
                    Briefing & Especificaciones Técnicas
                  </h4>
                  {hasBriefing ? (
                    <span className="px-2 py-0.5 text-[11px] font-semibold rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      ✓ Recibido y Validado
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 text-[11px] font-semibold rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      Pendiente de Envío
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400">
                  {hasBriefing
                    ? 'Requerimientos, especificaciones y accesos capturados por el cliente.'
                    : 'Completa el briefing para que el equipo de arquitectura comience el diseño.'}
                </p>
              </div>

              <Button
                variant={hasBriefing ? 'outline' : 'primary'}
                size="sm"
                onClick={() => handleOpenBriefing(proj)}
                className={
                  hasBriefing
                    ? 'border-slate-700 text-slate-300 hover:bg-slate-800'
                    : 'bg-cyan-600 hover:bg-cyan-500 text-white'
                }
              >
                {hasBriefing ? 'Actualizar Briefing' : 'Completar Briefing'}
              </Button>
            </div>

            {/* Cronograma de Hitos y Sprints */}
            <div className="space-y-3">
              <h4 className="text-sm font-bold text-slate-200 tracking-wide">
                Cronograma de Sprints & Hitos de Entrega
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {milestones.map((m) => (
                  <div
                    key={m.id}
                    className={`p-3.5 rounded-xl border flex flex-col justify-between space-y-2 transition-all ${
                      m.status === 'COMPLETED'
                        ? 'bg-emerald-950/20 border-emerald-500/30'
                        : m.status === 'IN_PROGRESS'
                          ? 'bg-cyan-950/20 border-cyan-500/40 shadow-sm'
                          : 'bg-slate-800/40 border-slate-700/50'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono font-bold text-slate-400 uppercase">
                          Hito #{m.milestone_index} · Sem {m.target_week}
                        </span>
                        {getMilestoneStatusBadge(m.status)}
                      </div>
                      <h5 className="text-xs font-bold text-white leading-snug">{m.title}</h5>
                      {m.description && (
                        <p className="text-[11px] text-slate-400 line-clamp-2">{m.description}</p>
                      )}
                    </div>

                    {m.completed_at && (
                      <p className="text-[10px] text-emerald-400/80 font-mono">
                        Entregado: {new Date(m.completed_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </GlassCard>
        );
      })}

      {/* Modal Interactivo de Briefing */}
      {activeBriefingProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="relative w-full max-w-2xl bg-slate-900 border border-cyan-500/30 rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-white/10 bg-slate-900/80">
              <div>
                <h3 className="text-lg font-bold text-white">Briefing Técnico del Proyecto</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {activeBriefingProject.project_name} (DTK-PRJ-{activeBriefingProject.id})
                </p>
              </div>
              <button
                onClick={handleCloseBriefing}
                className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            {/* Modal Body / Form */}
            <form onSubmit={handleSubmitBriefing} className="p-6 overflow-y-auto space-y-4 flex-1">
              {errorMessage && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400">
                  {errorMessage}
                </div>
              )}
              {successMessage && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-xs text-emerald-400">
                  {successMessage}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Objetivos Comerciales & Alcance Clave <span className="text-cyan-400">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  value={formData.business_goals}
                  onChange={(e) => setFormData({ ...formData, business_goals: e.target.value })}
                  placeholder="Describe qué problema resuelve este software y qué resultados esperas alcanzar..."
                  className="w-full bg-slate-800/80 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Público Objetivo o Usuarios Finales
                </label>
                <input
                  type="text"
                  value={formData.target_audience}
                  onChange={(e) => setFormData({ ...formData, target_audience: e.target.value })}
                  placeholder="e.g. Clientes B2B, personal interno de logística, usuarios móviles..."
                  className="w-full bg-slate-800/80 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Preferencias de Stack Técnico / Integraciones
                </label>
                <input
                  type="text"
                  value={formData.technical_stack_preferences}
                  onChange={(e) =>
                    setFormData({ ...formData, technical_stack_preferences: e.target.value })
                  }
                  placeholder="e.g. Next.js, Node.js, PostgreSQL, Pasarela Stripe, AWS..."
                  className="w-full bg-slate-800/80 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Accesos & Notas de Infraestructura
                </label>
                <textarea
                  rows={2}
                  value={formData.infrastructure_notes}
                  onChange={(e) =>
                    setFormData({ ...formData, infrastructure_notes: e.target.value })
                  }
                  placeholder="e.g. Servidor actual, hosting existente o credenciales que se compartirán vía canal cifrado..."
                  className="w-full bg-slate-800/80 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  URLs de Referencia / Figma / Documentos (Una por línea, protocolo https://)
                </label>
                <textarea
                  rows={2}
                  value={formData.reference_urls_text}
                  onChange={(e) =>
                    setFormData({ ...formData, reference_urls_text: e.target.value })
                  }
                  placeholder="https://figma.com/file/...&#10;https://docs.google.com/..."
                  className="w-full bg-slate-800/80 border border-slate-700 rounded-lg p-2.5 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Notas Adicionales de Contacto
                </label>
                <input
                  type="text"
                  value={formData.contact_lead_notes}
                  onChange={(e) => setFormData({ ...formData, contact_lead_notes: e.target.value })}
                  placeholder="Disponibilidad horaria para reuniones de sprint..."
                  className="w-full bg-slate-800/80 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              {/* Modal Footer */}
              <div className="pt-4 border-t border-white/10 flex justify-end gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCloseBriefing}
                  className="border-slate-700 text-slate-300 hover:bg-slate-800"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={isSubmitting}
                  className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold"
                >
                  {isSubmitting ? 'Guardando...' : 'Guardar Briefing'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
