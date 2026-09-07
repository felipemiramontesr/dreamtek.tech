'use client';

import React, { useState } from 'react';
import { GlassCard } from '../ui/GlassCard';
import { Button } from '../ui/Button';
import {
  submitQuoteDiagnostic,
  FunnelVertical,
  FunnelScale,
  QuoteData,
} from '../../lib/quotes/client';

export interface VerticalOption {
  id: FunnelVertical;
  title: string;
  subtitle: string;
  badge: string;
  icon: React.ReactNode;
  scales: {
    id: FunnelScale;
    title: string;
    description: string;
    budgetMin: number;
    budgetMax: number;
    weeksMin: number;
    weeksMax: number;
  }[];
}

export const VERTICAL_OPTIONS_ES: VerticalOption[] = [
  {
    id: 'WEB_DEV',
    title: 'Desarrollo Web & SaaS',
    subtitle: 'Plataformas web corporativas, web apps reactivas y microservicios en la nube.',
    badge: 'Escalabilidad Cloud',
    icon: (
      <svg
        className="w-6 h-6"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
        />
      </svg>
    ),
    scales: [
      {
        id: 'MVP',
        title: 'MVP Ágil y Validado',
        description:
          'Ideal para validar ideas rápido con arquitectura sólida Next.js y base de datos relacional.',
        budgetMin: 35000,
        budgetMax: 60000,
        weeksMin: 3,
        weeksMax: 5,
      },
      {
        id: 'SCALE',
        title: 'Arquitectura Escalable & Microservicios',
        description:
          'Plataforma empresarial de alta concurrencia, multi-tenancy y microservicios desacoplados.',
        budgetMin: 75000,
        budgetMax: 150000,
        weeksMin: 6,
        weeksMax: 10,
      },
    ],
  },
  {
    id: 'ARCHON_FLEET',
    title: 'Gestión de Flotas & ERP ARCHON',
    subtitle:
      'Rastreo satelital telemático, control de combustible, rutas y choferes en tiempo real.',
    badge: 'Logística & IoT',
    icon: (
      <svg
        className="w-6 h-6"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
        />
      </svg>
    ),
    scales: [
      {
        id: 'SMALL',
        title: '1 a 15 Unidades Vehiculares',
        description:
          'Despliegue ágil con telemática satelital base, geocercas y alertas de seguridad.',
        budgetMin: 20000,
        budgetMax: 40000,
        weeksMin: 2,
        weeksMax: 4,
      },
      {
        id: 'LARGE',
        title: '16 a 100+ Unidades Corporativas',
        description:
          'Telemetría avanzada CAN bus, sensores de combustible, auditoría operativa y app para operadores.',
        budgetMin: 55000,
        budgetMax: 120000,
        weeksMin: 4,
        weeksMax: 8,
      },
    ],
  },
  {
    id: 'AI_AUTOMATION',
    title: 'Inteligencia Artificial & Agentes',
    subtitle: 'Modelos RAG, agentes conversacionales especializados y visión por computadora.',
    badge: 'IA Aplicada',
    icon: (
      <svg
        className="w-6 h-6"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M13 10V3L4 14h7v7l9-11h-7z"
        />
      </svg>
    ),
    scales: [
      {
        id: 'AGENT',
        title: 'Agente Conversacional & RAG',
        description: 'Asistente corporativo conectado a bases de conocimiento y CRM empresarial.',
        budgetMin: 40000,
        budgetMax: 80000,
        weeksMin: 3,
        weeksMax: 6,
      },
      {
        id: 'ENTERPRISE_VISION',
        title: 'Pipeline de Visión por Computadora',
        description:
          'Procesamiento masivo de video/audio, reconocimiento biométrico y metadatos visuales.',
        budgetMin: 90000,
        budgetMax: 180000,
        weeksMin: 8,
        weeksMax: 12,
      },
    ],
  },
  {
    id: 'CYBERSECURITY',
    title: 'Ciberseguridad & Auditoría Forense',
    subtitle:
      'Pentesting manual web/API, hardening de servidores y análisis forense post-incidente.',
    badge: 'Seguridad Ofensiva/Defensiva',
    icon: (
      <svg
        className="w-6 h-6"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
        />
      </svg>
    ),
    scales: [
      {
        id: 'VULN_ASSESSMENT',
        title: 'Evaluación de Vulnerabilidades & OWASP',
        description: 'Análisis estático/dinámico de seguridad y reporte de postura defensiva.',
        budgetMin: 25000,
        budgetMax: 45000,
        weeksMin: 1,
        weeksMax: 2,
      },
      {
        id: 'PENTEST_FULL',
        title: 'Pentesting Manual Web & API Integral',
        description:
          'Simulación de adversario real, pruebas de intrusión no destructivas e informe ejecutivo con PoC.',
        budgetMin: 60000,
        budgetMax: 110000,
        weeksMin: 3,
        weeksMax: 5,
      },
    ],
  },
];

