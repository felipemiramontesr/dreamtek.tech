'use client';

import React, { useEffect } from 'react';
import dynamic from 'next/dynamic';

const SpaceBackground = dynamic(
  () => import('./SpaceBackground').then((mod) => mod.SpaceBackground),
  { ssr: false },
);

export interface ModalProps {
  /** Indica si el modal está visible */
  isOpen: boolean;
  /** Función para cerrar el modal */
  onClose: () => void;
  /** Etiqueta pequeña sobre el título */
  tag?: string;
  /** Color de la etiqueta ('emerald' | 'sky' | 'red') */
  tagColor?: 'emerald' | 'sky' | 'red';
  /** Título principal del modal */
  title?: React.ReactNode;
  /** Descripción o subtítulo del modal */
  description?: React.ReactNode;
  /** Contenido principal del cuerpo del modal */
  children: React.ReactNode;
  /** Contenido o barra del footer/CTA */
  footer?: React.ReactNode;
  /** Clase CSS adicional para el contenedor del modal */
  className?: string;
  /** Ancho máximo personalizado */
  maxWidth?: string;
}

/**
 * Componente Modal Reutilizable con el fondo de degradado diagonal en dos tonos del Hero,
 * lienzo espacial `SpaceBackground`, accesibilidad ARIA, manejo de tecla ESC y bloqueo de scroll.
 */
export function Modal({
  isOpen,
  onClose,
  tag,
  tagColor = 'emerald',
  title,
  description,
  children,
  footer,
  className = '',
  maxWidth = 'md:max-w-6xl',
}: ModalProps) {
  // Manejador de tecla ESC y bloqueo de scroll en body
  useEffect(() => {
    if (!isOpen) return;

    document.body.classList.add('modal-open');

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.classList.remove('modal-open');
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Clases dinámicas de color para la etiqueta
  const tagColorClasses = {
    emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    sky: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
    red: 'text-[#FF2D00] bg-[#FF2D00]/10 border-[#FF2D00]/20',
  }[tagColor];

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-0 md:p-12 overflow-hidden bg-gradient-to-br from-[#002e52]/95 via-[#00172B]/95 to-black/98 backdrop-blur-2xl animate-fade-in transition-all duration-300"
      role="dialog"
      aria-modal="true"
    >
      {/* Fondo clickeable para cerrar modal */}
      <div
        className="absolute inset-0 cursor-pointer z-0"
        onClick={onClose}
        aria-label="Cerrar modal"
      />

      {/* Canvas Espacial de Fondo */}
      <SpaceBackground />

      {/* Contenedor del Modal */}
      <div
        className={`relative w-full h-full md:h-auto ${maxWidth} md:max-h-[92vh] bg-gradient-to-br from-[#002e52] via-[#00172B] to-[#000814] border-0 md:border border-white/20 rounded-none md:rounded-2xl p-5 md:p-8 shadow-[0_0_80px_rgba(0,0,0,0.9)] overflow-hidden animate-slide-up z-10 flex flex-col justify-between ${className}`}
      >
        {/* Resplandor radial decorativo idéntico al Hero */}
        <div className="absolute inset-0 z-0 pointer-events-none opacity-30 bg-[radial-gradient(circle_at_center,rgba(255,45,0,0.15)_0%,transparent_55%)]" />

        {/* Botón de Cierre */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 md:top-6 md:right-6 text-white/50 hover:text-white transition-colors duration-200 z-20 w-8 h-8 rounded-full border border-white/10 flex items-center justify-center bg-white/5 backdrop-blur-md"
          aria-label="Cerrar modal"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Contenido Principal */}
        <div className="relative z-10 flex-1 flex flex-col overflow-hidden">
          {/* Cabecera */}
          {(tag || title || description) && (
            <div className="mb-3 border-b border-white/10 pb-3 shrink-0">
              {tag && (
                <span
                  className={`inline-block text-[10px] sm:text-xs uppercase tracking-widest font-semibold mb-1.5 px-2.5 py-1 rounded-full border font-sans ${tagColorClasses}`}
                >
                  {tag}
                </span>
              )}
              {title && (
                <h3 className="text-2xl md:text-3xl font-bold text-white mb-1 tracking-tight font-sans">
                  {title}
                </h3>
              )}
              {description && (
                <p className="text-white/70 font-light text-xs md:text-sm max-w-2xl leading-relaxed">
                  {description}
                </p>
              )}
            </div>
          )}

          {/* Cuerpo inyectado */}
          {children}
        </div>

        {/* Footer / Barra de CTA inyectada */}
        {footer && (
          <div className="border-t border-white/10 pt-3 md:pt-4 flex flex-col sm:flex-row justify-between items-center gap-4 md:gap-6 mt-auto shrink-0 z-20">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
