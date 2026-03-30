import { Button } from '../ui/Button';

export function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center pt-20 overflow-hidden">
      {/* Background Graphic Effect */}
      <div className="absolute inset-0 z-0 bg-gradient-to-br from-[#00213d] via-[#00172B] to-black opacity-90" />

      <div className="absolute inset-0 z-0 pointer-events-none opacity-20 bg-[radial-gradient(circle_at_center,rgba(255,45,0,0.15)_0%,transparent_50%)]" />

      {/* Content */}
      <div className="relative z-10 max-w-[1440px] px-6 mx-auto w-full flex flex-col items-center text-center">
        {/* Headings */}
        <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-[4.5rem] leading-[1.1] font-bold text-white max-w-4xl tracking-tight mb-6">
          Convertimos visiones complejas en{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-white/70">
            infraestructura digital robusta.
          </span>
        </h1>

        <p className="text-lg sm:text-xl text-white/70 max-w-2xl font-light mb-12">
          Desarrollo Web, Mobile Apps y Ciberseguridad con estándar global.
        </p>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <Button variant="primary" size="lg">
            Solicitar Diagnóstico Inicial
          </Button>
          <Button variant="outline" size="lg">
            Conocer Metodología
          </Button>
        </div>
      </div>
    </section>
  );
}
