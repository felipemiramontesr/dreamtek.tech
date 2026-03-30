import Link from 'next/link';

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-black text-white/70 py-16 border-t border-white/5">
      <div className="max-w-[1440px] px-6 mx-auto w-full">
        
        <div className="flex flex-col md:flex-row justify-between items-center md:items-start gap-8">
          
          <div className="flex flex-col items-center md:items-start gap-6">
            <Link href="/" aria-label="Volver al inicio" className="outline-none focus-visible:ring-2 focus-visible:ring-white rounded-sm">
              <span className="text-2xl font-bold tracking-tight text-white">
                Dreamtek<span className="text-[#FF2D00]">.</span>
              </span>
            </Link>
            <p className="text-sm font-light text-center md:text-left">
              Ingeniería y Seguridad de Clase Mundial
            </p>
          </div>

          <div className="flex gap-12 font-light text-sm text-center md:text-left">
            <div className="flex flex-col gap-3">
              <h5 className="text-white font-medium mb-2">Compañía</h5>
              <Link href="#servicios" className="hover:text-white transition-colors">Servicios</Link>
              <Link href="#diferencial" className="hover:text-white transition-colors">Diferencial</Link>
              <Link href="#contacto" className="hover:text-white transition-colors">Contacto</Link>
            </div>
            
            <div className="flex flex-col gap-3">
              <h5 className="text-white font-medium mb-2">Legal</h5>
              <Link href="/privacidad" className="hover:text-white transition-colors">Aviso de Privacidad</Link>
              <Link href="/terminos" className="hover:text-white transition-colors">Términos de Servicio</Link>
            </div>
          </div>
          
        </div>

        <div className="mt-16 pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center text-xs font-light tracking-wide gap-4">
          <p>© {currentYear} Dreamtek.tech - Todos los derechos reservados.</p>
          <div className="flex items-center gap-2">
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Operando con <span className="font-medium text-white/90">HQ en Guadalupe, Zacatecas.</span>
          </div>
        </div>

      </div>
    </footer>
  );
}
