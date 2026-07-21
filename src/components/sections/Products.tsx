'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { GlassCard } from '../ui/GlassCard';
import { Button } from '../ui/Button';
import type { es } from '@/i18n/dictionaries/es';

const SpaceBackground = dynamic(
  () => import('../ui/SpaceBackground').then((mod) => mod.SpaceBackground),
  { ssr: false },
);

type Dictionary = typeof es;

/**
 * Componente `Products` (Planes y Productos).
 *
 * Muestra la matriz de planes y precios (Escolta Digital, ARCHON, Cyber Audit),
 * incluyendo el toggle de facturación mensual/anual y el modal interactivo de alcance.
 *
 * @param dict - Diccionario i18n localizado (es/en).
 */
export function Products({ dict }: { dict: Dictionary }) {
  const [isAnnual, setIsAnnual] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'includes' | 'excludes' | 'process'>('includes');

  // Prevent scroll and toggle body class when modal is open
  useEffect(() => {
    if (isModalOpen) {
      document.body.style.overflow = 'hidden';
      document.body.classList.add('modal-open');
    } else {
      document.body.style.overflow = '';
      document.body.classList.remove('modal-open');
    }
    return () => {
      document.body.style.overflow = '';
      document.body.classList.remove('modal-open');
    };
  }, [isModalOpen]);

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
      badge: dict.products.plans[0].badge,
      priceSuffix: dict.products.plans[0].priceSuffix,
      subPriceText: dict.products.plans[0].subPriceText,
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
      badge: dict.products.plans[1].badge,
      priceSuffix: dict.products.plans[1].priceSuffix,
      subPriceText: dict.products.plans[1].subPriceText,
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
      badge: dict.products.plans[2].badge,
      priceSuffix: dict.products.plans[2].priceSuffix,
      subPriceText: dict.products.plans[2].subPriceText,
    },
  ];

  return (
    <section
      id="productos"
      className="min-h-screen lg:h-screen lg:min-h-0 flex flex-col justify-center pt-20 pb-4 scroll-mt-0 relative overflow-hidden bg-black/20"
    >
      {/* Decorative gradient blob */}
      <div className="absolute top-1/2 left-0 -translate-y-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-[#FF2D00]/5 rounded-full blur-[100px] pointer-events-none" />

      <div className="max-w-[1440px] px-6 mx-auto w-full relative z-10">
        <div className="text-center mb-10 lg:mb-6">
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-4">
            {dict.products.heading1}
            <span className="text-[#FF2D00]">{dict.products.heading2}</span>
          </h2>
          <p className="text-white/60 max-w-xl mx-auto text-lg lg:text-base font-light mb-8 lg:mb-4">
            {dict.products.subtitle}
          </p>

          {/* Billing Toggle Switch */}
          <div className="flex justify-center items-center gap-4 mt-6 lg:mt-3">
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
              className={`h-full flex flex-col justify-between pb-4 lg:pb-4 lg:p-6 transition-all duration-500 hover:-translate-y-2 ${
                plan.featured ? 'border-[#FF2D00]/40 shadow-[0_0_30px_rgba(255,45,0,0.15)]' : ''
              }`}
            >
              <div>
                {plan.badge && (
                  <span className="inline-block text-[10px] uppercase tracking-widest text-[#FF2D00] font-semibold mb-3 bg-[#FF2D00]/10 px-2.5 py-1 rounded-full border border-[#FF2D00]/20 font-sans">
                    {plan.badge}
                  </span>
                )}
                <h3 className="text-2xl font-bold text-white mb-2">{plan.title}</h3>
                <p className="text-white/50 text-sm font-light mb-6 min-h-[48px]">
                  {plan.description}
                </p>

                <div className="flex flex-col mb-8 border-b border-white/10 pb-6">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-4xl sm:text-5xl font-bold text-white transition-all duration-300">
                      {isAnnual ? plan.annualPrice : plan.price}
                    </span>
                    {plan.priceSuffix ? (
                      <span className="text-white/40 text-sm sm:text-base font-light font-sans self-end pb-1">
                        {plan.priceSuffix}
                      </span>
                    ) : (
                      <div className="flex flex-col">
                        <span className="text-white/60 text-xs sm:text-sm font-light uppercase tracking-wider">
                          {dict.products.usdPer}
                          {isAnnual ? dict.products.month : plan.period}
                        </span>
                      </div>
                    )}
                  </div>
                  {plan.subPriceText && (
                    <span className="text-xs text-white/50 font-light mt-2 block">
                      {plan.subPriceText}
                    </span>
                  )}
                  {isAnnual && plan.annualTotal && (
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

              <div className="mt-auto pt-4">
                {plan.id === 'starterkit' ? (
                  <Button
                    variant={plan.featured ? 'primary' : 'outline'}
                    className="w-full font-sans tracking-wide"
                    onClick={() => setIsModalOpen(true)}
                  >
                    {plan.ctaText}
                  </Button>
                ) : (
                  <a href="#contacto" className="block w-full">
                    <Button variant={plan.featured ? 'primary' : 'outline'} className="w-full">
                      {plan.ctaText}
                    </Button>
                  </a>
                )}
              </div>
            </GlassCard>
          ))}
        </div>
      </div>

      {/* Focus Full-Screen Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-0 md:p-12 overflow-hidden bg-black/75 backdrop-blur-2xl animate-fade-in transition-all duration-300">
          {/* Close modal background click */}
          <div
            className="absolute inset-0 cursor-pointer z-0"
            onClick={() => setIsModalOpen(false)}
          />

          {/* Space Background HTML5 Canvas */}
          <SpaceBackground />

          {/* Modal Container */}
          <div className="relative w-full h-full md:h-auto md:max-w-6xl md:max-h-[90vh] bg-[#001529]/95 border-0 md:border border-[#FF2D00]/15 rounded-none md:rounded-2xl p-6 md:p-10 shadow-2xl overflow-hidden animate-slide-up z-10 flex flex-col justify-between">
            {/* Close Button */}
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 md:top-6 md:right-6 text-white/50 hover:text-white transition-colors duration-200 z-20 w-8 h-8 rounded-full border border-white/10 flex items-center justify-center bg-white/5 backdrop-blur-md"
              aria-label="Cerrar modal"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Content */}
            <div className="relative z-10 flex-1 flex flex-col overflow-hidden">
              {/* Cabecera */}
              <div className="mb-6 border-b border-white/10 pb-4 shrink-0">
                <span className="inline-block text-[10px] sm:text-xs uppercase tracking-widest text-[#FF2D00] font-semibold mb-2 bg-[#FF2D00]/10 px-2.5 py-1 rounded-full border border-[#FF2D00]/20 font-sans">
                  {dict.products.modal.tag}
                </span>
                <h3 className="text-2xl md:text-4xl font-bold text-white mb-2 tracking-tight font-sans">
                  {dict.products.modal.title}
                </h3>
                <p className="text-white/70 font-light text-xs md:text-base max-w-2xl leading-relaxed">
                  {dict.products.modal.description}
                </p>
              </div>

              {/* Mobile Tabbed Switcher */}
              <div className="flex border-b border-white/10 mb-4 justify-between md:hidden shrink-0">
                <button
                  onClick={() => setActiveTab('includes')}
                  className={`flex-1 text-center py-2.5 text-[10px] font-bold tracking-widest transition-all ${
                    activeTab === 'includes'
                      ? 'text-white border-b-2 border-[#FF2D00]'
                      : 'text-white/40'
                  }`}
                >
                  {dict.whatsapp.help === 'Can we help you?' ? 'INCLUDES' : 'INCLUYE'}
                </button>
                <button
                  onClick={() => setActiveTab('excludes')}
                  className={`flex-1 text-center py-2.5 text-[10px] font-bold tracking-widest transition-all ${
                    activeTab === 'excludes'
                      ? 'text-white border-b-2 border-[#FF2D00]'
                      : 'text-white/40'
                  }`}
                >
                  {dict.whatsapp.help === 'Can we help you?' ? 'EXCLUDES' : 'NO INCLUYE'}
                </button>
                <button
                  onClick={() => setActiveTab('process')}
                  className={`flex-1 text-center py-2.5 text-[10px] font-bold tracking-widest transition-all ${
                    activeTab === 'process'
                      ? 'text-white border-b-2 border-[#FF2D00]'
                      : 'text-white/40'
                  }`}
                >
                  {dict.whatsapp.help === 'Can we help you?' ? 'PROCESS' : 'PROCESO'}
                </button>
              </div>

              {/* Mobile View Content */}
              <div className="flex md:hidden flex-1 overflow-hidden py-2">
                {activeTab === 'includes' && (
                  <div className="glass-panel p-5 rounded-xl border border-white/10 flex-1 flex flex-col justify-between overflow-y-auto bg-black/40">
                    <div>
                      <h4 className="text-white font-semibold text-xs uppercase tracking-wider border-l-2 border-[#FF2D00] pl-3 mb-3 font-sans">
                        {dict.products.modal.includesTitle}
                      </h4>
                      <ul className="space-y-3">
                        {dict.products.modal.includes.map((item, idx) => (
                          <li
                            key={idx}
                            className="flex items-start gap-2 text-xs text-white/80 font-light leading-relaxed"
                          >
                            <span className="text-[#FF2D00] font-bold shrink-0">✓</span>
                            <div>
                              <strong className="text-white font-medium">{item.label}:</strong>{' '}
                              {item.text}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {activeTab === 'excludes' && (
                  <div className="glass-panel p-5 rounded-xl border border-white/10 flex-1 flex flex-col justify-between overflow-y-auto bg-black/40">
                    <div>
                      <h4 className="text-white font-semibold text-xs uppercase tracking-wider border-l-2 border-[#FF2D00] pl-3 mb-3 font-sans">
                        {dict.products.modal.excludesTitle}
                      </h4>
                      <ul className="space-y-3">
                        {dict.products.modal.excludes.map((item, idx) => (
                          <li
                            key={idx}
                            className="flex items-start gap-2 text-xs text-white/80 font-light leading-relaxed"
                          >
                            <span className="text-[#FF2D00]/40 font-bold shrink-0">✕</span>
                            <div>
                              <strong className="text-white font-medium">{item.label}:</strong>{' '}
                              {item.text}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {activeTab === 'process' && (
                  <div className="glass-panel p-5 rounded-xl border border-white/10 flex-1 flex flex-col justify-between overflow-y-auto bg-black/40">
                    <div>
                      <h4 className="text-white font-semibold text-xs uppercase tracking-wider border-l-2 border-[#FF2D00] pl-3 mb-3 font-sans">
                        {dict.products.modal.processTitle}
                      </h4>
                      <div className="space-y-4">
                        {dict.products.modal.processSteps.map((step, idx) => (
                          <div key={idx} className="flex flex-col gap-1 relative z-10">
                            <span className="text-[10px] uppercase tracking-widest text-[#FF2D00] font-bold font-sans">
                              {step.title}
                            </span>
                            <p className="text-white/80 font-light text-[11px] leading-relaxed">
                              {step.text}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Desktop View Content (3 columns side-by-side) */}
              <div className="hidden md:grid grid-cols-3 gap-6 flex-1 py-4 overflow-hidden items-stretch">
                {/* Includes Column */}
                <div className="glass-panel p-6 rounded-xl border border-white/10 flex flex-col h-full bg-black/20">
                  <h4 className="text-white font-semibold text-xs lg:text-sm uppercase tracking-wider border-l-2 border-[#FF2D00] pl-3 mb-4 font-sans shrink-0">
                    {dict.products.modal.includesTitle}
                  </h4>
                  <ul className="space-y-3.5 overflow-y-auto pr-1">
                    {dict.products.modal.includes.map((item, idx) => (
                      <li
                        key={idx}
                        className="flex items-start gap-2.5 text-xs lg:text-sm text-white/80 font-light leading-relaxed"
                      >
                        <span className="text-[#FF2D00] font-bold shrink-0">✓</span>
                        <div>
                          <strong className="text-white font-medium">{item.label}:</strong>{' '}
                          {item.text}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Excludes Column */}
                <div className="glass-panel p-6 rounded-xl border border-white/10 flex flex-col h-full bg-black/20">
                  <h4 className="text-white font-semibold text-xs lg:text-sm uppercase tracking-wider border-l-2 border-[#FF2D00] pl-3 mb-4 font-sans shrink-0">
                    {dict.products.modal.excludesTitle}
                  </h4>
                  <ul className="space-y-3.5 overflow-y-auto pr-1">
                    {dict.products.modal.excludes.map((item, idx) => (
                      <li
                        key={idx}
                        className="flex items-start gap-2.5 text-xs lg:text-sm text-white/80 font-light leading-relaxed"
                      >
                        <span className="text-[#FF2D00]/40 font-bold shrink-0">✕</span>
                        <div>
                          <strong className="text-white font-medium">{item.label}:</strong>{' '}
                          {item.text}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Process Column */}
                <div className="glass-panel p-6 rounded-xl border border-white/10 flex flex-col h-full bg-black/20">
                  <h4 className="text-white font-semibold text-xs lg:text-sm uppercase tracking-wider border-l-2 border-[#FF2D00] pl-3 mb-4 font-sans shrink-0">
                    {dict.products.modal.processTitle}
                  </h4>
                  <div className="space-y-5 overflow-y-auto pr-1">
                    {dict.products.modal.processSteps.map((step, idx) => (
                      <div key={idx} className="flex flex-col gap-1 relative z-10">
                        <span className="text-xs uppercase tracking-widest text-[#FF2D00] font-bold font-sans">
                          {step.title}
                        </span>
                        <p className="text-white/80 font-light text-xs lg:text-sm leading-relaxed">
                          {step.text}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer / CTA del modal */}
            <div className="border-t border-white/10 pt-4 md:pt-6 flex flex-col sm:flex-row justify-between items-center gap-4 md:gap-6 mt-auto shrink-0">
              <div className="flex flex-col items-center sm:items-start text-center sm:text-left">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xl md:text-2xl lg:text-3xl font-bold text-white">
                    $2,900.00 MXN
                  </span>
                  <span className="text-white/40 text-xs md:text-sm font-light">
                    {dict.products.modal.priceSuffix}
                  </span>
                </div>
                <span className="text-[10px] md:text-xs text-white/50 font-light mt-0.5">
                  {dict.products.modal.taxNote}
                </span>
              </div>
              <Button
                variant="primary"
                onClick={() => {
                  // Cierra el modal
                  setIsModalOpen(false);

                  // Inyecta el valor 'starterkit' en el select
                  const event = new CustomEvent('select-service', { detail: 'starterkit' });
                  window.dispatchEvent(event);

                  // Realiza scroll-smooth
                  setTimeout(() => {
                    const contactSection = document.getElementById('contacto');
                    if (contactSection) {
                      contactSection.scrollIntoView({ behavior: 'smooth' });
                    }
                  }, 100);
                }}
                className="w-full sm:w-auto px-6 md:px-8 py-2.5 md:py-3 text-xs md:text-sm font-medium tracking-wide uppercase transition-all duration-300 shadow-[0_0_20px_rgba(255,45,0,0.3)] hover:shadow-[0_0_30px_rgba(255,45,0,0.5)]"
              >
                {dict.products.modal.ctaText}
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