export const VERTICAL_OPTIONS_EN: VerticalOption[] = [
  {
    id: 'WEB_DEV',
    title: 'Web Development & SaaS Platforms',
    subtitle: 'Corporate web platforms, reactive web applications, and cloud microservices.',
    badge: 'Cloud Scalability',
    icon: (
      <svg
        className="w-6 h-6"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
        />
      </svg>
    ),
    scales: [
      {
        id: 'MVP',
        title: 'Agile & Validated MVP',
        description:
          'Ideal for fast idea validation with robust Next.js architecture and relational database.',
        budgetMin: 2000,
        budgetMax: 3500,
        weeksMin: 3,
        weeksMax: 5,
      },
      {
        id: 'SCALE',
        title: 'Scalable Architecture & Microservices',
        description:
          'High-concurrency enterprise platform, multi-tenancy, and decoupled microservices.',
        budgetMin: 4500,
        budgetMax: 9000,
        weeksMin: 6,
        weeksMax: 10,
      },
    ],
  },
  {
    id: 'ARCHON_FLEET',
    title: 'Fleet Management & ARCHON ERP',
    subtitle:
      'Satellite telematics tracking, fuel management, routes, and real-time driver monitoring.',
    badge: 'Logistics & IoT',
    icon: (
      <svg
        className="w-6 h-6"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
        />
      </svg>
    ),
    scales: [
      {
        id: 'SMALL',
        title: '1 to 15 Vehicle Units',
        description:
          'Agile deployment with core satellite telematics, geofencing, and automated security alerts.',
        budgetMin: 1200,
        budgetMax: 2500,
        weeksMin: 2,
        weeksMax: 4,
      },
      {
        id: 'LARGE',
        title: '16 to 100+ Enterprise Units',
        description:
          'Advanced CAN bus telematics, fuel sensors, operational audit, and dedicated driver mobile app.',
        budgetMin: 3500,
        budgetMax: 7500,
        weeksMin: 4,
        weeksMax: 8,
      },
    ],
  },
  {
    id: 'AI_AUTOMATION',
    title: 'Artificial Intelligence & Agents',
    subtitle: 'Enterprise RAG models, specialized conversational agents, and computer vision.',
    badge: 'Applied AI',
    icon: (
      <svg
        className="w-6 h-6"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M13 10V3L4 14h7v7l9-11h-7z"
        />
      </svg>
    ),
    scales: [
      {
        id: 'AGENT',
        title: 'Conversational Agent & Enterprise RAG',
        description: 'Corporate assistant connected to private knowledge bases and CRM.',
        budgetMin: 2500,
        budgetMax: 5000,
        weeksMin: 3,
        weeksMax: 6,
      },
      {
        id: 'ENTERPRISE_VISION',
        title: 'Computer Vision Pipeline',
        description:
          'Massive video/audio processing, biometric verification, and automated visual metadata.',
        budgetMin: 5500,
        budgetMax: 11000,
        weeksMin: 8,
        weeksMax: 12,
      },
    ],
  },
  {
    id: 'CYBERSECURITY',
    title: 'Cybersecurity & Forensic Audit',
    subtitle:
      'Manual web/API penetration testing, server hardening, and post-incident digital forensics.',
    badge: 'Offensive/Defensive Security',
    icon: (
      <svg
        className="w-6 h-6"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
        />
      </svg>
    ),
    scales: [
      {
        id: 'VULN_ASSESSMENT',
        title: 'Vulnerability Assessment & OWASP Audit',
        description: 'Static/dynamic security analysis and comprehensive defensive posture report.',
        budgetMin: 1500,
        budgetMax: 3000,
        weeksMin: 1,
        weeksMax: 2,
      },
      {
        id: 'PENTEST_FULL',
        title: 'Comprehensive Manual Web & API Pentesting',
        description:
          'Real-world adversary simulation, non-destructive intrusion testing, and executive report with PoC.',
        budgetMin: 3500,
        budgetMax: 6500,
        weeksMin: 3,
        weeksMax: 5,
      },
    ],
  },
];

