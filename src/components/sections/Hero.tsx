'use client';

import dynamic from 'next/dynamic';
import { Button } from '../ui/Button';
import type { es } from '@/i18n/dictionaries/es';

const SpaceBackground = dynamic(
  () => import('../ui/SpaceBackground').then((mod) => mod.SpaceBackground),
  { ssr: false },
);

type Dictionary = typeof es;

export function Hero({ dict }: { dict: Dictionary }) {
  return (
    <section className="relative min-h-screen flex items-center justify-center pt-20 overflow-hidden bg-gradient-to-br from-[#00213d] via-[#00172B] to-black">
      {/* Space Background HTML5 Canvas */}
      <SpaceBackground />

      {/* Decorative gradient blob for depth */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-25 bg-[radial-gradient(circle_at_center,rgba(255,45,0,0.15)_0%,transparent_55%)]" />

      {/* Content */}
      <div className="relative z-10 max-w-[1440px] px-6 mx-auto w-full flex flex-col items-center text-center">
        {/* Headings */}
        <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-[4.5rem] leading-[1.1] font-bold text-white max-w-4xl tracking-tight mb-6">
          {dict.hero.heading1}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-white/70">
            {dict.hero.heading2}
          </span>
        </h1>

        <p className="text-lg sm:text-xl text-white/70 max-w-2xl font-light mb-12">
          {dict.hero.subtitle}
        </p>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full mt-4">
          <Button variant="primary" size="lg" className="w-full sm:w-[320px]">
            {dict.hero.ctaPrimary}
          </Button>
          <Button variant="outline" size="lg" className="w-full sm:w-[320px]">
            {dict.hero.ctaSecondary}
          </Button>
        </div>
      </div>
    </section>
  );
}
