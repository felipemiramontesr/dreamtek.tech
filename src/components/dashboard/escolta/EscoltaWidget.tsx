'use client';

import React from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';

interface SiteItem {
  id: number;
  domain: string;
  status: string;
  ssl?: boolean | number | string;
  ssl_status?: string;
}

interface EscoltaWidgetProps {
  sites?: SiteItem[];
  supportHoursAvailable?: number;
  onRequestSupport?: () => void;
}

export function EscoltaWidget({
  sites = [],
  supportHoursAvailable = 3,
  onRequestSupport,
}: EscoltaWidgetProps) {
  return (
    <GlassCard className="p-6 relative overflow-hidden border-cyan-500/20 bg-slate-900/40 backdrop-blur-xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
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
                d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-bold text-white tracking-wide">
              Escolta WEB — Sitios & Presencia Digital
            </h3>
            <p className="text-xs text-slate-400">
              Infraestructura gestionada · Sondeo continuo DNS/SSL
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-slate-800/60 px-3 py-1.5 rounded-full border border-slate-700/50">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-semibold text-slate-300">
            Soporte: {supportHoursAvailable}h disponibles / mes
          </span>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {sites.length === 0 ? (
          <div className="p-6 rounded-xl bg-slate-800/30 border border-dashed border-slate-700 text-center">
            <p className="text-sm text-slate-300">No hay sitios registrados aún.</p>
            <p className="text-xs text-slate-500 mt-1">
              Tu sitio se aprovisionará automáticamente al completar tu orden de Escolta WEB.
            </p>
          </div>
        ) : (
          sites.map((site) => (
            <div
              key={site.id}
              className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/50 hover:border-cyan-500/30 transition-all duration-200 flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-cyan-300">
                    {site.domain}
                  </span>
                  <span
                    className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                      site.status === 'live'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                        : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                    }`}
                  >
                    {site.status === 'live' ? 'En Producción' : 'En Desarrollo'}
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Estado SSL:{' '}
                  <span className="text-slate-300 font-mono">
                    {String(site.ssl_status || site.ssl || 'ACTIVO')}
                  </span>{' '}
                  <span className="text-[10px] text-slate-500">(Sondeo local)</span>
                </p>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={`https://${site.domain}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs px-3 py-1.5 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-200 font-medium transition-colors"
                >
                  Visitar Sitio ↗
                </a>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-6 pt-4 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3">
        <span className="text-xs text-slate-400">
          ¿Necesitas cambios de contenido o ajustes técnicos en tu web?
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={onRequestSupport}
          className="border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/10"
        >
          Solicitar Soporte Técnico
        </Button>
      </div>
    </GlassCard>
  );
}
