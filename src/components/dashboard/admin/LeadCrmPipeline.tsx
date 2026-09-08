'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import {
  fetchAdminLeads,
  fetchAdminLeadDetails,
  updateAdminLeadStatus,
  addAdminLeadActivity,
  sendAdminLeadEmail,
  createAdminLeadCheckoutSession,
} from '@/lib/auth/client';

export interface LeadItem {
  id: number | string;
  email: string;
  full_name?: string;
  name?: string;
  phone?: string;
  company?: string;
  company_name?: string;
  status: 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'PROPOSAL_SENT' | 'NEGOTIATION' | 'WON' | 'LOST';
  deposit_status?: 'NONE' | 'PENDING' | 'PAID' | 'REFUNDED' | 'CANCELLED' | null;
  assigned_to?: number | null;
  last_contacted_at?: string | null;
  project_vertical?: string | null;
  complexity_level?: string | null;
  currency?: 'MXN' | 'USD' | string | null;
  locale?: 'es' | 'en' | string | null;
  estimated_budget_min?: number | null;
  estimated_budget_max?: number | null;
  estimated_weeks_min?: number | null;
  estimated_weeks_max?: number | null;
  created_at: string;
  updated_at?: string;
}

export interface LeadPayment {
  id: number | string;
  lead_id: number | string;
  stripe_session_id: string;
  stripe_payment_intent_id?: string | null;
  payment_type: 'DEPOSIT_50' | 'CUSTOM';
  amount_cents: number;
  currency: 'USD' | 'MXN' | string;
  status: 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED';
  notes?: string | null;
  paid_at?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface LeadActivity {
  id: number | string;
  lead_id: number | string;
  user_id?: number | null;
  activity_type: 'STATUS_CHANGE' | 'NOTE' | 'EMAIL_SENT' | 'CALL_LOG' | 'MEETING_SCHEDULED';
  title: string;
  details?: string | null;
  created_at: string;
  author_name?: string | null;
  author_username?: string | null;
}

export const DEPOSIT_STATUS_CONFIG: Record<string, { label: string; badgeClass: string }> = {
  NONE: {
    label: 'Sin Anticipo',
    badgeClass: 'bg-slate-800/60 text-slate-400 border-slate-700',
  },
  PENDING: {
    label: 'Anticipo Pendiente',
    badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  },
  PAID: {
    label: 'Anticipo Cobrado (50%)',
    badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  },
  REFUNDED: {
    label: 'Reembolsado',
    badgeClass: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
  },
  CANCELLED: {
    label: 'Cancelado',
    badgeClass: 'bg-slate-800 text-slate-500 border-slate-700',
  },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; badgeClass: string }> = {
  NEW: {
    label: 'Nuevo',
    color: 'sky',
    badgeClass: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
  },
  CONTACTED: {
    label: 'Contactado',
    color: 'amber',
    badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  },
  QUALIFIED: {
    label: 'Calificado',
    color: 'indigo',
    badgeClass: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30',
  },
  PROPOSAL_SENT: {
    label: 'Propuesta',
    color: 'purple',
    badgeClass: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  },
  NEGOTIATION: {
    label: 'Negociación',
    color: 'pink',
    badgeClass: 'bg-pink-500/10 text-pink-400 border-pink-500/30',
  },
  WON: {
    label: 'Ganado',
    color: 'emerald',
    badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  },
  LOST: {
    label: 'Perdido',
    color: 'rose',
    badgeClass: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
  },
};

const TEMPLATE_OPTIONS = [
  {
    id: 'DIAGNOSTIC_INVITATION',
    title: 'Invitación a Diagnóstico Técnico',
    desc: 'Invita al prospecto a una llamada ejecutiva de 30 minutos sin costo.',
  },
  {
    id: 'PROPOSAL_SUBMITTED',
    title: 'Propuesta Comercial y Técnica',
    desc: 'Envía rangos de inversión proyectados y tiempos estimados calculados en el cotizador.',
  },
  {
    id: 'PAYMENT_LINK_INVITATION',
    title: 'Enlace de Anticipo / Formalización',
    desc: 'Envía el enlace seguro de Stripe Checkout para el anticipo del proyecto.',
  },
  {
    id: 'CUSTOM_FOLLOWUP',
    title: 'Seguimiento Personalizado',
    desc: 'Plantilla de comunicación directa con mensaje libre.',
  },
];

export const getStatusKey = (status?: string | null): string => {
  if (status && status in STATUS_CONFIG) {
    return status;
  }
  return 'NEW';
};

export const getStatusConfig = (status?: string | null) => {
  return STATUS_CONFIG[getStatusKey(status)];
};

export const getDepositStatusKey = (status?: string | null): string => {
  if (status && status in DEPOSIT_STATUS_CONFIG) {
    return status;
  }
  return 'NONE';
};

export const getDepositStatusConfig = (status?: string | null) => {
  return DEPOSIT_STATUS_CONFIG[getDepositStatusKey(status)];
};

interface LeadCrmPipelineProps {
  initialLeads?: LeadItem[];
}

export function LeadCrmPipeline({ initialLeads }: LeadCrmPipelineProps = {}) {
  const [leads, setLeads] = useState<LeadItem[]>(initialLeads || []);
  const [loading, setLoading] = useState(initialLeads === undefined);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  // Lead Details Modal State
  const [selectedLead, setSelectedLead] = useState<LeadItem | null>(null);
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [payments, setPayments] = useState<LeadPayment[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // New Activity Form State
  const [newActivityType, setNewActivityType] = useState<LeadActivity['activity_type']>('NOTE');
  const [newActivityTitle, setNewActivityTitle] = useState('');
  const [newActivityDetails, setNewActivityDetails] = useState('');
  const [submittingActivity, setSubmittingActivity] = useState(false);

  // Email Template Form State
  const [emailTemplateId, setEmailTemplateId] = useState<string>('DIAGNOSTIC_INVITATION');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailCustomMessage, setEmailCustomMessage] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);

