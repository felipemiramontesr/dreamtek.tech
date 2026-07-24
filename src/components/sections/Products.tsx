'use client';

import { useState } from 'react';
import { GlassCard } from '../ui/GlassCard';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import type { es } from '@/i18n/dictionaries/es';

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
      annualSubPriceText: (dict.products.plans[0] as { annualSubPriceText?: string })
        .annualSubPriceText,
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
      annualSubPriceText: (dict.products.plans[1] as { annualSubPriceText?: string })
        .annualSubPriceText,
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
      annualSubPriceText: (dict.products.plans[2] as { annualSubPriceText?: string })
        .annualSubPriceText,
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
                      {isAnnual && plan.annualSubPriceText
                        ? plan.annualSubPriceText
                        : plan.subPriceText}
                    </span>
                  )}
                  <span
                    className={`text-xs text-[#FF2D00] font-medium tracking-wide mt-2 block transition-opacity duration-300 min-h-[20px] ${
                      isAnnual && plan.annualTotal ? 'opacity-100' : 'opacity-0 pointer-events-none'
                    }`}
                  >
                    {dict.products.billedAnnually}
                    {plan.annualTotal || '\u00A0'}
                  </span>
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

      {/* Focus Full-Screen Modal usando componente reutilizable Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        tag={dict.products.modal.tag}
        tagColor="emerald"
        title={dict.products.modal.title}
        description={dict.products.modal.description}
        headerAction={
          <div className="flex items-center gap-3">
            <span
              className={`text-xs sm:text-sm font-medium transition-colors duration-200 ${!isAnnual ? 'text-white' : 'text-white/40'}`}
            >
              {dict.products.monthly}
            </span>
            <label className="relative inline-flex items-center cursor-pointer select-none">
              <input
                type="checkbox"
                aria-label="Facturación anual modal"
                checked={isAnnual}
                onChange={(e) => setIsAnnual(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-white/10 border border-white/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-5 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[#FF2D00] after:border-none after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-white/15 duration-300 transition-all shadow-[inset_0_0_4px_rgba(0,0,0,0.4)]" />
            </label>
            <div className="flex items-center gap-2">
              <span
                className={`text-xs sm:text-sm font-medium transition-colors duration-200 ${isAnnual ? 'text-white' : 'text-white/40'}`}
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
        }
        footer={
          <>
            <div className="flex flex-col items-center sm:items-start text-center sm:text-left">
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl md:text-2xl lg:text-3xl font-bold text-white transition-all duration-300">
                  {isAnnual ? dict.products.plans[0].annualPrice : dict.products.plans[0].price}
                </span>
                <span className="text-white/40 text-xs md:text-sm font-light">
                  {dict.products.modal.priceSuffix}
                </span>
              </div>
              <span className="text-[10px] md:text-xs text-white/50 font-light mt-0.5">
                {isAnnual
                  ? (dict.products.modal as { annualTaxNote?: string }).annualTaxNote ||
                    dict.products.modal.taxNote
                  : dict.products.modal.taxNote}
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
          </>
        }
      >
        {/* Mobile Tabbed Switcher */}
        <div className="flex border-b border-white/10 mb-3 justify-between md:hidden shrink-0">
          <button
            onClick={() => setActiveTab('includes')}
            className={`flex-1 text-center py-2 text-[10px] font-bold tracking-widest transition-all ${
              activeTab === 'includes'
                ? 'text-emerald-400 border-b-2 border-emerald-400'
                : 'text-white/40'
            }`}
          >
            {dict.products.modal.tabs.includes}
          </button>
          <button
            onClick={() => setActiveTab('excludes')}
            className={`flex-1 text-center py-2 text-[10px] font-bold tracking-widest transition-all ${
              activeTab === 'excludes' ? 'text-sky-400 border-b-2 border-sky-400' : 'text-white/40'
            }`}
          >
            {dict.products.modal.tabs.excludes}
          </button>
          <button
            onClick={() => setActiveTab('process')}
            className={`flex-1 text-center py-2 text-[10px] font-bold tracking-widest transition-all ${
              activeTab === 'process' ? 'text-sky-400 border-b-2 border-sky-400' : 'text-white/40'
            }`}
          >
            {dict.products.modal.tabs.process}
          </button>
        </div>

        {/* Mobile View Content */}
        <div className="flex md:hidden flex-1 overflow-hidden py-1">
          {activeTab === 'includes' && (
            <div className="glass-panel p-4 rounded-xl border border-emerald-500/20 flex-1 flex flex-col justify-between overflow-y-auto bg-white/[0.04] backdrop-blur-md">
              <div>
                <h4 className="text-emerald-400 font-semibold text-xs uppercase tracking-wider border-l-2 border-emerald-400 pl-2.5 mb-3 font-sans">
                  {dict.products.modal.includesTitle}
                </h4>
                <ul className="space-y-2.5">
                  {dict.products.modal.includes.map((item, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-2 text-xs text-white/80 font-light leading-relaxed"
                    >
                      <span className="text-emerald-400 font-bold shrink-0">✓</span>
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
            <div className="glass-panel p-4 rounded-xl border border-sky-500/20 flex-1 flex flex-col justify-between overflow-hidden bg-white/[0.04] backdrop-blur-md">
              <div>
                <h4 className="text-sky-400 font-semibold text-xs uppercase tracking-wider border-l-2 border-sky-400 pl-2.5 mb-3 font-sans">
                  {dict.products.modal.excludesTitle}
                </h4>
                <ul className="space-y-2.5">
                  {dict.products.modal.excludes.map((item, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-2 text-xs text-white/80 font-light leading-relaxed"
                    >
                      <span className="text-sky-400 font-bold shrink-0">✦</span>
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
            <div className="glass-panel p-4 rounded-xl border border-sky-500/20 flex-1 flex flex-col justify-between overflow-y-auto bg-white/[0.04] backdrop-blur-md">
              <div>
                <h4 className="text-sky-400 font-semibold text-xs uppercase tracking-wider border-l-2 border-sky-400 pl-2.5 mb-3 font-sans">
                  {dict.products.modal.processTitle}
                </h4>
                <div className="space-y-3">
                  {dict.products.modal.processSteps.map((step, idx) => (
                    <div key={idx} className="flex flex-col gap-0.5 relative z-10">
                      <span className="text-[10px] uppercase tracking-widest text-sky-400 font-bold font-sans">
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
        <div className="hidden md:grid grid-cols-3 gap-5 flex-1 py-2 overflow-hidden items-stretch mb-2">
          {/* Includes Column */}
          <div className="glass-panel p-5 rounded-xl border border-emerald-500/20 flex flex-col h-full bg-white/[0.04] backdrop-blur-md hover:border-emerald-500/30 transition-all duration-300">
            <h4 className="text-emerald-400 font-semibold text-xs lg:text-sm uppercase tracking-wider border-l-2 border-emerald-400 pl-3 mb-3 font-sans shrink-0">
              {dict.products.modal.includesTitle}
            </h4>
            <ul className="space-y-3 overflow-y-auto pr-2 pb-6 max-h-[42vh] md:max-h-[45vh]">
              {dict.products.modal.includes.map((item, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-2.5 text-xs lg:text-sm text-white/80 font-light leading-relaxed"
                >
                  <span className="text-emerald-400 font-bold shrink-0">✓</span>
                  <div>
                    <strong className="text-white font-medium">{item.label}:</strong> {item.text}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Excludes Column */}
          <div className="glass-panel p-5 rounded-xl border border-sky-500/20 flex flex-col h-full bg-white/[0.04] backdrop-blur-md hover:border-sky-500/30 transition-all duration-300">
            <h4 className="text-sky-400 font-semibold text-xs lg:text-sm uppercase tracking-wider border-l-2 border-sky-400 pl-3 mb-3 font-sans shrink-0">
              {dict.products.modal.excludesTitle}
            </h4>
            <ul className="space-y-3">
              {dict.products.modal.excludes.map((item, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-2.5 text-xs lg:text-sm text-white/80 font-light leading-relaxed"
                >
                  <span className="text-sky-400 font-bold shrink-0">✦</span>
                  <div>
                    <strong className="text-white font-medium">{item.label}:</strong> {item.text}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Process Column */}
          <div className="glass-panel p-5 rounded-xl border border-sky-500/20 flex flex-col h-full bg-white/[0.04] backdrop-blur-md hover:border-sky-500/30 transition-all duration-300">
            <h4 className="text-sky-400 font-semibold text-xs lg:text-sm uppercase tracking-wider border-l-2 border-sky-400 pl-3 mb-3 font-sans shrink-0">
              {dict.products.modal.processTitle}
            </h4>
            <div className="space-y-4 overflow-y-auto pr-2 pb-6 max-h-[42vh] md:max-h-[45vh]">
              {dict.products.modal.processSteps.map((step, idx) => (
                <div key={idx} className="flex flex-col gap-0.5 relative z-10">
                  <span className="text-xs uppercase tracking-widest text-sky-400 font-bold font-sans">
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
      </Modal>
    </section>
  );
}