// Maintain backwards compatibility export
export const VERTICAL_OPTIONS = VERTICAL_OPTIONS_ES;

export const VERTICAL_MAP: Record<FunnelVertical, VerticalOption> = VERTICAL_OPTIONS_ES.reduce(
  (acc, opt) => {
    acc[opt.id] = opt;
    return acc;
  },
  {} as Record<FunnelVertical, VerticalOption>,
);

export const VERTICAL_MAP_EN: Record<FunnelVertical, VerticalOption> = VERTICAL_OPTIONS_EN.reduce(
  (acc, opt) => {
    acc[opt.id] = opt;
    return acc;
  },
  {} as Record<FunnelVertical, VerticalOption>,
);

export interface QuoteFunnelWizardProps {
  locale?: 'es' | 'en';
}

export function QuoteFunnelWizard({ locale: propLocale }: QuoteFunnelWizardProps = {}) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [selectedVertical, setSelectedVertical] = useState<FunnelVertical>('WEB_DEV');
  const [selectedScale, setSelectedScale] = useState<FunnelScale>('MVP');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submittedData, setSubmittedData] = useState<QuoteData | null>(null);

  const isEn =
    propLocale === 'en' ||
    (typeof window !== 'undefined' && window.location.pathname.startsWith('/en'));
  const activeLocale: 'es' | 'en' = isEn ? 'en' : 'es';
  const currency = isEn ? 'USD' : 'MXN';

  const activeOptions = isEn ? VERTICAL_OPTIONS_EN : VERTICAL_OPTIONS_ES;
  const activeMap = isEn ? VERTICAL_MAP_EN : VERTICAL_MAP;

  const currentVerticalObj = activeMap[selectedVertical];
  const currentScaleObj = currentVerticalObj.scales.find((s) => s.id === selectedScale)!;

  const handleVerticalSelect = (v: FunnelVertical) => {
    setSelectedVertical(v);
    setSelectedScale(activeMap[v].scales[0].id);
  };

  const handleNextStep = () => {
    setErrorMsg(null);
    setStep((prev) => (prev + 1) as 1 | 2 | 3 | 4);
  };

  const handlePrevStep = () => {
    setErrorMsg(null);
    setStep((prev) => (prev - 1) as 1 | 2 | 3 | 4);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!fullName.trim() || !email.trim() || !phone.trim()) {
      setErrorMsg(
        isEn
          ? 'Please complete the required fields (Name, Corporate Email, and Phone).'
          : 'Por favor completa los campos obligatorios (Nombre, Email y Teléfono).',
      );
      return;
    }

    setLoading(true);
    try {
      const response = await submitQuoteDiagnostic({
        vertical: selectedVertical,
        scale: selectedScale,
        full_name: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        company_name: company.trim() || undefined,
        notes: notes.trim() || undefined,
        locale: activeLocale,
        currency,
      });

      setSubmittedData(response.data);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : isEn
            ? 'Unexpected error while submitting quote diagnostic.'
            : 'Error inesperado al enviar cotización.';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setSelectedVertical('WEB_DEV');
    setSelectedScale('MVP');
    setFullName('');
    setEmail('');
    setPhone('');
    setCompany('');
    setNotes('');
    setSubmittedData(null);
    setErrorMsg(null);
  };

  if (submittedData) {
    return (
      <GlassCard className="p-8 max-w-2xl mx-auto border-emerald-500/30 bg-slate-900/60 backdrop-blur-xl">
        <div className="text-center space-y-4">
          <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center justify-center mx-auto text-emerald-400">
            <svg
              className="w-7 h-7"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h3 className="text-2xl font-bold text-white tracking-tight">
            {isEn ? 'Diagnostic Registered Successfully!' : '¡Diagnóstico Registrado con Éxito!'}
          </h3>
          <p className="text-sm text-slate-300">
            {isEn ? (
              <>
                We have received your requirements for{' '}
                <strong>{submittedData.service_label}</strong>. A Dreamtek solutions architect will
                review the details and contact you in less than 24 business hours.
              </>
            ) : (
              <>
                Hemos recibido tus requerimientos para{' '}
                <strong>{submittedData.service_label}</strong>. Un arquitecto de soluciones de
                Dreamtek revisará los detalles y te contactará en menos de 24 horas hábiles.
              </>
            )}
          </p>

          <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/50 text-left space-y-2 mt-4 text-xs font-mono text-slate-300">
            <div className="flex justify-between py-1 border-b border-slate-800">
              <span className="text-slate-400 font-sans">{isEn ? 'Service:' : 'Servicio:'}</span>
              <span className="text-white font-sans font-medium">
                {submittedData.service_label}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-800">
              <span className="text-slate-400 font-sans">{isEn ? 'Scope:' : 'Alcance:'}</span>
              <span className="text-cyan-400 font-sans font-medium">
                {submittedData.scale_label}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-800">
              <span className="text-slate-400 font-sans">
                {isEn ? 'Estimated Range:' : 'Rango Estimado:'}
              </span>
              <span className="text-emerald-400 font-bold">
                ${submittedData.estimated_budget_min.toLocaleString()} – $
                {submittedData.estimated_budget_max.toLocaleString()} {submittedData.currency}
              </span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-400 font-sans">
                {isEn ? 'Delivery Timeframe:' : 'Plazo de Entrega:'}
              </span>
              <span className="text-purple-400 font-bold">
                {submittedData.estimated_weeks_min} {isEn ? 'to' : 'a'}{' '}
                {submittedData.estimated_weeks_max} {isEn ? 'weeks' : 'semanas'}
              </span>
            </div>
          </div>

          <p className="text-[11px] text-slate-500 italic mt-2">* {submittedData.disclaimer}</p>

          <div className="pt-4">
            <Button variant="outline" onClick={handleReset} className="w-full sm:w-auto">
              {isEn ? 'Perform another estimation' : 'Realizar otra cotización'}
            </Button>
          </div>
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="p-6 sm:p-8 max-w-3xl mx-auto border-cyan-500/20 bg-slate-900/40 backdrop-blur-xl">
      {/* Header & Steps */}
      <div className="mb-8">
        <div className="flex items-center justify-between gap-4 mb-3">
          <div>
            <span className="text-[11px] uppercase tracking-widest text-cyan-400 font-semibold">
              {isEn
                ? 'Interactive Quote & Technical Diagnostic'
                : 'Cotizador Interactivo & Diagnóstico'}
            </span>
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              {isEn ? 'Calculate your project scope' : 'Calcula el alcance de tu proyecto'}
            </h2>
          </div>
          <span className="text-xs font-mono text-slate-400 bg-slate-800/60 px-2.5 py-1 rounded-full border border-slate-700">
            {isEn ? `Step ${step} of 4` : `Paso ${step} de 4`}
          </span>
        </div>

        {/* Progress Bar */}
        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-cyan-500 via-purple-500 to-emerald-500 transition-all duration-300"
            style={{ width: `${(step / 4) * 100}%` }}
          />
        </div>
      </div>

      {errorMsg && (
        <div className="mb-6 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
          <svg
            className="w-4 h-4 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Step 1: Vertical Selection */}
      {step === 1 && (
        <div className="space-y-4">
          <p className="text-xs text-slate-400">
            {isEn
              ? 'Select the technology vertical that best describes your core need:'
              : 'Selecciona la vertical tecnológica que mejor describe el núcleo de tu necesidad:'}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {activeOptions.map((v) => {
              const isSelected = selectedVertical === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => handleVerticalSelect(v.id)}
                  className={`p-4 rounded-xl text-left border transition-all flex flex-col justify-between ${
                    isSelected
                      ? 'border-cyan-500 bg-cyan-500/10 shadow-[0_0_20px_rgba(6,182,212,0.15)] ring-1 ring-cyan-500/40'
                      : 'border-slate-800 bg-slate-800/20 hover:border-slate-700 hover:bg-slate-800/40'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div
                        className={`p-2 rounded-lg ${isSelected ? 'bg-cyan-500/20 text-cyan-300' : 'bg-slate-800 text-slate-400'}`}
                      >
                        {v.icon}
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800/80 text-slate-300 border border-slate-700/50">
                        {v.badge}
                      </span>
                    </div>
                    <div className="font-semibold text-white text-sm">{v.title}</div>
                    <p className="text-xs text-slate-400 leading-relaxed">{v.subtitle}</p>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="pt-4 flex justify-end">
            <Button variant="primary" onClick={handleNextStep}>
              {isEn ? 'Continue to Step 2 →' : 'Continuar al Paso 2 →'}
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Scale Selection */}
      {step === 2 && (
        <div className="space-y-4">
          <div>
            <span className="text-xs text-cyan-400 font-mono">
              {isEn ? 'Vertical:' : 'Vertical:'} {currentVerticalObj.title}
            </span>
            <p className="text-xs text-slate-400 mt-1">
              {isEn
                ? 'Select the estimated scope or scale for the implementation:'
                : 'Selecciona el alcance o escala estimada para la implementación:'}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {currentVerticalObj.scales.map((s) => {
              const isSelected = selectedScale === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedScale(s.id)}
                  className={`p-5 rounded-xl text-left border transition-all flex flex-col justify-between ${
                    isSelected
                      ? 'border-purple-500 bg-purple-500/10 shadow-[0_0_20px_rgba(168,85,247,0.15)] ring-1 ring-purple-500/40'
                      : 'border-slate-800 bg-slate-800/20 hover:border-slate-700 hover:bg-slate-800/40'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="font-bold text-white text-sm">{s.title}</div>
                    <p className="text-xs text-slate-400 leading-relaxed">{s.description}</p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-[11px] font-mono">
                    <span className="text-slate-400">
                      {isEn ? 'Guiding range:' : 'Rango orientativo:'}
                    </span>
                    <span className="text-purple-300 font-semibold">
                      ${s.budgetMin.toLocaleString()} – ${s.budgetMax.toLocaleString()} {currency}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="pt-4 flex items-center justify-between">
            <Button variant="outline" onClick={handlePrevStep}>
              {isEn ? '← Back' : '← Volver'}
            </Button>
            <Button variant="primary" onClick={handleNextStep}>
              {isEn ? 'View Parametric Estimation →' : 'Ver Estimación Paramétrica →'}
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Parametric Estimation Review */}
      {step === 3 && (
        <div className="space-y-6">
          <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800/40 to-cyan-950/20 border border-cyan-500/30 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-700/60">
              <div>
                <span className="text-[10px] uppercase font-mono tracking-wider text-cyan-400">
                  {isEn ? 'Parametric Projection' : 'Proyección Paramétrica'}
                </span>
                <h3 className="text-base font-bold text-white">{currentVerticalObj.title}</h3>
                <span className="text-xs text-slate-400">{currentScaleObj.title}</span>
              </div>
              <div className="text-right">
                <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {isEn ? 'Technical Transparency' : 'Transparencia Técnica'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                <span className="text-xs text-slate-400 block mb-1">
                  {isEn
                    ? `Base Investment Range (${currency})`
                    : `Rango de Inversión Base (${currency})`}
                </span>
                <div className="text-xl sm:text-2xl font-black text-emerald-400 tracking-tight">
                  ${currentScaleObj.budgetMin.toLocaleString()} – $
                  {currentScaleObj.budgetMax.toLocaleString()}
                </div>
                <span className="text-[10px] text-slate-500">
                  {isEn ? 'Estimated before taxes' : 'Estimación antes de impuestos'}
                </span>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                <span className="text-xs text-slate-400 block mb-1">
                  {isEn ? 'Estimated Delivery Time' : 'Tiempo de Entrega Estimado'}
                </span>
                <div className="text-xl sm:text-2xl font-black text-purple-400 tracking-tight">
                  {currentScaleObj.weeksMin} {isEn ? 'to' : 'a'} {currentScaleObj.weeksMax}{' '}
                  {isEn ? 'Weeks' : 'Semanas'}
                </div>
                <span className="text-[10px] text-slate-500">
                  {isEn ? 'Continuous bi-weekly sprints' : 'Sprints quincenales continuos'}
                </span>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-cyan-950/30 border border-cyan-500/20 text-[11px] text-cyan-200/80 leading-relaxed">
              <strong>{isEn ? 'Technical Honesty Notice:' : 'Aviso de Honestidad Técnica:'}</strong>{' '}
              {isEn
                ? 'This range represents a parametric estimation based on typical technical complexity. List prices designed for international market; not a live financial exchange rate.'
                : 'Este rango constituye una estimación paramétrica basada en complejidad técnica típica. Precios de lista independientes por mercado; no constituye un tipo de cambio financiero en tiempo real.'}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={handlePrevStep}>
              {isEn ? '← Change Scope' : '← Cambiar Alcance'}
            </Button>
            <Button variant="primary" onClick={handleNextStep}>
              {isEn ? 'Request Formal Proposal →' : 'Solicitar Propuesta Formal →'}
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: Contact & Agendado */}
      {step === 4 && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-xs text-slate-400">
            {isEn
              ? 'Enter your contact details so a Dreamtek software architect can prepare the technical blueprint and contact you:'
              : 'Ingresa tus datos de contacto para que un arquitecto de software de Dreamtek prepare el anteproyecto técnico y te contacte:'}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="funnel-name"
                className="block text-xs text-slate-300 mb-1 font-medium"
              >
                {isEn ? 'Full Name *' : 'Nombre Completo *'}
              </label>
              <input
                id="funnel-name"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={isEn ? 'e.g. John Doe' : 'Ej. Ing. Carlos Medina'}
                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-800/40 border border-slate-700 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
              />
            </div>

            <div>
              <label
                htmlFor="funnel-email"
                className="block text-xs text-slate-300 mb-1 font-medium"
              >
                {isEn ? 'Corporate Email *' : 'Correo Corporativo *'}
              </label>
              <input
                id="funnel-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={isEn ? 'john@company.com' : 'carlos@empresa.com'}
                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-800/40 border border-slate-700 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
              />
            </div>

            <div>
              <label
                htmlFor="funnel-phone"
                className="block text-xs text-slate-300 mb-1 font-medium"
              >
                {isEn ? 'Phone / WhatsApp *' : 'Teléfono / WhatsApp *'}
              </label>
              <input
                id="funnel-phone"
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={isEn ? '+1 (555) 234-5678' : '+52 55 1234 5678'}
                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-800/40 border border-slate-700 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
              />
            </div>

            <div>
              <label
                htmlFor="funnel-company"
                className="block text-xs text-slate-300 mb-1 font-medium"
              >
                {isEn ? 'Company / Organization' : 'Empresa / Organización'}
              </label>
              <input
                id="funnel-company"
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder={isEn ? 'Your company name' : 'Nombre de tu empresa'}
                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-800/40 border border-slate-700 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
              />
            </div>
          </div>

          <div>
            <label htmlFor="funnel-notes" className="block text-xs text-slate-300 mb-1 font-medium">
              {isEn
                ? 'Additional Details or Core Challenge (Optional)'
                : 'Detalles Adicionales o Reto Principal (Opcional)'}
            </label>
            <textarea
              id="funnel-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={
                isEn
                  ? 'Briefly tell us about your current stack, target timeline, or specific integration requirements...'
                  : 'Cuéntanos brevemente sobre tus integraciones actuales, plazos deseados o requerimientos específicos...'
              }
              className="w-full px-3.5 py-2.5 rounded-lg bg-slate-800/40 border border-slate-700 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors resize-none"
            />
          </div>

          <div className="pt-2 flex items-center justify-between">
            <Button variant="outline" type="button" onClick={handlePrevStep} disabled={loading}>
              {isEn ? '← Back' : '← Volver'}
            </Button>
            <Button variant="primary" type="submit" disabled={loading}>
              {loading
                ? isEn
                  ? 'Sending Diagnostic...'
                  : 'Enviando Diagnóstico...'
                : isEn
                  ? 'Submit & Request Contact ↗'
                  : 'Registrar y Solicitar Contacto ↗'}
            </Button>
          </div>
        </form>
      )}
    </GlassCard>
  );
}
