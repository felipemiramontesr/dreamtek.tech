import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Contact } from '@/components/sections/Contact';
import { es } from '@/i18n/dictionaries/es';

describe('Contact Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.alert = vi.fn();
  });

  it('se debe renderizar el formulario con todos los campos requeridos', () => {
    render(<Contact dict={es} />);

    expect(screen.getByText(/¿Listo para dar el/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(es.contact.form.namePlaceholder)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(es.contact.form.emailPlaceholder)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(es.contact.form.messagePlaceholder)).toBeInTheDocument();
  });

  it('debe seleccionar automáticamente un servicio al recibir el evento "select-service"', () => {
    render(<Contact dict={es} />);

    act(() => {
      window.dispatchEvent(new CustomEvent('select-service', { detail: 'archon-fleet' }));
    });

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('archon-fleet');
  });

  it('debe procesar el flujo completo exitoso de 2FA y envío de formulario', async () => {
    global.fetch = vi.fn().mockImplementation((url) => {
      if (url.includes('send_code.php')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });
    });

    render(<Contact dict={es} />);

    fireEvent.change(screen.getByPlaceholderText(es.contact.form.namePlaceholder), {
      target: { value: 'Felipe' },
    });
    fireEvent.change(screen.getByPlaceholderText(es.contact.form.emailPlaceholder), {
      target: { value: 'felipe@test.com' },
    });
    fireEvent.change(screen.getByPlaceholderText(es.contact.form.messagePlaceholder), {
      target: { value: 'Hola' },
    });

    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(es.contact.button.submit, 'i') }),
    );

    await waitFor(() => {
      expect(screen.getByText(es.contact.code.label)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('000000'), {
      target: { value: '123456' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(es.contact.button.verify, 'i') }),
    );

    await waitFor(() => {
      expect(screen.getByText(es.contact.successTitle)).toBeInTheDocument();
    });
  });

  it('debe mostrar un mensaje de error si el envío del código inicial falla', async () => {
    global.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: false,
        json: () => Promise.resolve({ success: false, message: 'Error al enviar código' }),
      }),
    );

    render(<Contact dict={es} />);

    fireEvent.change(screen.getByPlaceholderText(es.contact.form.namePlaceholder), {
      target: { value: 'Felipe' },
    });
    fireEvent.change(screen.getByPlaceholderText(es.contact.form.emailPlaceholder), {
      target: { value: 'felipe@test.com' },
    });
    fireEvent.change(screen.getByPlaceholderText(es.contact.form.messagePlaceholder), {
      target: { value: 'Hola' },
    });

    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(es.contact.button.submit, 'i') }),
    );

    await waitFor(() => {
      expect(screen.getByText('Error al enviar código')).toBeInTheDocument();
    });
  });

  it('debe mostrar error de red cuando el envío de código genera una excepción fetch', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    render(<Contact dict={es} />);

    fireEvent.change(screen.getByPlaceholderText(es.contact.form.namePlaceholder), {
      target: { value: 'Felipe' },
    });
    fireEvent.change(screen.getByPlaceholderText(es.contact.form.emailPlaceholder), {
      target: { value: 'felipe@test.com' },
    });
    fireEvent.change(screen.getByPlaceholderText(es.contact.form.messagePlaceholder), {
      target: { value: 'Hola' },
    });

    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(es.contact.button.submit, 'i') }),
    );

    await waitFor(() => {
      expect(screen.getByText(es.contact.errors.sendCodeNetwork)).toBeInTheDocument();
    });
  });

  it('debe mostrar un mensaje de error si el código de 2FA es incorrecto o falla en la verificación', async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        });
      }
      return Promise.resolve({
        ok: false,
        json: () => Promise.resolve({ success: false, message: 'Código inválido' }),
      });
    });

    render(<Contact dict={es} />);

    fireEvent.change(screen.getByPlaceholderText(es.contact.form.namePlaceholder), {
      target: { value: 'Felipe' },
    });
    fireEvent.change(screen.getByPlaceholderText(es.contact.form.emailPlaceholder), {
      target: { value: 'felipe@test.com' },
    });
    fireEvent.change(screen.getByPlaceholderText(es.contact.form.messagePlaceholder), {
      target: { value: 'Hola' },
    });

    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(es.contact.button.submit, 'i') }),
    );

    await waitFor(() => {
      expect(screen.getByText(es.contact.code.label)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('000000'), {
      target: { value: '999999' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(es.contact.button.verify, 'i') }),
    );

    await waitFor(() => {
      expect(screen.getByText('Código inválido')).toBeInTheDocument();
    });
  });

  it('debe procesar el reenvío de código (handleResend) con éxito y con error de red', async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        });
      }
      if (callCount === 2) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        });
      }
      return Promise.reject(new Error('Resend network fail'));
    });

    render(<Contact dict={es} />);

    fireEvent.change(screen.getByPlaceholderText(es.contact.form.namePlaceholder), {
      target: { value: 'Felipe' },
    });
    fireEvent.change(screen.getByPlaceholderText(es.contact.form.emailPlaceholder), {
      target: { value: 'felipe@test.com' },
    });
    fireEvent.change(screen.getByPlaceholderText(es.contact.form.messagePlaceholder), {
      target: { value: 'Hola' },
    });

    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(es.contact.button.submit, 'i') }),
    );

    await waitFor(() => {
      expect(screen.getByText(es.contact.code.label)).toBeInTheDocument();
    });

    const resendBtn = screen.getByRole('button', { name: /Reenviar código/i });
    fireEvent.click(resendBtn);

    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith(es.contact.code.resendAlert);
    });

    fireEvent.click(resendBtn);

    await waitFor(() => {
      expect(screen.getByText(es.contact.code.resendNetworkError)).toBeInTheDocument();
    });
  });
});
