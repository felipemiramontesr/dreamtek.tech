import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthModal } from '@/components/auth/AuthModal';
import { es } from '@/i18n/dictionaries/es';
import { en } from '@/i18n/dictionaries/en';
import * as authClient from '@/lib/auth/client';

vi.mock('@/lib/auth/client', () => ({
  loginUser: vi.fn(),
  registerUser: vi.fn(),
}));

describe('AuthModal Component (100% Coverage Suite)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('debe renderizar el modal de autenticación cuando isOpen es true', () => {
    render(<AuthModal isOpen={true} onClose={vi.fn()} dict={es} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Área de Clientes' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Iniciar Sesión' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Crear Cuenta' })).toBeInTheDocument();
  });

  it('debe alternar entre la pestaña de Iniciar Sesión y Crear Cuenta usando tabs y enlaces inferiores', () => {
    render(<AuthModal isOpen={true} onClose={vi.fn()} dict={es} />);

    // Por defecto inicia en modo Login
    expect(screen.queryByPlaceholderText('ej. Carlos Mendoza')).not.toBeInTheDocument();

    // Cambiar a pestaña Crear Cuenta vía botón tab superior
    const registerTab = screen.getByRole('button', { name: 'Crear Cuenta' });
    fireEvent.click(registerTab);

    expect(screen.getByPlaceholderText('ej. Carlos Mendoza')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('+52 55 1234 5678')).toBeInTheDocument();

    // Cambiar de vuelta a Login vía enlace inferior
    const bottomLoginLink = screen.getByRole('button', {
      name: /¿Ya tienes una cuenta\? Inicia sesión aquí/i,
    });
    fireEvent.click(bottomLoginLink);
    expect(screen.queryByPlaceholderText('ej. Carlos Mendoza')).not.toBeInTheDocument();

    // Cambiar de vuelta a Registro vía enlace inferior
    const bottomRegisterLink = screen.getByRole('button', {
      name: /¿No tienes cuenta aún\? Regístrate aquí/i,
    });
    fireEvent.click(bottomRegisterLink);
    expect(screen.getByPlaceholderText('ej. Carlos Mendoza')).toBeInTheDocument();

    // Cambiar a Login vía tab superior
    const loginTab = screen.getByRole('button', { name: 'Iniciar Sesión' });
    fireEvent.click(loginTab);
    expect(screen.queryByPlaceholderText('ej. Carlos Mendoza')).not.toBeInTheDocument();

    // Click again when already in login mode (early return branch)
    fireEvent.click(loginTab);
    expect(screen.queryByPlaceholderText('ej. Carlos Mendoza')).not.toBeInTheDocument();
  });

  it('debe procesar el login exitoso y llamar a onLoginSuccess y onClose', async () => {
    const handleLoginSuccess = vi.fn();
    const handleClose = vi.fn();
    const mockUser = {
      id: 1,
      email: 'test@example.com',
      role: 'CLIENT' as const,
      full_name: 'Test',
    };

    vi.mocked(authClient.loginUser).mockResolvedValueOnce({
      token: 'jwt.token.123',
      user: mockUser,
    });

    render(
      <AuthModal
        isOpen={true}
        onClose={handleClose}
        dict={es}
        onLoginSuccess={handleLoginSuccess}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('carlos@empresa.com'), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'password123' },
    });

    const submitBtns = screen.getAllByRole('button', { name: 'Iniciar Sesión' });
    fireEvent.click(submitBtns[submitBtns.length - 1]);

    await waitFor(() => {
      expect(authClient.loginUser).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
      });
      expect(handleLoginSuccess).toHaveBeenCalledWith(mockUser);
      expect(handleClose).toHaveBeenCalled();
    });
  });

  it('debe mostrar mensaje de error si el login falla', async () => {
    vi.mocked(authClient.loginUser).mockRejectedValueOnce(new Error('Credenciales inválidas'));

    render(<AuthModal isOpen={true} onClose={vi.fn()} dict={es} />);

    fireEvent.change(screen.getByPlaceholderText('carlos@empresa.com'), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'wrongpass' },
    });

    const submitBtns = screen.getAllByRole('button', { name: 'Iniciar Sesión' });
    fireEvent.click(submitBtns[submitBtns.length - 1]);

    await waitFor(() => {
      expect(screen.getByText('Credenciales inválidas')).toBeInTheDocument();
    });
  });

  it('debe validar coincidencia de contraseñas y registrar usuario con teléfono opcional', async () => {
    const handleRegisterSuccess = vi.fn();
    const handleClose = vi.fn();
    const mockUser = {
      id: 2,
      email: 'new@example.com',
      role: 'CLIENT' as const,
      full_name: 'New User',
    };

    vi.mocked(authClient.registerUser).mockResolvedValueOnce({
      token: 'jwt.token.456',
      user: mockUser,
    });

    render(
      <AuthModal
        isOpen={true}
        onClose={handleClose}
        dict={es}
        initialMode="register"
        onRegisterSuccess={handleRegisterSuccess}
      />,
    );

    // Mismatch test first
    fireEvent.change(screen.getByPlaceholderText('ej. Carlos Mendoza'), {
      target: { value: 'New User' },
    });
    fireEvent.change(screen.getByPlaceholderText('carlos@empresa.com'), {
      target: { value: 'new@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('+52 55 1234 5678'), {
      target: { value: '+52 55 9876 5432' },
    });
    fireEvent.change(screen.getAllByPlaceholderText('••••••••')[0], {
      target: { value: 'secret123' },
    });
    fireEvent.change(screen.getAllByPlaceholderText('••••••••')[1], {
      target: { value: 'secret999' },
    });

    const submitBtns = screen.getAllByRole('button', { name: 'Crear Cuenta' });
    fireEvent.click(submitBtns[submitBtns.length - 1]);

    expect(screen.getByText('Las contraseñas no coinciden.')).toBeInTheDocument();

    // Fix password and submit valid registration
    fireEvent.change(screen.getAllByPlaceholderText('••••••••')[1], {
      target: { value: 'secret123' },
    });
    fireEvent.click(submitBtns[submitBtns.length - 1]);

    await waitFor(() => {
      expect(authClient.registerUser).toHaveBeenCalledWith({
        email: 'new@example.com',
        password: 'secret123',
        full_name: 'New User',
        phone: '+52 55 9876 5432',
      });
      expect(handleRegisterSuccess).toHaveBeenCalledWith(mockUser);
      expect(handleClose).toHaveBeenCalled();
    });
  });

  it('debe capturar errores en el registro y mostrar el mensaje correspondiente', async () => {
    vi.mocked(authClient.registerUser).mockRejectedValueOnce(
      new Error('El correo ya está registrado'),
    );

    render(<AuthModal isOpen={true} onClose={vi.fn()} dict={es} initialMode="register" />);

    fireEvent.change(screen.getByPlaceholderText('ej. Carlos Mendoza'), {
      target: { value: 'Existing User' },
    });
    fireEvent.change(screen.getByPlaceholderText('carlos@empresa.com'), {
      target: { value: 'existing@example.com' },
    });
    fireEvent.change(screen.getAllByPlaceholderText('••••••••')[0], {
      target: { value: 'secret123' },
    });
    fireEvent.change(screen.getAllByPlaceholderText('••••••••')[1], {
      target: { value: 'secret123' },
    });

    const submitBtns = screen.getAllByRole('button', { name: 'Crear Cuenta' });
    fireEvent.click(submitBtns[submitBtns.length - 1]);

    await waitFor(() => {
      expect(screen.getByText('El correo ya está registrado')).toBeInTheDocument();
    });
  });

  it('debe validar campos vacíos en modo login y en modo registro', () => {
    const { container } = render(<AuthModal isOpen={true} onClose={vi.fn()} dict={es} />);

    // In login mode, submit empty form
    const form = container.querySelector('form');
    if (form) {
      fireEvent.submit(form);
    }
    expect(screen.getByText(es.auth.fillAllFields)).toBeInTheDocument();

    // Switch to register mode via tab
    fireEvent.click(screen.getByRole('button', { name: 'Crear Cuenta' }));
    fireEvent.change(screen.getByPlaceholderText('ej. Carlos Mendoza'), {
      target: { value: 'Carlos Mendoza' },
    });
    // Missing email and passwords
    if (form) {
      fireEvent.submit(form);
    }
    expect(screen.getByText(es.auth.fillAllFields)).toBeInTheDocument();
  });

  it('debe usar textos por defecto cuando dict.auth no está definido', () => {
    render(<AuthModal isOpen={true} onClose={vi.fn()} dict={{} as unknown as typeof es} />);

    expect(screen.getByRole('heading', { name: 'Área de Clientes' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Iniciar Sesión' }).length).toBeGreaterThan(0);
    expect(screen.getByText('¿No tienes cuenta aún? Regístrate aquí')).toBeInTheDocument();

    // Switch to register
    fireEvent.click(screen.getByRole('button', { name: 'Crear Cuenta' }));
    expect(screen.getAllByRole('button', { name: 'Crear Cuenta' }).length).toBeGreaterThan(0);
    expect(screen.getByText('¿Ya tienes una cuenta? Inicia sesión aquí')).toBeInTheDocument();
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
