import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ClientTaxProfileWidget,
  PaymentInvoiceItem,
} from '@/components/dashboard/client/ClientTaxProfileWidget';
import * as authClient from '@/lib/auth/client';

vi.mock('@/lib/auth/client', async () => {
  const actual = await vi.importActual<typeof authClient>('@/lib/auth/client');
  return {
    ...actual,
    getClientTaxProfile: vi.fn(),
    saveClientTaxProfile: vi.fn(),
    requestPaymentInvoice: vi.fn(),
  };
});

describe('ClientTaxProfileWidget Component Suite (FC 046 100% Coverage)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('debe renderizar el estado de carga y consultar getClientTaxProfile en montaje', async () => {
    vi.mocked(authClient.getClientTaxProfile).mockReturnValueOnce(new Promise(() => {}));

    render(<ClientTaxProfileWidget />);

    expect(screen.getByText('Expediente Fiscal & Facturación B2B')).toBeInTheDocument();
    expect(screen.getByText('Consultando expediente fiscal corporativo...')).toBeInTheDocument();
  });

  it('debe mostrar error al fallar la consulta inicial del expediente con Error', async () => {
    vi.mocked(authClient.getClientTaxProfile).mockRejectedValueOnce(
      new Error('Fallo de conexión al expediente fiscal'),
    );

    render(<ClientTaxProfileWidget />);

    await waitFor(() => {
      expect(screen.getByText('Fallo de conexión al expediente fiscal')).toBeInTheDocument();
    });
  });

  it('debe mostrar error al fallar la consulta inicial del expediente con valor no-Error', async () => {
    vi.mocked(authClient.getClientTaxProfile).mockRejectedValueOnce('raw rejection');

    render(<ClientTaxProfileWidget />);

    await waitFor(() => {
      expect(
        screen.getByText('Error al consultar el expediente fiscal del cliente.'),
      ).toBeInTheDocument();
    });
  });

  it('debe renderizar los datos del expediente fiscal existente en modo lectura', async () => {
    vi.mocked(authClient.getClientTaxProfile).mockResolvedValueOnce({
      status: 'success',
      tax_profile: {
        id: 1,
        user_id: 42,
        tenant_id: 1,
        rfc: 'GARM850101XYZ',
        legal_name: 'Soluciones Tecnológicas SA de CV',
        tax_regime: '601',
        cfdi_use: 'G03',
        postal_code: '01000',
        invoice_email: 'facturas@soluciones.com',
        created_at: '2026-09-01T12:00:00Z',
        updated_at: '2026-09-01T12:00:00Z',
      },
    });

    render(<ClientTaxProfileWidget />);

    await waitFor(() => {
      expect(screen.getByText('GARM850101XYZ')).toBeInTheDocument();
      expect(screen.getByText('Soluciones Tecnológicas SA de CV')).toBeInTheDocument();
      expect(screen.getByText('01000')).toBeInTheDocument();
      expect(screen.getByText(/601 — General de Ley/)).toBeInTheDocument();
      expect(screen.getByText(/G03 — Gastos en general/)).toBeInTheDocument();
      expect(screen.getByText('facturas@soluciones.com')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /Actualizar Datos Fiscales/i }),
      ).toBeInTheDocument();
    });
  });

  it('debe permitir abrir y cancelar el formulario de edición de datos fiscales', async () => {
    vi.mocked(authClient.getClientTaxProfile).mockResolvedValueOnce({
      status: 'success',
      tax_profile: {
        id: 1,
        user_id: 42,
        tenant_id: 1,
        rfc: 'GARM850101XYZ',
        legal_name: 'Soluciones SA',
        tax_regime: '601',
        cfdi_use: 'G03',
        postal_code: '01000',
        invoice_email: 'facturas@soluciones.com',
        created_at: '2026-09-01T12:00:00Z',
        updated_at: '2026-09-01T12:00:00Z',
      },
    });

    render(<ClientTaxProfileWidget />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Actualizar Datos Fiscales/i }),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Actualizar Datos Fiscales/i }));

    expect(screen.getByText('Editar Datos de Facturación')).toBeInTheDocument();

    const cancelBtn = screen.getByRole('button', { name: /Cancelar/i });
    fireEvent.click(cancelBtn);

    expect(screen.queryByText('Editar Datos de Facturación')).not.toBeInTheDocument();
    expect(screen.getByText('GARM850101XYZ')).toBeInTheDocument();
  });

  it('debe validar los campos del formulario antes de enviar', async () => {
    vi.mocked(authClient.getClientTaxProfile).mockResolvedValueOnce({
      status: 'success',
      tax_profile: null,
    });

    render(<ClientTaxProfileWidget />);

    await waitFor(() => {
      expect(screen.getByText('Registrar Expediente Fiscal')).toBeInTheDocument();
    });

    const submitBtn = screen.getByRole('button', { name: /Guardar Expediente/i });

    // 1. RFC vacío / corto
    fireEvent.click(submitBtn);
    expect(
      screen.getByText('El RFC o Tax ID debe tener al menos 3 caracteres.'),
    ).toBeInTheDocument();

    // 2. RFC inválido (no pasa regex oficial SAT nacional)
    const rfcInput = screen.getByPlaceholderText('GARM850101XYZ');
    fireEvent.change(rfcInput, { target: { value: 'RFC_INVALIDO_SAT' } });
    fireEvent.click(submitBtn);
    expect(
      screen.getByText(
        'RFC inválido. Formato oficial SAT requerido (12 o 13 caracteres con homoclave).',
      ),
    ).toBeInTheDocument();

    // 3. Razón social vacía con RFC válido
    fireEvent.change(rfcInput, { target: { value: 'XAXX010101000' } });
    fireEvent.click(submitBtn);
    expect(
      screen.getByText('La razón social o denominación legal es obligatoria.'),
    ).toBeInTheDocument();

    // 4. Código postal vacío
    const legalNameInput = screen.getByPlaceholderText('Empresa o Persona Física SA de CV');
    fireEvent.change(legalNameInput, { target: { value: 'Mi Empresa SA' } });
    fireEvent.click(submitBtn);
    expect(screen.getByText('El código postal fiscal es obligatorio.')).toBeInTheDocument();

    // 5. Correo inválido
    const postalInput = screen.getByPlaceholderText('01000');
    fireEvent.change(postalInput, { target: { value: '06700' } });
    fireEvent.click(submitBtn);
    expect(
      screen.getByText('Ingresa un correo electrónico de facturación válido.'),
    ).toBeInTheDocument();

    const emailInput = screen.getByPlaceholderText('facturas@miempresa.com');
    fireEvent.change(emailInput, { target: { value: 'correo-sin-arroba' } });
    fireEvent.click(submitBtn);
    expect(
      screen.getByText('Ingresa un correo electrónico de facturación válido.'),
    ).toBeInTheDocument();
  });

  it('debe permitir guardar el expediente fiscal de cliente internacional y omitir validación SAT estricta', async () => {
    vi.mocked(authClient.getClientTaxProfile).mockResolvedValueOnce({
      status: 'success',
      tax_profile: null,
    });

    const onProfileUpdated = vi.fn();
    render(<ClientTaxProfileWidget onProfileUpdated={onProfileUpdated} />);

    await waitFor(() => {
      expect(screen.getByText('Registrar Expediente Fiscal')).toBeInTheDocument();
    });

    // Activar toggle internacional
    const intlCheckbox = screen.getByLabelText(/Cliente Internacional/i);
    fireEvent.click(intlCheckbox);

    const rfcInput = screen.getByPlaceholderText('US-EIN-1234567');
    const legalNameInput = screen.getByPlaceholderText('Empresa o Persona Física SA de CV');
    const postalInput = screen.getByPlaceholderText('01000');
    const emailInput = screen.getByPlaceholderText('facturas@miempresa.com');

    fireEvent.change(rfcInput, { target: { value: 'US-EIN-99887766' } });
    fireEvent.change(legalNameInput, { target: { value: 'Global Tech LLC' } });
    fireEvent.change(postalInput, { target: { value: '94103' } });
    fireEvent.change(emailInput, { target: { value: 'billing@globaltech.com' } });

    // Cambiar régimen fiscal y uso de CFDI
    const regimeSelect = screen.getByDisplayValue(/General de Ley Personas Morales/i);
    fireEvent.change(regimeSelect, { target: { value: '612' } });

    const cfdiSelect = screen.getByDisplayValue(/Gastos en general/i);
    fireEvent.change(cfdiSelect, { target: { value: 'G01' } });

    vi.mocked(authClient.saveClientTaxProfile).mockResolvedValueOnce({
      status: 'success',
      message: 'Expediente fiscal guardado',
      tax_profile: {
        id: 2,
        user_id: 42,
        tenant_id: 1,
        rfc: 'US-EIN-99887766',
        legal_name: 'Global Tech LLC',
        tax_regime: '612',
        cfdi_use: 'G01',
        postal_code: '94103',
        invoice_email: 'billing@globaltech.com',
        created_at: '2026-09-01T12:00:00Z',
        updated_at: '2026-09-01T12:00:00Z',
      },
    });

    const submitBtn = screen.getByRole('button', { name: /Guardar Expediente/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(authClient.saveClientTaxProfile).toHaveBeenCalledWith({
        rfc: 'US-EIN-99887766',
        legal_name: 'Global Tech LLC',
        tax_regime: '612',
        cfdi_use: 'G01',
        postal_code: '94103',
        invoice_email: 'billing@globaltech.com',
        is_international: true,
      });
      expect(onProfileUpdated).toHaveBeenCalled();
      expect(screen.getByText('Global Tech LLC')).toBeInTheDocument();
      expect(screen.getByText('US-EIN-99887766')).toBeInTheDocument();
    });
  });

  it('debe mostrar mensaje de éxito al editar y guardar un expediente existente', async () => {
    vi.mocked(authClient.getClientTaxProfile).mockResolvedValueOnce({
      status: 'success',
      tax_profile: {
        id: 1,
        user_id: 42,
        tenant_id: 1,
        rfc: 'XAXX010101000',
        legal_name: 'Empresa SA',
        tax_regime: '601',
        cfdi_use: 'G03',
        postal_code: '06700',
        invoice_email: 'admin@empresa.com',
        created_at: '2026-09-01T12:00:00Z',
        updated_at: '2026-09-01T12:00:00Z',
      },
    });

    render(<ClientTaxProfileWidget />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Actualizar Datos Fiscales/i }),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Actualizar Datos Fiscales/i }));

    vi.mocked(authClient.saveClientTaxProfile).mockResolvedValueOnce({
      status: 'success',
      message: 'Expediente fiscal guardado',
      tax_profile: {
        id: 1,
        user_id: 42,
        tenant_id: 1,
        rfc: 'XAXX010101000',
        legal_name: 'Empresa Renovada SA',
        tax_regime: '601',
        cfdi_use: 'G03',
        postal_code: '06700',
        invoice_email: 'admin@empresa.com',
        created_at: '2026-09-01T12:00:00Z',
        updated_at: '2026-09-02T12:00:00Z',
      },
    });

    fireEvent.click(screen.getByRole('button', { name: /Guardar Expediente/i }));

    await waitFor(() => {
      expect(
        screen.getByText('Expediente fiscal guardado y validado exitosamente.'),
      ).toBeInTheDocument();
    });
  });

  it('debe manejar errores al guardar el expediente fiscal (Error y no-Error)', async () => {
    vi.mocked(authClient.getClientTaxProfile).mockResolvedValueOnce({
      status: 'success',
      tax_profile: null,
    });

    render(<ClientTaxProfileWidget />);

    await waitFor(() => {
      expect(screen.getByText('Registrar Expediente Fiscal')).toBeInTheDocument();
    });

    const rfcInput = screen.getByPlaceholderText('GARM850101XYZ');
    const legalNameInput = screen.getByPlaceholderText('Empresa o Persona Física SA de CV');
    const postalInput = screen.getByPlaceholderText('01000');
    const emailInput = screen.getByPlaceholderText('facturas@miempresa.com');

    fireEvent.change(rfcInput, { target: { value: 'XAXX010101000' } });
    fireEvent.change(legalNameInput, { target: { value: 'Empresa SA' } });
    fireEvent.change(postalInput, { target: { value: '01000' } });
    fireEvent.change(emailInput, { target: { value: 'a@b.com' } });

    // Error instance
    vi.mocked(authClient.saveClientTaxProfile).mockRejectedValueOnce(
      new Error('Error de validación en base de datos'),
    );

    fireEvent.click(screen.getByRole('button', { name: /Guardar Expediente/i }));

    await waitFor(() => {
      expect(screen.getByText('Error de validación en base de datos')).toBeInTheDocument();
    });

    // Non-error rejection
    vi.mocked(authClient.saveClientTaxProfile).mockRejectedValueOnce('raw save error');

    fireEvent.click(screen.getByRole('button', { name: /Guardar Expediente/i }));

    await waitFor(() => {
      expect(screen.getByText('Error al guardar el expediente fiscal.')).toBeInTheDocument();
    });
  });

  it('debe renderizar el listado de pagos con sus estados de facturación y permitir solicitar factura', async () => {
    vi.mocked(authClient.getClientTaxProfile).mockResolvedValueOnce({
      status: 'success',
      tax_profile: {
        id: 1,
        user_id: 42,
        tenant_id: 1,
        rfc: 'XAXX010101000',
        legal_name: 'Empresa Cliente',
        tax_regime: '601',
        cfdi_use: 'G03',
        postal_code: '01000',
        invoice_email: 'cliente@empresa.com',
        created_at: '2026-09-01T12:00:00Z',
        updated_at: '2026-09-01T12:00:00Z',
      },
    });

    const mockPayments: PaymentInvoiceItem[] = [
      {
        id: 101,
        project_id: 10,
        project_name: 'Plataforma B2B',
        amount_cents: 500000,
        currency: 'USD',
        status: 'PAID',
      },
      {
        id: 102,
        project_id: 10,
        project_name: 'Plataforma B2B',
        amount_cents: 500000,
        currency: 'USD',
        status: 'PAID',
        invoice_status: 'REQUESTED',
      },
      {
        id: 103,
        project_id: 10,
        project_name: 'Plataforma B2B',
        amount_cents: 200000,
        currency: 'USD',
        status: 'PAID',
        invoice_status: 'ISSUED',
        cfdi_uuid: 'SAT-UUID-ABC-1234',
      },
      {
        id: 104,
        amount_cents: 100000,
        currency: 'USD',
        status: 'PENDING',
      },
    ];

    render(<ClientTaxProfileWidget payments={mockPayments} />);

    await waitFor(() => {
      expect(screen.getByText('Comprobantes & Pagos Realizados')).toBeInTheDocument();
      expect(screen.getByText('CFDI EMITIDO')).toBeInTheDocument();
      expect(screen.getByText('Folio Fiscal: SAT-UUID-ABC-1234')).toBeInTheDocument();
      expect(screen.getByText('SOLICITADA')).toBeInTheDocument();
      expect(screen.getByText('PENDING')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Solicitar Factura Fiscal/i })).toBeInTheDocument();
    });

    // Abrir modal de solicitud
    fireEvent.click(screen.getByRole('button', { name: /Solicitar Factura Fiscal/i }));

    expect(screen.getByText('Comprobante para Pago #101')).toBeInTheDocument();
    expect(screen.getAllByText('Empresa Cliente')).toHaveLength(2);

    // Cancelar modal
    fireEvent.click(screen.getByRole('button', { name: /Cancelar/i }));
    expect(screen.queryByText('Comprobante para Pago #101')).not.toBeInTheDocument();

    // Reabrir y enviar solicitud exitosa con notas
    fireEvent.click(screen.getByRole('button', { name: /Solicitar Factura Fiscal/i }));

    const notesInput = screen.getByPlaceholderText(/Orden de compra/i);
    fireEvent.change(notesInput, { target: { value: 'OC-2026-99' } });

    vi.mocked(authClient.requestPaymentInvoice).mockResolvedValueOnce({
      status: 'success',
      message: 'Solicitud registrada',
      request_id: 55,
    });

    fireEvent.click(screen.getByRole('button', { name: /Confirmar Solicitud/i }));

    await waitFor(() => {
      expect(authClient.requestPaymentInvoice).toHaveBeenCalledWith(101, {
        invoice_notes: 'OC-2026-99',
      });
      expect(
        screen.getByText('Solicitud de factura fiscal enviada con éxito.'),
      ).toBeInTheDocument();
    });
  });

  it('debe manejar errores al solicitar factura fiscal para un pago (Error y no-Error)', async () => {
    vi.mocked(authClient.getClientTaxProfile).mockResolvedValueOnce({
      status: 'success',
      tax_profile: {
        id: 1,
        user_id: 42,
        tenant_id: 1,
        rfc: 'XAXX010101000',
        legal_name: 'Empresa',
        tax_regime: '601',
        cfdi_use: 'G03',
        postal_code: '01000',
        invoice_email: 'a@b.com',
        created_at: '2026-09-01T12:00:00Z',
        updated_at: '2026-09-01T12:00:00Z',
      },
    });

    const mockPayments: PaymentInvoiceItem[] = [
      {
        id: 201,
        amount_cents: 300000,
        currency: 'USD',
        status: 'PAID',
      },
    ];

    render(<ClientTaxProfileWidget payments={mockPayments} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Solicitar Factura Fiscal/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Solicitar Factura Fiscal/i }));

    // Error instance
    vi.mocked(authClient.requestPaymentInvoice).mockRejectedValueOnce(
      new Error('Pago ya tiene factura asociada'),
    );

    fireEvent.click(screen.getByRole('button', { name: /Confirmar Solicitud/i }));

    await waitFor(() => {
      expect(screen.getByText('Pago ya tiene factura asociada')).toBeInTheDocument();
    });

    // Non-error rejection
    vi.mocked(authClient.requestPaymentInvoice).mockRejectedValueOnce('raw invoice error');

    fireEvent.click(screen.getByRole('button', { name: /Confirmar Solicitud/i }));

    await waitFor(() => {
      expect(screen.getByText('Error al solicitar la factura fiscal.')).toBeInTheDocument();
    });

    // Cerrar modal con ✕
    fireEvent.click(screen.getByRole('button', { name: '✕' }));
    expect(screen.queryByText('Comprobante para Pago #201')).not.toBeInTheDocument();
  });

  it('debe deshabilitar el botón de solicitar factura cuando no hay expediente fiscal registrado', async () => {
    vi.mocked(authClient.getClientTaxProfile).mockResolvedValueOnce({
      status: 'success',
      tax_profile: null,
    });

    const mockPayments: PaymentInvoiceItem[] = [
      {
        id: 301,
        amount_cents: 400000,
        currency: 'USD',
        status: 'PAID',
      },
    ];

    render(<ClientTaxProfileWidget payments={mockPayments} />);

    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /Expediente Requerido/i });
      expect(btn).toBeDisabled();
    });
  });

  it('debe renderizar códigos raw de régimen y cfdi si no están en el catálogo estándar', async () => {
    vi.mocked(authClient.getClientTaxProfile).mockResolvedValueOnce({
      status: 'success',
      tax_profile: {
        id: 10,
        user_id: 42,
        tenant_id: 1,
        rfc: 'CUSTOM990101',
        legal_name: 'Entidad Especial SA',
        tax_regime: '999',
        cfdi_use: 'P00',
        postal_code: '01000',
        invoice_email: 'custom@empresa.com',
        created_at: '2026-09-01T12:00:00Z',
        updated_at: '2026-09-01T12:00:00Z',
      },
    });

    render(<ClientTaxProfileWidget />);

    await waitFor(() => {
      expect(screen.getByText('999')).toBeInTheDocument();
      expect(screen.getByText('P00')).toBeInTheDocument();
    });
  });

  it('debe ejecutar loadTaxProfile al pulsar el botón Recargar con éxito y con perfil', async () => {
    vi.mocked(authClient.getClientTaxProfile).mockResolvedValueOnce({
      status: 'success',
      tax_profile: {
        id: 1,
        user_id: 42,
        tenant_id: 1,
        rfc: 'GARM850101XYZ',
        legal_name: 'Original SA',
        tax_regime: '601',
        cfdi_use: 'G03',
        postal_code: '01000',
        invoice_email: 'orig@empresa.com',
        created_at: '2026-09-01T12:00:00Z',
        updated_at: '2026-09-01T12:00:00Z',
      },
    });

    render(<ClientTaxProfileWidget />);

    await waitFor(() => {
      expect(screen.getByText('Original SA')).toBeInTheDocument();
    });

    // Clic en Recargar con perfil nuevo
    vi.mocked(authClient.getClientTaxProfile).mockResolvedValueOnce({
      status: 'success',
      tax_profile: {
        id: 1,
        user_id: 42,
        tenant_id: 1,
        rfc: 'GARM850101XYZ',
        legal_name: 'Actualizado SA',
        tax_regime: '601',
        cfdi_use: 'G03',
        postal_code: '01000',
        invoice_email: 'orig@empresa.com',
        created_at: '2026-09-01T12:00:00Z',
        updated_at: '2026-09-01T12:00:00Z',
      },
    });

    fireEvent.click(screen.getByRole('button', { name: /Recargar/i }));

    await waitFor(() => {
      expect(screen.getByText('Actualizado SA')).toBeInTheDocument();
    });
  });

  it('debe ejecutar loadTaxProfile al pulsar Recargar y actualizar cuando el perfil es null', async () => {
    vi.mocked(authClient.getClientTaxProfile).mockResolvedValueOnce({
      status: 'success',
      tax_profile: {
        id: 1,
        user_id: 42,
        tenant_id: 1,
        rfc: 'GARM850101XYZ',
        legal_name: 'Empresa SA',
        tax_regime: '601',
        cfdi_use: 'G03',
        postal_code: '01000',
        invoice_email: 'empresa@test.com',
        created_at: '2026-09-01T12:00:00Z',
        updated_at: '2026-09-01T12:00:00Z',
      },
    });

    render(<ClientTaxProfileWidget />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Recargar/i })).toBeInTheDocument();
    });

    vi.mocked(authClient.getClientTaxProfile).mockResolvedValueOnce({
      status: 'success',
      tax_profile: null,
    });

    fireEvent.click(screen.getByRole('button', { name: /Recargar/i }));

    await waitFor(() => {
      expect(screen.getByText('Registrar Expediente Fiscal')).toBeInTheDocument();
    });
  });

  it('debe mostrar mensaje de error si loadTaxProfile falla con Error al pulsar Recargar', async () => {
    vi.mocked(authClient.getClientTaxProfile).mockResolvedValueOnce({
      status: 'success',
      tax_profile: {
        id: 1,
        user_id: 42,
        tenant_id: 1,
        rfc: 'GARM850101XYZ',
        legal_name: 'Empresa SA',
        tax_regime: '601',
        cfdi_use: 'G03',
        postal_code: '01000',
        invoice_email: 'empresa@test.com',
        created_at: '2026-09-01T12:00:00Z',
        updated_at: '2026-09-01T12:00:00Z',
      },
    });

    render(<ClientTaxProfileWidget />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Recargar/i })).toBeInTheDocument();
    });

    vi.mocked(authClient.getClientTaxProfile).mockRejectedValueOnce(
      new Error('Fallo manual al recargar'),
    );

    fireEvent.click(screen.getByRole('button', { name: /Recargar/i }));

    await waitFor(() => {
      expect(screen.getByText('Fallo manual al recargar')).toBeInTheDocument();
    });
  });

  it('debe mostrar mensaje de error si loadTaxProfile falla con no-Error al pulsar Recargar', async () => {
    vi.mocked(authClient.getClientTaxProfile).mockResolvedValueOnce({
      status: 'success',
      tax_profile: {
        id: 1,
        user_id: 42,
        tenant_id: 1,
        rfc: 'GARM850101XYZ',
        legal_name: 'Empresa SA',
        tax_regime: '601',
        cfdi_use: 'G03',
        postal_code: '01000',
        invoice_email: 'empresa@test.com',
        created_at: '2026-09-01T12:00:00Z',
        updated_at: '2026-09-01T12:00:00Z',
      },
    });

    render(<ClientTaxProfileWidget />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Recargar/i })).toBeInTheDocument();
    });

    vi.mocked(authClient.getClientTaxProfile).mockRejectedValueOnce('raw rejection string');

    fireEvent.click(screen.getByRole('button', { name: /Recargar/i }));

    await waitFor(() => {
      expect(
        screen.getByText('Error al consultar el expediente fiscal del cliente.'),
      ).toBeInTheDocument();
    });
  });

  it('debe manejar unmount antes de resolver la promesa de carga sin actualizar estado', async () => {
    let resolvePromise!: (val: unknown) => void;
    vi.mocked(authClient.getClientTaxProfile).mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePromise = resolve;
      }),
    );
    const { unmount } = render(<ClientTaxProfileWidget />);
    unmount();
    resolvePromise({ status: 'success', tax_profile: null });
  });

  it('debe ignorar error en init si el componente ya fue desmontado', async () => {
    let rejectPromise!: (err: unknown) => void;
    vi.mocked(authClient.getClientTaxProfile).mockReturnValueOnce(
      new Promise((_, reject) => {
        rejectPromise = reject;
      }),
    );
    const { unmount } = render(<ClientTaxProfileWidget />);
    unmount();
    rejectPromise(new Error('Unmounted error'));
  });

  it('debe renderizar badge nacional y exigir RFC oficial SAT cuando currency es MXN (C-046.5)', async () => {
    vi.mocked(authClient.getClientTaxProfile).mockResolvedValueOnce({
      status: 'success',
      tax_profile: null,
    });

    render(<ClientTaxProfileWidget currency="MXN" locale="es" />);

    await waitFor(() => {
      expect(screen.getByText('Nacional (MXN) — RFC SAT')).toBeInTheDocument();
    });

    // Checkbox internacional NO debe estar presente
    expect(screen.queryByLabelText(/Cliente Internacional/i)).not.toBeInTheDocument();

    // Intentar ingresar RFC no válido para SAT
    fireEvent.change(screen.getByPlaceholderText('GARM850101XYZ'), {
      target: { value: 'US-TAX-123456' },
    });
    fireEvent.change(screen.getByPlaceholderText('Empresa o Persona Física SA de CV'), {
      target: { value: 'Empresa Mexicana SA de CV' },
    });
    fireEvent.change(screen.getByPlaceholderText('01000'), {
      target: { value: '06600' },
    });
    fireEvent.change(screen.getByPlaceholderText('facturas@miempresa.com'), {
      target: { value: 'sat@empresa.com' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Guardar Expediente/i }));

    await waitFor(() => {
      expect(
        screen.getByText(
          'RFC inválido. Formato oficial SAT requerido (12 o 13 caracteres con homoclave).',
        ),
      ).toBeInTheDocument();
    });
  });

  it('debe guardar exitosamente el expediente fiscal con currency y locale en modo doméstico (C-046.5)', async () => {
    vi.mocked(authClient.getClientTaxProfile).mockResolvedValueOnce({
      status: 'success',
      tax_profile: null,
    });

    const mockSavedProfile = {
      id: 88,
      user_id: 10,
      rfc: 'SAT840212ABC',
      legal_name: 'DOMESTICA SA DE CV',
      tax_regime: '601',
      cfdi_use: 'G03',
      postal_code: '06600',
      invoice_email: 'contabilidad@domestica.com',
      is_international: false,
      created_at: '2026-09-10T12:00:00Z',
      updated_at: '2026-09-10T12:00:00Z',
    };

    vi.mocked(authClient.saveClientTaxProfile).mockResolvedValueOnce({
      status: 'success',
      tax_profile: mockSavedProfile,
    });

    render(<ClientTaxProfileWidget currency="MXN" locale="es" />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('GARM850101XYZ')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('GARM850101XYZ'), {
      target: { value: 'SAT840212ABC' },
    });
    fireEvent.change(screen.getByPlaceholderText('Empresa o Persona Física SA de CV'), {
      target: { value: 'DOMESTICA SA DE CV' },
    });
    fireEvent.change(screen.getByPlaceholderText('01000'), {
      target: { value: '06600' },
    });
    fireEvent.change(screen.getByPlaceholderText('facturas@miempresa.com'), {
      target: { value: 'contabilidad@domestica.com' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Guardar Expediente/i }));

    await waitFor(() => {
      expect(authClient.saveClientTaxProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          rfc: 'SAT840212ABC',
          is_international: false,
          currency: 'MXN',
          locale: 'es',
        }),
      );
      expect(screen.getByText('DOMESTICA SA DE CV')).toBeInTheDocument();
      expect(screen.getByText('SAT840212ABC')).toBeInTheDocument();
    });
  });

  it('debe usar fallback MXN cuando currency es undefined pero locale es es (C-046.5 branch)', async () => {
    vi.mocked(authClient.getClientTaxProfile).mockResolvedValueOnce({
      status: 'success',
      tax_profile: null,
    });

    render(<ClientTaxProfileWidget locale="es" />);

    await waitFor(() => {
      expect(screen.getByText('Nacional (MXN) — RFC SAT')).toBeInTheDocument();
    });
  });
});
