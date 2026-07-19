'use client';

import { useState, useEffect } from 'react';
import { GlassCard } from '../ui/GlassCard';
import { Button } from '../ui/Button';
import type { es } from '@/i18n/dictionaries/es';

type Dictionary = typeof es;

export function Products({ dict }: { dict: Dictionary }) {
  const [isAnnual, setIsAnnual] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Prevent scroll when modal is open
  useEffect(() => {
    if (isModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
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

              <div className="pt-4">
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

        {/* Focus Full-Screen Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6 overflow-y-auto bg-black/90 backdrop-blur-xl animate-fade-in transition-all duration-300">
            {/* Close modal background click */}
            <div
              className="absolute inset-0 cursor-pointer"
              onClick={() => setIsModalOpen(false)}
            />

            {/* Modal Container */}
            <div className="relative w-full max-w-4xl bg-[#080808]/95 border border-white/10 rounded-2xl p-6 md:p-10 shadow-[0_0_50px_rgba(255,45,0,0.15)] overflow-hidden animate-slide-up max-h-[90vh] overflow-y-auto z-10 flex flex-col justify-between">
              {/* Subtle glow effect */}
              <div className="absolute -top-40 -left-40 w-96 h-96 bg-[#FF2D00]/10 rounded-full blur-[100px] pointer-events-none" />

              {/* Close Button */}
              <button
                onClick={() => setIsModalOpen(false)}
                className="absolute top-6 right-6 text-white/50 hover:text-white transition-colors duration-200 z-20"
                aria-label="Cerrar modal"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              {/* Content */}
              <div className="relative z-10 flex-1">
                {/* Cabecera */}
                <div className="mb-8 border-b border-white/10 pb-6">
                  <span className="inline-block text-[10px] sm:text-xs uppercase tracking-widest text-[#FF2D00] font-semibold mb-2 bg-[#FF2D00]/10 px-2.5 py-1 rounded-full border border-[#FF2D00]/20 font-sans">
                    Suscripción Tecnológica PyME
                  </span>
                  <h3 className="text-3xl md:text-4xl font-bold text-white mb-3 tracking-tight font-sans">
                    Escolta Digital — StarterKit
                  </h3>
                  <p className="text-white/70 font-light text-base md:text-lg max-w-2xl leading-relaxed">
                    Tu presencia en internet llave en mano, diseñada para PyMEs y profesionales que
                    desean visibilidad absoluta y olvidarse por completo de la complejidad
                    tecnológica.
                  </p>
                </div>

                {/* Grid 2 Columnas (Incluye / No incluye) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                  {/* Bloque Izquierdo: INCLUYE */}
                  <div className="space-y-4">
                    <h4 className="text-white font-semibold text-base uppercase tracking-wider border-l-2 border-emerald-500 pl-3">
                      Lo que está resuelto para ti (INCLUYE)
                    </h4>
                    <ul className="space-y-3">
                      <li className="flex items-start gap-2.5 text-sm text-white/80 font-light leading-relaxed">
                        <span className="text-emerald-500 font-bold shrink-0">✓</span>
                        <div>
                          <strong className="text-white font-medium">
                            Arquitectura Visual Premium:
                          </strong>{' '}
                          Eliges una de nuestras estructuras preestablecidas y la adaptamos con tus
                          colores, logotipo e identidad de marca.
                        </div>
                      </li>
                      <li className="flex items-start gap-2.5 text-sm text-white/80 font-light leading-relaxed">
                        <span className="text-emerald-500 font-bold shrink-0">✓</span>
                        <div>
                          <strong className="text-white font-medium">
                            Infraestructura Llave en Mano:
                          </strong>{' '}
                          Registro de dominio (.com/.mx), hospedaje de alta velocidad en Hostinger y
                          certificado SSL (candado de seguridad) activos.
                        </div>
                      </li>
                      <li className="flex items-start gap-2.5 text-sm text-white/80 font-light leading-relaxed">
                        <span className="text-emerald-500 font-bold shrink-0">✓</span>
                        <div>
                          <strong className="text-white font-medium">Protección Activa:</strong>{' '}
                          Monitoreo preventivo de caídas y formulario de contacto inteligente
                          blindado contra correos basura (Spam).
                        </div>
                      </li>
                      <li className="flex items-start gap-2.5 text-sm text-white/80 font-light leading-relaxed">
                        <span className="text-emerald-500 font-bold shrink-0">✓</span>
                        <div>
                          <strong className="text-white font-medium">Mantenimiento Mensual:</strong>{' '}
                          Hasta 3 horas incluidas al mes de soporte técnico para actualizar textos,
                          cambiar fotografías o ajustar horarios.
                        </div>
                      </li>
                    </ul>
                  </div>

                  {/* Bloque Derecho: NO INCLUYE */}
                  <div className="space-y-4">
                    <h4 className="text-white font-semibold text-base uppercase tracking-wider border-l-2 border-[#FF2D00] pl-3">
                      Fuera de este alcance (NO INCLUYE)
                    </h4>
                    <ul className="space-y-3">
                      <li className="flex items-start gap-2.5 text-sm text-white/80 font-light leading-relaxed">
                        <span className="text-[#FF2D00] font-bold shrink-0">✕</span>
                        <div>
                          <strong className="text-white font-medium">
                            Módulos de Comercio Electrónico:
                          </strong>{' '}
                          No incluye pasarelas de pago automatizadas, carritos de compra ni
                          inventarios dinámicos.
                        </div>
                      </li>
                      <li className="flex items-start gap-2.5 text-sm text-white/80 font-light leading-relaxed">
                        <span className="text-[#FF2D00] font-bold shrink-0">✕</span>
                        <div>
                          <strong className="text-white font-medium">Áreas de Miembros:</strong> No
                          incluye creación de cuentas de usuario, sistemas de contraseñas ni paneles
                          de clientes internos.
                        </div>
                      </li>
                      <li className="flex items-start gap-2.5 text-sm text-white/80 font-light leading-relaxed">
                        <span className="text-[#FF2D00] font-bold shrink-0">✕</span>
                        <div>
                          <strong className="text-white font-medium">
                            Modificaciones Estructurales:
                          </strong>{' '}
                          No se altera el esqueleto de la plantilla elegida. Cambios fuera del molde
                          se cotizan como ingeniería externa.
                        </div>
                      </li>
                      <li className="flex items-start gap-2.5 text-sm text-white/80 font-light leading-relaxed">
                        <span className="text-[#FF2D00] font-bold shrink-0">✕</span>
                        <div>
                          <strong className="text-white font-medium">Horas No Acumulables:</strong>{' '}
                          Las 3 horas de soporte expiran al término del mes correspondiente y no se
                          transfieren al siguiente periodo.
                        </div>
                      </li>
                    </ul>
                  </div>
                </div>

                {/* Pipeline de Proceso */}
                <div className="bg-white/5 border border-white/10 rounded-xl p-5 md:p-6 mb-8 relative overflow-hidden">
                  <h4 className="text-white font-semibold text-base uppercase tracking-wider mb-4 font-sans">
                    Pipeline de Despliegue Atómico (Tu proceso en 5 días)
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
                    {/* Step 1 */}
                    <div className="flex flex-col gap-1.5 relative z-10">
                      <span className="text-xs uppercase tracking-widest text-[#FF2D00] font-bold">
                        1. Selección (Día 1)
                      </span>
                      <p className="text-white/80 font-light text-sm leading-relaxed">
                        Eliges la estructura de tu preferencia de nuestro catálogo y nos entregas tu
                        identidad de marca.
                      </p>
                    </div>
                    {/* Step 2 */}
                    <div className="flex flex-col gap-1.5 relative z-10">
                      <span className="text-xs uppercase tracking-widest text-[#FF2D00] font-bold">
                        2. Carga (Días 2-3)
                      </span>
                      <p className="text-white/80 font-light text-sm leading-relaxed">
                        Nos envías tus textos y materiales gráficos a través de nuestros canales
                        preestablecidos.
                      </p>
                    </div>
                    {/* Step 3 */}
                    <div className="flex flex-col gap-1.5 relative z-10">
                      <span className="text-xs uppercase tracking-widest text-[#FF2D00] font-bold">
                        3. Activación (Día 5)
                      </span>
                      <p className="text-white/80 font-light text-sm leading-relaxed">
                        Validamos tus formularios, activamos el blindaje de seguridad y tu sitio
                        queda oficialmente escoltado en vivo.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer / CTA del modal */}
              <div className="border-t border-white/10 pt-6 flex flex-col sm:flex-row justify-between items-center gap-6 mt-auto">
                <div className="flex flex-col items-center sm:items-start text-center sm:text-left">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl md:text-3xl font-bold text-white">$2,900.00 MXN</span>
                    <span className="text-white/40 text-sm font-light">+ IVA / mes</span>
                  </div>
                  <span className="text-xs text-white/50 font-light mt-0.5">
                    Facturación mensual 100% deducible
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
                  className="w-full sm:w-auto px-8 py-3 text-sm font-medium tracking-wide uppercase transition-all duration-300 shadow-[0_0_20px_rgba(255,45,0,0.3)] hover:shadow-[0_0_30px_rgba(255,45,0,0.5)]"
                >
                  Iniciar mi Proceso de Escolta Digital
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
