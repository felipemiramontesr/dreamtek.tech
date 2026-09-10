'use client';

import React, { useState } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import {
  ClientProject,
  ClientProjectBriefing,
  ClientProjectMilestone,
  ProjectHandoverData,
  updateClientProjectBriefing,
  signOffClientMilestone,
  createProjectSettlementSession,
  getClientProjectHandover,
  revealProjectHandoverCredentials,
  getProjectSettlementCertificate,
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

  // Sign-off modal state
  const [activeSignOff, setActiveSignOff] = useState<{
    project: ClientProject;
    milestone: ClientProjectMilestone;
  } | null>(null);
  const [signOffAccepted, setSignOffAccepted] = useState(false);
  const [signOffFeedback, setSignOffFeedback] = useState('');
  const [isSubmittingSignOff, setIsSubmittingSignOff] = useState(false);
  const [signOffError, setSignOffError] = useState<string | null>(null);
  const [signOffSuccess, setSignOffSuccess] = useState<string | null>(null);

  // Settlement checkout state
  const [isSettlingId, setIsSettlingId] = useState<number | null>(null);
  const [settleError, setSettleError] = useState<string | null>(null);

  // Handover Vault state (FC 046)
  const [activeHandoverProject, setActiveHandoverProject] = useState<ClientProject | null>(null);
  const [handoverData, setHandoverData] = useState<ProjectHandoverData | null>(null);
  const [isLoadingHandover, setIsLoadingHandover] = useState(false);
  const [handoverError, setHandoverError] = useState<string | null>(null);
  const [revealedCredentials, setRevealedCredentials] = useState<string | null>(null);
  const [isRevealingCredentials, setIsRevealingCredentials] = useState(false);
  const [revealError, setRevealError] = useState<string | null>(null);
  const [copiedCredentials, setCopiedCredentials] = useState(false);
  const [isDownloadingCert, setIsDownloadingCert] = useState(false);
  const [certSuccess, setCertSuccess] = useState<string | null>(null);

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

  const handleOpenSignOff = (project: ClientProject, milestone: ClientProjectMilestone) => {
    setActiveSignOff({ project, milestone });
    setSignOffAccepted(false);
    setSignOffFeedback('');
    setSignOffError(null);
    setSignOffSuccess(null);
  };

  const handleCloseSignOff = () => {
    setActiveSignOff(null);
    setSignOffAccepted(false);
    setSignOffFeedback('');
    setSignOffError(null);
    setSignOffSuccess(null);
  };

  const handleSubmitSignOff = async (e: React.FormEvent) => {
    e.preventDefault();
    /* v8 ignore next */
    if (!activeSignOff) return;

    if (!signOffAccepted) {
      setSignOffError('Debes confirmar y aceptar formalmente los entregables para proceder.');
      return;
    }

    setIsSubmittingSignOff(true);
    setSignOffError(null);
    setSignOffSuccess(null);

    try {
      await signOffClientMilestone(activeSignOff.project.id, activeSignOff.milestone.id, {
        accepted: true,
        feedback: signOffFeedback.trim() || undefined,
      });
      setSignOffSuccess('Hito aprobado formalmente con éxito. Registro de auditoría asentado.');
      setTimeout(() => {
        handleCloseSignOff();
        onProjectUpdated?.();
      }, 1200);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Error al registrar el visto bueno del hito.';
      setSignOffError(msg);
    } finally {
      setIsSubmittingSignOff(false);
    }
  };

  const handleSettleBalance = async (projectId: number) => {
    setIsSettlingId(projectId);
    setSettleError(null);
    try {
      const res = await createProjectSettlementSession(projectId);
      if (res.checkout_url) {
        window.location.href = res.checkout_url;
      } else {
        setSettleError('No se recibió la URL de la pasarela de pago.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al iniciar la pasarela de finiquito.';
      setSettleError(msg);
    } finally {
      setIsSettlingId(null);
    }
  };

  const handleOpenHandover = async (project: ClientProject) => {
    setActiveHandoverProject(project);
    setHandoverData(null);
    setHandoverError(null);
    setRevealedCredentials(null);
    setRevealError(null);
    setCopiedCredentials(false);
    setCertSuccess(null);
    setIsLoadingHandover(true);

    try {
      const res = await getClientProjectHandover(project.id);
      setHandoverData(res.handover);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al consultar la bóveda de entrega.';
      setHandoverError(msg);
    } finally {
      setIsLoadingHandover(false);
    }
  };

  const handleCloseHandover = () => {
    setActiveHandoverProject(null);
    setHandoverData(null);
    setHandoverError(null);
    setRevealedCredentials(null);
    setRevealError(null);
    setCopiedCredentials(false);
    setCertSuccess(null);
  };

  const handleRevealCredentials = async () => {
    /* v8 ignore next */
    if (!activeHandoverProject) return;
    setIsRevealingCredentials(true);
    setRevealError(null);
    try {
      const res = await revealProjectHandoverCredentials(activeHandoverProject.id);
      setRevealedCredentials(res.credentials);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al revelar credenciales cifradas.';
      setRevealError(msg);
    } finally {
      setIsRevealingCredentials(false);
    }
  };

  const handleCopyCredentials = async () => {
    /* v8 ignore next */
    if (!revealedCredentials) return;
    try {
      await navigator.clipboard.writeText(revealedCredentials);
      setCopiedCredentials(true);
      /* v8 ignore next */
      setTimeout(() => setCopiedCredentials(false), 2500);
    } catch {
      /* v8 ignore next */
    }
  };

  const handleDownloadCertificate = async () => {
    /* v8 ignore next */
    if (!activeHandoverProject) return;
    setIsDownloadingCert(true);
    setCertSuccess(null);
    try {
      const res = await getProjectSettlementCertificate(activeHandoverProject.id);
      const jsonBlob = new Blob([JSON.stringify(res.certificate, null, 2)], {
        type: 'application/json',
      });
      const downloadUrl = URL.createObjectURL(jsonBlob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `finiquito-proyecto-${activeHandoverProject.id}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
      setCertSuccess('Constancia de finiquito descargada exitosamente.');
      setHandoverData((prev) => {
        /* v8 ignore next */
        if (!prev) return null;
        return {
          ...prev,
          download_count: prev.download_count + 1,
          downloaded_at: res.certificate.downloaded_at,
        };
      });
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Error al descargar la constancia de finiquito.';
      setHandoverError(msg);
    } finally {
      setIsDownloadingCert(false);
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
      case 'SETTLEMENT_PENDING':
        return (
          <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/30 animate-pulse">
            Fase: Finiquito Pendiente
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

            {/* Banner de Liquidación Final & Finiquito */}
            {(proj.status === 'SETTLEMENT_PENDING' ||
              (proj.pending_balance_cents > 0 &&
                milestones.length > 0 &&
                milestones.every((m) => m.status === 'COMPLETED'))) && (
              <div className="bg-gradient-to-r from-purple-950/40 via-cyan-950/40 to-slate-900 border border-purple-500/40 p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg shadow-purple-950/20">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="flex h-2 w-2 rounded-full bg-purple-400 animate-ping" />
                    <h4 className="text-sm font-black text-white uppercase tracking-wider">
                      Liquidación Final & Finiquito de Entrega
                    </h4>
                  </div>
                  <p className="text-xs text-slate-300">
                    Todos los hitos del proyecto han sido aprobados formalmente. Procede a liquidar
                    el saldo final de{' '}
                    <span className="font-bold text-amber-300">
                      {formatCurrency(proj.pending_balance_cents, proj.currency)}
                    </span>{' '}
                    para liberar la constancia de finiquito y el cierre formal de entrega.
                  </p>
                  {settleError && (
                    <p className="text-xs text-red-400 font-semibold">{settleError}</p>
                  )}
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={isSettlingId === proj.id}
                  onClick={() => handleSettleBalance(proj.id)}
                  className="bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white font-bold whitespace-nowrap shadow-md"
                >
                  {isSettlingId === proj.id
                    ? 'Iniciando Checkout...'
                    : 'Liquidar Saldo en Stripe (Finiquito)'}
                </Button>
              </div>
            )}

            {/* Banner de Proyecto Entregado & Liquidado */}
            {proj.status === 'COMPLETED_DELIVERED' && proj.pending_balance_cents === 0 && (
              <div className="bg-emerald-950/30 border border-emerald-500/30 p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-bold">
                    ✓
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-emerald-300">
                      Proyecto Entregado & Finiquito Liquidado al 100%
                    </h4>
                    <p className="text-xs text-slate-400">
                      Garantías y código entregados formalmente a conformidad del cliente. Balance
                      en cero.
                    </p>
                  </div>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleOpenHandover(proj)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold whitespace-nowrap"
                >
                  Abrir Bóveda de Entrega & Finiquito
                </Button>
              </div>
            )}

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

                    {/* Botón de Visto Bueno / Sign-off para cliente si el hito está en REVIEW o IN_PROGRESS y aún no tiene client_approved_at */}
                    {(m.status === 'REVIEW' || m.status === 'IN_PROGRESS') &&
                      !m.client_approved_at && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenSignOff(proj, m)}
                          className="mt-2 w-full border-purple-500/40 text-purple-300 hover:bg-purple-500/20 text-[11px] font-bold py-1"
                        >
                          Revisar & Aprobar
                        </Button>
                      )}

                    {/* Indicador de Aprobación por Cliente */}
                    {m.client_approved_at && (
                      <div className="mt-2 pt-2 border-t border-white/5 space-y-0.5">
                        <p className="text-[10px] text-emerald-400 font-mono font-semibold">
                          ✓ Visto Bueno Cliente:{' '}
                          {new Date(m.client_approved_at).toLocaleDateString()}
                        </p>
                        {m.client_feedback && (
                          <p className="text-[10px] text-slate-400 italic line-clamp-2">
                            &ldquo;{m.client_feedback}&rdquo;
                          </p>
                        )}
                      </div>
                    )}

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

      {/* Modal Interactivo de Aprobación Formal de Hito (Sign-Off) */}
      {activeSignOff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="relative w-full max-w-lg bg-slate-900 border border-purple-500/40 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-white/10 bg-slate-900/90">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-purple-400" />
                  <h3 className="text-base font-black text-white uppercase tracking-wider">
                    Visto Bueno & Sign-Off Formal
                  </h3>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Hito #{activeSignOff.milestone.milestone_index}:{' '}
                  <span className="text-purple-300 font-semibold">
                    {activeSignOff.milestone.title}
                  </span>
                </p>
                <p className="text-[11px] text-slate-500 font-mono">
                  {activeSignOff.project.project_name} (DTK-PRJ-{activeSignOff.project.id})
                </p>
              </div>
              <button
                onClick={handleCloseSignOff}
                className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmitSignOff} className="p-6 space-y-4">
              {signOffError && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400">
                  {signOffError}
                </div>
              )}
              {signOffSuccess && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-xs text-emerald-400">
                  {signOffSuccess}
                </div>
              )}

              {activeSignOff.milestone.description && (
                <div className="p-3 bg-slate-800/60 rounded-xl border border-white/5 text-xs text-slate-300">
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">
                    Alcance del Entregable
                  </p>
                  {activeSignOff.milestone.description}
                </div>
              )}

              {/* Checkbox de Aceptación Legal/Técnica */}
              <div className="flex items-start gap-3 p-3 bg-purple-950/20 border border-purple-500/30 rounded-xl">
                <input
                  type="checkbox"
                  id="signoff_accept"
                  required
                  checked={signOffAccepted}
                  onChange={(e) => setSignOffAccepted(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-slate-700 bg-slate-800 text-purple-600 focus:ring-purple-500 cursor-pointer"
                />
                <label
                  htmlFor="signoff_accept"
                  className="text-xs text-slate-200 cursor-pointer leading-relaxed"
                >
                  Confirmo haber revisado y validado a entera satisfacción técnica los entregables
                  correspondientes a este hito de desarrollo.
                </label>
              </div>

              {/* Feedback o Comentarios Opcionales */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Comentarios, visto bueno o notas de entrega{' '}
                  <span className="text-slate-500 font-normal">
                    (opcional, máx 2000 caracteres)
                  </span>
                </label>
                <textarea
                  rows={3}
                  maxLength={2000}
                  value={signOffFeedback}
                  onChange={(e) => setSignOffFeedback(e.target.value)}
                  placeholder="e.g. Aprobado conforme a la demo del sprint y pruebas en staging..."
                  className="w-full bg-slate-800/80 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              {/* Modal Footer */}
              <div className="pt-4 border-t border-white/10 flex justify-end gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCloseSignOff}
                  className="border-slate-700 text-slate-300 hover:bg-slate-800"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={isSubmittingSignOff || !signOffAccepted}
                  className="bg-purple-600 hover:bg-purple-500 text-white font-bold disabled:opacity-50"
                >
                  {isSubmittingSignOff ? 'Aprobando...' : 'Aprobar Hito Formalmente'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Interactivo de Bóveda de Entrega & Finiquito (FC 046) */}
      {activeHandoverProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="relative w-full max-w-2xl bg-slate-900 border border-emerald-500/40 rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-white/10 bg-slate-900/90">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  <h3 className="text-base font-black text-white uppercase tracking-wider">
                    Bóveda Segura de Entrega & Finiquito
                  </h3>
                </div>
                <p className="text-xs text-slate-400">
                  {activeHandoverProject.project_name} (
                  <span className="font-mono text-cyan-300">
                    DTK-PRJ-{activeHandoverProject.id}
                  </span>
                  )
                </p>
              </div>
              <button
                onClick={handleCloseHandover}
                className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            {/* Content Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
              {/* Security Banner A02/A09 */}
              <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/30 flex items-start gap-3">
                <span className="text-emerald-400 text-base font-bold">🔒</span>
                <div>
                  <h5 className="font-bold text-emerald-300">
                    Bóveda Protegida con Cifrado AES-256-GCM
                  </h5>
                  <p className="text-slate-400 text-[11px] mt-0.5">
                    Entregables definitivos y constancia formal de finiquito. Cada revelación de
                    credenciales queda asentada en la bitácora de auditoría inmutable de Dreamtek.
                  </p>
                </div>
              </div>

              {isLoadingHandover && (
                <div className="py-12 text-center space-y-3">
                  <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-400 rounded-full animate-spin mx-auto" />
                  <p className="text-slate-400">Descifrando paquete de entrega y certificados...</p>
                </div>
              )}

              {handoverError && (
                <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400">
                  {handoverError}
                </div>
              )}

              {certSuccess && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400">
                  {certSuccess}
                </div>
              )}

              {!isLoadingHandover && handoverData && (
                <div className="space-y-6">
                  {/* Grid de Enlaces de Entrega */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Repositorio */}
                    <div className="p-3 bg-slate-800/50 rounded-xl border border-white/5 space-y-1">
                      <span className="text-[10px] font-bold uppercase text-slate-400">
                        Código Fuente (Repo)
                      </span>
                      {handoverData.repository_url ? (
                        <a
                          href={handoverData.repository_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block text-cyan-400 hover:text-cyan-300 underline font-semibold truncate"
                        >
                          Abrir Repositorio ↗
                        </a>
                      ) : (
                        <p className="text-slate-500 italic">No configurado</p>
                      )}
                    </div>

                    {/* Despliegue en Producción */}
                    <div className="p-3 bg-slate-800/50 rounded-xl border border-white/5 space-y-1">
                      <span className="text-[10px] font-bold uppercase text-slate-400">
                        Producción Activa
                      </span>
                      {handoverData.deployment_url ? (
                        <a
                          href={handoverData.deployment_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block text-emerald-400 hover:text-emerald-300 underline font-semibold truncate"
                        >
                          Ver Despliegue ↗
                        </a>
                      ) : (
                        <p className="text-slate-500 italic">No configurado</p>
                      )}
                    </div>

                    {/* Documentación */}
                    <div className="p-3 bg-slate-800/50 rounded-xl border border-white/5 space-y-1">
                      <span className="text-[10px] font-bold uppercase text-slate-400">
                        Documentación Técnica
                      </span>
                      {handoverData.documentation_url ? (
                        <a
                          href={handoverData.documentation_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block text-purple-400 hover:text-purple-300 underline font-semibold truncate"
                        >
                          Guía & Manual ↗
                        </a>
                      ) : (
                        <p className="text-slate-500 italic">No configurada</p>
                      )}
                    </div>
                  </div>

                  {/* Notas de Entrega */}
                  {handoverData.handover_notes && (
                    <div className="p-4 bg-slate-800/40 rounded-xl border border-white/5 space-y-1">
                      <p className="text-[10px] font-bold uppercase text-slate-400">
                        Notas de Entrega del Equipo de Ingeniería
                      </p>
                      <p className="text-slate-300 whitespace-pre-line leading-relaxed">
                        {handoverData.handover_notes}
                      </p>
                    </div>
                  )}

                  {/* Constancia Oficial de Finiquito */}
                  <div className="p-4 bg-slate-800/60 rounded-xl border border-emerald-500/20 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <h4 className="font-bold text-white">Constancia Oficial de Finiquito</h4>
                        <p className="text-[11px] text-slate-400">
                          Documento JSON canónico inmutable con hash SHA-256 verificable.
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isDownloadingCert}
                        onClick={handleDownloadCertificate}
                        className="border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 font-bold whitespace-nowrap"
                      >
                        {isDownloadingCert ? 'Descargando...' : 'Descargar Constancia (.JSON)'}
                      </Button>
                    </div>

                    <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-700/60 font-mono text-[11px] text-slate-300 flex items-center justify-between gap-2">
                      <span className="truncate">
                        SHA-256:{' '}
                        <span className="text-emerald-400">{handoverData.certificate_sha256}</span>
                      </span>
                      <span className="text-[10px] text-slate-500 whitespace-nowrap">
                        Descargas: {handoverData.download_count}
                      </span>
                    </div>
                  </div>

                  {/* Sección de Credenciales Cifradas */}
                  <div className="p-4 bg-slate-800/60 rounded-xl border border-purple-500/20 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <h4 className="font-bold text-white">Credenciales Maestras de Acceso</h4>
                        <p className="text-[11px] text-slate-400">
                          {handoverData.has_credentials
                            ? 'Credenciales sensibles de infraestructura cifradas en reposo.'
                            : 'No se configuraron credenciales maestras en este proyecto.'}
                        </p>
                      </div>

                      {handoverData.has_credentials && !revealedCredentials && (
                        <Button
                          size="sm"
                          variant="primary"
                          disabled={isRevealingCredentials}
                          onClick={handleRevealCredentials}
                          className="bg-purple-600 hover:bg-purple-500 text-white font-bold whitespace-nowrap"
                        >
                          {isRevealingCredentials ? 'Descifrando...' : 'Revelar Credenciales'}
                        </Button>
                      )}
                    </div>

                    {revealError && (
                      <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
                        {revealError}
                      </div>
                    )}

                    {revealedCredentials && (
                      <div className="space-y-2">
                        <div className="relative p-3 bg-slate-950 rounded-lg border border-purple-500/40">
                          <pre className="font-mono text-[11px] text-emerald-300 whitespace-pre-wrap break-all">
                            {revealedCredentials}
                          </pre>
                        </div>
                        <div className="flex justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleCopyCredentials}
                            className="border-slate-700 text-slate-300 hover:bg-slate-800"
                          >
                            {copiedCredentials
                              ? 'Copiado al Portapapeles ✓'
                              : 'Copiar Credenciales'}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-white/10 bg-slate-900/90 flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCloseHandover}
                className="border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                Cerrar Bóveda
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
