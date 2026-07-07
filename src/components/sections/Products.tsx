'use client';

import { useState } from 'react';
import { GlassCard } from '../ui/GlassCard';
import { Button } from '../ui/Button';

export function Products() {
  const [isAnnual, setIsAnnual] = useState(false);

  const plans = [
    {
      id: 'web-starter',
      title: 'Web Starter',
      price: '$1,200',
      annualPrice: '$960',
      annualTotal: '$11,520',
      period: 'proyecto',
      description:
        'Lanzamiento rápido de alto impacto. Ideal para startups y validación de mercado.',
      features: [
        'Desarrollo en Next.js (App Router)',
        'Diseño UI Premium responsivo',
        'Optimización de carga ultra-rápida',
        'SEO inicial integrado',
        'Formulario de contacto funcional',
      ],
      featured: false,
      ctaText: 'Iniciar Proyecto',
    },
    {
      id: 'custom-app',
      title: 'Custom App',
      price: '$3,500',
      annualPrice: '$2,800',
      annualTotal: '$33,600',
      period: 'proyecto',
      description: 'Plataformas complejas a la medida con integraciones y bases de datos robustas.',
      features: [
        'Arquitectura escalable a la medida',
        'E-commerce o tableros de control',
        'Integración completa de APIs',
        'Sincronización con Mobile Apps (opcional)',
        'Base de datos segura y encriptada',
      ],
      featured: true,
      ctaText: 'Solicitar Cotización',
    },
    {
      id: 'cyber-audit',
      title: 'Cyber Audit',
      price: '$1,800',
      annualPrice: '$1,440',
      annualTotal: '$17,280',
      period: 'auditoría',
      description:
        'Análisis profundo de ciberseguridad para mitigar vulnerabilidades y fugas de datos.',
      features: [
        'Auditoría Security by Design',
        'Penetration Testing inicial',
        'Análisis de código y dependencias',
        'Políticas CSP y hardening de servidor',
        'Reporte detallado y plan de mitigación',
      ],
      featured: false,
      ctaText: 'Agendar Auditoría',
    },
  ];

  return (
    <section id="productos" className="py-24 relative overflow-hidden bg-black/20 scroll-mt-20">
      {/* Decorative gradient blob */}
      <div className="absolute top-1/2 left-0 -translate-y-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-[#FF2D00]/5 rounded-full blur-[100px] pointer-events-none" />

      <div className="max-w-[1440px] px-6 mx-auto w-full relative z-10">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-4">
            Planes y <span className="text-[#FF2D00]">Productos</span>
          </h2>
          <p className="text-white/60 max-w-xl mx-auto text-lg font-light mb-8">
            Estructuras transparentes adaptadas a la escala de tus retos digitales.
          </p>

          {/* Billing Toggle Switch */}
          <div className="flex justify-center items-center gap-4 mt-6">
            <span
              className={`text-sm font-medium transition-colors duration-200 ${!isAnnual ? 'text-white' : 'text-white/40'}`}
            >
              Mensual
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
                Anual
              </span>
              {isAnnual && (
                <span className="text-[10px] sm:text-xs bg-[#FF2D00] text-white px-2 py-0.5 rounded-full font-bold shadow-[0_0_10px_rgba(255,45,0,0.4)] animate-pulse">
                  Ahorra 20%
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
                {plan.featured && (
                  <span className="absolute top-4 right-4 bg-[#FF2D00] text-white text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-sm shadow-[0_0_10px_rgba(255,45,0,0.4)]">
                    Recomendado
                  </span>
                )}

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
                        USD / {isAnnual ? 'mes' : plan.period}
                      </span>
                    </div>
                  </div>
                  {isAnnual && (
                    <span className="text-xs text-[#FF2D00] font-medium tracking-wide mt-2 animate-fade-in block">
                      Facturado al año: {plan.annualTotal}
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
