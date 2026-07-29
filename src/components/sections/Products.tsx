'use client';

import { useState } from 'react';
import { GlassCard } from '../ui/GlassCard';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { OnboardingWizard } from '../onboarding/OnboardingWizard';
import type { es } from '@/i18n/dictionaries/es';

type Dictionary = typeof es;

/**
 * Componente `Products` (Planes y Productos).
 *
 * Muestra la matriz de planes y precios (Escolta Digital, ARCHON, Cyber Audit),
 * incluyendo el toggle de facturación mensual/anual y el modal interactivo de alcance y onboarding.
 *
 * @param dict - Diccionario i18n localizado (es/en).
 */
export function Products({ dict }: { dict: Dictionary }) {
  const [isAnnual, setIsAnnual] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'includes' | 'excludes' | 'process'>('includes');
  const [modalMode, setModalMode] = useState<'info' | 'wizard'>('info');

  const handleOpenModal = () => {
    setModalMode('info');
    setIsModalOpen(true);
  };

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
                    onClick={handleOpenModal}
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
        tag={modalMode === 'info' ? dict.products.modal.tag : 'ONBOARDING PIPELINE'}
        tagColor="emerald"
        title={modalMode === 'info' ? dict.products.modal.title : 'Pipeline de Onboarding — Escolta WEB'}
        description={
          modalMode === 'info'
            ? dict.products.modal.description
            : 'Completa los 5 pasos para configurar tu cuenta y pasarela de pago seguro.'
        }
        headerAction={
          modalMode === 'info' ? (
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
          ) : (
            <button
              type="button"
              onClick={() => setModalMode('info')}
              className="inline-block text-[10px] sm:text-xs uppercase tracking-widest font-semibold px-2.5 py-1 rounded-full border font-sans text-sky-400 bg-sky-500/10 border-sky-500/20 hover:bg-sky-500/20 hover:border-sky-500/40 transition-all cursor-pointer"
            >
              ← VOLVER A ALCANCE Y DETALLES
            </button>
          )
        }
        footer={
          modalMode === 'info' ? (
            <>
              <div className="flex flex-col items-center sm:items-start text-center sm:text-left">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl md:text-3xl lg:text-4xl font-bold text-emerald-400 transition-all duration-300 tracking-tight">
                    {isAnnual ? dict.products.plans[0].annualPrice : dict.products.plans[0].price}
                  </span>
                  <span className="text-emerald-400/70 text-xs md:text-sm font-light">
                    {dict.products.modal.priceSuffix}
                  </span>
                </div>
                <span className="text-xs text-[#FF2D00] font-medium tracking-wide mt-0.5">
                  {isAnnual
                    ? (dict.products.modal as { annualTaxNote?: string }).annualTaxNote ||
                      dict.products.modal.taxNote
                    : dict.products.modal.taxNote}
                </span>
              </div>
              <Button
                variant="primary"
                onClick={() => setModalMode('wizard')}
                className="w-full sm:w-auto px-6 md:px-8 py-3 text-xs md:text-sm font-bold tracking-wider uppercase transition-all duration-300 shadow-[0_0_25px_rgba(255,45,0,0.4)] hover:shadow-[0_0_35px_rgba(255,45,0,0.6)]"
              >
                {dict.products.modal.ctaText} →
              </Button>
            </>
          ) : null
        }
      >
        {modalMode === 'info' ? (
          <>
            {/* Mobile Tabbed Switcher */}
            <div className="flex border-b border-white/10 mb-3 justify-between md:hidden shrink-0">
              <button
                type="button"
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
                type="button"
                onClick={() => setActiveTab('excludes')}
                className={`flex-1 text-center py-2 text-[10px] font-bold tracking-widest transition-all ${
                  activeTab === 'excludes' ? 'text-sky-400 border-b-2 border-sky-400' : 'text-white/40'
                }`}
              >
                {dict.products.modal.tabs.excludes}
              </button>
              <button
                type="button"
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
                <div className="glass-panel p-4 rounded-xl border border-emerald-500/25 flex-1 flex flex-col justify-start space-y-3 bg-white/[0.04]">
                  <h4 className="text-emerald-400 font-bold text-xs uppercase tracking-wider border-l-2 border-emerald-400 pl-2.5 mb-1 font-sans">
                    {dict.products.modal.includesTitle}
                  </h4>
                  <ul className="space-y-3 text-xs text-white/90 font-light">
                    {dict.products.modal.includes.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-emerald-400 font-bold shrink-0">✓</span>
                        <div>
                          <strong className="text-white font-semibold">{item.label}: </strong>
                          {item.text}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {activeTab === 'excludes' && (
                <div className="glass-panel p-4 rounded-xl border border-sky-500/25 flex-1 flex flex-col justify-start space-y-3 bg-white/[0.04]">
                  <h4 className="text-sky-400 font-bold text-xs uppercase tracking-wider border-l-2 border-sky-400 pl-2.5 mb-1 font-sans">
                    {dict.products.modal.excludesTitle}
                  </h4>
                  <ul className="space-y-3 text-xs text-white/90 font-light">
                    {dict.products.modal.excludes.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-sky-400 font-bold shrink-0">✦</span>
                        <div>
                          <strong className="text-white font-semibold">{item.label}: </strong>
                          {item.text}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {activeTab === 'process' && (
                <div className="glass-panel p-4 rounded-xl border border-sky-500/25 flex-1 flex flex-col justify-start space-y-3 bg-white/[0.04]">
                  <h4 className="text-sky-400 font-bold text-xs uppercase tracking-wider border-l-2 border-sky-400 pl-2.5 mb-1 font-sans">
                    {dict.products.modal.processTitle}
                  </h4>
                  <div className="space-y-3 text-xs text-white/90 font-light">
                    {dict.products.modal.processSteps.map((step, idx) => (
                      <div key={idx}>
                        <strong className="text-sky-400 font-semibold block">{step.title}</strong>
                        <p className="text-white/80 text-xs mt-0.5">{step.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Desktop View Content (3 columns side-by-side with top alignment & clean font sizing) */}
            <div className="hidden md:grid grid-cols-3 gap-4 lg:gap-5 flex-1 overflow-hidden py-1 items-stretch">
              {/* Includes Column */}
              <div className="glass-panel p-5 lg:p-6 rounded-xl border border-emerald-500/25 flex flex-col justify-start bg-white/[0.04] backdrop-blur-md space-y-4">
                <h4 className="text-emerald-400 font-bold text-xs sm:text-sm uppercase tracking-wider border-l-2 border-emerald-400 pl-3 mb-1 font-sans">
                  {dict.products.modal.includesTitle}
                </h4>
                <ul className="space-y-3.5 text-xs sm:text-sm text-white/90 font-light leading-relaxed">
                  {dict.products.modal.includes.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2.5">
                      <span className="text-emerald-400 font-bold shrink-0 mt-0.5">✓</span>
                      <div>
                        <strong className="text-white font-semibold">{item.label}: </strong>
                        {item.text}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Excludes Column */}
              <div className="glass-panel p-5 lg:p-6 rounded-xl border border-sky-500/25 flex flex-col justify-start bg-white/[0.04] backdrop-blur-md space-y-4">
                <h4 className="text-sky-400 font-bold text-xs sm:text-sm uppercase tracking-wider border-l-2 border-sky-400 pl-3 mb-1 font-sans">
                  {dict.products.modal.excludesTitle}
                </h4>
                <ul className="space-y-3.5 text-xs sm:text-sm text-white/90 font-light leading-relaxed">
                  {dict.products.modal.excludes.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2.5">
                      <span className="text-sky-400 font-bold shrink-0 mt-0.5">✦</span>
                      <div>
                        <strong className="text-white font-semibold">{item.label}: </strong>
                        {item.text}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Process Column */}
              <div className="glass-panel p-5 lg:p-6 rounded-xl border border-sky-500/25 flex flex-col justify-start bg-white/[0.04] backdrop-blur-md space-y-4">
                <h4 className="text-sky-400 font-bold text-xs sm:text-sm uppercase tracking-wider border-l-2 border-sky-400 pl-3 mb-1 font-sans">
                  {dict.products.modal.processTitle}
                </h4>
                <div className="space-y-4 text-xs sm:text-sm text-white/90 font-light leading-relaxed">
                  {dict.products.modal.processSteps.map((step, idx) => (
                    <div key={idx} className="space-y-0.5">
                      <strong className="text-sky-400 font-semibold block">{step.title}</strong>
                      <p className="text-white/80 text-xs sm:text-sm">{step.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        ) : (
          <OnboardingWizard isAnnual={isAnnual} onClose={() => setIsModalOpen(false)} />
        )}
      </Modal>
    </section>
  );
}
