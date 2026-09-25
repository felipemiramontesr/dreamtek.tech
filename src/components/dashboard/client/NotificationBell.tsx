'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { fetchClientNotifications } from '@/lib/auth/client';
import { NotificationDrawer } from './NotificationDrawer';

export interface NotificationBellProps {
  className?: string;
  pollIntervalMs?: number;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({
  className = '',
  pollIntervalMs = 60000,
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [unreadCount, setUnreadCount] = useState<number>(0);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await fetchClientNotifications({ limit: 1 });
      setUnreadCount(res.unread_count || 0);
    } catch {
      // Silencioso en caso de error de red puntual
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function init() {
      try {
        const res = await fetchClientNotifications({ limit: 1 });
        if (active) {
          setUnreadCount(res.unread_count || 0);
        }
      } catch {
        // Silencioso
      }
    }
    void init();

    if (pollIntervalMs > 0) {
      const interval = setInterval(() => {
        void fetchUnreadCount();
      }, pollIntervalMs);
      return () => {
        active = false;
        clearInterval(interval);
      };
    }

    return () => {
      active = false;
    };
  }, [fetchUnreadCount, pollIntervalMs]);

  const handleToggle = () => {
    setIsOpen((prev) => !prev);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleToggle}
        aria-label={unreadCount > 0 ? `${unreadCount} notificaciones no leídas` : 'Notificaciones'}
        aria-expanded={isOpen}
        data-testid="notification-bell-btn"
        className={`relative p-2 rounded-lg text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 transition-all cursor-pointer ${className}`}
      >
        {/* SVG Icon Bell */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="w-4 h-4 text-cyan-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>

        {/* Unread count badge */}
        {unreadCount > 0 && (
          <span
            data-testid="notification-badge"
            className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-red-500 rounded-full border border-slate-900 shadow-sm animate-pulse"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      <NotificationDrawer
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onNotificationsChanged={fetchUnreadCount}
      />
    </>
  );
};
