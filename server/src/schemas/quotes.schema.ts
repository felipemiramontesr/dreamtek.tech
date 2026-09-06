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

export type VerticalType = (typeof VERTICALS)[number];
export type ScaleType = (typeof SCALES)[number];

export interface QuoteEstimationResult {
  valid: boolean;
  estimatedBudgetMin: number;
  estimatedBudgetMax: number;
  estimatedWeeksMin: number;
  estimatedWeeksMax: number;
  serviceLabel: string;
  scaleLabel: string;
}

export const QUOTE_ESTIMATION_MATRIX: Record<
  VerticalType,
  Partial<
    Record<
      ScaleType,
      {
        estimatedBudgetMin: number;
        estimatedBudgetMax: number;
        estimatedWeeksMin: number;
        estimatedWeeksMax: number;
        serviceLabel: string;
        scaleLabel: string;
      }
    >
  >
> = {
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

export function evaluateQuoteMatrix(vertical: string, scale: string): QuoteEstimationResult | null {
  const verticalEntry = QUOTE_ESTIMATION_MATRIX[vertical as VerticalType];
  if (!verticalEntry) return null;
  const scaleEntry = verticalEntry[scale as ScaleType];
  if (!scaleEntry) return null;
  return {
    valid: true,
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
});

export type CreateQuoteLeadInput = z.infer<typeof createQuoteLeadSchema>;
