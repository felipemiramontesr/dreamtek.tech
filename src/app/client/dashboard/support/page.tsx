'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { fetchClientDashboard, type ClientDashboardData } from '@/lib/auth/client';
import {
  DashboardSubpageHeader,
  getUserDisplayName,
} from '@/components/dashboard/client/DashboardSubpageHeader';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';

export default function SupportSubpage() {
  const router = useRouter();
  const [data, setData] = useState<ClientDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(() => {
    fetchClientDashboard()
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch(() => {
        router.push('/');
      });
  }, [router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading || !data) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
        <div className="w-10 h-10 border-4 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin" />
      </div>
    );
  }

  const { profile } = data;
  const userIdentifier = `DTK-USR-${profile.id}`;

  const handleOpenTicketEmail = () => {
    const subject = encodeURIComponent(`[Soporte DTK] Solicitud de Asistencia - ${userIdentifier}`);
    const body = encodeURIComponent(
      `Hola equipo de Ingeniería Dreamtek,\n\n` +
        `ID de Cuenta: ${userIdentifier}\n` +
        `Cliente: ${getUserDisplayName(profile)}\n` +
        `Correo: ${profile.email}\n\n` +
        `Descripción del Requerimiento o Incidencia:\n` +
        `[Por favor detalla aquí el requerimiento, URL afectada o cambio deseado]\n\n` +
        `Prioridad estimada: [Baja / Media / Urgente]\n`,
    );
    window.open(`mailto:soporte@dreamtek.tech?subject=${subject}&body=${body}`, '_blank');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <DashboardSubpageHeader
        currentModule="support"
        userName={getUserDisplayName(profile)}
        userEmail={profile.email}
      />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">
            Mesa de Ayuda & Soporte de Ingeniería
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Canal directo con el equipo técnico de Dreamtek para soporte preventivo, cambios de
            código y resolución de incidencias.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Tarjeta 1: Crear Solicitud */}
          <GlassCard className="p-6 md:col-span-2 space-y-5 border-slate-800 bg-slate-900/60">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                  />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Emitir Solicitud de Soporte</h2>
                <p className="text-xs text-slate-400">
                  Genera una solicitud vinculada a tu cuenta con trazabilidad técnica.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-slate-950/50 border border-white/5 space-y-2 text-xs text-slate-300">
              <p className="font-semibold text-white">¿Qué incluye tu cobertura?</p>
              <ul className="list-disc pl-5 space-y-1 text-slate-400">
                <li>
                  3 horas mensuales de modificaciones de código, diseño o contenido (Escolta WEB).
                </li>
                <li>
                  Monitoreo de certificados SSL, renovación de dominios y parches de seguridad.
                </li>
                <li>Respaldo perimetral y mitigación de caídas de servicio.</li>
              </ul>
            </div>

            <Button
              variant="primary"
              onClick={handleOpenTicketEmail}
              className="bg-cyan-600 hover:bg-cyan-500 text-white font-semibold py-2.5 px-6 rounded-lg text-sm cursor-pointer shadow-lg shadow-cyan-900/20"
            >
              Abrir Ticket en soporte@dreamtek.tech →
            </Button>
          </GlassCard>

          {/* Tarjeta 2: SLAs y Canal de Emergencia */}
          <GlassCard className="p-6 space-y-4 border-slate-800 bg-slate-900/60">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider text-slate-300">
              SLAs de Atención
            </h3>
            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-lg bg-slate-950/40 border border-white/5">
                <span className="text-[10px] text-emerald-400 font-semibold uppercase block">
                  Crítico / Caída
                </span>
                <span className="text-white font-medium">Respuesta &lt; 2 horas</span>
              </div>
              <div className="p-3 rounded-lg bg-slate-950/40 border border-white/5">
                <span className="text-[10px] text-cyan-400 font-semibold uppercase block">
                  Cambios de Contenido
                </span>
                <span className="text-white font-medium">Resolución en 24-48 horas hábiles</span>
              </div>
              <div className="p-3 rounded-lg bg-slate-950/40 border border-white/5">
                <span className="text-[10px] text-slate-400 font-semibold uppercase block">
                  Consultoría / Nuevos Alcances
                </span>
                <span className="text-white font-medium">
                  Atención en horario hábil (9:00 - 18:00 CST)
                </span>
              </div>
            </div>
          </GlassCard>
        </div>
      </main>
    </div>
  );
}
