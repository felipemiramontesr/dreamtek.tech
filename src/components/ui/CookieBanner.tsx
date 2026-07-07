// src/components/ui/CookieBanner.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import '@/app/cookieBanner.css';

/**
 * Simple cookie banner with Accept / Reject buttons.
 * Preference is stored in localStorage under "cookieConsent".
 */
export const CookieBanner = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('cookieConsent');
    if (!consent) {
      setTimeout(() => {
        setVisible(true);
      }, 0);
    }
  }, []);

  const handleChoice = (value: 'accepted' | 'rejected') => {
    localStorage.setItem('cookieConsent', value);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="cookie-banner">
      <p className="cookie-text">
        Este sitio utiliza cookies propias y de terceros para ofrecerte una mejor experiencia.
        Puedes leer más en
        <Link href="/privacidad" className="cookie-link">
          {' '}
          Aviso de Privacidad
        </Link>{' '}
        y
        <Link href="/cookies" className="cookie-link">
          {' '}
          Manejo de Cookies
        </Link>
        .
      </p>
      <div className="cookie-actions">
        <button className="cookie-btn accept" onClick={() => handleChoice('accepted')}>
          Aceptar
        </button>
        <button className="cookie-btn reject" onClick={() => handleChoice('rejected')}>
          Rechazar
        </button>
      </div>
    </div>
  );
};
