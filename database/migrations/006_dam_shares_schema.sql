-- Migration: 006_dam_shares_schema.sql
-- Description: DDL schema for DAM v1 Asset Sharing & Guest Links
-- Associated FC: 004_FC_DAM_Asset_Sharing_Guest_Links

CREATE TABLE IF NOT EXISTS asset_shares (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  asset_id INT NOT NULL,
  share_token_hash VARCHAR(64) NOT NULL,
  permission ENUM('VIEW', 'DOWNLOAD') NOT NULL DEFAULT 'VIEW',
  max_uses INT DEFAULT NULL,
  current_uses INT NOT NULL DEFAULT 0,
  expires_at DATETIME NOT NULL,
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  revoked_at DATETIME DEFAULT NULL,
  INDEX idx_shares_token_hash (share_token_hash),
  INDEX idx_shares_asset (asset_id),
  INDEX idx_shares_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS share_access_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  share_id INT NOT NULL,
  ip_address VARCHAR(45) NOT NULL,
  user_agent VARCHAR(255) DEFAULT NULL,
  accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_access_share (share_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
