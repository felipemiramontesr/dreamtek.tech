import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AuthModal } from '@/components/auth/AuthModal';
import { es } from '@/i18n/dictionaries/es';
import { en } from '@/i18n/dictionaries/en';

describe('AuthModal Component', () => {
  it('debe renderizar el modal de autenticación cuando isOpen es true', () => {
    render(<AuthModal isOpen={true} onClose={vi.fn()} dict={es} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Área de Clientes' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Iniciar Sesión' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Crear Cuenta' })).toBeInTheDocument();
  });

  it('debe alternar entre la pestaña de Iniciar Sesión y Crear Cuenta', () => {
    render(<AuthModal isOpen={true} onClose={vi.fn()} dict={es} />);

    // Por defecto inicia en modo Login
    expect(screen.queryByPlaceholderText('ej. Carlos Mendoza')).not.toBeInTheDocument();

    // Cambiar a pestaña Crear Cuenta
    const registerTab = screen.getByRole('button', { name: 'Crear Cuenta' });
    fireEvent.click(registerTab);

    expect(screen.getByPlaceholderText('ej. Carlos Mendoza')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('+52 55 1234 5678')).toBeInTheDocument();
  });

  it('debe validar la coincidencia de contraseñas en modo registro', () => {
    render(<AuthModal isOpen={true} onClose={vi.fn()} dict={es} initialMode="register" />);

    fireEvent.change(screen.getByPlaceholderText('ej. Carlos Mendoza'), {
      target: { value: 'Carlos Mendoza' },
    });
    fireEvent.change(screen.getByPlaceholderText('carlos@empresa.com'), {
      target: { value: 'carlos@empresa.com' },
    });
    fireEvent.change(screen.getAllByPlaceholderText('••••••••')[0], {
      target: { value: 'password123' },
    });
    fireEvent.change(screen.getAllByPlaceholderText('••••••••')[1], {
      target: { value: 'password456' },
    });

    const submitBtns = screen.getAllByRole('button', { name: 'Crear Cuenta' });
    const submitBtn = submitBtns[submitBtns.length - 1]; // El botón submit
    fireEvent.click(submitBtn);

    expect(screen.getByText('Las contraseñas no coinciden.')).toBeInTheDocument();
  });

  it('debe llamar a onClose cuando se hace clic en el botón de cerrar', () => {
    const handleClose = vi.fn();
    render(<AuthModal isOpen={true} onClose={handleClose} dict={es} />);

    const closeBtns = screen.getAllByLabelText('Cerrar modal');
    fireEvent.click(closeBtns[0]);

    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('debe soportar la internacionalización en inglés', () => {
    render(<AuthModal isOpen={true} onClose={vi.fn()} dict={en} />);

    expect(screen.getByRole('heading', { name: 'Client Area' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Log In' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Sign Up' })).toBeInTheDocument();
  });
});
