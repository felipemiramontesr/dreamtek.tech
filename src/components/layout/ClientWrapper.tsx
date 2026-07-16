'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { es } from '@/i18n/dictionaries/es';
import { en } from '@/i18n/dictionaries/en';
import { Navbar } from './Navbar';
import { Footer } from './Footer';
import { CookieBanner } from '../ui/CookieBanner';
import { WhatsAppPill } from '../ui/WhatsAppPill';

export function ClientWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const lang = pathname.startsWith('/en') ? 'en' : 'es';
  const dict = lang === 'en' ? en : es;

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return (
    <>
      <Navbar dict={dict} lang={lang} />
      {children}
      <Footer dict={dict} lang={lang} />

      <div className="fixed bottom-0 md:bottom-6 left-0 w-full z-[100] pointer-events-none flex items-center md:items-stretch md:min-h-[3.5rem]">
        {/* Left spacing for perfect centering symmetry (hidden on mobile) */}
        <div className="hidden md:block flex-1 min-w-[6rem]" />

        {/* Cookie Banner (full width on mobile) */}
        <div className="pointer-events-auto w-full md:max-w-[1392px]">
          <CookieBanner dict={dict} lang={lang} />
        </div>

        {/* Right space where WA pill is perfectly centered on desktop, floating above on mobile */}
        <div className="absolute bottom-[120%] right-4 md:relative md:bottom-auto md:right-auto md:flex-1 md:min-w-[6rem] pointer-events-auto">
          <div className="md:absolute md:top-0 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2">
            <WhatsAppPill dict={dict} />
          </div>
        </div>
      </div>
    </>
  );
}
