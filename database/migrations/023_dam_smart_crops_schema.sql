-- DDL 023: DAM AI Smart Crop & Focal Point Auto-Detection Schema
-- Feature Contract: 024_FC_DAM_AI_Smart_Crop_Focal_Point
-- Description: Multi-tenant smart crop derivatives and automatic focal point coordinates for DAM assets

CREATE TABLE IF NOT EXISTS dam_asset_smart_crops (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  asset_id INT NOT NULL,
  version_id INT NOT NULL,
  aspect_ratio ENUM('1:1', '16:9', '9:16', '4:5', '4:3', '3:2', '2:3') NOT NULL DEFAULT '1:1',
  focal_x DECIMAL(4,3) NOT NULL DEFAULT 0.500,
  focal_y DECIMAL(4,3) NOT NULL DEFAULT 0.500,
  crop_width INT NOT NULL,
  crop_height INT NOT NULL,
  output_derivative_path VARCHAR(512) NULL,
  crop_metadata JSON NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_smart_crops_asset_ver_ratio (tenant_id, asset_id, version_id, aspect_ratio),
  INDEX idx_smart_crops_tenant_asset (tenant_id, asset_id),
  INDEX idx_smart_crops_version (version_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
