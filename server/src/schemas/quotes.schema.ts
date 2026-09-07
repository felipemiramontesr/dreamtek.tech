import { z } from 'zod';

export const VERTICALS = ['WEB_DEV', 'ARCHON_FLEET', 'AI_AUTOMATION', 'CYBERSECURITY'] as const;
export const SCALES = [
  'MVP',
  'SCALE',
  'SMALL',
  'LARGE',
  'AGENT',
  'ENTERPRISE_VISION',
  'VULN_ASSESSMENT',
  'PENTEST_FULL',
] as const;

export const CURRENCIES = ['MXN', 'USD'] as const;
export const LOCALES = ['es', 'en'] as const;

export type VerticalType = (typeof VERTICALS)[number];
export type ScaleType = (typeof SCALES)[number];
export type CurrencyType = (typeof CURRENCIES)[number];
export type LocaleType = (typeof LOCALES)[number];

export interface QuoteEstimationResult {
  valid: boolean;
  currency: CurrencyType;
  locale: LocaleType;
  estimatedBudgetMin: number;
  estimatedBudgetMax: number;
  estimatedWeeksMin: number;
  estimatedWeeksMax: number;
  serviceLabel: string;
  scaleLabel: string;
}

export type QuoteScaleEntry = {
  estimatedBudgetMin: number;
  estimatedBudgetMax: number;
  estimatedWeeksMin: number;
  estimatedWeeksMax: number;
  serviceLabel: string;
  scaleLabel: string;
};

export type QuoteVerticalMatrix = Record<VerticalType, Partial<Record<ScaleType, QuoteScaleEntry>>>;

/**
 * Spanish / Mexico Market Estimation Matrix (MXN) — SSOT
 */
export const QUOTE_ESTIMATION_MATRIX: QuoteVerticalMatrix = {
  WEB_DEV: {
    MVP: {
      estimatedBudgetMin: 35000,
      estimatedBudgetMax: 60000,
      estimatedWeeksMin: 3,
      estimatedWeeksMax: 5,
      serviceLabel: 'Desarrollo Web y Plataformas SaaS',
      scaleLabel: 'MVP Ágil y Validado',
    },
    SCALE: {
      estimatedBudgetMin: 75000,
      estimatedBudgetMax: 150000,
      estimatedWeeksMin: 6,
      estimatedWeeksMax: 10,
      serviceLabel: 'Desarrollo Web y Plataformas SaaS',
      scaleLabel: 'Arquitectura Escalable y Microservicios',
    },
  },
  ARCHON_FLEET: {
    SMALL: {
      estimatedBudgetMin: 20000,
      estimatedBudgetMax: 40000,
      estimatedWeeksMin: 2,
      estimatedWeeksMax: 4,
      serviceLabel: 'Gestión de Flotas & ERP ARCHON',
      scaleLabel: '1 a 15 Unidades Vehiculares',
    },
    LARGE: {
      estimatedBudgetMin: 55000,
      estimatedBudgetMax: 120000,
      estimatedWeeksMin: 4,
      estimatedWeeksMax: 8,
      serviceLabel: 'Gestión de Flotas & ERP ARCHON',
      scaleLabel: '16 a 100+ Unidades Empresariales',
    },
  },
  AI_AUTOMATION: {
    AGENT: {
      estimatedBudgetMin: 40000,
      estimatedBudgetMax: 80000,
      estimatedWeeksMin: 3,
      estimatedWeeksMax: 6,
      serviceLabel: 'Inteligencia Artificial y Automatización',
      scaleLabel: 'Agente Conversacional y RAG Empresarial',
    },
    ENTERPRISE_VISION: {
      estimatedBudgetMin: 90000,
      estimatedBudgetMax: 180000,
      estimatedWeeksMin: 8,
      estimatedWeeksMax: 12,
      serviceLabel: 'Inteligencia Artificial y Automatización',
      scaleLabel: 'Pipeline Multimodal de Visión por Computadora',
    },
  },
  CYBERSECURITY: {
    VULN_ASSESSMENT: {
      estimatedBudgetMin: 25000,
      estimatedBudgetMax: 45000,
      estimatedWeeksMin: 1,
      estimatedWeeksMax: 2,
      serviceLabel: 'Ciberseguridad y Auditoría Forense',
      scaleLabel: 'Evaluación Defensiva y Análisis OWASP',
    },
    PENTEST_FULL: {
      estimatedBudgetMin: 60000,
      estimatedBudgetMax: 110000,
      estimatedWeeksMin: 3,
      estimatedWeeksMax: 5,
      serviceLabel: 'Ciberseguridad y Auditoría Forense',
      scaleLabel: 'Pentesting Manual Web & API con Informe Ejecutivo',
    },
  },
};

/**
 * Anglo-Saxon / International Market Estimation Matrix (USD) — SSOT (FC 042 / Alternativa A)
 */
