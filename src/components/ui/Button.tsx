import React from 'react';

/**
 * Propiedades para el componente Button inspirado en Antigravity UI.
 * Extiende las propiedades nativas de un botón HTML para alta accesibilidad.
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Variante visual del botón. 'primary' es el sólido Teck Red. 'outline' es un botón estilo glassmorphism. */
  variant?: 'primary' | 'outline';
  /** Tamaño del botón */
  size?: 'sm' | 'md' | 'lg';
  /** Contenido del botón */
  children: React.ReactNode;
}

/**
 * Componente Button interactivo, de alto rendimiento y accesible.
 * Utiliza utilidades de Tailwind v4.
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'primary', size = 'md', children, ...props }, ref) => {
    
    const baseStyles = "inline-flex items-center justify-center font-bold tracking-wide transition-all duration-300 rounded-sm outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#00213D] disabled:opacity-50 disabled:cursor-not-allowed";
    
    const variants = {
      primary: "bg-[#FF2D00] text-white hover:bg-[#FF2D00]/90 border border-transparent shadow-[0_0_15px_rgba(255,45,0,0.3)] hover:shadow-[0_0_25px_rgba(255,45,0,0.5)] focus:ring-[#FF2D00]",
      outline: "bg-transparent text-white border border-white/30 hover:bg-white/10 hover:border-white/50 backdrop-blur-md focus:ring-white/50"
    };

    const sizes = {
      sm: "px-4 py-2 text-sm",
      md: "px-6 py-3 text-base",
      lg: "px-8 py-4 text-lg"
    };

    const classes = `${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`;

    return (
      <button
        ref={ref}
        className={classes}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
