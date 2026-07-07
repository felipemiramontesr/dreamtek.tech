'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_LINKS = [
  { label: 'Servicios', href: '#servicios' },
  { label: 'Productos', href: '#productos' },
  { label: 'Diferencial', href: '#diferencial' },
  { label: 'Contacto', href: '#contacto' },
];

export function Navbar() {
  const pathname = usePathname();
  const isLegalPage = ['/cookies', '/privacidad', '/terminos'].some((path) =>
    pathname.startsWith(path),
  );
  const [isOpen, setIsOpen] = useState(false);

  const toggleMenu = () => setIsOpen(!isOpen);
  const closeMenu = () => setIsOpen(false);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[#00213D]/95 border-b border-white/10 safe-area-top backdrop-blur-md">
      <div className="max-w-[1440px] w-full mx-auto px-6 h-20 flex items-center justify-between">
        {/* Logo Section */}
        <Link
          href="/"
          onClick={closeMenu}
          className="flex items-center group outline-none focus-visible:ring-2 rounded-sm focus-visible:ring-white"
        >
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

        {isLegalPage ? (
          <Link
            href="/"
            className="text-sm font-medium tracking-wide text-white/80 hover:text-white transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white rounded-sm flex items-center gap-2 group cursor-pointer"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="transition-transform group-hover:-translate-x-1"
            >
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
            Regresar al sitio
          </Link>
        ) : (
          <>
            {/* Navigation Links (Desktop) */}
            <nav
              aria-label="Navegación principal"
              className="hidden md:flex items-center space-x-8"
            >
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
            <button
              onClick={toggleMenu}
              className="md:hidden text-white/80 hover:text-white p-2 z-50 outline-none focus-visible:ring-2 focus-visible:ring-white rounded-sm cursor-pointer"
              aria-label={isOpen ? 'Cerrar menú' : 'Abrir menú'}
              aria-expanded={isOpen}
            >
              {isOpen ? (
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              ) : (
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="3" y1="12" x2="21" y2="12"></line>
                  <line x1="3" y1="6" x2="21" y2="6"></line>
                  <line x1="3" y1="18" x2="21" y2="18"></line>
                </svg>
              )}
            </button>
          </>
        )}
      </div>

      {/* Backdrop (Mobile Menu) */}
      {!isLegalPage && (
        <div
          className={`fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 md:hidden ${
            isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
          onClick={closeMenu}
        />
      )}

      {/* Mobile Drawer */}
      {!isLegalPage && (
        <div
          className={`fixed top-0 right-0 h-full w-[280px] max-w-[80vw] bg-[#00213D] border-l border-white/10 z-40 p-8 pt-28 shadow-2xl transition-transform duration-300 cubic-bezier(0.16, 1, 0.3, 1) md:hidden flex flex-col gap-6 ${
            isOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <span className="text-xs uppercase tracking-widest text-[#FF2D00] font-bold border-b border-white/10 pb-2">
            Navegación
          </span>
          <nav aria-label="Navegación móvil" className="flex flex-col gap-4">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={closeMenu}
                className="text-lg font-medium text-white/80 hover:text-white hover:pl-2 transition-all duration-200 py-1"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