  // Lead Checkout Payment Session Form State (FC 043 rev-2)
  const [paymentType, setPaymentType] = useState<'DEPOSIT_50' | 'CUSTOM'>('DEPOSIT_50');
  const [customAmount, setCustomAmount] = useState<string>('');
  const [paymentNotes, setPaymentNotes] = useState<string>('');
  const [generatingPayment, setGeneratingPayment] = useState(false);
  const [generatedPaymentUrl, setGeneratedPaymentUrl] = useState<string | null>(null);
  const [copiedPaymentLink, setCopiedPaymentLink] = useState(false);

  const loadLeads = useCallback(async () => {
    setLoading(true);
    try {
      const data = (await fetchAdminLeads({
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        search: searchQuery.trim() || undefined,
      })) as { leads: LeadItem[] };
      setLeads(data.leads);
    } catch (err) {
      setActionFeedback((err as Error)?.message || 'Error al cargar prospectos');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, searchQuery]);

  useEffect(() => {
    if (initialLeads !== undefined && statusFilter === 'ALL' && !searchQuery.trim()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLeads(initialLeads);
      setLoading(false);
      return;
    }
    loadLeads();
  }, [initialLeads, statusFilter, searchQuery, loadLeads]);

  const openLeadDrawer = async (lead: LeadItem) => {
    setSelectedLead(lead);
    setLoadingDetails(true);
    setNewActivityTitle('');
    setNewActivityDetails('');
    setEmailCustomMessage('');
    setEmailSubject('');
    setGeneratedPaymentUrl(null);
    setCopiedPaymentLink(false);
    setPaymentNotes('');
    setCustomAmount('');
    if (lead.estimated_budget_min && lead.estimated_budget_min > 0) {
      setPaymentType('DEPOSIT_50');
    } else {
      setPaymentType('CUSTOM');
    }

    try {
      const data = (await fetchAdminLeadDetails(lead.id)) as {
        lead: LeadItem & { activities?: LeadActivity[]; payments?: LeadPayment[] };
      };
      setSelectedLead(data.lead);
      setActivities(data.lead.activities || []);
      setPayments(data.lead.payments || []);
    } catch (err) {
      setActionFeedback((err as Error)?.message || 'Error al cargar expediente');
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleGenerateCheckoutSession = async (e: React.FormEvent) => {
    e.preventDefault();
    const lead = selectedLead!;

    setGeneratingPayment(true);
    setCopiedPaymentLink(false);
    try {
      const payload: {
        payment_type: 'DEPOSIT_50' | 'CUSTOM';
        custom_amount?: number;
        notes?: string;
      } = {
        payment_type: paymentType,
        notes: paymentNotes.trim() || undefined,
      };

      if (paymentType === 'CUSTOM') {
        const parsed = Number(customAmount);
        if (!parsed || isNaN(parsed) || parsed <= 0) {
          setActionFeedback('Ingresa un monto numérico válido mayor a cero.');
          setGeneratingPayment(false);
          return;
        }
        payload.custom_amount = parsed;
      }

      const result = (await createAdminLeadCheckoutSession(lead.id, payload)) as {
        status: string;
        checkout_url: string;
        session_id: string;
        amount: number;
        currency: string;
      };

      setGeneratedPaymentUrl(result.checkout_url);
      setActionFeedback(
        `Enlace de anticipo generado con éxito ($${result.amount.toLocaleString()} ${result.currency}).`,
      );

      const updated = (await fetchAdminLeadDetails(lead.id)) as {
        lead: LeadItem & { activities?: LeadActivity[]; payments?: LeadPayment[] };
      };
      setSelectedLead(updated.lead);
      setActivities(updated.lead.activities || []);
      setPayments(updated.lead.payments || []);
      loadLeads();
    } catch (err) {
      setActionFeedback((err as Error)?.message || 'Error al generar enlace de pago.');
    } finally {
      setGeneratingPayment(false);
    }
  };

  const handleCopyPaymentLink = async () => {
    try {
      await navigator.clipboard.writeText(generatedPaymentUrl!);
      setCopiedPaymentLink(true);
      setTimeout(() => setCopiedPaymentLink(false), 3000);
    } catch {
      setActionFeedback('No se pudo copiar el enlace al portapapeles.');
    }
  };

  const handleStatusChange = async (leadId: number | string, newStatus: string) => {
    try {
      await updateAdminLeadStatus(leadId, newStatus);
      setActionFeedback(`Estado actualizado a ${getStatusConfig(newStatus).label}`);
      loadLeads();
      if (selectedLead && selectedLead.id === leadId) {
        setSelectedLead({ ...selectedLead, status: newStatus as LeadItem['status'] });
        const updated = (await fetchAdminLeadDetails(leadId)) as {
          lead: { activities?: LeadActivity[] };
        };
        setActivities(updated.lead.activities || []);
      }
    } catch (err) {
      setActionFeedback((err as Error)?.message || 'Error al actualizar estado');
    }
  };

  const handleAddActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLead || !newActivityTitle.trim()) return;

    setSubmittingActivity(true);
    try {
      await addAdminLeadActivity(selectedLead.id, {
        activity_type: newActivityType,
        title: newActivityTitle.trim(),
        details: newActivityDetails.trim() || undefined,
      });
      setActionFeedback('Actividad registrada en la bitácora.');
      setNewActivityTitle('');
      setNewActivityDetails('');
      const updated = (await fetchAdminLeadDetails(selectedLead.id)) as {
        lead: { activities?: LeadActivity[] };
      };
      setActivities(updated.lead.activities || []);
    } catch (err) {
      setActionFeedback((err as Error)?.message || 'Error al registrar actividad.');
    } finally {
      setSubmittingActivity(false);
    }
  };

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    /* v8 ignore next */
    if (!selectedLead) return;

    setSendingEmail(true);
    try {
      await sendAdminLeadEmail(selectedLead.id, {
        template_id: emailTemplateId,
        subject: emailSubject.trim() || undefined,
        custom_message: emailCustomMessage.trim() || undefined,
      });
      setActionFeedback('Correo de seguimiento manual enviado con éxito.');
      setEmailCustomMessage('');
      setEmailSubject('');
      loadLeads();
      const updated = (await fetchAdminLeadDetails(selectedLead.id)) as {
        lead: { activities?: LeadActivity[] };
      };
      setActivities(updated.lead.activities || []);
    } catch (err) {
      setActionFeedback((err as Error)?.message || 'Error al enviar correo.');
    } finally {
      setSendingEmail(false);
    }
  };

