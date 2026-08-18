-- Migration: 007_dam_tags_metadata_schema.sql
-- Description: DDL schema for DAM v1 Asset Search, Tags & Metadata Filtering
-- Associated FC: 005_FC_DAM_Asset_Search_Tags_Metadata

CREATE TABLE IF NOT EXISTS tags (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  name VARCHAR(64) NOT NULL,
  color VARCHAR(7) DEFAULT '#00bfff',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_tenant_tag_name (tenant_id, name),
  INDEX idx_tags_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS asset_tags (
  asset_id INT NOT NULL,
  tag_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (asset_id, tag_id),
  INDEX idx_asset_tags_tag (tag_id),
  INDEX idx_asset_tags_asset (asset_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS asset_metadata (
  id INT AUTO_INCREMENT PRIMARY KEY,
  asset_id INT NOT NULL,
  meta_key VARCHAR(64) NOT NULL,
  meta_value VARCHAR(2000) NOT NULL,
  data_type ENUM('STRING', 'NUMBER', 'BOOLEAN', 'JSON') NOT NULL DEFAULT 'STRING',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_asset_meta_key (asset_id, meta_key),
  INDEX idx_asset_meta_asset (asset_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
