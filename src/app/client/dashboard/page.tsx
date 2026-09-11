'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { fetchClientDashboard, logoutUser, type ClientDashboardData } from '@/lib/auth/client';
import { EscoltaWidget } from '@/components/dashboard/escolta/EscoltaWidget';
import { ArchonWidget } from '@/components/dashboard/archon/ArchonWidget';
import { CyberAuditWidget } from '@/components/dashboard/cyber/CyberAuditWidget';
import { B2BProjectWorkspaceWidget } from '@/components/dashboard/client/B2BProjectWorkspaceWidget';
import { ClientTaxProfileWidget } from '@/components/dashboard/client/ClientTaxProfileWidget';
import { OmnipotentAdminPanel } from '@/components/dashboard/admin/OmnipotentAdminPanel';

export default function ClientDashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<ClientDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'client' | 'admin'>('client');

  useEffect(() => {
    let isMounted = true;
    async function loadDashboard() {
      try {
        const res = await fetchClientDashboard();
        if (isMounted) {
          setData(res);
          if (res?.profile?.role === 'ADMIN') {
            setViewMode('admin');
          }
        }
      } catch (err: unknown) {
        if (isMounted) {
          const message =
            err instanceof Error ? err.message : 'No se pudo cargar el panel de control.';
          setError(message);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadDashboard();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleLogout = async () => {
    try {
      await logoutUser();
      router.push('/');
    } catch {
      router.push('/');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin mx-auto" />
          <p className="text-sm text-slate-400 font-medium">
            Verificando credenciales de sesión...
          </p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
        <GlassCard className="max-w-md w-full p-8 text-center space-y-6 border-red-500/30 bg-slate-900/80">
          <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 flex items-center justify-center mx-auto text-xl font-bold">
            !
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Acceso Restringido</h2>
            <p className="text-xs text-slate-400 mt-2">
              {error || 'Debes iniciar sesión para acceder a tu área de clientes de Dreamtek.'}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              variant="primary"
              size="sm"
              onClick={() => router.push('/')}
              className="bg-cyan-600 hover:bg-cyan-500"
            >
              Ir al Inicio de Dreamtek
            </Button>
          </div>
        </GlassCard>
      </div>
    );
  }

  const { profile, services = [], sites = [], projects = [] } = data;
  const isAdmin = profile.role === 'ADMIN';
  const hasArchon = services.some((s) => s.name?.toLowerCase().includes('archon')) || isAdmin;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Barra de Navegación Superior del Dashboard */}
      <header className="border-b border-white/10 bg-slate-900/60 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span
              onClick={() => router.push('/')}
              className="cursor-pointer text-lg font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 hover:opacity-90 transition-opacity"
            >
              DREAMTEK<span className="text-cyan-400">.</span>TECH
            </span>
            <span className="text-xs text-slate-500 font-mono hidden sm:inline">
              / client-portal
            </span>
          </div>

          <div className="flex items-center gap-4">
            {isAdmin && (
              <div className="flex items-center bg-slate-800/80 p-1 rounded-lg border border-slate-700">
                <button
                  onClick={() => setViewMode('admin')}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                    viewMode === 'admin'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Omnipotente (Admin)
                </button>
                <button
                  onClick={() => setViewMode('client')}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                    viewMode === 'client'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Vista Cliente
                </button>
              </div>
            )}

            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-semibold text-white">
                  {profile.full_name || profile.username || 'Usuario Dreamtek'}
                </p>
                <p className="text-[10px] text-slate-400">{profile.email}</p>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={handleLogout}
                className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
              >
                Cerrar Sesión
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Contenido Principal */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {isAdmin && viewMode === 'admin' ? (
          <OmnipotentAdminPanel
            adminName={profile.username || profile.full_name || 'GrayMan'}
            totalSites={sites.length}
            totalServices={services.length}
            onViewAsClient={() => setViewMode('client')}
          />
        ) : (
          <div className="space-y-8">
            {/* Header de bienvenida cliente */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-black text-white tracking-tight">
                  Hola,{' '}
                  <span className="text-cyan-400">
                    {profile.full_name || profile.username || 'Cliente'}
                  </span>
                </h1>
                <p className="text-xs text-slate-400 mt-1">
                  Gestiona tu infraestructura digital, sitios web aprovisionados y plataformas
                  activas.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">ID de Cuenta:</span>
                <span className="font-mono text-xs text-cyan-300 px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20">
                  DTK-USR-{profile.id}
                </span>
              </div>
            </div>

            {/* Módulos de Productos */}
            <div className="grid grid-cols-1 gap-6">
              {/* Módulo B2B: Proyectos Corporativos & Workspace */}
              <B2BProjectWorkspaceWidget
                projects={projects}
                onProjectUpdated={() => {
                  fetchClientDashboard()
                    .then((res) => setData(res))
                    .catch(() => {});
                }}
              />

              {/* Módulo B2B: Expediente Fiscal & Facturación (FC 046) */}
              <ClientTaxProfileWidget
                currency={projects[0]?.currency}
                locale={projects[0]?.locale}
              />

              {/* Módulo 1: Escolta WEB */}
              <EscoltaWidget
                sites={sites}
                supportHoursAvailable={3}
                onRequestSupport={() => {
                  window.open('mailto:soporte@dreamtek.tech', '_blank');
                }}
              />

              {/* Módulo 2: ARCHON Gestión de Flotas */}
              <ArchonWidget
                hasActivePlan={hasArchon}
                onUpgrade={() => {
                  window.open('https://dreamtek.tech/#products', '_blank');
                }}
              />

              {/* Módulo 3: Ciberseguridad Ofensiva */}
              <CyberAuditWidget
                hasActiveAudit={false}
                onRequestAudit={() => {
                  window.open('https://dreamtek.tech/#contact', '_blank');
                }}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
