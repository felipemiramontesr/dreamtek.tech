-- DDL 030: DAM Smart Semantic Auto-Cropping & Banner Adaptation Schema (FC 031)
CREATE TABLE IF NOT EXISTS dam_asset_banner_adaptations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  asset_id INT NOT NULL,
  version_id INT NOT NULL,
  preset ENUM('16:9_LANDSCAPE', '1:1_SQUARE', '9:16_STORY', '4:5_PORTRAIT', '21:9_ULTRAWIDE', '4:3_STANDARD', 'CUSTOM') NOT NULL,
  strategy ENUM('ENTROPY', 'ATTENTION', 'CENTER', 'NORTH', 'SOUTH', 'EAST', 'WEST', 'MANUAL_COORDINATES') NOT NULL DEFAULT 'ENTROPY',
  target_width INT NOT NULL,
  target_height INT NOT NULL,
  crop_coordinates JSON NOT NULL,
  output_derivative_path VARCHAR(1024) NOT NULL,
  adaptation_metadata JSON NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_asset_ver_preset_strat (tenant_id, asset_id, version_id, preset, strategy),
  INDEX idx_dam_asset_banners_tenant (tenant_id, asset_id),
  CONSTRAINT fk_dam_asset_banners_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
