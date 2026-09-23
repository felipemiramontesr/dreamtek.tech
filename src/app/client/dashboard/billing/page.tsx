'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { fetchClientDashboard, type ClientDashboardData } from '@/lib/auth/client';
import {
  DashboardSubpageHeader,
  getUserDisplayName,
} from '@/components/dashboard/client/DashboardSubpageHeader';
import { ClientTaxProfileWidget } from '@/components/dashboard/client/ClientTaxProfileWidget';

export default function BillingSubpage() {
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

  const { profile, projects = [] } = data;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <DashboardSubpageHeader
        currentModule="billing"
        userName={getUserDisplayName(profile)}
        userEmail={profile.email}
      />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <ClientTaxProfileWidget currency={projects[0]?.currency} locale={projects[0]?.locale} />
      </main>
    </div>
  );
}
