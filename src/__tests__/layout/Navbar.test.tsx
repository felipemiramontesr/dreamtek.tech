import { render, screen, fireEvent, act } from '@testing-library/react';
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

describe('Navbar Component (100% Coverage Suite)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockPathname = '/';
    window.scrollTo = vi.fn();
    localStorage.clear();
  });

  it('debe renderizar el logotipo y los enlaces principales de escritorio y móvil', () => {
    render(<Navbar dict={es} lang="es" />);

    expect(screen.getByText('Dreamtek')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: es.navbar.home }).length).toBeGreaterThan(0);
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

  it('debe cerrar el menú móvil con backdrop click y al hacer toggle en el botón', () => {
    const { container } = render(<Navbar dict={es} lang="es" />);

    // Open mobile menu
    fireEvent.click(screen.getByRole('button', { name: /Abrir menú/i }));
    expect(screen.getByRole('button', { name: /Cerrar menú/i })).toBeInTheDocument();

    // Click backdrop
    const backdrop = container.querySelector('.fixed.inset-0.bg-black\\/60');
    if (backdrop) {
      fireEvent.click(backdrop);
      expect(screen.getByRole('button', { name: /Abrir menú/i })).toBeInTheDocument();
    }

    // Open again and close via close button
    fireEvent.click(screen.getByRole('button', { name: /Abrir menú/i }));
    fireEvent.click(screen.getByRole('button', { name: /Cerrar menú/i }));
    expect(screen.getByRole('button', { name: /Abrir menú/i })).toBeInTheDocument();
  });

  it('debe llamar a onOpenAuthModal al hacer clic en Área de Clientes', () => {
    const onOpenAuthModal = vi.fn();
    render(<Navbar dict={es} lang="es" onOpenAuthModal={onOpenAuthModal} />);

    const authButton = screen.getByRole('button', { name: /área de clientes/i });
    fireEvent.click(authButton);
    expect(onOpenAuthModal).toHaveBeenCalledTimes(1);
  });

  it('debe ejecutar los cambios de idioma en el menú móvil y en la píldora de escritorio (ES / EN)', () => {
    render(<Navbar dict={es} lang="es" />);

    // Desktop language toggle (first elements in DOM)
    const desktopEn = screen.getAllByRole('link', { name: 'EN' })[0];
    fireEvent.click(desktopEn);
    expect(localStorage.getItem('dreamtek_lang_preference')).toBe('en');

    const desktopEs = screen.getAllByRole('link', { name: 'ES' })[0];
    fireEvent.click(desktopEs);
    expect(localStorage.getItem('dreamtek_lang_preference')).toBe('es');

    // Open mobile menu
    fireEvent.click(screen.getByRole('button', { name: /Abrir menú/i }));

    const enLinks = screen.getAllByRole('link', { name: 'EN' });
    const mobileEn = enLinks[enLinks.length - 1];
    fireEvent.click(mobileEn);
    expect(localStorage.getItem('dreamtek_lang_preference')).toBe('en');

    // Open menu again
    fireEvent.click(screen.getByRole('button', { name: /Abrir menú/i }));

    const esLinks = screen.getAllByRole('link', { name: 'ES' });
    const mobileEs = esLinks[esLinks.length - 1];
    fireEvent.click(mobileEs);
    expect(localStorage.getItem('dreamtek_lang_preference')).toBe('es');
  });

  it('debe cerrar el menú móvil al hacer clic en un enlace de navegación móvil', () => {
    render(<Navbar dict={es} lang="es" />);

    const menuButton = screen.getByRole('button', { name: /Abrir menú/i });
    fireEvent.click(menuButton);

    const mobileServicesLinks = screen.getAllByRole('link', { name: es.navbar.services });
    fireEvent.click(mobileServicesLinks[mobileServicesLinks.length - 1]);

    expect(screen.getByRole('button', { name: /Abrir menú/i })).toBeInTheDocument();
  });

  it('debe navegar al inicio al hacer clic en el logotipo con debounce timer', () => {
    vi.useFakeTimers();
    render(<Navbar dict={es} lang="es" />);

    const logoBtn = screen.getByRole('button', { name: /Dreamtek/i });
    fireEvent.click(logoBtn);

    expect(pushMock).toHaveBeenCalledWith('/', { scroll: false });
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(window.scrollTo).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('debe navegar al inicio en inglés al hacer clic en el logotipo con lang="en"', () => {
    vi.useFakeTimers();
    render(<Navbar dict={en} lang="en" />);

    const logoBtn = screen.getByRole('button', { name: /Dreamtek/i });
    fireEvent.click(logoBtn);

    expect(pushMock).toHaveBeenCalledWith('/en', { scroll: false });
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(window.scrollTo).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('debe renderizar el botón de retorno al sitio en páginas legales y calcular ruta toggle correcta', () => {
    vi.useFakeTimers();
    mockPathname = '/privacidad';

    const { rerender } = render(<Navbar dict={es} lang="es" />);

    const returnBtn = screen.getByRole('button', { name: new RegExp(es.navbar.returnSite, 'i') });
    expect(returnBtn).toBeInTheDocument();

    fireEvent.click(returnBtn);
    expect(pushMock).toHaveBeenCalledWith('/', { scroll: false });
    act(() => {
      vi.advanceTimersByTime(150);
    });

    // English legal page
    mockPathname = '/en/terminos';
    rerender(<Navbar dict={en} lang="en" />);
    const enReturnBtn = screen.getByRole('button', { name: new RegExp(en.navbar.returnSite, 'i') });
    fireEvent.click(enReturnBtn);
    expect(pushMock).toHaveBeenCalledWith('/en', { scroll: false });
    act(() => {
      vi.advanceTimersByTime(150);
    });
    vi.useRealTimers();

    // Non-root landing page path toggle to English (exercises /en${pathname})
    mockPathname = '/demo';
    rerender(<Navbar dict={es} lang="es" />);
    const demoEnLink = screen.getAllByRole('link', { name: 'EN' })[0];
    expect(demoEnLink.getAttribute('href')).toBe('/en/demo');

    // Root page path toggle to English
    mockPathname = '/';
    rerender(<Navbar dict={es} lang="es" />);
    const desktopEnLink = screen.getAllByRole('link', { name: 'EN' })[0];
    expect(desktopEnLink.getAttribute('href')).toBe('/en');

    // /en home toggle to Spanish
    mockPathname = '/en';
    rerender(<Navbar dict={en} lang="en" />);
    const desktopEsLink = screen.getAllByRole('link', { name: 'ES' })[0];
    expect(desktopEsLink.getAttribute('href')).toBe('/');
  });
});
