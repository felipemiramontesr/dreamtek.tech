'use client';

import React from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';

interface CyberAuditWidgetProps {
  hasActiveAudit?: boolean;
  onRequestAudit?: () => void;
}

export function CyberAuditWidget({
  hasActiveAudit = false,
  onRequestAudit,
}: CyberAuditWidgetProps) {
  return (
    <GlassCard className="p-6 relative overflow-hidden border-rose-500/20 bg-slate-900/40 backdrop-blur-xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-bold text-white tracking-wide">
              Ciberseguridad Ofensiva & Auditoría Forense
            </h3>
            <p className="text-xs text-slate-400">
              Evaluación de postura defensiva · Pentesting Caja Negra/Gris · Informes ejecutivos
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-slate-800/60 px-3 py-1.5 rounded-full border border-slate-700/50">
          <span
            className={`w-2 h-2 rounded-full ${
              hasActiveAudit ? 'bg-rose-400 animate-pulse' : 'bg-slate-500'
            }`}
          />
          <span className="text-xs font-semibold text-slate-300">
            {hasActiveAudit ? 'Auditoría en Curso' : 'Módulo por Demanda'}
          </span>
        </div>
      </div>

      <div className="mt-6">
        {hasActiveAudit ? (
          <div className="p-5 rounded-xl bg-rose-950/20 border border-rose-500/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-rose-200">
                Diagnóstico de seguridad en ejecución
              </h4>
              <p className="text-xs text-slate-400">
                Nuestros ingenieros forenses están analizando vectores de superficie. Tu informe
                estará disponible para descarga cifrada al finalizar.
              </p>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={onRequestAudit}
              className="border-rose-500/40 text-rose-300 hover:bg-rose-500/10 whitespace-nowrap"
            >
              Consultar Estado Táctico
            </Button>
          </div>
        ) : (
          <div className="p-5 rounded-xl bg-slate-800/30 border border-slate-700/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-slate-200">
                Protege tu infraestructura crítica
              </h4>
              <p className="text-xs text-slate-400">
                Detecta y neutraliza vulnerabilidades antes de que sean explotadas con nuestro
                análisis ofensivo profesional.
              </p>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={onRequestAudit}
              className="border-rose-500/40 text-rose-300 hover:bg-rose-500/10 whitespace-nowrap"
            >
              Solicitar Auditoría Táctica ($1,800 USD)
            </Button>
          </div>
        )}
      </div>
    </GlassCard>
  );
}
