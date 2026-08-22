-- DDL 013: DAM Cloud Cold-Storage Archival & Storage Tiering Schema
-- Architecture: Dreamtek Sovereign Engine V.0.1.54
-- Classification: P3 (Cold-Storage Archival, S3 Glacier Sync & Lifecycle Management)

-- 1. Extend assets table with storage_tier and archived_at
ALTER TABLE assets 
  ADD COLUMN storage_tier ENUM('HOT', 'ARCHIVED') NOT NULL DEFAULT 'HOT' AFTER status,
  ADD COLUMN archived_at TIMESTAMP NULL DEFAULT NULL AFTER storage_tier;

-- 2. Create asset_archival_records table for cold storage and asynchronous restoration tracking
CREATE TABLE IF NOT EXISTS asset_archival_records (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NOT NULL,
  asset_id BIGINT UNSIGNED NOT NULL,
  version_id BIGINT UNSIGNED NULL,
  storage_tier ENUM('HOT', 'ARCHIVED') NOT NULL DEFAULT 'ARCHIVED',
  archive_provider VARCHAR(50) NOT NULL DEFAULT 'AWS_GLACIER',
  archive_key VARCHAR(500) NOT NULL,
  byte_size BIGINT UNSIGNED NOT NULL,
  sha256_hash CHAR(64) NOT NULL,
  restoration_status ENUM('NONE', 'REQUESTED', 'IN_PROGRESS', 'RESTORED', 'EXPIRED') NOT NULL DEFAULT 'NONE',
  restoration_tier ENUM('EXPEDITED', 'STANDARD', 'BULK') NULL DEFAULT NULL,
  restoration_requested_at TIMESTAMP NULL DEFAULT NULL,
  restoration_completed_at TIMESTAMP NULL DEFAULT NULL,
  restoration_expires_at TIMESTAMP NULL DEFAULT NULL,
  performed_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_archival_tenant_asset (tenant_id, asset_id),
  INDEX idx_archival_status (tenant_id, restoration_status),
  INDEX idx_archival_expires (restoration_expires_at),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
