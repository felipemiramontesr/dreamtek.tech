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

      <div className="fixed bottom-6 left-0 w-full z-[100] pointer-events-none flex items-center min-h-[3.5rem]">
        {/* Left spacing for perfect centering symmetry */}
        <div className="flex-1 min-w-[5rem] md:min-w-[6rem]" />

        {/* Cookie Banner */}
        <div className="pointer-events-auto w-full max-w-[1392px]">
          <CookieBanner dict={dict} lang={lang} />
        </div>

        {/* Right space where WA pill is perfectly centered */}
        <div className="flex-1 min-w-[5rem] md:min-w-[6rem] relative pointer-events-auto">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
            <WhatsAppPill dict={dict} />
          </div>
        </div>
      </div>
    </>
  );
}
