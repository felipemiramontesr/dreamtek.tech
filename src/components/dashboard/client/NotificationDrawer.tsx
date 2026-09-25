'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  fetchClientNotifications,
  markNotificationsAsRead,
  type ClientNotification,
} from '@/lib/auth/client';
import { Button } from '@/components/ui/Button';

export interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onNotificationsChanged?: () => void;
}

const SAFE_INTERNAL_URL_REGEX = /^\/client\/dashboard(\/[a-zA-Z0-9_\-./]*)?$/;

export const NotificationDrawer: React.FC<NotificationDrawerProps> = ({
  isOpen,
  onClose,
  onNotificationsChanged,
}) => {
  const router = useRouter();
  const [filter, setFilter] = useState<string>('ALL');
  const [notifications, setNotifications] = useState<ClientNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [markingAll, setMarkingAll] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleTabChange = (tabValue: string) => {
    setFilter(tabValue);
    setLoading(true);
    setErrorMsg(null);
  };

  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    async function init() {
      try {
        const eventTypeParam = filter === 'ALL' ? undefined : filter;
        const res = await fetchClientNotifications({
          limit: 25,
          eventType: eventTypeParam,
        });
        if (active) {
          setNotifications(res.notifications || []);
          setUnreadCount(res.unread_count || 0);
        }
      } catch (err: unknown) {
        if (active) {
          setErrorMsg((err as Error).message || 'Error al cargar notificaciones.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void init();

    return () => {
      active = false;
    };
  }, [isOpen, filter]);

  // Manejo de tecla Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    try {
      await markNotificationsAsRead({ all: true });
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
      if (onNotificationsChanged) onNotificationsChanged();
    } catch (err: unknown) {
      setErrorMsg((err as Error).message || 'No se pudieron marcar como leídas.');
    } finally {
      setMarkingAll(false);
    }
  };

  const handleItemClick = async (notif: ClientNotification) => {
    if (!notif.is_read) {
      try {
        await markNotificationsAsRead({ notificationIds: [notif.id] });
        setNotifications((prev) =>
          prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n)),
        );
        setUnreadCount((c) => Math.max(0, c - 1));
        if (onNotificationsChanged) onNotificationsChanged();
      } catch {
        // Fallback silencioso en lectura de ítem
      }
    }

    if (notif.action_url && SAFE_INTERNAL_URL_REGEX.test(notif.action_url)) {
      onClose();
      router.push(notif.action_url);
    }
  };

  if (!isOpen) return null;

  const severityBadge = (sev: ClientNotification['severity']) => {
    switch (sev) {
      case 'CRITICAL':
        return (
          <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-red-500/20 text-red-400 border border-red-500/40">
            CRÍTICO
          </span>
        );
      case 'WARNING':
        return (
          <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
            ALERTA
          </span>
        );
      default:
        return (
          <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
            INFO
          </span>
        );
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Panel de notificaciones"
      className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-sm flex justify-end"
    >
      <div
        className="fixed inset-0"
        onClick={onClose}
        aria-hidden="true"
        data-testid="notification-backdrop"
      />

      <div className="relative w-full max-w-md bg-slate-900 border-l border-white/10 shadow-2xl flex flex-col h-full z-10">
        {/* Header */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <span>Notificaciones</span>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  {unreadCount} nuevas
                </span>
              )}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar panel de notificaciones"
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Filter Tabs */}
        <div className="px-4 py-2 bg-slate-950/40 border-b border-white/5 flex gap-1 overflow-x-auto">
          {[
            { label: 'Todas', value: 'ALL' },
            { label: 'Seguridad', value: 'SECURITY_ALERT' },
            { label: 'Proyectos', value: 'PROJECT_UPDATE' },
            { label: 'Facturación', value: 'BILLING_INVOICE' },
          ].map((tab) => (
            <button
              key={tab.value}
              onClick={() => handleTabChange(tab.value)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                filter === tab.value
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Actions bar */}
        <div className="px-4 py-2 border-b border-white/5 flex items-center justify-between text-xs text-slate-400 bg-slate-900/50">
          <span>{notifications.length} elemento(s)</span>
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              disabled={markingAll}
              onClick={handleMarkAllRead}
              className="text-[11px] py-0.5 px-2 border-slate-700 text-cyan-300 hover:bg-cyan-950/40"
            >
              {markingAll ? 'Marcando...' : 'Marcar todas como leídas'}
            </Button>
          )}
        </div>

        {/* Error message */}
        {errorMsg && (
          <div className="mx-4 mt-3 p-3 text-xs bg-red-950/60 border border-red-500/40 text-red-200 rounded-lg">
            {errorMsg}
          </div>
        )}

        {/* List Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-48 space-y-2">
              <div className="w-8 h-8 border-2 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin" />
              <p className="text-xs text-slate-400">Cargando eventos...</p>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center px-4">
              <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-500 mb-2">
                🔔
              </div>
              <p className="text-sm font-semibold text-slate-300">No hay notificaciones</p>
              <p className="text-xs text-slate-500 mt-1">
                Los eventos operativos y de seguridad aparecerán aquí.
              </p>
            </div>
          ) : (
            notifications.map((notif) => (
              <div
                key={notif.id}
                onClick={() => handleItemClick(notif)}
                className={`p-3 rounded-lg border transition-all cursor-pointer relative ${
                  notif.is_read
                    ? 'bg-slate-950/40 border-white/5 hover:border-white/10 opacity-75'
                    : 'bg-slate-800/80 border-cyan-500/30 hover:border-cyan-500/50 shadow-sm'
                }`}
              >
                {!notif.is_read && (
                  <span
                    aria-label="No leída"
                    className="absolute top-3 right-3 w-2 h-2 rounded-full bg-cyan-400 ring-2 ring-cyan-400/20"
                  />
                )}
                <div className="flex items-center gap-2 mb-1">
                  {severityBadge(notif.severity)}
                  <span className="text-[10px] text-slate-500 font-mono">
                    {new Date(notif.created_at).toLocaleString()}
                  </span>
                </div>
                <h3
                  className={`text-xs ${notif.is_read ? 'text-slate-300' : 'text-white font-semibold'}`}
                >
                  {notif.title}
                </h3>
                <p className="text-xs text-slate-400 mt-1 line-clamp-3">{notif.message}</p>
                {notif.action_url && SAFE_INTERNAL_URL_REGEX.test(notif.action_url) && (
                  <div className="mt-2 flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 font-medium">
                    <span>Ver detalle</span>
                    <span>→</span>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
