/**
 * Client Onboarding & Stripe Checkout TypeScript Wrapper
 * Consumes API endpoints (Node.js API or relative fallback) with credentials: 'include'
 */

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://apiv1.dreamtek.tech/api/v1';

export interface LeadPayload {
  email: string;
  full_name: string;
  phone: string;
  company?: string;
  step_reached?: number;
}

export interface DomainCheckResponse {
  domain: string;
  available: boolean;
  message: string;
  error?: string;
}

export interface CheckoutSessionPayload {
  email: string;
  billing_cycle: 'monthly' | 'annual';
  template_id?: string;
  domain_name?: string;
}

export interface CheckoutSessionResponse {
  message?: string;
  checkout_url?: string;
  error?: string;
  order?: {
    order_id: number;
    checkout_session_id: string;
    billing_cycle: string;
    subtotal: number;
    tax: number;
    total_amount: number;
    currency: string;
    status: string;
  };
}

export interface VerifySuccessResponse {
  message?: string;
  error?: string;
  user?: {
    id: number;
    email: string;
    full_name: string;
    role: string;
  };
}

/**
 * Submit / Upsert Lead details (Step 1)
 */
export async function submitLead(payload: LeadPayload): Promise<{ message?: string; error?: string }> {
  const url = API_BASE.startsWith('http') ? `${API_BASE}/onboarding/lead` : '/api/onboarding/lead.php';
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || data.message || 'Error al guardar la información de contacto.');
  }

  return data;
}

/**
 * Soft-check domain availability (Step 3)
 */
export async function checkDomainAvailability(domain: string): Promise<DomainCheckResponse> {
  const url = API_BASE.startsWith('http')
    ? `${API_BASE}/onboarding/domain`
    : `/api/onboarding/domain.php?domain=${encodeURIComponent(domain)}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ domain }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || data.message || 'Formato de dominio inválido o no disponible.');
  }

  return data;
}

/**
 * Generate Stripe Checkout Session (Step 4)
 */
export async function createCheckoutSession(payload: CheckoutSessionPayload): Promise<CheckoutSessionResponse> {
  const url = API_BASE.startsWith('http') ? `${API_BASE}/checkout/session` : '/api/checkout/session.php';
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || data.message || 'Error al generar la sesión de pago.');
  }

  return data;
}

/**
 * Verify checkout completion upon Stripe redirect (Step 5)
 */
export async function verifyCheckoutSuccess(sessionId: string): Promise<VerifySuccessResponse> {
  const url = API_BASE.startsWith('http')
    ? `${API_BASE}/checkout/verify?session_id=${encodeURIComponent(sessionId)}`
    : `/api/checkout/verify_success.php?session_id=${encodeURIComponent(sessionId)}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || data.message || 'Error al verificar la orden de compra.');
  }

  return data;
}
