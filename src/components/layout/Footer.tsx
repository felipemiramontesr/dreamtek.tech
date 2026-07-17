import ExportedImage from 'next-export-optimize-images/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { es } from '@/i18n/dictionaries/es';

type Dictionary = typeof es;

export function Footer({ dict, lang = 'es' }: { dict: Dictionary; lang?: 'es' | 'en' }) {
  const currentYear = new Date().getFullYear();
  const router = useRouter();

  return (
    <footer className="bg-black text-white/70 py-16 border-t border-white/5">
      <div className="max-w-[1440px] px-6 mx-auto w-full">
        <div className="flex flex-col md:flex-row justify-between items-center md:items-start gap-8">
          <div className="flex flex-col items-center md:items-start gap-6">
            <button
              onClick={() => {
                router.push(lang === 'es' ? '/' : '/en', { scroll: false });
                window.scrollTo({ top: 0, behavior: 'instant' });
                setTimeout(() => window.scrollTo({ top: 0, behavior: 'instant' }), 100);
              }}
              aria-label={dict.navbar.returnSite}
              className="outline-none focus-visible:ring-2 focus-visible:ring-white rounded-sm bg-transparent border-none p-0 cursor-pointer text-left group flex items-center gap-2"
            >
              <div className="relative w-8 h-8">
                <ExportedImage
                  src="/svg/24_DREAMTEK_LOGO_ISOTIPO_Teck Red.svg"
                  alt="Dreamtek Nautilus"
                  fill
                  className="object-contain scale-[2.8]"
                />
              </div>
              <span className="text-2xl font-bold tracking-tight text-white group-hover:text-white/80 transition-colors">
                Dreamtek<span className="text-[#FF2D00]">.</span>
              </span>
            </button>
            <p className="text-sm font-light text-center md:text-left">{dict.footer.subtitle}</p>
          </div>

          <div className="flex gap-12 font-light text-sm text-center md:text-left">
            <div className="flex flex-col gap-3">
              <h5 className="text-white font-medium mb-2">{dict.footer.company}</h5>
              <Link href="#servicios" className="hover:text-white transition-colors">
                {dict.navbar.services}
              </Link>
              <Link href="#diferencial" className="hover:text-white transition-colors">
                {dict.navbar.differential}
              </Link>
              <Link href="#contacto" className="hover:text-white transition-colors">
                {dict.navbar.contact}
              </Link>
            </div>

            <div className="flex flex-col gap-3">
              <h5 className="text-white font-medium mb-2">{dict.footer.legal}</h5>
              <Link
                href={lang === 'es' ? '/privacidad' : '/en/privacidad'}
                className="hover:text-white transition-colors"
              >
                {dict.footer.privacy}
              </Link>
              <Link
                href={lang === 'es' ? '/terminos' : '/en/terminos'}
                className="hover:text-white transition-colors"
              >
                {dict.footer.terms}
              </Link>
              <Link
                href={lang === 'es' ? '/cookies' : '/en/cookies'}
                className="hover:text-white transition-colors"
              >
                {dict.footer.cookies}
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-16 pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center text-xs font-light tracking-wide gap-4">
          <p>
            © {currentYear} Dreamtek.tech - {dict.footer.rights}
          </p>
          <div className="flex items-center gap-2">
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            {dict.footer.operating}
            <span className="font-medium text-white/90">{dict.footer.hq}</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
