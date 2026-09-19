import React from 'react';

/**
 * Propiedades del GlassCard component.
 */
export interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  /** Permite destacar la tarjeta usando un sutil resplandor o borde más brillante */
  featured?: boolean;
  /** Habilita o deshabilita los efectos de hover interactivos */
  hover?: boolean;
}

/**
 * GlassCard
 * Componente contenedor que implementa Glassmorphism.
 * Reutiliza las utilidades CSS definidas en globals.css
 */
export const GlassCard = React.forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className = '', featured = false, hover = true, children, ...props }, ref) => {
    // glass-panel y glass-panel-hover están definidos en globals.css
    const hoverClasses = hover ? 'glass-panel-hover group' : '';
    const baseClasses =
      `glass-panel ${hoverClasses} p-8 rounded-2xl flex flex-col relative overflow-hidden`.trim();

    // Si la tarjeta es destacada (ej. Ciberseguridad), añadimos un borde rojo sutil y/o sombra
    const featuredClasses = featured
      ? '!border-[#FF2D00]/40 shadow-[0_0_30px_rgba(255,45,0,0.15)]'
      : '';

    return (
      <div ref={ref} className={`${baseClasses} ${featuredClasses} ${className}`.trim()} {...props}>
        {/* Efecto de resplandor interno en hover */}
        {hover && (
          <div
            data-testid="glass-card-glow"
            className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
          />
        )}

        <div className="relative z-10 w-full h-full flex flex-col">{children}</div>
      </div>
    );
  },
);

GlassCard.displayName = 'GlassCard';