export const QUOTE_ESTIMATION_MATRIX_EN: QuoteVerticalMatrix = {
  WEB_DEV: {
    MVP: {
      estimatedBudgetMin: 2000,
      estimatedBudgetMax: 3500,
      estimatedWeeksMin: 3,
      estimatedWeeksMax: 5,
      serviceLabel: 'Web Development & SaaS Platforms',
      scaleLabel: 'Agile & Validated MVP',
    },
    SCALE: {
      estimatedBudgetMin: 4500,
      estimatedBudgetMax: 9000,
      estimatedWeeksMin: 6,
      estimatedWeeksMax: 10,
      serviceLabel: 'Web Development & SaaS Platforms',
      scaleLabel: 'Scalable Architecture & Microservices',
    },
  },
  ARCHON_FLEET: {
    SMALL: {
      estimatedBudgetMin: 1200,
      estimatedBudgetMax: 2500,
      estimatedWeeksMin: 2,
      estimatedWeeksMax: 4,
      serviceLabel: 'Fleet Management & ARCHON ERP',
      scaleLabel: '1 to 15 Vehicle Fleet',
    },
    LARGE: {
      estimatedBudgetMin: 3500,
      estimatedBudgetMax: 7500,
      estimatedWeeksMin: 4,
      estimatedWeeksMax: 8,
      serviceLabel: 'Fleet Management & ARCHON ERP',
      scaleLabel: '16 to 100+ Enterprise Fleet',
    },
  },
  AI_AUTOMATION: {
    AGENT: {
      estimatedBudgetMin: 2500,
      estimatedBudgetMax: 5000,
      estimatedWeeksMin: 3,
      estimatedWeeksMax: 6,
      serviceLabel: 'Artificial Intelligence & Automation',
      scaleLabel: 'Conversational Agent & Enterprise RAG',
    },
    ENTERPRISE_VISION: {
      estimatedBudgetMin: 5500,
      estimatedBudgetMax: 11000,
      estimatedWeeksMin: 8,
      estimatedWeeksMax: 12,
      serviceLabel: 'Artificial Intelligence & Automation',
      scaleLabel: 'Multimodal Computer Vision Pipeline',
    },
  },
  CYBERSECURITY: {
    VULN_ASSESSMENT: {
      estimatedBudgetMin: 1500,
      estimatedBudgetMax: 3000,
      estimatedWeeksMin: 1,
      estimatedWeeksMax: 2,
      serviceLabel: 'Cybersecurity & Forensic Audit',
      scaleLabel: 'Defensive Assessment & OWASP Audit',
    },
    PENTEST_FULL: {
      estimatedBudgetMin: 3500,
      estimatedBudgetMax: 6500,
      estimatedWeeksMin: 3,
      estimatedWeeksMax: 5,
      serviceLabel: 'Cybersecurity & Forensic Audit',
      scaleLabel: 'Comprehensive Manual Web & API Pentesting',
    },
  },
};

export const QUOTE_ESTIMATION_MATRICES: Record<LocaleType, QuoteVerticalMatrix> = {
  es: QUOTE_ESTIMATION_MATRIX,
  en: QUOTE_ESTIMATION_MATRIX_EN,
};

/**
 * Server-side SSOT matrix evaluator enforcing C-042.1 server-side coercion:
 * locale === 'en' -> currency = 'USD'
 * locale === 'es' -> currency = 'MXN'
 */
export function evaluateQuoteMatrix(
  vertical: string,
  scale: string,
  localeInput?: string,
): QuoteEstimationResult | null {
  const normalizedLocale: LocaleType = localeInput === 'en' ? 'en' : 'es';
  const currency: CurrencyType = normalizedLocale === 'en' ? 'USD' : 'MXN';
  const matrix = QUOTE_ESTIMATION_MATRICES[normalizedLocale];

  const verticalEntry = matrix[vertical as VerticalType];
  if (!verticalEntry) return null;
  const scaleEntry = verticalEntry[scale as ScaleType];
  if (!scaleEntry) return null;

  return {
    valid: true,
    currency,
    locale: normalizedLocale,
    ...scaleEntry,
  };
}

export const createQuoteLeadSchema = z.object({
  vertical: z.enum(VERTICALS),
  scale: z.enum(SCALES),
  full_name: z.string().min(3, 'El nombre debe tener al menos 3 caracteres.').max(128),
  email: z.string().email('Correo electrónico corporativo inválido.').max(255),
  phone: z.string().min(8, 'Teléfono debe tener al menos 8 caracteres.').max(20),
  company_name: z.string().max(128).optional(),
  notes: z.string().max(1000).optional(),
  requirements: z.record(z.unknown()).optional(),
  locale: z.enum(LOCALES).default('es'),
  currency: z.enum(CURRENCIES).optional(),
});

export type CreateQuoteLeadInput = z.infer<typeof createQuoteLeadSchema>;
