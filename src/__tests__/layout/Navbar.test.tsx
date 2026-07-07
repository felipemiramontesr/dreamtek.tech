import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Navbar } from '@/components/layout/Navbar';

// Mock next/image to prevent issues with Vitest and dynamic Next.js optimization
vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text, @typescript-eslint/no-explicit-any
  default: (props: any) => <img {...props} />,
}));

describe('Navbar Component', () => {
  it('debe renderizar el logotipo y los enlaces principales de escritorio', () => {
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

    // Buscamos los enlaces móviles
    const navLinks = screen.getAllByRole('link', { name: 'Servicios' });
    // El primer enlace es escritorio, el segundo es del drawer móvil
    fireEvent.click(navLinks[1]);

    expect(menuButton).toHaveAttribute('aria-expanded', 'false');
  });
});
