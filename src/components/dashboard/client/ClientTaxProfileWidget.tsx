'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import {
  getClientTaxProfile,
  saveClientTaxProfile,
  requestPaymentInvoice,
  type ClientTaxProfile,
} from '@/lib/auth/client';

export interface PaymentInvoiceItem {
  id: number;
  project_id?: number | null;
  project_name?: string | null;
  amount_cents: number;
  currency: string;
  status: string;
  payment_type?: string | null;
  created_at?: string;
  invoice_requested?: boolean;
  invoice_status?: 'REQUESTED' | 'ISSUED' | 'REJECTED';
  cfdi_uuid?: string | null;
}

export interface ClientTaxProfileWidgetProps {
  payments?: PaymentInvoiceItem[];
  onProfileUpdated?: (profile: ClientTaxProfile) => void;
}

const SAT_TAX_REGIMES = [
  { code: '601', label: '601 — General de Ley Personas Morales' },
  { code: '603', label: '603 — Personas Morales con Fines no Lucrativos' },
  { code: '605', label: '605 — Sueldos y Salarios e Ingresos Asimilados a Salarios' },
  { code: '606', label: '606 — Arrendamiento' },
  { code: '612', label: '612 — Personas Físicas con Actividades Empresariales y Profesionales' },
  { code: '621', label: '621 — Incorporación Fiscal' },
  { code: '626', label: '626 — Régimen Simplificado de Confianza (RESICO)' },
];

const SAT_CFDI_USES = [
  { code: 'G01', label: 'G01 — Adquisición de mercancías' },
  { code: 'G03', label: 'G03 — Gastos en general' },
  { code: 'CP01', label: 'CP01 — Pagos' },
  { code: 'P01', label: 'P01 — Por definir' },
];

