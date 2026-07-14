'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { es } from '@/i18n/dictionaries/es';

type Dictionary = typeof es;

export function Navbar({ dict, lang = 'es' }: { dict: Dictionary; lang?: 'es' | 'en' }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLegalPage = [
    '/cookies',
    '/privacidad',
    '/terminos',
    '/en/cookies',
    '/en/privacidad',
    '/en/terminos',
  ].some((path) => pathname.startsWith(path));
  const [isOpen, setIsOpen] = useState(false);

  const toggleMenu = () => setIsOpen(!isOpen);
  const closeMenu = () => setIsOpen(false);

  const NAV_LINKS = [
    { label: dict.navbar.services, href: '#servicios' },
    { label: dict.navbar.products, href: '#productos' },
    { label: dict.navbar.differential, href: '#diferencial' },
    { label: dict.navbar.contact, href: '#contacto' },
  ];

  const getTogglePath = (targetLang: 'es' | 'en') => {
    if (targetLang === 'es') {
      return pathname.replace(/^\/en/, '') || '/';
    } else {
      return pathname.startsWith('/en') ? pathname : `/en${pathname === '/' ? '' : pathname}`;
    }
  };

  const handleLangClick = (selectedLang: 'es' | 'en') => {
    localStorage.setItem('dreamtek_lang_preference', selectedLang);
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[#00213D]/95 border-b border-white/10 safe-area-top backdrop-blur-md">
      <div className="max-w-[1440px] w-full mx-auto px-6 h-20 flex items-center justify-between">
        {/* Logo Section */}
        <button
          onClick={() => {
            closeMenu();
            router.push(lang === 'es' ? '/' : '/en', { scroll: false });
            window.scrollTo({ top: 0, behavior: 'instant' });
            setTimeout(() => window.scrollTo({ top: 0, behavior: 'instant' }), 100);
          }}
          className="flex items-center group outline-none focus-visible:ring-2 rounded-sm focus-visible:ring-white bg-transparent border-none p-0 cursor-pointer"
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
        </button>

        {isLegalPage ? (
          <button
            onClick={() => {
              router.push(lang === 'es' ? '/' : '/en', { scroll: false });
              window.scrollTo({ top: 0, behavior: 'instant' });
              setTimeout(() => window.scrollTo({ top: 0, behavior: 'instant' }), 100);
            }}
            className="relative flex items-center gap-2 p-1.5 pr-4 pl-3 rounded-full bg-white/5 border border-white/10 backdrop-blur-md shadow-[inset_0_0_10px_rgba(255,255,255,0.02)] text-xs font-bold tracking-wider text-white/80 hover:text-white transition-all group outline-none focus-visible:ring-2 focus-visible:ring-white cursor-pointer overflow-hidden"
          >
            <div className="relative z-10 w-6 h-6 flex items-center justify-center rounded-full bg-[#FF2D00]/20 border border-[#FF2D00]/50 shadow-[0_0_10px_rgba(255,45,0,0.3)] group-hover:scale-105 transition-transform">
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="transition-transform group-hover:-translate-x-0.5 text-white"
              >
                <line x1="19" y1="12" x2="5" y2="12"></line>
                <polyline points="12 19 5 12 12 5"></polyline>
              </svg>
            </div>
            <span className="relative z-10 uppercase">{dict.navbar.returnSite}</span>
          </button>
        ) : (
          <div className="flex items-center">
            {/* Navigation Links (Desktop) */}
            <nav
              aria-label={dict.navbar.navigation}
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

            {/* Desktop Language Toggle Pill */}
            <div className="hidden md:flex items-center ml-8 relative p-1 rounded-full bg-white/5 border border-white/10 backdrop-blur-md shadow-[inset_0_0_10px_rgba(255,255,255,0.02)]">
              <div
                className={`absolute top-1 bottom-1 w-[36px] rounded-full bg-[#FF2D00]/20 border border-[#FF2D00]/50 shadow-[0_0_15px_rgba(255,45,0,0.3)] transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${lang === 'es' ? 'translate-x-0' : 'translate-x-[36px]'}`}
              />
              <Link
                href={getTogglePath('es')}
                scroll={false}
                onClick={() => handleLangClick('es')}
                className={`relative z-10 w-[36px] h-[26px] flex items-center justify-center text-[11px] font-bold tracking-wider transition-colors duration-300 ${lang === 'es' ? 'text-white' : 'text-white/40 hover:text-white/80'}`}
              >
                ES
              </Link>
              <Link
                href={getTogglePath('en')}
                scroll={false}
                onClick={() => handleLangClick('en')}
                className={`relative z-10 w-[36px] h-[26px] flex items-center justify-center text-[11px] font-bold tracking-wider transition-colors duration-300 ${lang === 'en' ? 'text-white' : 'text-white/40 hover:text-white/80'}`}
              >
                EN
              </Link>
            </div>

            {/* Mobile Menu Button - Minimal */}
            <button
              onClick={toggleMenu}
              className="md:hidden text-white/80 hover:text-white p-2 z-50 outline-none focus-visible:ring-2 focus-visible:ring-white rounded-sm cursor-pointer ml-4"
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
          </div>
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
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <span className="text-xs uppercase tracking-widest text-[#FF2D00] font-bold">
              {dict.navbar.navigation}
            </span>

            {/* Mobile Language Toggle */}
            <div className="flex items-center relative p-1 rounded-full bg-white/5 border border-white/10 shadow-[inset_0_0_10px_rgba(255,255,255,0.02)]">
              <div
                className={`absolute top-1 bottom-1 w-[32px] rounded-full bg-[#FF2D00]/20 border border-[#FF2D00]/50 shadow-[0_0_10px_rgba(255,45,0,0.3)] transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${lang === 'es' ? 'translate-x-0' : 'translate-x-[32px]'}`}
              />
              <Link
                href={getTogglePath('es')}
                onClick={() => {
                  closeMenu();
                  handleLangClick('es');
                }}
                scroll={false}
                className={`relative z-10 w-[32px] h-[24px] flex items-center justify-center text-[10px] font-bold tracking-wider transition-colors duration-300 ${lang === 'es' ? 'text-white' : 'text-white/40'}`}
              >
                ES
              </Link>
              <Link
                href={getTogglePath('en')}
                onClick={() => {
                  closeMenu();
                  handleLangClick('en');
                }}
                scroll={false}
                className={`relative z-10 w-[32px] h-[24px] flex items-center justify-center text-[10px] font-bold tracking-wider transition-colors duration-300 ${lang === 'en' ? 'text-white' : 'text-white/40'}`}
              >
                EN
              </Link>
            </div>
          </div>

          <nav aria-label={dict.navbar.navigation} className="flex flex-col gap-4">
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
