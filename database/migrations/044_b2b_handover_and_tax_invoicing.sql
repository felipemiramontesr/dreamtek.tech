-- DDL 044: B2B Project Handover Vault & Tax Invoicing (FC 046)
-- Idempotente con CREATE TABLE IF NOT EXISTS y FKs embebidas (C-046.6)

-- 1. Tabla client_project_handovers (Fase 1: Bóveda de entregables y constancia de finiquito)
CREATE TABLE IF NOT EXISTS client_project_handovers (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT UNSIGNED NOT NULL UNIQUE,
  repository_url VARCHAR(500) NULL,
  deployment_url VARCHAR(500) NULL,
  documentation_url VARCHAR(500) NULL,
  access_credentials_encrypted TEXT NULL,
  handover_notes TEXT NULL,
  certificate_sha256 VARCHAR(64) NOT NULL,
  downloaded_at DATETIME NULL,
  download_count INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_handovers_project FOREIGN KEY (project_id) REFERENCES client_projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Tabla client_tax_profiles (Fase 2: Perfil y expediente fiscal del cliente B2B)
CREATE TABLE IF NOT EXISTS client_tax_profiles (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL UNIQUE,
  tenant_id BIGINT UNSIGNED NOT NULL,
  rfc VARCHAR(32) NOT NULL,
  legal_name VARCHAR(255) NOT NULL,
  tax_regime VARCHAR(10) NOT NULL,
  cfdi_use VARCHAR(10) NOT NULL,
  postal_code VARCHAR(16) NOT NULL,
  invoice_email VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_tax_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_tax_profiles_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Tabla tax_invoice_requests (Fase 2: Solicitudes de facturación vinculadas a pagos)
CREATE TABLE IF NOT EXISTS tax_invoice_requests (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  payment_id INT NOT NULL UNIQUE,
  project_id BIGINT UNSIGNED NULL,
  tax_profile_id BIGINT UNSIGNED NOT NULL,
  status ENUM('REQUESTED', 'ISSUED', 'REJECTED') NOT NULL DEFAULT 'REQUESTED',
  cfdi_uuid VARCHAR(64) NULL,
  invoice_notes TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_invoice_requests_payment FOREIGN KEY (payment_id) REFERENCES lead_payments(id) ON DELETE CASCADE,
  CONSTRAINT fk_invoice_requests_project FOREIGN KEY (project_id) REFERENCES client_projects(id) ON DELETE SET NULL,
  CONSTRAINT fk_invoice_requests_profile FOREIGN KEY (tax_profile_id) REFERENCES client_tax_profiles(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