export function ClientTaxProfileWidget({
  payments = [],
  onProfileUpdated,
}: ClientTaxProfileWidgetProps) {
  const [taxProfile, setTaxProfile] = useState<ClientTaxProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    rfc: '',
    legal_name: '',
    tax_regime: '601',
    cfdi_use: 'G03',
    postal_code: '',
    invoice_email: '',
    is_international: false,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // Invoicing Requests State
  const [requestingPaymentId, setRequestingPaymentId] = useState<number | null>(null);
  const [invoiceNotes, setInvoiceNotes] = useState('');
  const [isSubmittingInvoice, setIsSubmittingInvoice] = useState(false);
  const [invoiceActionError, setInvoiceActionError] = useState<string | null>(null);
  const [invoiceActionSuccess, setInvoiceActionSuccess] = useState<string | null>(null);
  const [requestedPaymentsMap, setRequestedPaymentsMap] = useState<Record<number, boolean>>({});

  const loadTaxProfile = useCallback(async () => {
    setIsLoading(true);
    setProfileError(null);
    try {
      const res = await getClientTaxProfile();
      setTaxProfile(res.tax_profile);
      if (res.tax_profile) {
        setFormData({
          rfc: res.tax_profile.rfc,
          legal_name: res.tax_profile.legal_name,
          tax_regime: res.tax_profile.tax_regime,
          cfdi_use: res.tax_profile.cfdi_use,
          postal_code: res.tax_profile.postal_code,
          invoice_email: res.tax_profile.invoice_email,
          is_international: res.tax_profile.rfc.length > 13,
        });
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Error al consultar el expediente fiscal del cliente.';
      setProfileError(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    async function init() {
      try {
        const res = await getClientTaxProfile();
        if (!ignore) {
          setTaxProfile(res.tax_profile);
          if (res.tax_profile) {
            setFormData({
              rfc: res.tax_profile.rfc,
              legal_name: res.tax_profile.legal_name,
              tax_regime: res.tax_profile.tax_regime,
              cfdi_use: res.tax_profile.cfdi_use,
              postal_code: res.tax_profile.postal_code,
              invoice_email: res.tax_profile.invoice_email,
              is_international: res.tax_profile.rfc.length > 13,
            });
          }
        }
      } catch (err: unknown) {
        if (!ignore) {
          const msg =
            err instanceof Error
              ? err.message
              : 'Error al consultar el expediente fiscal del cliente.';
          setProfileError(msg);
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }
    void init();
    return () => {
      ignore = true;
    };
  }, []);

  const handleOpenEdit = () => {
    setIsEditing(true);
    setFormError(null);
    setFormSuccess(null);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setFormError(null);
    setFormSuccess(null);
    /* v8 ignore next */
    if (taxProfile) {
      setFormData({
        rfc: taxProfile.rfc,
        legal_name: taxProfile.legal_name,
        tax_regime: taxProfile.tax_regime,
        cfdi_use: taxProfile.cfdi_use,
        postal_code: taxProfile.postal_code,
        invoice_email: taxProfile.invoice_email,
        is_international: taxProfile.rfc.length > 13,
      });
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    const cleanRfc = formData.rfc.trim().toUpperCase();
    const cleanLegalName = formData.legal_name.trim();
    const cleanPostalCode = formData.postal_code.trim();
    const cleanEmail = formData.invoice_email.trim();

    if (!cleanRfc || cleanRfc.length < 3) {
      setFormError('El RFC o Tax ID debe tener al menos 3 caracteres.');
      return;
    }

    if (!formData.is_international) {
      const satRegex = /^[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}$/i;
      if (!satRegex.test(cleanRfc)) {
        setFormError(
          'RFC inválido. Formato oficial SAT requerido (12 o 13 caracteres con homoclave).',
        );
        return;
      }
    }

    if (!cleanLegalName) {
      setFormError('La razón social o denominación legal es obligatoria.');
      return;
    }

    if (!cleanPostalCode || cleanPostalCode.length < 3) {
      setFormError('El código postal fiscal es obligatorio.');
      return;
    }

    if (!cleanEmail || !cleanEmail.includes('@')) {
      setFormError('Ingresa un correo electrónico de facturación válido.');
      return;
    }

    setIsSaving(true);

    try {
      const payload = {
        rfc: cleanRfc,
        legal_name: cleanLegalName,
        tax_regime: formData.tax_regime,
        cfdi_use: formData.cfdi_use,
        postal_code: cleanPostalCode,
        invoice_email: cleanEmail,
        is_international: formData.is_international,
      };

      const res = await saveClientTaxProfile(payload);
      setTaxProfile(res.tax_profile);
      setFormSuccess('Expediente fiscal guardado y validado exitosamente.');
      /* v8 ignore next */
      setTimeout(() => {
        setIsEditing(false);
        setFormSuccess(null);
      }, 1000);
      onProfileUpdated?.(res.tax_profile);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al guardar el expediente fiscal.';
      setFormError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenRequestInvoice = (paymentId: number) => {
    setRequestingPaymentId(paymentId);
    setInvoiceNotes('');
    setInvoiceActionError(null);
    setInvoiceActionSuccess(null);
  };

  const handleCloseRequestInvoice = () => {
    setRequestingPaymentId(null);
    setInvoiceNotes('');
    setInvoiceActionError(null);
    setInvoiceActionSuccess(null);
  };

  const handleSubmitRequestInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    /* v8 ignore next */
    if (!requestingPaymentId) return;

    /* v8 ignore next 4 */
    if (!taxProfile) {
      setInvoiceActionError('Debes registrar tu expediente fiscal antes de solicitar una factura.');
      return;
    }

    setIsSubmittingInvoice(true);
    setInvoiceActionError(null);
    setInvoiceActionSuccess(null);

    try {
      await requestPaymentInvoice(requestingPaymentId, {
        invoice_notes: invoiceNotes.trim() || undefined,
      });

      setRequestedPaymentsMap((prev) => ({ ...prev, [requestingPaymentId]: true }));
      setInvoiceActionSuccess('Solicitud de factura fiscal enviada con éxito.');
      /* v8 ignore next */
      setTimeout(() => {
        handleCloseRequestInvoice();
      }, 1200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al solicitar la factura fiscal.';
      setInvoiceActionError(msg);
    } finally {
      setIsSubmittingInvoice(false);
    }
  };

  const formatCurrency = (cents: number, currency: string) => {
    return `$${(cents / 100).toLocaleString()} ${currency}`;
  };

  return (
    <GlassCard className="p-6 border-cyan-500/30 bg-slate-900/60 backdrop-blur-xl space-y-6">
      {/* Cabecera del Módulo */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-bold">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-bold text-white tracking-wide">
              Expediente Fiscal & Facturación B2B
            </h3>
            <p className="text-xs text-slate-400">
              Datos fiscales validados para la emisión oficial de comprobantes y CFDI.
            </p>
          </div>
        </div>

        {!isLoading && taxProfile && !isEditing && (
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadTaxProfile()}
              className="border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 text-xs"
              title="Sincronizar expediente fiscal"
            >
              Recargar
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenEdit}
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              Actualizar Datos Fiscales
            </Button>
          </div>
        )}
      </div>

      {isLoading && (
        <div className="py-8 text-center space-y-3">
          <div className="w-8 h-8 border-2 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-400">Consultando expediente fiscal corporativo...</p>
        </div>
      )}

      {profileError && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-400">
          {profileError}
        </div>
      )}

      {/* Visualización de Perfil Fiscal Existente */}
      {!isLoading && taxProfile && !isEditing && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-slate-800/40 rounded-xl border border-white/5 space-y-1">
            <span className="text-[10px] font-bold uppercase text-slate-400">RFC / Tax ID</span>
            <p className="text-sm font-mono font-bold text-cyan-300">{taxProfile.rfc}</p>
          </div>

          <div className="p-4 bg-slate-800/40 rounded-xl border border-white/5 space-y-1">
            <span className="text-[10px] font-bold uppercase text-slate-400">Razón Social</span>
            <p className="text-sm font-bold text-white truncate">{taxProfile.legal_name}</p>
          </div>

          <div className="p-4 bg-slate-800/40 rounded-xl border border-white/5 space-y-1">
            <span className="text-[10px] font-bold uppercase text-slate-400">Código Postal</span>
            <p className="text-sm font-mono text-slate-200">{taxProfile.postal_code}</p>
          </div>

          <div className="p-4 bg-slate-800/40 rounded-xl border border-white/5 space-y-1">
            <span className="text-[10px] font-bold uppercase text-slate-400">Régimen Fiscal</span>
            <p className="text-xs text-slate-300">
              {SAT_TAX_REGIMES.find((r) => r.code === taxProfile.tax_regime)?.label ||
                taxProfile.tax_regime}
            </p>
          </div>

          <div className="p-4 bg-slate-800/40 rounded-xl border border-white/5 space-y-1">
            <span className="text-[10px] font-bold uppercase text-slate-400">Uso de CFDI</span>
            <p className="text-xs text-slate-300">
              {SAT_CFDI_USES.find((u) => u.code === taxProfile.cfdi_use)?.label ||
                taxProfile.cfdi_use}
            </p>
          </div>

          <div className="p-4 bg-slate-800/40 rounded-xl border border-white/5 space-y-1">
            <span className="text-[10px] font-bold uppercase text-slate-400">
              Correo de Facturación
            </span>
            <p className="text-xs text-cyan-400 truncate">{taxProfile.invoice_email}</p>
          </div>
        </div>
      )}

      {/* Formulario de Alta o Edición de Expediente Fiscal */}
      {!isLoading && (!taxProfile || isEditing) && (
        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div className="p-4 bg-slate-800/60 rounded-xl border border-white/5 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                {taxProfile ? 'Editar Datos de Facturación' : 'Registrar Expediente Fiscal'}
              </h4>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="intl_toggle"
                  checked={formData.is_international}
                  onChange={(e) => setFormData({ ...formData, is_international: e.target.checked })}
                  className="rounded border-slate-700 bg-slate-800 text-cyan-600 focus:ring-cyan-500 cursor-pointer"
                />
                <label
                  htmlFor="intl_toggle"
                  className="text-xs text-slate-400 cursor-pointer select-none"
                >
                  Cliente Internacional (Tax ID fuera de México)
                </label>
              </div>
            </div>

            {formError && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400">
                {formError}
              </div>
            )}

            {formSuccess && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-xs text-emerald-400">
                {formSuccess}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  {formData.is_international ? 'Tax ID / VAT Number' : 'RFC (SAT)'}{' '}
                  <span className="text-cyan-400">*</span>
                </label>
                <input
                  type="text"
                  value={formData.rfc}
                  onChange={(e) => setFormData({ ...formData, rfc: e.target.value.toUpperCase() })}
                  placeholder={formData.is_international ? 'US-EIN-1234567' : 'GARM850101XYZ'}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 font-mono text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Razón Social / Nombre Fiscal <span className="text-cyan-400">*</span>
                </label>
                <input
                  type="text"
                  value={formData.legal_name}
                  onChange={(e) => setFormData({ ...formData, legal_name: e.target.value })}
                  placeholder="Empresa o Persona Física SA de CV"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Régimen Fiscal <span className="text-cyan-400">*</span>
                </label>
                <select
                  value={formData.tax_regime}
                  onChange={(e) => setFormData({ ...formData, tax_regime: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-cyan-500"
                >
                  {SAT_TAX_REGIMES.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Uso de CFDI <span className="text-cyan-400">*</span>
                </label>
                <select
                  value={formData.cfdi_use}
                  onChange={(e) => setFormData({ ...formData, cfdi_use: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-cyan-500"
                >
                  {SAT_CFDI_USES.map((u) => (
                    <option key={u.code} value={u.code}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Código Postal Fiscal <span className="text-cyan-400">*</span>
                </label>
                <input
                  type="text"
                  value={formData.postal_code}
                  onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                  placeholder="01000"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 font-mono text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Correo para Recepción de Facturas <span className="text-cyan-400">*</span>
                </label>
                <input
                  type="email"
                  value={formData.invoice_email}
                  onChange={(e) => setFormData({ ...formData, invoice_email: e.target.value })}
                  placeholder="facturas@miempresa.com"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              {taxProfile && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCancelEdit}
                  className="border-slate-700 text-slate-300 hover:bg-slate-800"
                >
                  Cancelar
                </Button>
              )}
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={isSaving}
                className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold"
              >
                {isSaving ? 'Guardando...' : 'Guardar Expediente'}
              </Button>
            </div>
          </div>
        </form>
      )}

      {/* Sección de Solicitudes de Facturación sobre Pagos Liquidados */}
      {payments.length > 0 && (
        <div className="pt-4 border-t border-white/10 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-white">Comprobantes & Pagos Realizados</h4>
            <span className="text-xs text-slate-400">
              Pagos elegibles para emisión de factura fiscal
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {payments.map((pmt) => {
              const isPaid = pmt.status === 'PAID';
              const isRequested =
                pmt.invoice_requested ||
                requestedPaymentsMap[pmt.id] ||
                pmt.invoice_status === 'REQUESTED';
              const isIssued = pmt.invoice_status === 'ISSUED';

              return (
                <div
                  key={pmt.id}
                  className="p-3.5 rounded-xl border border-slate-700/60 bg-slate-800/40 flex flex-col justify-between gap-3"
                >
                  <div className="space-y-1 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-slate-400 text-[11px]">
                        Pago #{pmt.id} {pmt.project_name ? `· ${pmt.project_name}` : ''}
                      </span>
                      {isIssued ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                          CFDI EMITIDO
                        </span>
                      ) : isRequested ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                          SOLICITADA
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-700 text-slate-300">
                          {pmt.status}
                        </span>
                      )}
                    </div>

                    <p className="text-base font-black text-white">
                      {formatCurrency(pmt.amount_cents, pmt.currency)}
                    </p>

                    {pmt.cfdi_uuid && (
                      <p className="font-mono text-[10px] text-emerald-400 truncate">
                        Folio Fiscal: {pmt.cfdi_uuid}
                      </p>
                    )}
                  </div>

                  {isPaid && !isRequested && !isIssued && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!taxProfile}
                      onClick={() => handleOpenRequestInvoice(pmt.id)}
                      className="w-full border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10 text-xs font-bold py-1 disabled:opacity-50"
                    >
                      {taxProfile ? 'Solicitar Factura Fiscal' : 'Expediente Requerido'}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal de Solicitud de Factura para un Pago */}
      {requestingPaymentId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="relative w-full max-w-md bg-slate-900 border border-cyan-500/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-white/10 bg-slate-900/90">
              <div>
                <h3 className="text-base font-bold text-white">Solicitar Factura Fiscal</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Comprobante para Pago #{requestingPaymentId}
                </p>
              </div>
              <button
                onClick={handleCloseRequestInvoice}
                className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitRequestInvoice} className="p-6 space-y-4 text-xs">
              {invoiceActionError && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
                  {invoiceActionError}
                </div>
              )}

              {invoiceActionSuccess && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400">
                  {invoiceActionSuccess}
                </div>
              )}

              {taxProfile && (
                <div className="p-3 bg-slate-800/60 rounded-xl border border-white/5 space-y-1 text-slate-300">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">
                    Datos del Receptor
                  </p>
                  <p className="font-bold text-white">{taxProfile.legal_name}</p>
                  <p className="font-mono text-cyan-300">RFC: {taxProfile.rfc}</p>
                  <p className="text-slate-400">Envío a: {taxProfile.invoice_email}</p>
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Notas de Facturación (Opcional, máx 500 caracteres)
                </label>
                <textarea
                  rows={2}
                  maxLength={500}
                  value={invoiceNotes}
                  onChange={(e) => setInvoiceNotes(e.target.value)}
                  placeholder="e.g. Orden de compra #1234, Centro de costos 01..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="pt-2 flex justify-end gap-3 border-t border-white/10">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCloseRequestInvoice}
                  className="border-slate-700 text-slate-300 hover:bg-slate-800"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={isSubmittingInvoice}
                  className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold"
                >
                  {isSubmittingInvoice ? 'Enviando...' : 'Confirmar Solicitud'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </GlassCard>
  );
}
