'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { fetchClientDashboard, type ClientDashboardData } from '@/lib/auth/client';
import {
  DashboardSubpageHeader,
  getUserDisplayName,
} from '@/components/dashboard/client/DashboardSubpageHeader';
import { ArchonWidget } from '@/components/dashboard/archon/ArchonWidget';

export default function ArchonSubpage() {
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

  const { profile, services = [] } = data;
  const isAdmin = profile.role === 'ADMIN';
  const hasArchon = services.some((s) => s.name?.toLowerCase().includes('archon')) || isAdmin;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <DashboardSubpageHeader
        currentModule="archon"
        userName={getUserDisplayName(profile)}
        userEmail={profile.email}
      />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <ArchonWidget
          hasActivePlan={hasArchon}
          onUpgrade={() => {
            window.open('https://dreamtek.tech/#products', '_blank');
          }}
        />
      </main>
    </div>
  );
}
