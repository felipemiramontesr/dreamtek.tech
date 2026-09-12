import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthModal } from '@/components/auth/AuthModal';
import { es } from '@/i18n/dictionaries/es';
import { en } from '@/i18n/dictionaries/en';
import * as authClient from '@/lib/auth/client';

vi.mock('@/lib/auth/client', () => ({
  loginUser: vi.fn(),
  registerUser: vi.fn(),
  verifyMfa: vi.fn(),
  sendMfaEmailOtp: vi.fn(),
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

  it('debe usar textos por defecto cuando dict.auth no está definido y probar fallbacks de error', async () => {
    const { container } = render(
      <AuthModal isOpen={true} onClose={vi.fn()} dict={{} as unknown as typeof es} />,
    );

    expect(screen.getByRole('heading', { name: 'Área de Clientes' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Iniciar Sesión' }).length).toBeGreaterThan(0);
    expect(screen.getByText('¿No tienes cuenta aún? Regístrate aquí')).toBeInTheDocument();

    // 1. Submit empty login form with no dict.auth
    const form = container.querySelector('form');
    if (form) {
      fireEvent.submit(form);
    }
    expect(screen.getByText('Por favor completa todos los campos requeridos.')).toBeInTheDocument();

    // 2. Login error with non-Error object
    vi.mocked(authClient.loginUser).mockRejectedValueOnce({});
    fireEvent.change(screen.getByPlaceholderText('carlos@empresa.com'), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'password123' },
    });
    if (form) {
      fireEvent.submit(form);
    }
    await waitFor(() => {
      expect(screen.getByText('Error al iniciar sesión.')).toBeInTheDocument();
    });

    // 3. Switch to register mode
    fireEvent.click(screen.getByRole('button', { name: 'Crear Cuenta' }));
    expect(screen.getAllByRole('button', { name: 'Crear Cuenta' }).length).toBeGreaterThan(0);
    expect(screen.getByText('¿Ya tienes una cuenta? Inicia sesión aquí')).toBeInTheDocument();

    // 4. Submit empty register form with no dict.auth
    if (form) {
      fireEvent.submit(form);
    }
    expect(screen.getByText('Por favor completa todos los campos requeridos.')).toBeInTheDocument();

    // 5. Password mismatch with no dict.auth
    fireEvent.change(screen.getByPlaceholderText('ej. Carlos Mendoza'), {
      target: { value: 'User' },
    });
    fireEvent.change(screen.getByPlaceholderText('carlos@empresa.com'), {
      target: { value: 'user@example.com' },
    });
    fireEvent.change(screen.getAllByPlaceholderText('••••••••')[0], {
      target: { value: 'pass1' },
    });
    fireEvent.change(screen.getAllByPlaceholderText('••••••••')[1], {
      target: { value: 'pass2' },
    });
    if (form) {
      fireEvent.submit(form);
    }
    expect(screen.getByText('Las contraseñas no coinciden.')).toBeInTheDocument();

    // 6. Register error with non-Error object
    vi.mocked(authClient.registerUser).mockRejectedValueOnce({});
    fireEvent.change(screen.getAllByPlaceholderText('••••••••')[1], {
      target: { value: 'pass1' },
    });
    if (form) {
      fireEvent.submit(form);
    }
    await waitFor(() => {
      expect(screen.getByText('Error al crear la cuenta.')).toBeInTheDocument();
    });

    // 7. Test MFA mode with no dict.auth
    vi.mocked(authClient.loginUser).mockResolvedValueOnce({
      status: '2fa_required',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar Sesión' }));
    fireEvent.change(container.querySelector('input[type="email"]')!, {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(container.querySelector('input[type="password"]')!, {
      target: { value: 'password123' },
    });
    const loginForm = container.querySelector('form')!;
    fireEvent.submit(loginForm);

    await waitFor(() => {
      expect(screen.getAllByText('Verificación en Dos Pasos').length).toBeGreaterThan(0);
      expect(
        screen.getByText('Introduce el código para verificar tu identidad'),
      ).toBeInTheDocument();
      expect(screen.getByText('Google Auth')).toBeInTheDocument();
      expect(screen.getByText('Correo')).toBeInTheDocument();
      expect(screen.getByText('Recuperación')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('000000')).toBeInTheDocument();
      expect(screen.getByText('Verificar y Acceder')).toBeInTheDocument();
    });

    // Switch to recovery with no dict.auth
    fireEvent.click(screen.getByRole('button', { name: 'Recuperación' }));
    expect(screen.getByPlaceholderText('XXXXX-XXXXX')).toBeInTheDocument();

    // Switch to email with no dict.auth
    fireEvent.click(screen.getByRole('button', { name: 'Correo' }));
    expect(screen.getByRole('button', { name: 'Enviar código a mi correo' })).toBeInTheDocument();

    // Send email OTP with no message and no dict.auth -> tests fallback 'Código enviado a tu correo.'
    vi.mocked(authClient.sendMfaEmailOtp).mockResolvedValueOnce({ status: 'success' });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar código a mi correo' }));
    await waitFor(() => {
      expect(screen.getByText('Código enviado a tu correo.')).toBeInTheDocument();
    });

    // Send email OTP with non-Error reject -> tests fallback 'Error al solicitar código por correo.'
    vi.mocked(authClient.sendMfaEmailOtp).mockRejectedValueOnce({});
    fireEvent.click(screen.getByRole('button', { name: 'Enviar código a mi correo' }));
    await waitFor(() => {
      expect(screen.getByText('Error al solicitar código por correo.')).toBeInTheDocument();
    });

    // Submit empty MFA code -> tests fallback 'Por favor ingresa el código de verificación.'
    const mfaForm = container.querySelector('form')!;
    fireEvent.submit(mfaForm);
    expect(screen.getByText('Por favor ingresa el código de verificación.')).toBeInTheDocument();

    // Submit MFA code with non-Error reject -> tests fallback 'Error al verificar código 2FA.'
    vi.mocked(authClient.verifyMfa).mockRejectedValueOnce({});
    fireEvent.change(screen.getByPlaceholderText('000000'), { target: { value: '123456' } });
    fireEvent.submit(mfaForm);
    await waitFor(() => {
      expect(screen.getByText('Error al verificar código 2FA.')).toBeInTheDocument();
    });

    // Click back to login with no dict.auth
    fireEvent.click(screen.getByRole('button', { name: 'Volver a inicio de sesión' }));
    expect(
      screen.queryByText('Introduce el código para verificar tu identidad'),
    ).not.toBeInTheDocument();
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

  it('debe transicionar a modo 2FA cuando loginUser retorna 2fa_required y permitir verificar TOTP', async () => {
    const handleLoginSuccess = vi.fn();
    const handleClose = vi.fn();
    vi.mocked(authClient.loginUser).mockResolvedValueOnce({
      status: '2fa_required',
      message: 'Autenticación de dos factores requerida.',
      available_methods: ['TOTP', 'EMAIL', 'RECOVERY'],
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
      target: { value: 'admin@dreamtek.tech' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'password123' },
    });

    const submitBtns = screen.getAllByRole('button', { name: 'Iniciar Sesión' });
    fireEvent.click(submitBtns[submitBtns.length - 1]);

    await waitFor(() => {
      expect(screen.getAllByText('Verificación en Dos Pasos').length).toBeGreaterThan(0);
    });

    // Cambiar a pestaña Correo y solicitar código
    const emailTab = screen.getByRole('button', { name: 'Código por Correo' });
    fireEvent.click(emailTab);

    vi.mocked(authClient.sendMfaEmailOtp).mockResolvedValueOnce({
      status: 'success',
      message: 'Código enviado a tu correo.',
    });

    const sendEmailBtn = screen.getByRole('button', { name: 'Enviar código a mi correo' });
    fireEvent.click(sendEmailBtn);

    await waitFor(() => {
      expect(screen.getByText('Código enviado a tu correo.')).toBeInTheDocument();
    });

    // Error al solicitar código
    vi.mocked(authClient.sendMfaEmailOtp).mockRejectedValueOnce(new Error('Rate limit excedido'));
    fireEvent.click(sendEmailBtn);
    await waitFor(() => {
      expect(screen.getByText('Rate limit excedido')).toBeInTheDocument();
    });

    // Cambiar a pestaña Recuperación
    const recoveryTab = screen.getByRole('button', { name: 'Código de Recuperación' });
    fireEvent.click(recoveryTab);
    expect(screen.getByPlaceholderText('XXXXX-XXXXX')).toBeInTheDocument();

    // Cambiar de vuelta a Google Auth
    const totpTab = screen.getByRole('button', { name: 'Google Authenticator' });
    fireEvent.click(totpTab);

    // Intentar verificar con campo vacío
    const form = screen.getByRole('button', { name: 'Verificar y Acceder' }).closest('form')!;
    fireEvent.submit(form);
    expect(screen.getByText('Por favor completa todos los campos requeridos.')).toBeInTheDocument();

    // Ingresar código válido y verificar con estado de carga
    let resolveVerify!: (val: unknown) => void;
    vi.mocked(authClient.verifyMfa).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveVerify = resolve;
      }),
    );
    const mfaInput = screen.getByPlaceholderText('Código de 6 dígitos');
    fireEvent.change(mfaInput, { target: { value: '123456' } });
    fireEvent.submit(form);

    expect(screen.getByText('Verificando...')).toBeInTheDocument();
    resolveVerify({ status: 'success', user: { id: 'u1' } });

    await waitFor(() => {
      expect(authClient.verifyMfa).toHaveBeenCalledWith({ code: '123456', method: 'TOTP' });
      expect(handleLoginSuccess).toHaveBeenCalled();
      expect(handleClose).toHaveBeenCalled();
    });
  });

  it('debe manejar errores de verificación 2FA y permitir volver al login', async () => {
    vi.mocked(authClient.loginUser).mockResolvedValueOnce({
      status: '2fa_required',
    });
    vi.mocked(authClient.verifyMfa).mockRejectedValueOnce(new Error('Código incorrecto'));

    render(<AuthModal isOpen={true} onClose={vi.fn()} dict={es} />);

    fireEvent.change(screen.getByPlaceholderText('carlos@empresa.com'), {
      target: { value: 'admin@dreamtek.tech' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'password123' },
    });
    const submitBtns = screen.getAllByRole('button', { name: 'Iniciar Sesión' });
    fireEvent.click(submitBtns[submitBtns.length - 1]);

    await waitFor(() => {
      expect(screen.getAllByText('Verificación en Dos Pasos').length).toBeGreaterThan(0);
    });

    const mfaForm = screen.getByRole('button', { name: 'Verificar y Acceder' }).closest('form')!;
    fireEvent.change(screen.getByPlaceholderText('Código de 6 dígitos'), {
      target: { value: '000000' },
    });
    fireEvent.submit(mfaForm);

    await waitFor(() => {
      expect(screen.getByText('Código incorrecto')).toBeInTheDocument();
    });

    // Volver a inicio de sesión
    const backBtn = screen.getByRole('button', { name: 'Volver a inicio de sesión' });
    fireEvent.click(backBtn);
    expect(
      screen.queryByText('Introduce el código para verificar tu identidad'),
    ).not.toBeInTheDocument();
  });
});
