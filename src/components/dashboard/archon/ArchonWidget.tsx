'use client';

import React, { useState } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { fetchArchonBridgeUrl } from '@/lib/auth/client';

interface ArchonWidgetProps {
  hasActivePlan?: boolean;
  onUpgrade?: () => void;
}

export function ArchonWidget({ hasActivePlan = false, onUpgrade }: ArchonWidgetProps) {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleOpenArchon = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetchArchonBridgeUrl();
      if (res.url) {
        window.open(res.url, '_blank', 'noopener,noreferrer');
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Error al conectar con la plataforma ARCHON.';
      setErrorMsg(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <GlassCard className="p-6 relative overflow-hidden border-purple-500/20 bg-slate-900/40 backdrop-blur-xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
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
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-bold text-white tracking-wide">
              ARCHON — Plataforma ERP de Flotas
            </h3>
            <p className="text-xs text-slate-400">
              Telemetría de unidades · Ledger de gastos · Puente seguro HMAC (300s TTL)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-slate-800/60 px-3 py-1.5 rounded-full border border-slate-700/50">
          <span
            className={`w-2 h-2 rounded-full ${
              hasActivePlan ? 'bg-purple-400 animate-pulse' : 'bg-slate-500'
            }`}
          />
          <span className="text-xs font-semibold text-slate-300">
            {hasActivePlan ? 'Instancia Activa' : 'Módulo Opcional'}
          </span>
        </div>
      </div>

      <div className="mt-6">
        {hasActivePlan ? (
          <div className="p-5 rounded-xl bg-purple-950/20 border border-purple-500/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-purple-200">
                Tu infraestructura ARCHON está operativa
              </h4>
              <p className="text-xs text-slate-400">
                Acceso federado mediante firma temporal HMAC anti-repetición hacia tu nodo dedicado.
              </p>
              {errorMsg && <p className="text-xs text-red-400 mt-1">{errorMsg}</p>}
            </div>

            <Button
              variant="primary"
              size="sm"
              onClick={handleOpenArchon}
              disabled={loading}
              className="bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-500/20 whitespace-nowrap"
            >
              {loading ? 'Generando Enlace...' : 'Entrar al ERP ARCHON ↗'}
            </Button>
          </div>
        ) : (
          <div className="p-5 rounded-xl bg-slate-800/30 border border-slate-700/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-slate-200">
                ¿Operas flotillas comerciales o transporte?
              </h4>
              <p className="text-xs text-slate-400">
                Integra control total de bitácoras, consumo de combustible y finanzas operativas con
                ARCHON.
              </p>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={onUpgrade}
              className="border-purple-500/40 text-purple-300 hover:bg-purple-500/10 whitespace-nowrap"
            >
              Solicitar Demostración Bespoke
            </Button>
          </div>
        )}
      </div>
    </GlassCard>
  );
}
