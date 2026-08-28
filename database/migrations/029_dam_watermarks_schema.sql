-- DDL 029: DAM Smart Watermarking & Copyright Protection Schema (FC 030)
CREATE TABLE IF NOT EXISTS dam_asset_watermarks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  asset_id INT NOT NULL,
  version_id INT NOT NULL,
  watermark_type ENUM('TEXT', 'IMAGE') NOT NULL,
  watermark_text VARCHAR(255) NULL,
  watermark_asset_id INT NULL,
  position ENUM('CENTER', 'TOP_LEFT', 'TOP_RIGHT', 'BOTTOM_LEFT', 'BOTTOM_RIGHT', 'TILED_PATTERN') NOT NULL DEFAULT 'BOTTOM_RIGHT',
  opacity DECIMAL(3,2) NOT NULL DEFAULT 0.50,
  rotation INT NOT NULL DEFAULT 0,
  output_derivative_path VARCHAR(1024) NOT NULL,
  watermark_metadata JSON NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_asset_ver_wm_type_pos (tenant_id, asset_id, version_id, watermark_type, position),
  INDEX idx_dam_asset_watermarks_tenant (tenant_id, asset_id),
  CONSTRAINT fk_dam_asset_watermarks_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
