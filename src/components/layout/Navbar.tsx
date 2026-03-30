import Image from 'next/image';
import Link from 'next/link';

const NAV_LINKS = [
  { label: 'Servicios', href: '#servicios' },
  { label: 'Diferencial', href: '#diferencial' },
  { label: 'Contacto', href: '#contacto' },
];

export function Navbar() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[#00213D] border-b border-white/10 safe-area-top">
      <div className="max-w-[1440px] w-full mx-auto px-6 h-20 flex items-center justify-between">
        
        {/* Logo Section */}
        <Link href="/" className="flex items-center group outline-none focus-visible:ring-2 rounded-sm focus-visible:ring-white">
          <div className="relative w-12 h-12">
             <Image 
                src="/svg/24_DREAMTEK_LOGO_ISOTIPO_Teck Red.svg" 
                alt="Dreamtek Isotipo" 
                fill
                className="object-contain scale-[2.8]"
             />
          </div>
          <span className="text-4xl font-bold tracking-tight text-white group-hover:text-white/80 transition-colors ml-4">
            Dreamtek<span className="text-[#FF2D00]">.</span>
          </span>
        </Link>

        {/* Navigation Links */}
        <nav aria-label="Navegación principal" className="hidden md:flex items-center space-x-8">
          {NAV_LINKS.map((link) => (
            <Link 
              key={link.href}
              href={link.href}
              className="text-sm font-medium tracking-wide text-white/80 hover:text-white transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white rounded-sm"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Mobile Menu Button - Minimal */}
        <button className="md:hidden text-white/80 hover:text-white p-2" aria-label="Abrir menú">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>

      </div>
    </header>
  );
}
