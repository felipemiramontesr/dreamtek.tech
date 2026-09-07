'use client';

import React, { useEffect, useState } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { fetchAdminLeads, fetchAdminAuditLogs } from '@/lib/auth/client';
import { LeadCrmPipeline, LeadItem } from './LeadCrmPipeline';

interface OmnipotentAdminPanelProps {
  adminName?: string;
  totalSites?: number;
  totalServices?: number;
  onViewAsClient?: () => void;
}

interface AuditLogItem {
  id: string | number;
  event_type: string;
  ip_address?: string;
  user_agent?: string;
  payload_sha256?: string;
  created_at: string;
}

export function OmnipotentAdminPanel({
  adminName = 'GrayMan',
  totalSites = 0,
  totalServices = 0,
  onViewAsClient,
}: OmnipotentAdminPanelProps) {
  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [_loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'leads' | 'security'>('overview');

  useEffect(() => {
    let mounted = true;
    async function loadAdminData() {
      try {
        const [leadsData, logsData] = await Promise.all([
          fetchAdminLeads().catch(() => ({ leads: [] })),
          fetchAdminAuditLogs(1, 10).catch(() => ({ logs: [] })),
        ]);
        if (mounted) {
          setLeads((leadsData as { leads?: LeadItem[] })?.leads || []);
          setAuditLogs((logsData as { logs?: AuditLogItem[] })?.logs || []);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadAdminData();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      {/* Header Soberano Omnipotente */}
      <GlassCard className="p-6 border-amber-500/30 bg-gradient-to-r from-amber-950/30 via-slate-900/60 to-slate-900/40 backdrop-blur-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-slate-950 font-black shadow-lg shadow-amber-500/20 text-xl">
              Ω
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white tracking-wide">
                  Panel de Control Omnipotente
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wider uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  SUPERADMIN · {adminName}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Visión y gobierno unificado de infraestructura, clientes y seguridad de Dreamtek.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={onViewAsClient}
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              Previsualizar Vista Cliente ↗
            </Button>
          </div>
        </div>

        {/* Métricas Globales */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/50">
            <span className="text-xs text-slate-400 font-medium">Sitios Aprovisionados</span>
            <p className="text-2xl font-black text-cyan-400 mt-1">{totalSites}</p>
          </div>
          <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/50">
            <span className="text-xs text-slate-400 font-medium">Suscripciones Activas</span>
            <p className="text-2xl font-black text-emerald-400 mt-1">{totalServices}</p>
          </div>
          <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/50">
            <span className="text-xs text-slate-400 font-medium">Prospectos / Leads</span>
            <p className="text-2xl font-black text-purple-400 mt-1">{leads.length}</p>
          </div>
          <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/50">
            <span className="text-xs text-slate-400 font-medium">Eventos de Seguridad</span>
            <p className="text-2xl font-black text-amber-400 mt-1">{auditLogs.length}</p>
          </div>
        </div>
      </GlassCard>

      {/* Navegación por pestañas de gestión */}
      <div className="flex items-center gap-2 border-b border-white/10 pb-2">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
            activeTab === 'overview'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Resumen Ejecutivo
        </button>
        <button
          onClick={() => setActiveTab('leads')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
            activeTab === 'leads'
              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Prospectos ({leads.length})
        </button>
        <button
          onClick={() => setActiveTab('security')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
            activeTab === 'security'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Bitácora Forense ({auditLogs.length})
        </button>
      </div>

      {/* Contenido de pestañas */}
      {activeTab === 'leads' && <LeadCrmPipeline initialLeads={leads} />}

      {activeTab === 'security' && (
        <GlassCard className="p-6 border-amber-500/20 bg-slate-900/40">
          <h3 className="text-base font-bold text-white mb-4">
            Auditoría de Seguridad y Eventos Forenses
          </h3>
          {auditLogs.length === 0 ? (
            <p className="text-xs text-slate-400">No hay eventos de seguridad registrados.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="border-b border-slate-700 text-slate-400 uppercase text-[10px]">
                  <tr>
                    <th className="py-2.5">Evento</th>
                    <th>Dirección IP</th>
                    <th>User Agent</th>
                    <th>Hash Criptográfico</th>
                    <th>Fecha</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 font-mono text-[11px]">
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-800/30">
                      <td className="py-2 text-amber-400 font-sans font-medium">
                        {log.event_type}
                      </td>
                      <td>{log.ip_address || '127.0.0.1'}</td>
                      <td className="truncate max-w-[200px] text-slate-400">{log.user_agent}</td>
                      <td className="text-slate-500 truncate max-w-[120px]">
                        {log.payload_sha256}
                      </td>
                      <td className="text-slate-400 font-sans">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </GlassCard>
      )}

      {activeTab === 'overview' && (
        <div className="p-4 rounded-xl bg-slate-800/20 border border-slate-700/40 text-xs text-slate-400 flex items-center justify-between">
          <span>
            Control global activo: los clientes visualizan sus módulos asignados de acuerdo con su
            perfil RBAC.
          </span>
          <span className="text-emerald-400 font-medium">✓ Sistema en Óptimas Condiciones</span>
        </div>
      )}
    </div>
  );
}
