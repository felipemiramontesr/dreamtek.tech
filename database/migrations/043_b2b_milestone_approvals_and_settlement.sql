-- DDL 043: B2B Project Milestone Approvals (Sign-Off) & Final Settlement (FC 045)
-- Blindado con IF NOT EXISTS e integridad referencial

-- 1. Ampliación de ENUM de estado en client_projects para incluir SETTLEMENT_PENDING
ALTER TABLE client_projects
  MODIFY COLUMN status ENUM(
    'ONBOARDING_BRIEF',
    'ARCHITECTURE_DESIGN',
    'IN_DEVELOPMENT',
    'STAGING_REVIEW',
    'SETTLEMENT_PENDING',
    'COMPLETED_DELIVERED',
    'ON_HOLD'
  ) NOT NULL DEFAULT 'ONBOARDING_BRIEF';

-- 2. Columnas de auditoría inmutable de visto bueno / sign-off en client_project_milestones
ALTER TABLE client_project_milestones
  ADD COLUMN IF NOT EXISTS client_approved_at DATETIME DEFAULT NULL AFTER completed_at,
  ADD COLUMN IF NOT EXISTS client_approved_by BIGINT UNSIGNED DEFAULT NULL AFTER client_approved_at,
  ADD COLUMN IF NOT EXISTS client_feedback TEXT DEFAULT NULL AFTER client_approved_by,
  ADD COLUMN IF NOT EXISTS client_ip VARCHAR(64) DEFAULT NULL AFTER client_feedback;

-- 3. Ampliación de lead_payments para soportar finiquitos vinculados a project_id
ALTER TABLE lead_payments
  ADD COLUMN IF NOT EXISTS project_id BIGINT UNSIGNED NULL AFTER lead_id,
  MODIFY COLUMN payment_type ENUM('DEPOSIT_50', 'FULL_PAYMENT', 'CUSTOM', 'SETTLEMENT') NOT NULL DEFAULT 'DEPOSIT_50';
