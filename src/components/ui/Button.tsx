import React from 'react';

/**
 * @interface ButtonProps
 * @description Define la estructura estricta para el componente de interacción primaria (Button).
 * Extiende las propiedades nativas de un botón HTML para garantizar accesibilidad absoluta (WAI-ARIA).
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * @property {('primary'|'outline')} variant
   * @description Determina la apariencia base del botón utilizando Tailwind tokens.
   * - `primary`: Sólido corporativo (Teck Red) con sombreado de resplandor interactivo.
   * - `outline`: Efecto Glassmorphism (borde translúcido con desenfoque de fondo).
   * @default 'primary'
   */
  variant?: 'primary' | 'outline';
  /**
   * @property {('sm'|'md'|'lg')} size
   * @description Modela la escala tipográfica y el espaciado interno (padding) del elemento.
   * @default 'md'
   */
  size?: 'sm' | 'md' | 'lg';
  /**
   * @property {React.ReactNode} children
   * @description Nodo o cadena de texto proyectada dentro del contenedor flex del botón.
   */
  children: React.ReactNode;
}

/**
 * @component Button
 * @description Componente interactivo de nivel primitivo, de alto rendimiento y puramente composable.
 * Inyecta clases dinámicas de Tailwind aplicando el diseño "Antigravity UI" para Dreamtek.tech.
 *
 * @example
 * ```tsx
 * // Uso en Glassmorphism (Teck Red Sólido o Outline translúcido)
 * <Button variant="outline" size="lg" disabled>Aguardando...</Button>
 * ```
 *
 * @returns {JSX.Element} Un elemento semántico HTML `<button>` blindado para interacciones por teclado y ratón.
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'primary', size = 'md', children, ...props }, ref) => {
    const baseStyles =
      'inline-flex items-center justify-center font-bold tracking-wide transition-all duration-300 rounded-sm outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#00213D] disabled:opacity-50 disabled:cursor-not-allowed';

    const variants = {
      primary:
        'bg-[#FF2D00] text-white hover:bg-[#FF2D00]/90 border border-transparent shadow-[0_0_15px_rgba(255,45,0,0.3)] hover:shadow-[0_0_25px_rgba(255,45,0,0.5)] focus:ring-[#FF2D00]',
      outline:
        'bg-transparent text-white border border-white/30 hover:bg-white/10 hover:border-white/50 backdrop-blur-md focus:ring-white/50',
    };

    const sizes = {
      sm: 'px-4 py-2 text-sm',
      md: 'px-6 py-3 text-base',
      lg: 'px-8 py-4 text-lg',
    };

    const classes = `${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`;

    return (
      <button ref={ref} className={classes} {...props}>
        {children}
      </button>
    );
  },
);

Button.displayName = 'Button';
