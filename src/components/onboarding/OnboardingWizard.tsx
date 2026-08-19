'use client';

import React, { useState, useEffect } from 'react';
import {
  submitLead,
  checkDomainAvailability,
  createCheckoutSession,
  verifyCheckoutSuccess,
} from '@/lib/onboarding/client';

interface OnboardingWizardProps {
  isAnnual: boolean;
  onClose: () => void;
}

interface TemplateOption {
  id: string;
  name: string;
  category: string;
  description: string;
}

const TEMPLATES: TemplateOption[] = [
  {
    id: 'corporate',
    name: 'Corporativo Elite',
    category: 'B2B & Empresa',
    description:
      'Diseño institucional sobrio optimizado para captar cuentas corporativas y clientes de alto valor.',
  },
  {
    id: 'services',
    name: 'Servicios & Consultoría',
    category: 'Agencias & Firmas',
    description:
      'Estructura orientada a conversión directa con llamadas a la acción estratégicas y agenda.',
  },
  {
    id: 'ecommerce',
    name: 'Catálogo & E-commerce',
    category: 'Ventas & Showcase',
    description:
      'Layout visual enfocado en exhibición de productos, fichas técnicas y pasarela de checkout.',
  },
];

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({ isAnnual, onClose }) => {
  const [step, setStep] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('session_id') && urlParams.get('step') === '5') {
        return 5;
      }
    }
    return 1;
  });
  const [loading, setLoading] = useState<boolean>(() =>
    typeof window !== 'undefined'
      ? Boolean(new URLSearchParams(window.location.search).get('session_id'))
      : false,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form State
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('corporate');
  const [domainInput, setDomainInput] = useState('');
  const [domainStatus, setDomainStatus] = useState<{
    available?: boolean;
    message?: string;
  } | null>(null);
  const [siteNotes, setSiteNotes] = useState('');

  // Handle URL Session Verification if returning from Stripe
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const urlSessionId = urlParams.get('session_id');

      if (urlSessionId) {
        verifyCheckoutSuccess(urlSessionId)
          .then(() => {
            setLoading(false);
          })
          .catch((err: unknown) => {
            setLoading(false);
            const msg =
              err instanceof Error ? err.message : 'Error al validar el pago de la orden.';
            setErrorMessage(msg);
          });
      }
    }
  }, []);

  // Step 1 Submission
  const handleStep1Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (!email || !fullName || !phone) {
      setErrorMessage('Por favor completa todos los campos requeridos (*).');
      return;
    }

    setLoading(true);
    try {
      await submitLead({
        email,
        full_name: fullName,
        phone,
        company,
        step_reached: 2,
      });
      setLoading(false);
      setStep(2);
    } catch (err: unknown) {
      setLoading(false);
      const msg = err instanceof Error ? err.message : 'Error al registrar el contacto';
      setErrorMessage(msg);
    }
  };

  // Step 3 Domain Check
  const handleCheckDomain = async () => {
    setErrorMessage(null);
    setDomainStatus(null);
    if (!domainInput.trim()) {
      setErrorMessage('Ingresa un nombre de dominio para verificar.');
      return;
    }

    setLoading(true);
    try {
      const res = await checkDomainAvailability(domainInput.trim());
      setLoading(false);
      setDomainStatus({ available: res.available, message: res.message });
    } catch (err: unknown) {
      setLoading(false);
      const msg = err instanceof Error ? err.message : 'Error al consultar disponibilidad';
      setErrorMessage(msg);
    }
  };

  // Step 4 Checkout Submission
  const handleProceedToCheckout = async () => {
    setErrorMessage(null);
    setLoading(true);
    try {
      const res = await createCheckoutSession({
        email,
        billing_cycle: isAnnual ? 'annual' : 'monthly',
        template_id: selectedTemplate,
        domain_name: domainInput,
      });

      if (res.checkout_url) {
        window.location.href = res.checkout_url;
      } else {
        setStep(5);
        setLoading(false);
      }
    } catch (err: unknown) {
      setLoading(false);
      const msg = err instanceof Error ? err.message : 'Error al iniciar la sesión de pago';
      setErrorMessage(msg);
    }
  };

  const priceBase = isAnnual ? 2599 : 2899;
  const billingLabel = isAnnual ? 'Facturación Anual (-10% Desc.)' : 'Facturación Mensual';

  return (
    <div className="w-full text-slate-100 font-sans flex flex-col justify-between flex-1 overflow-hidden">
      {/* Step Progress Header Soberano */}
      <div className="mb-4 border-b border-white/10 pb-3 shrink-0">
        <div className="flex items-center justify-between">
          {[1, 2, 3, 4, 5].map((s) => (
            <div key={s} className="flex items-center space-x-2">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all duration-300 ${
                  step === s
                    ? 'bg-[#FF2D00] text-white shadow-[0_0_15px_rgba(255,45,0,0.6)]'
                    : step > s
                      ? 'bg-white/10 text-emerald-400 border border-emerald-500/40'
                      : 'bg-white/5 text-white/40 border border-white/10'
                }`}
              >
                {step > s ? '✓' : s}
              </div>
              <span
                className={`hidden sm:inline text-xs font-medium ${
                  step === s ? 'text-[#FF2D00] font-bold' : 'text-white/40'
                }`}
              >
                {s === 1 && 'Contacto'}
                {s === 2 && 'Plantilla'}
                {s === 3 && 'Dominio'}
                {s === 4 && 'Checkout'}
                {s === 5 && 'Detalles'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Global Error Banner */}
      {errorMessage && (
        <div className="mb-3 rounded-xl bg-[#FF2D00]/10 border border-[#FF2D00]/40 p-3 text-xs text-rose-300 shrink-0">
          ⚠️ {errorMessage}
        </div>
      )}

      {/* STEP 1: Contact Details */}
      {step === 1 && (
        <form
          onSubmit={handleStep1Submit}
          className="space-y-4 flex-1 flex flex-col justify-between overflow-hidden"
        >
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h3 className="text-lg md:text-xl font-bold text-white tracking-tight">
                Paso 1: Información de Contacto
              </h3>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  const event = new CustomEvent('open-auth-modal', { detail: 'login' });
                  window.dispatchEvent(event);
                }}
                className="text-xs text-sky-400 hover:text-sky-300 font-semibold transition-colors self-start sm:self-center cursor-pointer"
              >
                ¿Ya eres cliente de Dreamtek? Inicia sesión aquí
              </button>
            </div>
            <p className="text-xs md:text-sm text-white/70 font-light">
              Ingresa tus datos de representante para registrar tu cuenta y personalizar la
              propuesta de tu sitio web.
            </p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-2">
              <div>
                <label className="block text-xs font-semibold text-white/80 mb-1">
                  Nombre Completo *
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ej. Roberto Gómez"
                  className="w-full rounded-xl bg-white/5 border border-white/15 p-3 text-xs md:text-sm text-white focus:border-[#FF2D00] focus:outline-none focus:ring-1 focus:ring-[#FF2D00]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-white/80 mb-1">
                  Correo Electrónico *
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="roberto@empresa.com"
                  className="w-full rounded-xl bg-white/5 border border-white/15 p-3 text-xs md:text-sm text-white focus:border-[#FF2D00] focus:outline-none focus:ring-1 focus:ring-[#FF2D00]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-white/80 mb-1">
                  WhatsApp / Teléfono *
                </label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+52 55 1234 5678"
                  className="w-full rounded-xl bg-white/5 border border-white/15 p-3 text-xs md:text-sm text-white focus:border-[#FF2D00] focus:outline-none focus:ring-1 focus:ring-[#FF2D00]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-white/80 mb-1">
                  Nombre de la Empresa
                </label>
                <input
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Ej. Innovación Digital S.A."
                  className="w-full rounded-xl bg-white/5 border border-white/15 p-3 text-xs md:text-sm text-white focus:border-[#FF2D00] focus:outline-none focus:ring-1 focus:ring-[#FF2D00]"
                />
              </div>
            </div>
          </div>

          <div className="pt-4 flex justify-end shrink-0">
            <button
              type="submit"
              disabled={loading}
              className="w-full sm:w-auto inline-flex items-center justify-center font-bold font-sans rounded-xl bg-[#FF2D00] text-white hover:bg-[#FF2D00]/90 shadow-[0_0_20px_rgba(255,45,0,0.35)] hover:shadow-[0_0_30px_rgba(255,45,0,0.55)] px-8 py-3 text-xs md:text-sm uppercase tracking-wider transition-all duration-300 hover:scale-105 disabled:opacity-50"
            >
              {loading ? 'Guardando...' : 'Continuar a Plantillas →'}
            </button>
          </div>
        </form>
      )}

      {/* STEP 2: Template Selection */}
      {step === 2 && (
        <div className="space-y-4 flex-1 flex flex-col justify-between overflow-hidden">
          <div className="space-y-3">
            <h3 className="text-lg md:text-xl font-bold text-white tracking-tight">
              Paso 2: Selección de Estructura Visual
            </h3>
            <p className="text-xs md:text-sm text-white/70 font-light">
              Elige la plantilla base optimizada según el giro estratégico de tu proyecto.
            </p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 pt-2">
              {TEMPLATES.map((tmpl) => (
                <div
                  key={tmpl.id}
                  onClick={() => setSelectedTemplate(tmpl.id)}
                  className={`cursor-pointer rounded-xl border p-4 transition-all duration-300 flex flex-col justify-between ${
                    selectedTemplate === tmpl.id
                      ? 'border-[#FF2D00] bg-[#FF2D00]/10 shadow-[0_0_25px_rgba(255,45,0,0.3)]'
                      : 'border-white/10 bg-white/5 hover:border-white/20'
                  }`}
                >
                  <div>
                    <div className="mb-2 text-[10px] sm:text-xs font-bold uppercase tracking-wider text-[#FF2D00]">
                      {tmpl.category}
                    </div>
                    <h4 className="text-sm sm:text-base font-bold text-white mb-1.5">
                      {tmpl.name}
                    </h4>
                    <p className="text-xs text-white/70 font-light leading-relaxed">
                      {tmpl.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-4 flex justify-between shrink-0">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="rounded-xl border border-white/30 bg-transparent text-white hover:bg-white/10 hover:border-white/50 backdrop-blur-md px-5 py-2.5 text-xs md:text-sm font-semibold tracking-wide transition-all"
            >
              ← Regresar
            </button>
            <button
              type="button"
              onClick={() => setStep(3)}
              className="inline-flex items-center justify-center font-bold font-sans rounded-xl bg-[#FF2D00] text-white hover:bg-[#FF2D00]/90 shadow-[0_0_20px_rgba(255,45,0,0.35)] hover:shadow-[0_0_30px_rgba(255,45,0,0.55)] px-8 py-3 text-xs md:text-sm uppercase tracking-wider transition-all duration-300 hover:scale-105"
            >
              Continuar a Dominio →
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Domain Soft-Check */}
      {step === 3 && (
        <div className="space-y-4 flex-1 flex flex-col justify-between overflow-hidden">
          <div className="space-y-3">
            <h3 className="text-lg md:text-xl font-bold text-white tracking-tight">
              Paso 3: Verificación de Dominio (.com / .mx)
            </h3>
            <p className="text-xs md:text-sm text-white/70 font-light">
              Realiza una consulta rápida de disponibilidad para tu dirección web de marca.
            </p>

            <div className="flex space-x-2 pt-2">
              <input
                type="text"
                value={domainInput}
                onChange={(e) => setDomainInput(e.target.value)}
                placeholder="ej. miempresa.com"
                className="flex-1 rounded-xl bg-white/5 border border-white/15 p-3 text-xs md:text-sm text-white focus:border-[#FF2D00] focus:outline-none focus:ring-1 focus:ring-[#FF2D00]"
              />
              <button
                type="button"
                onClick={handleCheckDomain}
                disabled={loading}
                className="inline-flex items-center justify-center font-bold font-sans rounded-xl bg-[#FF2D00] text-white hover:bg-[#FF2D00]/90 px-6 py-3 text-xs md:text-sm uppercase tracking-wider transition-all disabled:opacity-50"
              >
                {loading ? 'Consultando...' : 'Verificar'}
              </button>
            </div>

            {domainStatus && (
              <div
                className={`rounded-xl p-3 text-xs md:text-sm border ${
                  domainStatus.available
                    ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                    : 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                }`}
              >
                {domainStatus.available ? '✓ ' : '⚠️ '}
                {domainStatus.message}
              </div>
            )}
          </div>

          <div className="pt-4 flex justify-between shrink-0">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="rounded-xl border border-white/30 bg-transparent text-white hover:bg-white/10 hover:border-white/50 backdrop-blur-md px-5 py-2.5 text-xs md:text-sm font-semibold tracking-wide transition-all"
            >
              ← Regresar
            </button>
            <button
              type="button"
              onClick={() => setStep(4)}
              className="inline-flex items-center justify-center font-bold font-sans rounded-xl bg-[#FF2D00] text-white hover:bg-[#FF2D00]/90 shadow-[0_0_20px_rgba(255,45,0,0.35)] hover:shadow-[0_0_30px_rgba(255,45,0,0.55)] px-8 py-3 text-xs md:text-sm uppercase tracking-wider transition-all duration-300 hover:scale-105"
            >
              Continuar a Resumen →
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: Summary & Checkout */}
      {step === 4 && (
        <div className="space-y-4 flex-1 flex flex-col justify-between overflow-hidden">
          <div className="space-y-3">
            <h3 className="text-lg md:text-xl font-bold text-white tracking-tight">
              Paso 4: Resumen de Orden & Pago Seguro
            </h3>
            <p className="text-xs md:text-sm text-white/70 font-light">
              Revisa los detalles de tu suscripción antes de acceder a la pasarela de pago
              protegida.
            </p>

            <div className="rounded-xl border border-white/15 bg-white/5 p-4 space-y-3">
              <div className="flex justify-between text-xs md:text-sm border-b border-white/10 pb-2">
                <span className="text-white/60">Plan Seleccionado:</span>
                <span className="font-bold text-white">Escolta WEB</span>
              </div>
              <div className="flex justify-between text-xs md:text-sm border-b border-white/10 pb-2">
                <span className="text-white/60">Modalidad de Cobro:</span>
                <span className="font-bold text-[#FF2D00]">{billingLabel}</span>
              </div>
              <div className="flex justify-between text-xs md:text-sm border-b border-white/10 pb-2">
                <span className="text-white/60">Plantilla Elegida:</span>
                <span className="font-medium text-white">{selectedTemplate.toUpperCase()}</span>
              </div>
              <div className="flex justify-between text-xs md:text-sm border-b border-white/10 pb-2">
                <span className="text-white/60">Dominio Solicitado:</span>
                <span className="font-medium text-white">
                  {domainInput || 'Pendiente de definir'}
                </span>
              </div>
              <div className="flex justify-between text-sm md:text-base font-bold pt-1">
                <span className="text-white">Monto Base (+ IVA):</span>
                <span className="text-[#FF2D00]">${priceBase.toLocaleString('es-MX')} MXN</span>
              </div>
            </div>
          </div>

          <div className="pt-4 flex justify-between shrink-0">
            <button
              type="button"
              onClick={() => setStep(3)}
              className="rounded-xl border border-white/30 bg-transparent text-white hover:bg-white/10 hover:border-white/50 backdrop-blur-md px-5 py-2.5 text-xs md:text-sm font-semibold tracking-wide transition-all"
            >
              ← Regresar
            </button>
            <button
              type="button"
              onClick={handleProceedToCheckout}
              disabled={loading}
              className="inline-flex items-center justify-center font-bold font-sans rounded-xl bg-[#FF2D00] text-white hover:bg-[#FF2D00]/90 shadow-[0_0_20px_rgba(255,45,0,0.35)] hover:shadow-[0_0_30px_rgba(255,45,0,0.55)] px-8 py-3 text-xs md:text-sm uppercase tracking-wider transition-all duration-300 hover:scale-105 disabled:opacity-50"
            >
              {loading ? 'Generando Sesión Stripe...' : '🔒 Proceder al Pago Seguro →'}
            </button>
          </div>
        </div>
      )}

      {/* STEP 5: Initial Site Assets & Info */}
      {step === 5 && (
        <div className="space-y-4 flex-1 flex flex-col justify-between overflow-hidden">
          <div className="space-y-3">
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-center">
              <div className="text-2xl mb-1">🎉</div>
              <h3 className="text-base md:text-lg font-bold text-emerald-300">
                ¡Pago Confirmado & Orden Activa!
              </h3>
              <p className="text-xs md:text-sm text-white/80 mt-1 font-light">
                Tu suscripción Escolta WEB ha sido registrada exitosamente. Completa los detalles
                iniciales de tu sitio.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-white/80 mb-1">
                Instrucciones / Colores de Marca / Notas Adicionales
              </label>
              <textarea
                rows={4}
                value={siteNotes}
                onChange={(e) => setSiteNotes(e.target.value)}
                placeholder="Escribe detalles como eslogan de marca, paleta de colores o secciones requeridas..."
                className="w-full rounded-xl bg-white/5 border border-white/15 p-3 text-xs md:text-sm text-white focus:border-[#FF2D00] focus:outline-none focus:ring-1 focus:ring-[#FF2D00]"
              />
            </div>
          </div>

          <div className="pt-4 flex justify-end shrink-0">
            <button
              type="button"
              onClick={() =>
                alert(
                  '¡Información de sitio enviada! El equipo de Dreamtek iniciará tu despliegue.',
                )
              }
              className="inline-flex items-center justify-center font-bold font-sans rounded-xl bg-[#FF2D00] text-white hover:bg-[#FF2D00]/90 shadow-[0_0_20px_rgba(255,45,0,0.35)] hover:shadow-[0_0_30px_rgba(255,45,0,0.55)] px-8 py-3 text-xs md:text-sm uppercase tracking-wider transition-all duration-300 hover:scale-105"
            >
              Finalizar Registro →
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
