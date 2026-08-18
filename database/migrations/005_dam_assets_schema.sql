-- Migration: 005_dam_assets_schema.sql
-- Description: DDL schema for Digital Asset Management (DAM) v1 multi-tenant entities
-- Associated FC: 003_FC_DAM_Asset_Ingestion_Hostinger_NVMe

CREATE TABLE IF NOT EXISTS workspaces (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_workspaces_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS collections (
  id INT AUTO_INCREMENT PRIMARY KEY,
  workspace_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_collections_workspace (workspace_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS assets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  workspace_id INT NOT NULL,
  collection_id INT DEFAULT NULL,
  title VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  status ENUM('ACTIVE', 'DELETED') DEFAULT 'ACTIVE',
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_assets_tenant (tenant_id),
  INDEX idx_assets_deleted (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS asset_versions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  asset_id INT NOT NULL,
  version_number INT NOT NULL DEFAULT 1,
  byte_size BIGINT NOT NULL,
  sha256_hash VARCHAR(64) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_versions_asset (asset_id),
  UNIQUE KEY uk_asset_version (asset_id, version_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS asset_derivatives (
  id INT AUTO_INCREMENT PRIMARY KEY,
  version_id INT NOT NULL,
  derivative_type VARCHAR(50) NOT NULL,
  width INT DEFAULT NULL,
  height INT DEFAULT NULL,
  byte_size BIGINT NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_derivatives_version (version_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
