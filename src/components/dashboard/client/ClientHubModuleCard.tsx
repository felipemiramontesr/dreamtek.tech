'use client';

import React from 'react';
import Link from 'next/link';

export type ModuleCardId =
  'escolta' | 'archon' | 'cyber' | 'projects' | 'billing' | 'security' | 'support';

export interface ClientHubModuleCardProps {
  id: ModuleCardId;
  title: string;
  description: string;
  icon: React.ReactNode;
  href: string;
  badge: {
    text: string;
    variant: 'emerald' | 'cyan' | 'amber' | 'slate' | 'red';
  };
  metrics?: Array<{ label: string; value: string | number }>;
  isContracted: boolean;
  ctaText?: string;
  actionButton?: {
    text: string;
    onClick: () => void;
  };
}

export function ClientHubModuleCard({
  id,
  title,
  description,
  icon,
  href,
  badge,
  metrics = [],
  isContracted,
  ctaText,
  actionButton,
}: ClientHubModuleCardProps) {
  const badgeStyles = badge
    ? {
        emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
        cyan: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
        amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
        slate: 'bg-slate-700/30 text-slate-400 border-slate-700/50',
        red: 'bg-red-500/10 text-red-400 border-red-500/20',
      }[badge.variant]
    : '';

  return (
    <div
      data-testid={`hub-card-${id}`}
      className={`group relative flex flex-col justify-between rounded-xl border transition-all duration-300 p-5 shadow-lg ${
        isContracted
          ? 'bg-slate-900/60 border-slate-800 hover:border-cyan-500/40 hover:bg-slate-900/80 hover:-translate-y-1'
          : 'bg-slate-900/30 border-slate-800/60 opacity-90 hover:border-slate-700 hover:bg-slate-900/50'
      }`}
    >
      <div>
        {/* Cabecera de la tarjeta: Icono y Badge de Estado */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 group-hover:scale-105 transition-transform">
            {icon}
          </div>
          {badge && (
            <span
              className={`text-[10px] font-semibold tracking-wider uppercase px-2.5 py-1 rounded-full border ${badgeStyles}`}
            >
              {badge.text}
            </span>
          )}
        </div>

        {/* Título y Descripción */}
        <h3 className="text-base font-bold text-white group-hover:text-cyan-300 transition-colors mb-1.5">
          {title}
        </h3>
        <p className="text-xs text-slate-400 leading-relaxed mb-4 min-h-[36px]">{description}</p>

        {/* Micro-métricas del módulo */}
        {metrics.length > 0 && (
          <div className="grid grid-cols-2 gap-2 mb-4 p-2.5 rounded-lg bg-slate-950/40 border border-white/5">
            {metrics.map((m, idx) => (
              <div key={idx} className="flex flex-col">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider">
                  {m.label}
                </span>
                <span className="text-xs font-semibold text-slate-200 font-mono truncate">
                  {m.value}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Botones de Acción */}
      <div className="mt-2 pt-3 border-t border-white/5 flex items-center justify-between gap-2">
        <Link
          href={href}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-400 hover:text-cyan-300 transition-colors py-1.5"
        >
          {ctaText || (isContracted ? 'Abrir espacio →' : 'Ver alcance →')}
        </Link>

        {actionButton && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              actionButton.onClick();
            }}
            className="text-[11px] font-medium text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700 px-2.5 py-1 rounded-md border border-slate-700 transition-all cursor-pointer"
          >
            {actionButton.text}
          </button>
        )}
      </div>
    </div>
  );
}
