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
