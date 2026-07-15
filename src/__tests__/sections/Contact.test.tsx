import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Contact } from '@/components/sections/Contact';
import { es } from '@/i18n/dictionaries/es';

describe('Contact Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('se debe renderizar el formulario con todos los campos requeridos', () => {
    render(<Contact dict={es} />);

    expect(screen.getByLabelText(/Nombre Completo/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Correo Electrónico/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Servicio o Plan de Interés/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Mensaje \/ Descripción del Proyecto/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Enviar Solicitud/i })).toBeInTheDocument();
  });

  it('debe procesar el flujo completo exitoso de 2FA y envío de formulario', async () => {
    // Mock fetch global para manejar ambos endpoints
    const fetchMock = vi.fn().mockImplementation((url) => {
      if (url === '/api/send_code.php') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            message: 'Código de verificación enviado con éxito.',
          }),
        });
      }
      if (url === '/api/contact.php') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true, message: 'Mensaje enviado con éxito.' }),
        });
      }
      return Promise.reject(new Error('Unknown URL'));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<Contact dict={es} />);

    // Rellenar formulario inicial
    fireEvent.change(screen.getByLabelText(/Nombre Completo/i), { target: { value: 'Felipe M' } });
    fireEvent.change(screen.getByLabelText(/Correo Electrónico/i), {
      target: { value: 'felipe@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/Mensaje \/ Descripción del Proyecto/i), {
      target: { value: 'Hola, me interesa el plan custom' },
    });

    // Enviar primer paso (Solicitud de código)
    fireEvent.click(screen.getByRole('button', { name: /Enviar Solicitud/i }));

    // Validar llamada a send_code.php
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/send_code.php', expect.any(Object));
    });

    // Validar cambio de UI: debe mostrarse el campo de código de verificación
    let codeInput: HTMLElement | null = null;
    await waitFor(() => {
      codeInput = screen.getByLabelText(/Código de Verificación/i);
      expect(codeInput).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /Verificar Código y Enviar/i }),
      ).toBeInTheDocument();
    });

    // Ingresar código de 6 dígitos
    fireEvent.change(codeInput!, { target: { value: '123456' } });

    // Enviar segundo paso (Verificación del código y envío final)
    fireEvent.click(screen.getByRole('button', { name: /Verificar Código y Enviar/i }));

    // Validar llamada a contact.php con el código
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/contact.php',
        expect.objectContaining({
          body: expect.stringContaining('"code":"123456"'),
        }),
      );
    });

    // Esperar a que se muestre el estado de éxito final
    await waitFor(() => {
      expect(screen.getByText(/¡Solicitud Recibida!/i)).toBeInTheDocument();
    });
  });

  it('debe mostrar un mensaje de error si el envío del código falla', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ success: false, message: 'Error de servidor al enviar código' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<Contact dict={es} />);

    fireEvent.change(screen.getByLabelText(/Nombre Completo/i), { target: { value: 'Felipe M' } });
    fireEvent.change(screen.getByLabelText(/Correo Electrónico/i), {
      target: { value: 'felipe@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/Mensaje \/ Descripción del Proyecto/i), {
      target: { value: 'Prueba' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Enviar Solicitud/i }));

    await waitFor(() => {
      expect(screen.getByText('Error de servidor al enviar código')).toBeInTheDocument();
    });
  });
});
