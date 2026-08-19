/**
 * Database Entity TypeScript Type Definitions
 * FC: protocols/fc/001a_FC_DB_Schema_and_Host_Model.md (EN_FIRME)
 * Pure type definitions for client-side and API contract safety.
 */

export const DB_SCHEMA_VERSION = '1.0.0';

export type UserRole = 'CLIENT' | 'ADMIN';
export type BillingCycle = 'monthly' | 'annual';
export type SubscriptionStatus = 'active' | 'past_due' | 'cancelled';
export type SiteStatus = 'in_development' | 'live' | 'suspended';
export type OrderStatus = 'pending' | 'paid' | 'failed';
export type TicketStatus = 'open' | 'in_progress' | 'resolved';

export interface UserEntity {
  id: number;
  email: string;
  password_hash?: string; // Excluded from public responses
  full_name: string;
  phone?: string | null;
  role: UserRole;
  created_at: string;
}

export interface SubscriptionEntity {
  id: number;
  user_id: number;
  plan_id: string;
  billing_cycle: BillingCycle;
  amount: number;
  status: SubscriptionStatus;
  renews_at: string;
}

export interface SiteEntity {
  id: number;
  subscription_id: number;
  domain_name: string;
  ssl_active: boolean;
  template_id: string;
  status: SiteStatus;
}

export interface OrderEntity {
  id: number;
  user_id: number;
  subscription_id?: number | null;
  amount: number;
  status: OrderStatus;
  payment_gateway_id?: string | null;
  created_at: string;
}

export interface SupportTicketEntity {
  id: number;
  user_id: number;
  site_id: number;
  title: string;
  description: string;
  hours_spent: number;
  status: TicketStatus;
}
