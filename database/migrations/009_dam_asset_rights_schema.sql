-- Migration: 009_dam_asset_rights_schema.sql
-- Description: DDL schema for DAM Rights, Licenses & Embargo Engine (FC 010)
-- Associated FC: 010_FC_DAM_Rights_Licenses_Embargo_Engine

CREATE TABLE IF NOT EXISTS asset_rights (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  asset_id INT NOT NULL UNIQUE,
  copyright_notice VARCHAR(255) NULL,
  license_type ENUM('PROPRIETARY', 'CC_BY', 'CC_BY_SA', 'CC_BY_NC', 'PUBLIC_DOMAIN', 'CUSTOM') NOT NULL DEFAULT 'PROPRIETARY',
  terms_of_use TEXT NULL,
  expires_at DATETIME NULL,
  embargo_until DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
  INDEX idx_asset_rights_tenant (tenant_id),
  INDEX idx_asset_rights_embargo (embargo_until),
  INDEX idx_asset_rights_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
