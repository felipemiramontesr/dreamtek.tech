'use client';

import { usePathname } from 'next/navigation';
import { Hero } from '@/components/sections/Hero';
import { Services } from '@/components/sections/Services';
import { Products } from '@/components/sections/Products';
import { Differential } from '@/components/sections/Differential';
import { Contact } from '@/components/sections/Contact';
import { es } from '@/i18n/dictionaries/es';
import { en } from '@/i18n/dictionaries/en';

export function LandingUI() {
  const pathname = usePathname();
  const lang = pathname.startsWith('/en') ? 'en' : 'es';
  const dict = lang === 'en' ? en : es;

  return (
    <main className="flex flex-col min-h-screen">
      <Hero dict={dict} />
      <Services dict={dict} />
      <Products dict={dict} />
      <Differential dict={dict} />
      <Contact dict={dict} />
    </main>
  );
}
