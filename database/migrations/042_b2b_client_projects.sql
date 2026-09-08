-- DDL 042: B2B Client Projects & Milestone Onboarding (FC 044 / C-044)
-- Database: MariaDB / MySQL
-- Idempotent: safe for re-execution

CREATE TABLE IF NOT EXISTS client_projects (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  lead_id BIGINT UNSIGNED NULL,
  project_name VARCHAR(255) NOT NULL,
  vertical VARCHAR(64) NOT NULL DEFAULT 'custom_dev',
  status ENUM('ONBOARDING_BRIEF', 'ARCHITECTURE_DESIGN', 'IN_DEVELOPMENT', 'STAGING_REVIEW', 'COMPLETED_DELIVERED', 'ON_HOLD') NOT NULL DEFAULT 'ONBOARDING_BRIEF',
  currency ENUM('MXN', 'USD') NOT NULL DEFAULT 'USD',
  budget_cents INT UNSIGNED NOT NULL DEFAULT 0,
  paid_amount_cents INT UNSIGNED NOT NULL DEFAULT 0,
  pending_balance_cents INT UNSIGNED NOT NULL DEFAULT 0,
  estimated_weeks INT UNSIGNED NOT NULL DEFAULT 4,
  briefing_data JSON DEFAULT NULL,
  staging_url VARCHAR(512) DEFAULT NULL,
  repository_url VARCHAR(512) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_projects_tenant (tenant_id),
  INDEX idx_projects_user (user_id),
  UNIQUE KEY uq_project_lead (lead_id),
  CONSTRAINT fk_client_projects_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_client_projects_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_client_projects_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS client_project_milestones (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT UNSIGNED NOT NULL,
  milestone_index INT UNSIGNED NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT DEFAULT NULL,
  target_week INT UNSIGNED NOT NULL,
  status ENUM('PENDING', 'IN_PROGRESS', 'REVIEW', 'COMPLETED') NOT NULL DEFAULT 'PENDING',
  completed_at DATETIME DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_milestones_project (project_id),
  UNIQUE KEY uq_project_milestone_idx (project_id, milestone_index),
  CONSTRAINT fk_milestones_project FOREIGN KEY (project_id) REFERENCES client_projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
