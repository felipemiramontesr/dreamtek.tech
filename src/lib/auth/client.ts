/**
 * Client Authentication TypeScript Wrapper
 * Consumes Node.js Express API endpoints with credentials: 'include' for HTTP-Only cookie support.
 */

import type { UserEntity } from '@/lib/db/types';

export interface RegisterPayload {
  email: string;
  password: string;
  full_name: string;
  phone?: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface AuthResponse {
  message?: string;
  error?: string;
  user?: Omit<UserEntity, 'password_hash'>;
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://apiv1.dreamtek.tech/api/v1';

/**
 * Register a new Client user
 */
export async function registerUser(payload: RegisterPayload): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Error al registrar el usuario.');
  }

  return data;
}

/**
 * Log in a user and set HTTP-Only session cookie
 */
export async function loginUser(payload: LoginPayload): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Credenciales inválidas o error de inicio de sesión.');
  }

  return data;
}

/**
 * Log out current user and invalidate session cookie
 */
export async function logoutUser(): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE}/auth/logout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Error al cerrar la sesión.');
  }

  return data;
}

/**
 * Get current authenticated user profile
 */
export async function getCurrentUser(): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE}/auth/me`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'No autenticado o sesión expirada.');
  }

  return data;
}

export interface ClientDashboardData {
  status: string;
  profile: {
    id: number;
    username?: string | null;
    full_name: string;
    email: string;
    role: string;
    created_at: string;
  };
  services: Array<{
    id: string;
    name: string;
    status: string;
    billing_cycle: string;
    amount: number;
    renews_at: string;
  }>;
  sites: Array<{
    id: number;
    domain: string;
    status: string;
    ssl?: boolean | number | string;
    ssl_status?: string;
  }>;
}

/**
 * Fetch client dashboard information
 */
export async function fetchClientDashboard(): Promise<ClientDashboardData> {
  const response = await fetch(`${API_BASE}/client/dashboard`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || data.error || 'Error al obtener datos del panel.');
  }
  return data;
}

/**
 * Request signed HMAC bridge URL for ARCHON Fleet ERP
 */
export async function fetchArchonBridgeUrl(): Promise<{ url: string; expires_in: number }> {
  const response = await fetch(`${API_BASE}/client/sso/archon`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || data.error || 'Error al generar enlace seguro a ARCHON.');
  }
  return data;
}

/**
 * Fetch admin leads list with optional filters
 */
export async function fetchAdminLeads(filters?: {
  status?: string;
  vertical?: string;
  search?: string;
}): Promise<unknown> {
  const params = new URLSearchParams();
  if (filters?.status) params.append('status', filters.status);
  if (filters?.vertical) params.append('vertical', filters.vertical);
  if (filters?.search) params.append('search', filters.search);

  const queryStr = params.toString() ? `?${params.toString()}` : '';
  const response = await fetch(`${API_BASE}/admin/leads${queryStr}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || data.error || 'Error al obtener prospectos administrativos.');
  }
  return data;
}

/**
 * Fetch lead details and activity timeline
 */
export async function fetchAdminLeadDetails(leadId: number | string): Promise<unknown> {
  const response = await fetch(`${API_BASE}/admin/leads/${leadId}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || data.error || 'Error al obtener expediente del prospecto.');
  }
  return data;
}

/**
 * Update lead commercial status
 */
export async function updateAdminLeadStatus(
  leadId: number | string,
  status: string,
  note?: string,
): Promise<unknown> {
  const response = await fetch(`${API_BASE}/admin/leads/${leadId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ status, note }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || data.error || 'Error al actualizar estado del prospecto.');
  }
  return data;
}

/**
 * Add manual activity (note, call, meeting) to lead
 */
export async function addAdminLeadActivity(
  leadId: number | string,
  activity: { activity_type: string; title: string; details?: string },
): Promise<unknown> {
  const response = await fetch(`${API_BASE}/admin/leads/${leadId}/activities`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(activity),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || data.error || 'Error al registrar actividad.');
  }
  return data;
}

/**
 * Send manual follow-up email template
 */
export async function sendAdminLeadEmail(
  leadId: number | string,
  emailData: { template_id: string; subject?: string; custom_message?: string },
): Promise<unknown> {
  const response = await fetch(`${API_BASE}/admin/leads/${leadId}/send-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(emailData),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || data.error || 'Error al enviar correo de seguimiento.');
  }
  return data;
}

/**
 * Fetch admin audit logs
 */
export async function fetchAdminAuditLogs(page = 1, limit = 10): Promise<unknown> {
  const response = await fetch(`${API_BASE}/admin/audit-logs?page=${page}&limit=${limit}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || data.error || 'Error al obtener logs de auditoría.');
  }
  return data;
}
