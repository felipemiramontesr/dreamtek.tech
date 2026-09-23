'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { logoutUser } from '@/lib/auth/client';
import type { ModuleCardId } from './ClientHubModuleCard';

export const MODULE_ALLOWLIST: Record<
  ModuleCardId,
  { label: string; href: string; shortName: string }
> = {
  escolta: {
    label: 'Escolta WEB',
    href: '/client/dashboard/escolta',
    shortName: 'Escolta',
  },
  archon: {
    label: 'ARCHON Flotas',
    href: '/client/dashboard/archon',
    shortName: 'ARCHON',
  },
  cyber: {
    label: 'Ciberseguridad Ofensiva',
    href: '/client/dashboard/cyber',
    shortName: 'Cyber',
  },
  projects: {
    label: 'Proyectos Corporativos B2B',
    href: '/client/dashboard/projects',
    shortName: 'Proyectos',
  },
  billing: {
    label: 'Facturación & Datos Fiscales',
    href: '/client/dashboard/billing',
    shortName: 'Facturación',
  },
  security: {
    label: 'Seguridad & Credenciales (2FA)',
    href: '/client/dashboard/security',
    shortName: 'Seguridad',
  },
  support: {
    label: 'Mesa de Ayuda & Soporte',
    href: '/client/dashboard/support',
    shortName: 'Soporte',
  },
};

export function getUserDisplayName(profile?: {
  full_name?: string | null;
  username?: string | null;
}): string {
  if (!profile) return 'Cliente';
  return profile.full_name || profile.username || 'Cliente';
}

interface DashboardSubpageHeaderProps {
  currentModule: ModuleCardId;
  userName?: string;
  userEmail?: string;
}

export function DashboardSubpageHeader({
  currentModule,
  userName = 'Cliente',
  userEmail = '',
}: DashboardSubpageHeaderProps) {
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await logoutUser();
      router.push('/');
    } catch {
      router.push('/');
    }
  };

  const moduleInfo = MODULE_ALLOWLIST[currentModule] || {
    label: 'Módulo',
    href: '/client/dashboard',
    shortName: 'Módulo',
  };

  return (
    <header className="border-b border-white/10 bg-slate-900/80 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Lado izquierdo: Regreso al Hub y Breadcrumbs */}
        <div className="flex items-center gap-3 flex-wrap">
          <Link
            href="/client/dashboard"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700/60 transition-all cursor-pointer shadow-sm"
          >
            ← Volver al Hub
          </Link>

          <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
            <Link
              href="/client/dashboard"
              className="text-cyan-400 hover:text-cyan-300 font-bold tracking-wider"
            >
              DREAMTEK.TECH
            </Link>
            <span>/</span>
            <span className="text-slate-300 font-sans font-semibold">{moduleInfo.label}</span>
          </div>
        </div>

        {/* Centro / Derecha: App Switcher de módulos (Allowlist C-051) */}
        <nav
          aria-label="App Switcher"
          className="hidden lg:flex items-center gap-1 bg-slate-950/60 p-1 rounded-lg border border-white/5 overflow-x-auto"
        >
          {(Object.keys(MODULE_ALLOWLIST) as ModuleCardId[]).map((key) => {
            const mod = MODULE_ALLOWLIST[key];
            const isActive = currentModule === key;
            return (
              <Link
                key={key}
                href={mod.href}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`}
              >
                {mod.shortName}
              </Link>
            );
          })}
        </nav>

        {/* Lado derecho: Usuario y Logout */}
        <div className="flex items-center gap-3 self-end md:self-auto">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-semibold text-white">{userName}</p>
            {userEmail && <p className="text-[10px] text-slate-400">{userEmail}</p>}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleLogout}
            className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white text-xs py-1"
          >
            Cerrar Sesión
          </Button>
        </div>
      </div>
    </header>
  );
}
