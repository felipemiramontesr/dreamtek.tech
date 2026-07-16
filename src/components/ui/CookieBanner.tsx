// src/components/ui/CookieBanner.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import '@/app/cookieBanner.css';
import type { es } from '@/i18n/dictionaries/es';

type Dictionary = typeof es;

/**
 * Simple cookie banner with Accept / Reject buttons.
 * Preference is stored in localStorage under "cookieConsent".
 */
export const CookieBanner = ({ dict, lang = 'es' }: { dict: Dictionary; lang?: 'es' | 'en' }) => {
  const [visible, setVisible] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const pathname = usePathname();

  const isLegalPage = [
    '/cookies',
    '/privacidad',
    '/terminos',
    '/en/cookies',
    '/en/privacidad',
    '/en/terminos',
  ].some((path) => pathname.startsWith(path));

  useEffect(() => {
    const consent = localStorage.getItem('cookieConsent');
    if (!consent) {
      setTimeout(() => {
        setVisible(true);
      }, 0);
    }

    const handleScroll = () => {
      // The Hero section is 100vh. The banner sits at the bottom of the viewport.
      // If the user scrolls down by just 100px, the banner starts overlaying the Services section.
      setIsScrolled(window.scrollY > 100);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // Check initial state

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleChoice = (value: 'accepted' | 'rejected') => {
    localStorage.setItem('cookieConsent', value);
    setVisible(false);
    window.dispatchEvent(new Event('cookieConsentChanged'));
  };

  if (!visible) return null;

  return (
    <>
      <div className="fixed inset-0 bg-[#001529]/20 backdrop-blur-[2px] z-[-1] pointer-events-auto transition-opacity" />
      <div
        className={`cookie-banner relative z-[10] ${isLegalPage || isScrolled ? 'solid-bg' : ''}`}
      >
        <p className="cookie-text text-justify md:text-left">
          {dict.cookieBanner.text}
          <Link href={lang === 'es' ? '/privacidad' : '/en/privacidad'} className="cookie-link">
            {dict.footer.privacy}
          </Link>
          {', '}
          <Link href={lang === 'es' ? '/terminos' : '/en/terminos'} className="cookie-link">
            {dict.footer.terms}
          </Link>
          {dict.cookieBanner.and}
          <Link href={lang === 'es' ? '/cookies' : '/en/cookies'} className="cookie-link">
            {lang === 'es' ? 'Manejo de Cookies' : 'Cookie Policy'}
          </Link>
          .
        </p>
        <div className="cookie-actions">
          <button className="cookie-btn accept" onClick={() => handleChoice('accepted')}>
            {dict.cookieBanner.accept}
          </button>
          <button className="cookie-btn reject" onClick={() => handleChoice('rejected')}>
            {dict.cookieBanner.reject}
          </button>
        </div>
      </div>
    </>
  );
};
