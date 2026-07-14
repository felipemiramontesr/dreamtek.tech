'use client';

import { useState } from 'react';
import { GlassCard } from '../ui/GlassCard';
import { Button } from '../ui/Button';
import type { es } from '@/i18n/dictionaries/es';

type Dictionary = typeof es;

export function Products({ dict }: { dict: Dictionary }) {
  const [isAnnual, setIsAnnual] = useState(false);

  const plans = [
    {
      id: 'starterkit',
      title: dict.products.plans[0].title,
      price: dict.products.plans[0].price,
      annualPrice: dict.products.plans[0].annualPrice,
      annualTotal: dict.products.plans[0].annualTotal,
      period: dict.products.plans[0].period,
      description: dict.products.plans[0].description,
      features: dict.products.plans[0].features,
      featured: false,
      ctaText: dict.products.plans[0].ctaText,
    },
    {
      id: 'archon-fleet',
      title: dict.products.plans[1].title,
      price: dict.products.plans[1].price,
      annualPrice: dict.products.plans[1].annualPrice,
      annualTotal: dict.products.plans[1].annualTotal,
      period: dict.products.plans[1].period,
      description: dict.products.plans[1].description,
      features: dict.products.plans[1].features,
      featured: true,
      ctaText: dict.products.plans[1].ctaText,
    },
    {
      id: 'cyber-audit',
      title: dict.products.plans[2].title,
      price: dict.products.plans[2].price,
      annualPrice: dict.products.plans[2].annualPrice,
      annualTotal: dict.products.plans[2].annualTotal,
      period: dict.products.plans[2].period,
      description: dict.products.plans[2].description,
      features: dict.products.plans[2].features,
      featured: false,
      ctaText: dict.products.plans[2].ctaText,
    },
  ];

  return (
    <section
      id="productos"
      className="min-h-screen flex flex-col justify-center pt-28 pb-12 relative overflow-hidden bg-black/20"
    >
      {/* Decorative gradient blob */}
      <div className="absolute top-1/2 left-0 -translate-y-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-[#FF2D00]/5 rounded-full blur-[100px] pointer-events-none" />

      <div className="max-w-[1440px] px-6 mx-auto w-full relative z-10">
        <div className="text-center mb-10">
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-4">
            {dict.products.heading1}
            <span className="text-[#FF2D00]">{dict.products.heading2}</span>
          </h2>
          <p className="text-white/60 max-w-xl mx-auto text-lg font-light mb-8">
            {dict.products.subtitle}
          </p>

          {/* Billing Toggle Switch */}
          <div className="flex justify-center items-center gap-4 mt-6">
            <span
              className={`text-sm font-medium transition-colors duration-200 ${!isAnnual ? 'text-white' : 'text-white/40'}`}
            >
              {dict.products.monthly}
            </span>
            <label className="relative inline-flex items-center cursor-pointer select-none">
              <input
                type="checkbox"
                aria-label="Facturación anual"
                checked={isAnnual}
                onChange={(e) => setIsAnnual(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-white/10 border border-white/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-5 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[#FF2D00] after:border-none after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-white/15 duration-300 transition-all shadow-[inset_0_0_4px_rgba(0,0,0,0.4)]" />
            </label>
            <div className="flex items-center gap-2">
              <span
                className={`text-sm font-medium transition-colors duration-200 ${isAnnual ? 'text-white' : 'text-white/40'}`}
              >
                {dict.products.annual}
              </span>
              {isAnnual && (
                <span className="text-[10px] sm:text-xs bg-[#FF2D00] text-white px-2 py-0.5 rounded-full font-bold shadow-[0_0_10px_rgba(255,45,0,0.4)] animate-pulse">
                  {dict.products.save}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 items-stretch">
          {plans.map((plan) => (
            <GlassCard
              key={plan.id}
              featured={plan.featured}
              className={`h-full flex flex-col justify-between transition-all duration-500 hover:-translate-y-2 ${
                plan.featured ? 'border-[#FF2D00]/40 shadow-[0_0_30px_rgba(255,45,0,0.1)]' : ''
              }`}
            >
              <div>
                <h3 className="text-2xl font-bold text-white mb-2">{plan.title}</h3>
                <p className="text-white/50 text-sm font-light mb-6 min-h-[48px]">
                  {plan.description}
                </p>

                <div className="flex flex-col mb-8 border-b border-white/10 pb-6">
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl sm:text-5xl font-bold text-white transition-all duration-300">
                      {isAnnual ? plan.annualPrice : plan.price}
                    </span>
                    <div className="flex flex-col">
                      <span className="text-white/60 text-xs sm:text-sm font-light uppercase tracking-wider">
                        {dict.products.usdPer}
                        {isAnnual ? dict.products.month : plan.period}
                      </span>
                    </div>
                  </div>
                  {isAnnual && (
                    <span className="text-xs text-[#FF2D00] font-medium tracking-wide mt-2 animate-fade-in block">
                      {dict.products.billedAnnually}
                      {plan.annualTotal}
                    </span>
                  )}
                </div>

                <ul className="space-y-4 mb-8">
                  {plan.features.map((feature, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-3 text-sm text-white/80 font-light"
                    >
                      <svg
                        className="w-5 h-5 text-[#FF2D00] shrink-0 mt-0.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth="2.5"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="pt-4">
                <a href="#contacto" className="block w-full">
                  <Button variant={plan.featured ? 'primary' : 'outline'} className="w-full">
                    {plan.ctaText}
                  </Button>
                </a>
              </div>
            </GlassCard>
          ))}
        </div>
      </div>
    </section>
  );
}
