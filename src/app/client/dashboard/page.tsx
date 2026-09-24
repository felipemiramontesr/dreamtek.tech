'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { fetchClientDashboard, logoutUser, type ClientDashboardData } from '@/lib/auth/client';
import { OmnipotentAdminPanel } from '@/components/dashboard/admin/OmnipotentAdminPanel';
import { ClientHubModuleCard } from '@/components/dashboard/client/ClientHubModuleCard';

export default function ClientDashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<ClientDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'client' | 'admin'>('client');

  useEffect(() => {
    fetchClientDashboard()
      .then((res) => {
        setData(res);
        if (res?.profile?.role === 'ADMIN') {
          setViewMode('admin');
        }
      })
      .catch((err: unknown) => {
        const message =
          err instanceof Error ? err.message : 'No se pudo cargar el panel de control.';
        setError(message);
      })
      .finally(() => {
        setLoading(false);
      });
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
              className="bg-cyan-600 hover:bg-cyan-500 cursor-pointer"
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
  const hasEscolta =
    sites.length > 0 || services.some((s) => s.name?.toLowerCase().includes('escolta'));
  const hasArchon = services.some((s) => s.name?.toLowerCase().includes('archon'));
  const hasProjects = projects.length > 0;

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
            <span className="text-xs text-slate-500 font-mono hidden sm:inline">/ client-hub</span>
          </div>

          <div className="flex items-center gap-4">
            {isAdmin && (
              <div className="flex items-center bg-slate-800/80 p-1 rounded-lg border border-slate-700">
                <button
                  onClick={() => setViewMode('admin')}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                    viewMode === 'admin'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Omnipotente (Admin)
                </button>
                <button
                  onClick={() => setViewMode('client')}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
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
                className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white cursor-pointer"
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
          <div className="space-y-10">
            {/* Header Ejecutivo de Bienvenida & Resumen */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-6">
              <div>
                <h1 className="text-2xl font-black text-white tracking-tight">
                  Hola,{' '}
                  <span className="text-cyan-400">
                    {profile.full_name || profile.username || 'Cliente'}
                  </span>
                </h1>
                <p className="text-xs text-slate-400 mt-1">
                  Panel Central de Operaciones. Selecciona una tarjeta para gestionar un servicio o
                  configurar tu cuenta.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-slate-400">ID de Cuenta:</span>
                <span className="font-mono text-xs text-cyan-300 px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20">
                  DTK-USR-{profile.id}
                </span>
                <span className="text-xs text-emerald-400 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 font-medium">
                  {services.length + sites.length} Activos
                </span>
              </div>
            </div>

            {/* SECCIÓN 1: Tus Plataformas & Servicios */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-white uppercase tracking-wider text-slate-300">
                  Plataformas & Servicios Contratados
                </h2>
                <span className="text-xs text-slate-500 font-mono">Apps & Workspaces</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                {/* 1. Escolta WEB */}
                <ClientHubModuleCard
                  id="escolta"
                  title="Escolta WEB"
                  description="Aprovisionamiento de sitios web, monitoreo de SSL, DNS y bolsa de soporte mensual."
                  icon={
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                      />
                    </svg>
                  }
                  href="/client/dashboard/escolta"
                  badge={
                    hasEscolta
                      ? { text: 'Activo', variant: 'emerald' }
                      : { text: 'Disponible', variant: 'slate' }
                  }
                  metrics={[
                    { label: 'Sitios Online', value: sites.length },
                    { label: 'SLA Soporte', value: hasEscolta ? 'Activo' : 'Bespoke' },
                  ]}
                  isContracted={hasEscolta}
                  ctaText={hasEscolta ? 'Administrar sitios →' : 'Ver alcance →'}
                  actionButton={{
                    text: 'Soporte',
                    onClick: () => window.open('mailto:soporte@dreamtek.tech', '_blank'),
                  }}
                />

                {/* 2. ARCHON Node Bridge */}
                <ClientHubModuleCard
                  id="archon"
                  title="ARCHON Node Bridge"
                  description="Enlace y autenticación criptográfica con nodos ARCHON mediante firmas HMAC."
                  icon={
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                  }
                  href="/client/dashboard/archon"
                  badge={
                    hasArchon
                      ? { text: 'Activo', variant: 'emerald' }
                      : { text: 'Disponible', variant: 'slate' }
                  }
                  metrics={[
                    { label: 'Arquitectura', value: 'Nodos Atómicos' },
                    { label: 'Acceso Seguro', value: hasArchon ? 'HMAC Bridge' : 'Bespoke' },
                  ]}
                  isContracted={hasArchon}
                  ctaText={hasArchon ? 'Acceder a consola →' : 'Solicitar demo →'}
                  actionButton={
                    !hasArchon
                      ? {
                          text: 'Demo',
                          onClick: () => window.open('https://dreamtek.tech/#products', '_blank'),
                        }
                      : undefined
                  }
                />

                {/* 3. Ciberseguridad Ofensiva */}
                <ClientHubModuleCard
                  id="cyber"
                  title="Ciberseguridad"
                  description="Auditoría forense táctica, análisis contra OWASP Top 10 y hardening."
                  icon={
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                      />
                    </svg>
                  }
                  href="/client/dashboard/cyber"
                  badge={{ text: 'Disponible', variant: 'slate' }}
                  metrics={[
                    { label: 'Metodología', value: 'OWASP 2021' },
                    { label: 'Modalidad', value: 'Caja Negra/Gris' },
                  ]}
                  isContracted={false}
                  ctaText="Ver auditorías →"
                  actionButton={{
                    text: 'Cotizar',
                    onClick: () => window.open('https://dreamtek.tech/#contact', '_blank'),
                  }}
                />

                {/* 4. Proyectos B2B Workspace */}
                <ClientHubModuleCard
                  id="projects"
                  title="Proyectos B2B"
                  description="Seguimiento de hitos de desarrollo a la medida, entregables y actas de finiquito."
                  icon={
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                      />
                    </svg>
                  }
                  href="/client/dashboard/projects"
                  badge={
                    hasProjects
                      ? { text: `${projects.length} Activo(s)`, variant: 'cyan' }
                      : { text: 'Sin Proyectos', variant: 'slate' }
                  }
                  metrics={[
                    { label: 'Proyectos B2B', value: projects.length },
                    { label: 'Hitos', value: projects[0]?.milestones?.length || 0 },
                  ]}
                  isContracted={hasProjects}
                  ctaText={hasProjects ? 'Abrir workspace →' : 'Ver detalles →'}
                />
              </div>
            </section>

            {/* SECCIÓN 2: Centro de Control & Administración */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-white uppercase tracking-wider text-slate-300">
                  Centro de Control & Cuenta
                </h2>
                <span className="text-xs text-slate-500 font-mono">Ajustes & Finanzas</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {/* 5. Facturación & Expediente Fiscal */}
                <ClientHubModuleCard
                  id="billing"
                  title="Facturación & Fiscal"
                  description="Expediente fiscal mexicano (RFC, Régimen, CSF en PDF) y solicitud de comprobantes."
                  icon={
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z"
                      />
                    </svg>
                  }
                  href="/client/dashboard/billing"
                  badge={{ text: 'Solicitud Fiscal', variant: 'cyan' }}
                  metrics={[
                    { label: 'Normativa', value: 'SAT México' },
                    { label: 'Expediente', value: 'FC 046' },
                  ]}
                  isContracted={true}
                  ctaText="Gestionar datos fiscales →"
                />

                {/* 6. Seguridad & Credenciales (2FA) */}
                <ClientHubModuleCard
                  id="security"
                  title="Seguridad & 2FA"
                  description="Protección de credenciales, autenticación en dos factores (TOTP/Email) y sesiones."
                  icon={
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                      />
                    </svg>
                  }
                  href="/client/dashboard/security"
                  badge={{ text: 'Blindaje MFA', variant: 'emerald' }}
                  metrics={[
                    { label: 'Estándar', value: 'RFC 6238' },
                    { label: 'Autenticación', value: 'TOTP / Email' },
                  ]}
                  isContracted={true}
                  ctaText="Configurar seguridad →"
                />

                {/* 7. Mesa de Ayuda & Soporte */}
                <ClientHubModuleCard
                  id="support"
                  title="Mesa de Ayuda"
                  description="Emisión de tickets de ingeniería, resolución de incidencias y monitoreo de SLAs."
                  icon={
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z"
                      />
                    </svg>
                  }
                  href="/client/dashboard/support"
                  badge={{ text: 'SLA Activo', variant: 'emerald' }}
                  metrics={[
                    { label: 'Canal Oficial', value: 'soporte@' },
                    { label: 'Respuesta', value: '< 2h Crítico' },
                  ]}
                  isContracted={true}
                  ctaText="Abrir mesa de ayuda →"
                  actionButton={{
                    text: 'Ticket',
                    onClick: () => window.open('mailto:soporte@dreamtek.tech', '_blank'),
                  }}
                />
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
