import { GlassCard } from '../ui/GlassCard';

export function Services() {
  const services = [
    {
      id: 'web',
      icon: (
        <svg className="w-8 h-8 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
        </svg>
      ),
      title: 'Desarrollo Web',
      description: 'Ecosistemas escalables construidos con arquitecturas modernas. Optimizados para el rendimiento y la flexibilidad empresarial.',
      featured: false,
    },
    {
      id: 'mobile',
      icon: (
        <svg className="w-8 h-8 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      ),
      title: 'Mobile Apps',
      description: 'Soluciones nativas e híbridas con experiencias fluidas. Enfoque mobile-first alineado a lineamientos de diseño premium.',
      featured: false,
    },
    {
      id: 'cybersecurity',
      icon: (
        <svg className="w-8 h-8 text-[#FF2D00]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
      title: 'Ciberseguridad',
      description: 'Preparacionismo Digital y auditorías profundas. Aplicamos Security by Design para mitigar riesgos antes de que se presenten.',
      featured: true,
    }
  ];

  return (
    <section id="servicios" className="min-h-screen flex items-center py-24 relative overflow-hidden bg-[#00213d]/90 scroll-mt-20">
      
      {/* Decorative gradient blob */}
      <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/2 w-[800px] h-[800px] bg-[#FF2D00]/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-[1440px] px-6 mx-auto w-full relative z-10">
        
        <div className="text-center md:text-left mb-16">
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-4">Servicios <span className="text-[#FF2D00]">Core</span></h2>
          <p className="text-white/60 max-w-xl text-lg">Soluciones integrales de alto rendimiento para retos corporativos complejos.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {services.map((service) => (
            <GlassCard key={service.id} featured={service.featured} className="h-full">
              <div className="mb-6 bg-white/5 w-16 h-16 rounded-xl flex items-center justify-center backdrop-blur-md border border-white/5">
                {service.icon}
              </div>
              
              <h3 className={`text-2xl font-bold mb-4 ${service.featured ? 'text-[#FF2D00]' : 'text-white'}`}>
                {service.title}
              </h3>
              
              <p className="text-white/70 leading-relaxed font-light">
                {service.description}
              </p>
              
              <div className="mt-auto block transition-all pt-8">
                  <button className="text-sm font-bold tracking-widest uppercase text-white hover:text-[#FF2D00] flex items-center gap-2 group/btn transition-colors outline-none focus-visible:ring-1 focus-visible:ring-white">
                    Explorar
                    <span className="transform group-hover/btn:translate-x-1 transition-transform">→</span>
                  </button>
              </div>
            </GlassCard>
          ))}
        </div>
      </div>
    </section>
  );
}
