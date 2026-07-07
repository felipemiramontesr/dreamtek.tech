import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Navbar } from '@/components/layout/Navbar';

// Mock next/image to prevent issues with Vitest and dynamic Next.js optimization
vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text, @typescript-eslint/no-explicit-any
  default: (props: any) => <img {...props} />,
}));

// Mock next/navigation dynamically
let mockPathname = '/';
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

describe('Navbar Component', () => {
  beforeEach(() => {
    mockPathname = '/';
  });

  describe('Comportamiento en la Landing Page Principal', () => {
    it('debe renderizar el logotipo y los enlaces principales de escritorio y móvil', () => {
      render(<Navbar />);

      expect(screen.getByText(/Dreamtek/)).toBeInTheDocument();

      // Enlaces principales (ambas instancias: escritorio y móvil)
      expect(screen.getAllByRole('link', { name: 'Servicios' })).toHaveLength(2);
      expect(screen.getAllByRole('link', { name: 'Productos' })).toHaveLength(2);
      expect(screen.getAllByRole('link', { name: 'Diferencial' })).toHaveLength(2);
      expect(screen.getAllByRole('link', { name: 'Contacto' })).toHaveLength(2);
    });

    it('debe abrir y cerrar el menú móvil al hacer clic en el botón de hamburguesa', () => {
      render(<Navbar />);

      const menuButton = screen.getByRole('button', { name: 'Abrir menú' });
      expect(menuButton).toBeInTheDocument();

      // Hacemos clic para abrir
      fireEvent.click(menuButton);
      expect(menuButton).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByRole('button', { name: 'Cerrar menú' })).toBeInTheDocument();

      // Hacemos clic para cerrar
      const closeButton = screen.getByRole('button', { name: 'Cerrar menú' });
      fireEvent.click(closeButton);
      expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    });

    it('debe cerrar el menú móvil al hacer clic en un enlace de navegación móvil', () => {
      render(<Navbar />);

      const menuButton = screen.getByRole('button', { name: 'Abrir menú' });
      fireEvent.click(menuButton);

      // Buscamos los enlaces móviles (segundo es del drawer móvil)
      const navLinks = screen.getAllByRole('link', { name: 'Servicios' });
      fireEvent.click(navLinks[1]);

      expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    });
  });

  describe('Comportamiento en Páginas Legales', () => {
    it('debe renderizar la cabecera simplificada (únicamente logotipo y Regresar al sitio)', () => {
      mockPathname = '/cookies';
      render(<Navbar />);

      expect(screen.getByText(/Dreamtek/)).toBeInTheDocument();

      // Debe mostrar el botón/enlace de Regresar al sitio
      const backLink = screen.getByRole('link', { name: /Regresar al sitio/i });
      expect(backLink).toBeInTheDocument();
      expect(backLink).toHaveAttribute('href', '/');

      // No debe contener ninguno de los enlaces del menú principal
      expect(screen.queryByRole('link', { name: 'Servicios' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Productos' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Diferencial' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Contacto' })).not.toBeInTheDocument();

      // No debe contener el botón de hamburguesa móvil
      expect(screen.queryByRole('button', { name: 'Abrir menú' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Cerrar menú' })).not.toBeInTheDocument();
    });
  });
});
