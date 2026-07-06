import { GlassCard } from '../ui/GlassCard';
import { Button } from '../ui/Button';

export function Products() {
  const plans = [
    {
      id: 'web-starter',
      title: 'Web Starter',
      price: '$1,200',
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
          <p className="text-white/60 max-w-xl mx-auto text-lg font-light">
            Estructuras transparentes adaptadas a la escala de tus retos digitales.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 items-stretch">
          {plans.map((plan) => (
            <GlassCard
              key={plan.id}
              featured={plan.featured}
              className={`h-full flex flex-col justify-between transition-transform duration-300 hover:-translate-y-2 ${
                plan.featured ? 'border-[#FF2D00]/40' : ''
              }`}
            >
              <div>
                {plan.featured && (
                  <span className="absolute top-4 right-4 bg-[#FF2D00] text-white text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-sm">
                    Recomendado
                  </span>
                )}

                <h3 className="text-2xl font-bold text-white mb-2">{plan.title}</h3>
                <p className="text-white/50 text-sm font-light mb-6 min-h-[48px]">
                  {plan.description}
                </p>

                <div className="flex items-baseline gap-1 mb-8 border-b border-white/10 pb-6">
                  <span className="text-4xl sm:text-5xl font-bold text-white">{plan.price}</span>
                  <span className="text-white/60 text-sm font-light">USD / {plan.period}</span>
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
