import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClientMfaSettingsWidget } from '@/components/dashboard/client/ClientMfaSettingsWidget';
import * as authClient from '@/lib/auth/client';

vi.mock('@/lib/auth/client', () => ({
  getMfaStatus: vi.fn(),
  setupMfa: vi.fn(),
  enableMfa: vi.fn(),
  disableMfa: vi.fn(),
}));

describe('ClientMfaSettingsWidget Component Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it('renders disabled state correctly and displays Configurar 2FA button', async () => {
    vi.mocked(authClient.getMfaStatus).mockResolvedValueOnce({
      status: 'success',
      is_2fa_enabled: false,
    });

    render(<ClientMfaSettingsWidget />);

    await waitFor(() => {
      expect(screen.getByText('Desactivado')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Configurar 2FA' })).toBeInTheDocument();
    });
  });

  it('renders enabled state with remaining recovery codes and enrolled date', async () => {
    vi.mocked(authClient.getMfaStatus).mockResolvedValueOnce({
      status: 'success',
      is_2fa_enabled: true,
      mfa_enrolled_at: '2026-09-12T10:00:00Z',
      remaining_recovery_codes: 8,
    });

    render(<ClientMfaSettingsWidget />);

    await waitFor(() => {
      expect(screen.getByText('Activado')).toBeInTheDocument();
      expect(screen.getByText('8')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Desactivar 2FA' })).toBeInTheDocument();
    });
  });

  it('handles error when loading MFA status fails', async () => {
    vi.mocked(authClient.getMfaStatus).mockRejectedValueOnce(new Error('Network failure'));

    render(<ClientMfaSettingsWidget />);

    await waitFor(() => {
      expect(screen.getByText('Network failure')).toBeInTheDocument();
    });
  });

  it('executes setup and enable 2FA flow smoothly', async () => {
    vi.mocked(authClient.getMfaStatus)
      .mockResolvedValueOnce({ status: 'success', is_2fa_enabled: false })
      .mockResolvedValueOnce({
        status: 'success',
        is_2fa_enabled: true,
        remaining_recovery_codes: 8,
      });

    vi.mocked(authClient.setupMfa).mockResolvedValueOnce({
      status: 'success',
      secretBase32: 'JBSWY3DPEHPK3PXP',
      otpauthUrl: 'otpauth://totp/Dreamtek:test?secret=JBSWY3DPEHPK3PXP',
      recoveryCodes: ['REC01-AAAAA', 'REC02-BBBBB'],
    });

    vi.mocked(authClient.enableMfa).mockResolvedValueOnce({
      status: 'success',
      message: '2FA activado con éxito.',
    });

    render(<ClientMfaSettingsWidget />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Configurar 2FA' })).toBeInTheDocument();
    });

    // Start setup
    fireEvent.click(screen.getByRole('button', { name: 'Configurar 2FA' }));

    await waitFor(() => {
      expect(screen.getByText('Configurar Google Authenticator')).toBeInTheDocument();
      expect(screen.getByText('JBSWY3DPEHPK3PXP')).toBeInTheDocument();
      expect(screen.getByText('REC01-AAAAA')).toBeInTheDocument();
    });

    // Test copy to clipboard
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const copyBtn = screen.getByRole('button', { name: 'Copiar' });
    fireEvent.click(copyBtn);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('JBSWY3DPEHPK3PXP');
    vi.advanceTimersByTime(2000);
    vi.useRealTimers();

    // Enter verification code and submit
    const codeInput = screen.getByPlaceholderText('000000');
    fireEvent.change(codeInput, { target: { value: '123456' } });

    const confirmBtn = screen.getByRole('button', { name: 'Confirmar y Activar 2FA' });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(authClient.enableMfa).toHaveBeenCalledWith('123456', 'JBSWY3DPEHPK3PXP', [
        'REC01-AAAAA',
        'REC02-BBBBB',
      ]);
      expect(screen.getByText('2FA activado con éxito.')).toBeInTheDocument();
    });
  });

  it('handles error when setupMfa or enableMfa fails', async () => {
    vi.mocked(authClient.getMfaStatus).mockResolvedValue({
      status: 'success',
      is_2fa_enabled: false,
    });
    vi.mocked(authClient.setupMfa).mockRejectedValueOnce(new Error('Fallo al generar secreto'));

    render(<ClientMfaSettingsWidget />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Configurar 2FA' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Configurar 2FA' }));

    await waitFor(() => {
      expect(screen.getByText('Fallo al generar secreto')).toBeInTheDocument();
    });

    // Now test enableMfa failure
    vi.mocked(authClient.setupMfa).mockResolvedValueOnce({
      status: 'success',
      secretBase32: 'JBSWY3DPEHPK3PXP',
      otpauthUrl: 'otpauth://',
      recoveryCodes: ['CODE1-11111'],
    });
    vi.mocked(authClient.enableMfa).mockRejectedValueOnce(new Error('Código inválido'));

    fireEvent.click(screen.getByRole('button', { name: 'Configurar 2FA' }));

    await waitFor(() => {
      expect(screen.getByText('Configurar Google Authenticator')).toBeInTheDocument();
    });

    const codeInput = screen.getByPlaceholderText('000000');
    fireEvent.change(codeInput, { target: { value: '654321' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar y Activar 2FA' }));

    await waitFor(() => {
      expect(screen.getByText('Código inválido')).toBeInTheDocument();
    });

    // Close modal via ✕
    const closeBtn = screen.getByRole('button', { name: '✕' });
    fireEvent.click(closeBtn);
    expect(screen.queryByText('Configurar Google Authenticator')).not.toBeInTheDocument();
  });

  it('executes disable 2FA flow and handles cancellation and errors', async () => {
    vi.mocked(authClient.getMfaStatus)
      .mockResolvedValueOnce({
        status: 'success',
        is_2fa_enabled: true,
        remaining_recovery_codes: 5,
      })
      .mockResolvedValueOnce({ status: 'success', is_2fa_enabled: false });

    render(<ClientMfaSettingsWidget />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Desactivar 2FA' })).toBeInTheDocument();
    });

    // Open disable modal
    fireEvent.click(screen.getByRole('button', { name: 'Desactivar 2FA' }));
    expect(screen.getAllByText('Desactivar 2FA').length).toBeGreaterThan(0);

    // Close without submitting
    const closeBtn = screen.getByRole('button', { name: '✕' });
    fireEvent.click(closeBtn);

    // Re-open
    fireEvent.click(screen.getByRole('button', { name: 'Desactivar 2FA' }));

    // Submit with failure
    vi.mocked(authClient.disableMfa).mockRejectedValueOnce(new Error('Contraseña incorrecta'));

    const pwInput = screen.getByLabelText(/Contraseña actual/i, { selector: 'input' });
    const codeInput = screen.getByPlaceholderText('000000 o XXXXX-XXXXX');

    fireEvent.change(pwInput, { target: { value: 'WrongPass' } });
    fireEvent.change(codeInput, { target: { value: '123456' } });

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar Desactivación' }));

    await waitFor(() => {
      expect(screen.getByText('Contraseña incorrecta')).toBeInTheDocument();
    });

    // Submit with success
    vi.mocked(authClient.disableMfa).mockResolvedValueOnce({
      status: 'success',
      message: '2FA desactivado con éxito.',
    });

    fireEvent.change(pwInput, { target: { value: 'CorrectPass' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar Desactivación' }));

    await waitFor(() => {
      expect(authClient.disableMfa).toHaveBeenCalledWith('CorrectPass', '123456');
      expect(screen.getByText('2FA desactivado con éxito.')).toBeInTheDocument();
    });
  });

  it('handles status load failure without error message', async () => {
    vi.mocked(authClient.getMfaStatus).mockRejectedValueOnce({});
    render(<ClientMfaSettingsWidget />);
    await waitFor(() => {
      expect(screen.getByText('No se pudo cargar el estado 2FA.')).toBeInTheDocument();
    });
  });

  it('handles status with undefined recovery codes and enrolled date', async () => {
    vi.mocked(authClient.getMfaStatus).mockResolvedValueOnce({
      status: 'success',
      is_2fa_enabled: true,
      mfa_enrolled_at: undefined,
      remaining_recovery_codes: undefined,
    });
    render(<ClientMfaSettingsWidget />);
    await waitFor(() => {
      expect(screen.getByText('0')).toBeInTheDocument();
      expect(screen.queryByText(/Activado el/i)).not.toBeInTheDocument();
    });
  });

  it('covers fallback error messages and empty field early returns during setup and disable', async () => {
    vi.mocked(authClient.getMfaStatus).mockResolvedValueOnce({
      status: 'success',
      is_2fa_enabled: false,
    });
    const { container } = render(<ClientMfaSettingsWidget />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Configurar 2FA' })).toBeInTheDocument();
    });

    // setupMfa failure without error message
    vi.mocked(authClient.setupMfa).mockRejectedValueOnce({});
    fireEvent.click(screen.getByRole('button', { name: 'Configurar 2FA' }));
    await waitFor(() => {
      expect(screen.getByText('Error al iniciar configuración 2FA.')).toBeInTheDocument();
    });

    // setupMfa success
    vi.mocked(authClient.setupMfa).mockResolvedValueOnce({
      status: 'success',
      secretBase32: 'JBSWY3DPEHPK3PXP',
      otpauthUrl: 'otpauth://',
      recoveryCodes: ['CODE1-11111'],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Configurar 2FA' }));
    await waitFor(() => {
      expect(screen.getByText('Configurar Google Authenticator')).toBeInTheDocument();
    });

    // Early return on submit when verifyCode is empty
    const setupForm = container.querySelector('form');
    if (setupForm) {
      fireEvent.submit(setupForm);
      expect(authClient.enableMfa).not.toHaveBeenCalled();
    }

    // enableMfa failure without message
    vi.mocked(authClient.enableMfa).mockRejectedValueOnce({});
    const codeInput = screen.getByPlaceholderText('000000');
    fireEvent.change(codeInput, { target: { value: '111111' } });
    if (setupForm) {
      fireEvent.submit(setupForm);
    }
    await waitFor(() => {
      expect(screen.getByText('Código de verificación incorrecto.')).toBeInTheDocument();
    });

    // enableMfa success without message
    vi.mocked(authClient.enableMfa).mockResolvedValueOnce({ status: 'success' });
    vi.mocked(authClient.getMfaStatus).mockResolvedValueOnce({
      status: 'success',
      is_2fa_enabled: true,
    });
    if (setupForm) {
      fireEvent.submit(setupForm);
    }
    await waitFor(() => {
      expect(screen.getByText('2FA activado con éxito.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Desactivar 2FA' })).toBeInTheDocument();
    });

    // disableMfa early return and non-message fallback
    fireEvent.click(screen.getByRole('button', { name: 'Desactivar 2FA' }));
    const disableForm = container.querySelector('form');

    // Submit with missing password
    const pwInput = screen.getByLabelText(/Contraseña actual/i, { selector: 'input' });
    const disCodeInput = screen.getByPlaceholderText('000000 o XXXXX-XXXXX');
    fireEvent.change(disCodeInput, { target: { value: '123456' } });
    if (disableForm) {
      fireEvent.submit(disableForm);
      expect(authClient.disableMfa).not.toHaveBeenCalled();
    }

    // disableMfa failure without message
    fireEvent.change(pwInput, { target: { value: 'Pass123' } });
    vi.mocked(authClient.disableMfa).mockRejectedValueOnce({});
    if (disableForm) {
      fireEvent.submit(disableForm);
    }
    await waitFor(() => {
      expect(screen.getByText('Error al desactivar 2FA.')).toBeInTheDocument();
    });

    // disableMfa success without message
    vi.mocked(authClient.disableMfa).mockResolvedValueOnce({ status: 'success' });
    vi.mocked(authClient.getMfaStatus).mockResolvedValueOnce({
      status: 'success',
      is_2fa_enabled: false,
    });
    if (disableForm) {
      fireEvent.submit(disableForm);
    }
    await waitFor(() => {
      expect(screen.getByText('2FA desactivado.')).toBeInTheDocument();
    });
  });
});