  const getCleanWhatsappUrl = (phone?: string) => {
    if (!phone) return null;
    const digits = phone.replace(/\D/g, '');
    if (!digits) return null;
    return `https://wa.me/${digits}`;
  };

  const statusCounts = leads.reduce<Record<string, number>>((acc, l) => {
    const st = getStatusKey(l.status);
    acc[st] = (acc[st] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Feedback Banner */}
      {actionFeedback && (
        <div className="p-3 rounded-lg bg-cyan-950/40 border border-cyan-500/40 text-xs text-cyan-300 flex items-center justify-between">
          <span>{actionFeedback}</span>
          <button
            onClick={() => setActionFeedback(null)}
            className="text-cyan-400 hover:text-cyan-200 font-bold ml-4"
          >
            ✕
          </button>
        </div>
      )}

      {/* Control Bar: Filters & Search */}
      <GlassCard className="p-4 border-slate-700/50 bg-slate-900/50">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Status Pills */}
          <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                statusFilter === 'ALL'
                  ? 'bg-white/20 text-white border border-white/30'
                  : 'text-slate-400 hover:text-slate-200 bg-slate-800/40'
              }`}
            >
              Todos ({leads.length})
            </button>
            {Object.entries(STATUS_CONFIG).map(([stKey, cfg]) => {
              const count = statusCounts[stKey] || 0;
              const active = statusFilter === stKey;
              return (
                <button
                  key={stKey}
                  onClick={() => setStatusFilter(stKey)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                    active
                      ? `${cfg.badgeClass} ring-1 ring-white/20`
                      : 'border-slate-800 text-slate-400 hover:text-slate-200 bg-slate-900/60'
                  }`}
                >
                  {cfg.label} {count > 0 && <span className="ml-1 opacity-75">({count})</span>}
                </button>
              );
            })}
          </div>

          {/* Search Box */}
          <div className="flex items-center gap-2 min-w-[240px]">
            <input
              type="text"
              placeholder="Buscar por nombre, email o empresa..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-1.5 text-xs rounded-lg bg-slate-800/80 border border-slate-700 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
            />
          </div>
        </div>
      </GlassCard>

      {/* Leads Table / Grid */}
      <GlassCard className="p-6 border-slate-800 bg-slate-950/60">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-white tracking-wide">
              Pipeline Comercial & Gestión de Prospectos
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Plantillas de seguimiento manual bajo demanda y expediente técnico unificado.
            </p>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            Mostrando {leads.length} prospecto(s)
          </span>
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs text-slate-500">Cargando prospectos...</div>
        ) : leads.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-500">
            No hay prospectos registrados actualmente.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-2">ID</th>
                  <th className="px-2">Prospecto / Empresa</th>
                  <th className="px-2">Contacto & WhatsApp</th>
                  <th className="px-2">Cotización Paramétrica</th>
                  <th className="px-2">Estado Comercial</th>
                  <th className="px-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850">
                {leads.map((lead) => {
                  const currentStatus = getStatusKey(lead.status);
                  const statusCfg = STATUS_CONFIG[currentStatus];
                  const waUrl = getCleanWhatsappUrl(lead.phone);
                  return (
                    <tr key={lead.id} className="hover:bg-slate-900/50 transition-colors">
                      <td className="py-3 px-2 font-mono text-cyan-400 text-[11px]">#{lead.id}</td>
                      <td className="px-2">
                        <div className="font-semibold text-white">
                          {lead.full_name || lead.name || 'Sin nombre'}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {lead.company || lead.company_name || 'N/A'}
                        </div>
                      </td>
                      <td className="px-2">
                        <div className="text-slate-300">{lead.email}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[11px] text-slate-400 font-mono">
                            {lead.phone || 'Sin teléfono'}
                          </span>
                          {waUrl && (
                            <a
                              href={waUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30 font-medium"
                              title="Contactar vía WhatsApp"
                            >
                              WhatsApp ↗
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="px-2">
                        {lead.project_vertical ? (
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1">
                              <span className="inline-block px-1.5 py-0.2 rounded text-[10px] bg-slate-800 text-cyan-300 border border-slate-700">
                                {lead.project_vertical}
                              </span>
                              <span
                                className={`inline-block px-1 py-0.2 rounded text-[9px] font-mono font-bold ${
                                  lead.currency === 'USD'
                                    ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                }`}
                              >
                                {lead.currency || 'MXN'}
                              </span>
                            </div>
                            {lead.estimated_budget_min && lead.estimated_budget_max && (
                              <div className="text-[11px] text-slate-400 font-mono">
                                ${lead.estimated_budget_min.toLocaleString()} - $
                                {lead.estimated_budget_max.toLocaleString()}{' '}
                                {lead.currency || 'MXN'}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-500 text-[11px]">Estándar / Contacto</span>
                        )}
                      </td>
                      <td className="px-2">
                        <div className="space-y-1">
                          <select
                            value={currentStatus}
                            onChange={(e) => handleStatusChange(lead.id, e.target.value)}
                            className={`w-full px-2 py-1 rounded text-[11px] font-semibold border cursor-pointer bg-slate-900 ${statusCfg.badgeClass}`}
                          >
                            {Object.entries(STATUS_CONFIG).map(([k, cfg]) => (
                              <option key={k} value={k} className="bg-slate-900 text-slate-200">
                                {cfg.label}
                              </option>
                            ))}
                          </select>
                          {lead.deposit_status && lead.deposit_status !== 'NONE' && (
                            <span
                              className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold border ${
                                getDepositStatusConfig(lead.deposit_status).badgeClass
                              }`}
                            >
                              {getDepositStatusConfig(lead.deposit_status).label}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-2 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openLeadDrawer(lead)}
                          className="text-[11px] border-slate-700 hover:bg-slate-800 text-cyan-300"
                        >
                          Expediente ↗
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      {/* Expediente Modal / Drawer */}
      {selectedLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl bg-slate-900 border border-slate-700 p-6 space-y-6 shadow-2xl shadow-cyan-950/50">
            {/* Drawer Header */}
            <div className="flex items-start justify-between border-b border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-white">
                    {selectedLead.full_name || selectedLead.name || 'Prospecto'}
                  </h3>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase ${
                      getStatusConfig(selectedLead.status).badgeClass
                    }`}
                  >
                    {getStatusConfig(selectedLead.status).label}
                  </span>
                  {selectedLead.deposit_status && selectedLead.deposit_status !== 'NONE' && (
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase ${
                        getDepositStatusConfig(selectedLead.deposit_status).badgeClass
                      }`}
                    >
                      {getDepositStatusConfig(selectedLead.deposit_status).label}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Empresa:{' '}
                  <strong className="text-slate-200">{selectedLead.company || 'N/A'}</strong> ·
                  Email: <strong className="text-slate-200">{selectedLead.email}</strong>
                </p>
              </div>
              <button
                onClick={() => setSelectedLead(null)}
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-400 hover:text-white flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            {/* Lead Technical Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs bg-slate-950/60 p-4 rounded-xl border border-slate-800">
              <div>
                <span className="text-slate-500 block">Vertical Técnica</span>
                <span className="text-cyan-400 font-semibold">
                  {selectedLead.project_vertical || 'General'}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Complejidad</span>
                <span className="text-slate-300">
                  {selectedLead.complexity_level || 'Estándar'}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Presupuesto Proyectado</span>
                <span className="text-emerald-400 font-mono">
                  {selectedLead.estimated_budget_min && selectedLead.estimated_budget_max
                    ? `$${selectedLead.estimated_budget_min.toLocaleString()} - $${selectedLead.estimated_budget_max.toLocaleString()} ${selectedLead.currency || 'MXN'} [${(selectedLead.locale || 'es').toUpperCase()}]`
                    : 'N/A'}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Tiempo Estimado</span>
                <span className="text-purple-400 font-mono">
                  {selectedLead.estimated_weeks_min && selectedLead.estimated_weeks_max
                    ? `${selectedLead.estimated_weeks_min} - ${selectedLead.estimated_weeks_max} semanas`
                    : 'N/A'}
                </span>
              </div>
            </div>

            {/* Quick WhatsApp Link inside Modal */}
            {getCleanWhatsappUrl(selectedLead.phone) && (
              <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-xs">
                <span className="text-emerald-300">
                  Teléfono de contacto directo: <strong>{selectedLead.phone}</strong>
                </span>
                <a
                  href={getCleanWhatsappUrl(selectedLead.phone)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1 rounded bg-emerald-500 text-slate-950 font-bold hover:bg-emerald-400 transition-colors"
                >
                  Abrir WhatsApp Web ↗
                </a>
              </div>
            )}

            {/* Stripe B2B Deposit Payment Engine (FC 043 rev-2) */}
            <div className="p-5 rounded-xl bg-slate-950/80 border border-cyan-500/30 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
                  <h4 className="text-xs font-bold text-cyan-300 uppercase tracking-wider">
                    Motor de Anticipos & Cobros B2B (Stripe Checkout)
                  </h4>
                </div>
                <span className="text-[10px] text-cyan-400 bg-cyan-950/60 px-2.5 py-0.5 rounded border border-cyan-800/50 font-mono">
                  Divisa: {selectedLead.currency || 'USD'}
                </span>
              </div>

              <form onSubmit={handleGenerateCheckoutSession} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      paymentType === 'DEPOSIT_50'
                        ? 'border-cyan-500 bg-cyan-950/30 text-white'
                        : 'border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="leadPaymentType"
                      value="DEPOSIT_50"
                      checked={paymentType === 'DEPOSIT_50'}
                      onChange={() => setPaymentType('DEPOSIT_50')}
                      className="sr-only"
                    />
                    <div className="font-semibold text-xs text-cyan-300">
                      Anticipo 50% de Cotización
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1">
                      {selectedLead.estimated_budget_min &&
                      selectedLead.estimated_budget_min > 0 ? (
                        <span className="font-mono text-emerald-400 font-bold">
                          ${Math.round(selectedLead.estimated_budget_min * 0.5).toLocaleString()}{' '}
                          {selectedLead.currency || 'USD'}
                        </span>
                      ) : (
                        <span className="text-amber-400">
                          Sin presupuesto mínimo base (requiere monto libre)
                        </span>
                      )}
                    </div>
                  </label>

                  <label
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      paymentType === 'CUSTOM'
                        ? 'border-cyan-500 bg-cyan-950/30 text-white'
                        : 'border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="leadPaymentType"
                      value="CUSTOM"
                      checked={paymentType === 'CUSTOM'}
                      onChange={() => setPaymentType('CUSTOM')}
                      className="sr-only"
                    />
                    <div className="font-semibold text-xs text-purple-300">Monto Personalizado</div>
                    <div className="text-[11px] text-slate-400 mt-1">
                      Definir monto manual según acuerdos comerciales
                    </div>
                  </label>
                </div>

                {paymentType === 'CUSTOM' && (
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">
                      Monto a Cobrar ({selectedLead.currency || 'USD'})
                    </label>
                    <input
                      type="number"
                      min={selectedLead.currency === 'MXN' ? 500 : 50}
                      max={selectedLead.currency === 'MXN' ? 500000 : 30000}
                      step="1"
                      placeholder={selectedLead.currency === 'MXN' ? 'Ej. 15000' : 'Ej. 1000'}
                      value={customAmount}
                      onChange={(e) => setCustomAmount(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg bg-slate-900 border border-slate-700 text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                    />
                    <span className="text-[10px] text-slate-500 mt-0.5 block">
                      Límites:{' '}
                      {selectedLead.currency === 'MXN'
                        ? '$500 a $500,000 MXN'
                        : '$50 a $30,000 USD'}
                    </span>
                  </div>
                )}

                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">
                    Notas Internas / Concepto (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Anticipo Fase 1 de Arquitectura y Auditoría"
                    value={paymentNotes}
                    onChange={(e) => setPaymentNotes(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-lg bg-slate-900 border border-slate-700 text-slate-200 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={
                    generatingPayment ||
                    (paymentType === 'DEPOSIT_50' &&
                      (!selectedLead.estimated_budget_min ||
                        selectedLead.estimated_budget_min <= 0))
                  }
                  className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-950/50"
                >
                  {generatingPayment
                    ? 'Generando Sesión Segura en Stripe...'
                    : 'Generar Enlace de Anticipo vía Stripe Checkout 💳'}
                </Button>
              </form>

              {/* Generated Link Display */}
              {generatedPaymentUrl && (
                <div className="p-3.5 rounded-lg bg-slate-900 border border-cyan-500/40 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-cyan-300">
                      Enlace de Pago Generado (Válido por 72h)
                    </span>
                    <span className="text-[10px] text-emerald-400 font-medium">Activo ✓</span>
                  </div>
                  <input
                    type="text"
                    readOnly
                    value={generatedPaymentUrl}
                    className="w-full px-2.5 py-1.5 text-[11px] rounded bg-slate-950 border border-slate-800 text-slate-300 font-mono select-all focus:outline-none"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCopyPaymentLink}
                      className="px-3 py-1 rounded text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold transition-colors border border-slate-700"
                    >
                      {copiedPaymentLink ? 'Copiado al Portapapeles ✓' : 'Copiar Enlace 📋'}
                    </button>
                    {selectedLead.phone && (
                      <a
                        href={`https://wa.me/${selectedLead.phone.replace(/\D/g, '')}?text=${encodeURIComponent(
                          `Hola ${selectedLead.full_name || ''}, te comparto tu enlace de anticipo y formalización para el proyecto en Dreamtek: ${generatedPaymentUrl}`,
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1 rounded text-xs bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold transition-colors"
                      >
                        Enviar por WhatsApp ↗
                      </a>
                    )}
                    <a
                      href={generatedPaymentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1 rounded text-xs bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold transition-colors"
                    >
                      Abrir Checkout ↗
                    </a>
                  </div>
                </div>
              )}

              {/* Payments History in Drawer */}
              {payments && payments.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-slate-800/80">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                    Historial de Pagos de Anticipo ({payments.length})
                  </span>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {payments.map((p) => (
                      <div
                        key={p.id}
                        className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800 flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-white">
                              ${(p.amount_cents / 100).toLocaleString()} {p.currency}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              ({p.payment_type === 'DEPOSIT_50' ? 'Anticipo 50%' : 'Personalizado'})
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-500 font-mono block">
                            Sesión: {p.stripe_session_id.substring(0, 18)}...
                          </span>
                        </div>
                        <div className="text-right">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                              p.status === 'PAID'
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                : p.status === 'PENDING'
                                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                  : 'bg-slate-800 text-slate-400 border-slate-700'
                            }`}
                          >
                            {p.status}
                          </span>
                          <span className="text-[10px] text-slate-500 block mt-0.5">
                            {new Date(p.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Actions: Send Email & Add Note Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Manual Email Dispatcher (C-041.1) */}
              <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-cyan-300 uppercase tracking-wider">
                    Plantillas de Seguimiento Manual
                  </h4>
                  <span className="text-[10px] text-slate-500 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                    On-Click
                  </span>
                </div>
                <form onSubmit={handleSendEmail} className="space-y-3">
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">
                      Seleccionar Plantilla
                    </label>
                    <select
                      value={emailTemplateId}
                      onChange={(e) => setEmailTemplateId(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs rounded-lg bg-slate-900 border border-slate-700 text-slate-200 focus:outline-none focus:border-cyan-500"
                    >
                      {TEMPLATE_OPTIONS.map((tmpl) => (
                        <option key={tmpl.id} value={tmpl.id}>
                          {tmpl.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">
                      Asunto Personalizado (Opcional)
                    </label>
                    <input
                      type="text"
                      placeholder="Dejar vacío para asunto predeterminado"
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs rounded-lg bg-slate-900 border border-slate-700 text-slate-200 focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">
                      Nota o Mensaje Adicional (Opcional)
                    </label>
                    <textarea
                      rows={2}
                      placeholder="Mensaje personalizado incluido en la plantilla..."
                      value={emailCustomMessage}
                      onChange={(e) => setEmailCustomMessage(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs rounded-lg bg-slate-900 border border-slate-700 text-slate-200 focus:outline-none focus:border-cyan-500 resize-none"
                    />
                  </div>

                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={sendingEmail}
                    className="w-full bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs"
                  >
                    {sendingEmail ? 'Despachando Correo...' : 'Despachar Correo de Seguimiento ✉'}
                  </Button>
                </form>
              </div>

              {/* Add Activity Note */}
              <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800 space-y-3">
                <h4 className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                  Registrar Actividad Comercial
                </h4>
                <form onSubmit={handleAddActivity} className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">Tipo</label>
                      <select
                        value={newActivityType}
                        onChange={(e) =>
                          setNewActivityType(e.target.value as LeadActivity['activity_type'])
                        }
                        className="w-full px-3 py-1.5 text-xs rounded-lg bg-slate-900 border border-slate-700 text-slate-200 focus:outline-none focus:border-cyan-500"
                      >
                        <option value="NOTE">Nota Interna</option>
                        <option value="CALL_LOG">Llamada</option>
                        <option value="MEETING_SCHEDULED">Reunión Agendada</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">Título</label>
                      <input
                        type="text"
                        placeholder="Ej. Llamada de diagnóstico"
                        value={newActivityTitle}
                        onChange={(e) => setNewActivityTitle(e.target.value)}
                        required
                        className="w-full px-3 py-1.5 text-xs rounded-lg bg-slate-900 border border-slate-700 text-slate-200 focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">
                      Detalles de la interacción
                    </label>
                    <textarea
                      rows={2}
                      placeholder="Resumen de acuerdos, dudas o próximos pasos..."
                      value={newActivityDetails}
                      onChange={(e) => setNewActivityDetails(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs rounded-lg bg-slate-900 border border-slate-700 text-slate-200 focus:outline-none focus:border-cyan-500 resize-none"
                    />
                  </div>

                  <Button
                    type="submit"
                    variant="outline"
                    size="sm"
                    disabled={submittingActivity || !newActivityTitle.trim()}
                    className="w-full border-amber-500/40 text-amber-300 hover:bg-amber-500/10 font-bold text-xs"
                  >
                    {submittingActivity ? 'Guardando...' : 'Guardar en Bitácora 📝'}
                  </Button>
                </form>
              </div>
            </div>

            {/* Timeline of Activities */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Línea de Tiempo de Interacciones ({activities.length})
              </h4>
              {loadingDetails ? (
                <p className="text-xs text-slate-500">Cargando actividades...</p>
              ) : activities.length === 0 ? (
                <p className="text-xs text-slate-500 py-3">Sin actividades registradas aún.</p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {activities.map((act) => (
                    <div
                      key={act.id}
                      className="p-3 rounded-lg bg-slate-950/70 border border-slate-800 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-cyan-400 border border-slate-700">
                            {act.activity_type}
                          </span>
                          <span className="font-semibold text-white">{act.title}</span>
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {new Date(act.created_at).toLocaleString()}
                        </span>
                      </div>
                      {act.details && <p className="text-slate-400 text-[11px]">{act.details}</p>}
                      {act.author_name && (
                        <span className="text-[10px] text-slate-500 block">
                          Registrado por: {act.author_name}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
