'use client';

import Image from 'next/image';
import type { es } from '@/i18n/dictionaries/es';

type Dictionary = typeof es;

export function WhatsAppPill({ dict }: { dict: Dictionary }) {
  return (
    <a
      href="https://wa.me/524481117977"
      target="_blank"
      rel="noopener noreferrer"
      className="relative z-50 flex items-center justify-center w-14 h-14 bg-[#25D366] hover:bg-[#20bd5a] text-white rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group"
      aria-label="WhatsApp"
    >
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 shrink-0">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 00-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
      </svg>

      {/* Thought Bubble Tooltip */}
      <div className="absolute bottom-[calc(100%+24px)] right-0 opacity-0 translate-y-3 scale-95 pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 group-hover:scale-100 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] origin-bottom-right">
        {/* Main bubble body */}
        <div className="relative bg-white text-[#001219] px-4 py-2.5 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] whitespace-nowrap font-bold text-sm border border-gray-100 flex items-center gap-2">
          {/* Triángulo CSS afilado (Cola del globo) apuntando al centro de la píldora */}
          <div className="absolute -bottom-[9px] right-[20px] border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[10px] border-t-gray-100"></div>
          <div className="absolute -bottom-[8px] right-[20px] border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[10px] border-t-white"></div>

          <div className="relative w-7 h-7 flex-shrink-0 z-10 overflow-hidden">
            <Image
              src="/svg/24_DREAMTEK_LOGO_ISOTIPO_Teck Red.svg"
              alt="Dreamtek Nautilus"
              fill
              className="object-contain scale-[2.2]"
            />
          </div>
          <span className="relative z-10">{dict.whatsapp.help}</span>
        </div>
      </div>
    </a>
  );
}
