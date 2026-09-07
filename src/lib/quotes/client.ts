const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

export type FunnelVertical = 'WEB_DEV' | 'ARCHON_FLEET' | 'AI_AUTOMATION' | 'CYBERSECURITY';
export type FunnelScale =
  | 'MVP'
  | 'SCALE'
  | 'SMALL'
  | 'LARGE'
  | 'AGENT'
  | 'ENTERPRISE_VISION'
  | 'VULN_ASSESSMENT'
  | 'PENTEST_FULL';

export interface QuoteSubmissionInput {
  vertical: FunnelVertical;
  scale: FunnelScale;
  full_name: string;
  email: string;
  phone: string;
  company_name?: string;
  notes?: string;
  requirements?: Record<string, unknown>;
  locale?: 'es' | 'en';
  currency?: 'MXN' | 'USD';
}

export interface QuoteData {
  vertical: string;
  scale: string;
  service_label: string;
  scale_label: string;
  estimated_budget_min: number;
  estimated_budget_max: number;
  estimated_weeks_min: number;
  estimated_weeks_max: number;
  currency: string;
  locale?: string;
  disclaimer: string;
}

export interface QuoteSubmissionResponse {
  status: string;
  message: string;
  data: QuoteData;
}

export async function submitQuoteDiagnostic(
  input: QuoteSubmissionInput,
): Promise<QuoteSubmissionResponse> {
  const response = await fetch(`${API_BASE}/quotes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || data.error || 'Error al enviar cotización.');
  }
  return data;
}
