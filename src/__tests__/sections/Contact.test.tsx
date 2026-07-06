import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Contact } from '@/components/sections/Contact';

describe('Contact Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('se debe renderizar el formulario con todos los campos requeridos', () => {
    render(<Contact />);

    expect(screen.getByLabelText(/Nombre Completo/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Correo Electrónico/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Servicio o Plan de Interés/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Mensaje \/ Descripción del Proyecto/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Enviar Solicitud/i })).toBeInTheDocument();
  });

  it('debe procesar el envio exitoso del formulario', async () => {
    // Mock fetch global
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, message: 'Enviado con éxito' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<Contact />);

    // Completar el formulario
    fireEvent.change(screen.getByLabelText(/Nombre Completo/i), { target: { value: 'Felipe M' } });
    fireEvent.change(screen.getByLabelText(/Correo Electrónico/i), {
      target: { value: 'felipe@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/Mensaje \/ Descripción del Proyecto/i), {
      target: { value: 'Hola, me interesa el plan custom' },
    });

    // Enviar el formulario
    fireEvent.click(screen.getByRole('button', { name: /Enviar Solicitud/i }));

    // Verificar que se llame a fetch con los datos correctos
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/contact.php', expect.any(Object));

    // Esperar a que se muestre el estado de éxito
    await waitFor(() => {
      expect(screen.getByText(/¡Solicitud Recibida!/i)).toBeInTheDocument();
    });
  });

  it('debe mostrar un mensaje de error si el envio falla', async () => {
    // Mock fetch global con fallo
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ success: false, message: 'Error de servidor' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<Contact />);

    // Completar y enviar
    fireEvent.change(screen.getByLabelText(/Nombre Completo/i), { target: { value: 'Felipe M' } });
    fireEvent.change(screen.getByLabelText(/Correo Electrónico/i), {
      target: { value: 'felipe@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/Mensaje \/ Descripción del Proyecto/i), {
      target: { value: 'Prueba' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Enviar Solicitud/i }));

    // Esperar a que se muestre el mensaje de error de la API
    await waitFor(() => {
      expect(screen.getByText('Error de servidor')).toBeInTheDocument();
    });
  });
});
