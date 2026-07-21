import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Navbar } from '@/components/layout/Navbar';
import { es } from '@/i18n/dictionaries/es';
import { en } from '@/i18n/dictionaries/en';

const pushMock = vi.fn();
let mockPathname = '/';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => mockPathname,
}));

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => <img alt="" {...props} />,
}));

describe('Navbar Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockPathname = '/';
    window.scrollTo = vi.fn();
    localStorage.clear();
  });

  it('debe renderizar el logotipo y los enlaces principales de escritorio y móvil', () => {
    render(<Navbar dict={es} lang="es" />);

    expect(screen.getByText('Dreamtek')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: es.navbar.services }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: es.navbar.products }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: es.navbar.differential }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: es.navbar.contact }).length).toBeGreaterThan(0);
  });

  it('debe abrir y cerrar el menú móvil al hacer clic en el botón de hamburguesa', () => {
    render(<Navbar dict={es} lang="es" />);

    const menuButton = screen.getByRole('button', { name: /Abrir menú/i });
    expect(menuButton).toBeInTheDocument();

    fireEvent.click(menuButton);
    expect(screen.getByRole('button', { name: /Cerrar menú/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Cerrar menú/i }));
    expect(screen.getByRole('button', { name: /Abrir menú/i })).toBeInTheDocument();
  });

  it('debe cerrar el menú móvil al hacer clic en un enlace de navegación móvil', () => {
    render(<Navbar dict={es} lang="es" />);

    const menuButton = screen.getByRole('button', { name: /Abrir menú/i });
    fireEvent.click(menuButton);

    const mobileServicesLinks = screen.getAllByRole('link', { name: es.navbar.services });
    fireEvent.click(mobileServicesLinks[mobileServicesLinks.length - 1]);

    expect(screen.getByRole('button', { name: /Abrir menú/i })).toBeInTheDocument();
  });

  it('debe actualizar localStorage al hacer clic en los cambiadores de idioma (ES / EN)', () => {
    render(<Navbar dict={es} lang="es" />);

    const enLinks = screen.getAllByRole('link', { name: 'EN' });
    fireEvent.click(enLinks[0]);

    expect(localStorage.getItem('dreamtek_lang_preference')).toBe('en');

    const esLinks = screen.getAllByRole('link', { name: 'ES' });
    fireEvent.click(esLinks[0]);

    expect(localStorage.getItem('dreamtek_lang_preference')).toBe('es');
  });

  it('debe navegar al inicio al hacer clic en el logotipo', () => {
    render(<Navbar dict={es} lang="es" />);

    const logoBtn = screen.getByRole('button', { name: /Dreamtek/i });
    fireEvent.click(logoBtn);

    expect(pushMock).toHaveBeenCalledWith('/', { scroll: false });
  });

  it('debe renderizar el botón de retorno al sitio cuando se encuentra en páginas legales', () => {
    mockPathname = '/privacidad';

    render(<Navbar dict={es} lang="es" />);

    const returnBtn = screen.getByRole('button', { name: new RegExp(es.navbar.returnSite, 'i') });
    expect(returnBtn).toBeInTheDocument();

    fireEvent.click(returnBtn);
    expect(pushMock).toHaveBeenCalledWith('/', { scroll: false });
  });

  it('debe manejar la navegación de retorno al sitio en idioma inglés', () => {
    mockPathname = '/en/privacidad';

    render(<Navbar dict={en} lang="en" />);

    const returnBtn = screen.getByRole('button', { name: new RegExp(en.navbar.returnSite, 'i') });
    expect(returnBtn).toBeInTheDocument();

    fireEvent.click(returnBtn);
    expect(pushMock).toHaveBeenCalledWith('/en', { scroll: false });
  });
});
